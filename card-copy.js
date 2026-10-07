function s4tCardShareUrl(path) {
    var match=String(path||'').match(/^\/c\/([a-zA-Z0-9]+)(?:\/|$)/);
    return match?'https://trello.com/c/'+match[1]:'';
}
/* One unobtrusive, accessible toast per card; repeated actions replace it. */
function s4tCardToast(anchor,message,error){
    var card=anchor&&anchor.closest('[data-testid="card-back"],[data-testid="card-back-container"],.card-detail-window,.window,[role="dialog"],dialog');
    if(!card)return;
    var toast=card.querySelector('.s4t-card-toast');
    if(!toast){toast=document.createElement('div');toast.className='s4t-card-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');card.append(toast);}
    clearTimeout(toast._timer);toast.textContent=(error?'':'✓ ')+message;toast.classList.toggle('s4t-card-toast-error',!!error);
    toast.hidden=false;toast.style.left='0px';toast.style.top='0px';
    var box=card.getBoundingClientRect(),origin=toast.getBoundingClientRect();
    toast.style.left=(box.left+(box.width-origin.width)/2-origin.left)+'px';
    toast.style.top=(Math.min(box.bottom,innerHeight)-54-origin.top)+'px';
    toast._timer=setTimeout(function(){toast.remove();},1800);
    document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
}
document.addEventListener('s4t-card-success',function(event){s4tCardToast(event.target,event.detail||'Done');});
/* Read-only card copying. Native title/description nodes are never moved. */
(function () {
    var card, titleButton, descriptionButton, shareButton, timer;
    var commentButtons=new Map(), positionFrame;
    function schedulePosition(){if(!positionFrame)positionFrame=requestAnimationFrame(function(){positionFrame=null;positionComments();position();});}
    var commentResize=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedulePosition):null;
    var icon='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
    function titleNode(){return card&&card.querySelector(typeof s4tTitleEditorSelector==='string'?s4tTitleEditorSelector+', [data-testid="card-back-title"],.card-detail-title h2':'[data-testid="card-back-title-input"],[data-testid="card-back-title"],.js-card-detail-title-input,.card-detail-title textarea,.card-detail-title h2');}
    function cleanTitle(value){
        return String(value||'').replace(/\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}/g,function(token){
            var points=parsePoints(token);
            return points.assigned!==null||points.completed!==null||/^[([{]\s*\??\s*[)\]}]$/.test(token)?'':token;
        }).replace(/\s+/g,' ').trim();
    }
    function descriptionNode(){
        if(!card)return null;
        var direct=card.querySelector('[data-testid="card-back-description"] .ak-renderer-document,[data-testid="description-content"],.description-content .markeddown,.description-content,[data-testid="card-back-description"]');
        if(direct)return direct;
        var heading=Array.from(card.querySelectorAll('h2,h3,h4,[role="heading"]')).find(function(node){return /^description$/i.test(node.textContent.trim());});
        for(var section=heading&&heading.parentElement;section&&section!==card;section=section.parentElement){
            var rendered=section.querySelector('.ak-renderer-document,.markeddown,[data-testid="description-content"]');
            if(rendered&&!rendered.closest('[data-testid*="comment"],[data-testid*="activity"],.comment-container'))return rendered;
        }
        return null;
    }
    function commentPayload(source){
        var clone=source.cloneNode(true);
        clone.querySelectorAll('.s4t-comment-copy-dock,.s4t-card-copy,button,input,textarea,script,style,iframe,object,embed').forEach(function(node){node.remove();});
        clone.querySelectorAll('*').forEach(function(node){
            Array.from(node.attributes).forEach(function(attr){
                if(!/^(href|src|alt|title|colspan|rowspan|style)$/.test(attr.name))node.removeAttribute(attr.name);
                else if(/^(href|src)$/.test(attr.name)&&!/^https?:/i.test(attr.value))node.removeAttribute(attr.name);
                else if(attr.name==='style'){
                    var safe=document.createElement('span');
                    ['color','background-color','font-weight','font-style','text-decoration','text-align','white-space'].forEach(function(key){
                        var value=node.style.getPropertyValue(key);if(value&&!/url|expression|var\(/i.test(value))safe.style.setProperty(key,value);
                    });
                    node.setAttribute('style',safe.style.cssText);
                }
            });
        });
        function plain(node){
            if(node.nodeType===3)return node.textContent;
            if(node.nodeType!==1)return '';
            if(node.tagName==='BR')return '\n';
            var value=Array.from(node.childNodes).map(plain).join('');
            return /^(P|DIV|H[1-6]|LI|PRE|BLOCKQUOTE|TR)$/.test(node.tagName)?value+'\n':value;
        }
        return {html:clone.innerHTML,text:plain(clone).trim()};
    }
    function mountComments(){
        var selector='.comment-container,.phenom-comment,.current-comment,.action-comment,[data-testid="comment-text"],[data-testid="comment-content"],[data-testid="card-back-comment"],[data-testid="card-back-action-comment"],[data-testid="action-comment"],[data-testid*="comment"] .ak-renderer-document,[data-testid*="activity"] .ak-renderer-document,.list-actions .ak-renderer-document';
        var sources=Array.from(card.querySelectorAll(selector)).map(function(root){
            return root.querySelector('.ak-renderer-document,.markeddown,[data-testid="comment-text"]')||root;
        });
        sources=Array.from(new Set(sources)).filter(function(root){return !sources.some(function(other){return other!==root&&root.contains(other);})&&!root.closest('[contenteditable="true"],.ProseMirror');});
        commentButtons.forEach(function(copy,source){
            if(!sources.includes(source)){source.removeAttribute('data-s4t-comment-copy-source');if(copy._dock)copy._dock.remove();commentButtons.delete(source);if(commentResize)commentResize.unobserve(source);}
        });
        sources.forEach(function(source){
            if(commentButtons.has(source)&&commentButtons.get(source).isConnected)return;
            source.setAttribute('data-s4t-comment-copy-source','');
            var copy=button('comment');copy._commentSource=source;copy.style.visibility='hidden';
            var dock=document.createElement('span');dock.className='s4t-comment-copy-dock';
            copy._dock=dock;dock.append(copy);
            // Preserve renderer > :first-child rules (Trello removes the first
            // paragraph/heading's top margin). Never prepend a sibling before it.
            var textBlock=source.querySelector('p,h1,h2,h3,h4,h5,h6,li,blockquote');
            (textBlock||source).append(dock);
            commentButtons.set(source,copy);
            if(commentResize)commentResize.observe(source);
        });
        positionComments();
    }
    function positionComments(){
        commentButtons.forEach(function(copy,source){
            if(!source.isConnected||!copy._dock.isConnected)return;
            // Only layout/resizing needs coordinates. The zero-size dock scrolls
            // with its comment in the browser's own scrolling layer.
            var rect=source.getBoundingClientRect(),origin=copy._dock.getBoundingClientRect();
            copy.style.left=(rect.right-origin.left-20)+'px';
            copy.style.top=(rect.top-origin.top+4)+'px';
            copy.style.visibility='visible';
        });
    }

    function button(kind){
        var node=document.createElement('button');node.type='button';node.className='s4t-card-copy s4t-card-copy-'+kind;
        var label=kind==='comment'?'Copy comment':kind==='share'?'Copy card link':kind==='title'?'Copy title without points':'Copy description';
        var graphic=kind==='share'?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>':icon;
        node.setAttribute('aria-label',label);node.setAttribute('data-tooltip',label);node.innerHTML=graphic;
        node.addEventListener('pointerdown',function(e){e.preventDefault();e.stopPropagation();});
        node.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();});
        node.addEventListener('click',async function(e){
            e.preventDefault();e.stopPropagation();
            var source=kind==='comment'?node._commentSource:kind==='title'?titleNode():descriptionNode();
            var text=source&&(source.value!==undefined?source.value:source.innerText);
            if(kind==='title')text=cleanTitle(text);
            if(kind==='share')text=s4tCardShareUrl(window.location.pathname);
            var payload=kind==='comment'&&source?commentPayload(source):null;
            if(payload)text=payload.text;
            if(!text){s4tCardToast(node,'No text available to copy.',true);return;}
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            node.removeAttribute('data-tooltip');
            if(node.disabled)return;
            node.disabled=true;node.setAttribute('aria-busy','true');
            var plainFallback=false;
            try{
                if(payload&&typeof ClipboardItem!=='undefined'&&navigator.clipboard.write){
                    try{await navigator.clipboard.write([new ClipboardItem({'text/html':new Blob([payload.html],{type:'text/html'}),'text/plain':new Blob([text],{type:'text/plain'})})]);}
                    catch(_){await navigator.clipboard.writeText(text);plainFallback=true;}
                }else {await navigator.clipboard.writeText(text);plainFallback=!!payload;}node.textContent='✓';node.setAttribute('data-copied','');node.setAttribute('aria-label','Copied');
                s4tCardToast(node,kind==='share'?'Card link copied':kind==='comment'?(plainFallback?'Comment copied as text':'Comment copied'):kind==='title'?'Title copied':'Description copied');}
            catch(_){node.textContent='!';node.setAttribute('aria-label','Copy failed. Try again.');s4tCardToast(node,'Copy failed. Try again.',true);}
            node.disabled=false;node.removeAttribute('aria-busy');
            clearTimeout(node._reset);node._reset=setTimeout(function(){node.innerHTML=graphic;node.removeAttribute('data-copied');node.setAttribute('aria-label',label);node.setAttribute('data-tooltip',label);},1400);
        });
        return node;
    }
    function position(){
        if(!titleButton||!card)return;
        var title=titleNode();
        var circle=Array.from(card.querySelectorAll('button,[role="checkbox"],input[type="checkbox"]')).find(function(node){
            return !node.closest('.s4t-checklist-actions')&&/mark.*(?:complete|incomplete|read)|card.*complete/i.test((node.getAttribute('aria-label')||'')+' '+(node.getAttribute('data-testid')||''));
        });
        var anchor=circle||title;
        if(!anchor)return;
        var rect=anchor.getBoundingClientRect(),bounds=card.getBoundingClientRect();
        var x=circle?rect.left+(rect.width-26)/2:rect.right-28,y=rect.top-29;
        var clipTop=bounds.top;
        for(var parent=anchor.parentElement;parent&&parent!==card;parent=parent.parentElement){
            if(/auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY))clipTop=Math.max(clipTop,parent.getBoundingClientRect().top);
        }
        if(y<clipTop){y=rect.top;x=circle?rect.left-30:rect.right-28;}
        x=Math.max(bounds.left+2,Math.min(x,bounds.right-28));
        titleButton.hidden=rect.bottom<=clipTop||rect.top>=bounds.bottom;
        titleButton.style.left='0px';titleButton.style.top='0px';
        var origin=titleButton.getBoundingClientRect();
        titleButton.style.left=x-origin.left+'px';titleButton.style.top=y-origin.top+'px';
    }
    function mount(){
        timer=null;
        var cardSelector='[data-testid="card-back"],[data-testid="card-back-container"],.card-detail-window,.window,[role="dialog"],dialog';
        var searchSlot=document.querySelector('.s4t-comment-search-slot');
        var titleInput=document.querySelector(typeof s4tTitleEditorSelector==='string'?s4tTitleEditorSelector:'[data-testid="card-back-title"]');
        var next=(searchSlot&&searchSlot.closest(cardSelector))||(titleInput&&titleInput.closest(cardSelector));
        if(!next)next=Array.from(document.querySelectorAll(cardSelector)).find(function(node){
            return node.getClientRects().length&&node.querySelector('[data-testid="card-back-title"],[data-testid="card-back-title-input"],.card-detail-title');
        });
        if(card!==next){commentButtons.forEach(function(copy){if(copy._dock)copy._dock.remove();});commentButtons.clear();if(commentResize)commentResize.disconnect();if(titleButton)titleButton.remove();if(descriptionButton)descriptionButton.remove();if(shareButton)shareButton.remove();titleButton=descriptionButton=shareButton=null;card=next;}
        if(!card)return;
        if(!titleButton||!titleButton.isConnected){titleButton=button('title');card.append(titleButton);}
        var heading=Array.from(card.querySelectorAll('h2,h3,h4,[role="heading"],[data-testid="card-back-description-title"]')).find(function(node){return /^description$/i.test(node.textContent.trim());});
        if(heading&&(!descriptionButton||!descriptionButton.isConnected)){descriptionButton=button('description');heading.after(descriptionButton);}
        var search=card.querySelector('.s4t-comment-search-slot');
        if(search){
            if(!shareButton||!shareButton.isConnected)shareButton=button('share');
            if(shareButton.parentElement!==search)search.append(shareButton);
        }
        mountComments();
        position();
    }
    new MutationObserver(function(records){
        var selector='[data-testid="card-back"],[data-testid="card-back-container"],.card-detail-window,.window,[role="dialog"],dialog';
        var own='[id^="s4t-"],.s4t-card-copy,.s4t-card-toast,.s4t-comment-copy-dock,.s4t-comment-search-slot,.s4t-comment-jumps';
        var relevant=(card&&!card.isConnected)||records.some(function(m){
            var target=m.target.nodeType===1?m.target:m.target.parentElement;
            if(target&&target.closest(own))return false;
            var nodes=Array.from(m.addedNodes||[]).concat(Array.from(m.removedNodes||[]));
            if(nodes.length&&nodes.every(function(node){return node.nodeType===1&&node.matches(own);}))return false;
            if(card&&target&&card.contains(target))return true;
            return nodes.some(function(node){return node.nodeType===1&&(node.matches(selector)||node.querySelector(selector));});
        });
        if(relevant&&!timer)timer=setTimeout(mount,80);
    }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','aria-hidden','data-testid']});
    document.addEventListener('s4t-card-toolbar-mounted',mount);
    // Only the title copy control needs scroll positioning; comments scroll natively.
    document.addEventListener('scroll',position,true);
    window.addEventListener('resize',schedulePosition);
    mount();
})();
