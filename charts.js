/* Pie charts use board snapshots; they never change Trello cards. */
function s4tChartData(board, excludeNotSure) {
    var members = new Map((board.members || []).map(function (m) { return [m.id, m.fullName || m.username || 'Member']; }));
    var labels = new Map((board.labels || []).map(function (l) { return [l.id, l.name || (l.color || 'Unnamed') + ' label']; }));
    var labelColors = new Map((board.labels || []).map(function(l){return [l.id,l.color];}));
    var excluded = new Set((board.lists || []).filter(function (l) { return l.closed || (excludeNotSure && /\bnot[\s_-]*sure\b/i.test(l.name)); }).map(function (l) { return l.id; }));
    var dev = new Map(), label = new Map(), devCards = new Map();
    function add(map, id, name, value) { if (!map.has(id)) map.set(id,{id:id,name:name,value:0}); map.get(id).value += value; }
    (board.cards || []).forEach(function (card) {
        if (card.closed || excluded.has(card.idList) || s4tIsCommonCard(card)) return;
        var ids = Array.from(new Set(card.idMembers || []));
        if (members.size && Array.from(members.keys()).every(function (id) { return ids.includes(id); })) return;
        (ids.length?ids:['__none__']).forEach(function(id){devCards.set(id,(devCards.get(id)||0)+1);});
        var points = parsePoints(card.name).assigned;
        if (points !== null && points > 0) {
            if (!ids.length) add(dev,'__none__','Unassigned',points);
            else ids.forEach(function (id) { add(dev,id,members.get(id) || 'Former member',points); });
        }
        var cardLabels = new Map((card.labels || []).map(function (l) { return [l.id, l.name || (l.color || 'Unnamed') + ' label']; }));
        var labelIds = Array.from(new Set(card.idLabels || Array.from(cardLabels.keys())));
        if (!labelIds.length) {add(label,'__none__','No labels',1);label.get('__none__').points=(label.get('__none__').points||0)+(points||0);}
        else labelIds.forEach(function (id) { add(label,id,labels.get(id) || cardLabels.get(id) || 'Unnamed label',1);var cardLabel=(card.labels||[]).find(function(l){return l.id===id;});label.get(id).points=(label.get(id).points||0)+(points||0);label.get(id).color=labelColors.has(id)?labelColors.get(id):(cardLabel&&cardLabel.color)||null; });
    });
    function sorted(map) { return Array.from(map.values()).map(function (entry) { entry.value = Math.round(entry.value*100)/100; return entry; }).sort(function (a,b) { return b.value-a.value || a.name.localeCompare(b.name); }); }
    return {dev:sorted(dev).map(function(item){item.cards=devCards.get(item.id)||0;item.points=item.value;return item;}),labels:sorted(label).map(function(item){item.cards=item.value;item.points=Math.round((item.points||0)*100)/100;return item;})};
}

function s4tChartLabelColor(color) {
    var tones = {
        green:['#baf3db','#4bce97','#1f845a'],yellow:['#f8e6a0','#f5cd47','#946f00'],orange:['#fedec8','#fea362','#c25100'],red:['#ffd5d2','#f87168','#c9372c'],
        purple:['#dfd8fd','#9f8fef','#6e5dc6'],blue:['#cce0ff','#579dff','#0c66e4'],sky:['#c6edfb','#6cc3e0','#227d9b'],lime:['#d3f1a7','#94c748','#5b7f24'],pink:['#fdd0ec','#e774bb','#ae4787'],black:['#dcdfe4','#8590a2','#626f86']
    };
    var parts=String(color||'').split('_'), base=parts[0], shade=parts[1];
    if(!tones[base])return '#8590a2';
    var tokenBase={sky:'teal',lime:'lime',black:'gray'}[base]||base;
    return 'var(--ds-background-accent-'+tokenBase+'-'+(shade==='light'?'subtler':shade==='dark'?'bolder':'subtle')+', '+tones[base][shade==='light'?0:shade==='dark'?2:1]+')';
}

