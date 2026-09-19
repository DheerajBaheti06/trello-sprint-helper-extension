const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = vm.createContext({});
const main = fs.readFileSync(__dirname + '/sprint-helper.js', 'utf8');
vm.runInContext(main.slice(main.indexOf('function parsePoints('), main.indexOf('// Helper: Check if card title')), context);
vm.runInContext(main.slice(main.indexOf('/* Attention filters use their own class')), context);
const card = (overrides = {}) => ({name: 'Build feature', desc: '', idMembers: ['member'], idList: 'todo', ...overrides});
const checklist = (name, states) => ({name, checkItems: states.map(state => ({state}))});
const issues = (overrides, lists = [], names = []) => context.s4tAttentionIssues(card(overrides), lists, names);

test('missing scope checks whitespace, not description length', () => {
    assert.equal(issues({desc: ' \n\t '}).scope, true);
    assert.equal(issues({desc: 'Scope'}).scope, false);
});
test('unestimated requires a member; zero and fractional estimates are valid', () => {
    assert.equal(issues({}).estimate, true);
    assert.equal(issues({idMembers: []}).estimate, false);
    for (const name of ['(0) Task', '(0.5) Task', '(3 pts) Task', '(1/3) Task']) {
        assert.equal(issues({name}).estimate, false, name);
    }
    for (const name of ['(?) Task', '{2} Task', 'Task']) {
        assert.equal(issues({name}).estimate, true, name);
    }
});
test('unassigned matches only memberless cards, independently of estimates', () => {
    for (const idMembers of [[], undefined]) {
        for (const name of ['Task', '(3) Task']) {
            const c = card({idMembers, name});
            const flags = issues({idMembers, name});
            assert.equal(flags.unassigned, true);
            assert.equal(flags.estimate, false);
            assert.equal(context.s4tAttentionMatches(c, flags, ['unassigned'], [], [], []), true);
            assert.equal(context.s4tAttentionMatches(c, flags, ['unassigned'], [], ['member'], []), false);
            assert.equal(context.s4tAttentionMatches(c, flags, ['unassigned'], [], ['__none__'], []), true);
        }
    }
    assert.equal(issues({idMembers: ['member']}).unassigned, false);
});
test('missing completed points distinguishes absent values from zero and fractional values', () => {
    for (const name of ['Task', '(3) Task', '[?] Task']) {
        const flags = issues({name});
        assert.equal(flags.missingCompleted, true, name);
        assert.equal(context.s4tAttentionMatches(card({name}), flags, ['missingCompleted'], [], [], []), true);
    }
    for (const name of ['[0] Task', '{0} Task', '(0/3) Task', '[0.5] Task', '{2} Task', '(1/3) Task']) {
        const flags = issues({name});
        assert.equal(flags.missingCompleted, false, name);
        assert.equal(context.s4tAttentionMatches(card({name}), flags, ['missingCompleted'], [], [], []), false);
    }
});
test('completion spans all checklists; empty checklists are not completed work', () => {
    const mixed = issues({}, [checklist('Dev', ['complete']), checklist('QA', ['incomplete'])]);
    assert.equal(mixed.incomplete, true);
    assert.equal(mixed.complete, false);
    assert.equal(issues({}, [checklist('QA', ['complete', 'complete'])]).complete, true);
    for (const lists of [[], [checklist('Empty', [])]]) {
        assert.equal(issues({}, lists).complete, false);
        assert.equal(issues({}, lists).incomplete, false);
    }
});
test('required names are case insensitive, deduplicated, and match whole checklist names', () => {
    const names = context.s4tAttentionNames(' Development \nTESTING\n\n testing ');
    assert.deepEqual(Array.from(names), ['development', 'testing']);
    assert.equal(issues({}, [checklist('development', []), checklist(' Testing ', [])], names).missing, false);
    assert.equal(issues({}, [checklist('Development', [])], names).missing, true);
    assert.equal(issues({}, [checklist('Development extended', []), checklist('Testing', [])], names).missing, true);
    assert.equal(issues({}).missing, true);
    assert.equal(issues({}, [checklist('Anything', [])]).missing, false);
});
test('any selected issue matches, but list exclusions always win', () => {
    const c = card({desc: 'Present', name: '(3) Task'});
    const flags = context.s4tAttentionIssues(c, [], []);
    assert.equal(context.s4tAttentionMatches(c, flags, ['scope', 'missing'], []), true);
    assert.equal(context.s4tAttentionMatches(c, flags, ['scope', 'estimate'], []), false);
    assert.equal(context.s4tAttentionMatches(c, flags, ['missing'], ['todo']), false);
    assert.equal(context.s4tAttentionMatches(c, flags, [], ['todo']), false);
    assert.equal(context.s4tAttentionMatches(c, flags, [], []), true);
    assert.equal(context.s4tAttentionMatches({...c, closed: true}, flags, [], []), false);
});

