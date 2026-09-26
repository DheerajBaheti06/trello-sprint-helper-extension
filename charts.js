/* Pie charts use board snapshots; they never change Trello cards. */
function s4tChartData(board, excludeNotSure) {
    var members = new Map((board.members || []).map(function (m) { return [m.id, m.fullName || m.username || 'Member']; }));
    var labels = new Map((board.labels || []).map(function (l) { return [l.id, l.name || (l.color || 'Unnamed') + ' label']; }));
    var excluded = new Set((board.lists || []).filter(function (l) { return l.closed || (excludeNotSure && /\bnot[\s_-]*sure\b/i.test(l.name)); }).map(function (l) { return l.id; }));
    var dev = new Map(), label = new Map();
    function add(map, id, name, value) { if (!map.has(id)) map.set(id,{id:id,name:name,value:0}); map.get(id).value += value; }
    (board.cards || []).forEach(function (card) {
        if (card.closed || excluded.has(card.idList) || s4tIsCommonCard(card)) return;
        var ids = Array.from(new Set(card.idMembers || []));
        if (members.size && Array.from(members.keys()).every(function (id) { return ids.includes(id); })) return;
        var points = parsePoints(card.name).assigned;
        if (points !== null && points > 0) {
            if (!ids.length) add(dev,'__none__','Unassigned',points);
            else ids.forEach(function (id) { add(dev,id,members.get(id) || 'Former member',points); });
        }
        var cardLabels = new Map((card.labels || []).map(function (l) { return [l.id, l.name || (l.color || 'Unnamed') + ' label']; }));
        var labelIds = Array.from(new Set(card.idLabels || Array.from(cardLabels.keys())));
        if (!labelIds.length) add(label,'__none__','No labels',1);
        else labelIds.forEach(function (id) { add(label,id,cardLabels.get(id) || labels.get(id) || 'Unnamed label',1); });
    });
    function sorted(map) { return Array.from(map.values()).map(function (entry) { entry.value = Math.round(entry.value*100)/100; return entry; }).sort(function (a,b) { return b.value-a.value || a.name.localeCompare(b.name); }); }
    return {dev:sorted(dev),labels:sorted(label)};
}

