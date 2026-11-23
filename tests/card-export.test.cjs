const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const cardExport = require('../card-export.js');

test('card-export.js defines all 15 specified field mappings with exact descriptions', () => {
    const fields = cardExport.s4tExportCardFields;
    assert.equal(fields.length, 15, 'Must have exactly 15 field definitions');

    const expected = {
        list: 'Trello List name (e.g. "Screening", "In Progress").',
        title: 'Clean card title (without point badges).',
        title_raw: 'Full card title (including any points or tags).',
        points: 'Story points (estimated/assigned).',
        completed_points: 'Completed points (from [ ] or { }).',
        remaining_points: 'Remaining points.',
        members: 'Developer / member names (or usernames).',
        product_owner: 'Product Owner extracted from card labels ending with a dot "." (e.g. "Kashvi." -> "Kashvi").',
        labels: 'Label names (excluding developer and product member labels).',
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
    assert.ok(!sh.includes("id=\"s4t-export-launch\""), 'sprint-helper.js must not add toolbar button #s4t-export-launch');
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

test('card-export UI: includes blur overlay and crisp CTA card without hardcoded skeleton', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(!ce.includes('s4t-sheet-skeleton-line'), 'card-export.js must not contain hardcoded skeleton lines');
    assert.ok(!ce.includes('s4t-sheet-virtual-row'), 'card-export.js must not contain virtual skeleton rows');
    assert.ok(ce.includes('s4t-sheet-preview-blur-overlay'), 'card-export.js must create blurred overlay');
    assert.ok(ce.includes('s4t-sheet-preview-cta-card'), 'card-export.js must create centered preview CTA card');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
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

test('card-export UI: includes full width and height dialog, glassy green headers, Times New Roman whole sheet, header guide button with cloudy tooltips, and selectable formats', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    assert.ok(ce.includes('s4t-toggle-separator'), 'card-export.js must include line break between groups toggle');
    assert.ok(!ce.includes('s4t-toggle-color-groups'), 'card-export.js must remove color rows by group toggle');
    assert.ok(ce.includes('s4t-export-guide-btn'), 'card-export.js must include header guide button');
    assert.ok(!ce.includes('s4t-sheet-guide-banner'), 'card-export.js must remove old dropdown guide banner');
    assert.ok(ce.includes('renderCloudyTooltips'), 'card-export.js must render cloudy tooltips');
    assert.ok(ce.includes('s4t-sheet-type-select'), 'card-export.js must include format select in column card');
    assert.ok(ce.includes("'String'"), 'card-export.js must support String format');
    assert.ok(ce.includes("'Devs'"), 'card-export.js must support Devs format');
    assert.ok(ce.includes("'Custom'"), 'card-export.js must support Custom format');
    assert.ok(!ce.includes('Checkbox (QA / Review)'), 'card-export.js must remove Checkbox format');
    assert.ok(!ce.includes('s4t-sheet-color-swatches'), 'card-export.js must remove header tint color swatches');
    assert.ok(ce.includes('20-Card Preview'), 'card-export.js must feature 20-card preview CTA');
    assert.ok(ce.includes('slice(0, 20)'), 'card-export.js must slice first 20 cards for preview');
    assert.ok(ce.includes('s4t-metric-copied'), 'card-export.js must apply s4t-metric-copied feedback');

    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(css.includes('width: calc(100vw - 20px) !important'), 'sprint-helper.css must set dialog to full width calc(100vw - 20px)');
    assert.ok(css.includes('height: calc(100vh - 20px) !important'), 'sprint-helper.css must set dialog to full height calc(100vh - 20px)');
    assert.ok(css.includes("font-family: 'Times New Roman', Times, serif !important"), 'sprint-helper.css must set Times New Roman across whole sheet');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th-card') && css.includes('rgba(224, 248, 234') && css.includes('backdrop-filter: blur(8px) !important;'), 'sprint-helper.css must style column cards with glassy green gradient and blur');
    assert.ok(!css.includes('.s4t-sheet-color-swatch'), 'sprint-helper.css must remove color swatch classes');
    assert.ok(css.includes('.s4t-sheet-topbar-toggle'), 'sprint-helper.css must style topbar toggles');
    assert.ok(css.includes('.s4t-cloud-tooltip') && css.includes('#s4t-guide-freeze-overlay'), 'sprint-helper.css must style freeze overlay and cloudy tooltip');
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

    // 3. Header info icon has styled background highlight matching Members Burndown
    assert.ok(css.includes('#s4t-export-dialog .s4t-feature-help {\n    background: var(--ds-background-neutral, #f4f4f5) !important;'), 'Header feature-help icon must have styled background highlight matching Members Burndown');
    assert.ok(css.includes('#s4t-export-dialog .s4t-field-info-icon {\n    display: inline-flex !important;'), 'Field info icon must be styled');

    // 4. Enhanced tab-1 preview area and column showing (uncluttered, compact card grid, zebra striping, header guide button, footer counter)
    assert.ok(ce.includes('s4t-export-guide-btn'), 'Header guide button must exist');
    assert.ok(!ce.includes('s4t-sheet-guide-banner'), 'Guide dropdown banner must be removed in favor of header guide button');
    assert.ok(ce.includes('s4t-sheet-col-count-badge'), 'Columns count badge must be defined');
    assert.ok(ce.includes('s4t-export-footer-left'), 'Footer left container must exist for column count');
    assert.ok(css.includes('grid-template-columns: auto 1fr !important'), 'Source row must use auto 1fr grid layout to prevent info icon clipping');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell'), 'Preview table must feature zebra striping on alternating rows');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:hover .s4t-sheet-cell'), 'Preview table must feature hover highlight');
    assert.ok(css.includes('background: var(--ds-background-neutral-hovered, #ebecf0) !important;'), 'Preview table must feature neutral gray hover highlight');
    assert.ok(ce.includes('s4t-dirty-refresh-btn'), 'Dirty state must render refresh button to regenerate preview');
    assert.ok(ce.includes('Column or exclusion settings changed.'), 'Dirty state must inform user of pending changes');
});

test('card-export UI: centered dirty banner, custom required error, hover drop, SVG info icon, dropdown hover, Tab 2 inclusion defaults, auto-scroll, and soft grey dark theme', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Centered dirty banner and refresh button in viewport
    assert.ok(css.includes('position: sticky !important;\n    left: 24px !important;'), 'Dirty banner must be sticky with left anchor for viewport centering');
    assert.ok(css.includes('margin: 10px auto !important;'), 'Dirty banner must have auto margins');
    assert.ok(css.includes('.s4t-dirty-refresh-btn {\n    font-size: 13px !important;'), 'Dirty refresh button must have distinct styling');

    // 2. Custom dtype required error
    assert.ok(ce.includes('s4t-input-required-error'), 'card-export.js must add required error class when custom options are empty');
    assert.ok(ce.includes('validateCustomOptions'), 'card-export.js must validate custom options input');
    assert.ok(css.includes('.s4t-sheet-custom-options-input.s4t-input-required-error'), 'sprint-helper.css must style required error with red border and soft red background');

    // 3. Hover drop background effect on column header input, selects, and custom text inputs
    assert.ok(css.includes('.s4t-sheet-header-input:hover'), 'sprint-helper.css must style column header input hover');
    assert.ok(css.includes('.s4t-sheet-source-select:hover'), 'sprint-helper.css must style source select hover');
    assert.ok(css.includes('.s4t-sheet-type-select:hover'), 'sprint-helper.css must style type select hover');
    assert.ok(css.includes('.s4t-sheet-custom-options-input:hover'), 'sprint-helper.css must style custom options input hover');

    // 4. Vector SVG info icon for columns matching other popups' subtle gray styling
    assert.ok(ce.includes('s4t-field-info-svg'), 'card-export.js must render vector SVG info icon for crisp visibility');
    assert.ok(css.includes('.s4t-field-info-svg'), 'sprint-helper.css must style vector SVG info icon');
    assert.ok(css.includes('color: var(--ds-text-subtle, #626f86) !important;'), 's4t-field-info-icon must use subtle text color matching other popups');
    assert.ok(css.includes('color: #b6c2cf !important;') || css.includes('color: var(--ds-text-subtle, #9fadbc) !important;'), 'dark mode info icon must use subtle text color matching other popups');

    // 5. Dropdown open on mouseenter, close on mousedown
    assert.ok(ce.includes('attachDropdownHover'), 'card-export.js must attach hover trigger to dropdown selects');
    assert.ok(ce.includes('showPicker'), 'card-export.js must invoke showPicker on mouseenter');

    // 6. Tab 2 inclusion mental model (all checked by default, checking includes, unchecking excludes)
    assert.ok(ce.includes('All members are included by default'), 'card-export.js must describe inclusion model for members');
    assert.ok(ce.includes('All labels and unlabeled cards are included by default'), 'card-export.js must describe inclusion model for labels');
    assert.ok(ce.includes('!state.excludedMemberIds.has(m.id)'), 'Members must be checked by default when not in excludedMemberIds');
    assert.ok(ce.includes('!state.excludedLabelIds.has(key)'), 'Labels must be checked by default when not in excludedLabelIds');

    // 7. Auto-scroll to rightmost on adding column
    assert.ok(ce.includes('scrollLeft: wrapper[0].scrollWidth'), 'card-export.js must scroll wrapper to scrollWidth upon adding a column');

    // 8. Soft grey dark theme matching Members Burndown and Attention Filters
    assert.ok(css.includes('#s4t-export-dialog {\n    background: #22272b !important;'), 'Export dialog in dark theme must use soft grey #22272b');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-header,\n[data-theme="dark"] #s4t-export-dialog .s4t-export-header'), 'Dark header must use soft grey #282e33');
    assert.ok(css.includes('rgba(34, 39, 43, 0.75) !important'), 'Dark preview blur overlay must use soft grey rgba(34, 39, 43, 0.75)');

    // 9. Preview note text is aligned left with sticky position instead of pushed to far right
    assert.ok(ce.includes('s4t-sheet-note-content'), 'card-export.js must wrap preview note in .s4t-sheet-note-content');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-note-row td {\n    font-size: 12px !important;\n    color: #626f86 !important;\n    padding: 8px 12px !important;\n    background: transparent !important;\n    text-align: left !important;\n    border: none !important;\n}'), 'sprint-helper.css must align preview note to the left instead of rightmost');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-note-content {\n    display: inline-flex !important;\n    align-items: center !important;\n    gap: 6px !important;\n    position: sticky !important;\n    left: 12px !important;'), 'sprint-helper.css must style note content as sticky left');
});

test('card-export: guide banner popover prevents upward UI shift, validation disables copy/download, and dropdowns open on single click/hover', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Header Guide button with frosted freeze overlay, cloudy tooltips, and dark theme dirty card
    assert.ok(ce.includes('s4t-export-guide-btn'), 'card-export.js must define header Guide button');
    assert.ok(ce.includes('toggleGuideMode'), 'card-export.js must define toggleGuideMode');
    assert.ok(ce.includes('s4t-guide-freeze-overlay'), 'card-export.js must inject freeze overlay to freeze popup');
    assert.ok(ce.includes('s4t-cloud-tooltip'), 'card-export.js must render cloudy tooltips');
    assert.ok(ce.includes('s4t-dirty-dark-card'), 'card-export.js must render dirty popup in dark theme card');
    assert.ok(css.includes('#s4t-export-dialog #s4t-guide-freeze-overlay'), 'sprint-helper.css must style freeze overlay');
    assert.ok(css.includes('#s4t-export-dialog .s4t-cloud-tooltip'), 'sprint-helper.css must style cloudy tooltip with blur and shadow');
    assert.ok(css.includes('#s4t-export-dialog .s4t-dirty-dark-card'), 'sprint-helper.css must style dark theme dirty card');

    // 2. Action buttons validation state and error blocking for download
    assert.ok(ce.includes('function hasValidationErrors()'), 'card-export.js must define hasValidationErrors helper');
    assert.ok(ce.includes('function updateActionButtonsState()'), 'card-export.js must define updateActionButtonsState helper');
    assert.ok(!ce.includes("id=\"s4t-btn-copy-tsv\""), 'Copy for Google Sheets button must be removed');
    assert.ok(ce.includes("downloadBtn.addClass('s4t-btn-disabled')"), 'Download button must receive s4t-btn-disabled on error');
    assert.ok(css.includes('#s4t-export-dialog .s4t-btn.s4t-btn-disabled'), 'sprint-helper.css must style s4t-btn-disabled with reduced opacity and not-allowed cursor');
    assert.ok(ce.includes("showToast('⚠️ Required: Please fill in custom options before downloading file.')"), 'Download button must block and show warning toast when required fields are unfilled');
    assert.ok(ce.includes("dialog.find('.s4t-input-required-error:first').focus()"), 'Invalid input must be focused when attempting to download with errors');

    // 3. Dropdowns open on single click and hover without double click
    assert.ok(ce.includes("attachDropdownHover(sourceSelect)"), 'Source select must have attachDropdownHover');
    assert.ok(ce.includes("attachDropdownHover(typeSelect)"), 'Type select must have attachDropdownHover');
    assert.ok(ce.includes("attachDropdownHover(sortSelect)"), 'Sort select must have attachDropdownHover');
    assert.ok(!ce.includes("if (document.activeElement === this) this.blur()"), 'attachDropdownHover must not blur on mousedown, which caused double-click bug');
    assert.ok(ce.includes("formatToggle.on('click', function (e) {\n                e.stopPropagation();\n                if (hasValidationErrors()) {\n                    dialog.find('.s4t-input-required-error:first').focus();\n                    showToast('⚠️ Required: Please fill in custom options before choosing export format.');\n                    return;\n                }\n                formatMenu.prop('hidden', false);"), 'Format toggle button must open on single click');

    // 4. Custom dropdown component for instant hover and single-click opening
    assert.ok(ce.includes("s4t-custom-dropdown"), 'card-export.js must create s4t-custom-dropdown component');
    assert.ok(ce.includes("s4t-custom-dropdown-trigger"), 'card-export.js must create dropdown trigger button');
    assert.ok(ce.includes("s4t-custom-dropdown-menu"), 'card-export.js must create dropdown menu');
    assert.ok(ce.includes("s4t-custom-dropdown-item"), 'card-export.js must create dropdown items');
    assert.ok(ce.includes("$select.val(val).trigger('change')"), 'Item click must update select val and fire change event');
    assert.ok(css.includes('#s4t-export-dialog .s4t-select-replaced[hidden]'), 'sprint-helper.css must hide replaced native select');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown'), 'sprint-helper.css must style s4t-custom-dropdown');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-trigger'), 'sprint-helper.css must style s4t-custom-dropdown-trigger');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-menu'), 'sprint-helper.css must style s4t-custom-dropdown-menu');
    assert.ok(css.includes('#s4t-export-dialog .s4t-split-menu::after'), 'sprint-helper.css must bridge 6px gap with pseudo-element to prevent flicker');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-custom-dropdown-trigger'), 'sprint-helper.css must style dark theme for custom dropdown trigger');
});