function s4tChartCopyFields(tab, saved) {
    var keys=['name','points','cards','percentage'],defaults=tab==='labels'?['name','cards','percentage']:['name','points'];
    var fields=[],seen=new Set();
    if(Array.isArray(saved))saved.forEach(function(field){if(field&&keys.includes(field.key)&&!seen.has(field.key)){fields.push({key:field.key,enabled:field.enabled!==false});seen.add(field.key);}});
    keys.forEach(function(key){if(!seen.has(key))fields.push({key:key,enabled:defaults.includes(key)});});
    return fields;
}
function s4tChartCopyLine(item,total,fields) {
    var values={name:item.name,points:item.points+' points',cards:item.cards+' cards',percentage:(total?item.value/total*100:0).toFixed(1)+'%'};
    var selected=fields.filter(function(field){return field.enabled;});
    return selected.map(function(field,i){return (i?(selected[i-1].key==='name'?' — ':' · '):'')+values[field.key];}).join('');
}
function s4tChartCopyText(board, excludeNotSure, tab, fields) {
    var series=s4tChartData(board,excludeNotSure)[tab]||[],total=series.reduce(function(sum,item){return sum+item.value;},0);
    fields=s4tChartCopyFields(tab,fields);
    return series.map(function(item){return s4tChartCopyLine(item,total,fields);}).filter(Boolean).join('\n');
}

