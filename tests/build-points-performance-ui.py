from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'sprint-helper.js').read_text()
code=s[s.index('function parsePoints('):s.index('// Helper: Check if card title')]+s[s.index('var debounce ='):s.index('// For MutationObserver')]+s[s.index('function List(el)'):s.index('//the story point picker')]
constants=s[s.index('var reg ='):s.index('if (typeof chrome')]
setup='''var _pointsAttr=['cpoints','points'],S4T_CARD_SEL='[data-testid="list-card"]',S4T_LIST_CONTAINER_SEL='[data-testid="list"]',S4T_CARD_CLOSEST_SEL=S4T_CARD_SEL,S4T_TITLE_SEL='[data-testid="card-name"]';var CrossBrowser={MutationObserver};function round(v){return Math.round(v*100)/100}function computeTotal(){}function s4tIsCommonCardElement(){return false}
'''
test='''(async()=>{try{const wait=ms=>new Promise(r=>setTimeout(r,ms));const start=performance.now();
for(let i=0;i<12;i++){const list=document.createElement('section');list.dataset.testid='list';list.innerHTML='<div data-testid="list-header">List '+i+'</div>'+Array.from({length:40},(_,j)=>'<div data-testid="list-card"><a data-testid="card-name">(5) Task '+j+' [2]</a><div data-testid="badges"></div></div>').join('');document.body.appendChild(list);new List(list);}
const lists=[...document.querySelectorAll('[data-testid="list"]')];let firstTotalsMs;for(let n=0;n<100;n++){await wait(25);if(lists.every(l=>l.querySelector('.list-total .points')?.textContent==='200')){firstTotalsMs=Math.round(performance.now()-start);break;}}
await wait(1800);let parses=0,writes=0;const original=parsePoints;parsePoints=function(v){parses++;return original(v)};
const observers=lists.map(list=>{const o=new MutationObserver(ms=>writes+=ms.length);o.observe(list.querySelector('.list-total'),{childList:true,subtree:true,characterData:true});return o});
const before=performance.now();for(let n=0;n<10;n++){lists.forEach(l=>l.list._calcInner());await wait(40);}observers.forEach(o=>o.disconnect());
const valid=lists.every(l=>l.querySelector('.points')?.textContent==='200'&&l.querySelector('.cpoints')?.textContent==='80');
document.querySelector('#result').textContent=JSON.stringify({cards:480,lists:12,firstTotalsMs,repeatElapsedMs:Math.round(performance.now()-before),parses,totalDomMutations:writes,correctTotals:valid});
}catch(e){document.querySelector('#result').textContent=e.stack}})();'''
Path('/tmp/s4t-points-performance.html').write_text('<html><body><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+constants+code+test+'</script></body></html>')