test('opening a card retains board identity; switching boards uses the new board', () => {
    const routing = vm.createContext({board: 'original', window: {location: {pathname: '/c/card123/task'}}, getBoardShortLink: () => ''});
    vm.runInContext(main.slice(main.indexOf('    function currentBoard()'), main.indexOf('    function saveFilters()')), routing);
    assert.equal(routing.currentBoard(), 'original');
    routing.window.location.pathname = '/b/another/board';
    assert.equal(routing.currentBoard(), 'another');
});

test('member and label filters use OR within a column and AND across columns', () => {
    const c = card({idMembers: ['alex', 'sam'], idLabels: ['bug', 'urgent']});
    const match = (members, labels) => context.s4tAttentionMatches(c, {scope: true}, ['scope'], [], members, labels);
    assert.equal(match(['alex', 'other'], ['bug']), true);
    assert.equal(match(['other'], ['bug']), false);
    assert.equal(match(['sam'], ['feature']), false);
    assert.equal(match([], ['urgent', 'feature']), true);
    assert.equal(match(['sam'], []), true);
    assert.equal(context.s4tAttentionMatches(c, {scope:true}, ['scope'], ['todo'], ['alex'], ['bug']), false);
});

test('native filter import resolves IDs, names, quoted labels and unnamed colors', () => {
    const board = {members:[{id:'m1',username:'alex',fullName:'Alex One'},{id:'m2',username:'sam'}],labels:[{id:'l1',name:'High Priority',color:'red'},{id:'l2',name:'',color:'blue'}]};
    const result = context.s4tReadNativeFilters('member:alex,member:m2,label:"High Priority",label:blue,mode:and',board);
    assert.deepEqual(Array.from(result.members), ['m1','m2']);
    assert.deepEqual(Array.from(result.labels), ['l1','l2']);
    assert.equal(result.matchAll,true);
    assert.equal(result.unresolved.length,0);
    const unknown = context.s4tReadNativeFilters('member:missing,due:week',board);
    assert.equal(unknown.unresolved.length,1);
    assert.equal(unknown.other.length,1);
});
test('imported exact match and empty member/label filters retain native semantics', () => {
    const c = card({idMembers:['alex'],idLabels:[]});
    assert.equal(context.s4tAttentionMatches(c,{},[],[],['alex','sam'],[],true),false);
    assert.equal(context.s4tAttentionMatches(c,{},[],[],['alex'],['__none__'],true),true);
    assert.equal(context.s4tAttentionMatches(c,{},[],[],['__none__'],[],false),false);
});

test('Hotfix filters use assigned labels and local due dates, including completed dates', () => {
    const labels = [{id: 'hot', name: 'HOTFIX'}, {id: 'bug', name: 'Bug'}];
    const today = new Date(2026, 8, 10, 12);
    const flags = (overrides = {}) => context.s4tAttentionIssues(card({idLabels: ['hot'], ...overrides}), [], [], labels, today);
    assert.equal(flags().hotfix, true);
    assert.equal(flags().hotfixDue, false);
    assert.equal(flags().hotfixToday, false);
    assert.equal(flags({due: new Date(2026, 8, 10, 0).toISOString()}).hotfixToday, true);
    assert.equal(flags({due: new Date(2026, 8, 10, 23, 59).toISOString(), dueComplete: true}).hotfixToday, true);
    for (const day of [9, 11]) {
        const result = flags({due: new Date(2026, 8, day, 12).toISOString()});
        assert.equal(result.hotfixToday, false);
        assert.equal(result.hotfixDue, true);
    }
    assert.equal(flags({due: 'invalid'}).hotfixDue, false);
    assert.equal(flags({idLabels: ['bug'], name: 'Hotfix title', due: today.toISOString()}).hotfix, false);
    assert.equal(flags({idLabels: []}).hotfix, false);
    for (const name of ['Hot fix', 'Hot-fix', 'Production Hotfix']) {
        assert.equal(context.s4tAttentionIssues(card({idLabels: ['hot']}), [], [], [{id:'hot', name}], today).hotfix, true);
    }
});