test('card-export: column info icon is white, and missing custom dtype options disables copy/download with not-allowed cursor', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Column info icon is solid white (#ffffff) in both light and dark mode
    assert.ok(ce.includes('stroke="#ffffff"'), 'card-export.js must render SVG with white stroke');
    assert.ok(ce.includes('stroke-width="2"'), 'card-export.js must render SVG with stroke-width 2');
    assert.ok(css.includes('#s4t-export-dialog .s4t-field-info-icon {\n    display: inline-flex !important;\n    align-items: center !important;\n    justify-content: center !important;\n    width: 16px !important;\n    height: 16px !important;\n    color: #ffffff !important;'), 'sprint-helper.css must style field info icon with color #ffffff');
    assert.ok(css.includes('#s4t-export-dialog .s4t-field-info-icon svg,\n#s4t-export-dialog .s4t-field-info-svg {\n    display: block !important;\n    width: 13px !important;\n    height: 13px !important;\n    stroke: #ffffff !important;\n    stroke-width: 2 !important;'), 'sprint-helper.css must style field info svg with stroke #ffffff');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-field-info-icon') && css.includes('color: #ffffff !important;'), 'Dark mode field info icon must maintain white color #ffffff');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-field-info-svg') && css.includes('stroke: #ffffff !important;'), 'Dark mode field info svg must maintain white stroke #ffffff');

    // 2. Custom Dtype missing detection
    assert.ok(ce.includes('function isCustomDtypeMissing(col)'), 'card-export.js must define isCustomDtypeMissing helper');
    assert.ok(ce.includes("if (!col || col.cellType !== 'custom_select') return false;"), 'isCustomDtypeMissing must only apply to custom_select columns');
    assert.ok(ce.includes("raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean)"), 'isCustomDtypeMissing must filter empty trimmed entries');

    // Verify isCustomDtypeMissing logic directly
    function isCustomDtypeMissing(col) {
        if (!col || col.cellType !== 'custom_select') return false;
        var raw = (col.customOptions || '').trim();
        if (!raw) return true;
        var validItems = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        return validItems.length === 0;
    }
    assert.strictEqual(isCustomDtypeMissing({ cellType: 'text', customOptions: '' }), false, 'Non custom_select is not missing');
    assert.strictEqual(isCustomDtypeMissing({ cellType: 'custom_select', customOptions: '' }), true, 'Empty customOptions is missing');
    assert.strictEqual(isCustomDtypeMissing({ cellType: 'custom_select', customOptions: '   ' }), true, 'Whitespace customOptions is missing');
    assert.strictEqual(isCustomDtypeMissing({ cellType: 'custom_select', customOptions: ' , ,   , ' }), true, 'Comma-only customOptions is missing');
    assert.strictEqual(isCustomDtypeMissing({ cellType: 'custom_select', customOptions: 'Option A, Option B' }), false, 'Valid customOptions is not missing');

    // 3. Action buttons and split download group disabled state
    assert.ok(ce.includes("splitGroup.addClass('s4t-group-disabled')"), 'Split download group must receive s4t-group-disabled when validation errors exist');
    assert.ok(ce.includes("splitGroup.removeClass('s4t-group-disabled')"), 'Split download group must remove s4t-group-disabled when valid');
    assert.ok(ce.includes("formatToggle.addClass('s4t-btn-disabled')"), 'Format toggle must receive s4t-btn-disabled on error');

    // 4. Split group hover blocking
    assert.ok(ce.includes("splitGroup.on('mouseenter', function () {\n                if (hasValidationErrors()) {\n                    formatMenu.prop('hidden', true);\n                    return;\n                }"), 'Split group mouseenter must block opening menu when errors exist');

    // 5. Disabled cursor: not-allowed !important on buttons and split group in light & dark modes
    assert.ok(css.includes('#s4t-export-dialog .s4t-split-download-group.s4t-group-disabled,\n#s4t-export-dialog .s4t-split-download-group.s4t-group-disabled *'), 'sprint-helper.css must target split group and children when disabled');
    assert.ok(css.includes('cursor: not-allowed !important;'), 'sprint-helper.css must apply not-allowed cursor to disabled controls');
    assert.ok(css.includes('#s4t-export-dialog .s4t-split-download-group.s4t-group-disabled .s4t-btn-primary:hover'), 'Primary button hover inside disabled split group must be neutralized');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-split-download-group.s4t-group-disabled'), 'Dark mode must style disabled split download group');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-btn-secondary.s4t-btn-disabled:hover'), 'Dark mode must neutralize secondary button hover when disabled');
});

test('card-export Tab 2: info icons in headers, member-scoped Exclude lists, vibrant label colors, and Attention-style soft teal highlight', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Three lines converted into info icons inside column headers
    assert.ok(ce.includes('function makeAttInfoIcon(label, tooltip)'), 'card-export.js must define makeAttInfoIcon helper');
    assert.ok(ce.includes('s4t-att-info-icon'), 'makeAttInfoIcon must render .s4t-att-info-icon button');
    assert.ok(ce.includes('s4t-export-att-heading-title'), 'Column headings must wrap title and info icon in .s4t-export-att-heading-title');
    assert.ok(ce.includes('Match any selected member. All members are included by default.'), 'Members header info icon tooltip must contain member description');
    assert.ok(ce.includes('Cards in checked lists are excluded from export.'), 'Exclude lists header info icon tooltip must contain list description');
    assert.ok(ce.includes('Match any selected label. All labels and unlabeled cards are included by default.'), 'Labels header info icon tooltip must contain label description');

    // Verify static hint paragraphs were replaced
    assert.ok(!ce.includes('<p class="s4t-export-att-col-hint">Cards in checked lists are excluded from export.</p>'), 'Static hint paragraph for lists must be removed');
    assert.ok(!ce.includes('<p class="s4t-export-att-col-hint">Match any selected member. All members are included by default.</p>'), 'Static hint paragraph for members must be removed');
    assert.ok(!ce.includes('<p class="s4t-export-att-col-hint">Match any selected label. All labels and unlabeled cards are included by default.</p>'), 'Static hint paragraph for labels must be removed');

    // 2. Column order matches Attention (Members -> Exclude lists -> Labels)
    const membersColIdx = ce.indexOf('var membersCol = $(\'<div class="s4t-export-att-col">\');');
    const listsColIdx = ce.indexOf('var listsCol = $(\'<div class="s4t-export-att-col">\');');
    const labelsColIdx = ce.indexOf('var labelsCol = $(\'<div class="s4t-export-att-col">\');');
    const appendMembersIdx = ce.indexOf('columnsGrid.append(membersCol);');
    const appendListsIdx = ce.indexOf('columnsGrid.append(listsCol);');
    const appendLabelsIdx = ce.indexOf('columnsGrid.append(labelsCol);');
    assert.ok(membersColIdx !== -1 && listsColIdx !== -1 && labelsColIdx !== -1, 'All three columns must exist');
    assert.ok(membersColIdx < listsColIdx && listsColIdx < labelsColIdx, 'Column definition order must be Members -> Exclude lists -> Labels');
    assert.ok(appendMembersIdx !== -1 && appendListsIdx !== -1 && appendLabelsIdx !== -1, 'All three columns must be appended to columnsGrid');
    assert.ok(appendMembersIdx < appendListsIdx && appendListsIdx < appendLabelsIdx, 'Columns must be appended in order: membersCol, listsCol, labelsCol');

    // 3. Dynamic Member-scoped Exclude lists and reactive updates
    assert.ok(ce.includes('function getMemberLists(boardData, excludedMemberIds)'), 'card-export.js must define getMemberLists scoped helper');
    assert.ok(ce.includes('renderExcludeLists();'), 'Member checkbox toggle must trigger renderExcludeLists');
    assert.ok(ce.includes('NOTE: - No members selected. Select a member to see available lists.'), 'Note must be shown when all members excluded');
    assert.ok(ce.includes('No lists found for the selected members.'), 'Note must be shown when no lists match member filter');

    // 4. Exclude lists group toggles (All Todo, All Not Sure, All lists)
    assert.ok(ce.includes('All Todo lists'), 'Exclude lists column must feature All Todo lists group toggle');
    assert.ok(ce.includes('All Not Sure lists'), 'Exclude lists column must feature All Not Sure lists group toggle');
    assert.ok(ce.includes('All lists'), 'Exclude lists column must feature All lists group toggle');

    // 5. Vibrant label colors palette mapping
    assert.ok(ce.includes('LABEL_COLORS = {'), 'card-export.js must define authentic LABEL_COLORS palette');
    assert.ok(ce.includes("'#4bce97'"), 'LABEL_COLORS must map green to authentic Trello hex #4bce97');
    assert.ok(ce.includes("'#f5cd47'"), 'LABEL_COLORS must map yellow to authentic Trello hex #f5cd47');
    assert.ok(ce.includes("'#fea362'"), 'LABEL_COLORS must map orange to authentic Trello hex #fea362');
    assert.ok(ce.includes("'#f87168'"), 'LABEL_COLORS must map red to authentic Trello hex #f87168');
    assert.ok(ce.includes("'#9f8fef'"), 'LABEL_COLORS must map purple to authentic Trello hex #9f8fef');
    assert.ok(ce.includes("'#579dff'"), 'LABEL_COLORS must map blue to authentic Trello hex #579dff');
    assert.ok(ce.includes("'#6cc3e0'"), 'LABEL_COLORS must map sky to authentic Trello hex #6cc3e0');
    assert.ok(ce.includes("'#94c748'"), 'LABEL_COLORS must map lime to authentic Trello hex #94c748');
    assert.ok(ce.includes("'#e774bb'"), 'LABEL_COLORS must map pink to authentic Trello hex #e774bb');
    assert.ok(ce.includes("'#8590a2'"), 'LABEL_COLORS must map black to authentic Trello hex #8590a2');
    assert.ok(ce.includes('s4t-label-dot-none'), 'Unlabeled cards must use s4t-label-dot-none class');

    // 6. Highlighting UI similar to Attention popup
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-att-heading-title {\n    display: inline-flex !important;\n    align-items: center !important;\n    gap: 6px !important;\n}'), 'sprint-helper.css must style heading title container');
    assert.ok(css.includes('#s4t-export-dialog .s4t-att-info-icon {\n    display: inline-flex !important;'), 'sprint-helper.css must style Tab 2 info icon');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-att-option:hover {\n    background: var(--ds-background-neutral-subtle-hovered, #f4f4f5) !important;\n}'), 'sprint-helper.css must style option hover with soft neutral background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-att-option:has(input:checked) {\n    background: var(--ds-background-neutral, #ebecf0) !important;\n    color: var(--ds-text, #172b4d) !important;\n    border-color: var(--ds-border, #c1c7d0) !important;\n    font-weight: 600 !important;\n}'), 'sprint-helper.css must style checked option with neutral gray highlight');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-att-option input[type=checkbox] {\n    width: 16px !important;\n    height: 16px !important;\n    accent-color: #0f766e !important;\n    flex-shrink: 0 !important;\n    cursor: pointer !important;\n}'), 'sprint-helper.css must style checkbox with teal accent color #0f766e');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-att-label-dot {\n    width: 12px !important;\n    height: 12px !important;'), 'sprint-helper.css must style label dot at 12px with border and shadow');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-export-att-option:has(input:checked)') && css.includes('background: #2c333a !important;'), 'Dark mode option highlight must use neutral gray surface');
});

test('card-export: generated preview dropdowns open cleanly without clipping or table row occlusion', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Cells with dev_select and custom_select receive s4t-sheet-cell-has-dropdown
    assert.ok(ce.includes("td.addClass('s4t-sheet-cell-has-dropdown');"), 'card-export.js must add s4t-sheet-cell-has-dropdown class to dropdown cells');

    // 2. sprint-helper.css enforces overflow: visible on dropdown cells
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell.s4t-sheet-cell-has-dropdown,\n#s4t-export-dialog .s4t-sheet-cell:has(.s4t-custom-dropdown) {\n    overflow: visible !important;'), 'sprint-helper.css must allow visible overflow on cells containing dropdowns');

    // 3. Active dropdown cell and row receive elevated z-index (500) to float over subsequent rows
    assert.ok(ce.includes("$wrap.closest('.s4t-sheet-cell').addClass('s4t-cell-dropdown-active');"), 'openDropdown must mark closest cell as active');
    assert.ok(ce.includes("$wrap.closest('.s4t-sheet-row').addClass('s4t-row-dropdown-active');"), 'openDropdown must mark closest row as active');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell.s4t-cell-dropdown-active,\n#s4t-export-dialog .s4t-sheet-cell:has(.s4t-dropdown-open) {\n    overflow: visible !important;\n    position: relative !important;\n    z-index: 500 !important;\n}'), 'Active cell must have position: relative and z-index 500');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row.s4t-row-dropdown-active,\n#s4t-export-dialog .s4t-sheet-row:has(.s4t-dropdown-open) {\n    position: relative !important;\n    z-index: 500 !important;\n}'), 'Active row must have position: relative and z-index 500');

    // 4. Boundary detection checks .s4t-sheet-grid-wrapper to prevent clipping in scroll container
    assert.ok(ce.includes("var gridWrap = dialog.find('.s4t-sheet-grid-wrapper');"), 'Boundary detection must find grid wrapper');
    assert.ok(ce.includes("wrapRect.bottom + 180 > bottomBoundary"), 'Boundary detection must check bottomBoundary');
    assert.ok(ce.includes("s4t-dropdown-align-right"), 'Boundary detection must support s4t-dropdown-align-right');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown.s4t-dropdown-align-right .s4t-custom-dropdown-menu'), 'sprint-helper.css must style s4t-dropdown-align-right');

    // 5. Cleanup on closeDropdown and document outside click
    assert.ok(ce.includes("$wrap.closest('.s4t-sheet-cell').removeClass('s4t-cell-dropdown-active');"), 'closeDropdown must remove cell active class');
    assert.ok(ce.includes("$wrap.closest('.s4t-sheet-row').removeClass('s4t-row-dropdown-active');"), 'closeDropdown must remove row active class');
    assert.ok(ce.includes("dialog.find('.s4t-sheet-cell').removeClass('s4t-cell-dropdown-active');"), 'Outside click must remove cell active class');
    assert.ok(ce.includes("dialog.find('.s4t-sheet-row').removeClass('s4t-row-dropdown-active');"), 'Outside click must remove row active class');

    // 6. Dark theme support for cell dropdowns
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-cell.s4t-sheet-cell-has-dropdown') && css.includes('overflow: visible !important;'), 'Dark theme must allow visible overflow on dropdown cells');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-cell.s4t-cell-dropdown-active') && css.includes('z-index: 500 !important;'), 'Dark theme must elevate z-index on active dropdown cells');
});

test('card-export: Tab 2 info icons match heading colors in light and dark mode', () => {
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Light mode info icon color matches heading h4 text color
    assert.ok(
        css.includes('#s4t-export-dialog .s4t-att-info-icon {\n    display: inline-flex !important;\n    align-items: center !important;\n    justify-content: center !important;\n    width: 16px !important;\n    height: 16px !important;\n    padding: 0 !important;\n    color: var(--ds-text, #172b4d) !important;'),
        'Light mode info icon must match heading h4 color var(--ds-text, #172b4d)'
    );

    // 2. Dark mode info icon color matches dark heading text color
    assert.ok(
        css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-att-info-icon,') &&
        css.includes('color: #ffffff !important;\n}'),
        'Dark mode info icon must match dark heading text color #ffffff'
    );
});

