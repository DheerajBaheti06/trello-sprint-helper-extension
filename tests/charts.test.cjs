const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync('sprint-helper.js','utf8'),ctx=vm.createContext({});
vm.runInContext(main.slice(main.indexOf('function parsePoints('),main.indexOf('// Helper: Check if card title'))+main.slice(main.indexOf('function s4tIsCommonCard('),main.indexOf('function s4tIsCommonCardElement('))+fs.readFileSync('charts.js','utf8'),ctx);
const board={members:[{id:'a',fullName:'Alex'},{id:'b',fullName:'Blair'},{id:'c',fullName:'Chris'}],lists:[{id:'todo',name:'Todo'},{id:'unsure',name:'Alex Not Sure'}],cards:[
{id:'1',name:'(4) Work',idList:'todo',idMembers:['a','b'],labels:[{id:'hot',name:'Hotfix'},{id:'ui',name:'UI'}]},
{id:'2',name:'(2) Work',idList:'unsure',idMembers:['a'],labels:[]},
{id:'3',name:'(3) Release',idList:'todo',idMembers:['a']},
{id:'4',name:'(8) Shared',idList:'todo',idMembers:['a','b','c']},
{id:'5',name:'No estimate',idList:'todo',idMembers:[],labels:[]}
]};
test('pie data counts per-member points and per-label cards with shared exclusions',()=>{const data=ctx.s4tChartData(board,false);assert.deepEqual(Array.from(data.dev,e=>[e.name,e.value]),[['Alex',6],['Blair',4]]);assert.deepEqual(Array.from(data.labels,e=>[e.name,e.value]),[['No labels',2],['Hotfix',1],['UI',1]]);});
test('Not Sure filtering applies to both pies; empty board is valid',()=>{const data=ctx.s4tChartData(board,true);assert.equal(data.dev[0].value,4);assert.equal(data.labels.find(l=>l.name==='No labels').value,1);assert.equal(ctx.s4tChartData({},false).dev.length,0);});
test('label colors use board metadata, retain variants, and fall back to card labels',()=>{
const sample={labels:[{id:'hot',name:'Hotfix',color:'red_dark'}],cards:[{name:'Work',labels:[{id:'hot',color:'blue'},{id:'ui',name:'UI',color:'green_light'}]}]};
const data=ctx.s4tChartData(sample,false);assert.equal(data.labels.find(l=>l.id==='hot').color,'red_dark');assert.equal(data.labels.find(l=>l.id==='ui').color,'green_light');assert.match(ctx.s4tChartLabelColor('red_dark'),/red-bolder/);assert.match(ctx.s4tChartLabelColor('green_light'),/green-subtler/);assert.equal(ctx.s4tChartLabelColor(null),'#8590a2');
});
test('copy formats developer points and label card counts with percentages',()=>{
assert.equal(ctx.s4tChartCopyText(board,true,'dev'),'Alex — 4 points\nBlair — 4 points');
const copied=ctx.s4tChartCopyText(board,true,'labels');assert.match(copied,/Hotfix — 1 cards · 33\.3%/);assert.doesNotMatch(copied,/points/);assert.equal(ctx.s4tChartCopyText({},false,'labels'),'');
});
test('copy templates select and reorder all supported metrics',()=>{
const fields=[{key:'cards',enabled:true},{key:'name',enabled:true},{key:'points',enabled:true},{key:'percentage',enabled:false}];
assert.equal(ctx.s4tChartCopyText(board,true,'dev',fields),'1 cards · Alex — 4 points\n1 cards · Blair — 4 points');
assert.match(ctx.s4tChartCopyText(board,true,'labels',fields),/1 cards · Hotfix — 4 points/);
assert.equal(ctx.s4tChartCopyText(board,true,'dev',fields.map(f=>({...f,enabled:false}))), '');
const cleaned=ctx.s4tChartCopyFields('labels',[{key:'cards',enabled:false},{key:'cards'},{key:'unknown'}]);assert.equal(cleaned.length,4);assert.equal(cleaned[0].enabled,false);
});