test('Cards List excludes the reported housekeeping cards even without every board member', () => {
    const cards = [
        {id:'template', shortLink:'asMy0RMf', name:'Template card', idMembers:['a']},
        {id:'release', shortLink:'3DtkgH4w', name:'Release', idMembers:['a']},
        {id:'shared', shortLink:'shared', name:'Shared', idMembers:['a','b']},
        {id:'work', shortLink:'work', name:'Release task', idMembers:['a']},
        {id:'unassigned', shortLink:'unassigned', name:'Unassigned task', idMembers:[]}
    ];
    const fixture = vm.createContext({
        s4tIsCommonCard: context.s4tIsCommonCard,
        boardData: {cards, members:[{id:'a',fullName:'Alex'},{id:'b',fullName:'Sam'}]},
        context: {attentionIds: () => cards.map(c => c.id)},
        state: {search:'',excludedCardIds:new Set(),format:'both',selection:{ids:cards.map(c => c.id)}}
    });
    vm.runInContext(main.slice(main.indexOf('function s4tGroupCards('), main.indexOf('/* Cards List:')), fixture);
    const start = main.indexOf('    function selectedCards()');
    vm.runInContext(main.slice(start, main.indexOf('    function changedSelection(', start)), fixture);
    assert.equal(fixture.candidates().map(c => c.id).join(','), 'work,unassigned');
    const message = fixture.generateMissingEstimatesSlackText();
    assert.equal(message.includes('asMy0RMf'), false);
    assert.equal(message.includes('3DtkgH4w'), false);
    assert.equal(message.includes('Release task'), true);
});

test('member select-all supports partial selection, none, and restoring everyone', () => {
    const ids = ['alex', 'sam'];
    const toggle = (current, id, checked) => Array.from(context.s4tToggleMembers(current, id, checked, ids, false));
    const partial = toggle([], 'alex', false);
    assert.deepEqual(partial, ['sam', '__none__']);
    assert.deepEqual(toggle(partial, 'alex', true), []);
    assert.deepEqual(toggle(['alex'], 'alex', false), ['__empty__']);
    assert.deepEqual(toggle(['__empty__'], 'sam', true), ['sam']);
    for (const idMembers of [[], ['alex'], ['sam']]) {
        assert.equal(context.s4tAttentionMatches(card({idMembers}), {}, [], [], ['__empty__'], []), false);
        assert.equal(context.s4tAttentionMatches(card({idMembers}), {}, [], [], [], []), true);
    }
});


test('standalone Cards List evaluates native member and label filters across the full board', () => {
    const board = {members:[{id:'a',username:'alex'},{id:'b',username:'sam'}],labels:[{id:'bug',name:'Bug'}],cards:[
        card({id:'match',shortLink:'match',idMembers:['a'],idLabels:['bug']}),
        card({id:'other',shortLink:'other',idMembers:['b'],idLabels:['bug']}),
        card({id:'noLabel',shortLink:'noLabel',idMembers:['a'],idLabels:[]})
    ]};
    const selection = context.s4tCardsNativeSelection(board, 'member:alex,label:bug', []);
    assert.deepEqual(Array.from(selection.ids), ['match']);
    assert.equal(selection.limited, false);
    const fallback = context.s4tCardsNativeSelection(board, 'due:week', ['other']);
    assert.deepEqual(Array.from(fallback.ids), ['other']);
    assert.equal(fallback.limited, true);
    assert.equal(context.s4tCardsNativeSelection(board, 'member:unknown', []).ids.length, 0);
});

function switchFixture({query = 'member:alex', imported, directClear = false, save = true} = {}) {
    const events = [];
    let nativeActive = true;
    const location = {pathname:'/b/board123/project',search:'?view=board&filter=' + encodeURIComponent(query),href:'https://trello.com/b/board123/project?view=board&filter=' + encodeURIComponent(query) + '#section',assign(url) { events.push(['navigate', url]); }};
    const fixture = vm.createContext({
        URL, KeyboardEvent: function() {}, setTimeout: callback => callback(),
        switching:false, panel:null, board:'board123', data:{},
        memberFilters:[], labelFilters:[], matchAll:false, observedNativeQuery:location.search,
        nativeFiltersActive:() => nativeActive,
        currentBoard:() => 'board123', nativePopover:() => ({}),
        readNativeSnapshot:() => imported || ({members:['alex'],labels:['bug'],other:[],unresolved:[],matchAll:false}),
        saveFilters() { events.push(['save', ...fixture.memberFilters, ...fixture.labelFilters]); return save; },
        renderPeopleAndLabels() {}, apply() {}, clearNativeFilterControls: async () => {},
        nativeClearButton:() => ({click() { events.push(['clear']); if(directClear) nativeActive=false; }}),
        notice:message => events.push(['notice', message]),
        document:{querySelector:() => null,activeElement:null,dispatchEvent() {}},
        window:{location,confirm:() => { throw new Error('Unexpected confirmation'); }}
    });
    const start = main.indexOf('    async function switchToAttention(callback)');
    vm.runInContext(main.slice(start, main.indexOf('    // Capture the switch', start)), fixture);
    return {fixture, events};
}

