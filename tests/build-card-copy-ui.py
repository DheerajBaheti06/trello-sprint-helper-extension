from pathlib import Path
root=Path(__file__).resolve().parent.parent
s=(root/'sprint-helper.js').read_text()
parser=s[s.index('function parsePoints('):s.index('// Helper: Check if card title')]
html='<html><head><style>.ak-renderer-document > :first-child { margin-top:0!important; } .ak-renderer-document > :last-child { margin-bottom:0!important; }</style><style>'+(root/'sprint-helper.css').read_text()+'</style></head><body><div role="dialog" style="position:relative;margin:80px;width:700px;height:600px"><div class="s4t-comment-search-slot"><div class="s4t-comment-navigator">Search</div></div><button aria-label="Mark card complete" style="margin-top:60px">○</button><textarea data-testid="card-back-title">(4.5) Sample (UI) [2]</textarea><section><h3>Description</h3><div class="ak-renderer-document">Scope text</div></section></div><div data-testid="card-back-action-comment"><div class="ak-renderer-document"><h3>Tech Design</h3><p><strong>Bold text</strong> and <a href="https://example.com/">link</a></p><ul><li>First task</li></ul></div></div><pre id="result">RUNNING</pre>'
test=r"""document.querySelector('[role="dialog"]').append(document.querySelector('[data-testid="card-back-action-comment"]'));const comment=document.querySelector('[data-testid="card-back-action-comment"] .ak-renderer-document');const originalMarkup=comment.innerHTML,originalWidth=comment.getBoundingClientRect().width,originalHeight=comment.getBoundingClientRect().height;let rich=[];let copied=[];Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>copied.push(text),write:async items=>rich.push(items[0])}});setTimeout(async()=>{try{
const title=document.querySelector('.s4t-card-copy-title'),desc=document.querySelector('.s4t-card-copy-description');
await title.click();await new Promise(r=>setTimeout(r,0));desc.click();await new Promise(r=>setTimeout(r,0));
const descText=copied[1]||(rich[0]&&await (await rich[0].getType('text/plain')).text());
if(copied[0]!=='Sample (UI)'||descText!=='Scope text')throw Error(JSON.stringify(copied));
if(title.hasAttribute('data-tooltip')||!title.hasAttribute('data-copied'))throw Error('copy feedback');
if(title.hidden)throw Error('title button hidden');
if(!document.querySelector('.s4t-card-toast[role="status"]'))throw Error('accessible success toast missing');
if(s4tCardShareUrl('/c/AbC123/title')!=='https://trello.com/c/AbC123'||s4tCardShareUrl('/b/AbC123/board')!=='')throw Error('canonical card URL');
const share=document.querySelector('.s4t-card-copy-share');
if(share.previousElementSibling.className!=='s4t-comment-navigator')throw Error('share placement');
s4tCardShareUrl=()=> 'https://trello.com/c/AbC123';
share.click();await new Promise(r=>setTimeout(r,0));
if((copied[2]||copied[1])!=='https://trello.com/c/AbC123'||!share.hasAttribute('data-copied')||share.hasAttribute('data-tooltip'))throw Error('share copy feedback');
const commentCopy=document.querySelector('.s4t-card-copy-comment');if(!commentCopy)throw Error('comment copy missing');
const clone=comment.cloneNode(true);clone.querySelectorAll('.s4t-comment-copy-dock').forEach(n=>n.remove());if(clone.innerHTML!==originalMarkup||comment.getBoundingClientRect().width!==originalWidth||comment.getBoundingClientRect().height!==originalHeight)throw Error('native comment layout changed');
if(!commentCopy.closest('.s4t-comment-copy-dock'))throw Error('native scroll dock missing');
const down=new MouseEvent('mousedown',{bubbles:true,cancelable:true});commentCopy.dispatchEvent(down);if(!down.defaultPrevented)throw Error('mouse focus scroll not prevented');
const scrollBefore=document.scrollingElement.scrollTop;commentCopy.click();await new Promise(r=>setTimeout(r,30));
if(document.scrollingElement.scrollTop!==scrollBefore)throw Error('copy scrolled page');
if(rich.length){const targetItem=rich[rich.length-1];const html=await (await targetItem.getType('text/html')).text();const plain=await (await targetItem.getType('text/plain')).text();if(!html.includes('<strong>Bold text</strong>')||!html.includes('<h3>')||!html.includes('<li>')||html.includes('s4t-card-copy')||!plain.includes('Tech Design\n'))throw Error('rich comment content');}else if(!copied.some(text=>text.includes('Tech Design')))throw Error('comment fallback');
await new Promise(r=>setTimeout(r,1500));
const pane=document.createElement('div');pane.style.cssText='position:fixed;top:150px;left:200px;width:500px;height:300px;overflow:auto';document.querySelector('[role="dialog"]').append(pane);
const lead=document.createElement('div');lead.style.height='180px';pane.append(lead);pane.append(comment.parentElement);const tail=document.createElement('div');tail.style.height='800px';pane.append(tail);await new Promise(r=>setTimeout(r,100));
for(const offset of [0,30,60,100,60,30,0]){
pane.scrollTop=offset;pane.dispatchEvent(new Event('scroll'));
const immediate=document.querySelector('.s4t-card-copy-comment');
if(Math.abs(immediate.getBoundingClientRect().top-comment.getBoundingClientRect().top-4)>1)throw Error('scroll update delayed '+offset);
await new Promise(r=>setTimeout(r,80));
const icon=document.querySelector('.s4t-card-copy-comment');
if(icon.hidden||Math.abs(icon.getBoundingClientRect().top-comment.getBoundingClientRect().top-4)>1)throw Error('unstable scroll position '+offset);
}
document.querySelector('#result').textContent='PASS: title points omitted, non-point brackets retained, description copied, feedback shown';
}catch(e){document.querySelector('#result').textContent='FAIL: '+e.message}},100);"""
Path('/tmp/s4t-card-copy-ui.html').write_text(html+'<script>'+parser+(root/'card-copy.js').read_text()+test+'</script></body></html>')
