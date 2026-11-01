const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cardExport = require('../card-export.js');

test('card-export.js defines all 14 specified field mappings with exact descriptions', () => {
    const fields = cardExport.s4tExportCardFields;
    assert.equal(fields.length, 14, 'Must have exactly 14 field definitions');

    const expected = {
        list: 'Trello List name (e.g. "Screening", "In Progress").',
        title: 'Clean card title (without point badges).',
        title_raw: 'Full card title (including any points or tags).',
        points: 'Story points (estimated/assigned).',
        completed_points: 'Completed points (from [ ] or { }).',
        remaining_points: 'Remaining points.',
        members: 'Developer / member names (or usernames).',
        labels: 'Label names (comma-separated).',
        due: 'Due date formatted (e.g. "2026-09-15").',
        status: 'Completion status ("Done" if in done list or dueComplete, otherwise "In Progress").',
        desc: 'Card description.',
        url: 'Direct link to Trello card (https://trello.com/c/...).',
        checklists: 'Checklist completion summary (e.g. "3/5").',
        blank: 'Empty cell (for manual spreadsheet notes/remarks).'
    };

    for (const [key, desc] of Object.entries(expected)) {
        const found = fields.find(f => f.key === key);
        assert.ok(found, `Field "${key}" must be defined`);
        assert.equal(found.desc, desc, `Field "${key}" must match exact description`);
    }
});

test('s4tExtractFieldValue extracts each field accurately from card data', () => {
    const lists = [{ id: 'list_1', name: 'Screening' }, { id: 'list_done', name: 'Done Tasks' }];
    const members = [{ id: 'mem_1', fullName: 'Arman Khan', username: 'arman' }, { id: 'mem_2', fullName: 'Sarah Chen', username: 'sarah' }];
    const labels = [{ id: 'lbl_1', name: 'Critical' }, { id: 'lbl_2', name: 'ClientSide' }];

    const lookup = {
        listsById: new Map(lists.map(l => [l.id, l])),
        membersById: new Map(members.map(m => [m.id, m])),
        labelsById: new Map(labels.map(lb => [lb.id, lb]))
    };

    const card = {
        id: 'c123',
        name: '(5) [2] AI Phone Agent #ClientSide',
        idList: 'list_1',
        idMembers: ['mem_1', 'mem_2'],
        labels: [{ id: 'lbl_1', name: 'Critical' }],
        due: '2026-11-15T12:00:00.000Z',
        dueComplete: false,
        desc: 'Detailed phone agent implementation specs.',
        shortLink: 'abc12345',
        badges: { checkItems: 5, checkItemsChecked: 3 }
    };

    const extract = key => cardExport.s4tExtractFieldValue(card, key, lookup);

    assert.equal(extract('list'), 'Screening');
    assert.equal(extract('title'), 'AI Phone Agent #ClientSide');
    assert.equal(extract('title_raw'), '(5) [2] AI Phone Agent #ClientSide');
    assert.equal(extract('points'), '5');
    assert.equal(extract('completed_points'), '2');
    assert.equal(extract('remaining_points'), '3');
    assert.equal(extract('members'), 'Arman Khan, Sarah Chen');
    assert.equal(extract('labels'), 'Critical');
    assert.equal(extract('due'), '2026-11-15');
    assert.equal(extract('status'), 'In Progress');
    assert.equal(extract('desc'), 'Detailed phone agent implementation specs.');
    assert.equal(extract('url'), 'https://trello.com/c/abc12345');
    assert.equal(extract('checklists'), '3/5');
    assert.equal(extract('blank'), '');
});

