from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'sprint-helper.js').read_text()
code=s[s.index('var debounce ='):s.index('// For MutationObserver')]+s[s.index('function List(el)'):s.index('//.list-card pseudo')]
setup='''var _pointsAttr=['cpoints','points'],S4T_CARD_SEL='[data-testid="list-card"]',S4T_LIST_CONTAINER_SEL='[data-testid="list"]',obsConfig={};
var CrossBrowser={MutationObserver:class{observe(){}}};function round(v){return Math.round(v*100)/100}function computeTotal(){}function s4tIsCommonCardElement(){return false}
for(const [i,n] of [...document.querySelectorAll(S4T_CARD_SEL)].entries())n.listCard={points:{points:[4,6][i],refresh(){}},cpoints:{points:[2,3][i],refresh(){}}};
'''
test='''(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms)),list=document.querySelector('[data-testid="list"]'),cards=list.querySelectorAll('[data-testid="list-card"]');new List(list);await wait(220);let errors=[];const check=(v,m)=>{if(!v)errors.push(m)};
check([...list.querySelectorAll('.list-total span')].map(n=>n.className).join(',')==='points,cpoints','assigned before completed');
check(list.querySelector('.points').textContent==='10','initial assigned');
list.list.calc();cards[1].classList.add('s4t-attention-hidden');list.list.calc();await wait(220);
check(list.querySelector('.points').textContent==='4','trailing recalculation excludes hidden assigned');check(list.querySelector('.cpoints').textContent==='2','hidden completed excluded');
cards[0].classList.add('s4t-attention-hidden');list.list.calc();await wait(220);check(getComputedStyle(list.querySelector('.list-total')).display==='none','empty filtered list hides totals');document.querySelector('#result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: assigned-first totals, rapid filtering and empty-list totals';})()'''
html='<html><head><style>.s4t-attention-hidden{display:none!important}[data-testid="list-card"]{height:20px}</style></head><body><div data-testid="list"><div data-testid="list-header">Todo</div><div data-testid="list-card">A</div><div data-testid="list-card">B</div></div><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+code+test+'</script></body></html>'
Path('/tmp/s4t-list-totals-ui.html').write_text(html)
