/* Point slots exist only while editing the card title. Never rewrite view-mode DOM. */
function s4tTitlePointSlots(value, editing) {
    var assigned = '', completed = '';
    var title = String(value || '').replace(/\([^()]*\)|\[[^\[\]]*\]|\{[^{}]*\}/g, function (token) {
        var points = parsePoints(token);
        if (points.assigned !== null) assigned = String(points.assigned);
        if (points.completed !== null) completed = String(points.completed);
        if (/^\(\s*\?\s*\)$/.test(token)) assigned = '?';
        if (/^[\[{]\s*\?\s*[\]}]$/.test(token)) completed = '?';
        return points.assigned !== null || points.completed !== null || /^(?:\(\s*\??\s*\)|\[\s*\??\s*\]|\{\s*\?\s*\})$/.test(token) ? '' : token;
    }).trim();
    return [(editing || assigned !== '') ? '(' + assigned + ')' : '', title,
        (editing || completed !== '') ? '[' + completed + ']' : ''].filter(Boolean).join(' ');
}

function s4tSetTitleValue(input, value) {
    if (input.value === value) return;
    // Use the native setter so React receives the same input change as typing.
    var setter = Object.getOwnPropertyDescriptor((input.tagName === 'INPUT' ? input.ownerDocument.defaultView.HTMLInputElement : input.ownerDocument.defaultView.HTMLTextAreaElement).prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
}

var s4tTitleEditorSelector = '.card-detail-title .edit textarea, textarea.js-card-detail-title-input, textarea[data-testid="card-back-title"], textarea[data-testid="card-back-title-input"], input[data-testid="card-back-title-input"], textarea[data-testid="card-name-input"], [data-testid="card-back-title-container"] textarea, [data-testid="card-back-title-container"] input[type="text"]';
(function () {
    function enabled() { return typeof s4tPreferences === 'undefined' || s4tPreferences.enabled('titlePoints'); }
    var selector = s4tTitleEditorSelector;
    var highlighted, mirror, viewStyle;
    function restoreView() {
        if (viewStyle) {
            viewStyle.input.style.setProperty('-webkit-text-fill-color', viewStyle.value, viewStyle.priority);
            if (!viewStyle.value) viewStyle.input.style.removeProperty('-webkit-text-fill-color');
            viewStyle = null;
        }
    }
    function removeHighlight() {
        restoreView();
        if (mirror) mirror.remove();
        mirror = null; highlighted = null;
    }
    function highlight(input) {
        if (!enabled()) { removeHighlight(); return; }
        var viewing = !edits.has(input);
        if (viewStyle && (viewStyle.input !== input || !viewing)) restoreView();
        if (!input.isConnected) { removeHighlight(); return; }
        if (!mirror) {
            mirror = document.createElement('div'); mirror.id = 's4t-title-point-highlight';
            mirror.setAttribute('aria-hidden', 'true'); document.body.appendChild(mirror);
        }
        highlighted = input;
        var rect = input.getBoundingClientRect(), css = getComputedStyle(input);
        if (viewing && !viewStyle) {
            viewStyle = { input: input, value: input.style.getPropertyValue('-webkit-text-fill-color'), priority: input.style.getPropertyPriority('-webkit-text-fill-color') };
            input.style.setProperty('-webkit-text-fill-color', 'transparent', 'important');
        }
        mirror.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;overflow:hidden;color:transparent;box-sizing:border-box;white-space:pre-wrap;overflow-wrap:break-word;';
        ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','textIndent','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderStyle','borderRadius','wordSpacing','tabSize'].forEach(function (key) { mirror.style[key] = css[key]; });
        mirror.style.color = viewing ? css.color : 'transparent';
        mirror.style.borderColor = 'transparent';
        mirror.style.left = rect.left + 'px'; mirror.style.top = rect.top + 'px';
        mirror.style.width = rect.width + 'px'; mirror.style.height = rect.height + 'px';
        var fragment = document.createDocumentFragment(), pattern = /\(\s*(?:\?|\d*\.?\d*)\s*\)|\[\s*(?:\?|\d*\.?\d*)\s*\]/g;
        var text = viewing ? s4tTitlePointSlots(input.value, true) : input.value, last = 0, match;
        while ((match = pattern.exec(text))) {
            fragment.appendChild(document.createTextNode(text.slice(last, match.index)));
            var mark = document.createElement('span'); mark.textContent = match[0];
            mark.style.cssText = 'color:' + (viewing ? css.color : 'transparent') + ';border-radius:3px;background:' + (match[0][0] === '(' ? 'rgba(56,139,253,.25)' : 'rgba(34,197,94,.25)') + ';box-shadow:inset 0 -2px ' + (match[0][0] === '(' ? '#388bfd' : '#22c55e');
            if (viewing) {
                mark.style.pointerEvents = 'auto'; mark.style.cursor = 'text';
                (function (start, length) {
                    mark.onmousedown = function (event) {
                        event.preventDefault(); input.focus();
                        setTimeout(function () { if (document.activeElement === input) input.setSelectionRange(start + 1, start + length - 1); }, 0);
                    };
                })(match.index, match[0].length);
            }
            fragment.appendChild(mark); last = pattern.lastIndex;
        }
        fragment.appendChild(document.createTextNode(text.slice(last) + '\n'));
        mirror.replaceChildren(fragment); mirror.scrollTop = input.scrollTop; mirror.scrollLeft = input.scrollLeft;
    }
    document.addEventListener('input', function (event) { if (edits.has(event.target)) highlight(event.target); }, true);
    document.addEventListener('scroll', function (event) { if (highlighted && event.target !== mirror) highlight(highlighted); }, true);
    window.addEventListener('resize', function () { if (highlighted) highlight(highlighted); });
    var edits = new WeakMap();
    function begin(input) {
        if (!enabled() || !input.matches || !input.matches(selector) || input.readOnly || input.disabled || edits.has(input)) return;
        var original = input.value, prepared = s4tTitlePointSlots(original, true);
        edits.set(input, { original: original, prepared: prepared });
        var start = input.selectionStart, end = input.selectionEnd;
        s4tSetTitleValue(input, prepared);
        highlight(input);
        // React may initialise the editable value in its own focus handler after capture.
        setTimeout(function () {
            if (document.activeElement !== input || !edits.has(input)) return;
            if (input.value === original) s4tSetTitleValue(input, prepared);
            highlight(input);
        }, 0);
        if (prepared.startsWith('() ')) input.setSelectionRange(1, 1);
        else {
            var offset = prepared.indexOf(original);
            if (offset >= 0) input.setSelectionRange(start + offset, end + offset);
        }
    }
    function finish(input, cancel) {
        var edit = edits.get(input);
        if (!edit) return;
        edits.delete(input);
        if (highlighted === input) removeHighlight();
        // Focusing then leaving must not change the saved title at all.
        s4tSetTitleValue(input, cancel || input.value === edit.prepared ? edit.original : s4tTitlePointSlots(input.value, false));
    }
    document.addEventListener('focus', function (event) { begin(event.target); }, true);
    document.addEventListener('blur', function (event) { finish(event.target, false); setTimeout(syncView, 0); }, true);
    document.addEventListener('keydown', function (event) {
        if (event.isComposing) return;
        if (event.key === 'Escape') finish(event.target, true);
        else if (event.key === 'Enter' && !event.shiftKey) finish(event.target, false);
    }, true);
    // Classic Trello's Save handler may read the value before blur fires.
    document.addEventListener('pointerdown', function (event) {
        if (event.target.closest('.card-detail-title .js-save-edit')) finish(document.activeElement, false);
    }, true);
    function syncView() {
        if (!enabled()) { removeHighlight(); return; }
        var input = Array.from(document.querySelectorAll(selector)).find(function (node) { return node.getClientRects().length && !node.disabled; });
        if (!input) { removeHighlight(); return; }
        if (document.activeElement === input) begin(input);
        highlight(input);
    }
    // Ignore our mirror mutations to avoid feedback loops; native remounts still resync.
    new MutationObserver(function (mutations) {
        if (mutations.every(function (mutation) {
            return mutation.target === mirror || (mirror && mirror.contains(mutation.target)) ||
                (mutation.type === 'childList' && Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).every(function (node) { return node.id === 's4t-title-point-highlight'; }));
        })) return;
        syncView();
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['readonly', 'data-testid'] });
    document.addEventListener('s4t-preferences-changed', function () {
        if (!enabled()) {
            document.querySelectorAll(selector).forEach(function (input) { finish(input, false); });
            removeHighlight();
        } else syncView();
    });
    syncView();
})();
