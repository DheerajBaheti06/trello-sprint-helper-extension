/* Shared, read-only help for the installed Sprint Helper extension. */
var s4tWorkflowRules = (function () {
    var dialog, launch, feedbackAnchor, load, timer, exactAnchor = false, placeAfter = false;
    function inline(node, text) {
        String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g).forEach(function (part) {
            var tag = part.startsWith('**') ? 'strong' : part.startsWith('`') ? 'code' : null;
            if (!tag) { node.appendChild(document.createTextNode(part)); return; }
            var child = document.createElement(tag); child.textContent = part.slice(tag === 'strong' ? 2 : 1, tag === 'strong' ? -2 : -1); node.appendChild(child);
        });
    }
    function render(body, markdown) {
        body.replaceChildren(); var table, list;
        markdown.split(/\r?\n/).forEach(function (line) {
            if (/^# /.test(line)) return; // The dialog already names the extension.
            if (!line.trim()) { table = null; list = null; return; }
            if (/^\|/.test(line)) {
                var cells = line.split('|').slice(1, -1).map(function (cell) { return cell.trim(); });
                if (cells.every(function (cell) { return /^:?-+:?$/.test(cell); })) return;
                var first = !table;
                if (!table) { table = document.createElement('table'); body.appendChild(table); }
                var row = table.insertRow();
                cells.forEach(function (text) { var cell = document.createElement(first ? 'th' : 'td'); if (first) cell.scope = 'col'; inline(cell, text); row.appendChild(cell); });
                return;
            }
            table = null;
            if (/^- /.test(line)) {
                if (!list) { list = document.createElement('ul'); body.appendChild(list); }
                var item = document.createElement('li'); inline(item, line.slice(2)); list.appendChild(item); return;
            }
            list = null;
            var heading = /^## /.test(line), node = document.createElement(heading ? 'h3' : 'p');
            inline(node, heading ? line.slice(3) : line); body.appendChild(node);
        });
    }
    function open(trigger) {
        if (dialog) { dialog.focus(); return; }
        var previous = trigger instanceof Element ? trigger : document.activeElement;
        dialog = document.createElement('dialog'); dialog.id = 's4t-workflow-rules'; dialog.setAttribute('aria-labelledby', 's4t-workflow-title');
        dialog.innerHTML = '<header><div><h2 id="s4t-workflow-title">Sprint Helper · Workflow rules</h2><p>Board conventions and examples for predictable results.</p></div><button type="button" aria-label="Close workflow rules">✕</button></header><div class="s4t-workflow-body" tabindex="0" aria-busy="true">Loading workflow rules…</div>';
        var owned = dialog, body = dialog.querySelector('.s4t-workflow-body');
        function close() { owned.close(); owned.remove(); if (dialog === owned) dialog = null; if (previous && previous.isConnected) previous.focus(); }
        dialog.querySelector('button').onclick = close;
        dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
        dialog.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
        dialog.addEventListener('click', function (event) { var r=owned.getBoundingClientRect(); if(event.target===owned&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))close(); });
        document.body.appendChild(dialog); dialog.showModal(); dialog.querySelector('button').focus();
        if (!load) load = fetch(chrome.runtime.getURL('WORKFLOW-RULES.md')).then(function (response) { if (!response.ok) throw new Error('load'); return response.text(); }).catch(function (error) { load = null; throw error; });
        load.then(function (markdown) { if (owned.isConnected) render(body, markdown); }, function () { if (owned.isConnected) body.textContent = 'Could not load workflow rules. Close and reopen to retry.'; }).finally(function () { body.setAttribute('aria-busy', 'false'); });
    }
    function mount() {
        timer = null;
        var headerSelector='#header,[data-testid="header-container"],[data-testid="global-header"],header[role="banner"],[role="banner"]';
        var header=document.querySelector(headerSelector);
        var root=header||document;
        var anchor = Array.from(root.querySelectorAll('button, [role="button"], a')).find(function (node) {
            if (node.closest('[id^="s4t-"]')) return false;
            var labelled=(node.getAttribute('aria-labelledby')||'').split(/\s+/).map(function(id){var label=document.getElementById(id);return label?label.textContent:'';}).join(' ');
            return [node.getAttribute('aria-label'), node.getAttribute('title'), node.getAttribute('data-tooltip'), node.getAttribute('data-testid'), labelled, node.textContent].some(function (text) {
                return /share\s+(?:your|ur)\s+thoughts|(?:give|send|share)[\s_-]*(?:us[\s_-]*)?feedback|feedback[\s_-]*(?:button|popover)/i.test(text||'');
            });
        });
        exactAnchor=!!anchor;
        // Feedback can be an unlabelled icon until its tooltip mounts. Keep
        // the extension help available in the global header in the meantime.
        if(!anchor&&header)anchor=header.querySelector('[data-testid="header-member-menu-button"],[data-testid="header-notifications-button"]');
        if (!anchor && !header) return;
        // Mount beside the feedback control's wrapper, not inside a
        // fixed-width tooltip wrapper. Respect reversed header flex layouts.
        while(anchor&&anchor.parentElement&&anchor.parentElement!==header&&anchor.parentElement!==document.body&&anchor.parentElement.children.length===1)anchor=anchor.parentElement;
        feedbackAnchor = anchor;
        if (!launch) {
            launch = document.createElement('button'); launch.type = 'button'; launch.id = 's4t-workflow-launch';
            launch.innerHTML='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 4h7a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4V4Z"/><path d="M14 10h6v9h-2"/><path class="s4t-rules-spark" d="m18 2 1.2 3.3L22 6.5l-2.8 1.2L18 11l-1.2-3.3L14 6.5l2.8-1.2L18 2Z"/></svg><span>Workflow rules</span><small>Sprint Helper</small>';
            launch.setAttribute('aria-haspopup', 'dialog'); launch.setAttribute('aria-label', 'Sprint Helper workflow rules'); launch.onclick = function () { open(launch); };
        }
        if(anchor){
            var layout=getComputedStyle(anchor.parentElement);
            placeAfter=(layout.flexDirection==='row-reverse')!==(layout.direction==='rtl');
            launch.style.order=getComputedStyle(anchor).order;
            if(placeAfter){if(anchor.nextElementSibling!==launch)anchor.after(launch);}
            else if(anchor.previousElementSibling!==launch)anchor.before(launch);
        }
        else if(launch.parentElement!==header)header.appendChild(launch);
    }
    new MutationObserver(function (mutations) {
        if (exactAnchor && launch && launch.isConnected && feedbackAnchor && feedbackAnchor.isConnected && (placeAfter ? launch.previousElementSibling : launch.nextElementSibling) === feedbackAnchor) return;
        if (mutations.every(function (m) { return m.target.nodeType===1 && m.target.closest('[id^="s4t-"]'); })) return;
        if(launch&&launch.isConnected&&mutations.every(function(m){return !launch.parentElement.contains(m.target)&&!Array.from(m.addedNodes||[]).some(function(n){return n.nodeType===1&&n.contains(launch.parentElement);});}))return;
        if (!timer) timer = setTimeout(mount, 150);
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label', 'aria-labelledby', 'title', 'data-testid'] });
    window.addEventListener('resize',function(){if(!timer)timer=setTimeout(mount,150);});
    mount();
    return { open: open };
})();
