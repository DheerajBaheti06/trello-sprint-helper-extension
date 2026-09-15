from pathlib import Path
root=Path(__file__).resolve().parent.parent
source=(root/'sprint-helper.js').read_text()
script=source[source.index('async function s4tCompleteChecklist('):source.index('function s4tCommentSearchSpans(')]
setup='''window.errors=[];window.addEventListener('error',e=>errors.push(e.message));var generation=0,clicks=[],states=[false,false,false];
function render(){const old=document.getElementById('target'),node=document.createElement('div');node.id='target';node.className='checklist';node.innerHTML=states.map((checked,i)=>'<div class="checklist-item"><label><input id="react-'+generation+'-'+i+'" type="checkbox" '+(checked?'checked':'')+'>'+['Build','Test','Review'][i]+'</label></div>').join('')+'<button>Delete</button>';
const nativeDelete=node.querySelector('button');
node.querySelectorAll('input').forEach((input,i)=>input.addEventListener('click',()=>{if(i===0 && generation===0){const hide=document.createElement('button');hide.textContent='Hide completed items';node.insertBefore(hide,nativeDelete)}clicks.push(i);states[i]=input.checked;input.disabled=true;setTimeout(()=>{generation++;render()},150)}));if(old)old.replaceWith(node);else document.body.append(node)}render();
'''
tests='''const wait=ms=>new Promise(r=>setTimeout(r,ms)),check=(v,m)=>{if(!v)errors.push(m)};(async()=>{try{
check(document.querySelector('#target > button')?.textContent==='Delete','native Delete stays in original parent');document.querySelector('#target .s4t-checklist-action').click();await wait(2300);check(states.every(Boolean),'first attempt checks all after remount');check(clicks.join(',')==='0,1,2','each target item clicked once');check(!document.querySelector('#other input').checked,'other checklist untouched');check(document.querySelector('#target .s4t-checklist-action').textContent==='Check all','replacement action keeps stable label');
}catch(e){errors.push(e.stack)}document.getElementById('result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: first-attempt remount, regenerated input IDs, sequential completion and checklist isolation';})();'''
Path('/tmp/s4t-checklist-remount.html').write_text('<html><body><div id="other" class="checklist"><div class="checklist-item"><label><input type="checkbox">Other task</label></div><button>Delete</button></div><pre id="result">RUNNING</pre><script>'+setup+script+tests+'</script></body></html>')