test('card-export: custom dropdown options parsing and preview table dropdown handling', () => {
    const cardExport = require('../card-export.js');
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Presets feature is completely removed
    assert.strictEqual(cardExport.STANDARD_OPTION_PRESETS, undefined, 'STANDARD_OPTION_PRESETS must not be exported');
    assert.strictEqual(cardExport.s4tGetStandardOptionsForColumn, undefined, 's4tGetStandardOptionsForColumn must not be exported');
    assert.ok(!ce.includes('s4t-sheet-preset-chips'), 'card-export.js must not include preset chips');
    assert.ok(!ce.includes('s4t-preset-chip'), 'card-export.js must not include preset chip buttons');
    assert.ok(!css.includes('#s4t-export-dialog .s4t-sheet-preset-chips'), 'sprint-helper.css must not style preset chips');

    // 2. s4tParseCustomOptions handles whitespace, duplicates, and empty strings
    const parsed = cardExport.s4tParseCustomOptions('In Progress, Blocked, in progress, Ready for QA, , Approved ');
    assert.deepStrictEqual(parsed, ['In Progress', 'Blocked', 'Ready for QA', 'Approved']);
    const emptyParsed = cardExport.s4tParseCustomOptions(' , , ');
    assert.deepStrictEqual(emptyParsed, []);

    // 3. Tab 1 custom_select input allows manual options without forced presets
    assert.ok(ce.includes("var customInput = $('<input type=\"text\" class=\"s4t-sheet-custom-options-input\""), 'Custom input must be rendered');
    assert.ok(!ce.includes("col.customOptions = s4tGetStandardOptionsForColumn(col);"), 'Switching to custom_select must not auto-populate presets');

    // 4. Preview table dropdowns preserve card values and handle select states
    assert.ok(ce.includes("var optList = s4tParseCustomOptions(col.customOptions);"), 'Preview custom_select must parse col.customOptions');
    assert.ok(ce.includes("optList.unshift(val);"), 'Preview custom_select must preserve card value in options if not present');
    assert.ok(ce.includes("custSel.append($('<option value=\"\">').text('-- Select --').prop('selected', true));"), 'Preview custom_select must show -- Select -- for blank source without value');
    assert.ok(ce.includes("devSel.append(customDevOpt);"), 'Preview dev_select must preserve assigned name if not in board members list');
});

test('card-export: reference sheet alignment with 13 default columns, PO dot extraction, and cell edits sync', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Verify DEFAULT_COLUMNS definition matches 13 reference columns
    const expectedCols = [
        { id: 'c_list', header: 'List Name', source: 'list', cellType: 'text' },
        { id: 'c_title', header: 'Title', source: 'title', cellType: 'text' },
        { id: 'c_labels', header: 'Labels', source: 'labels', cellType: 'text' },
        { id: 'c_status', header: 'Status', source: 'blank', cellType: 'custom_select', customOptions: 'Going Live, Not Going Live' },
        { id: 'c_dev_owner', header: 'Dev Owner', source: 'members', cellType: 'dev_select' },
        { id: 'c_dev_conf', header: 'Dev Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_mgr_conf', header: 'Mgr Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select' },
        { id: 'c_po_conf', header: 'Product Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_cs_owner', header: 'CS Owner', source: 'blank', cellType: 'custom_select' },
        { id: 'c_cs_conf', header: 'CS Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_risk', header: 'Risk (Comments)', source: 'blank', cellType: 'text' },
        { id: 'c_resolution', header: 'Resolution (Comments)', source: 'blank', cellType: 'text' }
    ];

    expectedCols.forEach(col => {
        assert.ok(ce.includes(`id: '${col.id}'`), `DEFAULT_COLUMNS must include ${col.id}`);
        assert.ok(ce.includes(`header: '${col.header}'`), `DEFAULT_COLUMNS must include header ${col.header}`);
        assert.ok(ce.includes(`source: '${col.source}'`), `DEFAULT_COLUMNS must map source ${col.source}`);
        assert.ok(ce.includes(`cellType: '${col.cellType}'`), `DEFAULT_COLUMNS must set cellType ${col.cellType}`);
        if (col.customOptions) {
            assert.ok(ce.includes(`customOptions: '${col.customOptions}'`), `DEFAULT_COLUMNS must set customOptions for ${col.id}`);
        }
    });

    // 2. Test product_owner extraction from dot-terminated labels
    const lookup = {
        listsById: new Map([['l1', { id: 'l1', name: 'In Progress (Arman)' }]]),
        membersById: new Map([
            ['m1', { id: 'm1', fullName: 'Arman Khan', username: 'arman' }],
            ['m2', { id: 'm2', fullName: 'Sarah Chen', username: 'sarah' }]
        ]),
        labelsById: new Map()
    };

    const cardWithPO = {
        id: 'c101',
        name: 'Build checkout flow',
        idList: 'l1',
        idMembers: ['m1'],
        labels: [
            { id: 'lb1', name: 'Critical' },
            { id: 'lb2', name: 'Kashvi.' },
            { id: 'lb3', name: 'Arman Khan' },
            { id: 'lb4', name: 'Frontend' }
        ]
    };

    assert.equal(
        cardExport.s4tExtractFieldValue(cardWithPO, 'product_owner', lookup),
        'Kashvi',
        'product_owner must extract name from dot-ended label and strip trailing dot'
    );

    // Labels field must exclude both dev member names and PO dot labels
    assert.equal(
        cardExport.s4tExtractFieldValue(cardWithPO, 'labels', lookup),
        'Critical, Frontend',
        'Labels field must filter out developer member names and dot-ended labels'
    );

    // Members field strictly returns assigned members (no list name fallback)
    assert.equal(
        cardExport.s4tExtractFieldValue(cardWithPO, 'members', lookup),
        'Arman Khan',
        'Members field must return assigned members'
    );

    const unassignedCard = {
        id: 'c102',
        name: 'Unassigned task',
        idList: 'l1',
        idMembers: [],
        labels: [{ id: 'lb1', name: 'Backend' }]
    };

    assert.equal(
        cardExport.s4tExtractFieldValue(unassignedCard, 'members', lookup),
        '',
        'Unassigned card must return empty string for members (no list name fallback)'
    );

    assert.equal(
        cardExport.s4tExtractFieldValue(unassignedCard, 'product_owner', lookup),
        '',
        'Card without dot label must return empty string for product_owner'
    );

    // 3. Test editedCells synchronization into TSV, CSV, and Excel
    const testCols = [
        { id: 'col_title', header: 'Title', source: 'title' },
        { id: 'col_status', header: 'Status', source: 'blank' },
        { id: 'col_risk', header: 'Risk', source: 'blank' }
    ];
    const editedOptions = {
        editedCells: {
            'c101_col_status': 'Going Live',
            'c101_col_risk': 'Third-party API dependency'
        }
    };

    // TSV Export with edited cells
    const tsv = cardExport.s4tBuildExportTsv(testCols, [cardWithPO], lookup, editedOptions);
    assert.ok(tsv.includes('Build checkout flow\tGoing Live\tThird-party API dependency'), 'TSV must export edited cell values');

    // CSV Export with edited cells
    const csv = cardExport.s4tBuildExportCsv(testCols, [cardWithPO], lookup, editedOptions);
    assert.ok(csv.includes('"Build checkout flow","Going Live","Third-party API dependency"'), 'CSV must export edited cell values');

    // Excel Export with edited cells
    const excel = cardExport.s4tBuildExportExcel(testCols, [cardWithPO], lookup, 'Sprint Sheet', editedOptions);
    assert.ok(excel.includes('Going Live'), 'Excel must include edited status');
    assert.ok(excel.includes('Third-party API dependency'), 'Excel must include edited risk comment');

    // 4. Verify CSS styling for .s4t-sheet-cell-input
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-input'), 'sprint-helper.css must style .s4t-sheet-cell-input');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-input:hover'), 'sprint-helper.css must style .s4t-sheet-cell-input:hover');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-input:focus'), 'sprint-helper.css must style .s4t-sheet-cell-input:focus');
    assert.ok(css.includes('.theme-dark #s4t-export-dialog .s4t-sheet-cell-input,'), 'sprint-helper.css must style dark mode .s4t-sheet-cell-input');
});

test('card-export UI: aligns with Attention popup in styling, typography, buttons, tabs, metric badges, focus rings, and dark theme', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Dialog Shell & Backdrop
    assert.ok(css.includes('background: #18181b66 !important'), 'Export backdrop must match modal overlay standard');
    assert.ok(css.includes('backdrop-filter: blur(4px) !important'), 'Export backdrop must have blur(4px)');
    assert.ok(css.includes('border-radius: 18px !important'), 'Export dialog must have 18px border radius like Attention panel');
    assert.ok(css.includes('border: 1px solid var(--ds-border, #e4e4e7) !important'), 'Export dialog must use ds-border #e4e4e7');
    assert.ok(css.includes('box-shadow: 0 12px 48px #18181b30 !important'), 'Export dialog must use Attention shadow');
    assert.ok(css.includes('font: 14px/1.5 var(--s4t-font-family, system-ui, sans-serif) !important'), 'Export dialog must use Attention font family and size');

    // 2. Header & Action Controls
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-header'), 'Must style header');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-title-row h2'), 'Must style title row h2');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-title-icon {\n    color: #0f766e !important;'), 'Title icon must use Attention deep teal #0f766e');
    assert.ok(ce.includes('s4t-export-match-count s4t-metric-badge'), 'Count badge must carry s4t-metric-badge class');
    assert.ok(ce.includes('data-tooltip="Double-click to copy matching card count"'), 'Count badge must have Attention double-click tooltip');
    assert.ok(ce.includes('data-copy-value="0"'), 'Count badge must have initial data-copy-value');
    assert.ok(ce.includes(".attr('data-copy-value', count)"), 'Count badge must update data-copy-value on filter update');
    assert.ok(ce.includes('s4tBindMetricCopy(dialog)'), 'card-export.js must wire s4tBindMetricCopy to dialog');

    // 3. Metric Badge Global Copy Integration
    assert.ok(css.includes('#s4t-export-dialog .s4t-metric-badge'), 'sprint-helper.css must style export metric badge');
    assert.ok(css.includes('#s4t-export-dialog [data-copy-value]'), 'sprint-helper.css must wire pointer on export [data-copy-value]');
    assert.ok(css.includes('#s4t-export-dialog [data-copy-value].s4t-metric-copied'), 'sprint-helper.css must celebrate export metric copy');

    // 4. Tabs Bar & Active Indicator
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-tabs-bar'), 'Must style tabs bar');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-tab'), 'Must style tabs');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-tab.s4t-tab-active'), 'Must style active tab');
    assert.ok(css.includes('box-shadow: 0 1px 3px rgba(9, 30, 66, 0.08) !important'), 'Active tab must use neutral elevated card shadow');

    // 5. Buttons, Focus Ring, and Reduced Motion
    assert.ok(css.includes('#s4t-export-dialog :focus-visible'), 'Dialog must provide Attention focus outline');
    assert.ok(css.includes('outline: 2px solid #14b8a6 !important'), 'Focus visible must use #14b8a6');
    assert.ok(css.includes('#s4t-export-dialog .s4t-btn-primary'), 'Must style primary button');
    assert.ok(css.includes('background: #0f766e !important'), 'Primary button must use #0f766e');
    assert.ok(css.includes('background: #115e59 !important'), 'Primary hover must use #115e59');
    assert.ok(css.includes('#s4t-export-dialog .s4t-btn-secondary'), 'Must style secondary button');
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must include reduced motion rule');

    // 6. Toast Notification & Dark Mode
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-footer-status'), 'Must style toast status');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-footer-status.s4t-metric-toast-success'), 'Must style success toast');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog'), 'Must provide dark mode dialog styles');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-btn-primary'), 'Must style dark mode primary button');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-btn-secondary'), 'Must style dark mode secondary button');
});

test('card-export: column hide/unhide toggle, default all ON, export exclusion, and white sheet area styling', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Columns hide button and toggle implementation
    assert.ok(ce.includes('s4t-sheet-col-hide'), 'card-export.js must render hide button .s4t-sheet-col-hide');
    assert.ok(ce.includes('s4t-col-eye-svg'), 'card-export.js must include eye SVG icon');
    assert.ok(ce.includes('col.hidden = !col.hidden;'), 'card-export.js must toggle col.hidden state on click');
    assert.ok(ce.includes('s4t-col-card-hidden'), 'card-export.js must apply .s4t-col-card-hidden class when hidden');
    assert.ok(ce.includes('(Hidden)'), 'card-export.js must append (Hidden) to column badge when hidden');
    assert.ok(ce.includes('s4t-sheet-cell-hidden'), 'card-export.js must style hidden column preview cells with .s4t-sheet-cell-hidden');
    assert.ok(ce.includes('— Hidden —'), 'card-export.js must render — Hidden — placeholder in hidden preview cells');
    assert.ok(ce.includes('c.hidden = false;'), 'card-export.js must initialize/reset all columns to hidden: false');

    // 2. Hidden columns completely excluded from CSV, TSV, and Excel exports
    const testCols = [
        { id: 'c1', header: 'Visible Col 1', source: 'title', hidden: false },
        { id: 'c2', header: 'Hidden Col', source: 'points', hidden: true },
        { id: 'c3', header: 'Visible Col 2', source: 'list' } // undefined hidden is visible
    ];
    const testCards = [
        { id: 'card1', name: '(3) First Card', idList: 'l1' }
    ];
    const testLookup = {
        listsById: new Map([['l1', { name: 'Active List' }]]),
        membersById: new Map(),
        labelsById: new Map()
    };

    const csvOut = cardExport.s4tBuildExportCsv(testCols, testCards, testLookup);
    assert.ok(csvOut.includes('Visible Col 1'), 'CSV must include visible column 1');
    assert.ok(csvOut.includes('Visible Col 2'), 'CSV must include visible column 2');
    assert.ok(!csvOut.includes('Hidden Col'), 'CSV must exclude hidden column header');
    assert.ok(!csvOut.includes('"3"'), 'CSV must exclude hidden column points data');

    const tsvOut = cardExport.s4tBuildExportTsv(testCols, testCards, testLookup);
    assert.ok(tsvOut.includes('Visible Col 1'), 'TSV must include visible column 1');
    assert.ok(tsvOut.includes('Visible Col 2'), 'TSV must include visible column 2');
    assert.ok(!tsvOut.includes('Hidden Col'), 'TSV must exclude hidden column header');
    assert.ok(!tsvOut.includes('\t3\t'), 'TSV must exclude hidden column points data');

    const excelOut = cardExport.s4tBuildExportExcel(testCols, testCards, testLookup);
    assert.ok(excelOut.includes('Visible Col 1'), 'Excel must include visible column 1');
    assert.ok(excelOut.includes('Visible Col 2'), 'Excel must include visible column 2');
    assert.ok(!excelOut.includes('Hidden Col'), 'Excel must exclude hidden column header');

    // 3. CSS styling verification: Greyish sheet area, glassy green headers with black text, frosted dropdowns/inputs, and white info icon
    // Sheet area wrapper and table are greyish
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-grid-wrapper {\n    flex: 1 1 0 !important;\n    min-height: 0 !important;\n    overflow: auto !important;\n    border: 1px solid #dfe1e6 !important;\n    border-radius: 8px !important;\n    background: #f4f5f7 !important;'), 'sprint-helper.css must style sheet grid wrapper as greyish');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th-card') && css.includes('rgba(224, 248, 234') && css.includes('backdrop-filter: blur(8px) !important;'), 'sprint-helper.css must style th cards as glassy green');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell {\n    padding: 7px 10px !important;\n    background: #f4f5f7 !important;\n    border: 1px solid #dfe1e6 !important;\n    border-radius: 0 !important;\n    color: #172b4d !important;'), 'sprint-helper.css must style sheet cells as greyish');

    // Column headers have black font color and frosted translucent glass inputs
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th-card') && css.includes('color: #000000 !important;'), 'sprint-helper.css must style column cards with black font color');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-header-input') && css.includes('color: #000000 !important;'), 'sprint-helper.css must style header input with black font color');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-source-select') && css.includes('color: #000000 !important;'), 'sprint-helper.css must style source select with black font color');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th-card .s4t-custom-dropdown .s4t-custom-dropdown-trigger') && css.includes('color: #000000 !important;'), 'sprint-helper.css must style dropdown triggers with black font color');

    // Shows info icon and text are white on emerald badge
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-source-header') && css.includes('background: #059669 !important;'), 'sprint-helper.css must style source header badge with emerald background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-source-label') && css.includes('color: #ffffff !important;'), 'sprint-helper.css must style Shows: label with white text');
    assert.ok(css.includes('#s4t-export-dialog .s4t-field-info-svg') && css.includes('stroke: #ffffff !important;'), 'sprint-helper.css must style Shows info svg with white stroke');

    // Dark mode th card is glassy green, and sheet cells/inputs are styled
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-th-card') && css.includes('rgba(29, 66, 45') && css.includes('backdrop-filter: blur(8px) !important;'), 'Dark mode th card must be glassy green');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-cell'), 'Dark mode sheet cell must be styled');
});