test('s4tExtractFieldValue marks status as Done when card is in a Done list or dueComplete', () => {
    const lists = [{ id: 'list_done', name: 'Done (Release 24)' }];
    const lookup = {
        listsById: new Map(lists.map(l => [l.id, l])),
        membersById: new Map(),
        labelsById: new Map()
    };

    const cardInDoneList = { id: 'c1', name: 'Task 1', idList: 'list_done', dueComplete: false };
    const cardDueComplete = { id: 'c2', name: 'Task 2', idList: 'list_other', dueComplete: true };
    const cardInProgress = { id: 'c3', name: 'Task 3', idList: 'list_other', dueComplete: false };

    assert.equal(cardExport.s4tExtractFieldValue(cardInDoneList, 'status', lookup), 'Done');
    assert.equal(cardExport.s4tExtractFieldValue(cardDueComplete, 'status', lookup), 'Done');
    assert.equal(cardExport.s4tExtractFieldValue(cardInProgress, 'status', lookup), 'In Progress');
});

test('s4tFilterAndSortCards respects list, member, label exclusions and Not Sure lists', () => {
    const boardData = {
        lists: [
            { id: 'l_backlog', name: 'Backlog' },
            { id: 'l_doing', name: 'Doing' },
            { id: 'l_notsure', name: 'Dheeraj Not Sure' },
            { id: 'l_done', name: 'Done' }
        ],
        members: [
            { id: 'm1', fullName: 'Alice' },
            { id: 'm2', fullName: 'Bob' }
        ],
        labels: [
            { id: 'lbl_bug', name: 'Bug' },
            { id: 'lbl_feat', name: 'Feature' }
        ]
    };

    const cards = [
        { id: '1', name: '(3) Card 1', idList: 'l_backlog', idMembers: ['m1'], labels: [{ id: 'lbl_feat' }] },
        { id: '2', name: '(8) Card 2', idList: 'l_doing', idMembers: ['m2'], labels: [{ id: 'lbl_bug' }] },
        { id: '3', name: '(5) Card 3', idList: 'l_notsure', idMembers: ['m1'], labels: [] },
        { id: '4', name: '(2) Card 4', idList: 'l_done', idMembers: [], labels: [{ id: 'lbl_bug' }] },
        { id: '5', name: 'Release Template', idList: 'l_backlog', idMembers: ['m1'] },
        { id: '6', name: '(1) Closed Card', idList: 'l_doing', closed: true }
    ];

    // 1. Default with excludeNotSure = true: cards 3, 5 (template), 6 (closed) are filtered out
    const res1 = cardExport.s4tFilterAndSortCards(cards, boardData, { excludeNotSure: true });
    assert.deepEqual(res1.map(c => c.id), ['1', '2', '4']);

    // 2. Exclude list 'l_done'
    const res2 = cardExport.s4tFilterAndSortCards(cards, boardData, {
        excludeNotSure: true,
        excludedListIds: ['l_done']
    });
    assert.deepEqual(res2.map(c => c.id), ['1', '2']);

    // 3. Exclude member 'm2'
    const res3 = cardExport.s4tFilterAndSortCards(cards, boardData, {
        excludeNotSure: true,
        excludedMemberIds: ['m2']
    });
    assert.deepEqual(res3.map(c => c.id), ['1', '4']);

    // 4. Exclude label 'lbl_bug'
    const res4 = cardExport.s4tFilterAndSortCards(cards, boardData, {
        excludeNotSure: true,
        excludedLabelIds: ['lbl_bug']
    });
    assert.deepEqual(res4.map(c => c.id), ['1']);

    // 5. Sort by points descending
    const res5 = cardExport.s4tFilterAndSortCards(cards, boardData, {
        excludeNotSure: true,
        sortBy: 'points_desc'
    });
    assert.deepEqual(res5.map(c => c.id), ['2', '1', '4']); // 8 pts, 3 pts, 2 pts
});

