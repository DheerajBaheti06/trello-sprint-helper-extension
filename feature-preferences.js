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
        ['Special', [
            ['hideNativeFilter', 'Hide Trello built-in filter', 'Hides Trello filters and clears restored native filters; Attention stays unchanged.']
        ]],
        ['Card tools', [
            ['checkAll', 'Check All', 'Complete every item in a checklist.', '.s4t-checklist-actions'],
            ['commentSearch', 'Comment search', 'Find text inside card comments.', '.s4t-comment-search-slot, .s4t-comment-navigator']
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
        dialog.innerHTML = '<header><h2 id="s4t-preferences-title">Preferences</h2><button type="button" aria-label="Close preferences">✕</button></header><p>Choose the features you want to see. Saved in this browser for all Trello boards. If Members Burndown is hidden, use the Preferences button on the board.</p><div class="s4t-preferences-groups"></div><footer><span role="status"></span><button type="button">Check Mark All features</button></footer>';
        var container = dialog.querySelector('.s4t-preferences-groups'), status = dialog.querySelector('[role="status"]');
        function close() { modal.remove(); modal = null; if (previous && previous.isConnected) previous.focus(); }
        dialog.querySelector('header button').onclick = close;
        function render() {
            container.textContent = '';
            groups.forEach(function (group) {
                var field = document.createElement('fieldset'), legend = document.createElement('legend'); legend.textContent = group[0]; field.appendChild(legend);
                group[1].forEach(function (entry) {
                    var label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
                    input.type = 'checkbox'; input.checked = enabled(entry[0]); input.dataset.featurePreference = entry[0]; text.textContent = entry[1];
                    if (entry[2]) { var note = document.createElement('small'); note.textContent = entry[2]; text.appendChild(note); }
                    input.onchange = function () {
                        var next = Object.assign({}, values); next[entry[0]] = input.checked;
                        if (save(next)) status.textContent = 'Preferences saved.';
                        else { input.checked = enabled(entry[0]); status.textContent = 'Could not save preferences. Try again.'; }
                    };
                    label.append(input,text); field.appendChild(label);
                }); container.appendChild(field);
            });
        }
        dialog.querySelector('footer button').onclick = function () { if (save({})) { render(); status.textContent = 'All features shown.'; } else status.textContent = 'Could not save preferences. Try again.'; };
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