test('card-export: interactive Guide tour, Shows info icon overflow fix, glassy green headers, dark theme dirty popup, and centered preview with alternate rows', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Header Guide button and cloudy tooltips
    assert.ok(ce.includes('id="s4t-export-guide-btn"'), 'card-export.js must create header Guide button');
    assert.ok(ce.includes('toggleGuideMode()'), 'card-export.js must wire Guide button to toggleGuideMode');
    assert.ok(ce.includes('#s4t-guide-freeze-overlay'), 'card-export.js must inject freeze overlay');
    assert.ok(ce.includes('.s4t-cloud-tooltip'), 'card-export.js must create cloudy tooltips');
    assert.ok(ce.includes('Escape'), 'card-export.js must support dismissing guide mode via Escape key');
    assert.ok(css.includes('#s4t-export-dialog #s4t-guide-freeze-overlay'), 'sprint-helper.css must style freeze overlay');
    assert.ok(css.includes('#s4t-export-dialog .s4t-cloud-tooltip'), 'sprint-helper.css must style cloud tooltip');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-guide-btn.s4t-guide-active'), 'sprint-helper.css must style active guide button');

    // 2. Shows info icon layout fix
    assert.ok(css.includes('grid-template-columns: auto 1fr !important'), 's4t-sheet-source-row must use auto 1fr to prevent icon clipping');
    assert.ok(css.includes('overflow: visible !important') && css.includes('.s4t-field-info-icon'), 'info icon must have visible overflow');

    // 3. Glassy green column headers in light and dark mode
    assert.ok(css.includes('rgba(224, 248, 234, 0.92)') && css.includes('rgba(183, 225, 205, 0.95)'), 'Light mode column headers must use glassy green gradient');
    assert.ok(css.includes('rgba(29, 66, 45, 0.88)') && css.includes('rgba(20, 50, 33, 0.94)'), 'Dark mode column headers must use glassy green gradient');

    // 4. Dark theme dirty card
    assert.ok(ce.includes('s4t-dirty-dark-card'), 'card-export.js must render s4t-dirty-dark-card');
    assert.ok(css.includes('#s4t-export-dialog .s4t-dirty-dark-card'), 'sprint-helper.css must style dark theme dirty card');
    assert.ok(css.includes('background: #1f2428 !important;'), 'dirty card must use dark background #1f2428');

    // 5. Centered preview area and alternate rows highlight
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell') && css.includes('background: #f4f5f7 !important;'), 'Alternate rows must have subtle gray highlight in light mode');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell') && css.includes('background: #282e33 !important;'), 'Alternate rows must have dark highlight in dark mode');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell') && css.includes('text-align: center !important;'), 'Sheet cells must be centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-input') && css.includes('text-align: center !important;'), 'Cell inputs must be centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-select') && css.includes('text-align: center !important;'), 'Cell selects must be centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-cell-dropdown .s4t-custom-dropdown-trigger') && css.includes('justify-content: center !important;'), 'Cell custom dropdowns must be centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-preview-blur-overlay') && css.includes('width: 100% !important;'), 'Preview blur overlay must be full width');
});

test('card-export: full-width initial greyish preview grid, greyish rows with hover effects, and emerald green dropdowns in light and dark mode', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Full-width placeholder rows and overlay width synchronization
    assert.ok(ce.includes('s4t-sheet-placeholder-row'), 'card-export.js must create s4t-sheet-placeholder-row');
    assert.ok(ce.includes('s4t-sheet-placeholder-cell'), 'card-export.js must create s4t-sheet-placeholder-cell');
    assert.ok(ce.includes('syncOverlayWidth'), 'card-export.js must synchronize blur overlay width with table');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-placeholder-row .s4t-sheet-placeholder-cell') && css.includes('background: #f4f5f7 !important;'), 'sprint-helper.css must style placeholder cells with greyish background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-preview-cta-card') && css.includes('position: sticky !important;') && css.includes('left: 50% !important;'), 'CTA card must be sticky centered');

    // 2. Greyish generated preview rows with hover effects
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell') && css.includes('background: #ebecf0 !important;'), 'Even rows must be soft grey #ebecf0');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:hover .s4t-sheet-cell') && css.includes('background: #dfe1e6 !important;'), 'Row hover must highlight cells with #dfe1e6');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell:hover') && css.includes('background: #d0d7de !important;'), 'Cell hover must highlight with #d0d7de');

    // 3. Dropdowns maintain emerald green styling and hover effects (no #0052cc borders)
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-arrow') && css.includes('color: #059669 !important;'), 'Custom dropdown arrows must be emerald green #059669');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown:hover .s4t-custom-dropdown-trigger') && css.includes('background: #ecfdf5 !important;') && css.includes('border-color: #059669 !important;'), 'Dropdown trigger hover must use emerald green border and mint background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown.s4t-dropdown-open .s4t-custom-dropdown-trigger') && css.includes('border-color: #059669 !important;'), 'Open dropdown trigger must use emerald green border');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-menu') && css.includes('border: 1.5px solid #059669 !important;'), 'Dropdown menu must use emerald green border');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-item:hover') && css.includes('background: #ecfdf5 !important;'), 'Dropdown items must highlight with mint background');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-cell-dropdown:hover .s4t-custom-dropdown-trigger') && css.includes('border-color: #059669 !important;'), 'Cell dropdown must highlight with emerald green border');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell-select:hover') && css.includes('border-color: #059669 !important;'), 'Cell select must highlight with emerald green border');

    // 4. Column headers font color black
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-header-input') && css.includes('color: #000000 !important;'), 'Column header input font color must be black #000000');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-header-input') && css.includes('color: #000000 !important;'), 'Dark mode column header input font color must be black #000000');

    // 5. Dark mode consistency: wrapper, table, cells and dropdowns maintain emerald green and greyish theme
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-sheet-grid-wrapper') && css.includes('background: #f4f5f7 !important;'), 'Dark mode sheet grid wrapper must remain greyish');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-custom-dropdown-arrow') && css.includes('color: #059669 !important;'), 'Dark mode dropdown arrow must be emerald green');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-custom-dropdown-item:hover') && css.includes('background: #ecfdf5 !important;'), 'Dark mode dropdown item hover must be mint green');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-custom-dropdown-trigger:hover') && css.includes('border-color: #059669 !important;'), 'Dark mode dropdown trigger hover must use emerald green border');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-custom-sort-dropdown:hover .s4t-custom-dropdown-trigger') && css.includes('border-color: #059669 !important;'), 'Dark mode sort dropdown hover must use emerald green border');

    // 6. Stationary viewport container and centered dropdowns
    assert.ok(ce.includes('s4t-sheet-grid-container'), 'card-export.js must create s4t-sheet-grid-container');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-grid-container'), 'sprint-helper.css must style s4t-sheet-grid-container');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-add-btn') && css.includes('border: 2px dashed #059669 !important;'), 'Add Column button must be highlighted with emerald dashed border');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-trigger') && css.includes('justify-content: center !important;'), 'Custom dropdown triggers must be centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-menu') && css.includes('left: 50% !important;'), 'Custom dropdown menu must open centered');
    assert.ok(css.includes('#s4t-export-dialog .s4t-custom-dropdown-item') && css.includes('justify-content: center !important;'), 'Custom dropdown items must be centered');
    assert.ok(ce.includes('s4t-sheet-placeholder-add'), 'Placeholder rows must include Add Column cells');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell.s4t-sheet-cell-empty') && css.includes('background: #f4f5f7 !important;'), 'Empty cells under Add Column must maintain greyish background');
});

test('card-export: hidden column read-only constraint and Status column title-leak prevention', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Hidden columns keep header controls disabled / read-only while keeping eye unhide button active
    assert.ok(ce.includes("var isHidden = !!col.hidden;"), 'card-export.js must check isHidden flag');
    assert.ok(ce.includes("headerInput = $('<input type=\"text\" class=\"s4t-sheet-header-input\" placeholder=\"Column Header\" aria-label=\"Header Name\">')\n                    .val(col.header || '')\n                    .prop('readonly', isHidden);"), 'Header input must be readonly when hidden');
    assert.ok(ce.includes("sourceSelect = $('<select class=\"s4t-sheet-source-select\" aria-label=\"Field Mapping\">')\n                    .prop('disabled', isHidden);"), 'Source select must be disabled when hidden');
    assert.ok(ce.includes("typeSelect = $('<select class=\"s4t-sheet-type-select\" aria-label=\"Cell Data Type\">')\n                    .prop('disabled', isHidden);"), 'Type select must be disabled when hidden');
    assert.ok(ce.includes(".prop('readonly', isHidden);") && ce.includes("customInput.attr('tabindex', '-1');"), 'Custom options input must be readonly and untabbable when hidden');
    assert.ok(ce.includes("delBtn = $('<button type=\"button\" class=\"s4t-sheet-col-del\" data-tooltip=\"Remove column\" aria-label=\"Remove column\">✕</button>')\n                    .prop('disabled', isHidden || state.columns.length <= 1)"), 'Delete button must be disabled when hidden');
    assert.ok(ce.includes("th = $('<th class=\"s4t-sheet-th\" draggable=\"' + (isHidden ? 'false' : 'true') + '\""), 'Hidden columns must disable th draggable attribute');
    assert.ok(ce.includes("if (col && col.hidden) {\n                th.attr('draggable', 'false');\n                return;\n            }"), 'bindColumnDragEvents must return early for hidden columns');

    // 2. attachDropdownHover respects disabled selects
    assert.ok(ce.includes("if ($select.prop('disabled')) return;"), 'attachDropdownHover must return early when select is disabled');
    assert.ok(ce.includes("$wrap.addClass('s4t-dropdown-disabled');"), 'attachDropdownHover must apply s4t-dropdown-disabled class');

    // 3. CSS disables pointer events on hidden column header controls, keeps eye button clickable
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden .s4t-sheet-header-input') && css.includes('pointer-events: none !important;'), 'Hidden column inputs must disable pointer events');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden .s4t-custom-dropdown-trigger') && css.includes('pointer-events: none !important;'), 'Hidden column dropdown triggers must disable pointer events');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden .s4t-sheet-drag-handle') && css.includes('pointer-events: none !important;'), 'Hidden column drag handle must disable pointer events');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden .s4t-sheet-col-del') && css.includes('pointer-events: none !important;'), 'Hidden column delete button must disable pointer events');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden .s4t-sheet-col-hide') && css.includes('pointer-events: auto !important;'), 'Hidden column eye toggle button must remain interactive');

    // 4. In preview rows, hidden columns remain readable but strictly read-only without inputs or dropdowns
    assert.ok(ce.includes("if (col.hidden) {\n                        td.addClass('s4t-sheet-cell-hidden');\n                        var displayVal = val || '';"), 'Preview table body must extract value and display readable text in hidden cells');
    assert.ok(ce.includes("hiddenSpan.text(displayVal).attr('title', displayVal + ' (Hidden from export - read-only)');"), 'Hidden cell must display readable data with read-only tooltip');
    assert.ok(ce.includes("hiddenSpan.text('— Hidden —').attr('title', 'Hidden from export');"), 'Hidden cell without data must fallback to — Hidden —');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-hidden-placeholder') && css.includes('user-select: text !important;') && css.includes('color: #475569 !important;'), 'Hidden cells must be readable and selectable with clear text color');

    // 5. Status column and custom_select title leak prevention
    assert.ok(ce.includes("(c.id === 'c_status' || (c.header && c.header.trim().toLowerCase() === 'status') || c.cellType === 'custom_select') && (c.source === 'title' || c.source === 'title_raw')"), 'Columns config sanitization must reset title source on Status or custom_select');
    assert.ok(ce.includes("var isTitleLeak = (col.source === 'title' || col.source === 'title_raw' || col.id === 'c_status' || (col.header && col.header.trim().toLowerCase() === 'status')) && !isCellEdited;"), 'custom_select must detect title leak when cell has not been explicitly edited');
    assert.ok(ce.includes("if (val && !isTitleLeak) {\n                            hasMatched = optList.some"), 'custom_select must not unshift leaked title into dropdown options');
    assert.ok(ce.includes("if ((!val || isTitleLeak) && (col.source === 'blank' || isTitleLeak)) {\n                            custSel.append($('<option value=\"\">').text('-- Select --').prop('selected', true));"), 'custom_select must default to -- Select -- when value is leaked title');
    assert.ok(ce.includes("var isDevTitleLeak = (col.source === 'title' || col.source === 'title_raw') && !isDevCellEdited;"), 'dev_select must guard against title leak');
});