test('Use Attention saves imports before direct native clearing', async () => {
    const {fixture, events} = switchFixture({directClear:true});
    await fixture.switchToAttention(() => events.push(['callback']));
    assert.equal(events.some(e => e[0] === 'notice'), false);
    assert.equal(events[0][0], 'save');
    assert.equal(events[1][0], 'clear');
    assert.equal(events.some(e => e[0] === 'navigate'), false);
    assert.deepEqual(Array.from(fixture.memberFilters), ['alex']);
    assert.equal(fixture.switching, false);
});

test('Use Attention never reloads or applies pending selections if native clearing fails', async () => {
    const {fixture, events} = switchFixture();
    await fixture.switchToAttention(() => events.push(['callback']));
    assert.equal(events.some(e => e[0] === 'navigate' || e[0] === 'callback'), false);
    assert.ok(events.some(e => e[0] === 'notice' && e[1].includes('still active')));
    assert.deepEqual(Array.from(fixture.memberFilters), ['alex']);
});

test('Use Attention handles due-only native filters without confirmation', async () => {
    const {fixture, events} = switchFixture({query:'due:week',directClear:true,imported:{members:[],labels:[],other:['due:week'],unresolved:[],matchAll:false}});
    await fixture.switchToAttention(() => events.push(['callback']));
    assert.ok(events.some(e => e[0] === 'clear'));
    assert.ok(events.some(e => e[0] === 'callback'));
});

test('Use Attention leaves Trello unchanged on unresolved selections or save failure', async () => {
    for (const options of [{save:false}, {imported:{members:[],labels:[],other:[],unresolved:['member:unknown'],matchAll:false}}]) {
        const {fixture, events} = switchFixture(options);
        await fixture.switchToAttention(() => events.push(['callback']));
        assert.equal(events.some(e => ['clear','navigate','callback'].includes(e[0])), false);
        assert.equal(fixture.switching, false);
    }
});

test('missing checklists accepts multiple comma/newline names and finds any missing name', () => {
    const names = context.s4tAttentionNames(' Development, QA  Testing\nREVIEW, development ');
    assert.deepEqual(Array.from(names), ['development', 'qa testing', 'review']);
    const all = [checklist('DEVELOPMENT', []), checklist(' QA Testing ', []), checklist('Review', [])];
    assert.equal(issues({}, all, names).missing, false);
    for (let omitted = 0; omitted < 3; omitted++) {
        assert.equal(issues({}, all.filter((_, i) => i !== omitted), names).missing, true);
    }
    assert.equal(issues({}, [], names).missing, true);
    assert.equal(issues({}, [checklist('Development extended', []), ...all.slice(1)], names).missing, true);
});

test('checklist matching uses card checklist IDs when checklist idCard is absent', () => {
    const c = card({id:'card',idChecklists:['dev','qa']});
    const lists = [{id:'dev',...checklist('Development',[])},{id:'qa',...checklist('QA',[])},{id:'other',idCard:'elsewhere',...checklist('Review',[])}];
    const map = context.s4tAttentionChecklistMap([c], lists);
    assert.equal(context.s4tAttentionIssues(c, map.card, ['development','qa']).missing, false);
    assert.equal(context.s4tAttentionIssues(c, map.card, ['development','qa','review']).missing, true);
});


test('shared housekeeping cards are excluded from matching and counted results', () => {
    for (const c of [card({name:'(8) Template Card'}), card({name:'RELEASE [3]'}), card({name:'Renamed',shortLink:'asMy0RMf'}),card({name:'Renamed',shortLink:'3DtkgH4w'})]) {
        assert.equal(context.s4tIsCommonCard(c), true);
        assert.equal(context.s4tAttentionMatches(c,{},[],[],[],[]), false);
    }
    assert.equal(context.s4tIsCommonCard(card({name:'Release bug fix'})), false);
    assert.equal(context.s4tIsCommonCard(card({name:'Build template card editor'})), false);
});

test('Members Burndown omits shared cards from points and card counts', () => {
    const start = main.indexOf('function isReleaseCard(');
    const end = main.indexOf('\nfunction ', main.indexOf('function computeBurndownFromBoardData(') + 10);
    vm.runInContext(main.slice(start, end), context);
    const result = context.computeBurndownFromBoardData({name:'Test board',members:[{id:'member',fullName:'Alex'}],lists:[{id:'todo',name:'Todo'}],cards:[
        card({name:'(100) Template Card'}), card({name:'(50) Release'}), card({name:'(3) Actual work'})
    ]});
    assert.equal(result.team.assigned, 3);
    assert.equal(result.team.remaining, 3);
    assert.equal(result.team.cardsTotal, 1);
    assert.equal(result.members[0].remaining, 3);
});

