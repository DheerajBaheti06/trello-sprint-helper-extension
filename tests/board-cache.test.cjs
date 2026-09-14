const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('sprint-helper.js','utf8');
function fixture(){
 const pending=[];
 const ctx=vm.createContext({Date,Array,cachedBoardData:null,lastBoardFetchTime:0,cachedBoardShortLink:'',latestBoardFetchRequest:0,$:{ajax(options){const call={options};pending.push(call);const result={done(fn){call.resolve=fn;return result},fail(fn){call.reject=fn;return result}};return result;}}});
 vm.runInContext(source.slice(source.indexOf('function fetchBoardData('),source.indexOf('// Helper: Parse points')),ctx);
 return {ctx,pending};
}
const data=(id,name=id)=>({id,shortLink:id,name,cards:[],members:[],lists:[]});
test('cache is reused only for the same board',()=>{
 const {ctx,pending}=fixture();let received;
 ctx.fetchBoardData('a',false,(_,board)=>received=board);pending.shift().resolve(data('a'));
 ctx.fetchBoardData('a',false,(_,board)=>received=board);assert.equal(pending.length,0);assert.equal(received.name,'a');
 ctx.fetchBoardData('b',false,(_,board)=>received=board);assert.equal(pending.length,1);pending.shift().resolve(data('b'));assert.equal(received.name,'b');
});
test('late responses cannot overwrite a newer refresh',()=>{
 const {ctx,pending}=fixture();ctx.fetchBoardData('a',true,()=>{});ctx.fetchBoardData('a',true,()=>{});
 pending[1].resolve(data('a','new'));pending[0].resolve(data('a','old'));
 ctx.fetchBoardData('a',false,(_,board)=>assert.equal(board.name,'new'));
});
test('wrong board response falls back and cannot populate cache',()=>{
 const {ctx,pending}=fixture();let error;
 ctx.fetchBoardData('a',false,err=>error=err);pending.shift().resolve(data('b'));
 const fallback=pending.shift();assert.equal(fallback.options.url,'/b/a.json');assert.equal(fallback.options.timeout,20000);
 fallback.resolve(data('b'));assert.ok(error);assert.equal(ctx.cachedBoardData,null);
});
test('expired cache and forced refresh fetch new data; valid fallback is cached',()=>{
 const {ctx,pending}=fixture();ctx.fetchBoardData('a',false,()=>{});assert.equal(pending[0].options.timeout,20000);pending.shift().reject();pending.shift().resolve(data('a'));
 ctx.fetchBoardData('a',false,()=>{});assert.equal(pending.length,0);
 ctx.lastBoardFetchTime=Date.now()-31000;ctx.fetchBoardData('a',false,()=>{});pending.shift().resolve(data('a'));
 ctx.fetchBoardData('a',true,()=>{});assert.equal(pending.length,1);
});