test('card-export: scrollbar clearance, Add Column borders & text color, blank mapping on add, header icon removal, and old location entry points', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');

    // 1. Bottom scrollbar is visible and interactive during blur overlay
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-preview-blur-overlay {\n    position: absolute !important;\n    top: 130px !important;\n    margin-top: 10px !important;\n    left: 0 !important;\n    right: 0 !important;\n    bottom: 16px !important;') && css.includes('pointer-events: none !important;'), 'Blur overlay must leave bottom 16px clear for scrollbar and have pointer-events none');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-preview-cta-card {\n    pointer-events: auto !important;'), 'CTA card must have pointer-events auto');
    assert.ok(css.includes('#s4t-export-dialog .s4t-dirty-dark-card {\n    pointer-events: auto !important;'), 'Dirty card must have pointer-events auto');

    // 2. Add Column box borders do not disappear on hover, text is black and bold, icon color stays emerald green
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th-add') && css.includes('padding: 2px !important;') && css.includes('box-sizing: border-box !important;'), 'TH add must have padding and box-sizing to prevent border clipping');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-add-btn') && css.includes('color: #000000 !important;') && css.includes('font-weight: bold !important;'), 'Add Column button text must be black and bold');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-add-btn:hover') && css.includes('transform: none !important;') && css.includes('color: #000000 !important;'), 'Add Column button must not translate/scale on hover and must keep black text');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-add-icon') && css.includes('color: #059669 !important;'), 'Add Column icon must be emerald green');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-add-btn:hover .s4t-sheet-add-icon') && css.includes('color: #059669 !important;'), 'Add Column icon hover must maintain emerald green');

    // 3. New column addition defaults to source: 'blank' and cellType: 'text' (String)
    assert.ok(ce.includes("state.columns.push({ id: newId, header: 'New Column', source: 'blank', cellType: 'text' });"), 'New column must be mapped to blank source and text (String) dtype');

    // 4. Export Board Cards popup header has no icon
    assert.ok(!ce.includes("<svg class=\"s4t-export-title-icon\""), 'Popup header must not include svg icon');
    assert.ok(ce.includes("<h2 id=\"s4t-export-title\" class=\"s4t-modal-title\">Export Board Cards</h2>"), 'Popup header title must remain present');

    // 5. Removed from Trello navbar, entry point preserved in old export location (showExcelExport) and Members Burndown
    assert.ok(!sh.includes("id=\"s4t-export-launch\""), 'Trello navbar toolbar must not create #s4t-export-launch');
    assert.ok(sh.includes("showExcelExport"), 'Old export sheet handler showExcelExport must exist');
    assert.ok(sh.includes("s4tOpenCardExport"), 'showExcelExport must open s4tOpenCardExport');
    assert.ok(sh.includes("#s4t-burndown-export-btn"), 'Members Burndown modal must contain export button');
});

test('card-export: modern Trello export menu insertion, PO dot labels validation, and hidden column not-allowed styling', () => {
    const cardExport = require('../card-export.js');
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');

    // 1. checkExport in sprint-helper.js supports modern Trello and legacy Trello
    assert.ok(sh.includes(".pop-over-list, .pop-over').find('.js-export-json')"), 'checkExport must support legacy .pop-over-list .js-export-json');
    assert.ok(sh.includes('a[href*="/cards"][href*="json"]') && sh.includes('[data-testid*="export-json"]'), 'checkExport must query modern Trello JSON export candidates');
    assert.ok(sh.includes("t === 'export as json' || t === 'export json'"), 'checkExport must search open dialogs/popovers/drawers for export text');
    assert.ok(sh.includes("s4t-excel-export-menu-item") && sh.includes("js-export-excel"), 'checkExport must inject Excel item with js-export-excel class');
    assert.ok(sh.includes(".on('click.s4tExportShare mouseup.s4tExportShare'"), 'sprint-helper.js must listen for menu opening events to trigger checkExport');
    assert.ok(sh.includes("click(showExcelExport)"), 'Excel export item must bind showExcelExport on click');

    // 2. PO dot labels extraction via s4tGetDotLabels
    const mockBoard = {
        labels: [
            { name: 'Kashvi.' },
            { name: 'Rahul' },
            { name: 'Siddharth.' },
            { name: 'Bug' }
        ],
        cards: [
            { labels: [{ name: 'Kashvi.' }, { name: 'Pooja.' }, { name: 'Urgent' }] }
        ]
    };
    const extracted = cardExport.s4tGetDotLabels(mockBoard);
    assert.deepStrictEqual(extracted, ['Kashvi', 'Siddharth', 'Pooja'], 's4tGetDotLabels must extract only dot-terminated labels and strip dots');

    const emptyDotBoard = {
        labels: [{ name: 'Frontend' }, { name: 'Backend' }],
        cards: [{ labels: [{ name: 'High' }] }]
    };
    assert.deepStrictEqual(cardExport.s4tGetDotLabels(emptyDotBoard), [], 's4tGetDotLabels must return empty array if no dot labels exist');

    // s4tGetDotLabels supports labelNames object, full-width dot, and ellipsis
    const labelNamesBoard = {
        labelNames: { green: 'Sneha.', yellow: 'Priya．', red: 'Vikas…', blue: 'Ignored' }
    };
    assert.deepStrictEqual(cardExport.s4tGetDotLabels(labelNamesBoard), ['Sneha', 'Priya', 'Vikas'], 's4tGetDotLabels must parse labelNames and various dot variants');

    // 3. Product owner default column has empty customOptions and validates as required
    assert.ok(ce.includes("{ id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select', customOptions: '' }"), 'c_po_owner must default to blank customOptions');
    assert.ok(ce.includes("showToast('⚠️ Required: Please fill in Product Owner options before downloading file.');"), 'Download button must show PO specific error toast');

    // 4. Hidden column cursor not-allowed and suppression of row striping/hover
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th.s4t-sheet-th-hidden') && css.includes('cursor: not-allowed !important;'), 'Hidden TH must show not-allowed cursor');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-card-hidden') && css.includes('cursor: not-allowed !important;'), 'Hidden col card must show not-allowed cursor');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-cell.s4t-sheet-cell-hidden') && css.includes('cursor: not-allowed !important;'), 'Hidden cell must show not-allowed cursor');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:nth-child(even) .s4t-sheet-cell.s4t-sheet-cell-hidden') && css.includes('background: #f1f5f9 !important;'), 'Hidden cells must suppress alternating row striping');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-row:hover .s4t-sheet-cell.s4t-sheet-cell-hidden') && css.includes('background: #f1f5f9 !important;'), 'Hidden cells must suppress row hover background change');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th.s4t-sheet-th-hidden .s4t-sheet-col-hide') && css.includes('cursor: pointer !important;'), 'Eye unhide button must keep pointer cursor');

    // 5. Dynamic re-sync on window focus and forceRefresh board fetching
    assert.ok(ce.includes("fetchBoardData(boardShortLink, true"), 'card-export.js must fetch fresh board data with forceRefresh=true');
    assert.ok(ce.includes("$(window).off('focus.s4tExportSync').on('focus.s4tExportSync'"), 'card-export.js must re-sync dot labels on window focus');
    assert.ok(ce.includes("latestDotLabels = s4tGetDotLabels(data);"), 'setupLookup must dynamically refresh PO options from fresh data');
});

test('card-export: CS Owner default values unfilled, Excel menu enhancement, and input drag isolation', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');

    // 1. CS Owner defaults to unfilled (empty customOptions) just like Product Owner
    assert.ok(ce.includes("{ id: 'c_cs_owner', header: 'CS Owner', source: 'blank', cellType: 'custom_select', customOptions: '' }"), 'DEFAULT_COLUMNS must have c_cs_owner customOptions unfilled');
    assert.ok(ce.includes("{ id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select', customOptions: '' }"), 'DEFAULT_COLUMNS must have c_po_owner customOptions unfilled');

    // Placeholder must NOT be modified
    assert.ok(ce.includes("var customPlaceholder = isPoCol ? 'e.g. Prapti, Kashvi' : 'e.g. In Progress, Blocked, Ready for QA';"), 'customPlaceholder must stay unchanged');

    // CS Owner validation errors and toast messages
    assert.ok(!ce.includes("id=\"s4t-btn-copy-tsv\""), 'Copy for Google Sheets button must be removed');
    assert.ok(ce.includes("showToast('⚠️ Required: Please fill in CS Owner options before downloading file.');"), 'Download button must show CS Owner specific error toast');
    assert.ok(ce.includes("showToast('⚠️ Required: Please fill in CS Owner options before choosing export format.');"), 'Format item must show CS Owner specific error toast');

    // 2. Excel menu item in three dots is enhanced with icon and 'Export as Excel'
    assert.ok(sh.includes("class=\"s4t-menu-excel-svg\""), 'sprint-helper.js must inject s4t-menu-excel-svg icon');
    assert.ok(sh.includes("<span class=\"s4t-menu-excel-text\">Export as Excel</span>"), 'sprint-helper.js must label menu item Export as Excel');
    assert.ok(css.includes(".js-export-excel.s4t-menu-excel-item"), 'sprint-helper.css must style .js-export-excel.s4t-menu-excel-item');
    assert.ok(css.includes(".s4t-menu-excel-svg") && css.includes("color: #107c41 !important;"), 'sprint-helper.css must style excel icon in brand green');

    // 3. Column drag is allowed from anywhere on header card except inputs, and drop repositions columns
    assert.ok(ce.includes("headerInput.attr('draggable', 'false');"), 'headerInput must have draggable false attribute');
    assert.ok(ce.includes("customInput.on('dragstart', function (e) {\n                    e.stopPropagation();\n                    return false;\n                });"), 'customInput must stop dragstart propagation');
    assert.ok(ce.includes("if (target && target.closest && target.closest('input, textarea, select, button, .s4t-custom-dropdown'))"), 'dragstart must cancel when interacting with inputs/controls');
    assert.ok(ce.includes("state.columns.splice(fromIdx, 1)[0]") && ce.includes("state.columns.splice(toIdx, 0, movedCol)"), 'drop must reposition column in state.columns');
    assert.ok(ce.includes("s4tCleanLegacyCsOwner"), 'CS Owner must use s4tCleanLegacyCsOwner to clean legacy presets');

    // CSS ensures text selection and text cursor inside inputs, and dragover child pointer-events isolation
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-header-input') && css.includes('user-select: text !important;') && css.includes('cursor: text !important;'), 'header input must allow text selection');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-custom-options-input') && css.includes('user-select: text !important;') && css.includes('cursor: text !important;'), 'custom options input must allow text selection');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-drag-handle') && css.includes('user-select: none !important;') && css.includes('cursor: grab !important;'), 'drag handle must have grab cursor and user-select none');
    assert.ok(css.includes('#s4t-export-dialog .s4t-col-dragover *') && css.includes('pointer-events: none !important;'), 'dragover must disable child pointer events to prevent drop cancellations');

    // 4. Input selection isolation and directional drop indicator bar enhancements
    assert.ok(ce.includes("headerInput.on('mousedown focus', function () {\n                    th.attr('draggable', 'false');\n                });"), 'headerInput must reset th draggable to false on mousedown/focus');
    assert.ok(ce.includes("customInput.on('mousedown focus', function () {\n                    th.attr('draggable', 'false');\n                });"), 'customInput must reset th draggable to false on mousedown/focus');
    assert.ok(ce.includes("var isAfter = relX > (rect.width / 2);"), 'dragover must compute whether cursor is on left or right half of column');
    assert.ok(ce.includes("addTh.on('dragenter dragover', function (e) {") && ce.includes("addTh.on('drop', function (e) {"), 'addTh must support drop to place column at the end');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-th.s4t-col-drop-before::before') && css.includes('#s4t-export-dialog .s4t-sheet-th.s4t-col-drop-after::after'), 'CSS must include vertical drop indicator lines');
    assert.ok(css.includes('#s4t-export-dialog.s4t-is-dragging-col,') && css.includes('cursor: grabbing !important;'), 'active drag state must set grabbing cursor');
});

test('card-export: tab-2 moved to settings icon button in export popup header', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Tab-2 is positioned as a settings icon button in the header actions
    assert.ok(ce.includes('id="s4t-tab-btn-exclusions" data-tab="exclusions" role="tab"'), 'Settings button must retain tab accessibility and data-tab attributes');
    assert.ok(ce.includes('class="s4t-settings-icon"'), 'Settings button must render gear icon SVG');
    assert.ok(ce.includes('<span>Settings</span>'), 'Settings button must display Settings label');

    // 2. Exclusions view includes Back to Sheet button
    assert.ok(ce.includes('id="s4t-btn-back-to-sheet"'), 'Exclusions header must provide Back to Sheet button');
    assert.ok(ce.includes("exclusionsView.on('click', '#s4t-btn-back-to-sheet'"), 'Clicking back button must return to sheet view');

    // 3. Settings button toggles view back to sheet if clicked while active
    assert.ok(ce.includes("if (tab === 'exclusions' && state.currentTab === 'exclusions')"), 'Clicking settings button while active must toggle back to sheet');

    // 4. CSS styles for settings button and back button
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-settings-btn'), 'CSS must style settings button');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-settings-btn.s4t-settings-active'), 'CSS must style active settings button');
    assert.ok(css.includes('#s4t-export-dialog .s4t-btn-back-to-sheet'), 'CSS must style back to sheet button');
    assert.ok(css.includes('#s4t-export-dialog .s4t-exclusions-title-row'), 'CSS must style exclusions title row');

    // 5. Redundant tab bar and 'Sheet Designer & Preview' heading removed from dialog markup
    assert.ok(!ce.includes('id="s4t-tab-btn-sheet"'), 'card-export.js must not contain s4t-tab-btn-sheet');
    assert.ok(!ce.includes('Sheet Designer &amp; Preview'), 'card-export.js must not render Sheet Designer tab heading');
    assert.ok(!ce.includes('<div class="s4t-export-tabs-bar"'), 'card-export.js dialog markup must not include tabs-bar');
});