test('an empty native popup with a Clear button is not an active filter', () => {
    const fixture = vm.createContext({URLSearchParams,
        window:{location:{search:'?filter=mode:and'}},
        nativePopover:() => ({querySelectorAll: selector => selector.includes('checkbox') ? [{checked:false,getAttribute:()=>null}] : [{value:''}]}),
        nativeClearButton:() => ({})
    });
    const start = main.indexOf('    function nativeFiltersActive(ignoreUrl)');
    vm.runInContext(main.slice(start, main.indexOf('    async function clearNativeFilterControls',start)), fixture);
    assert.equal(fixture.nativeFiltersActive(), false);
    fixture.window.location.search='?filter=member:alex';
    assert.equal(fixture.nativeFiltersActive(), true);
});

test('native clearing unchecks controls and dispatches text input changes without navigation', async () => {
    const events=[];
    class Input {
        constructor() { this.current='urgent'; }
        get value() { return this.current; }
        set value(v) { this.current=v; }
        dispatchEvent(e) { events.push(e.type); }
    }
    const input=new Input();
    const checkbox={checked:true,getAttribute:()=>null,getClientRects:()=>[{}],click(){this.checked=false;events.push('unchecked');}};
    const fixture=vm.createContext({HTMLInputElement:Input,Event:class {constructor(type){this.type=type;}},
        nativePopover:()=>({querySelectorAll:selector=>selector.includes(':checked') ? (checkbox.checked ? [checkbox] : []) : [input]}),
        nativeClearButton:()=>null
    });
    const start=main.indexOf('    async function clearNativeFilterControls');
    vm.runInContext(main.slice(start,main.indexOf('    function notice(message)',start)),fixture);
    await fixture.clearNativeFilterControls(async()=>{});
    assert.equal(checkbox.checked,false);
    assert.equal(input.value,'');
    assert.deepEqual(events,['unchecked','input','change']);
});


test('Attention cache reuses results and invalidates on filters, names, board refresh, and local date', () => {
    const evaluate = context.s4tCreateAttentionEvaluator();
    const today = new Date(2026,8,10,12);
    const board = {cards:[card({id:'a',shortLink:'a',idChecklists:[],idLabels:['hot'],due:today.toISOString()})],checklists:[],labels:[{id:'hot',name:'Hotfix'}]};
    const options = {required:'',selected:['hotfixToday'],excluded:[],members:[],labels:[],matchAll:false};
    const first = evaluate(board, options, today);
    assert.equal(first.count,1);
    assert.equal(evaluate(board, options, today), first);
    assert.equal(evaluate(board, {...options,members:['other']}, today).count,0);
    assert.notEqual(evaluate(board, {...options,required:'QA'}, today), first);
    assert.equal(evaluate(board, options, new Date(2026,8,11,12)).count,0);
    const refreshed = {...board,cards:[{...board.cards[0],closed:true}]};
    assert.equal(evaluate(refreshed, options, today).count,0);
});

test('cached Attention results equal uncached results across filter combinations', () => {
    const evaluate = context.s4tCreateAttentionEvaluator();
    const board = {cards:[card({id:'a',shortLink:'a',idChecklists:['dev']}),card({id:'b',shortLink:'b',idChecklists:[],idMembers:[],desc:'Scope'})],checklists:[{id:'dev',...checklist('Dev',['complete'])}],labels:[]};
    const map = context.s4tAttentionChecklistMap(board.cards,board.checklists);
    for (const selected of [[],['missing'],['scope','complete'],['incomplete'],['estimate']]) {
        const options={selected,required:'Dev, QA',excluded:[],members:[],labels:[],matchAll:false};
        const expected=board.cards.filter(c=>context.s4tAttentionMatches(c,context.s4tAttentionIssues(c,map[c.id],context.s4tAttentionNames(options.required)),selected,[],[],[])).map(c=>c.id);
        assert.deepEqual(Array.from(evaluate(board,options).ids),expected);
    }
});

