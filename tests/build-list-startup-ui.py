from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'sprint-helper.js').read_text()
code=s[s.index('function parsePoints('):s.index('// Helper: Check if card title')]+s[s.index('var debounce ='):s.index('// For MutationObserver')]+s[s.index('function List(el)'):s.index('//the story point picker')]
code+=s[s.index('(function watchPointMounts()'):s.index('})();',s.index('(function watchPointMounts()'))+5]
constants=s[s.index('var reg ='):s.index('if (typeof chrome')]
setup='''var _pointsAttr=['cpoints','points'],S4T_CARD_SEL='[data-testid="list-card"],.list-card',S4T_LIST_SEL='[data-testid="list"],.list',S4T_LIST_CONTAINER_SEL='[data-testid="list"],[data-testid="list-wrapper"],.list',S4T_CARD_CLOSEST_SEL=S4T_CARD_SEL,S4T_TITLE_SEL='[data-testid="card-name"]',obsConfig={childList:true,characterData:true,subtree:true};
var CrossBrowser={MutationObserver};function round(v){return Math.round(v*100)/100}function computeTotal(){}function s4tIsCommonCardElement(){return false}
'''
tests='''(async()=>{const errors=[],check=(v,m)=>{if(!v)errors.push(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));try{
const list=document.querySelector('[data-testid="list"]'),card=list.querySelector('[data-testid="list-card"]');new List(list);await wait(80);
card.innerHTML='<a data-testid="card-name">(8) Delayed title [3]</a><div data-testid="badges"></div>';
list.insertAdjacentHTML('afterbegin','<div data-testid="list-header">Delayed header</div>');
const noise=setInterval(()=>{const node=document.createElement('span');list.appendChild(node);node.remove();},30);
await wait(1300);check(list.querySelector('.list-total .points')?.textContent==='8','assigned points load while DOM keeps changing');check(list.querySelector('.list-total .cpoints')?.textContent==='3','completed points load after late title');clearInterval(noise);
list.querySelector('[data-testid="list-header"]').remove();list.querySelector('.list-total').remove();list.insertAdjacentHTML('afterbegin','<div data-testid="list-header">Remounted header</div>');await wait(800);check(!!list.querySelector('.list-total .points'),'totals restored after header remount');
const late=document.createElement('section');late.setAttribute('data-testid','list-wrapper');late.innerHTML='<header><textarea data-testid="list-name-textarea">New list</textarea></header><div class="list-card"><a data-testid="card-name">(7) Late card [2]</a><div data-testid="badges"></div></div>';document.body.appendChild(late);await wait(1100);check(late.querySelector('.list-total .points')?.textContent==='7','late wrapper-only list initializes');check(late.querySelector('.badge-points:not(.consumed)')?.textContent==='7','late card assigned badge initializes');check(late.querySelector('.badge-points.consumed')?.textContent==='2','late card completed badge initializes');
late.querySelector('header').remove();late.querySelector('.list-total')?.remove();late.list.calc();await wait(250);check(late.querySelector('.list-total .points')?.textContent==='7','unknown header still mounts totals at list top');
const changedCard=late.querySelector('.list-card');changedCard.setAttribute('data-s4t-orig-title','(9) Changed [4]');late.list.calc();await wait(250);check(late.querySelector('.points')?.textContent==='9'&&late.querySelector('.cpoints')?.textContent==='4','point cache invalidates on title changes');changedCard.style.display='none';await wait(800);check(getComputedStyle(late.querySelector('.list-total')).display==='none','visibility changes invalidate totals');changedCard.style.display='';await wait(800);check(late.querySelector('.points')?.textContent==='9','visible card restores cached totals');
let calls=0;const refresh=s4tBoundedRefresh(()=>calls++,100);const repeated=setInterval(refresh,20);await wait(450);clearInterval(repeated);check(calls>=3,'continuous refresh requests cannot starve callback');
}catch(e){errors.push(e.stack)}document.querySelector('#result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: delayed titles and headers, sustained hydration, header remount, bounded scheduling';})();'''
Path('/tmp/s4t-list-startup-ui.html').write_text('<html><body><div data-testid="list"><div data-testid="list-card"></div></div><pre id="result">RUNNING</pre><script>'+(root/'jquery-2.1.4.min.js').read_text()+'</script><script>'+setup+constants+code+tests+'</script></body></html>')