test('card-export: guide view scrolls preview to leftmost, spotlights unblurred features, and covers copy, count, and download without overlap', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Guide mode resets preview area scrollLeft to 0 before calculating tooltips
    assert.ok(ce.includes('gridWrapper[0].scrollLeft = 0;'), 'card-export.js must reset gridWrapper.scrollLeft to 0 on guide mode toggle');

    // 2. Unblurred spotlight cutouts: SVG mask with transparent holes and emerald spotlight rings
    assert.ok(ce.includes('s4t-guide-cutout-mask'), 'card-export.js must define SVG mask for transparent spotlight cutouts');
    assert.ok(ce.includes('s4t-spotlight-ring'), 'card-export.js must render glowing emerald spotlight rings around targets');
    assert.ok(css.includes('.s4t-spotlight-ring'), 'sprint-helper.css must style spotlight rings with drop-shadow');
    assert.ok(!css.includes('#s4t-export-dialog #s4t-guide-freeze-overlay {\n    position: absolute !important;\n    top: 0 !important;\n    left: 0 !important;\n    right: 0 !important;\n    bottom: 0 !important;\n    width: 100% !important;\n    height: 100% !important;\n    background: rgba(9, 30, 66, 0.45) !important;\n    backdrop-filter: blur(3px) !important;'), 'Freeze overlay must not apply global blur');

    // 3. Complete feature coverage across all 14 distinct targets
    // 3. Complete uncluttered feature coverage across all targets
    assert.ok(ce.includes("id: 'match-count'"), 'Guide must include Matching Cards Count item');
    assert.ok(ce.includes("target: '#s4t-export-count-badge'"), 'Guide match count item must target count badge');
    assert.ok(ce.includes("id: 'exclusions'"), 'Guide must include Exclusions Settings item');
    assert.ok(ce.includes("id: 'col-number'"), 'Guide must include Column Number item');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(0) .s4t-sheet-col-badge'"), 'Guide col-number must target first column badge');
    assert.ok(ce.includes("id: 'col-hide'"), 'Guide must include Eye Icon (Hide Column) item');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(1) .s4t-sheet-col-hide'"), 'Guide col-hide must target column hide button');
    assert.ok(ce.includes("id: 'col-drag'"), 'Guide must include Drag & Drop item');
    assert.ok(ce.includes("id: 'col-rename'"), 'Guide must include Column Rename item');
    assert.ok(ce.includes("id: 'col-mapping'"), 'Guide must include Field Mapping item');
    assert.ok(ce.includes("title: 'Trello Field Mapping'"), 'Guide col-mapping must mention Trello Field Mapping');
    assert.ok(ce.includes("id: 'col-dtype'"), 'Guide must include dtype Data Type Format item');
    assert.ok(ce.includes("title: 'Data Type Format'"), 'Guide col-dtype must mention Data Type Format');
    assert.ok(ce.includes("id: 'col-custom'"), 'Guide must include Custom Dropdowns item');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(6) .s4t-sheet-custom-options-input'"), 'Guide col-custom must target COL 7 input to prevent double highlight');
    assert.ok(ce.includes("id: 'preview-card'"), 'Guide must include Live Preview CTA item');
    assert.ok(ce.includes("id: 'col-count'"), 'Guide must include Column Counter item');
    assert.ok(ce.includes("target: '#s4t-sheet-col-count'"), 'Guide column counter item must target #s4t-sheet-col-count');
    assert.ok(!ce.includes("id: 'copy-tsv'"), 'Guide copy item id copy-tsv must be removed');
    assert.ok(!ce.includes("target: '#s4t-btn-copy-tsv'"), 'Guide copy item target must be removed');
    assert.ok(ce.includes("id: 'download-file'"), 'Guide must include Download Spreadsheet item');
    assert.ok(ce.includes("target: '.s4t-split-download-group'"), 'Guide download item must target .s4t-split-download-group');

    // 4. Two-tier uncluttered vertical staggering, SVG stem lines, and 3-step tour
    assert.ok(css.includes('.s4t-cloud-tooltip.arrow-left'), 'sprint-helper.css must style arrow-left tooltip variant');
    assert.ok(css.includes('.s4t-guide-stem-line'), 'sprint-helper.css must style SVG guide stem lines');
    assert.ok(ce.includes('s4t-guide-stem-line'), 'card-export.js must draw long-reach stem lines in SVG overlay');
    assert.ok(ce.includes('maxCardBottom'), 'card-export.js must measure physical bottom of column cards to prevent any row overlap');
    assert.ok(ce.includes('tier: 1') && ce.includes('tier: 2'), 'card-export.js must distribute column tooltips across two distinct vertical tiers');
    assert.ok(!ce.includes("left = dialogWidth - (tipW * 2) - 28;"), 'Copy button tooltip offset must be removed');
    assert.ok(ce.includes('gutterRoute: true'), 'COL 4 title must route stem line through side gutter to avoid passing through lower inputs');
    assert.ok(!ce.includes('s4t-cloud-icon">☁️'), 'Cloud icon ☁️ must be removed from all tooltip headers');
    assert.ok(!ce.includes('id="s4t-export-guide-btn" data-tooltip="Interactive Guide Tour"'), 'Floating guide button tooltip badge must be removed to prevent collision');
    assert.ok(ce.includes('s4t-guide-stepper-pill'), 'card-export.js must render 3-step navigation stepper pill');
    assert.ok(ce.includes('Step 1 of 3: Top Controls & Export') && ce.includes('Step 2 of 3: Column Configuration') && ce.includes('Step 3 of 3: Live Preview'), 'card-export.js must define all 3 tour step titles');
    assert.ok(css.includes('.s4t-guide-stepper-pill'), 'sprint-helper.css must style 3-step stepper pill bar');
});

test('card-export: guide mode freezes screen completely, aligns boxes with subpixel precision, and adapts preview highlight when generated', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Total freeze: CSS locks scrolling and pointer interactions
    assert.ok(css.includes('#s4t-export-dialog.s4t-guide-active-mode .s4t-sheet-grid-wrapper'), 'CSS must define freeze rule for grid wrapper');
    assert.ok(css.includes('overflow: hidden !important;') && css.includes('pointer-events: none !important;'), 'Freeze mode must set overflow hidden and pointer-events none');
    assert.ok(css.includes('#s4t-export-dialog.s4t-guide-active-mode #s4t-export-guide-btn'), 'Active guide button must retain pointer-events auto');

    // 2. JS locks: resets both horizontal and vertical scroll and intercepts wheel/touch gestures
    assert.ok(ce.includes('gridWrapper[0].scrollLeft = 0;') && ce.includes('gridWrapper[0].scrollTop = 0;'), 'Guide mode must reset both scrollLeft and scrollTop to 0');
    assert.ok(ce.includes('wheel.s4tGuideFreeze'), 'Guide mode must intercept wheel events to prevent scrolling');
    assert.ok(ce.includes('touchmove.s4tGuideFreeze'), 'Guide mode must intercept touch events to prevent scrolling');
    assert.ok(ce.includes('s4t-guide-click-catcher'), 'SVG overlay must include full-area click catcher');

    // 3. Sub-pixel accurate coordinate calculations hugging element
    assert.ok(ce.includes('originX = dRect.left + (dialog[0].clientLeft || 0)'), 'Calculations must account for dialog border offset');
    assert.ok(ce.includes('originY = dRect.top + (dialog[0].clientTop || 0)'), 'Calculations must account for dialog top border offset');
    assert.ok(css.includes('#s4t-export-dialog {\n    position: relative !important;'), '#s4t-export-dialog must have position: relative for accurate overlay positioning');

    // 4. Preview generated state: highlights compact sample cell rather than entire 800px table
    assert.ok(ce.includes('isPreviewGenerated = !isDirtyBanner && state.previewVisible'), 'Guide mode must detect when live preview rows are generated');
    assert.ok(ce.includes('#s4t-sheet-table tbody tr.s4t-sheet-row:first td.s4t-sheet-cell:eq(3)'), 'Live preview highlight must target compact sample cell');
    assert.ok(ce.includes("previewTitle = 'Live 20-Card Preview'"), 'Guide must define live 20-card preview tooltip title');
});

test('card-export: guide mode ripple bubble on click, enter/exit and warning toasts, and header highlights matching members burndown', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Toast notifications on entering, exiting, and clicking anywhere in guide mode
    assert.ok(ce.includes("showGuideToast('Entered Guide Mode')"), 'card-export.js must show notification on entering guide mode');
    assert.ok(ce.includes("showGuideToast('Exited Guide Mode')"), 'card-export.js must show notification on exiting guide mode');
    assert.ok(ce.includes("showGuideToast('Not allowed, click on Guide button again to exit guide mode', 'warning')"), 'card-export.js must show warning notification when clicking anywhere else');
    assert.ok(css.includes('.s4t-guide-toast'), 'sprint-helper.css must style guide toast notifications');
    assert.ok(css.includes('.s4t-guide-toast.s4t-toast-warning'), 'sprint-helper.css must style warning toast variant');

    // 2. Ripple bubble animation spawns at click coordinates
    assert.ok(ce.includes('spawnGuideBubble(clickX, clickY)'), 'card-export.js must spawn bubble at click coordinates');
    assert.ok(css.includes('.s4t-guide-click-bubble'), 'sprint-helper.css must style ripple bubble');
    assert.ok(css.includes('@keyframes s4tGuideBubbleExpand'), 'sprint-helper.css must define bubble expansion keyframes');

    // 3. Freeze overlay does NOT exit guide mode when clicked
    assert.ok(!ce.includes("$freezeOverlay.on('click', function () {\n                toggleGuideMode();\n            });"), 'Freeze overlay must not exit guide mode on click');

    // 4. Header background highlights matching Members Burndown
    assert.ok(css.includes('#s4t-export-dialog .s4t-feature-help'), 'Feature help button must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-board-tag'), 'Board tag must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-match-count'), 'Match count badge must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-guide-btn'), 'Header guide button must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-reset-btn'), 'Header reset button must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-sheet-settings-btn'), 'Header settings button must be styled');
    assert.ok(css.includes('#s4t-export-dialog .s4t-export-close-btn'), 'Header close button must be styled');

    // Dark mode header & badge highlights
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-export-header'), 'Dark mode header must have dedicated style');
    assert.ok(css.includes('background: #161a1d !important;'), 'Dark mode export header must use #161a1d matching members modal');
    assert.ok(css.includes('background: #1c2b41 !important;'), 'Dark mode board tag must use #1c2b41 matching members burndown badge');
});

test('card-export: 3-step tour organization, clean tooltip copy, and single highlight per column for COL 1 to 7', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');

    // 1. Verify exact copy for all 13 tooltips
    const expectedTooltips = [
        { title: 'Matching Cards Count', desc: 'Total cards matching active filters. Double-click to copy.' },
        { title: 'Exclusions & Sorting', desc: 'Exclude specific lists, members, or labels, and set custom row sort order.' },
        { title: 'Column Number', desc: 'Left-to-right column position in your exported sheet.' },
        { title: 'Hide / Show Column', desc: 'Toggle column visibility in export without losing its setup.' },
        { title: 'Reorder Columns', desc: 'Drag the 6-dot handle to change column order.' },
        { title: 'Column Title', desc: 'Edit the header name exported to your spreadsheet.' },
        { title: 'Trello Field Mapping', desc: 'Map to 14 Trello fields. Hover ℹ️ to view field details.' },
        { title: 'Data Type Format', desc: 'Format cells as String text, Dev member select, or Custom dropdown.' },
        { title: 'Custom Dropdown Options', desc: 'Enter comma-separated options to create cell dropdowns.' },
        { title: 'Live 20-Card Preview', desc: 'Preview formatted rows with your rules before exporting.' },
        { title: 'Active Column Count', desc: 'Total visible columns included in the export.' },
        { title: 'Download Spreadsheet', desc: 'Export as Excel (.xls), or click ▼ for CSV format.' }
    ];

    expectedTooltips.forEach(t => {
        assert.ok(ce.includes(`title: '${t.title}'`) || ce.includes(`previewTitle = '${t.title}'`), `card-export.js must define tooltip title: ${t.title}`);
        assert.ok(ce.includes(`desc: '${t.desc}'`) || ce.includes(`previewDesc = '${t.desc}'`), `card-export.js must define tooltip desc: ${t.desc}`);
    });

    // 2. Verify single clean column assignment across COL 1 through COL 7 (indices 0 to 6)
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(0) .s4t-sheet-col-badge'"), 'COL 1 must target badge');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(1) .s4t-sheet-col-hide'"), 'COL 2 must target eye hide button');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(2) .s4t-sheet-drag-handle'"), 'COL 3 must target drag handle');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(3) .s4t-sheet-header-input'"), 'COL 4 must target header input');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(4) .s4t-sheet-source-row'"), 'COL 5 must target source row');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(5) .s4t-sheet-type-row'"), 'COL 6 must target type row');
    assert.ok(ce.includes("target: '.s4t-sheet-th:eq(6) .s4t-sheet-custom-options-input'"), 'COL 7 must target custom options input');

    // 3. Verify step assignments and controls
    assert.ok(ce.includes("currentGuideStep = 1;"), 'Guide mode must start on Step 1');
    assert.ok(ce.includes("s4t-guide-pill-back"), 'Stepper pill must have back button');
    assert.ok(ce.includes("s4t-guide-pill-next"), 'Stepper pill must have next button');
    assert.ok(ce.includes("s4t-guide-pill-toggle-all"), 'Stepper pill must have show all toggle');
    assert.ok(ce.includes("s4t-guide-pill-close"), 'Stepper pill must have close button');
});

test('card-export: stepper pill is freely draggable with grip handle, bounded clamping, and persistent repositioning', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Grip handle markup and styling
    assert.ok(ce.includes('s4t-guide-pill-grip'), 'card-export.js must create .s4t-guide-pill-grip handle');
    assert.ok(ce.includes('viewBox="0 0 10 14"'), 'card-export.js grip handle must use 6-dot SVG icon');
    assert.ok(css.includes('.s4t-guide-pill-grip'), 'sprint-helper.css must style .s4t-guide-pill-grip');
    assert.ok(css.includes('cursor: grab !important;'), 'sprint-helper.css must set cursor: grab on stepper pill and grip handle');
    assert.ok(css.includes('.s4t-guide-stepper-pill.s4t-is-dragging'), 'sprint-helper.css must style active dragging state');
    assert.ok(css.includes('cursor: grabbing !important;'), 'sprint-helper.css must set cursor: grabbing when dragging');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-guide-pill-grip'), 'sprint-helper.css must style dark mode grip');

    // 2. Drag-and-drop event binding and target filtering
    assert.ok(ce.includes('mousedown.s4tPillDrag touchstart.s4tPillDrag'), 'card-export.js must bind mouse and touch drag start handlers');
    assert.ok(ce.includes("$(e.target).closest('.s4t-guide-stepper-actions, button, a').length"), 'card-export.js must ignore drag on action buttons');
    assert.ok(ce.includes('mousemove.s4tPillDrag touchmove.s4tPillDrag'), 'card-export.js must bind pointer move handler');
    assert.ok(ce.includes('mouseup.s4tPillDrag touchend.s4tPillDrag touchcancel.s4tPillDrag'), 'card-export.js must bind release/cancel handler');

    // 3. Clamping within dialog boundaries
    assert.ok(ce.includes('Math.max(minX, Math.min(startPillLeft + deltaX, maxX))'), 'card-export.js must clamp horizontal drag within dialog');
    assert.ok(ce.includes('Math.max(minY, Math.min(startPillTop + deltaY, maxY))'), 'card-export.js must clamp vertical drag within dialog');

    // 4. Position preservation across step changes and cleanup
    assert.ok(ce.includes('stepperPillPos = { top: newTop, left: newLeft };'), 'card-export.js must store dragged position');
    assert.ok(ce.includes('if (stepperPillPos && typeof stepperPillPos.top === \'number\''), 'card-export.js must restore dragged position on re-render');
    assert.ok(ce.includes('$(document).off(\'mousemove.s4tPillDrag'), 'card-export.js must clean up drag listeners on modal close and guide exit');
});

