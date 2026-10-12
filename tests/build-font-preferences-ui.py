from pathlib import Path
root=Path(__file__).resolve().parent.parent
script=r'''
const errors=[],check=(ok,msg)=>{if(!ok)errors.push(msg)};
const native=document.querySelector('#native-title'),original=getComputedStyle(native).fontFamily;
s4tPreferences.open();
let select=document.querySelector('[aria-label="Extension font family"]');
check(select.value==='native','native default');check(select.options.length===3,'only three fonts');
check(getComputedStyle(document.querySelector('#s4t-preferences-title')).fontFamily===original,'default matches native');
for(const [value,expected] of [['times','Times New Roman'],['georgia','Georgia']]){
 select.value=value;select.dispatchEvent(new Event('change'));
 check(getComputedStyle(document.querySelector('#s4t-preferences-title')).fontFamily.includes(expected),'heading font '+value);
 check(getComputedStyle(select).fontFamily.includes(expected),'selector font '+value);
 check(getComputedStyle(native).fontFamily===original,'native title unchanged '+value);
 check(JSON.parse(localStorage.getItem('s4t-feature-preferences-v1')).fontFamily===value,'saved '+value);
}
document.querySelector('[aria-label="Close settings"]').click();s4tPreferences.open();
select=document.querySelector('[aria-label="Extension font family"]');check(select.value==='georgia','reopen retains font');
document.querySelector('#s4t-preferences-dialog footer button').click();
check(document.querySelector('[aria-label="Extension font family"]').value==='native','reset restores native');
check(getComputedStyle(document.querySelector('#s4t-preferences-title')).fontFamily===original,'reset font matches Trello');
localStorage.setItem('s4t-feature-preferences-v1',JSON.stringify({fontFamily:'bad-font',members:false}));window.dispatchEvent(new StorageEvent('storage',{key:'s4t-feature-preferences-v1'}));
check(s4tPreferences.fontFamily()===original,'invalid font falls back');check(!s4tPreferences.enabled('members'),'feature choices preserved');
document.querySelector('#result').textContent=errors.length?'FAIL: '+errors.join('; '):'PASS: native default, three fonts, immediate styling, saved choice, reset, validation and native title isolation';
'''
Path('/tmp/s4t-font-preferences.html').write_text('<html><head><style>body{font-family:Arial,sans-serif}</style><style>'+(root/'sprint-helper.css').read_text()+'</style></head><body><h2 id="native-title">Native Trello title</h2><pre id="result">RUNNING</pre><script>localStorage.removeItem("s4t-feature-preferences-v1");</script><script>'+(root/'feature-preferences.js').read_text()+'</script><script>'+script+'</script></body></html>')