test('s4tBuildExportCsv generates valid RFC-4180 CSV with UTF-8 BOM and formula neutralization', () => {
    const columns = [
        { id: 'c1', header: 'Area', source: 'list' },
        { id: 'c2', header: 'Tasks', source: 'title' },
        { id: 'c3', header: 'Points', source: 'points' },
        { id: 'c4', header: 'Formula Injection', source: 'desc' }
    ];

    const cards = [
        {
            id: 'c1',
            name: '(5) Normal Task',
            idList: 'l1',
            desc: '=HYPERLINK("https://malicious.example")'
        },
        {
            id: 'c2',
            name: '(3) Task with, comma and "quotes"',
            idList: 'l1',
            desc: '+SUM(1,2)'
        }
    ];

    const lookup = {
        listsById: new Map([['l1', { name: 'Screening' }]]),
        membersById: new Map(),
        labelsById: new Map()
    };

    const csv = cardExport.s4tBuildExportCsv(columns, cards, lookup);

    // Must start with UTF-8 BOM
    assert.ok(csv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');

    // Formulas neutralized with leading apostrophe
    assert.ok(csv.includes("'\=HYPERLINK"), 'Dangerous = formula must be prefixed with apostrophe');
    assert.ok(csv.includes("'+SUM"), 'Dangerous + formula must be prefixed with apostrophe');

    // Quotes escaped as double quotes
    assert.ok(csv.includes('""quotes""'), 'Quotes inside text must be escaped as double quotes');
});

test('s4tBuildExportExcel generates valid HTML spreadsheet table with formula neutralization', () => {
    const columns = [
        { id: 'c1', header: 'Area', source: 'list' },
        { id: 'c2', header: 'Tasks', source: 'title' },
        { id: 'c3', header: 'Points', source: 'points' }
    ];

    const cards = [
        { id: 'c1', name: '(8) Malicious Task', idList: 'l1', desc: '' }
    ];

    const lookup = {
        listsById: new Map([['l1', { name: '=EVIL()' }]]),
        membersById: new Map(),
        labelsById: new Map()
    };

    const html = cardExport.s4tBuildExportExcel(columns, cards, lookup, 'Sprint Board');

    assert.ok(html.includes('<table border="1">'), 'Must contain HTML table');
    assert.ok(html.includes('<th>Area</th>'), 'Must contain column headers');
    assert.ok(html.includes('&#39;=EVIL()'), 'List name formula must be neutralized in HTML table');
    assert.ok(html.includes('8'), 'Must include story points');
});

test('s4tBuildExportTsv generates clean tab-separated text for Google Sheets clipboard', () => {
    const columns = [
        { id: 'c1', header: 'Area', source: 'list' },
        { id: 'c2', header: 'Tasks', source: 'title' },
        { id: 'c3', header: 'Points', source: 'points' }
    ];

    const cards = [
        { id: 'c1', name: '(3) Clean Title', idList: 'l1' }
    ];

    const lookup = {
        listsById: new Map([['l1', { name: 'Sprint List' }]]),
        membersById: new Map(),
        labelsById: new Map()
    };

    const tsv = cardExport.s4tBuildExportTsv(columns, cards, lookup);
    const lines = tsv.split('\n');

    assert.equal(lines.length, 2);
    assert.equal(lines[0], 'Area\tTasks\tPoints');
    assert.equal(lines[1], 'Sprint List\tClean Title\t3');
});

test('integration: sprint-helper.js, manifest.json, feature-preferences.js and sprint-helper.css contain export references', () => {
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');
    assert.ok(sh.includes('#s4t-export-launch'), 'sprint-helper.js must contain toolbar button #s4t-export-launch');
    assert.ok(sh.includes('#s4t-burndown-export-btn'), 'sprint-helper.js must contain modal button #s4t-burndown-export-btn');
    assert.ok(sh.includes('s4tOpenCardExport'), 'sprint-helper.js must call s4tOpenCardExport');

    const manifest = fs.readFileSync('manifest.json', 'utf8');
    assert.ok(manifest.includes('card-export.js'), 'manifest.json must include card-export.js');

    const fp = fs.readFileSync('feature-preferences.js', 'utf8');
    assert.ok(fp.includes('exportCards'), 'feature-preferences.js must register exportCards');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('#s4t-export-dialog'), 'sprint-helper.css must style #s4t-export-dialog');
    assert.ok(css.includes('.s4t-export-tabs-bar'), 'sprint-helper.css must style .s4t-export-tabs-bar');
    assert.ok(css.includes('.s4t-sheet-grid-wrapper'), 'sprint-helper.css must style .s4t-sheet-grid-wrapper');
    assert.ok(css.includes('.s4t-sheet-th'), 'sprint-helper.css must style .s4t-sheet-th');
    assert.ok(css.includes('.s4t-sheet-th-card'), 'sprint-helper.css must style .s4t-sheet-th-card');
    assert.ok(css.includes('.s4t-sheet-th-add'), 'sprint-helper.css must style .s4t-sheet-th-add');
    assert.ok(css.includes('.s4t-export-att-columns'), 'sprint-helper.css must style .s4t-export-att-columns');
    assert.ok(css.includes('.s4t-split-download-group'), 'sprint-helper.css must style .s4t-split-download-group');
    assert.ok(css.includes('.s4t-split-menu'), 'sprint-helper.css must style .s4t-split-menu');
    assert.ok(css.includes('.s4t-field-info-tooltip'), 'sprint-helper.css must style .s4t-field-info-tooltip');
});

