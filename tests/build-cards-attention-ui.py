from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'sprint-helper.js').read_text()
helpers=s[s.index('function parsePoints('):s.index('// Helper: Check if card title')]+s[s.index('function renderMembersHtml('):s.index('function showBurndown()')]
features=s[s.index('/* Attention filters use their own class'):s.index('// Sequential, idempotent checklist completion')]
# Controlled SPA route and animation clock; no Trello/network writes.
features=features.replace('window.location.pathname','window.fixturePath').replace('location.pathname','window.fixturePath')
setup='''window.fixturePath='/b/fixture';window.errors=[];window.addEventListener('error',e=>errors.push(e.message));localStorage.clear();
window.requestAnimationFrame=fn=>setTimeout(fn,16);
var S4T_CARD_SEL='[data-testid="list-card"]',S4T_LIST_SEL='[data-testid="list"]',S4T_TITLE_SEL='[data-testid="card-name"]';
function getBoardShortLink(){return 'fixture'}function updateBurndownLink(){}function calcListPoints(){}function readAllCardsSynchronously(){}var skeletonCalls=0;function s4tSetSkeleton(){skeletonCalls++}
var boardData={name:'Fixture',cards:[{id:'a',shortLink:'aaa',name:'Fix A',desc:'',idList:'todo',idMembers:['a','b'],idLabels:['h'],idChecklists:[]},{id:'b',shortLink:'bbb',name:'Fix B',desc:'Scope',idList:'todo',idMembers:['a'],idLabels:[],idChecklists:[]},{id:'c',shortLink:'ccc',name:'Fix C',desc:'',idList:'todo',idMembers:[],idLabels:['h'],idChecklists:[]}],members:[{id:'a',fullName:'Alex'},{id:'b',fullName:'Blair'},{id:'c',fullName:'Chris'}],labels:[{id:'h',name:'Hotfix'}],lists:[{id:'todo',name:'Todo'}],checklists:[]};
$.ajax=()=>{const d=$.Deferred();setTimeout(()=>d.resolve(boardData),5);return d.promise()};
var copiedText='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{copiedText=text}}});
'''
tests='''const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=s=>document.querySelector(s),check=(v,m)=>{if(!v)errors.push(m)};
(async()=>{try{
el('#s4t-attention-button').click();await wait(60);el('[data-check="scope"]').click();
const list=el('[data-testid="list"]');list.innerHTML=boardData.cards.map(c=>'<div data-testid="list-card"><a href="/c/'+c.shortLink+'">'+c.name+'</a></div>').join('');await Promise.resolve();await Promise.resolve();
check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'remount filtered before timer');
el('a[href="/c/bbb"]').parentElement.className='native-replacement';await Promise.resolve();await Promise.resolve();check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'class replacement refiltered');
var opened='';list.addEventListener('click',e=>{e.preventDefault();opened=e.target.getAttribute('href');window.fixturePath=opened});
window.fixturePath='/c/aaa';document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));check(opened==='/c/ccc','right skips excluded card');
document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));check(opened==='/c/aaa','left skips excluded card');
opened='';el('#typing').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));check(!opened,'typing arrows unaffected');
window.fixturePath='/b/fixture';window.dispatchEvent(new PopStateEvent('popstate'));check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'closing keeps filters');
s4tOpenCardsList({board:'fixture',selection:()=>({ids:['a','b','c'],source:'Attention filters'}),load:cb=>cb(null,boardData)});
check(!el('#s4t-cards-dialog header [data-cards-copy]'),'no copy in header');check(el('[data-cards-copy]').closest('.s4t-cards-editor-frame'),'copy inside editor frame');check(el('[data-add-developers]').closest('.s4t-cards-editor-frame'),'checkbox inside editor frame');check(!el('.s4t-cards-source'),'no filter source text');
el('[data-cards-tab="preview"]').click();const group=el('[data-cards-group]');group.value='labels';group.dispatchEvent(new Event('change'));await wait(60);check(!el('[data-add-developers]').hidden,'labels show developer option');check(el('[data-mention-developers]').hidden,'at option initially hidden');
check(!el('[data-add-developers]').closest('header'),'option outside header');const beforeSkeleton=skeletonCalls;el('[data-add-developers] input').click();await wait(60);check(skeletonCalls===beforeSkeleton,'checkbox does not refresh skeleton');check(!el('[data-add-developers]').textContent.trim(),'checkbox has no visible text');check(getComputedStyle(el('.s4t-cards-preview-tools')).position==='absolute','toolbar takes no top row');el('[data-add-developers]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await wait(300);check(!el('#s4t-icon-tooltip')||el('#s4t-icon-tooltip').hidden,'toast suppresses tooltip');check(el('#missing-slack-preview-rich').textContent.includes('— Alex, Blair'),'developer suffix included');check(!el('[data-mention-developers]').hidden,'at option appears after enabling names');el('[data-mention-developers] input').click();check(el('#missing-slack-preview-rich').textContent.includes('— @Alex, @Blair'),'at formatting included');check(el('.s4t-cards-footer').textContent==='Edit your message · Type @ for suggestions.','only requested footer text');
el('[data-cards-copy]').click();await wait(20);check(copiedText.includes('— @Alex, @Blair'),'copy includes developer suffix');check(!el('.s4t-cards-status').textContent.includes('Copied'),'no copy footer feedback');check(!el('.s4t-cards-copy-toast').hidden&&el('[data-cards-copy]').classList.contains('s4t-copy-success'),'copy toast and animation');
group.value='lists';group.dispatchEvent(new Event('change'));await wait(60);check(el('[data-add-developers]').hidden,'other grouping hides option');check(!el('#missing-slack-preview-rich').textContent.includes('— Alex'),'other grouping omits suffix');
}catch(e){errors.push(e.stack)}el('#result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: remount persistence, filtered arrows, typing, developer suffix, preview copy and grouping';})();'''
html='<html><head><style>'+(root/'sprint-helper.css').read_text()+'</style></head><body><div id="s4t-board-tools"><button id="membersBurndownLink">Members</button></div><div data-testid="list"></div><input id="typing"><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+helpers+features+'</script><script>'+tests+'</script></body></html>'
Path('/tmp/s4t-cards-attention-ui.html').write_text(html)
