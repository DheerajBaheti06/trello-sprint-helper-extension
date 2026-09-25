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