test('Check all skips checked items and changes only the selected checklist', async () => {
    const selected=[false,true,false], other=[false,false], calls=[];
    await context.s4tCompleteChecklist({count:selected.length,valid:()=>true,checked:i=>selected[i],check:async i=>{calls.push(i);selected[i]=true;}});
    assert.deepEqual(selected,[true,true,true]);
    assert.deepEqual(other,[false,false]);
    assert.deepEqual(calls,[0,2]);
});
test('Check all stops immediately on navigation or an unsuccessful item', async () => {
    let calls=0;
    await assert.rejects(context.s4tCompleteChecklist({count:3,valid:()=>false,checked:()=>false,check:async()=>calls++}));
    assert.equal(calls,0);
    await assert.rejects(context.s4tCompleteChecklist({count:3,valid:()=>true,checked:()=>false,check:async()=>calls++}));
    assert.equal(calls,1);
});

test('comment search is case-insensitive and finds every substring occurrence', () => {
    const hits = context.s4tCommentSearchSpans('Branches, branch and BRANCHES', 'BrAnCh');
    assert.equal(hits.length, 3);
    assert.equal(context.s4tCommentSearchSpans('Paragraph with Tech Design details', 'tech design').length, 1);
    assert.equal(context.s4tCommentSearchSpans('Any arbitrary text', 'arbitrary').length, 1);
});
test('comment search recognizes the branch typo and treats regex symbols literally', () => {
    assert.equal(context.s4tCommentSearchSpans('Branches and BRANCH', 'brach').length, 2);
    assert.equal(context.s4tCommentSearchSpans('branches', 'braches').length, 1);
    assert.equal(context.s4tCommentSearchSpans('Release [v2].* notes', '[v2].*').length, 1);
    assert.equal(context.s4tCommentSearchSpans('Release v222 notes', '[v2].*').length, 0);
    assert.equal(context.s4tCommentSearchSpans('Tech\n  Design', 'tech design').length, 1);
    assert.equal(context.s4tCommentSearchSpans('Anything', '').length, 0);
});

test('card modal with checklists and filter text is never mistaken for active native filters', () => {
    const cardModal = {
        closest: selector => (selector.includes('card-back') || selector.includes('window')) ? true : null,
        getClientRects: () => [{}],
        getAttribute: () => 'filter activity and details',
        textContent: 'filter activity and details'
    };
    const fixture = vm.createContext({
        URLSearchParams,
        Array,
        document: {
            querySelector: () => null,
            querySelectorAll: () => [cardModal]
        },
        window: { location: { search: '' } },
        outsideAttention: node => !node.closest('.window, [data-testid="card-back"]'),
        nativeClearButton: () => null
    });
    const start = main.indexOf('    function nativePopover()');
    vm.runInContext(main.slice(start, main.indexOf('    async function clearNativeFilterControls', start)), fixture);
    assert.equal(fixture.nativePopover(), undefined);
    assert.equal(fixture.nativeFiltersActive(), false);
});

test('currentBoard extracts board ID from board header link on direct /c/ visits', () => {
    const doc = {
        querySelector: sel => ({
            getAttribute: attr => attr === 'href' ? '/b/headerBoard123/board-title' : null
        })
    };
    const routing = vm.createContext({
        board: null,
        document: doc,
        window: { location: { pathname: '/c/card123/task' } },
        getBoardShortLink: () => ''
    });
    vm.runInContext(main.slice(main.indexOf('    function currentBoard()'), main.indexOf('    function saveFilters()')), routing);
    assert.equal(routing.currentBoard(), 'headerBoard123');
});

test('labels start with all checked and support partial, none, and restoring all', () => {
    const toggle = (values, id, checked) => Array.from(context.s4tToggleLabels(values, id, checked, ['hotfix', 'feature'], false));
    assert.deepEqual(toggle([], 'hotfix', false), ['feature', '__none__']);
    assert.deepEqual(toggle(['feature', '__none__'], 'hotfix', true), []);
    assert.deepEqual(toggle(['hotfix'], 'hotfix', false), ['__empty__']);
    assert.deepEqual(toggle(['__empty__'], 'feature', true), ['feature']);
    const matches = (idLabels, filters) => context.s4tAttentionMatches(card({idLabels}), {}, [], [], [], filters);
    assert.equal(matches([], []), true);
    assert.equal(matches(['feature'], []), true);
    assert.equal(matches(['hotfix'], ['__empty__']), false);
    assert.equal(matches([], ['__none__']), true);
    assert.equal(matches(['hotfix'], ['feature', '__none__']), false);
});