test('s4tFilterAndSortCards sorts accurately by title, due date, points asc and dev name', () => {
    const boardData = {
        lists: [{ id: 'l1', name: 'Sprint' }],
        members: [
            { id: 'm_bob', fullName: 'Bob Builder' },
            { id: 'm_alice', fullName: 'Alice Wonder' }
        ],
        labels: []
    };

    const cards = [
        { id: 'c_z', name: '(10) Zebra', idList: 'l1', due: '2026-12-01', idMembers: ['m_bob'] },
        { id: 'c_a', name: '(2) Apple', idList: 'l1', due: '2026-10-15', idMembers: ['m_alice'] },
        { id: 'c_m', name: '(5) Mango', idList: 'l1', due: '2026-11-20', idMembers: ['m_alice'] }
    ];

    // Sort by title A-Z
    const byTitle = cardExport.s4tFilterAndSortCards(cards, boardData, { sortBy: 'title' });
    assert.deepEqual(byTitle.map(c => c.id), ['c_a', 'c_m', 'c_z']);

    // Sort by points ascending
    const byPtsAsc = cardExport.s4tFilterAndSortCards(cards, boardData, { sortBy: 'points_asc' });
    assert.deepEqual(byPtsAsc.map(c => c.id), ['c_a', 'c_m', 'c_z']);

    // Sort by due date
    const byDue = cardExport.s4tFilterAndSortCards(cards, boardData, { sortBy: 'due' });
    assert.deepEqual(byDue.map(c => c.id), ['c_a', 'c_m', 'c_z']);

    // Sort by dev / assignee
    const byDev = cardExport.s4tFilterAndSortCards(cards, boardData, { sortBy: 'dev' });
    // Alice Wonder cards ('c_a', 'c_m') before Bob Builder ('c_z')
    assert.equal(byDev[2].id, 'c_z');
});

test('card-export UI: sprint-helper.js global tooltip covers #s4t-export-dialog [data-tooltip]', () => {
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');
    assert.ok(sh.includes('#s4t-export-dialog [data-tooltip]'), 'Global tooltip selector in sprint-helper.js must cover #s4t-export-dialog [data-tooltip]');
});

test('card-export UI: includes virtual skeleton preview grid, blur overlay, and crisp CTA card', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-sheet-virtual-row'), 'card-export.js must create virtual skeleton rows');
    assert.ok(ce.includes('s4t-sheet-virtual-cell'), 'card-export.js must create virtual skeleton cells');
    assert.ok(ce.includes('s4t-sheet-skeleton-line'), 'card-export.js must create skeleton lines');
    assert.ok(ce.includes('s4t-sheet-preview-blur-overlay'), 'card-export.js must create blurred overlay');
    assert.ok(ce.includes('s4t-sheet-preview-cta-card'), 'card-export.js must create centered preview CTA card');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('.s4t-sheet-virtual-row'), 'sprint-helper.css must style virtual rows');
    assert.ok(css.includes('.s4t-sheet-skeleton-line'), 'sprint-helper.css must style skeleton shimmer lines');
    assert.ok(css.includes('.s4t-sheet-preview-blur-overlay'), 'sprint-helper.css must style blurred overlay with backdrop-filter');
    assert.ok(css.includes('.s4t-sheet-preview-cta-card'), 'sprint-helper.css must style crisp preview CTA card');
});