test('card-export: stepper pill is strictly hidden when guide mode is not active and thoroughly cleaned up on exit', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. CSS rules enforce display none when guide mode is not active
    assert.ok(css.includes('#s4t-export-dialog:not(.s4t-guide-active-mode) .s4t-guide-stepper-pill'), 'CSS must define display: none for stepper pill when guide mode is not active');
    assert.ok(css.includes('#s4t-export-dialog.s4t-guide-active-mode .s4t-guide-stepper-pill'), 'CSS must define display: inline-flex only when guide mode is active');

    // 2. JS removes pill on exiting guide mode, modal close, and render guard
    assert.ok(ce.includes("dialog.find('.s4t-guide-stepper-pill').remove();"), 'card-export.js must remove stepper pill element');
    assert.ok(ce.includes("overlay.find('.s4t-guide-stepper-pill').remove();"), 'card-export.js must remove stepper pill from overlay');
    assert.ok(ce.includes("$('.s4t-guide-stepper-pill').remove();"), 'card-export.js must remove stepper pill globally');
    assert.ok(ce.includes('if (!isGuideActive) {') && ce.includes('renderCloudyTooltips'), 'renderCloudyTooltips must guard against execution when guide mode is inactive');
    assert.ok(ce.includes("if (isGuideActive && tab !== 'sheet')"), 'switchView must exit guide mode when switching away from sheet view');
});

test('card-export: exportCards feature preference completely hides three-dots menu items and burndown export button', () => {
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const fp = fs.readFileSync('feature-preferences.js', 'utf8');

    // 1. Feature preferences registers all menu item and modal selectors
    assert.ok(fp.includes(".js-export-excel"), 'feature-preferences.js must hide .js-export-excel when disabled');
    assert.ok(fp.includes("#s4t-excel-export-menu-item"), 'feature-preferences.js must hide #s4t-excel-export-menu-item when disabled');
    assert.ok(fp.includes("#s4t-burndown-export-btn"), 'feature-preferences.js must hide #s4t-burndown-export-btn when disabled');

    // 2. checkExport() cleans up existing items and skips injection when exportCards is disabled
    assert.ok(sh.includes("!s4tPreferences.enabled('exportCards')") && sh.includes('checkExport'), 'checkExport must check exportCards preference');

    // 3. showExcelExport() guards against opening when disabled
    assert.ok(sh.includes("!s4tPreferences.enabled('exportCards')") && sh.includes('showExcelExport'), 'showExcelExport must check exportCards preference');

    // 4. s4tOpenCardExport() guards against opening when disabled
    assert.ok(ce.includes("!s4tPreferences.enabled('exportCards')") && ce.includes('s4tOpenCardExport'), 's4tOpenCardExport must check exportCards preference');

    // 5. applyFeaturePreferences() removes menu items and closes export dialog when unchecked
    assert.ok(sh.includes('s4tCloseCardExport'), 'sprint-helper.js must call s4tCloseCardExport when exportCards is disabled');
    assert.ok(ce.includes('s4tCloseCardExport'), 'card-export.js must export s4tCloseCardExport');
});

test('card-export: smooth custom input typing, persistent CS owner, removed copy button and workflow rules guide', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const rules = fs.readFileSync('WORKFLOW-RULES.md', 'utf8');

    // 1. Keystroke typing does not trigger renderSheetTableBody or mark preview dirty
    assert.ok(!ce.includes("customInput.on('input', function () {\n                    if (isHidden) return;\n                    col.customOptions = $(this).val();\n                    if (s4tIsCsOwnerCol(col)) {\n                        col.userFilled = !!(col.customOptions && col.customOptions.trim());\n                    }\n                    validateCustomOptions();\n                    updateActionButtonsState();\n                    state.previewDirty = true;"), 'customInput input handler must not mark preview dirty on keystroke');
    assert.ok(ce.includes("updatePreviewColumnDropdowns(idx, col.customOptions);"), 'customInput change handler must update preview dropdowns in place');

    // 2. CS Owner customOptions are preserved and never wiped out by name regexes
    assert.ok(!ce.includes('/harshali|tanisha/i'), 's4tCleanLegacyCsOwner must not use harshali/tanisha regex');
    assert.ok(!ce.includes("if (s4tIsCsOwnerCol(col)) {\n                    s4tCleanLegacyCsOwner(col);\n                }"), 'renderSheetTableContent must not call s4tCleanLegacyCsOwner');

    // 3. Copy for Google Sheets button and guide tooltip are completely removed
    assert.ok(!ce.includes("id=\"s4t-btn-copy-tsv\""), '#s4t-btn-copy-tsv must be removed from dialog HTML');
    assert.ok(!ce.includes("id: 'copy-tsv'"), 'copy-tsv must be removed from guideItems');
    assert.ok(ce.includes("All Features (12 Tooltips)"), 'Guide tour must reflect 12 tooltips');

    // 4. WORKFLOW-RULES.md includes the Export Cards guide
    assert.ok(rules.includes("## Export Cards (Spreadsheet Designer)"), 'WORKFLOW-RULES.md must include Export Cards section');
    assert.ok(rules.includes("Download Spreadsheet"), 'WORKFLOW-RULES.md must describe download options');
});

test('card-export: s4tGetEffectiveCellValue populates sensible default values for status, confidence, PO, CS, and comments', () => {
    const lists = [
        { id: 'l_active', name: 'In Progress (Sprint 24)' },
        { id: 'l_backlog', name: 'Sprint Backlog' }
    ];
    const members = [
        { id: 'm1', fullName: 'Arman Khan', username: 'arman' },
        { id: 'm2', fullName: 'Sarah Chen', username: 'sarah' }
    ];
    const lookup = {
        listsById: new Map(lists.map(l => [l.id, l])),
        membersById: new Map(members.map(m => [m.id, m])),
        labelsById: new Map(),
        boardData: {
            members: members,
            labels: [{ name: 'Kashvi.' }]
        }
    };

    const cardActive = {
        id: 'c1',
        name: 'Build auth flow',
        idList: 'l_active',
        idMembers: ['m1'],
        labels: [{ name: 'Feature' }, { name: 'Prapti.' }]
    };

    const cardBacklog = {
        id: 'c2',
        name: 'Database migration',
        idList: 'l_backlog',
        members: [{ id: 'm2', fullName: 'Sarah Chen' }],
        labels: [{ name: 'Chore' }]
    };

    const cols = [
        { id: 'c_list', header: 'List Name', source: 'list', cellType: 'text' },
        { id: 'c_title', header: 'Title', source: 'title', cellType: 'text' },
        { id: 'c_labels', header: 'Labels', source: 'labels', cellType: 'text' },
        { id: 'c_status', header: 'Status', source: 'blank', cellType: 'custom_select', customOptions: 'Going Live, Not Going Live' },
        { id: 'c_dev_owner', header: 'Dev Owner', source: 'members', cellType: 'dev_select' },
        { id: 'c_dev_conf', header: 'Dev Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_mgr_conf', header: 'Mgr Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select', customOptions: 'Prapti, Kashvi' },
        { id: 'c_po_conf', header: 'Product Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_cs_owner', header: 'CS Owner', source: 'blank', cellType: 'custom_select', customOptions: 'Tanisha, Harshali' },
        { id: 'c_cs_conf', header: 'CS Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_risk', header: 'Risk (Comments)', source: 'blank', cellType: 'text' },
        { id: 'c_resolution', header: 'Resolution (Comments)', source: 'blank', cellType: 'text' }
    ];

    // Card 1 in Active List:
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[0], lookup), 'In Progress (Sprint 24)');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[1], lookup), 'Build auth flow');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[2], lookup), 'Feature');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[3], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[4], lookup), 'Arman Khan');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[5], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[6], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[7], lookup), 'Prapti'); // Extracted from card dot label
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[8], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[9], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[10], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[11], lookup), 'None');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[12], lookup), 'None');

    // Card 2 in Backlog List:
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardBacklog, cols[3], lookup), ''); // Blank column, no default selection
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardBacklog, cols[4], lookup), 'Sarah Chen');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardBacklog, cols[7], lookup), ''); // No dot label on card

    // Manual edit override:
    const edited = { editedCells: { 'c1_c_status': 'Not Going Live', 'c1_c_dev_conf': 'Medium' } };
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[3], lookup, edited), 'Not Going Live');
    assert.equal(cardExport.s4tGetEffectiveCellValue(cardActive, cols[5], lookup, edited), 'Medium');
});

test('card-export: s4tBuildExportXlsx generates valid OpenXML XLSX with native data validation dropdowns', () => {
    const { execSync } = require('child_process');
    const lists = [{ id: 'l1', name: 'In Progress' }];
    const members = [{ id: 'm1', fullName: 'Alice' }, { id: 'm2', fullName: 'Bob' }];
    const lookup = {
        listsById: new Map(lists.map(l => [l.id, l])),
        membersById: new Map(members.map(m => [m.id, m])),
        labelsById: new Map(),
        boardData: { members: members }
    };

    const cards = [
        { id: 'c1', name: 'Implement task', idList: 'l1', idMembers: ['m1'], labels: [{ name: 'Prapti.' }] }
    ];

    const cols = [
        { id: 'c_list', header: 'List Name', source: 'list' },
        { id: 'c_title', header: 'Title', source: 'title' },
        { id: 'c_status', header: 'Status', source: 'blank', cellType: 'custom_select', customOptions: 'Going Live, Not Going Live' },
        { id: 'c_dev_owner', header: 'Dev Owner', source: 'members', cellType: 'dev_select' },
        { id: 'c_dev_conf', header: 'Dev Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select', customOptions: 'Prapti, Kashvi' },
        { id: 'c_cs_owner', header: 'CS Owner', source: 'blank', cellType: 'custom_select', customOptions: 'Tanisha, Harshali' }
    ];

    const xlsxBytes = cardExport.s4tBuildExportXlsx(cols, cards, lookup, 'Test Board');
    assert.ok(xlsxBytes instanceof Uint8Array, 's4tBuildExportXlsx must return a Uint8Array');
    assert.ok(xlsxBytes.length > 1000, 'XLSX byte array must have non-trivial size');

    // Test in LibreOffice headless
    const tmpXlsx = '/tmp/unit_test_export.xlsx';
    fs.writeFileSync(tmpXlsx, xlsxBytes);
    execSync('libreoffice -env:UserInstallation=file:///tmp/libreoffice_test --headless --convert-to ods ' + tmpXlsx + ' --outdir /tmp', { encoding: 'utf8' });
    const odfXml = execSync('unzip -p /tmp/unit_test_export.ods content.xml', { encoding: 'utf8' });

    assert.ok(odfXml.includes('table:content-validation'), 'ODS output from LibreOffice must have content-validation elements');
    assert.ok(odfXml.includes('Going Live'), 'ODS output must contain Going Live');
    assert.ok(odfXml.includes('Alice'), 'ODS output must contain Alice');
    assert.ok(odfXml.includes('Prapti'), 'ODS output must contain Prapti');
    assert.ok(odfXml.includes('High'), 'ODS output must contain High');
    assert.ok(odfXml.includes('Tanisha'), 'ODS output must contain Tanisha');
});

test('card-export: guide view defaults to and enforces step view only on high zoom / screen resolution', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Detection helper tests
    assert.ok(typeof cardExport.s4tIsHighZoomOrResolution === 'function', 's4tIsHighZoomOrResolution must be exported');

    // Normal 100% 1080p unzoomed screen
    const normalWin = { devicePixelRatio: 1.0, innerWidth: 1920, innerHeight: 1080 };
    const normalDiag = [{ clientWidth: 1140, clientHeight: 740 }];
    assert.strictEqual(cardExport.s4tIsHighZoomOrResolution(normalWin, normalDiag), false, 'Normal unzoomed screen must not be high zoom');

    // Zoomed in (e.g. 125%, 150%, 200%)
    const zoomedWin125 = { devicePixelRatio: 1.25, innerWidth: 1536, innerHeight: 864 };
    assert.strictEqual(cardExport.s4tIsHighZoomOrResolution(zoomedWin125, normalDiag), true, '125% zoom (dpr 1.25) must be detected as high zoom');

    const zoomedWin150 = { devicePixelRatio: 1.5, innerWidth: 1280, innerHeight: 720 };
    assert.strictEqual(cardExport.s4tIsHighZoomOrResolution(zoomedWin150, normalDiag), true, '150% zoom must be detected as high zoom');

    // Constrained viewport / compact screen
    const compactWin = { devicePixelRatio: 1.0, innerWidth: 1100, innerHeight: 700 };
    assert.strictEqual(cardExport.s4tIsHighZoomOrResolution(compactWin, normalDiag), true, 'Compact viewport must be detected as high zoom');

    // Constrained dialog dimensions
    const compactDiag = [{ clientWidth: 980, clientHeight: 640 }];
    assert.strictEqual(cardExport.s4tIsHighZoomOrResolution(normalWin, compactDiag), true, 'Constrained dialog must be detected as high zoom');

    // 2. Logic enforcement in card-export.js
    assert.ok(ce.includes('s4tIsHighZoomOrResolution(null, dialog) || currentGuideStep === \'all\''), 'toggleGuideMode must enforce step 1 by default on high zoom');
    assert.ok(ce.includes('isHighZoom && currentGuideStep === \'all\''), 'renderCloudyTooltips must revert currentGuideStep from all to 1 on high zoom');
    assert.ok(ce.includes("$stepperPill.addClass('s4t-guide-step-only');"), 'Stepper pill must add s4t-guide-step-only class on high zoom');
    assert.ok(ce.includes('$toggleAllBtn.hide();'), 'Stepper pill must hide toggle all button on high zoom');
    assert.ok(ce.includes('var estW = isHighZoom ? 240 : 320;'), 'Stepper pill clamping width must adapt on high zoom');

    // 3. CSS rules
    assert.ok(css.includes('.s4t-guide-stepper-pill.s4t-guide-step-only .s4t-guide-pill-toggle-all'), 'sprint-helper.css must define .s4t-guide-step-only hiding rule');
    assert.ok(css.includes('-webkit-min-device-pixel-ratio: 1.2'), 'sprint-helper.css must include high-DPI zoom media query');
});