test('native exact-match checkbox alone does not count as an active criterion', () => {
    const fixture = vm.createContext({URLSearchParams,
        window:{location:{search:''}},
        nativePopover:()=>({querySelectorAll:selector=>selector.includes('checkbox') ? [{checked:true,getAttribute:()=>null,textContent:'Exact match'}] : []}),
        nativeClearButton:()=>({})
    });
    const start=main.indexOf('    function nativeFiltersActive(ignoreUrl)');
    vm.runInContext(main.slice(start,main.indexOf('    async function clearNativeFilterControls',start)),fixture);
    assert.equal(fixture.nativeFiltersActive(),false);
    fixture.window.location.search='?filter=member:alex';
    assert.equal(fixture.nativeFiltersActive(),true);
    assert.equal(fixture.nativeFiltersActive(true),false);
});

 test('sprint summary preserves fractional hours and separates card and hours progress', () => {
    const fixture = vm.createContext({});
    vm.runInContext(main.slice(main.indexOf('function s4tSprintSummary('), main.indexOf('function s4tRefreshIcon(')), fixture);
    const result = fixture.s4tSprintSummary({assigned:276.35, completed:176.6, remaining:99.75, cardsTotal:115, cardsCompleted:53});
    assert.equal(result.completed, '176.6');
    assert.equal(result.remaining, '99.75');
    assert.equal(result.total, '276.35');
    assert.equal(result.cards, '53 / 115');
    assert.equal(result.cardRate, '46.09');
    assert.equal(result.progress, '63.9');
    const empty = fixture.s4tSprintSummary({});
    assert.equal(empty.progress, '0');
    assert.equal(empty.cardRate, '0');
});

test('Not Sure exclusion updates member points and progress without changing team totals', () => {
    vm.runInContext(main.slice(main.indexOf('function renderMembersHtml('), main.indexOf('function s4tSprintSummary(')), context);
    const result = context.computeBurndownFromBoardData({name:'Sprint',members:[{id:'member',fullName:'Alex'}],lists:[{id:'todo',name:'Todo'},{id:'maybe',name:'Alex - nOt SuRe'}],cards:[card({name:'(5) {2} Work'}),card({name:'(2.5) {1.5} Optional',idList:'maybe'})]});
    assert.equal(result.members[0].notSureAssigned,2.5);
    assert.equal(result.members[0].notSureCompleted,1.5);
    const original=JSON.stringify(result);
    const filtered=context.renderMembersHtml(result.members,true);
    assert.match(filtered,/>5 assigned</);
    assert.match(filtered,/✓ 2 done</);
    assert.match(filtered,/>3 remaining</);
    assert.match(filtered,/width:40%/);
    assert.match(filtered,/1 cards \(0 done, 1 pending\)/);
    assert.equal(result.team.cardsTotal,2);
    const unfiltered=context.renderMembersHtml(result.members,false);
    assert.match(unfiltered,/>7.5 assigned</);
    assert.match(unfiltered,/✓ 3.5 done</);
    assert.match(unfiltered,/>4 remaining</);
    assert.match(unfiltered,/2 cards \(0 done, 2 pending\)/);
    assert.equal(result.team.assigned,7.5);
    assert.equal(JSON.stringify(result),original);
    const allExcluded=context.renderMembersHtml([{...result.members[0],notSureAssigned:7.5,notSureCompleted:3.5}],true);
    assert.match(allExcluded,/>0 assigned</);
    assert.match(allExcluded,/✓ 0 done</);
    assert.match(allExcluded,/>0 remaining</);
    assert.match(allExcluded,/width:0%/);
});

test('Not Sure card counts include completed and unestimated cards', () => {
    const result = context.computeBurndownFromBoardData({name:'Sprint',members:[{id:'member',fullName:'Alex'}],lists:[{id:'todo',name:'Todo'},{id:'maybe',name:'Not Sure'}],cards:[card({name:'Keep',dueComplete:true}),card({name:'Optional',idList:'maybe'}),card({name:'Completed optional',idList:'maybe',dueComplete:true})]});
    const filtered=context.renderMembersHtml(result.members,true);
    assert.match(filtered,/1 cards \(1 done, 0 pending\)/);
    assert.match(filtered,/width:100%/);
    assert.match(context.renderMembersHtml(result.members,false),/3 cards \(2 done, 1 pending\)/);
    assert.equal(result.team.cardsTotal,3);
    assert.equal(result.team.cardsCompleted,2);
});

