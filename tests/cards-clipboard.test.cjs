const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../sprint-helper.js'),'utf8');
const context={};
vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('function s4tEscapeHtml('),source.indexOf('function s4tSafeAvatarUrl('))+source.slice(source.indexOf('function s4tCardsClipboardHtml('),source.indexOf('// Group selected cards only;')),context);
test('grouped cards become real lists with headings and links',()=>{
 const html=context.s4tCardsClipboardHtml('*Alex*\n• Task A: https://trello.com/c/aaa\n• Task B\n\n*Blair*\n• Task C');
 assert.equal((html.match(/<ul>/g)||[]).length,2);
 assert.equal((html.match(/<li>/g)||[]).length,3);
 assert.ok(html.includes('<strong>Alex</strong>'));
 assert.ok(html.includes('<a href="https://trello.com/c/aaa">'));
 assert.ok(!html.includes('•'));
});
test('edited bullets are lists and user markup is escaped',()=>{
 const html=context.s4tCardsClipboardHtml('Notes\n- <img src=x onerror=alert(1)>\n* Second\nEnd');
 assert.equal((html.match(/<li>/g)||[]).length,2);
 assert.ok(html.includes('&lt;img'));
 assert.ok(!html.includes('<img'));
 assert.ok(html.endsWith('</ul><p>End</p>'));
});
