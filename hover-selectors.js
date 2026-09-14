/* Shared hover menus retain native controls and their existing change handlers. */
(function() {
    var selector='#s4t-eow-dialog select, #s4t-eow-dialog [data-eow-date-range], #s4t-cards-dialog select';
    var owner, menu, timer, month;
    function close() {
        clearTimeout(timer);
        if(owner)owner.setAttribute('aria-expanded','false');
        if(menu)menu.remove();
        owner=null; menu=null;
    }
    function later() { clearTimeout(timer); timer=setTimeout(close,250); }
    function isDate(target) { return target.hasAttribute('data-eow-date-range'); }
    function dateControl(target) { return target.closest('[role="dialog"]').querySelector('[data-eow-week]'); }
    function choose(value) {
        var target=owner;
        var control=isDate(target) ? dateControl(target) : target;
        control.value=value; close();
        control.dispatchEvent(new Event('change',{bubbles:true}));
        target.focus();
    }
    function button(text, action) {
        var node=document.createElement('button'); node.type='button'; node.textContent=text;
        node.addEventListener('mousedown',function(event){event.preventDefault();event.stopPropagation();});
        node.addEventListener('click',action); return node;
    }
    function calendar() {
        menu.replaceChildren();
        var nav=document.createElement('div'); nav.className='s4t-hover-calendar-nav';
        var previous=button('‹',function(){month.setMonth(month.getMonth()-1);calendar();});nav.append(previous);
        var heading=document.createElement('strong'); heading.textContent=month.toLocaleDateString(undefined,{month:'long',year:'numeric'}); nav.append(heading);
        var next=button('›',function(){month.setMonth(month.getMonth()+1);calendar();});nav.append(next);menu.append(nav);
        var currentWeek=s4tEowWeek(), earliest=new Date(currentWeek.start);earliest.setDate(earliest.getDate()-7);
        var latest=new Date(currentWeek.end);latest.setDate(latest.getDate()-1);
        previous.disabled=new Date(month.getFullYear(),month.getMonth(),0)<earliest;
        next.disabled=new Date(month.getFullYear(),month.getMonth()+1,1)>latest;
        var grid=document.createElement('div');grid.className='s4t-hover-calendar-grid';menu.append(grid);
        ['M','T','W','T','F','S','S'].forEach(function(day){var label=document.createElement('span');label.textContent=day;grid.append(label);});
        var first=new Date(month);first.setDate(1-(month.getDay()+6)%7);
        var last=new Date(month.getFullYear(),month.getMonth()+1,0);
        var cells=Math.ceil(((month.getDay()+6)%7+last.getDate())/7)*7;
        var selected=new Date(dateControl(owner).value+'T12:00:00');
        selected.setDate(selected.getDate()-(selected.getDay()+6)%7);selected.setHours(0,0,0,0);
        var end=new Date(selected);end.setDate(end.getDate()+7);
        for(let index=0;index<cells;index++) {
            let date=new Date(first);date.setDate(first.getDate()+index);
            let value=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
            var item=button(String(date.getDate()),function(){if(s4tEowWeekAllowed(value))choose(value);});item.disabled=!s4tEowWeekAllowed(value);item.setAttribute('aria-label',value);
            item.setAttribute('aria-pressed',String(date>=selected && date<end));
            if(date>=selected && date<end)item.classList.add('s4t-week-selected');
            if(date.getMonth()!==month.getMonth())item.classList.add('s4t-calendar-adjacent');
            grid.append(item);
        }
    }
    function open(target) {
        if(target.disabled || target.closest('[inert]') || !target.getClientRects().length)return;
        if(owner===target){clearTimeout(timer);return;}
        close();owner=target;
        menu=document.createElement('div');menu.className='s4t-hover-selector';menu.setAttribute('role','group');menu.setAttribute('aria-label',target.getAttribute('aria-label') || 'Options');
        target.closest('[role="dialog"]').append(menu);target.setAttribute('aria-expanded','true');
        if(isDate(target)) {
            var selected=new Date(dateControl(target).value+'T12:00:00'); if(isNaN(selected))selected=new Date();
            month=new Date(selected.getFullYear(),selected.getMonth(),1);calendar();
        } else {
            Array.from(target.options).forEach(function(option) {
                var item=button(option.textContent,function(){choose(option.value);});
                item.disabled=option.disabled;item.setAttribute('aria-pressed',String(option.selected));menu.append(item);
            });
        }
        var rect=target.getBoundingClientRect();
        menu.style.minWidth=Math.max(rect.width,isDate(target)?280:170)+'px';
        menu.style.left=Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))+'px';
        menu.style.top=(rect.bottom+menu.offsetHeight+4>innerHeight ? Math.max(8,rect.top-menu.offsetHeight-4) : rect.bottom+4)+'px';
        menu.addEventListener('mouseenter',function(){clearTimeout(timer);});menu.addEventListener('mouseleave',later);
    }
    document.addEventListener('mouseover',function(event){var target=event.target.closest(selector);if(target)open(target);});
    document.addEventListener('mouseout',function(event){if(owner && event.target===owner && (!menu || !menu.contains(event.relatedTarget)))later();});
    document.addEventListener('mousedown',function(event){
        var target=event.target.closest(selector);
        if(target){if(isDate(target)){open(target);return;}event.preventDefault();if(owner===target)close();else open(target);return;}
        if(menu && !menu.contains(event.target))close();
    },true);
    document.addEventListener('keydown',function(event){var dateTarget=event.target.closest('#s4t-eow-dialog [data-eow-date-range]');if(dateTarget && event.key==='ArrowDown'){event.preventDefault();open(dateTarget);menu?.querySelector('.s4t-week-selected')?.focus();return;}if(menu && event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();var target=owner;close();target.focus();}},true);
    window.addEventListener('resize',close);
    document.addEventListener('scroll',function(event){if(menu && !menu.contains(event.target))close();},true);
    new MutationObserver(function(){if(owner && (!owner.isConnected || !owner.getClientRects().length || owner.closest('[inert]')))close();}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','inert']});
})();