var s4tOpenCharts = (function () {
    var overlay, peekWindow, openingPeek = false;
    var css = `
.s4t-chart-overlay{position:fixed;inset:0;z-index:2147483600;background:#0007;display:grid;place-items:center;padding:16px}
.s4t-chart-dialog{box-sizing:border-box;width:min(660px,94vw,92vh);aspect-ratio:1;display:flex;flex-direction:column;overflow:hidden;background:var(--ds-surface-overlay,#fff);color:var(--ds-text,#172b4d);border:1px solid var(--ds-border,#dcdfe4);border-radius:16px;box-shadow:0 16px 48px #0004;font:14px/1.4 system-ui,sans-serif}
.s4t-chart-dialog header{display:flex;align-items:center;gap:8px;padding:14px 16px;flex-shrink:0}.s4t-chart-dialog h2{font-size:17px;margin:0;margin-right:auto}.s4t-chart-dialog button{font:inherit;color:inherit;background:var(--ds-background-neutral,#f1f2f4);border:0;border-radius:7px;padding:7px 10px;cursor:pointer}.s4t-chart-dialog button:hover{background:var(--ds-background-neutral-hovered,#dcdfe4)}
.s4t-chart-dialog [role=tablist]{display:flex;gap:6px;padding:0 16px 10px}.s4t-chart-dialog [aria-selected=true]{background:var(--ds-background-selected,#e9f2ff);color:var(--ds-text-selected,#0055cc)}
.s4t-chart-content{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;padding:0 16px 20px}.s4t-chart-canvas{position:relative;width:min(100%,400px);margin:auto}.s4t-chart-canvas svg{display:block;width:100%;overflow:visible}.s4t-chart-slice{cursor:pointer;transition:transform .18s ease,opacity .18s ease;stroke:var(--ds-surface-overlay,#fff);stroke-width:2}.s4t-chart-slice:focus-visible{outline:none;stroke:var(--ds-text,#172b4d);stroke-width:4}
.s4t-chart-detail{text-align:center;min-height:22px;margin:3px 0 10px;font-weight:600;font-variant-numeric:tabular-nums}.s4t-chart-legend{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.s4t-chart-legend button{display:flex;align-items:center;text-align:left;gap:7px;font-size:12px;background:transparent}.s4t-chart-legend i{width:10px;height:10px;flex-shrink:0;border-radius:50%}.s4t-chart-legend span{overflow-wrap:anywhere}.s4t-chart-legend b{margin-left:auto;white-space:nowrap}.s4t-chart-note{font-size:12px;color:var(--ds-text-subtle,#626f86);margin:10px 0 0}.s4t-chart-dialog :focus-visible{outline:2px solid var(--ds-border-focused,#388bff);outline-offset:2px}
.s4t-chart-loading{height:250px;margin:15px;border-radius:12px;background:linear-gradient(100deg,var(--ds-background-neutral,#f1f2f4) 25%,var(--ds-background-neutral-hovered,#dcdfe4) 50%,var(--ds-background-neutral,#f1f2f4) 75%);background-size:200% 100%;animation:s4t-chart-load 1s linear infinite}@keyframes s4t-chart-load{to{background-position:-200% 0}}
.s4t-chart-detached{width:100%;height:100dvh;aspect-ratio:auto;border:0;border-radius:0;box-shadow:none}
.s4t-chart-detached header{padding:8px 10px}.s4t-chart-detached [role=tablist]{padding:0 10px 6px}.s4t-chart-detached [role=tab]{flex:1;font-size:12px;padding:6px}
.s4t-chart-detached .s4t-chart-content{padding:0 4px 4px;display:flex;overflow:hidden}
.s4t-chart-detached .s4t-chart-canvas{width:100%;height:100%;min-height:0;display:flex;justify-content:center;align-items:center}.s4t-chart-detached .s4t-chart-canvas svg{width:100%;height:100%;min-height:0}
.s4t-chart-detached .s4t-chart-detail{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);box-sizing:border-box;max-width:95%;width:max-content;padding:7px 10px;border-radius:8px;background:var(--ds-surface-overlay,#fff);box-shadow:0 2px 12px #0003;border:1px solid var(--ds-border,#dcdfe4);font-size:12px;margin:0;pointer-events:none}
.s4t-chart-detached .s4t-chart-loading{flex:1;height:auto;min-height:100px}
.s4t-chart-percentage{fill:white;font:700 14px system-ui,sans-serif;paint-order:stroke;stroke:#172b4d;stroke-width:3px;stroke-linejoin:round;pointer-events:none;text-anchor:middle;dominant-baseline:middle;transition:transform .18s ease,opacity .18s ease}
@media(prefers-reduced-motion:reduce){.s4t-chart-slice,.s4t-chart-percentage{transition:none}.s4t-chart-loading{animation:none}}
`;
    function mount(doc, host, boardId, excludeNotSure, initial, close, detached) {
        var style = doc.createElement('style'); style.textContent = css; host.appendChild(style);
        var dialog = doc.createElement('section'); dialog.className = 's4t-chart-dialog' + (detached ? ' s4t-chart-detached' : ''); dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','Sprint charts');
        dialog.innerHTML = '<header><h2>Charts</h2><button type="button" data-chart-popout aria-label="Pop out chart" title="Pop out chart">↗</button><button type="button" data-chart-refresh aria-label="Refresh charts" title="Refresh charts">↻</button><button type="button" data-chart-close aria-label="Close charts">✕</button></header><div role="tablist" aria-label="Chart type"><button type="button" role="tab" data-chart-tab="dev">Points by developer</button><button type="button" role="tab" data-chart-tab="labels">Cards by label</button></div><div class="s4t-chart-content" role="tabpanel"></div>';
        host.appendChild(dialog);
        var content = dialog.querySelector('.s4t-chart-content'), tab = 'dev', snapshot = initial, request = 0, selected = -1;
        var colors = ['#0c66e4','#22a06b','#af59e1','#e56910','#c9372c','#1d9aaa','#b38600','#cd519d','#6e5dc6','#6b778c'];
        function el(tag,text,parent) { var node=doc.createElement(tag); if(text!==undefined)node.textContent=text; if(parent)parent.appendChild(node); return node; }
        function render() {
            selected = -1; content.replaceChildren();
            dialog.querySelectorAll('[role=tab]').forEach(function (button) { button.setAttribute('aria-selected',String(button.dataset.chartTab===tab)); });
            var series=s4tChartData(snapshot,excludeNotSure)[tab], total=series.reduce(function(sum,item){return sum+item.value;},0);
            if (!total) { el('p',tab==='dev'?'No assigned points to chart.':'No cards to chart.',content); return; }
            var canvas=el('div',undefined,content); canvas.className='s4t-chart-canvas';
            var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','12 12 336 336');svg.setAttribute('role','group');svg.setAttribute('aria-label',tab==='dev'?'Assigned points by developer':'Card-label assignments');canvas.appendChild(svg);
            var detail=el('div','Hover or use arrow keys · Enter to pin',detached ? canvas : content);detail.className='s4t-chart-detail';detail.setAttribute('aria-live','polite');
            var legend=el('div',undefined,detached ? null : content);legend.className='s4t-chart-legend';
            var slices=[],buttons=[],angle=-Math.PI/2;
            function activate(index) {
                slices.forEach(function(item,i){item.node.style.transform=i===index?'translate('+item.x+'px,'+item.y+'px)':'none';item.node.style.opacity=index<0||i===index?'1':'.6';item.node.setAttribute('aria-pressed',String(i===selected));if(item.label){item.label.style.transform=item.node.style.transform;item.label.style.opacity=item.node.style.opacity;}});
                buttons.forEach(function(button,i){button.setAttribute('aria-pressed',String(i===selected));});
                detail.hidden=detached && index<0;
                detail.textContent=index<0?'Hover or use arrow keys · Enter to pin':series[index].name+' · '+series[index].value+(tab==='dev'?' points':' cards')+' · '+(series[index].value/total*100).toFixed(1)+'%';
            }
            series.forEach(function(item,i){
                var span=item.value/total*Math.PI*2,end=angle+span,mid=angle+span/2;
                var path=doc.createElementNS(svg.namespaceURI,'path');
                if(series.length===1)path.setAttribute('d','M180 30 A150 150 0 1 1 180 330 A150 150 0 1 1 180 30 Z');
                else path.setAttribute('d','M180 180 L'+(180+150*Math.cos(angle))+' '+(180+150*Math.sin(angle))+' A150 150 0 '+(span>Math.PI?1:0)+' 1 '+(180+150*Math.cos(end))+' '+(180+150*Math.sin(end))+' Z');
                path.setAttribute('fill',colors[i%colors.length]);path.setAttribute('class','s4t-chart-slice');path.setAttribute('tabindex',i===0?'0':'-1');path.setAttribute('role','button');path.setAttribute('aria-label',item.name+': '+item.value+', '+(item.value/total*100).toFixed(1)+'%');svg.appendChild(path);
                var button=el('button',undefined,legend);button.type='button';var dot=el('i',undefined,button);dot.style.background=colors[i%colors.length];el('span',item.name,button);el('b',item.value+' · '+(item.value/total*100).toFixed(1)+'%',button);
                var percentage=null;
                if(item.value/total>=.06){percentage=doc.createElementNS(svg.namespaceURI,'text');percentage.setAttribute('class','s4t-chart-percentage');percentage.setAttribute('aria-hidden','true');percentage.setAttribute('x',series.length===1?180:180+98*Math.cos(mid));percentage.setAttribute('y',series.length===1?180:180+98*Math.sin(mid));percentage.textContent=(item.value/total*100).toFixed(0)+'%';svg.appendChild(percentage);}
                slices.push({node:path,label:percentage,x:Math.cos(mid)*10,y:Math.sin(mid)*10});buttons.push(button);
                [path,button].forEach(function(node){node.onmouseenter=function(){activate(i)};node.onmouseleave=function(){activate(selected)};node.onfocus=function(){activate(i)};node.onblur=function(){activate(selected)};node.onclick=function(){selected=selected===i?-1:i;activate(selected)};});
                function navigate(event) {
                    var next;
                    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%series.length;
                    else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i+series.length-1)%series.length;
                    else if(event.key==='Home')next=0;
                    else if(event.key==='End')next=series.length-1;
                    if(next!==undefined){event.preventDefault();event.stopPropagation();slices.forEach(function(slice,n){slice.node.setAttribute('tabindex',n===next?'0':'-1');});slices[next].node.focus();activate(next);}
                    else if(event.currentTarget===path && (event.key==='Enter'||event.key===' ')){event.preventDefault();path.onclick();}
                }
                path.onkeydown=navigate;button.onkeydown=navigate;
                angle=end;
            });
            activate(-1);
            if(!detached) el('p',(snapshot.name || 'Current board')+' · '+(excludeNotSure?'Not Sure lists excluded. ':'All lists. ')+(tab==='dev'?'Assigned points count once per assigned developer; shared cards can appear in multiple slices. Unestimated cards do not add points.':'Each label counts its cards. Multi-label cards count once per label; unlabeled cards appear under No labels.'),content).className='s4t-chart-note';
        }
        function load(force) {
            var token=++request;content.innerHTML='<div class="s4t-chart-loading" aria-label="Loading charts"></div>';dialog.querySelector('[data-chart-popout]').disabled=true;
            dialog.querySelector('[data-chart-refresh]').disabled=true;
            fetchBoardData(boardId,force,function(error,board){
                if(token!==request||!dialog.isConnected)return;
                dialog.querySelector('[data-chart-refresh]').disabled=false;
                if(error||!board){content.replaceChildren();el('p','Could not load charts. Try Refresh.',content);return;}
                snapshot=board;dialog.querySelector('[data-chart-popout]').disabled=false;render();
            });
        }
        dialog.querySelectorAll('[data-chart-tab]').forEach(function(button){button.onclick=function(){tab=button.dataset.chartTab;if(snapshot)render();};});
        dialog.querySelector('[data-chart-refresh]').onclick=function(){load(true)};
        dialog.querySelector('[data-chart-close]').onclick=close;
        var popButton=dialog.querySelector('[data-chart-popout]');popButton.hidden=!!detached;
        popButton.onclick=async function(){
            if(peekWindow && !peekWindow.closed){peekWindow.focus();return;}
            if(openingPeek)return;
            openingPeek=true;
            // Capture the theme and data before awaiting: the source dialog may close.
            var theme=getComputedStyle(dialog), background=theme.backgroundColor, variables={};
            ['--ds-surface-overlay','--ds-text','--ds-text-subtle','--ds-background-neutral','--ds-background-neutral-hovered','--ds-border','--ds-background-selected','--ds-text-selected'].forEach(function(key){variables[key]=theme.getPropertyValue(key);});
            var initialBoard=snapshot, initialTab=tab;
            try {
                var pop;
                if(window.documentPictureInPicture && window.documentPictureInPicture.requestWindow){
                    try {pop=await window.documentPictureInPicture.requestWindow({width:420,height:480,disallowReturnToOpener:true});} catch(ignore) { /* Fall back when floating windows are unavailable. */ }
                }
                if(!pop)pop=window.open('about:blank','_blank','popup,width=420,height=480');
                if(!pop){
                    if(dialog.isConnected){var message=dialog.querySelector('.s4t-chart-pop-error');if(!message){message=el('p',undefined,content);message.className='s4t-chart-pop-error';message.setAttribute('role','status');}message.textContent='Could not open chart window. Allow pop-ups and try again.';}
                    return;
                }
                peekWindow=pop;
                pop.opener=null;pop.document.title='Sprint Helper Charts';
                pop.document.body.style.cssText='margin:0;width:100vw;height:100dvh;overflow:hidden;background:'+background;
                Object.keys(variables).forEach(function(key){if(variables[key])pop.document.documentElement.style.setProperty(key,variables[key]);});
                // A separate mount owns its close action; closing the source only removes its overlay.
                mount(pop.document,pop.document.body,boardId,excludeNotSure,initialBoard,function(){pop.close();if(peekWindow===pop)peekWindow=null;},true).select(initialTab);
                pop.addEventListener('pagehide',function(){if(peekWindow===pop)peekWindow=null;},{once:true});
            } finally {openingPeek=false;}
        };
        dialog.onkeydown=function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){var nodes=Array.from(dialog.querySelectorAll('button:not(:disabled),[tabindex="0"]')).filter(function(n){return !n.hidden});var first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}};
        if(snapshot)render();else load(false);
        (detached ? dialog.querySelector('.s4t-chart-slice') || dialog.querySelector('[data-chart-tab]') : dialog.querySelector('[data-chart-tab]')).focus();
        return {select:function(value){tab=value;render();if(detached){var slice=dialog.querySelector('.s4t-chart-slice');if(slice)slice.focus();}}};
    }
    return function () {
        if(overlay) return;
        var boardId=getBoardShortLink();if(!boardId)return;
        var exclude=!!document.getElementById('s4t-exclude-not-sure')?.checked, previous=document.activeElement;
        overlay=document.createElement('div');overlay.className='s4t-chart-overlay';document.body.appendChild(overlay);
        function close(){if(overlay)overlay.remove();overlay=null;if(previous&&previous.isConnected)previous.focus();}
        overlay.onmousedown=function(event){if(event.target===overlay)close();};
        mount(document,overlay,boardId,exclude,null,close,false);
    };
})();
