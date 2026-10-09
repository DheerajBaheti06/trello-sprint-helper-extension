/* Local display preferences. Trello cards and board data are never changed here. */
var s4tPreferences = (function () {
    var key = 's4t-feature-preferences-v1', values = {}, modal, style;
    var groups = [
        ['Board features', [
            ['members', 'Members Burndown', 'Team and member points, progress and card counts.', '#membersBurndownLink, #s4t-modal-overlay'],
            ['attention', 'Attention filters', 'Find cards needing updates.', '#s4t-attention-controls, #s4t-attention-panel'],
            ['cardsList', 'Cards List', 'Select cards and create Slack messages.', '#s4t-cards-launch, #s4t-cards-overlay'],
            ['eow', 'EOW Update', 'Create weekly task reports.', '#s4t-eow-launch, #s4t-eow-overlay']
        ]],
        ['Charts', [
            ['charts', 'Sprint charts', 'Developer points and label distribution, including pop-out charts.', '#s4t-charts-action, .s4t-chart-overlay']
        ]],
        ['Special', [
            ['hideNativeFilter', 'Hide Trello built-in filter', 'Hides Trello filters and clears restored native filters; Attention stays unchanged.']
        ]],
        ['Card tools', [
            ['checkAll', 'Check All', 'Complete every item in a checklist.', '.s4t-checklist-actions'],
            ['commentScroll', 'Comment scroll arrows', 'Move to the top or bottom of comments.', '.s4t-comment-jumps'],
            ['cardCopy', 'Copy title and description', 'Copy the title without points or description.', '.s4t-card-copy-title, .s4t-card-copy-description'],
            ['commentCopy', 'Copy comments', 'Copy a comment with formatting in one click.', '.s4t-card-copy-comment'],
            ['cardShare', 'Share card link', 'Copy the card link from the button after comment search.', '.s4t-card-copy-share'],
            ['commentSearch', 'Comment search', 'Find text inside card comments.', '.s4t-comment-navigator'],
            ['titlePoints', 'Quick point editing', 'Highlighted assigned/completed brackets in the card title.'],
            ['reviewMode', 'Review mode', 'Expand comments by hiding the left card section.', '.s4t-comment-layout-toggle:not(.s4t-review-marker)'],
            ['laserPointer', 'Laser pointer', 'Temporary highlights over the title, description and comments.', '.s4t-review-marker'],
            ['cardPeek', 'Quick view on hover', 'Hover icon to preview card scope, checklists, and comment status.', '.s4t-card-peek-btn']
        ]]
    ];
    var ids = new Set(groups.flatMap(function (group) { return group[1].map(function (entry) { return entry[0]; }); }));
    function clean(saved) {
        var next = {};
        if (saved && typeof saved === 'object' && !Array.isArray(saved)) ids.forEach(function (id) { if (typeof saved[id] === 'boolean') next[id] = saved[id]; });
        return next;
    }
    try { values = clean(JSON.parse(localStorage.getItem(key) || '{}')); } catch (_) {}
    // All features start checked; only an explicit saved opt-out disables one.
    function enabled(id) { return id === 'hideNativeFilter' ? values[id] === true : values[id] !== false; }
    function apply() {
        if (!style) { style = document.createElement('style'); style.id = 's4t-preference-styles'; (document.head || document.documentElement).appendChild(style); }
        var rules = [];
        groups.forEach(function (group) { group[1].forEach(function (entry) { if (!enabled(entry[0]) && entry[3]) rules.push(entry[3] + '{display:none!important}'); }); });
        if (enabled('hideNativeFilter')) rules.push('html:not([data-s4t-native-filter-recovery]) [data-testid="filter-popover-button"], html:not([data-s4t-native-filter-recovery]) [data-testid="board-filter-button"]{display:none!important}');
        if (enabled('members')) rules.push('#s4t-preferences-launch{display:none!important}');
        style.textContent = rules.join('\n');
        document.dispatchEvent(new Event('s4t-preferences-changed'));
        document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
    }
    function save(next) {
        try { localStorage.setItem(key, JSON.stringify(next)); values = clean(next); apply(); return true; } catch (_) { return false; }
    }
    function open() {
        if (modal) { modal.querySelector('button').focus(); return; }
        var previous = document.activeElement;
        modal = document.createElement('div'); modal.id = 's4t-preferences-overlay';
        var dialog = document.createElement('section'); dialog.id = 's4t-preferences-dialog'; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','s4t-preferences-title');
        dialog.innerHTML = '<header><h2 id="s4t-preferences-title">Settings</h2><button type="button" aria-label="Close settings">✕</button></header><p>Choose the features you want to see. Saved in this browser for all Trello boards. If Members Burndown is hidden, use the Settings button on the board.</p><div class="s4t-preferences-groups"></div><footer><span role="status"></span><button type="button">Reset to defaults</button></footer>';
        var rules = document.createElement('button'); rules.type = 'button'; rules.id = 's4t-preferences-rules'; rules.textContent = 'Sprint Helper · Workflow rules'; rules.onclick = function () { s4tWorkflowRules.open(rules); }; dialog.querySelector('h2').after(rules);
        var container = dialog.querySelector('.s4t-preferences-groups'), status = dialog.querySelector('[role="status"]');
        function close() { modal.remove(); modal = null; if (previous && previous.isConnected) previous.focus(); }
        dialog.querySelector('[aria-label="Close settings"]').onclick = close;
        function render() {
            container.textContent = '';
            var compact=document.createElement('div');compact.className='s4t-preferences-compact';
            groups.forEach(function (group) {
                var field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = group[0]; field.appendChild(legend);
                var sections={};
                if(group[0]==='Card tools'){
                    field.className='s4t-preferences-card-tools';
                    var grid=document.createElement('div');grid.className='s4t-preferences-card-grid';field.append(grid);
                    ['Topbar','Left container','Right container'].forEach(function(name){
                        var section=document.createElement('section'),heading=document.createElement('h3');
                        heading.textContent=name;section.append(heading);grid.append(section);sections[name]=section;
                    });
                }
                group[1].forEach(function (entry) {
                    var label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
                    input.type = 'checkbox'; input.checked = enabled(entry[0]); input.dataset.featurePreference = entry[0]; text.textContent = entry[1];
                    if (entry[2]) { var note = document.createElement('small'); note.textContent = entry[2]; text.appendChild(note); }
                    input.onchange = function () {
                        var next = Object.assign({}, values); next[entry[0]] = input.checked;
                        if (save(next)) status.textContent = 'Preferences saved.';
                        else { input.checked = enabled(entry[0]); status.textContent = 'Could not save preferences. Try again.'; }
                    };
                    label.append(input,text);
                    var area=['commentSearch','cardShare','reviewMode','laserPointer'].includes(entry[0])?'Topbar':['checkAll','cardCopy','titlePoints','cardPeek'].includes(entry[0])?'Left container':'Right container';
                    (sections[area]||field).appendChild(label);
                });
                if(group[0]==='Charts'||group[0]==='Special'){
                    compact.appendChild(field);if(!compact.isConnected)container.appendChild(compact);
                }else container.appendChild(field);
            });
        }
        dialog.querySelector('footer button').onclick = function () { if (save({})) { render(); status.textContent = 'Features enabled; native filter hiding off.'; } else status.textContent = 'Could not save preferences. Try again.'; };
        modal.appendChild(dialog); document.body.appendChild(modal); render(); dialog.querySelector('button').focus();
        modal.onmousedown = function (event) { if (event.target === modal) close(); };
        modal.onkeydown = function (event) {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            if (event.key === 'Tab') {
                var controls = Array.from(dialog.querySelectorAll('button,input')), first = controls[0], last = controls[controls.length-1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        };
    }
    window.addEventListener('storage', function (event) {
        if (event.key !== key && event.key !== null) return;
        try { var next = JSON.parse(localStorage.getItem(key) || '{}'); if (!next || typeof next !== 'object' || Array.isArray(next)) return; values = clean(next); apply(); } catch (_) {}
    });
    apply();
    return {enabled:enabled,open:open};
})();
