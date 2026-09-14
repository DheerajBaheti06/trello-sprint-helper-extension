from pathlib import Path
root = Path(__file__).resolve().parent.parent
source = (root / 'sprint-helper.js').read_text()
helpers = source[source.index('function updateModalContent('):source.index('function hideMembersBurndown(')]
modal = source[source.index('function renderMembersHtml('):source.index('function showBurndown(')]
cards = source[source.index('/* Cards List:'):source.index('/* Shared tooltips')]
setup = '''
window.failures=[];window.addEventListener('error',e=>failures.push(e.message));
window.requestAnimationFrame=callback=>setTimeout(()=>callback(performance.now()),16);
var memberLoads=[], cardLoads=[];
var sample={boardName:'Sprint',team:{assigned:8,completed:3,remaining:5,cardsTotal:2,cardsCompleted:1,completionPercentage:38},members:[{name:'Alex',initials:'AX',assigned:8,completed:3,remaining:5,cardsTotal:2,cardsCompleted:1,cardsPending:1,completionPercentage:38}]};
var board={cards:[{id:'card1',name:'(3) Improve search',shortLink:'abc',idList:'todo',idMembers:['alex']}],members:[{id:'alex',fullName:'Alex'},{id:'sam',fullName:'Sam'}],lists:[{id:'todo',name:'Todo'}]};
function readAllCardsSynchronously(){}function collectMembersBurndownData(){return sample;}function getBoardShortLink(){return 'fixture';}function computeBurndownFromBoardData(){return sample;}function fetchBoardData(id,force,callback){memberLoads.push(callback);}function showSettings(){}function hideMembersBurndown(){$('#s4t-modal-overlay').remove();}function s4tIsCommonCard(){return false;}
var options={board:'fixture',load:callback=>cardLoads.push(callback),selection:()=>({ids:['card1'],source:'Board cards'})};
'''
tests = '''
setTimeout(async()=>{const check=(value,message)=>{if(!value)failures.push(message)},wait=()=>new Promise(resolve=>setTimeout(resolve,100)),busy=selector=>!!document.querySelector(selector).closest('.s4t-loading-surface');
try {
showMembersBurndown();check(busy('#s4t-members-container'),'burndown opening skeleton');check(document.querySelectorAll('#s4t-members-modal .s4t-panel-skeleton').length===1,'one complete members skeleton');check(getComputedStyle(document.querySelector('.s4t-panel-skeleton')).visibility==='visible','members skeleton visible');check(getComputedStyle(document.querySelector('#s4t-team-summary')).visibility==='hidden','stale summary hidden');check(busy('#s4t-sum-assigned'),'summary skeleton');check(document.getElementById('s4t-refresh-action').disabled,'burndown refresh disabled');
const rect=document.getElementById('s4t-members-modal').getBoundingClientRect();memberLoads.shift()(null,board);check(!busy('#s4t-members-container'),'burndown success clears skeleton');
document.getElementById('s4t-refresh-action').click();check(busy('#s4t-members-container'),'burndown refresh skeleton');check(document.getElementById('s4t-members-modal').getBoundingClientRect().height===rect.height,'burndown dimensions stable');memberLoads.shift()(new Error('offline'));check(!busy('#s4t-members-container'),'burndown error clears skeleton');
s4tLoadMembers(true);const stale=memberLoads.shift();hideMembersBurndown();showMembersBurndown();stale(null,board);check(busy('#s4t-members-container'),'old response cannot clear newer skeleton');memberLoads.shift()(null,board);hideMembersBurndown();
s4tOpenCardsList(options);check(busy('.s4t-cards-items'),'cards opening skeleton');check(busy('[data-cards-pane="preview"]'),'preview opening skeleton');
document.querySelector('[data-cards-tab="preview"]').click();check(!document.querySelector('[data-cards-pane="preview"]').hidden&&busy('[data-cards-pane="preview"]'),'switch tab while loading');
cardLoads.shift()(null,board);check(!busy('.s4t-cards-items')&&!busy('[data-cards-pane="preview"]'),'both skeletons clear on success');
const editor=document.getElementById('missing-slack-preview-rich');editor.textContent='My edited Slack draft';editor.dispatchEvent(new Event('input',{bubbles:true}));await wait();
document.querySelector('[data-cards-tab="cards"]').click();const pane=document.querySelector('[data-cards-pane="cards"]'),before=pane.getBoundingClientRect().height;
document.querySelector('[data-cards-resync]').click();check(busy('.s4t-cards-items'),'cards refresh skeleton');check(pane.getBoundingClientRect().height===before,'cards refresh dimensions stable');check(document.querySelector('[data-cards-copy]').disabled,'copy disabled while loading');cardLoads.shift()(null,board);check(editor.textContent==='My edited Slack draft','manual draft preserved');
document.querySelector('[data-cards-resync]').click();cardLoads.shift()(new Error('offline'));check(!busy('.s4t-cards-items')&&!busy('[data-cards-pane="preview"]'),'error clears both skeletons');check(editor.textContent==='My edited Slack draft','error preserves draft');check(!document.querySelector('[data-cards-copy]').disabled,'actions restored after failure');
document.querySelector('[data-cards-tab="preview"]').click();window.confirm=()=>true;document.querySelector('[data-cards-resync]').click();check(busy('[data-cards-pane="preview"]'),'preview rebuild skeleton');await wait();check(!busy('[data-cards-pane="preview"]'),'rebuild clears skeleton');check(editor.textContent.includes('Improve search'),'rebuilt preview ready');
const element=document.createElement('div');element.setAttribute('inert','');document.body.append(element);s4tSetSkeleton(element,true);s4tSetSkeleton(element,false);check(element.hasAttribute('inert'),'preexisting inert state retained');element.remove();
document.querySelector('[aria-label="Close Cards List"]').click();showMembersBurndown();
} catch(error){failures.push(error.message);}
document.getElementById('result').textContent=failures.length?'FAIL: '+failures.join('; '):'PASS: opening, refreshing, both tabs, failures, stale responses, preserved draft, stable dimensions, preview rebuild';
},150);
'''
html = '<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px system-ui;background:#eee}#result{position:fixed;bottom:0;z-index:20000;background:white;color:black;font-size:11px;white-space:pre-wrap}</style><style>' + (root/'sprint-helper.css').read_text() + '</style></head><body><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+helpers+modal+cards+'</script><script>'+tests+'</script></body></html>'
Path('/tmp/s4t-loading-ui.html').write_text(html)