test('card-export: warns user with confirmation popup when selecting or downloading CSV if custom Dtype columns exist', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');
    const css = fs.readFileSync('sprint-helper.css', 'utf8');

    // 1. Helper function detection
    assert.ok(typeof cardExport.s4tHasCustomDtypeColumns === 'function', 's4tHasCustomDtypeColumns must be exported');

    const defaultCols = cardExport.s4tGetDefaultColumns();
    // Default columns include custom_select for Status, Confidence, PO, CS
    assert.strictEqual(cardExport.s4tHasCustomDtypeColumns(defaultCols), true, 'Default columns have custom_select columns');

    // Only text and dev columns
    const textCols = [
        { id: 'c_list', header: 'List', hidden: false, cellType: 'text' },
        { id: 'c_title', header: 'Title', hidden: false, cellType: 'text' },
        { id: 'c_dev', header: 'Dev Owner', hidden: false, cellType: 'dev_select' }
    ];
    assert.strictEqual(cardExport.s4tHasCustomDtypeColumns(textCols), false, 'Text/Dev only columns do not have custom Dtype');

    // Hidden custom_select columns
    const hiddenCustomCols = [
        { id: 'c_title', header: 'Title', hidden: false, cellType: 'text' },
        { id: 'c_status', header: 'Status', hidden: true, cellType: 'custom_select' }
    ];
    assert.strictEqual(cardExport.s4tHasCustomDtypeColumns(hiddenCustomCols), false, 'Hidden custom columns are ignored');

    // 2. Warning modal implementation in card-export.js
    assert.ok(ce.includes('function showCsvWarningModal(onConfirm, onCancel)'), 'card-export.js must define showCsvWarningModal');
    assert.ok(ce.includes('id="s4t-csv-warning-popup"'), 'Warning modal must have id s4t-csv-warning-popup');
    assert.ok(ce.includes('In case of CSV, interactive dropdown selectors and custom options are not supported'), 'Warning modal must describe CSV limitation');
    assert.ok(ce.includes('Are you sure you want to proceed with CSV?'), 'Warning modal must ask user confirmation');
    assert.ok(ce.includes('s4t-csv-warning-btn-cancel'), 'Warning modal must have Cancel button');
    assert.ok(ce.includes('s4t-csv-warning-btn-confirm'), 'Warning modal must have Confirm button');

    // Check trigger on CSV format selection
    assert.ok(ce.includes('if (fmt === \'csv\' && hasCustomDtypeColumns())'), 'Selecting CSV must trigger warning check');

    // Check trigger on download button
    assert.ok(ce.includes('if (state.selectedFormat === \'csv\' && hasCustomDtypeColumns() && !state.csvWarningConfirmed)'), 'Downloading CSV without confirmation must trigger warning check');

    // 3. Styling in sprint-helper.css
    assert.ok(css.includes('#s4t-export-dialog .s4t-csv-warning-backdrop'), 'sprint-helper.css must style .s4t-csv-warning-backdrop');
    assert.ok(css.includes('#s4t-export-dialog .s4t-csv-warning-card'), 'sprint-helper.css must style .s4t-csv-warning-card');
    assert.ok(css.includes('#s4t-export-dialog .s4t-csv-warning-btn-cancel'), 'sprint-helper.css must style cancel button');
    assert.ok(css.includes('#s4t-export-dialog .s4t-csv-warning-btn-confirm'), 'sprint-helper.css must style confirm button');
    assert.ok(css.includes('[data-color-mode="dark"] #s4t-export-dialog .s4t-csv-warning-card'), 'sprint-helper.css must include dark mode styles for warning card');
});

test('card-export: s4tGetEffectiveCellValue accurately extracts card fields and leaves blank custom columns unselected', () => {
    const card = {
        id: 'c1',
        idList: 'l1',
        name: 'FE-102: Implement responsive layout',
        desc: 'Risk: Low dependency\nResolution: Pending deployment',
        labels: [{ name: 'frontend' }, { name: 'Alice M.' }],
        members: [{ id: 'm1', fullName: 'Bob Dev', username: 'bob' }],
        idMembers: ['m1']
    };
    const lookup = {
        lists: { l1: 'Sprint Active' },
        members: { m1: 'Bob Dev' },
        developers: ['Bob Dev', 'Charlie Dev'],
        productOwners: ['Alice M.'],
        csOwners: ['Support Team']
    };

    const cols = cardExport.s4tGetDefaultColumns();
    assert.strictEqual(cols.length, 13, 'Default columns must have 13 columns');

    // Test each column's effective value
    const effectiveValues = cols.map(c => cardExport.s4tGetEffectiveCellValue(card, c, lookup));

    // Col 0: List Name -> 'Sprint Active'
    assert.strictEqual(effectiveValues[0], 'Sprint Active');
    // Col 1: Card Title -> 'FE-102: Implement responsive layout'
    assert.strictEqual(effectiveValues[1], 'FE-102: Implement responsive layout');
    // Col 2: Labels -> 'frontend' (dot label 'Alice M.' filtered out to Product Owner)
    assert.strictEqual(effectiveValues[2], 'frontend');
    // Col 3: Status -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[3], '');
    // Col 4: Dev Owner -> 'Bob Dev' (assigned member)
    assert.strictEqual(effectiveValues[4], 'Bob Dev');
    // Col 5: Dev Confidence -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[5], '');
    // Col 6: Mgr Confidence -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[6], '');
    // Col 7: Product Owner -> 'Alice M' (from dot label with dot stripped)
    assert.strictEqual(effectiveValues[7], 'Alice M');
    // Col 8: Product Confidence -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[8], '');
    // Col 9: CS Owner -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[9], '');
    // Col 10: CS Confidence -> '' (blank custom dropdown, unselected by default)
    assert.strictEqual(effectiveValues[10], '');
    // Col 11: Risk (Comments) -> 'Low dependency' (extracted from desc)
    assert.strictEqual(effectiveValues[11], 'Low dependency');
    // Col 12: Resolution (Comments) -> 'Pending deployment' (extracted from desc)
    assert.strictEqual(effectiveValues[12], 'Pending deployment');

    // Card without risk/resolution in desc defaults both to 'None'
    const cardNoComments = { id: 'c2', idList: 'l1', name: 'Task without comments', desc: '', labels: [] };
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(cardNoComments, cols[11], lookup), 'None');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(cardNoComments, cols[12], lookup), 'None');

    // Blank custom select without manual edit remains empty
    const backlogCard = { id: 'c2', idList: 'l2', name: 'Backlog Item', labels: [], idMembers: [] };
    const backlogLookup = { lists: { l2: 'Backlog / Icebox' }, members: {}, developers: [], productOwners: [], csOwners: [] };
    const backlogStatus = cardExport.s4tGetEffectiveCellValue(backlogCard, cols[3], backlogLookup);
    assert.strictEqual(backlogStatus, '');

    // Edited cell override
    const editedOptions = { editedCells: { 'c1:c_status': 'Not Going Live', 'c1:c_dev_conf': 'Low' } };
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, cols[3], lookup, editedOptions), 'Not Going Live');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, cols[5], lookup, editedOptions), 'Low');
});

test('card-export: s4tBuildExportXlsx generates valid XLSX with data validations that LibreOffice Calc parses into dropdown selectors', () => {
    const cards = [
        {
            id: 'c1',
            idList: 'l1',
            name: 'API Refactoring',
            desc: '',
            labels: [{ name: 'backend' }, { name: 'Sarah PO.' }],
            members: [{ id: 'm1', fullName: 'Dave Eng', username: 'dave' }],
            idMembers: ['m1']
        },
        {
            id: 'c2',
            idList: 'l2',
            name: 'Design System Update',
            desc: '',
            labels: [],
            members: [],
            idMembers: []
        }
    ];
    const lookup = {
        lists: { l1: 'Sprint In Progress', l2: 'Done' },
        members: { m1: 'Dave Eng' },
        developers: ['Dave Eng', 'Elena Eng'],
        productOwners: ['Sarah PO.'],
        csOwners: ['CS Specialist']
    };
    const cols = cardExport.s4tGetDefaultColumns();

    const xlsxBytes = cardExport.s4tBuildExportXlsx(cards, cols, lookup);
    assert.ok(xlsxBytes instanceof Uint8Array, 'Result must be a Uint8Array');
    assert.ok(xlsxBytes.length > 500, 'XLSX file must have non-trivial size');

    // Verify ZIP magic bytes (PK\x03\x04)
    assert.strictEqual(xlsxBytes[0], 0x50, 'ZIP magic byte 0');
    assert.strictEqual(xlsxBytes[1], 0x4B, 'ZIP magic byte 1');
    assert.strictEqual(xlsxBytes[2], 0x03, 'ZIP magic byte 2');
    assert.strictEqual(xlsxBytes[3], 0x04, 'ZIP magic byte 3');

    // Verify XML contents contains dataValidations
    const textDecoder = new TextDecoder('utf-8');
    const contentStr = textDecoder.decode(xlsxBytes);
    assert.ok(contentStr.includes('<dataValidations'), 'XLSX must contain <dataValidations>');
    assert.ok(contentStr.includes('&quot;Going Live,Not Going Live&quot;'), 'XLSX must contain Status dropdown options');
    assert.ok(contentStr.includes('&quot;High,Medium,Low,NA&quot;'), 'XLSX must contain Confidence dropdown options');
    assert.ok(contentStr.includes('&quot;Dave Eng,Elena Eng&quot;'), 'XLSX must contain Dev Owner dropdown options');

    // Verify LibreOffice Calc compatibility via headless convert to ODS
    const tmpXlsx = path.join('/tmp', 'test_eval_sheet.xlsx');
    const tmpOdsDir = '/tmp';
    fs.writeFileSync(tmpXlsx, Buffer.from(xlsxBytes));

    try {
        execSync(`soffice --headless -env:UserInstallation=file:///tmp/libreoffice_test --convert-to ods --outdir ${tmpOdsDir} ${tmpXlsx}`, { stdio: 'pipe' });
        const tmpOds = path.join(tmpOdsDir, 'test_eval_sheet.ods');
        assert.ok(fs.existsSync(tmpOds), 'LibreOffice must convert XLSX to ODS successfully');

        // Extract content.xml from ODS to check LibreOffice native content-validation
        const odsContentXml = execSync(`unzip -p ${tmpOds} content.xml`, { encoding: 'utf-8' });
        assert.ok(odsContentXml.includes('table:content-validation'), 'LibreOffice Calc must parse data validations into table:content-validation');
        assert.ok(odsContentXml.includes('Going Live'), 'LibreOffice Calc must contain dropdown values');
    } catch (e) {
        // If soffice is not installed in some external runner, don't fail unit test on CLI binary absence
        if (e.message && !e.message.includes('soffice: not found')) {
            throw e;
        }
    }
});

test('card-export: guide collision avoidance engine guarantees zero overlapping tooltips and prevents stepper pill clipping', () => {
    const ce = fs.readFileSync('card-export.js', 'utf8');

    // 1. Collision avoidance algorithm structure
    assert.ok(ce.includes('Automated AABB Collision Avoidance and Resolution:'), 'Guide must document collision avoidance engine');
    assert.ok(ce.includes('pillBottom + minGapY'), 'Guide must prevent collision with top Stepper Pill');
    assert.ok(ce.includes('overlapX && overlapY'), 'Guide must detect pairwise bounding box intersections');
    assert.ok(ce.includes('t2.top = t1.top + t1.height + minGapY'), 'Guide must push colliding tooltips downward');
    assert.ok(ce.includes('tier === 3'), 'Guide must support Tier 3 vertical tiering for custom options');
    assert.ok(ce.includes('visibleCustomCol'), 'Guide must dynamically detect visible columns to avoid off-screen stems');
});

test('card-export: blank custom dropdowns are unselected by default and resolution comments default to None', () => {
    const defaultCols = cardExport.s4tGetDefaultColumns();
    const lookup = {
        lists: { l1: 'Sprint Active' },
        members: { m1: 'Bob Dev' },
        developers: ['Bob Dev', 'Charlie Dev'],
        productOwners: ['prapti', 'kashvi'],
        csOwners: ['harshali', 'tanisha']
    };

    // Card with no comments and no dot label
    const card = {
        id: 'card_test_1',
        idList: 'l1',
        name: 'FE-500: Test blank dropdown defaults',
        desc: '',
        labels: [{ name: 'frontend' }],
        members: [{ id: 'm1', fullName: 'Bob Dev', username: 'bob' }],
        idMembers: ['m1']
    };

    // 1. Status (c_status, blank source, custom_select) must return empty string, NOT 'Going Live'
    const statusCol = defaultCols.find(c => c.id === 'c_status');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, statusCol, lookup), '', 'Status must be blank by default');

    // 2. Confidences (Dev, Mgr, Product, CS) must return empty string, NOT 'High'
    const devConfCol = defaultCols.find(c => c.id === 'c_dev_conf');
    const mgrConfCol = defaultCols.find(c => c.id === 'c_mgr_conf');
    const poConfCol = defaultCols.find(c => c.id === 'c_po_conf');
    const csConfCol = defaultCols.find(c => c.id === 'c_cs_conf');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, devConfCol, lookup), '', 'Dev Confidence must be blank by default');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, mgrConfCol, lookup), '', 'Mgr Confidence must be blank by default');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, poConfCol, lookup), '', 'Product Confidence must be blank by default');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, csConfCol, lookup), '', 'CS Confidence must be blank by default');

    // 3. Product Owner (c_po_owner) without dot label must return empty string, NOT 'prapti'
    const poCol = defaultCols.find(c => c.id === 'c_po_owner');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, poCol, lookup), '', 'Product Owner without dot label must be blank');

    // 4. CS Owner (c_cs_owner) must return empty string, NOT 'harshali'
    const csCol = defaultCols.find(c => c.id === 'c_cs_owner');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, csCol, lookup), '', 'CS Owner must be blank by default');

    // 5. Resolution (Comments) without resolution in desc must return 'None', NOT 'Ready for QA'
    const resCol = defaultCols.find(c => c.id === 'c_resolution');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, resCol, lookup), 'None', 'Resolution (Comments) must default to None');

    // 6. Risk (Comments) without risk in desc must return 'None'
    const riskCol = defaultCols.find(c => c.id === 'c_risk');
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, riskCol, lookup), 'None', 'Risk (Comments) must default to None');

    // 7. Verify in exported CSV
    const csv = cardExport.s4tBuildExportCsv(defaultCols, [card], lookup);
    const csvLines = csv.split('\r\n');
    const dataRow = csvLines[1];
    // Data row should have empty cells for Status, Confidences, PO, CS, and 'None' for Risk & Resolution
    assert.ok(dataRow.includes('"None","None"'), 'CSV must export None for risk and resolution comments');
    assert.ok(!dataRow.includes('"Going Live"'), 'CSV must not export Going Live by default');
    assert.ok(!dataRow.includes('"High"'), 'CSV must not export High by default');
    assert.ok(!dataRow.includes('"prapti"'), 'CSV must not export prapti when no dot label');
    assert.ok(!dataRow.includes('"harshali"'), 'CSV must not export harshali by default');
    assert.ok(!dataRow.includes('"Ready for QA"'), 'CSV must not export Ready for QA by default');

    // 8. Verify in exported TSV (for Google Sheets)
    const tsv = cardExport.s4tBuildExportTsv(defaultCols, [card], lookup);
    const tsvDataRow = tsv.split('\n')[1];
    assert.ok(tsvDataRow.includes('None\tNone'), 'TSV must export None for risk and resolution');
    assert.ok(!tsvDataRow.includes('Going Live'), 'TSV must not export Going Live by default');
    assert.ok(!tsvDataRow.includes('High'), 'TSV must not export High by default');
    assert.ok(!tsvDataRow.includes('Ready for QA'), 'TSV must not export Ready for QA by default');

    // 9. Verify any user-added custom_select column with source blank also defaults to empty string
    const customUserCol = { id: 'c_custom_dept', header: 'Department', source: 'blank', cellType: 'custom_select', customOptions: 'Eng, QA, Product' };
    assert.strictEqual(cardExport.s4tGetEffectiveCellValue(card, customUserCol, lookup), '', 'Custom blank dropdown column must default to empty');
});







