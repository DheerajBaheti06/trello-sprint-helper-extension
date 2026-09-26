/* Expand native comments by hiding only the adjacent left card column. */
(function () {
    var markerCard, toggle, markerButton, markerEnabled=false, ink, inkLayer, stroke, inkTimers=new Set(), slot, collapsed, route = location.pathname, queued;
    var style=document.createElement('style');
    style.textContent='.s4t-comment-search-slot.s4t-comment-layout-slot{display:flex;align-items:center;gap:4px;flex:0 0 auto;width:auto;max-width:none}.s4t-comment-layout-slot>.s4t-comment-navigator{flex:0 0 240px;width:240px;min-width:240px}.s4t-comment-navigator-pinned{width:240px!important}.s4t-comment-layout-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 30px;width:30px;height:30px;padding:5px;border:1px solid var(--ds-border,#dcdfe4);border-radius:6px;background:var(--ds-surface-overlay,#fff);color:var(--ds-text,#172b4d);cursor:pointer}.s4t-comment-layout-toggle:hover{background:var(--ds-background-neutral-hovered,#dcdfe4)}.s4t-comment-layout-toggle[aria-pressed=true]{color:var(--ds-text-selected,#0055cc);background:var(--ds-background-selected,#e9f2ff)}.s4t-comment-layout-toggle:focus-visible{outline:2px solid var(--ds-border-focused,#388bff);outline-offset:2px}.s4t-comment-left-hidden{display:none!important}.s4t-comment-column-wide{grid-column:1/-1!important;flex:1 1 100%!important;width:100%!important;max-width:none!important;min-width:0!important}.s4t-comment-columns-wide{grid-template-columns:minmax(0,1fr)!important}';
    style.textContent += '.s4t-comment-layout-toggle[hidden]{display:none!important}.s4t-review-marker-on [data-testid="card-back-title"],.s4t-review-marker-on [data-testid="card-back-title-input"],.s4t-review-marker-on .description-content,.s4t-review-marker-on .ak-renderer-document,.s4t-review-marker-on .comment-container,.s4t-review-marker-on [data-testid="comment-text"]{cursor:crosshair}#s4t-review-ink-layer{position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;padding:0;margin:0;border:0;background:transparent;pointer-events:none;overflow:hidden}#s4t-review-ink-layer::backdrop{background:transparent;pointer-events:none}#s4t-review-ink{position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483600;pointer-events:none;overflow:hidden}.s4t-review-laser-glow{filter:blur(2px);animation:s4t-laser-glow .8s ease-in-out infinite alternate}@keyframes s4t-laser-glow{from{opacity:.55}to{opacity:.95}}.s4t-review-stroke-fading{animation:s4t-review-fade .3s ease-out forwards}@keyframes s4t-review-fade{to{opacity:0}}@media(prefers-reduced-motion:reduce){.s4t-review-stroke-fading{animation:none;opacity:0}.s4t-review-laser-glow{animation:none;opacity:.75}}';
    style.textContent += '.s4t-review-no-selection,.s4t-review-no-selection *{user-select:none!important;-webkit-user-select:none!important}.s4t-review-no-selection input,.s4t-review-no-selection textarea,.s4t-review-no-selection [contenteditable="true"],.s4t-review-no-selection [contenteditable="true"] *{user-select:text!important;-webkit-user-select:text!important}.s4t-review-no-selection [contenteditable="true"],.s4t-review-no-selection textarea{cursor:text}.s4t-review-marker:disabled{opacity:.45;cursor:default}';
    document.head.appendChild(style);
    function enabled(id){return typeof s4tPreferences==='undefined'||s4tPreferences.enabled(id);}
    function currentCard(){return slot&&slot.closest('[data-testid="card-back"], [data-testid="card-back-container"], .card-detail-window, .window, [role="dialog"]');}
    var titleSelector='[data-testid="card-back-title"],[data-testid="card-back-title-input"],[data-testid="card-back-title-container"],.card-detail-title,textarea.js-card-detail-title-input';
    var contentSelector='.ak-renderer-document,.markeddown,.comment-container,.current-comment,.action-comment,[data-testid="comment-text"],[data-testid="comment-content"],[data-testid="action-comment"],[data-testid="card-back-comment"],[data-testid="card-back-action-comment"],[data-testid="card-back-description"],[data-testid="description-content"],.description-content';
    var descriptionSelector='[data-testid="card-back-description"],[data-testid="card-back-description-content"],[data-testid="description-content"],[data-testid="card-description"],.description-content,.js-card-desc,.js-desc';
    function descriptionBody(target){
        var card=currentCard();
        if(!target||!card||!card.contains(target)||target.closest(titleSelector))return null;
        // Read-only Trello renderers can have role="textbox" and generated
        // wrappers. Those roles do not mean an actual editor is open.
        if(target.closest('input,textarea,select,[contenteditable="true"],.ProseMirror'))return null;
        var surface=target.closest(descriptionSelector);
        if(!surface){
            var rendered=target.closest('.ak-renderer-document,.markeddown');
            var comment=target.closest('.comment-container,.current-comment,.action-comment,[data-testid*="comment"],[data-testid*="action"]');
            if(rendered&&!comment)surface=rendered;
        }
        if(!surface){
            // Include whitespace around the rendered description, but never
            // infer from the whole card or another card section.
            for(var section=target;section&&section!==card;section=section.parentElement){
                if(section.querySelector('.s4t-comment-search-slot'))break;
                var heading=section.querySelector('h2,h3,[role="heading"]');
                if(heading&&/^description$/i.test(heading.textContent.trim())){
                    surface=section;break;
                }
            }
        }
        if(!surface)return null;
        var control=target.closest('button,a,[role="button"],[data-testid="description-edit-button"],[data-testid="card-back-description-edit-button"]');
        // A button wrapping the renderer is the click-to-edit surface, not
        // the separate Edit control. Links and buttons within text still work.
        if(control&&!control.contains(surface)&&!control.querySelector('.ak-renderer-document,.markeddown'))return null;
        return surface;
    }
    function guardDescriptionEdit(event){
        if(!markerEnabled)return;
        var target=event.target instanceof Element?event.target:event.target.parentElement;
        if(!descriptionBody(target))return;
        event.preventDefault();event.stopImmediatePropagation();
    }
    ['mousedown','mouseup','click','dblclick'].forEach(function(type){window.addEventListener(type,guardDescriptionEdit,true);});
    window.addEventListener('pointerup',function(event){
        // Finish the ink stroke before blocking Trello's pointer-up edit handler.
        if(markerEnabled&&descriptionBody(event.target)){finishStroke(event);guardDescriptionEdit(event);}
    },true);
    function editingComment(){
        var card=currentCard();if(!card)return false;
        return Array.from(card.querySelectorAll('textarea,input,[contenteditable="true"]')).some(function(field){
            if(field.closest('.s4t-comment-search-slot,.s4t-comment-navigator,[id^="s4t-"]')||field.disabled||field.readOnly||!field.getClientRects().length||getComputedStyle(field).visibility==='hidden')return false;
            return field===document.activeElement||field.contains(document.activeElement)||!!field.closest('.comment-container,.current-comment,.action-comment,[data-testid="card-back-comment"],[data-testid="action-comment"],[data-testid="card-back-action-comment"],.edit-comment,[data-testid*="edit-comment"],.description-edit,[data-testid="description-editor"],[data-testid="card-back-description-editor"]');
        });
    }
    function syncEditor(){
        var editing=editingComment();
        if(editing&&markerEnabled)setMarker(false);
        if(markerButton){if(markerButton.disabled!==editing)markerButton.disabled=editing;markerButton.setAttribute('data-tooltip',editing?'Marker disabled while editing':markerEnabled?'Laser pointer on · Drag over title, description or comments · Marks fade in 0.6 seconds':'Temporary red laser pointer');}
    }
    document.addEventListener('focusin',syncEditor,true);
    document.addEventListener('focusout',function(){setTimeout(syncEditor,0);},true);
    document.addEventListener('selectstart',function(event){
        var target=event.target.nodeType===1?event.target:event.target.parentElement;
        if(target&&((collapsed&&collapsed.comments.contains(target))||(markerEnabled&&currentCard()&&currentCard().contains(target)))&&!target.closest('input,textarea,[contenteditable="true"]'))event.preventDefault();
    },true);
    function clearInk(){
        if(stroke){if(stroke.frame)cancelAnimationFrame(stroke.frame);try{if(stroke.target.hasPointerCapture(stroke.id))stroke.target.releasePointerCapture(stroke.id);}catch(_){}stroke=null;}
        inkTimers.forEach(clearTimeout);inkTimers.clear();if(inkLayer)inkLayer.remove();else if(ink)ink.remove();inkLayer=null;ink=null;
    }
    function setMarker(enabled){
        markerEnabled=enabled&&(typeof s4tPreferences==='undefined'||s4tPreferences.enabled('laserPointer'))&&!!currentCard()&&!editingComment();
        if(markerCard)markerCard.classList.remove('s4t-review-marker-on','s4t-review-no-selection');
        markerCard=markerEnabled?currentCard():null;
        if(markerCard)markerCard.classList.add('s4t-review-marker-on','s4t-review-no-selection');
        if(markerButton){markerButton.setAttribute('aria-pressed',String(markerEnabled));markerButton.setAttribute('data-tooltip',markerEnabled?'Laser pointer on · Drag over title, description or comments · Marks fade in 0.6 seconds':'Temporary red laser pointer');}
        if(!markerEnabled)clearInk();
    }
    function later(fn,ms){var timer=setTimeout(function(){inkTimers.delete(timer);fn();},ms);inkTimers.add(timer);}
    function finishStroke(event){
        if(!stroke||event.pointerId!==stroke.id)return;
        var ended=stroke;if(ended.frame)cancelAnimationFrame(ended.frame);paintStroke(ended);stroke=null;
        try{if(ended.target.hasPointerCapture(ended.id))ended.target.releasePointerCapture(ended.id);}catch(_){}
        later(function(){ended.group.classList.add('s4t-review-stroke-fading');},300);
        later(function(){ended.group.remove();if(ink&&!ink.children.length){if(inkLayer)inkLayer.remove();else ink.remove();inkLayer=null;ink=null;}},600);
    }
    function inkPoint(x,y){var matrix=ink.getScreenCTM();return matrix?new DOMPoint(x,y).matrixTransform(matrix.inverse()):{x:x,y:y};}
    window.addEventListener('pointerdown',function(event){
        syncEditor();
        if(!markerEnabled||!currentCard()||stroke||event.button!==0||event.ctrlKey||event.metaKey||event.altKey)return;
        var target=event.target,card=currentCard();
        if(!(target instanceof Element))return;
        // The title's display-only point mirror lives outside the card DOM.
        if(target.closest('#s4t-title-point-highlight'))target=card.querySelector(typeof s4tTitleEditorSelector==='string'?s4tTitleEditorSelector:titleSelector)||target;
        if(!card.contains(target)||target.closest('.s4t-comment-search-slot,.s4t-comment-navigator'))return;
        var description=descriptionBody(target);
        var rendered=target.closest(contentSelector+','+titleSelector)||description;
        if(!rendered&&!(collapsed&&collapsed.comments.contains(target)))return;
        var idleTitle=target.matches('input,textarea')&&target.closest(titleSelector)&&document.activeElement!==target;
        for(var node=target;node&&node!==card;node=node.parentElement){
            if(node===target&&idleTitle)continue;
            if(description&&(node===description||node.contains(description)))continue;
            if(node.matches('a,button,input,textarea,select,[contenteditable="true"],[role="textbox"]')&&!(description&&node.getAttribute('role')==='textbox'&&!node.isContentEditable))return;
            if(node.matches('[role="button"]')&&(!rendered||rendered.contains(node)))return;
        }
        var comment=rendered||collapsed.comments;
        event.preventDefault();event.stopImmediatePropagation();document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
        if(!ink){ink=document.createElementNS('http://www.w3.org/2000/svg','svg');ink.id='s4t-review-ink';ink.setAttribute('aria-hidden','true');
            // Keep ink inside Trello's dialog/top layer rather than behind its backdrop.
            var host=card;
            inkLayer=document.createElement('div');inkLayer.id='s4t-review-ink-layer';inkLayer.setAttribute('aria-hidden','true');inkLayer.appendChild(ink);host.appendChild(inkLayer);
            // A non-interactive top-layer surface avoids clipping by Trello's
            // nested scroll containers and transformed card panels.
            if(typeof inkLayer.showPopover==='function'){inkLayer.setAttribute('popover','manual');try{inkLayer.showPopover();}catch(_){inkLayer.removeAttribute('popover');}}
            var box=ink.getBoundingClientRect();ink.style.left=(-box.left)+'px';ink.style.top=(-box.top)+'px';}
        var group=document.createElementNS(ink.namespaceURI,'g');ink.appendChild(group);
        var paths=['#ff1744','#ff354b','#fff1f3'].map(function(color,i){var path=document.createElementNS(ink.namespaceURI,'path');path.setAttribute('fill','none');path.setAttribute('stroke',color);path.setAttribute('stroke-width',['6','3','1'][i]);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');if(i===0)path.setAttribute('class','s4t-review-laser-glow');group.appendChild(path);return path;});
        var point=inkPoint(event.clientX,event.clientY);
        var d='M'+point.x+' '+point.y+' l.01 0';paths.forEach(function(path){path.setAttribute('d',d)});
        stroke={id:event.pointerId,target:comment,group:group,paths:paths,d:'M'+point.x+' '+point.y,last:point,frame:null,bounds:comment.getBoundingClientRect()};
        try{comment.setPointerCapture(event.pointerId);}catch(_){}
    },true);
    function paintStroke(current){
        current.frame=null;
        var d=current.d+' L'+current.last.x+' '+current.last.y;
        current.paths.forEach(function(path){path.setAttribute('d',d);});
    }
    window.addEventListener('pointermove',function(event){
        if(!stroke||event.pointerId!==stroke.id)return;
        event.preventDefault();event.stopPropagation();
        var r=stroke.bounds,x=Math.max(r.left,Math.min(r.right,event.clientX)),y=Math.max(r.top,Math.min(r.bottom,event.clientY));
        var point=inkPoint(x,y);
        var samples=event.getCoalescedEvents?event.getCoalescedEvents():[];
        if(!samples.length)samples=[event];
        samples.forEach(function(sample){
            var next=inkPoint(Math.max(r.left,Math.min(r.right,sample.clientX)),Math.max(r.top,Math.min(r.bottom,sample.clientY))),last=stroke.last;
            if(Math.hypot(next.x-last.x,next.y-last.y)<1)return;
            stroke.d+=' Q'+last.x+' '+last.y+' '+((last.x+next.x)/2)+' '+((last.y+next.y)/2);stroke.last=next;
        });
        if(!stroke.frame){var current=stroke;stroke.frame=requestAnimationFrame(function(){if(stroke===current)paintStroke(current);});}

    },true);
    document.addEventListener('pointerup',finishStroke,true);document.addEventListener('pointercancel',finishStroke,true);
    document.addEventListener('lostpointercapture',finishStroke,true);
    document.addEventListener('scroll',clearInk,true);window.addEventListener('resize',clearInk);
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&markerEnabled){event.preventDefault();event.stopImmediatePropagation();setMarker(false);}},true);
    function restore(){
        setMarker(false);
        if(collapsed){collapsed.left.classList.remove('s4t-comment-left-hidden');collapsed.comments.classList.remove('s4t-comment-column-wide','s4t-review-no-selection');collapsed.parent.classList.remove('s4t-comment-columns-wide');collapsed=null;}
        updateLabel();
    }
    function updateLabel(){if(!toggle)return;var label=collapsed?'Exit Review mode · Restore left section':'Review mode · Expand comments';if(markerButton)markerButton.hidden=false;toggle.setAttribute('aria-pressed',String(!!collapsed));toggle.setAttribute('aria-label',label);toggle.setAttribute('data-tooltip',label);}
    function columns(){
        var card=slot.closest('[data-testid="card-back"], [data-testid="card-back-container"], .card-detail-window, .window, [role="dialog"]');
        if(!card)return null;
        var heading=Array.from(card.querySelectorAll('h2,h3,h4,[role="heading"],[data-testid="card-back-activity-section-title"]')).find(function(node){return /^(?:comments?\s*(?:&|and)\s*activity|activity)$/i.test(node.textContent.trim());});
        // Match actual side-by-side columns, not Trello's generated class names.
        for(var branch=heading;branch&&branch!==card&&branch.parentElement;branch=branch.parentElement){
            var parent=branch.parentElement, rect=branch.getBoundingClientRect();
            if(branch.contains(slot)||rect.width<160)continue;
            var left=Array.from(parent.children).find(function(node){
                if(node===branch||node.contains(slot))return false;
                var r=node.getBoundingClientRect();
                return r.width>120&&r.height>80&&r.right<=rect.left+8&&Math.min(r.bottom,rect.bottom)-Math.max(r.top,rect.top)>60;
            });
            if(left)return {left:left,comments:branch,parent:parent};
        }
        return null;
    }
    function mount(){
        queued=null;
        if(route!==location.pathname){restore();route=location.pathname;}
        if(collapsed&&(!collapsed.left.isConnected||!collapsed.comments.isConnected))restore();
        syncEditor();
        var next=document.querySelector('.s4t-comment-search-slot');
        if(next===slot&&toggle&&toggle.isConnected){var search=slot.querySelector('.s4t-comment-navigator');if(search&&markerButton.nextElementSibling!==search)search.before(toggle,markerButton);return;}
        restore();if(toggle)toggle.remove();if(markerButton)markerButton.remove();if(slot)slot.classList.remove('s4t-comment-layout-slot');
        slot=next;if(!slot)return;
        slot.classList.add('s4t-comment-layout-slot');
        toggle=document.createElement('button');toggle.type='button';toggle.className='s4t-comment-layout-toggle';
        toggle.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M7 7h4M7 11h3M7 15h3"/><circle cx="16" cy="7" r="4"/><path d="m19 10 3 3"/></svg>';
        toggle.addEventListener('click',function(event){
            event.preventDefault();event.stopPropagation();
            if(!enabled('reviewMode'))return;
            if(collapsed)restore();else{
                var found=columns();
                if(!found){toggle.setAttribute('data-tooltip','Comments already use the available width');document.dispatchEvent(new Event('s4t-dismiss-tooltip'));return;}
                collapsed=found;found.left.classList.add('s4t-comment-left-hidden');found.comments.classList.add('s4t-comment-column-wide','s4t-review-no-selection');found.parent.classList.add('s4t-comment-columns-wide');setMarker(true);syncEditor();updateLabel();
            }
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            window.dispatchEvent(new Event('resize'));
        });
        markerButton=document.createElement('button');markerButton.type='button';markerButton.className='s4t-comment-layout-toggle s4t-review-marker';markerButton.hidden=false;
        markerButton.setAttribute('aria-label','Temporary red laser pointer');markerButton.setAttribute('aria-pressed','false');markerButton.setAttribute('data-tooltip','Temporary red laser pointer');
        markerButton.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 14 9-9 5 5-9 9-5-5Zm-1 1-2 6 6-2M13 6l5 5"/><path d="M13 21h8" stroke="#ef3340" stroke-width="3"/></svg>';
        markerButton.onclick=function(event){event.preventDefault();event.stopPropagation();setMarker(!markerEnabled);document.dispatchEvent(new Event('s4t-dismiss-tooltip'));};
        slot.prepend(toggle,markerButton);updateLabel();
    }
    new MutationObserver(function(){syncEditor();if(!queued)queued=setTimeout(mount,50);}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['contenteditable','hidden','disabled','aria-hidden']});
    document.addEventListener('s4t-preferences-changed',function(){if(!enabled('reviewMode')&&collapsed)restore();if(!enabled('laserPointer'))setMarker(false);});
    window.addEventListener('popstate',mount);mount();
})();
