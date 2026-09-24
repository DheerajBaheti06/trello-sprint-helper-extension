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
var editedComment=false;var commentRequests=0;$.ajax=opts=>{const d=$.Deferred();const comments=opts.url.includes('/actions');if(comments){commentRequests++;if(!opts.data.filter.includes('copyCommentCard'))errors.push('copied comments not requested');}setTimeout(()=>d.resolve(comments?((opts.url.includes('/cards/a/') || (editedComment && opts.url.includes('/cards/c/')))?[{id:'comment',data:{text:'# Tech Design\\n### **TestCases**\\n### Branch'}}]:[]):boardData),5);return d.promise()};
var copiedText='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{copiedText=text}}});
'''
tests='''const wait=ms=>new Promise(r=>setTimeout(r,ms)),el=s=>document.querySelector(s),check=(v,m)=>{if(!v)errors.push(m)};
(async()=>{try{
el('#s4t-attention-button').click();await wait(60);
check([...document.querySelectorAll('.s4t-attention-column-heading h3')].map(n=>n.textContent).join(',')==='Members,Exclude lists,Labels','member and list column order');
const scopedBoard={members:[{id:'a',fullName:'Alex'},{id:'b',fullName:'Blair'}],lists:[{id:'a',name:'Alex Not Sure'},{id:'b',name:'Blair Todo'},{id:'empty',name:'done-closed'}],cards:[{idList:'a',name:'A',idMembers:['a']},{idList:'b',name:'B',idMembers:['b']}]};
check(s4tAttentionMemberLists(scopedBoard,['a'],false).map(l=>l.id).join(',')==='a','only lists with selected member cards visible');
check(s4tAttentionMemberLists(scopedBoard,[],false).length===2,'all members show populated lists');
check(s4tAttentionMemberLists(scopedBoard,['__empty__'],false).length===0,'no members show no lists');
el('[data-attention-all-members]').click();check(el('.s4t-attention-list-message').textContent.includes('No members selected'),'no-member explanation');el('[data-attention-all-members]').click();
check(commentRequests===0,'comments loaded lazily');
el('[data-check="missingComments"]').click();check(el('.s4t-attention-columns').getAttribute('aria-busy')==='false','comments do not block popup');check(!el('.s4t-attention-comment-progress').hidden,'inline comment progress visible');await wait(120);
check(commentRequests===3,'comments requested per eligible card');check(!el('.s4t-attention-comment-names').hidden,'required headings input visible');
el('#s4t-attention-comment-names').value='Tech Design, Test Cases, Branch';el('#s4t-attention-comment-names').dispatchEvent(new Event('input',{bubbles:true}));
check(el('.s4t-attention-count').textContent==='2 matching cards','missing heading matches only incomplete cards');
el('#s4t-attention-comment-names').value='TESTCASES';el('#s4t-attention-comment-names').dispatchEvent(new Event('input',{bubbles:true}));check(el('.s4t-attention-count').textContent==='2 matching cards','TESTCASES matches mixed-case H3');el('[data-check="missingComments"]').click();el('[data-check="missingComments"]').click();await wait(20);check(commentRequests===3,'repeat toggle reuses comment data');el('[data-check="missingComments"]').click();
el('[data-check="scope"]').click();
const list=el('[data-testid="list"]');list.innerHTML=boardData.cards.map(c=>'<div data-testid="list-card"><a href="/c/'+c.shortLink+'">'+c.name+'</a></div>').join('');await Promise.resolve();await Promise.resolve();
check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'remount filtered before timer');
list.setAttribute('data-list-id','todo');el('[data-exclude-list="todo"]').click();
list.insertAdjacentHTML('beforeend','<div data-testid="list-card"><a href="/c/newcard">New card absent from snapshot</a></div>');await Promise.resolve();await Promise.resolve();
check(el('a[href="/c/newcard"]').parentElement.classList.contains('s4t-attention-hidden'),'new card in excluded list hidden immediately');
el('[data-check="missingComments"]').click();await wait(40);check([...list.querySelectorAll('[data-testid="list-card"]')].every(n=>n.classList.contains('s4t-attention-hidden')),'excluded list wins over comment results');
check(el('[data-exclude-list="todo"]').checked,'excluded checkbox remains selected');
el('[data-check="missingComments"]').click();el('[data-exclude-list="todo"]').click();el('a[href="/c/newcard"]').parentElement.remove();

el('a[href="/c/bbb"]').parentElement.className='native-replacement';await Promise.resolve();await Promise.resolve();check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'class replacement refiltered');
var opened='';list.addEventListener('click',e=>{e.preventDefault();opened=e.target.getAttribute('href');window.fixturePath=opened});
window.fixturePath='/c/aaa';document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));check(opened==='/c/ccc','right skips excluded card');
document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));check(opened==='/c/aaa','left skips excluded card');
opened='';el('#typing').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));check(!opened,'typing arrows unaffected');
window.fixturePath='/b/fixture';window.dispatchEvent(new PopStateEvent('popstate'));check(el('a[href="/c/bbb"]').parentElement.classList.contains('s4t-attention-hidden'),'closing keeps filters');
el('[data-check="scope"]').click();el('[data-check="missingComments"]').click();
window.fixturePath='/c/ccc';editedComment=true;
const savedComment=document.createElement('div');savedComment.setAttribute('data-testid','comment-content');savedComment.innerHTML='<h3>TESTCASES -</h3>';document.body.append(savedComment);
await wait(650);
check(el('a[href="/c/ccc"]').parentElement.classList.contains('s4t-attention-hidden'),'saved comment edit refilters automatically');
check(el('.s4t-attention-count').textContent==='1 matching cards','edited card removed from comment matches');
window.fixturePath='/b/fixture';savedComment.remove();el('[data-check="missingComments"]').click();el('[data-check="scope"]').click();
s4tOpenCardsList({board:'fixture',selection:()=>({ids:['a','b','c'],source:'Attention filters'}),load:cb=>cb(null,boardData)});
boardData.lists.push({id:'unsure',name:'Alex Not Sure'});boardData.cards.push({id:'unsure',shortLink:'unsure',name:'Uncertain task',idList:'unsure',idMembers:['a']});
s4tOpenCardsList({board:'fixture',selection:()=>({ids:['a','b','c','unsure'],source:'Attention filters'}),load:cb=>cb(null,boardData)});
el('[data-cards-tab="preview"]').click();
check(!el('[data-cards-exclude-not-sure]').hidden,'dev shows Not Sure checkbox');check(!el('[data-cards-exclude-not-sure]').closest('[data-cards-pane]'),'exclusion accessible in both tabs');
check(el('#missing-slack-preview-rich').textContent.includes('Uncertain task'),'Not Sure included by default');
el('[data-cards-exclude-not-sure] input').click();check(!el('#missing-slack-preview-rich').textContent.includes('Uncertain task'),'Not Sure excluded only when checked');
el('[data-cards-exclude-not-sure] input').click();
check(parseFloat(getComputedStyle(el('.s4t-cards-preview-tools')).right)>=24,'copy toolbar clear of scrollbar');
check(getComputedStyle(el('[data-cards-copy]')).backgroundColor!==getComputedStyle(el('.s4t-cards-preview-tools')).backgroundColor,'copy has distinct background');
check(!el('#s4t-cards-dialog header [data-cards-copy]'),'no copy in header');check(el('[data-cards-copy]').closest('.s4t-cards-editor-frame'),'copy inside editor frame');check(el('[data-add-developers]').closest('.s4t-cards-editor-frame'),'checkbox inside editor frame');check(!el('.s4t-cards-source'),'no filter source text');
el('[data-cards-tab="preview"]').click();const group=el('[data-cards-group]');group.value='labels';group.dispatchEvent(new Event('change'));await wait(60);check(!el('[data-add-developers]').hidden,'labels show developer option');check(el('[data-mention-developers]').hidden,'at option initially hidden');
check(!el('[data-add-developers]').closest('header'),'option outside header');const beforeSkeleton=skeletonCalls;el('[data-add-developers] input').click();await wait(60);check(skeletonCalls===beforeSkeleton,'checkbox does not refresh skeleton');check(!el('[data-add-developers]').textContent.trim(),'checkbox has no visible text');check(getComputedStyle(el('.s4t-cards-preview-tools')).position==='absolute','toolbar takes no top row');el('[data-add-developers]').dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));await wait(300);check(!el('#s4t-icon-tooltip')||el('#s4t-icon-tooltip').hidden,'toast suppresses tooltip');check(el('#missing-slack-preview-rich').textContent.includes('— Alex, Blair'),'developer suffix included');check(!el('[data-mention-developers]').hidden,'at option appears after enabling names');el('[data-mention-developers] input').click();check(el('#missing-slack-preview-rich').textContent.includes('— @Alex, @Blair'),'at formatting included');check(el('.s4t-cards-footer').textContent==='Edit your message · Type @ for suggestions.','only requested footer text');
el('[data-cards-copy]').click();await wait(20);check(copiedText.includes('— @Alex, @Blair'),'copy includes developer suffix');check(!el('.s4t-cards-status').textContent.includes('Copied'),'no copy footer feedback');check(!el('.s4t-cards-copy-toast').hidden&&el('[data-cards-copy]').classList.contains('s4t-copy-success'),'copy toast and animation');
group.value='lists';group.dispatchEvent(new Event('change'));await wait(60);
for(const mode of ['dev','labels','lists']){group.value=mode;group.dispatchEvent(new Event('change'));await wait(60);check(!el('[data-cards-exclude-not-sure]').hidden,'Not Sure option visible for '+mode);el('[data-cards-exclude-not-sure] input').click();check(!el('#missing-slack-preview-rich').textContent.includes('Uncertain task'),'Not Sure excluded for '+mode);el('[data-cards-exclude-not-sure] input').click();check(el('#missing-slack-preview-rich').textContent.includes('Uncertain task'),'Not Sure restored for '+mode);}
check(el('[data-add-developers]').hidden,'other grouping hides option');check(!el('#missing-slack-preview-rich').textContent.includes('— Alex'),'other grouping omits suffix');
}catch(e){errors.push(e.stack)}el('#result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: remount persistence, filtered arrows, typing, developer suffix, preview copy and grouping';})();'''
html='<html><head><style>'+(root/'sprint-helper.css').read_text()+'</style></head><body><div id="s4t-board-tools"><button id="membersBurndownLink">Members</button></div><div data-testid="list"></div><input id="typing"><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+helpers+features+'</script><script>'+tests+'</script></body></html>'
Path('/tmp/s4t-cards-attention-ui.html').write_text(html)