test('card-export UI: source mapping has label with info icon and centered select', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-sheet-source-row'), 'card-export.js must structure source row');
    assert.ok(ce.includes('s4t-sheet-source-header'), 'card-export.js must place label and info icon in header');
    assert.ok(ce.includes('s4t-sheet-source-select-wrap'), 'card-export.js must wrap select for centered layout');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('.s4t-sheet-source-row'), 'sprint-helper.css must style source row');
    assert.ok(css.includes('.s4t-sheet-source-header'), 'sprint-helper.css must style source header');
    assert.ok(css.includes('.s4t-sheet-source-select-wrap'), 'sprint-helper.css must center source select wrap');
});

test('card-export UI: exclusions tab includes Attention-filter-style group toggles for lists, members, and labels', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-export-att-column-heading'), 'card-export.js must include column headings with toggle containers');
    assert.ok(ce.includes('s4t-export-att-list-groups'), 'card-export.js must include list group toggle containers');
    assert.ok(ce.includes("'data-list-group'"), 'card-export.js must set data-list-group attribute');
    assert.ok(ce.includes("key: 'all', name: 'All lists'"), 'card-export.js must include All lists group definition');
    assert.ok(ce.includes("key: 'todo', name: 'All Todo lists'"), 'card-export.js must include All Todo lists group definition');
    assert.ok(ce.includes("key: 'not-sure', name: 'All Not Sure lists'"), 'card-export.js must include All Not Sure lists group definition');
    assert.ok(ce.includes('data-member-group="all"'), 'card-export.js must include All members toggle');
    assert.ok(ce.includes('data-label-group="all"'), 'card-export.js must include All labels toggle');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('.s4t-export-att-column-heading'), 'sprint-helper.css must style exclusion column headings');
    assert.ok(css.includes('.s4t-export-att-list-groups'), 'sprint-helper.css must style exclusion list groups');
    assert.ok(css.includes('.s4t-export-att-group-toggle'), 'sprint-helper.css must style group toggles matching Attention filter');
});

test('card-export: exports support group separator rows, default green header and Times New Roman font', () => {
    const columns = [
        { id: 'c1', header: 'Area', source: 'list' },
        { id: 'c2', header: 'Tasks', source: 'title' }
    ];

    const cards = [
        { id: 'c1', name: 'Task 1', idList: 'l1' },
        { id: 'c2', name: 'Task 2', idList: 'l1' },
        { id: 'c3', name: 'Task 3', idList: 'l2' }
    ];

    const lookup = {
        listsById: new Map([['l1', { name: 'List Alpha' }], ['l2', { name: 'List Beta' }]]),
        membersById: new Map(),
        labelsById: new Map()
    };

    // 1. TSV with insertSeparatorRow: true
    const tsv = cardExport.s4tBuildExportTsv(columns, cards, lookup, { insertSeparatorRow: true, sortBy: 'list' });
    const tsvLines = tsv.split('\n');
    assert.equal(tsvLines.length, 5, 'Must have header + 2 tasks + 1 empty separator + 1 task = 5 lines');
    assert.equal(tsvLines[3], '\t', 'Line 3 must be the empty separator line between List Alpha and List Beta');

    // 2. CSV with insertSeparatorRow: true
    const csv = cardExport.s4tBuildExportCsv(columns, cards, lookup, { insertSeparatorRow: true, sortBy: 'list' });
    assert.ok(csv.includes('""\r\n""') || csv.includes('"",,"') || csv.includes('""'), 'CSV must contain empty row');

    // 3. Excel with default green header and Times New Roman
    const excel = cardExport.s4tBuildExportExcel(columns, cards, lookup, 'My Board', {
        insertSeparatorRow: true,
        sortBy: 'list'
    });
    assert.ok(excel.includes('background-color: #b7e1cd'), 'Excel must include default green header color #b7e1cd');
    assert.ok(excel.includes("font-family: 'Times New Roman', Times, serif"), 'Excel must include Times New Roman font family');
    assert.ok(excel.includes('font-weight: bold'), 'Excel must include bold header font weight');
    assert.ok(excel.includes('class="s4t-sep"'), 'Excel must include separator row class');
});

