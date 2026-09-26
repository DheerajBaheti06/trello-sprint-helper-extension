const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync('sprint-helper.js','utf8');
function fixture() {
    let active=true, hiding=true, clicks=0, now=0, recovery=false, works=true;
    const context=vm.createContext({
        window:{location:{pathname:'/b/board',search:'?filter=member:alex'}},
        document:{documentElement:{removeAttribute(){recovery=false},setAttribute(){recovery=true}},querySelector(){return {}}},
        s4tPreferences:{enabled(){return hiding}}, switching:false, observedNativeQuery:'',
        nativeFiltersActive(){return active}, currentBoard(){return 'board'}, Date:{now(){return now}},
        nativeClearButton(){return {click(){clicks++;if(works){active=false;context.window.location.search=''}}}}
    });
    vm.runInContext(source.slice(source.indexOf('    var hiddenNativeReset ='),source.indexOf('    async function clearNativeFilterControls')),context);
    return {context,run:()=>context.clearHiddenNativeFilters(),setHiding:v=>hiding=v,setWorks:v=>works=v,tick:()=>now+=800,get clicks(){return clicks},get recovery(){return recovery}};
}
test('hidden native filters clear through native handler on reload, without repeats',()=>{const f=fixture();assert.equal(f.run(),true);assert.equal(f.clicks,1);assert.equal(f.context.observedNativeQuery,'');assert.equal(f.run(),false);assert.equal(f.clicks,1)});
test('visible filters and open cards are left alone',()=>{const f=fixture();f.setHiding(false);assert.equal(f.run(),false);f.setHiding(true);f.context.window.location.pathname='/c/card';f.run();assert.equal(f.clicks,0)});
test('bounded retries reveal native controls when clearing fails',()=>{const f=fixture();f.setWorks(false);for(let i=0;i<10;i++){f.run();f.tick()}assert.equal(f.clicks,6);assert.equal(f.recovery,true);f.setHiding(false);f.run();assert.equal(f.recovery,false)});
test('hydration retries are throttled and switching is respected',()=>{const f=fixture();f.setWorks(false);f.run();f.run();assert.equal(f.clicks,1);f.tick();f.context.switching=true;f.run();assert.equal(f.clicks,1);f.context.switching=false;f.run();assert.equal(f.clicks,2)});
