const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sprint-helper.js','utf8');
const ctx=vm.createContext({URL,s4tBurndownCurrentMember:{id:'me',username:'zoe'}});
vm.runInContext(source.slice(source.indexOf('function renderMembersHtml('),source.indexOf('function s4tSprintSummary(')),ctx);
const rows=[{key:'a',name:'Alex'},{key:'me',name:'Zoe'},{key:'b',name:'Blair'}];
test('logged-in member stays first in both exclusion modes without mutating source',()=>{
 for(const mode of [true,false]){const html=ctx.renderMembersHtml(rows,mode);assert.ok(html.indexOf('title="Zoe"')<html.indexOf('title="Alex"'));assert.ok(html.indexOf('title="Alex"')<html.indexOf('title="Blair"'));}
 assert.equal(rows[0].name,'Alex');
});
test('username fallback is case-insensitive; display name alone cannot pin another member',()=>{
 const html=ctx.renderMembersHtml([{name:'Alex'},{name:'Zoe'},{name:'Zed',username:'@ZOE'}],false);
 assert.ok(html.indexOf('title="Zed')<html.indexOf('title="Alex'));
 ctx.s4tBurndownCurrentMember=null;
 const fallback=ctx.renderMembersHtml(rows,false);assert.ok(fallback.indexOf('title="Alex')<fallback.indexOf('title="Zoe'));
});
