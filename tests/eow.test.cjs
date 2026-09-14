const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync('sprint-helper.js','utf8'),source=fs.readFileSync('eow-update.js','utf8');
const ctx=vm.createContext({});
vm.runInContext(main.slice(main.indexOf('function parsePoints('),main.indexOf('// Helper: Check if card title')),ctx);
vm.runInContext(main.slice(main.indexOf('/* Attention filters use their own class')),ctx);
vm.runInContext(source,ctx);
const week=ctx.s4tEowWeek('2026-09-13');
const board={members:[{id:'a'},{id:'b'}],lists:[{id:'todo',name:'Todo'},{id:'bug',name:'Bugs'}],cards:[]};
const card=(extra={})=>({id:'task',name:'(2.5) Task',idMembers:['a'],idList:'todo',dateLastActivity:'2026-09-10T12:00:00',labels:[],...extra});
test('week normalizes Sunday to Monday with exclusive next-Monday boundary',()=>{
 assert.equal(week.iso,'2026-09-07'); assert.equal(week.end.getDate(),14);
});
test('EOW matches dates, excludes shared and ignored cards, categorizes labels',()=>{
 const input={...board,cards:[card({labels:[{name:'HOTFIX'}]}),card({id:'old',dateLastActivity:'2020-01-01'}),card({name:'Template Card'}),card({idMembers:['a','b']}),card({idList:'bug'}),card({idMembers:['b']}),card({closed:true})]};
 const result=ctx.s4tEowCategories(input,'a',week,['bug']);
 assert.equal(result.fallback,false); assert.equal(result.categories.flatMap(c=>c.cards).length,1);
 assert.equal(result.categories[1].cards[0].title,'Task'); assert.equal(result.categories[1].cards[0].points,2.5);
});
test('empty week never falls back to other cards',()=>{
 const result=ctx.s4tEowCategories({...board,cards:[card({dateLastActivity:'2020-01-01'}),card({idList:'bug'})]},'a',week,['bug']);
 assert.equal(result.fallback,false); assert.equal(result.categories.flatMap(c=>c.cards).length,0);
});
test('card creation can match week and Hotfix label has priority',()=>{
 const id=Math.floor(new Date('2026-09-09T12:00:00').getTime()/1000).toString(16)+'0000000000000000';
 const result=ctx.s4tEowCategories({...board,cards:[card({id,due:'2020-01-01',labels:[{name:'Hotfix Release'}]})]},'a',week,[]);
 assert.equal(result.fallback,false); assert.equal(result.categories[1].cards.length,1);
});
test('Slack output supports each points mode without floating point noise',()=>{
 const draft={heading:'EOW Update',dateRange:'7 – 11 Sep',mode:'both',categories:[{name:'Features',cards:[{title:'A',points:.1},{title:'B',points:.2}]}]};
 assert.ok(ctx.s4tEowText(draft).includes('FEATURES - [0.3]')); assert.ok(ctx.s4tEowText(draft).includes('• A [0.1]'));
 draft.mode='none'; assert.ok(!ctx.s4tEowText(draft).includes('['));
 draft.mode='category_sum'; assert.ok(!ctx.s4tEowText(draft).includes('A ['));
 draft.mode='title_only'; assert.ok(!ctx.s4tEowText(draft).includes('FEATURES - ['));
});