test('card-export UI: includes full width and height dialog, green header row with black bold text, Times New Roman whole sheet, guide banner, and selectable formats', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-toggle-separator'), 'card-export.js must include line break between groups toggle');
    assert.ok(!ce.includes('s4t-toggle-color-groups'), 'card-export.js must remove color rows by group toggle');
    assert.ok(ce.includes('s4t-sheet-guide-banner'), 'card-export.js must include guide banner');
    assert.ok(ce.includes('Spreadsheet Designer Tips & Quick Guide'), 'card-export.js must include guide banner heading');
    assert.ok(ce.includes('s4t-sheet-type-select'), 'card-export.js must include format select in column card');
    assert.ok(ce.includes('Dropdown (Board Devs)'), 'card-export.js must support Board Devs dropdown format');
    assert.ok(ce.includes('Checkbox (QA / Review)'), 'card-export.js must support Checkbox format');
    assert.ok(ce.includes('Custom Dropdown...'), 'card-export.js must support Custom Dropdown format');
    assert.ok(!ce.includes('s4t-sheet-color-swatches'), 'card-export.js must remove header tint color swatches');
    assert.ok(ce.includes('20-Card Preview'), 'card-export.js must feature 20-card preview CTA');
    assert.ok(ce.includes('slice(0, 20)'), 'card-export.js must slice first 20 cards for preview');
    assert.ok(ce.includes('s4t-metric-copied'), 'card-export.js must apply s4t-metric-copied feedback');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('width: calc(100vw - 20px) !important'), 'sprint-helper.css must set dialog to full width calc(100vw - 20px)');
    assert.ok(css.includes('height: calc(100vh - 20px) !important'), 'sprint-helper.css must set dialog to full height calc(100vh - 20px)');
    assert.ok(css.includes("font-family: 'Times New Roman', Times, serif !important"), 'sprint-helper.css must set Times New Roman across whole sheet');
    assert.ok(css.includes('background-color: #b7e1cd !important'), 'sprint-helper.css must style first row with green background');
    assert.ok(css.includes('color: #000000 !important'), 'sprint-helper.css must style first row with black text');
    assert.ok(css.includes('font-weight: bold !important'), 'sprint-helper.css must style first row with bold text');
    assert.ok(!css.includes('.s4t-sheet-color-swatch'), 'sprint-helper.css must remove color swatch classes');
    assert.ok(css.includes('.s4t-sheet-topbar-toggle'), 'sprint-helper.css must style topbar toggles');
    assert.ok(css.includes('.s4t-sheet-guide-banner'), 'sprint-helper.css must style guide banner');
    assert.ok(css.includes('.s4t-sheet-type-select'), 'sprint-helper.css must style format select');
    assert.ok(css.includes('.s4t-sheet-cell-checkbox'), 'sprint-helper.css must style cell checkbox');
    assert.ok(css.includes('.s4t-sheet-cell-select'), 'sprint-helper.css must style cell select');
    assert.ok(css.includes('.s4t-sheet-separator-row'), 'sprint-helper.css must style group separator row');
    assert.ok(css.includes('.s4t-btn.s4t-metric-copied'), 'sprint-helper.css must style metric copied button state');
    assert.ok(css.includes('.s4t-metric-toast-success'), 'sprint-helper.css must style metric toast success');
});