test('list choices depend on assigned cards, never list names', () => {
    const board = {lists:[{id:'personal',name:'Alex Todo'},{id:'shared',name:'done-closed'},
        {id:'empty',name:'Alex Not Sure'},{id:'archived',name:'Archived',closed:true}], cards:[
        card({idList:'personal',idMembers:['b']}), card({idList:'shared',idMembers:['a']}),
        card({idList:'empty',idMembers:['a'],closed:true}), card({idList:'archived',idMembers:['a']})]};
    const ids = (members, all=false) => Array.from(context.s4tAttentionMemberLists(board,members,all), list=>list.id);
    assert.deepEqual(ids(['a']), ['shared']);
    assert.deepEqual(ids(['b']), ['personal']);
    assert.deepEqual(ids(['a','b']), ['personal','shared']);
    assert.deepEqual(ids(['a','b'],true), []);
    assert.deepEqual(ids(['__empty__']), []);
    assert.deepEqual(ids(['__none__']), []);
    assert.deepEqual(ids([]), ['personal','shared']);
    board.cards.push(card({idList:'empty',idMembers:[]}));
    assert.deepEqual(ids(['__none__']), ['empty']);
    board.cards.push(card({idList:'shared',idMembers:['a','b']}));
    assert.deepEqual(ids(['a','b'],true), ['shared']);
});

test('points mismatch requires both values and matches either direction', () => {
    for (const name of ['(4/3) Task','(1/3) Task','(0) [0.5] Task','(2.5) {3} Task','(4.4) When Access rights are saved it gets saved but its giving an error messaged - Site Admin [4]','(1) [0] Task']) assert.equal(issues({name}).pointsMismatch,true,name);
    for (const name of ['(3/3) Task','(0) [0] Task','[3] Task','(3) Task','Task','(?) [4] Task']) assert.equal(issues({name}).pointsMismatch,false,name);
});
test('required comments match H1-H3 headings, not prose, code, or H4', () => {
    const headings = context.s4tCommentHeadings('# TECH Design\n## **Test Cases:**\n### Branch ###\n#### Other\nTech Design in prose\n```md\n# Fake\n```\n> # Quoted');
    assert.deepEqual(Array.from(headings), ['tech design','test cases','branch']);
    const c = card({s4tCommentHeadings:headings});
    const check = names => context.s4tAttentionIssues(c,[],[],[],new Date(),names).missingComments;
    assert.equal(check(['tech design','TEST CASES','Branch']),false);
    assert.equal(check(['Tech Design','Other']),true);
    assert.equal(check([]),false);
    assert.equal(context.s4tAttentionIssues(card(),[],[],[],new Date(),['Branch']).missingComments,false);
});
test('comment loader paginates and merges headings from separate comments', async () => {
    const cards = [card({id:'a'})], calls=[];
    await context.s4tLoadAttentionComments(cards, async (id,before) => {
        calls.push([id,before]);
        return before ? [{id:'old',data:{text:'### Branch'}}] : Array.from({length:1000},(_,i)=>({id:'p'+i,data:{text:i===0?'# Tech Design\n## Test Cases':'ordinary comment'}}));
    },()=>true);
    assert.deepEqual(calls,[['a',undefined],['a','p999']]);
    assert.deepEqual(Array.from(cards[0].s4tCommentHeadings),['tech design','test cases','branch']);
});
test('comment failures and cancelled requests are never treated as loaded empty comments', async () => {
    const cards=[card({id:'a'})];
    await assert.rejects(context.s4tLoadAttentionComments(cards,async()=>({}),()=>true),/Invalid comment/);
    assert.equal(cards[0].s4tCommentHeadings,undefined);
    await context.s4tLoadAttentionComments(cards,async()=>{throw Error('must not fetch')},()=>false);
    assert.equal(cards[0].s4tCommentHeadings,undefined);
});

test('points mismatch understands leading-decimal values used by card badges', () => {
    for (const name of ['(.5) [.75] Task','(.75) [.5] Task','(.25/.1) Task','(0) {.5} Task']) assert.equal(issues({name}).pointsMismatch,true,name);
    for (const name of ['(.5) [.5] Task']) assert.equal(issues({name}).pointsMismatch,false,name);
});
test('comment cache skips empty and unchanged cards and reloads edited cards', async () => {
    const cache = new Map(), cards = [card({id:'a',dateLastActivity:'v1',badges:{comments:1}}),card({id:'b',badges:{comments:0}})];
    let calls=0;
    const fetch = async()=>{calls++;return [{id:'comment',data:{text:'# Branch'}}]};
    await context.s4tLoadAttentionComments(cards,fetch,()=>true,cache);
    assert.equal(calls,1);
    assert.deepEqual(Array.from(cards[1].s4tCommentHeadings),[]);
    const fresh=cards.map(c=>({...c,s4tCommentHeadings:undefined}));
    await context.s4tLoadAttentionComments(fresh,fetch,()=>true,cache);
    assert.equal(calls,1);
    assert.deepEqual(Array.from(fresh[0].s4tCommentHeadings),['branch']);
    fresh[0].dateLastActivity='v2';
    await context.s4tLoadAttentionComments(fresh,fetch,()=>true,cache);
    assert.equal(calls,2);
});