var s4tOpenCharts = (function () {
    var overlay, peekWindow, openingPeek = false;
    var copyPreferences={},copyKey='s4t-chart-copy-template-v1';
    function readFields(tab){try{var saved=JSON.parse(localStorage.getItem(copyKey)||'{}');if(saved&&typeof saved==='object')copyPreferences=saved;}catch(_){}return s4tChartCopyFields(tab,copyPreferences[tab]);}

    var css = `
.s4t-chart-overlay{position:fixed;inset:0;z-index:2147483600;background:#0007;display:grid;place-items:center;padding:16px}
.s4t-chart-dialog{box-sizing:border-box;width:min(960px,94vw);height:min(660px,94vw,92vh);position:relative;display:flex;flex-direction:column;overflow:hidden;background:var(--ds-surface-overlay,#fff);color:var(--ds-text,#172b4d);border:1px solid var(--ds-border,#dcdfe4);border-radius:16px;box-shadow:0 16px 48px #0004;font:14px/1.4 system-ui,sans-serif}
.s4t-chart-dialog header{display:flex;align-items:center;gap:8px;padding:14px 16px;flex-shrink:0}.s4t-chart-dialog h2{font-size:17px;margin:0;margin-right:auto}.s4t-chart-dialog button{font:inherit;color:inherit;background:var(--ds-background-neutral,#f1f2f4);border:0;border-radius:7px;padding:7px 10px;cursor:pointer}.s4t-chart-dialog button:hover{background:var(--ds-background-neutral-hovered,#dcdfe4)}
.s4t-chart-dialog [role=tablist]{display:flex;gap:6px;padding:0 16px 10px}.s4t-chart-dialog [aria-selected=true]{background:var(--ds-background-selected,#e9f2ff);color:var(--ds-text-selected,#0055cc)}
.s4t-chart-content{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(240px,1fr);grid-template-rows:minmax(0,1fr) auto auto;gap:10px 24px;min-height:0;flex:1;overflow:hidden;overscroll-behavior:contain;padding:0 16px 20px}.s4t-chart-canvas{position:relative;width:100%;height:100%;min-height:0;grid-column:1;grid-row:1;margin:auto}.s4t-chart-canvas svg{display:block;width:100%;height:100%;overflow:visible}.s4t-chart-slice{cursor:pointer;transition:transform .18s ease,opacity .18s ease;stroke:var(--ds-surface-overlay,#fff);stroke-width:2}.s4t-chart-slice:focus-visible{outline:none;stroke:var(--ds-text,#172b4d);stroke-width:4}
.s4t-chart-detail{grid-column:1;grid-row:2;text-align:center;min-height:22px;margin:3px 0 10px;font-weight:600;font-variant-numeric:tabular-nums}.s4t-chart-legend{grid-column:2;grid-row:1/3;display:grid;grid-template-columns:minmax(0,1fr);align-content:start;overflow:auto;min-height:0;padding:4px 4px 12px;gap:5px}.s4t-chart-legend button{display:flex;align-items:center;text-align:left;gap:7px;font-size:12px;background:transparent}.s4t-chart-legend i{width:10px;height:10px;flex-shrink:0;border-radius:50%}.s4t-chart-legend span{overflow-wrap:anywhere}.s4t-chart-legend b{margin-left:auto;white-space:nowrap}.s4t-chart-note{grid-column:1/-1;grid-row:3;border-top:1px solid var(--ds-border,#dcdfe4);padding-top:10px;font-size:12px;color:var(--ds-text-subtle,#626f86);margin:10px 0 0}.s4t-chart-dialog :focus-visible{outline:2px solid var(--ds-border-focused,#388bff);outline-offset:2px}
.s4t-chart-loading{grid-column:1/-1;grid-row:1/4;height:250px;margin:15px;border-radius:12px;background:linear-gradient(100deg,var(--ds-background-neutral,#f1f2f4) 25%,var(--ds-background-neutral-hovered,#dcdfe4) 50%,var(--ds-background-neutral,#f1f2f4) 75%);background-size:200% 100%;animation:s4t-chart-load 1s linear infinite}@keyframes s4t-chart-load{to{background-position:-200% 0}}
.s4t-chart-detached{width:100%;height:100dvh;aspect-ratio:auto;border:0;border-radius:0;box-shadow:none}
.s4t-chart-detached header{padding:8px 10px}.s4t-chart-detached [role=tablist]{padding:0 10px 6px}.s4t-chart-detached [role=tab]{flex:1;font-size:12px;padding:6px}
.s4t-chart-detached .s4t-chart-content{padding:0 4px 4px;display:flex;overflow:hidden}
.s4t-chart-detached .s4t-chart-canvas{width:100%;height:100%;min-height:0;display:flex;justify-content:center;align-items:center}.s4t-chart-detached .s4t-chart-canvas svg{width:100%;height:100%;min-height:0}
.s4t-chart-detached .s4t-chart-detail{position:absolute;bottom:8px;left:50%;transform:translateX(-50%);box-sizing:border-box;max-width:95%;width:max-content;padding:7px 10px;border-radius:8px;background:var(--ds-surface-overlay,#fff);box-shadow:0 2px 12px #0003;border:1px solid var(--ds-border,#dcdfe4);font-size:12px;margin:0;pointer-events:none}
.s4t-chart-detached .s4t-chart-loading{flex:1;height:auto;min-height:100px}
.s4t-chart-percentage{fill:white;font:700 14px system-ui,sans-serif;paint-order:stroke;stroke:#172b4d;stroke-width:3px;stroke-linejoin:round;pointer-events:none;text-anchor:middle;dominant-baseline:middle;transition:transform .18s ease,opacity .18s ease}
.s4t-chart-copy-status{position:absolute;bottom:12px;left:50%;transform:translateX(-50%);max-width:90%;padding:6px 12px;border-radius:8px;background:var(--ds-surface-overlay,#fff);box-shadow:0 2px 12px #0003;font-size:12px;pointer-events:none}.s4t-chart-copy-status:empty{display:none}.s4t-chart-dialog [data-chart-copy]{display:inline-flex;align-items:center;justify-content:center}.s4t-chart-dialog .s4t-chart-legend button.copied,.s4t-chart-dialog [data-chart-copy].copied{color:var(--ds-text-success,#216e4e);background:var(--ds-background-success,#dcfff1)}
.s4t-chart-copy-control{display:inline-flex;align-items:stretch;border:1px solid var(--ds-border,#dcdfe4);border-radius:7px;overflow:hidden;background:var(--ds-background-neutral,#f1f2f4)}.s4t-chart-dialog .s4t-chart-copy-control button{border-radius:0;margin:0;background:transparent}.s4t-chart-dialog .s4t-chart-copy-control [data-copy-options]{position:relative;padding:5px 7px}.s4t-chart-copy-control [data-copy-options]::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:1px;background:var(--ds-border,#b3b9c4)}.s4t-chart-dialog .s4t-chart-copy-control button:hover{background:var(--ds-background-neutral-hovered,#dcdfe4)}.s4t-chart-copy-editor{position:absolute;z-index:4;top:54px;right:14px;width:min(360px,calc(100% - 28px));box-sizing:border-box;padding:14px;border:1px solid var(--ds-border,#dcdfe4);border-radius:10px;background:var(--ds-surface-overlay,#fff);box-shadow:0 8px 24px #0003}.s4t-chart-copy-editor[hidden]{display:none}.s4t-copy-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.s4t-copy-editable{font-size:10px;padding:2px 5px;border-radius:4px;color:var(--ds-text-subtle,#626f86);background:var(--ds-background-neutral,#f1f2f4)}.s4t-chart-copy-fields{display:flex;flex-wrap:nowrap;gap:5px;margin:12px 0 0;padding:6px 5px 9px;border-radius:6px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:thin}.s4t-chart-copy-fields button{position:relative;display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;white-space:nowrap;font-size:11px;padding:4px 5px;border:1px solid transparent;border-radius:6px;cursor:grab;user-select:none;transition:background .15s,color .15s,opacity .15s}.s4t-chart-copy-fields button[aria-checked=true]{color:var(--ds-text-success,#216e4e);background:var(--ds-background-success,#dcfff1);border-color:var(--ds-border-success,#4bce97)}.s4t-chart-copy-fields button[aria-checked=false]{opacity:.5}.s4t-copy-grip{opacity:.5;font-size:12px;line-height:1}.s4t-copy-check{display:inline-block;width:10px;font-size:11px}.s4t-chart-copy-fields button[aria-checked=false] .s4t-copy-check{visibility:hidden}.s4t-chart-copy-fields .s4t-copy-selected .s4t-copy-check{animation:s4t-copy-tick .24s ease-out}.s4t-chart-copy-fields button.s4t-copy-dragging{opacity:.3;cursor:grabbing}.s4t-chart-copy-fields [data-drop-edge]::after{content:"";position:absolute;top:-3px;bottom:-3px;width:3px;border-radius:2px;background:var(--ds-border-focused,#388bff)}.s4t-chart-copy-fields [data-drop-edge=before]::after{left:-5px}.s4t-chart-copy-fields [data-drop-edge=after]::after{right:-5px}.s4t-chart-copy-editor p{font-size:12px;margin:6px 0;color:var(--ds-text-subtle,#626f86)}.s4t-chart-copy-editor .s4t-copy-notice:empty{display:none}.s4t-chart-copy-editor .s4t-copy-example{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 system-ui;margin:16px 0 0;padding-top:10px;border-top:1px solid var(--ds-border,#dcdfe4)}@keyframes s4t-copy-tick{from{transform:scale(.4);opacity:0}to{transform:scale(1);opacity:1}}@media(prefers-reduced-motion:reduce){.s4t-chart-copy-fields button{transition:none}.s4t-chart-copy-fields .s4t-copy-selected .s4t-copy-check{animation:none}}
@media(max-width:620px){.s4t-chart-dialog:not(.s4t-chart-detached) .s4t-chart-content{grid-template-columns:1fr;grid-template-rows:minmax(150px,1fr) auto minmax(80px,.6fr) auto;gap:8px}.s4t-chart-dialog:not(.s4t-chart-detached) .s4t-chart-legend{grid-column:1;grid-row:3}.s4t-chart-dialog:not(.s4t-chart-detached) .s4t-chart-note{grid-row:4}}
@media(prefers-reduced-motion:reduce){.s4t-chart-slice,.s4t-chart-percentage{transition:none}.s4t-chart-loading{animation:none}}
`;
    function mount(doc, host, boardId, excludeNotSure, initial, close, detached) {
        var style = doc.createElement('style'); style.textContent = css; host.appendChild(style);
        var dialog = doc.createElement('section'); dialog.className = 's4t-chart-dialog' + (detached ? ' s4t-chart-detached' : ''); dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-label','Sprint charts');
        dialog.innerHTML = '<header><h2>Charts</h2><div class="s4t-chart-copy-control" role="group" aria-label="Copy chart"><button type="button" data-chart-copy aria-label="Copy chart text" title="Copy chart text"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/></svg></button><button type="button" data-copy-options aria-label="Copy format" title="Copy format" aria-expanded="false">⌄</button></div><button type="button" data-chart-popout aria-label="Pop out chart" title="Pop out chart">↗</button><button type="button" data-chart-refresh aria-label="Refresh charts" title="Refresh charts">↻</button><button type="button" data-chart-close aria-label="Close charts">✕</button></header><div role="tablist" aria-label="Chart type"><button type="button" role="tab" data-chart-tab="dev">Points by developer</button><button type="button" role="tab" data-chart-tab="labels">Cards by label</button></div><div class="s4t-chart-content" role="tabpanel"></div>';
        host.appendChild(dialog);
        var copyEditor=doc.createElement('div');copyEditor.className='s4t-chart-copy-editor';copyEditor.hidden=true;copyEditor.setAttribute('role','group');copyEditor.setAttribute('aria-label','Copy format');dialog.appendChild(copyEditor);
        var optionsButton=dialog.querySelector('[data-copy-options]');
        function closeOptions(){copyEditor.hidden=true;optionsButton.setAttribute('aria-expanded','false');}
        function renderOptions(){
            var fields=readFields(tab),dragKey=null,dropAt=null,suppressClick=false;copyEditor.replaceChildren();
            var heading=el('div',undefined,copyEditor);heading.className='s4t-copy-heading';
            el('strong',tab==='dev'?'Developer copy format':'Label copy format',heading);
            el('span','✎ Editable',heading).className='s4t-copy-editable';
            el('p','Click fields to include · Drag the grips to arrange',copyEditor);
            var chips=el('div',undefined,copyEditor);chips.className='s4t-chart-copy-fields';
            var notice=el('p','',copyEditor);notice.className='s4t-copy-notice';notice.setAttribute('role','status');
            var preview=el('p',undefined,copyEditor);preview.className='s4t-copy-example';
            function previewText(){preview.textContent='e.g. '+(snapshot?(s4tChartCopyText(snapshot,excludeNotSure,tab,fields).split('\n')[0]||'Select at least one field.'):'Loading preview…');}
            function save(){copyPreferences[tab]=fields;try{localStorage.setItem(copyKey,JSON.stringify(copyPreferences));notice.textContent='';}catch(_){notice.textContent='Could not save this format. Browser storage is unavailable.';}previewText();}
            function move(from,to){if(from<0||from===to)return;var moved=fields.splice(from,1)[0];fields.splice(to,0,moved);save();draw();chips.querySelector('[data-copy-field="'+moved.key+'"]').focus();}
            function clearDrop(){chips.querySelectorAll('[data-drop-edge]').forEach(function(node){node.removeAttribute('data-drop-edge');});}
            chips.ondragover=function(event){
                if(!dragKey)return;event.preventDefault();event.dataTransfer.dropEffect='move';clearDrop();
                var target=event.target.closest('[data-copy-field]');
                if(!target||!chips.contains(target))target=chips.lastElementChild;
                var index=fields.findIndex(function(item){return item.key===target.dataset.copyField;}),rect=target.getBoundingClientRect();
                var after=event.clientX>=rect.left+rect.width/2;
                dropAt=index+(after?1:0);target.dataset.dropEdge=after?'after':'before';
            };
            chips.ondragleave=function(event){if(!chips.contains(event.relatedTarget)){clearDrop();dropAt=null;}};
            chips.ondrop=function(event){
                if(!dragKey||dropAt===null)return;event.preventDefault();event.stopPropagation();
                var from=fields.findIndex(function(item){return item.key===dragKey;}),to=dropAt-(from<dropAt?1:0);
                clearDrop();dragKey=null;dropAt=null;suppressClick=true;move(from,to);setTimeout(function(){suppressClick=false;},0);
            };
            function draw(){chips.replaceChildren();fields.forEach(function(field,index){
                var chip=el('button',undefined,chips);chip.type='button';chip.draggable=true;chip.dataset.copyField=field.key;chip.setAttribute('role','checkbox');chip.setAttribute('aria-checked',String(field.enabled));
                var name=field.key==='name'?(tab==='dev'?'Dev name':'Label name'):field.key[0].toUpperCase()+field.key.slice(1);
                chip.setAttribute('aria-label',name);chip.title='Click to toggle · Drag to reorder · Alt + Left/Right';
                el('span','⠿',chip).className='s4t-copy-grip';el('span',name,chip);el('span','✓',chip).className='s4t-copy-check';
                chip.onclick=function(){if(suppressClick)return;field.enabled=!field.enabled;chip.setAttribute('aria-checked',String(field.enabled));chip.classList.toggle('s4t-copy-selected',field.enabled);save();};
                chip.ondragstart=function(event){dragKey=field.key;dropAt=null;suppressClick=true;event.dataTransfer.setData('text/plain',field.key);event.dataTransfer.effectAllowed='move';chip.classList.add('s4t-copy-dragging');};
                chip.ondragend=function(){chip.classList.remove('s4t-copy-dragging');clearDrop();dragKey=null;dropAt=null;setTimeout(function(){suppressClick=false;},0);};
                chip.onkeydown=function(event){if(event.altKey&&(event.key==='ArrowLeft'||event.key==='ArrowRight')){event.preventDefault();event.stopPropagation();move(index,Math.max(0,Math.min(fields.length-1,index+(event.key==='ArrowLeft'?-1:1))));}};
            });}draw();previewText();
        }

        optionsButton.onclick=function(){if(copyEditor.hidden){renderOptions();copyEditor.hidden=false;optionsButton.setAttribute('aria-expanded','true');}else closeOptions();};
        dialog.addEventListener('pointerdown',function(event){if(!copyEditor.contains(event.target)&&!optionsButton.contains(event.target))closeOptions();});
        var copyStatus=doc.createElement('div');copyStatus.className='s4t-chart-copy-status';copyStatus.setAttribute('role','status');dialog.appendChild(copyStatus);
        var content = dialog.querySelector('.s4t-chart-content'), tab = 'dev', snapshot = initial, request = 0, selected = -1;
        var colors = ['#0c66e4','#22a06b','#af59e1','#e56910','#c9372c','#1d9aaa','#b38600','#cd519d','#6e5dc6','#6b778c'];
        function el(tag,text,parent) { var node=doc.createElement(tag); if(text!==undefined)node.textContent=text; if(parent)parent.appendChild(node); return node; }
        function render() {
            selected = -1; content.replaceChildren();
            copyButton.disabled=false;
            dialog.querySelectorAll('[role=tab]').forEach(function (button) { button.setAttribute('aria-selected',String(button.dataset.chartTab===tab)); });
            var series=s4tChartData(snapshot,excludeNotSure)[tab], total=series.reduce(function(sum,item){return sum+item.value;},0);
            if (!total) { copyButton.disabled=true; el('p',tab==='dev'?'No assigned points to chart.':'No cards to chart.',content); return; }
            var canvas=el('div',undefined,content); canvas.className='s4t-chart-canvas';
            var svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','12 12 336 336');svg.setAttribute('role','group');svg.setAttribute('aria-label',tab==='dev'?'Assigned points by developer':'Card-label assignments');canvas.appendChild(svg);
            var detail=el('div','Hover or use arrow keys · Enter to pin',detached ? canvas : content);detail.className='s4t-chart-detail';detail.setAttribute('aria-live','polite');
            var legend=el('div',undefined,detached ? null : content);legend.className='s4t-chart-legend';
            var slices=[],buttons=[],angle=-Math.PI/2;
            function activate(index, showPercentage) {
                slices.forEach(function(item,i){item.node.style.transform=i===index?'translate('+item.x+'px,'+item.y+'px)':'none';item.node.style.opacity=index<0||i===index?'1':'.6';item.node.setAttribute('aria-pressed',String(i===selected));if(item.label){item.label.style.transform=item.node.style.transform;item.label.style.opacity=showPercentage&&i===index?'1':'0';}});
                buttons.forEach(function(button,i){button.setAttribute('aria-pressed',String(i===selected));});
                detail.hidden=detached && index<0;
                detail.textContent=index<0?'Hover or use arrow keys · Enter to pin':series[index].name+' · '+series[index].value+(tab==='dev'?' points':' cards')+' · '+(series[index].value/total*100).toFixed(1)+'%';
            }
            series.forEach(function(item,i){
                var span=item.value/total*Math.PI*2,end=angle+span,mid=angle+span/2;
                var path=doc.createElementNS(svg.namespaceURI,'path');
                if(series.length===1)path.setAttribute('d','M180 30 A150 150 0 1 1 180 330 A150 150 0 1 1 180 30 Z');
                else path.setAttribute('d','M180 180 L'+(180+150*Math.cos(angle))+' '+(180+150*Math.sin(angle))+' A150 150 0 '+(span>Math.PI?1:0)+' 1 '+(180+150*Math.cos(end))+' '+(180+150*Math.sin(end))+' Z');
                var color=tab==='labels'?s4tChartLabelColor(item.color):colors[i%colors.length];path.setAttribute('fill',color);path.setAttribute('class','s4t-chart-slice');path.setAttribute('tabindex',i===0?'0':'-1');path.setAttribute('role','button');path.setAttribute('aria-label',item.name+': '+item.value+', '+(item.value/total*100).toFixed(1)+'%');svg.appendChild(path);
                var button=el('button',undefined,legend);button.type='button';var dot=el('i',undefined,button);dot.style.background=color;el('span',item.name,button);el('b',item.value+(tab==='dev'?' points':' cards')+' · '+(item.value/total*100).toFixed(1)+'%',button);
                button.title='Double-click to copy this row';
                button.ondblclick=function(event){event.preventDefault();copyValue(s4tChartCopyLine(item,total,readFields(tab)),button);};
                var percentage=null;
                {percentage=doc.createElementNS(svg.namespaceURI,'text');percentage.setAttribute('class','s4t-chart-percentage');percentage.setAttribute('aria-hidden','true');percentage.setAttribute('x',series.length===1?180:180+98*Math.cos(mid));percentage.setAttribute('y',series.length===1?180:180+98*Math.sin(mid));percentage.textContent=(item.value/total*100).toFixed(1)+'%';svg.appendChild(percentage);}
                slices.push({node:path,label:percentage,x:Math.cos(mid)*10,y:Math.sin(mid)*10});buttons.push(button);
                [path,button].forEach(function(node){node.onmouseenter=function(){activate(i,true)};node.onmouseleave=function(){activate(selected)};node.onfocus=function(){activate(i,true)};node.onblur=function(){activate(selected)};node.onclick=function(){selected=selected===i?-1:i;activate(selected)};});
                function navigate(event) {
                    var next;
                    if(event.key==='ArrowRight'||event.key==='ArrowDown')next=(i+1)%series.length;
                    else if(event.key==='ArrowLeft'||event.key==='ArrowUp')next=(i+series.length-1)%series.length;
                    else if(event.key==='Home')next=0;
                    else if(event.key==='End')next=series.length-1;
                    if(next!==undefined){event.preventDefault();event.stopPropagation();slices.forEach(function(slice,n){slice.node.setAttribute('tabindex',n===next?'0':'-1');});slices[next].node.focus();activate(next,true);}
                    else if(event.currentTarget===path && (event.key==='Enter'||event.key===' ')){event.preventDefault();path.onclick();}
                }
                path.onkeydown=navigate;button.onkeydown=navigate;
                angle=end;
            });
            slices.forEach(function(slice){if(slice.label)svg.appendChild(slice.label);});
            activate(-1);
            if(!detached) el('p',(snapshot.name || 'Current board')+' · '+(excludeNotSure?'Not Sure lists excluded. ':'All lists. ')+(tab==='dev'?'Assigned points count once per assigned developer; shared cards can appear in multiple slices. Unestimated cards do not add points.':'Each label counts its cards. Multi-label cards count once per label; unlabeled cards appear under No labels.'),content).className='s4t-chart-note';
        }
        function load(force) {
            copyButton.disabled=true;
            var token=++request;content.innerHTML='<div class="s4t-chart-loading" aria-label="Loading charts"></div>';dialog.querySelector('[data-chart-popout]').disabled=true;
            dialog.querySelector('[data-chart-refresh]').disabled=true;
            fetchBoardData(boardId,force,function(error,board){
                if(token!==request||!dialog.isConnected)return;
                dialog.querySelector('[data-chart-refresh]').disabled=false;
                if(error||!board){content.replaceChildren();el('p','Could not load charts. Try Refresh.',content);return;}
                snapshot=board;dialog.querySelector('[data-chart-popout]').disabled=false;render();
            });
        }
        var copyButton=dialog.querySelector('[data-chart-copy]'),copyIcon=copyButton.innerHTML,copyTimer;
        copyButton.onclick=function(){if(snapshot&&!copyButton.disabled)copyValue(s4tChartCopyText(snapshot,excludeNotSure,tab,readFields(tab)));};
        async function copyValue(value,row){
            if(copyButton.disabled)return;
            if(!value){copyStatus.textContent='Select at least one field in Copy format.';return;}
            copyButton.disabled=true;
            try {
                var clipboard=doc.defaultView&&doc.defaultView.navigator.clipboard;
                try {if(!clipboard)throw Error();await clipboard.writeText(value);}
                catch(_) {
                    var previous=doc.activeElement,field=doc.createElement('textarea');field.value=value;field.style.cssText='position:fixed;left:-9999px';dialog.appendChild(field);
                    try {field.select();if(!doc.execCommand('copy'))throw Error();} finally {field.remove();if(previous&&previous.isConnected)previous.focus();}
                }
                copyButton.innerHTML='<span aria-hidden="true">✓</span>';copyButton.classList.add('copied');copyButton.removeAttribute('title');copyStatus.textContent=row?'Row copied':'Chart text copied';if(row){row.classList.add('copied');row.removeAttribute('title');setTimeout(function(){row.classList.remove('copied');row.title='Double-click to copy this row';},1600);}
            }catch(_){copyStatus.textContent='Could not copy. Please try again.';}
            finally {copyButton.disabled=false;clearTimeout(copyTimer);copyTimer=setTimeout(function(){copyButton.innerHTML=copyIcon;copyButton.classList.remove('copied');copyButton.title='Copy chart text';copyStatus.textContent='';},1600);}
        };
        dialog.querySelectorAll('[data-chart-tab]').forEach(function(button){button.onclick=function(){tab=button.dataset.chartTab;closeOptions();if(snapshot)render();};});
        dialog.querySelector('[data-chart-refresh]').onclick=function(){load(true)};
        dialog.querySelector('[data-chart-close]').onclick=close;
        dialog.querySelector('[data-chart-close]').hidden=!!detached;
        var popButton=dialog.querySelector('[data-chart-popout]');popButton.hidden=!!detached;
        popButton.onclick=async function(){
            if(peekWindow && !peekWindow.closed){close();peekWindow.focus();return;}
            if(openingPeek)return;
            openingPeek=true;
            // Capture the theme and data before awaiting: the source dialog may close.
            var theme=getComputedStyle(dialog), background=theme.backgroundColor, variables={};
            ['--ds-surface-overlay','--ds-text','--ds-text-subtle','--ds-background-neutral','--ds-background-neutral-hovered','--ds-border','--ds-background-selected','--ds-text-selected'].concat(['green','yellow','orange','red','purple','blue','teal','lime','pink','gray'].flatMap(function(color){return ['subtler','subtle','bolder'].map(function(tone){return '--ds-background-accent-'+color+'-'+tone;});})).forEach(function(key){variables[key]=theme.getPropertyValue(key);});
            var initialBoard=snapshot, initialTab=tab;
            try {
                var pop;
                if(window.documentPictureInPicture && window.documentPictureInPicture.requestWindow){
                    try {pop=await window.documentPictureInPicture.requestWindow({width:420,height:480,preferInitialWindowPlacement:true,disallowReturnToOpener:true});} catch(ignore) { /* Fall back when floating windows are unavailable. */ }
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
                close();pop.focus();
            } finally {openingPeek=false;}
        };
        dialog.onkeydown=function(event){if(event.key==='Escape'&&!copyEditor.hidden){event.preventDefault();event.stopPropagation();closeOptions();optionsButton.focus();return;}if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}if(event.key==='Tab'){var nodes=Array.from(dialog.querySelectorAll('button:not(:disabled),[tabindex="0"]')).filter(function(n){return !n.hidden&&!n.closest('[hidden]')});var first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first.focus();}}};
        if(snapshot)render();else load(false);
        (detached ? dialog.querySelector('.s4t-chart-slice') || dialog.querySelector('[data-chart-tab]') : dialog.querySelector('[data-chart-tab]')).focus();
        return {select:function(value){tab=value;render();if(detached){var slice=dialog.querySelector('.s4t-chart-slice');if(slice)slice.focus();}}};
    }
    return function () {
        if(overlay) return;
        var boardId=getBoardShortLink();if(!boardId)return;
        var exclude=!!document.getElementById('s4t-exclude-not-sure')?.checked, previous=document.activeElement;
        overlay=document.createElement('div');overlay.className='s4t-chart-overlay';document.body.appendChild(overlay);
        var ownedOverlay=overlay;
        function close(){ownedOverlay.remove();if(overlay===ownedOverlay)overlay=null;if(previous&&previous.isConnected)previous.focus();}
        overlay.onmousedown=function(event){if(event.target===overlay)close();};
        mount(document,overlay,boardId,exclude,null,close,false);
    };
})();