test('five default categories follow team labels and title suffixes',()=>{
 const cards=[card({name:'UI/UX polish'}),card({name:'Client request',labels:[{name:'CLIENT REQUESTS'}]}),card({name:'Fix query',labels:[{name:'bug'}],idList:'bug'}),card({name:'hotfix urgent',labels:[{name:'urgent'}]}),card({name:'Patch UI',labels:[{name:'Hotfix'}]}),card({name:'Pipeline #dev-ops'}),card({name:'Infra devOps (3)'}),card({name:'Release deployment (2)'}),card({name:'Client request without label'}),card({name:'Critical issue',labels:[{name:'CRITICAL'}]})];
 const groups=ctx.s4tEowCategories({...board,cards},'a',week,[]).categories;
 assert.deepEqual(Array.from(groups,g=>g.name),['STABILIZATION','HOTFIX','FEATURES','DEV-OPS','RELEASE TASKS']);
 assert.deepEqual(Array.from(groups,g=>g.cards.length),[1,1,2,2,4]);
 assert.ok(groups[4].cards.some(c=>c.title==='Release deployment'));
 assert.ok(groups[4].cards.some(c=>c.title==='Client request without label'));
 assert.ok(!ctx.s4tEowText({heading:'EOW',dateRange:'week',mode:'both',categories:groups}).includes('VIT/VIL'));
});

test('multi-board merge deduplicates IDs, retains distinct same-title cards and uses strict week dates',()=>{
 const first={...board,name:'Old release',cards:[card({id:'same'}),card({id:'one',name:'Same title'}),card({id:'old',dateLastActivity:'2020-01-01'})]};
 const second={...board,name:'New release',cards:[card({id:'same'}),card({id:'two',name:'Same title'}),card({id:'archived',closed:true})]};
 const merged=ctx.s4tEowMergeBoards([first,second]);
 assert.equal(merged.cards.length,5);
 const result=ctx.s4tEowCategories(merged,'a',week,[]);
 assert.equal(result.categories.flatMap(c=>c.cards).length,4);
 const empty=ctx.s4tEowCategories(merged,'a',ctx.s4tEowWeek('2022-01-03'),[]);
 assert.equal(empty.categories.flatMap(c=>c.cards).length,0);
 assert.equal(empty.fallback,false);
});
test('shared cards are excluded per source board before memberships are merged',()=>{
 const merged=ctx.s4tEowMergeBoards([{...board,name:'First',cards:[card({idMembers:['a','b']})]},{members:[{id:'c'}],lists:[],cards:[],name:'Second'}]);
 assert.equal(merged.cards.length,0);
});

test('release inference covers 14–16 September on the 16 September board',()=>{
 const current={name:'30sep2026release',idOrganization:'team'};
 const boards=[{id:'old',name:'02sep2026release',idOrganization:'team'},{id:'previous',name:'16sep2026release',idOrganization:'team'},{id:'wrong-team',name:'16sep2026release',idOrganization:'other'},{id:'wrong-series',name:'16sep2026OtherRelease',idOrganization:'team'}];
 const result=ctx.s4tEowPreviousReleases(current,boards,ctx.s4tEowWeek('2026-09-14'));
 assert.equal(result.error,'');assert.equal(result.releases.length,1);assert.equal(result.releases[0].id,'previous');
 assert.equal(result.releases[0].start.getDate(),14);assert.equal(result.releases[0].end.getDate(),17);
 assert.equal(ctx.s4tEowPreviousReleases(current,boards,ctx.s4tEowWeek('2026-09-21')).releases.length,0);
 assert.ok(ctx.s4tEowPreviousReleases(current,boards.concat({...boards[1],id:'duplicate'}),ctx.s4tEowWeek('2026-09-14')).error);
});
test('release parser rejects invalid dates and requires an explicit year',()=>{
 assert.equal(ctx.s4tEowReleaseName('31Feb2026Release'),null);
 assert.equal(ctx.s4tEowReleaseName('16SepRelease'),null);
 assert.equal(ctx.s4tEowReleaseName('16 September 2026 Release').date.getDate(),16);
});

test('week selection allows only current and previous weeks across month boundaries',()=>{
 assert.equal(ctx.s4tEowWeekAllowed('2026-09-13','2026-09-13'),true);
 assert.equal(ctx.s4tEowWeekAllowed('2026-08-31','2026-09-13'),true);
 assert.equal(ctx.s4tEowWeekAllowed('2026-08-30','2026-09-13'),false);
 assert.equal(ctx.s4tEowWeekAllowed('2026-09-14','2026-09-13'),false);
});
