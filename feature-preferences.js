/* Local display preferences. Trello cards and board data are never changed here. */
var s4tPreferences = (function () {
    var key = 's4t-feature-preferences-v1', values = {}, modal, style;
    var featureIcons = {
        members: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/></svg>',
        attention: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2" fill="var(--ds-surface, #fff)"/><circle cx="16" cy="12" r="2" fill="var(--ds-surface, #fff)"/><circle cx="8" cy="18" r="2" fill="var(--ds-surface, #fff)"/></svg>',
        cardsList: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h7M7 8h.01M7 12h.01M7 16h.01"/></svg>',
        eow: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18M8 16l2 2 5-5"/></svg>',
        titlePoints: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4a6 6 0 0 0 0 16"/><path d="M9 4a6 6 0 0 1 0 16"/><path d="M15 4h2v16h-2"/><path d="M20 4h-2v16h2"/></svg>',
        cardPeek: '<i class="fi fi-tr-registration-paper" aria-hidden="true"><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="24" stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd" aria-hidden="true"><path d="M56 0 L227 0 L233 4 L235 9 L233 17 L228 21 L112 21 L123 38 L128 56 L128 454 L131 465 L137 475 L150 486 L168 491 L184 489 L196 483 L206 473 L210 466 L213 456 L215 431 L223 413 L239 396 L256 387 L269 384 L405 384 L405 329 L409 322 L419 320 L425 324 L427 329 L427 384 L456 384 L472 388 L489 398 L501 411 L508 424 L512 440 L512 456 L510 466 L503 482 L489 498 L472 508 L456 512 L163 512 L147 508 L137 503 L120 488 L112 475 L107 458 L107 128 L56 128 L40 124 L30 119 L11 101 L4 88 L0 72 L0 56 L2 46 L14 23 L32 8 L40 4 Z M362 0 L385 0 L409 4 L441 17 L464 33 L479 48 L495 71 L507 100 L512 127 L512 150 L506 181 L494 208 L481 227 L462 246 L440 261 L410 273 L389 277 L358 277 L337 273 L317 266 L291 251 L270 232 L252 207 L240 179 L235 154 L235 123 L239 102 L251 72 L266 50 L285 31 L302 19 L331 6 Z M62 21 L54 22 L40 28 L28 40 L24 48 L21 61 L22 74 L28 88 L40 100 L54 106 L106 107 L107 61 L106 54 L100 40 L86 27 L74 22 Z M368 21 L346 24 L323 32 L303 44 L283 63 L270 82 L261 103 L256 128 L256 149 L260 171 L272 199 L287 219 L300 231 L315 241 L341 252 L363 256 L383 256 L409 251 L430 242 L449 229 L464 214 L474 200 L484 179 L490 155 L491 133 L489 116 L482 93 L467 67 L451 50 L433 37 L414 28 L390 22 Z M436 106 L442 107 L447 112 L448 120 L446 124 L384 184 L370 191 L353 192 L340 188 L334 184 L311 160 L309 160 L299 148 L299 140 L303 135 L314 134 L347 167 L357 171 L365 170 L371 167 L425 113 Z M275 405 L264 407 L255 411 L242 423 L235 440 L234 460 L231 471 L219 491 L451 491 L464 488 L476 481 L484 472 L490 458 L490 438 L484 424 L472 412 L458 406 Z"/></svg></i>',
        charts: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M10 3a9 9 0 1 0 11 11H10V3Z"/><path d="M14 2v8h8a9 9 0 0 0-8-8Z"/></svg>',
        hideNativeFilter: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
        checkAll: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="m8 12 3 3 5-6"/></svg>',
        commentScroll: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18M7 7l5-4 5 4M7 17l5 4 5-4"/></svg>',
        cardCopy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
        commentCopy: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        cardShare: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V3m-4 4 4-4 4 4M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8"/></svg>',
        commentSearch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>',
        reviewMode: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M14 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6M7 7h4M7 11h3M7 15h3"/><circle cx="16" cy="7" r="4"/><path d="m19 10 3 3"/></svg>',
        laserPointer: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m5 14 9-9 5 5-9 9-5-5Zm-1 1-2 6 6-2M13 6l5 5"/><path d="M13 21h8" stroke="#ef3340" stroke-width="2.5"/></svg>'
    };
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
            ['commentSearch', 'Comment search', 'Find text inside card comments.', '.s4t-comment-navigator'],
            ['cardShare', 'Share card link', 'Copy the card link from the button after comment search.', '.s4t-card-copy-share'],
            ['reviewMode', 'Review mode', 'Expand comments by hiding the left card section.', '.s4t-comment-layout-toggle:not(.s4t-review-marker)'],
            ['laserPointer', 'Laser pointer', 'Temporary highlights over the title, description and comments.', '.s4t-review-marker'],
            ['checkAll', 'Check All', 'Complete every item in a checklist.', '.s4t-checklist-actions'],
            ['cardCopy', 'Copy title and description', 'Copy the title without points or description.', '.s4t-card-copy-title, .s4t-card-copy-description'],
            ['commentScroll', 'Comment scroll arrows', 'Move to the top or bottom of comments.', '.s4t-comment-jumps'],
            ['commentCopy', 'Copy comments', 'Copy a comment with formatting in one click.', '.s4t-card-copy-comment']
        ]],
        ['Card listing', [
            ['titlePoints', 'View points (Quick editing)', 'Highlighted assigned/completed point brackets in card titles.'],
            ['cardPeek', 'Quick View (Peek Out)', 'Hover card icon to preview description scope, checklists, and comment status.', '.s4t-card-peek-btn, .s4t-card-peek-popover, .s4t-card-peek-backdrop']
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
                var listingGrid;
                if(group[0]==='Card tools'){
                    field.className='s4t-preferences-card-tools';
                    var grid=document.createElement('div');grid.className='s4t-preferences-card-grid';field.append(grid);
                    ['Topbar','Left container','Right container'].forEach(function(name){
                        var section=document.createElement('section'),heading=document.createElement('h3');
                        heading.textContent=name;section.append(heading);grid.append(section);sections[name]=section;
                    });
                } else if(group[0]==='Card listing'){
                    field.className='s4t-preferences-card-listing';
                    listingGrid=document.createElement('div');listingGrid.className='s4t-preferences-listing-grid';field.append(listingGrid);
                }
                group[1].forEach(function (entry) {
                    var label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
                    label.className = 's4t-preference-label';
                    input.type = 'checkbox'; input.checked = enabled(entry[0]); input.dataset.featurePreference = entry[0];
                    var heading = document.createElement('span'); heading.className = 's4t-preference-heading';
                    var title = document.createElement('span'); title.className = 's4t-preference-title'; title.textContent = entry[1];
                    heading.appendChild(title);
                    if (featureIcons[entry[0]]) {
                        var icon = document.createElement('span'); icon.className = 's4t-preference-icon'; icon.setAttribute('aria-hidden', 'true');
                        icon.innerHTML = featureIcons[entry[0]];
                        heading.appendChild(icon);
                    }
                    text.appendChild(heading);
                    if (entry[2]) { var note = document.createElement('small'); note.textContent = entry[2]; text.appendChild(note); }
                    input.onchange = function () {
                        var next = Object.assign({}, values); next[entry[0]] = input.checked;
                        if (save(next)) status.textContent = 'Preferences saved.';
                        else { input.checked = enabled(entry[0]); status.textContent = 'Could not save preferences. Try again.'; }
                    };
                    label.append(input,text);
                    var area=['commentSearch','cardShare','reviewMode','laserPointer'].includes(entry[0])?'Topbar':['checkAll','cardCopy'].includes(entry[0])?'Left container':'Right container';
                    (listingGrid||sections[area]||field).appendChild(label);
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