test('card-export UI: aligns with extension standards (s4tFeatureHelp, overlay z-index, Atlassian tokens, and a11y)', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-feature-title'), 'card-export.js must wrap title in .s4t-feature-title');
    assert.ok(ce.includes('s4tFeatureHelp("Export Cards"'), 'card-export.js must invoke s4tFeatureHelp for Export Cards');
    assert.ok(ce.includes('s4t-dismiss-tooltip'), 'card-export.js must dispatch s4t-dismiss-tooltip on modal close');
    assert.ok(ce.includes('role="tablist"'), 'card-export.js tabs bar must have role="tablist"');
    assert.ok(ce.includes('role="tab"'), 'card-export.js tab buttons must have role="tab"');
    assert.ok(ce.includes('aria-selected="true"'), 'card-export.js active tab must have aria-selected="true"');
    assert.ok(ce.includes('role="tabpanel"'), 'card-export.js tab views must have role="tabpanel"');
    assert.ok(ce.includes('aria-expanded'), 'card-export.js format toggle must manage aria-expanded');
    assert.ok(ce.includes('role="menu"'), 'card-export.js format menu must have role="menu"');
    assert.ok(ce.includes('role="menuitem"'), 'card-export.js format menu items must have role="menuitem"');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('z-index: 2147483640 !important'), 'Overlay must use extension top stacking z-index 2147483640');
    assert.ok(css.includes('animation: s4tFadeIn'), 'Overlay must use standard s4tFadeIn animation');
    assert.ok(css.includes('var(--ds-surface-overlay'), 'CSS must use --ds-surface-overlay token');
    assert.ok(css.includes('var(--ds-background-neutral'), 'CSS must use --ds-background-neutral token');
    assert.ok(css.includes('var(--ds-background-brand-bold'), 'CSS must use --ds-background-brand-bold token');
    assert.ok(css.includes('var(--ds-text'), 'CSS must use --ds-text token');
});

test('card-export UI: header reset button, tab-2 separator position, transparent header info icon, and enhanced tab-1 layout', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Reset template in header, only for tab-1
    assert.ok(ce.includes('id="s4t-header-reset-btn"'), 'Header must contain reset template button');
    assert.ok(ce.includes("dialog.find('#s4t-header-reset-btn').show()"), 'Reset button must be shown on tab-1');
    assert.ok(ce.includes("dialog.find('#s4t-header-reset-btn').hide()"), 'Reset button must be hidden on tab-2');

    // 2. Line break between groups moved to 2nd tab before Sort Rows By
    const sortBoxIdx = ce.indexOf('s4t-export-att-sort-box');
    const separatorToggleIdx = ce.indexOf('s4t-export-separator-toggle');
    const sortRowsByLabelIdx = ce.indexOf('Sort Rows By:');
    assert.ok(sortBoxIdx !== -1 && separatorToggleIdx !== -1 && sortRowsByLabelIdx !== -1, 'Elements must exist');
    assert.ok(sortBoxIdx < separatorToggleIdx, 's4t-export-separator-toggle must be inside s4t-export-att-sort-box');
    assert.ok(separatorToggleIdx < sortRowsByLabelIdx, 'Line break between groups toggle must appear before Sort Rows By: text');

    // 3. Header info icon has transparent background (no background color)
    assert.ok(css.includes('#s4t-export-dialog .s4t-feature-help {\n    background: transparent !important;'), 'Header feature-help icon must have transparent background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-field-info-icon {\n    display: inline-flex !important;'), 'Field info icon must be styled');

    // 4. Enhanced tab-1 preview area and column showing (uncluttered, compact card grid, zebra striping, collapsible banner)
    assert.ok(ce.includes('<details class="s4t-sheet-guide-banner">'), 'Guide banner must be collapsible <details> to maximize preview area');
    assert.ok(ce.includes('s4t-sheet-col-count-badge'), 'Top bar must display columns count badge');
    assert.ok(css.includes('grid-template-columns: 56px 1fr !important'), 'Source & format rows must use compact 2-column grid layout');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell'), 'Preview table must feature zebra striping on alternating rows');
    assert.ok(css.includes('background: #e8f0fe !important'), 'Preview table must feature light blue hover highlight');
});


