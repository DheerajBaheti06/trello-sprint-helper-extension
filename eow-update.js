/* EOW workflow adapted from Klimb-trello-burndown/backend/src/public/app.js.
 * Local drafts only: no card mutations and no automatic Slack publishing. */
function s4tEowWeek(value) {
    var date = value ? new Date(value + 'T12:00:00') : new Date();
    if (isNaN(date.getTime())) date = new Date();
    date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    date.setHours(0, 0, 0, 0);
    var end = new Date(date); end.setDate(end.getDate() + 7);
    var iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    var friday = new Date(date); friday.setDate(friday.getDate() + 4);
    return {start: date, end: end, iso: iso, label: date.toLocaleDateString('en-GB', {day:'numeric',month:'short'}) + ' – ' + friday.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})};
}
function s4tEowWeekAllowed(value, today) {
    var current=s4tEowWeek(today), selected=s4tEowWeek(value);
    var oldest=new Date(current.start);oldest.setDate(oldest.getDate()-7);
    return selected.start>=oldest && selected.start<=current.start;
}
function s4tEowMergeBoards(sources) {
    var cards = new Map(), members = new Map(), lists = new Map();
    sources.forEach(function(source) {
        var ids = (source.members || []).map(function(member) { members.set(member.id, member); return member.id; });
        (source.lists || []).forEach(function(list) { lists.set(list.id, Object.assign({}, list, {name: sources.length > 1 ? source.name + ' · ' + list.name : list.name, categoryName:list.name})); });
        (source.cards || []).forEach(function(card) {
            if (s4tIsCommonCard(card) || (ids.length && ids.every(function(id) { return (card.idMembers || []).includes(id); }))) return;
            var previous = cards.get(card.id);
            if (!previous || new Date(card.dateLastActivity) > new Date(previous.dateLastActivity)) cards.set(card.id, card);
        });
    });
    return {cards:Array.from(cards.values()),members:Array.from(members.values()),lists:Array.from(lists.values()),multiBoard:sources.length>1};
}
// A release date closes that board's period; the next board starts the following day.
function s4tEowReleaseName(name) {
    var text=String(name || ''), match=text.match(/(\d{4})[-_/](\d{1,2})[-_/](\d{1,2})/);
    var year, month, day;
    if(match){year=+match[1];month=+match[2]-1;day=+match[3];}
    else {
        match=text.match(/(\d{1,2})(?:st|nd|rd|th)?[\s_/-]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s_/-]*(\d{4})/i);
        if(!match)return null;
        day=+match[1];month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(match[2].slice(0,3).toLowerCase());year=+match[3];
    }
    var date=new Date(year,month,day);
    if(date.getFullYear()!==year || date.getMonth()!==month || date.getDate()!==day)return null;
    var series=(text.slice(0,match.index)+text.slice(match.index+match[0].length)).toLowerCase().replace(/[^a-z0-9]/g,'');
    if(!series)return null;
    return {date:date,series:series};
}
function s4tEowPreviousReleases(current, boards, week) {
    var parsed=s4tEowReleaseName(current.name);
    if(!parsed)return {releases:[],error:'Release date could not be read from the current board name.'};
    var matches=(boards || []).map(function(board){return {board:board,parsed:s4tEowReleaseName(board.name)};}).filter(function(item){
        return item.parsed && item.parsed.series===parsed.series && item.board.idOrganization===current.idOrganization &&
            item.parsed.date<parsed.date;
    }).sort(function(a,b){return a.parsed.date-b.parsed.date;});
    var releases=[];
    for(var i=0;i<matches.length;i++) {
        var item=matches[i], end=new Date(item.parsed.date);end.setDate(end.getDate()+1);
        var start=i ? new Date(matches[i-1].parsed.date) : new Date(week.start);if(i)start.setDate(start.getDate()+1);
        if(end<=week.start || start>=week.end)continue;
        if(matches.some(function(other){return other!==item && +other.parsed.date===+item.parsed.date;}))return {releases:[],error:'Multiple release boards share this date. Previous-release cards were not loaded.'};
        releases.push({id:item.board.shortLink || item.board.id,name:item.board.name,
            start:new Date(Math.max(+start,+week.start)),end:new Date(Math.min(+end,+week.end))});
    }
    return {releases:releases,error:''};
}
// Fetch dated comment actions for the two selectable weeks; never retain comment text.
async function s4tEowCommentDates(fetchPage, since, before, valid) {
    var dates = {}, cursor = before.toISOString(), cursors = new Set();
    for (var page = 0; page < 30; page++) {
        if (!valid()) return null;
        var actions = await fetchPage({filter:'commentCard', since:since.toISOString(), before:cursor, limit:1000, fields:'id,date,data', memberCreator:false});
        if (!valid()) return null;
        if (!Array.isArray(actions)) throw new Error('Invalid comment history');
        actions.forEach(function (action) {
            var id = action.data && action.data.card && action.data.card.id, time = new Date(action.date).getTime();
            if (id && time >= since.getTime() && time < before.getTime()) {
                if (!dates[id]) dates[id] = [];
                dates[id].push(time);
            }
        });
        if (actions.length < 1000) return dates;
        var last = actions[actions.length - 1];
        if (new Date(last.date) < since) return dates;
        if (!last.id || cursors.has(last.id)) throw new Error('Incomplete comment history');
        cursor = last.id; cursors.add(cursor);
    }
    throw new Error('Comment history exceeds page limit');
}
function s4tEowCategories(board, member, week, excluded) {
    var categories = ['STABILIZATION', 'HOTFIX', 'FEATURES', 'DEV-OPS', 'RELEASE TASKS'].map(function(name) { return {name:name,cards:[]}; });
    var lists = new Map((board.lists || []).map(function(list) { return [list.id, list.categoryName || list.name]; }));
    var members = (board.members || []).map(function(m) { return m.id; });
    var cards = (board.cards || []).filter(function(card) {
        return (board.multiBoard || !card.closed) && !s4tIsCommonCard(card) && (card.idMembers || []).includes(member) &&
            !(!board.multiBoard && members.length && members.every(function(id) { return (card.idMembers || []).includes(id); })) && !excluded.includes(card.idList);
    });
    var matches = cards.filter(function(card) {
        // A due date outside the week must not hide work updated during the week.
        var activity = new Date(card.due).getTime();
        var lastActivity = new Date(card.dateLastActivity).getTime();
        var created = /^[a-f\d]{24}$/i.test(card.id || '') ? parseInt(card.id.slice(0, 8), 16) * 1000 : NaN;
        return (activity >= week.start && activity < week.end) || (lastActivity >= week.start && lastActivity < week.end) || (created >= week.start && created < week.end) ||
            (card.s4tCommentDates || []).some(function (time) { return time >= week.start && time < week.end; });
    });
    (board.allDates ? cards : matches).forEach(function(card) {
        var list = String(lists.get(card.idList) || '').toLowerCase();
        var labels = (card.labels || []).map(function(label) { return String(typeof label === 'string' ? label : label.name || '').trim(); });
        var title = (card.name || '').replace(/[([{]\s*(?:\?|\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:pts?|points?)?\s*[)\]}]/gi, ' ').replace(/\s+/g, ' ').trim();
        var uiUx = /\b(?:ui|ux)(?:\s*[/&-]\s*(?:ui|ux))?\b|\buser\s+(?:interface|experience)\b/i;
        // Hotfix is label-only and takes precedence over other classifications.
        var category = labels.some(function(label) { return /\bhot[\s-]?fix\b/i.test(label); }) ? 1 :
            /(?:^|[\s#])dev[\s_-]*ops\s*[.!]?$/i.test(title) ? 3 :
            uiUx.test(title) || labels.some(function(label) { return uiUx.test(label); }) || uiUx.test(list) ? 0 :
            labels.some(function(label) { return /\bclient[\s_-]*requests?\b|\bcritical\b/i.test(label); }) ? 2 : 4;
        var parsed = parsePoints(card.name || '');
        categories[category].cards.push({id:card.id, title:title, points:parsed.assigned !== null ? parsed.assigned : (parsed.completed || 0)});
    });
    return {categories:categories, fallback:false};
}
function s4tEowText(draft) {
    var lines = [(draft.heading || 'EOW Update') + ' - (' + draft.dateRange + ')', ''];
    draft.categories.forEach(function(category) {
        var cards = category.cards.filter(function(card) { return card.title.trim(); });
        if (!cards.length) return;
        var total = Math.round(cards.reduce(function(sum, card) { return sum + (Number(card.points) || 0); }, 0) * 100) / 100;
        lines.push((category.name || 'CATEGORY').toUpperCase() + ' -' + (total && ['category_sum','both'].includes(draft.mode) ? ' [' + total + ']' : ''));
        cards.forEach(function(card) { lines.push('• ' + card.title.trim() + (Number(card.points) && ['title_only','both'].includes(draft.mode) ? ' [' + Number(card.points) + ']' : '')); });
        lines.push('');
    });
    return lines.join('\n').trim();
}
function s4tEowEmptyAutoDraft(draft, week) {
    var names = ['STABILIZATION', 'HOTFIX', 'FEATURES', 'DEV-OPS', 'RELEASE TASKS'];
    return !draft.manual && !draft.userEdited && draft.heading === 'EOW Update' && draft.dateRange === week.label &&
        draft.categories.length === names.length && draft.categories.every(function (category, index) {
            return category.name === names[index] && category.cards.length === 0;
        });
}
var s4tOpenEow = (function() {
    if (typeof document === 'undefined') return function() {};
    var overlay, board, boardId, member, week, draft, busy = false, request = 0, drag = null, hoverTimer, sources, releaseBoards, currentRelease, releaseLoading=false, releaseError='';
    var statusTimer;
    function status(message) {
        if (!overlay) return;
        if (!message || message === 'Current board loaded. Draft saved locally.') {
            overlay.find('.s4t-eow-status').text(message ? 'NOTE: Current board loaded. Draft saved locally.' : '');
            return;
        }
        var current = overlay;
        current.find('[data-eow-toast]').text(message).prop('hidden',false);
        clearTimeout(statusTimer);
        statusTimer = setTimeout(function () { current.find('[data-eow-toast]').prop('hidden',true); },3500);
    }
    function key() { return 's4t-eow-v1:' + (sources.length === 1 && sources[0].id === boardId ? boardId : sources.map(function(source) { return source.id; }).sort().join('+')) + ':' + member + ':' + week.iso; }
    function save() {
        if (!draft || !member) return;
        try { localStorage.setItem(key(), JSON.stringify(draft)); }
        catch (_) { status('Draft could not be saved. Copy your update before closing.'); }
    }
    function loadDraft() {
        try {
            var saved = JSON.parse(localStorage.getItem(key()));
            if (saved && Array.isArray(saved.categories) && saved.categories.every(function(c) { return typeof c.name === 'string' && Array.isArray(c.cards) && c.cards.every(function(card) { return typeof card.title === 'string'; }); }) && Array.isArray(saved.excluded)) return saved;
        } catch (_) {}
        return null;
    }
    function button(text, label, handler) {
        return $('<button type="button">').text(text).attr({'aria-label':label,'data-tooltip':label}).on('click',handler);
    }
    function field(value, label, handler, type) {
        return $('<input>').attr({type:type || 'text','aria-label':label}).val(value).on('input', function() { handler(this.value); });
    }
    function preview() {
        if (!draft.manual) draft.preview = s4tEowText(draft);
        overlay.find('[data-eow-preview]').val(draft.preview);
        save();
    }
    function edit(contentChanged) { if (contentChanged !== false) draft.userEdited=true; draft.manual=false; preview(); }
    function move(array, index, delta) {
        var target = index + delta;
        if (target < 0 || target >= array.length) return;
        array.splice(target, 0, array.splice(index, 1)[0]); renderCategories(); edit();
    }
    function dropTask(targetCategory, position) {
        if(!drag)return;
        var from=draft.categories[drag.category], target=draft.categories[targetCategory];
        if(!from || !target) { drag=null; return; }
        var card=from.cards.splice(drag.card,1)[0];
        if(from===target && drag.card<position)position--;
        if(card)target.cards.splice(position,0,card);
        drag=null; renderCategories(); edit();
        overlay.find('[data-category-index="'+targetCategory+'"] .s4t-eow-drag').eq(position).focus();
    }
    function renderCategories() {
        var container = overlay.find('[data-eow-categories]').empty();
        draft.categories.forEach(function(category, index) {
            var section = $('<section class="s4t-eow-category">').attr('data-category-index',index).appendTo(container);
            section.on('dragover',function(event) { if(!drag)return; event.preventDefault(); event.originalEvent.dataTransfer.dropEffect='move'; section.addClass('s4t-eow-drop-target'); });
            section.on('dragleave',function(event) { if(!this.contains(event.relatedTarget))section.removeClass('s4t-eow-drop-target'); });
            section.on('drop',function(event) { if(!drag)return; event.preventDefault(); event.stopPropagation(); dropTask(index,category.cards.length); });
            var header = $('<div class="s4t-eow-row">').appendTo(section);
            field(category.name, 'Category name', function(value) { category.name = value; edit(); }).appendTo(header);
            button('↑','Move category up',function() { move(draft.categories,index,-1); }).prop('disabled',index===0).appendTo(header);
            button('↓','Move category down',function() { move(draft.categories,index,1); }).prop('disabled',index===draft.categories.length-1).appendTo(header);
            button('×','Remove category',function() { draft.categories.splice(index,1); renderCategories(); edit(); }).appendTo(header);
            category.cards.forEach(function(card, cardIndex) {
                var row = $('<div class="s4t-eow-task">').appendTo(section);
                var handle=button('⠿','Drag task · Arrow keys move; Left/Right change category',function() {}).attr('draggable','true').addClass('s4t-eow-drag').appendTo(row);
                handle.on('dragstart',function(event) { drag={category:index,card:cardIndex}; event.originalEvent.dataTransfer.effectAllowed='move'; event.originalEvent.dataTransfer.setData('text/plain',card.title); row.addClass('s4t-eow-dragging'); });
                handle.on('dragend',function() { drag=null; overlay.find('.s4t-eow-drop-target, .s4t-eow-dragging, .s4t-eow-drop-before, .s4t-eow-drop-after').removeClass('s4t-eow-drop-target s4t-eow-dragging s4t-eow-drop-before s4t-eow-drop-after'); });
                handle.on('keydown',function(event) {
                    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key))return;
                    event.preventDefault(); drag={category:index,card:cardIndex};
                    if(event.key==='ArrowUp')dropTask(index,Math.max(0,cardIndex-1));
                    else if(event.key==='ArrowDown')dropTask(index,Math.min(category.cards.length,cardIndex+2));
                    else { var target=index+(event.key==='ArrowLeft'?-1:1); if(target>=0 && target<draft.categories.length)dropTask(target,draft.categories[target].cards.length); else drag=null; }
                });
                row.on('dragover',function(event) { if(!drag)return; event.preventDefault(); event.stopPropagation(); overlay.find('.s4t-eow-drop-before, .s4t-eow-drop-after').removeClass('s4t-eow-drop-before s4t-eow-drop-after'); row.addClass(event.originalEvent.clientY < this.getBoundingClientRect().top+this.offsetHeight/2 ? 's4t-eow-drop-before' : 's4t-eow-drop-after'); });
                row.on('drop',function(event) { if(!drag)return; event.preventDefault(); event.stopPropagation(); var after=event.originalEvent.clientY>=this.getBoundingClientRect().top+this.offsetHeight/2; dropTask(index,cardIndex+(after?1:0)); });
                field(card.title,'Task title',function(value) { card.title=value; edit(); }).appendTo(row);
                var actions = $('<div class="s4t-eow-row">').appendTo(row);
                field(card.points,'Task points',function(value) { card.points=Math.max(0, Number(value)||0); edit(); },'number').attr({min:0,step:'any'}).appendTo(actions);
                button('×','Remove task',function() { category.cards.splice(cardIndex,1); renderCategories(); edit(); }).appendTo(actions);
            });
            button('+ Task','Add task',function() { category.cards.push({title:'',points:0}); renderCategories(); edit(); }).addClass('s4t-eow-add-task').appendTo(section);
        });
        button('+ Category','Add category',function() { draft.categories.push({name:'New category',cards:[]}); renderCategories(); edit(); }).attr('data-eow-add-category','').appendTo(overlay.find('[data-eow-category-actions]').empty());
    }
    function generate() {
        var generated = s4tEowCategories(board, member, week, draft.excluded);
        draft.categories=generated.categories; draft.fallback=false; draft.manual=false; draft.userEdited=false;
    }
    function render() {
        overlay.find('[data-eow-heading]').val(draft.heading);
        overlay.find('[data-eow-date-range]').val(draft.dateRange);
        overlay.find('[data-eow-mode]').val(draft.mode);
        var lists = overlay.find('[data-eow-lists]').empty();
        var memberLists = new Set((board.cards || []).filter(function(card) { return (board.multiBoard || !card.closed) && (card.idMembers || []).includes(member); }).map(function(card) { return card.idList; }));
        (board.lists || []).filter(function(list) { return memberLists.has(list.id); }).forEach(function(list) {
            var label = $('<label>').appendTo(lists);
            $('<input type="checkbox">').prop('checked',draft.excluded.includes(list.id)).on('change',function() {
                draft.excluded = this.checked ? draft.excluded.concat(list.id) : draft.excluded.filter(function(id) { return id!==list.id; });
                generate(); render(); preview();
            }).appendTo(label);
            $('<span>').text(list.name).appendTo(label);
        });
        renderCategories(); preview(); renderReleaseWarning();
    }
    function selectDraft() {
        draft=loadDraft();
        if (draft && (draft.fallback || (!draft.manual && draft.userEdited === false) || s4tEowEmptyAutoDraft(draft, week))) { generate(); }
        if (!draft) { draft={heading:'EOW Update',dateRange:week.label,mode:'category_sum',excluded:[],categories:[],manual:false}; generate(); }
        render();
    }
    function loading(value) {
        busy=value;
        s4tSetSkeleton(overlay.find('.s4t-eow-content')[0],value);
        overlay.find('.s4t-eow-content').attr('inert',value || !draft ? '' : null);
        overlay.find('[data-eow-refresh]').toggleClass('s4t-refreshing',value);
        overlay.find('[data-eow-refresh], [data-eow-member], [data-eow-week], [data-eow-copy], [data-eow-reset]').prop('disabled',value || !draft);
        overlay.find('[data-eow-refresh]').prop('disabled',value);
        renderReleaseWarning();
    }
    function fetchData() {
        if (busy) return;
        var requested = [{id:boardId,name:'Current board'}];
        var token=++request, results=new Array(requested.length), remaining=requested.length+2, failed=false, loggedMemberId=null, commentDates={}, commentError=false;
        loading(true); status('');
        function fail() {
            if(token!==request || failed)return;
            failed=true; loading(false); status('Could not load the current board. Your draft is unchanged. Try refreshing.');
        }
        function finish() {
                if(token!==request || failed || --remaining)return;
                save();
                sources=requested.map(function(source,i){return {id:source.id,name:results[i].name};});
                board=s4tEowMergeBoards(results);
                board.cards.forEach(function (card) { card.s4tCommentDates = commentDates[card.id] || []; });
                currentRelease=results[0];
                try { localStorage.setItem('s4t-eow-sources:'+boardId,JSON.stringify(sources)); } catch(_) {}
                var dropdown=overlay.find('[data-eow-member]').empty();
                board.members.forEach(function(m){$('<option>').val(m.id).text(m.fullName || m.username).appendTo(dropdown);});
                if(!board.members.some(function(m){return m.id===member;}))member=board.members.some(function(m){return m.id===loggedMemberId;}) ? loggedMemberId : board.members[0] && board.members[0].id;
                dropdown.val(member);
                overlay.find('[data-eow-sources]').text(sources.map(function(source){return source.name;}).join(' + '));
                if(member) selectDraft(); else { draft=null; status('No members found on the selected boards.'); }
                loading(false);
                if(member)status('Current board loaded. Draft saved locally.');
                if(commentError)status('Comment history could not be loaded. Some recently commented cards may be missing; try Refresh.');
                discoverReleases();
        }
        requested.forEach(function(source,index) {
            $.ajax({url:'/1/boards/'+encodeURIComponent(source.id),type:'GET',dataType:'json',cache:false,xhrFields:{withCredentials:true},timeout:20000,
                data:{fields:'name,shortLink,idOrganization,closed',cards:requested.length>1?'all':'open',card_fields:'name,idList,idMembers,labels,due,dateLastActivity,closed',lists:'all',list_fields:'name',members:'all',member_fields:'fullName,username'}})
            .done(function(result) {
                if(token!==request || failed)return;
                if(!result || !Array.isArray(result.cards) || !Array.isArray(result.members) || (result.id!==source.id && result.shortLink!==source.id)) { fail();return; }
                results[index]=result;
                finish();
            }).fail(fail);
        });
        var currentWeek = s4tEowWeek(), historyStart = new Date(currentWeek.start);
        historyStart.setDate(historyStart.getDate() - 7);
        s4tEowCommentDates(function (params) {
            return $.ajax({url:'/1/boards/'+encodeURIComponent(boardId)+'/actions', data:params, type:'GET', dataType:'json', xhrFields:{withCredentials:true}, timeout:20000, cache:false});
        }, historyStart, currentWeek.end, function () { return token===request && !failed && !!overlay; })
        .then(function (dates) { if (dates) commentDates=dates; }, function () { commentError=true; }).finally(finish);
        $.ajax({url:'/1/members/me',data:{fields:'id'},type:'GET',dataType:'json',xhrFields:{withCredentials:true},timeout:10000})
            .done(function(result){if(token===request && result)loggedMemberId=result.id;})
            .always(finish);
    }
    function discoverReleases() {
        if(releaseLoading)return;
        if(releaseBoards){renderReleaseWarning();return;}
        releaseLoading=true;releaseError='';renderReleaseWarning();
        var origin=overlay;
        $.ajax({url:'/1/members/me/boards',data:{filter:'all',fields:'name,shortLink,closed,idOrganization'},type:'GET',dataType:'json',xhrFields:{withCredentials:true},timeout:20000})
        .done(function(result){if(overlay!==origin)return;if(Array.isArray(result))releaseBoards=result;else releaseError='Could not check previous release boards.';})
        .fail(function(){if(overlay===origin)releaseError='Could not check previous release boards.';})
        .always(function(){if(overlay!==origin)return;releaseLoading=false;renderReleaseWarning();});
    }
    function renderReleaseWarning() {
        if(!overlay)return;
        var warning=overlay.find('[data-eow-release-warning]').empty().removeClass('s4t-eow-warning');
        if(releaseLoading){warning.text('Checking previous release dates…');return;}
        if(releaseError){warning.text(releaseError);button('Retry','Retry release discovery',discoverReleases).appendTo(warning);return;}
        if(!currentRelease || !releaseBoards)return;
        var result=s4tEowPreviousReleases(currentRelease,releaseBoards,week);
        if(result.error){warning.text(result.error);return;}
        result.releases.forEach(function(source){
            warning.addClass('s4t-eow-warning');
            var end=new Date(source.end);end.setDate(end.getDate()-1);
            var row=$('<div class="s4t-eow-release-match">').appendTo(warning);
            $('<span>').text('Date range includes '+source.name+' ('+source.start.toLocaleDateString('en-GB')+' – '+end.toLocaleDateString('en-GB')+'). Add those tasks manually from the previous board.').appendTo(row);
        });
    }
    function close() {
        save(); clearTimeout(hoverTimer); clearTimeout(statusTimer); drag=null; ++request; busy=false; overlay.remove(); overlay=null;
        $(document).off('.s4tEow'); document.getElementById('s4t-eow-launch')?.focus();
    }
    return function() {
        if (overlay) { overlay.find('[data-eow-member]').focus(); return; }
        boardId=getBoardShortLink(); if(!boardId) return;
        board=null; draft=null; member=null; week=s4tEowWeek(); sources=[{id:boardId,name:'Current board'}];
        releaseBoards=null;currentRelease=null;releaseLoading=false;releaseError='';
        overlay=$('<div id="s4t-eow-overlay"><div id="s4t-eow-dialog" role="dialog" aria-modal="true" aria-label="EOW Update"><header><div class="s4t-feature-title"><h2>EOW Update</h2></div><span class="s4t-eow-spacer"></span><select data-eow-member aria-label="Member"></select></header><div class="s4t-eow-content"><div class="s4t-eow-config"><label class="s4t-eow-field-label">Title: <input data-eow-heading aria-label="Update heading"></label><label class="s4t-eow-field-label">Date: <span class="s4t-eow-date-field"><input data-eow-date-range aria-label="Date range heading" aria-haspopup="dialog"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/></svg></span><input type="hidden" data-eow-week></label><select data-eow-mode aria-label="Points display"><option value="category_sum">Category points</option><option value="title_only">Task points</option><option value="both">Both</option><option value="none">No points</option></select><div class="s4t-eow-exclude"><button type="button" data-eow-exclude-toggle aria-expanded="false" aria-controls="s4t-eow-list-options">Exclude lists</button><div data-eow-lists id="s4t-eow-list-options" hidden></div></div></div><div class="s4t-eow-panes"><div class="s4t-eow-left"><div class="s4t-eow-pane-heading"><strong>Tasks</strong><span data-eow-category-actions></span></div><div data-eow-categories></div></div><div class="s4t-eow-preview-pane"><div class="s4t-eow-row"><strong>Slack preview <span class="s4t-eow-editable">Editable</span></strong></div><textarea data-eow-preview aria-label="Editable Slack preview" spellcheck="true"></textarea></div></div></div><footer class="s4t-eow-status" role="status"></footer><div data-eow-toast role="status" hidden></div></div></div>').appendTo('body');
        var header=overlay.find('header');
        header.find('.s4t-feature-title').append(s4tFeatureHelp('EOW Update', 'Prepare a member’s weekly task report.', 'Current or previous week, categories, list exclusions, task ordering and editable preview.', 'Group board tasks into a draft instead of writing the update from scratch.', 'Choose a member and week, review categories and tasks, edit the preview, then copy to Slack.'));
        $('<span data-eow-sources>').text(sources.map(function(source){return source.name;}).join(' + ')).insertAfter(header.find('.s4t-feature-title'));
        button('','Refresh board data',fetchData).attr('data-eow-refresh','').html(s4tRefreshIcon()).appendTo(header);
        button('Reset','Reset draft from board cards',function() { if(!draft || !window.confirm('Replace this draft with the board cards?'))return; generate(); render(); }).attr('data-eow-reset','').appendTo(header);
        button('','Copy EOW update',function() {
            if(!draft)return;
            var current=overlay;
            if (!navigator.clipboard) { status('Select and copy the preview text.'); return; }
            navigator.clipboard.writeText(draft.preview || '').then(function() { if(overlay===current)status('Copied. Paste into Slack.'); },function() { if(overlay===current)status('Could not copy. Select and copy the preview text.'); });
        }).attr('data-eow-copy','').html('<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>').appendTo(overlay.find('.s4t-eow-preview-pane .s4t-eow-row'));
        button('×','Close EOW Update',close).appendTo(header);
        overlay.find('[data-eow-mode]').insertBefore(overlay.find('[data-eow-copy]'));
        overlay.find('.s4t-eow-exclude').insertBefore(overlay.find('[data-eow-mode]'));
        var exclude=overlay.find('.s4t-eow-exclude'), trigger=overlay.find('[data-eow-exclude-toggle]');
        function openLists(open) { clearTimeout(hoverTimer); overlay.find('[data-eow-lists]').prop('hidden',!open); trigger.attr('aria-expanded',String(open)); }
        exclude.on('mouseenter',function(){openLists(true);}).on('mouseleave',function(){hoverTimer=setTimeout(function(){if(overlay)openLists(false);},250);});
        trigger.on('click',function(){openLists(this.getAttribute('aria-expanded')!=='true');});
        exclude.on('focusin',function(){openLists(true);}).on('focusout',function(event){if(!this.contains(event.relatedTarget))openLists(false);});
        $(document).on('mousedown.s4tEow',function(event){if(!exclude[0].contains(event.target))openLists(false);});
        exclude.on('keydown',function(event){if(event.key==='Escape' && trigger.attr('aria-expanded')==='true'){event.stopPropagation();openLists(false);trigger.focus();openLists(false);}});
        overlay.find('[data-eow-week]').val(week.iso).on('change',function() { if(!this.value || !s4tEowWeekAllowed(this.value)){this.value=week.iso;status('Choose the current or previous week.');return;} save(); week=s4tEowWeek(this.value); this.value=week.iso; selectDraft(); });
        overlay.find('[data-eow-member]').on('change',function() { save(); member=this.value; selectDraft(); });
        overlay.find('[data-eow-heading]').on('input',function() { draft.heading=this.value; edit(false); });
        overlay.find('[data-eow-date-range]').on('input',function() { draft.dateRange=this.value; edit(false); });
        overlay.find('[data-eow-mode]').on('change',function() { draft.mode=this.value; edit(false); });
        overlay.find('[data-eow-preview]').on('input',function() { draft.preview=this.value; draft.manual=true; draft.userEdited=true; preview(); });
        overlay.on('click',function(event) { if(event.target===overlay[0])close(); });
        $(document).on('keydown.s4tEow',function(event) {
            if(event.key==='Escape') { event.preventDefault(); close(); return; }
            if(event.key==='Tab') {
                var items=overlay.find('button:visible:enabled, input:visible:enabled, select:visible:enabled, textarea:visible:enabled, summary:visible').filter(function(){return !this.closest('[inert]');}).toArray();
                var first=items[0],last=items[items.length-1];
                if(event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
                else if(!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
            }
        });
        fetchData(); header.find('button').last().focus();
    };
})();
