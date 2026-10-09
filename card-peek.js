/* Quick Peek Out: Hover preview for card scope, checklists, and required comments.
 * Non-destructive and read-only.
 */
var s4tCardPeek = (function () {
    var popover = null;
    var backdrop = null;
    var activeCard = null;
    var activeShortLink = null;
    var hoverTimer = null;
    var closeTimer = null;
    var mountTimer = null;
    var peekCache = new Map();
    var CACHE_FRESH_MS = 3000; // Consider cache completely fresh for 3s
    var lastModalShortLink = null;

    function invalidateCache(shortLink) {
        if (shortLink) {
            peekCache.delete(shortLink);
        } else {
            peekCache.clear();
        }
    }

    var POPOVER_WIDTH = 420;
    var POPOVER_HEIGHT = 390;
    var HOVER_DELAY = 200; // Smooth intent buffer to avoid flickering
    var CLOSE_DELAY = 220; // Grace buffer to move between card and popover

    function isEnabled() {
        return typeof s4tPreferences === 'undefined' || s4tPreferences.enabled('cardPeek');
    }

    function escapeHtml(str) {
        if (typeof s4tEscapeHtml === 'function') return s4tEscapeHtml(str);
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBullets(text) {
        if (!text || typeof text !== 'string') return '';
        var lines = text.split(/\r?\n/);
        var formatted = lines.map(function (line) {
            return line.replace(/^(\s*)[-*+]\s+/, '$1• ');
        });
        return formatted.join('\n');
    }

    function inlineFormatMarkdown(str) {
        var raw = escapeHtml(str);
        return raw
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/__([^_]+)__/g, '<strong>$1</strong>')
            .replace(/\*([^*]+)\*/g, '<em>$1</em>')
            .replace(/_([^_]+)_/g, '<em>$1</em>')
            .replace(/~~([^~]+)~~/g, '<del>$1</del>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    function safeRenderDescription(text) {
        if (!text || !text.trim()) {
            return '<div class="s4t-peek-empty-desc"><em>No description provided for this card.</em></div>';
        }

        var lines = text.trim().split(/\r?\n/);
        var html = [];
        var inCodeBlock = false;
        var codeBuffer = [];
        var listStack = []; // array of { type: 'ul'|'ol', level: number }

        function closeAllLists() {
            while (listStack.length > 0) {
                var top = listStack.pop();
                html.push('</li></' + top.type + '>');
            }
        }

        for (var i = 0; i < lines.length; i++) {
            var rawLine = lines[i];

            // Code blocks
            if (/^```/.test(rawLine.trim())) {
                if (inCodeBlock) {
                    html.push('<pre><code>' + escapeHtml(codeBuffer.join('\n')) + '</code></pre>');
                    codeBuffer = [];
                    inCodeBlock = false;
                } else {
                    closeAllLists();
                    inCodeBlock = true;
                    codeBuffer = [];
                }
                continue;
            }

            if (inCodeBlock) {
                codeBuffer.push(rawLine);
                continue;
            }

            var trimmed = rawLine.trim();

            // Empty lines terminate current lists and paragraphs
            if (!trimmed) {
                closeAllLists();
                continue;
            }

            // Horizontal rule
            if (/^(?:---|\*\*\*|___)$/.test(trimmed)) {
                closeAllLists();
                html.push('<hr class="s4t-peek-hr">');
                continue;
            }

            // Headings (# through ####)
            var hMatch = rawLine.match(/^(#{1,4})\s+(.+)$/);
            if (hMatch) {
                closeAllLists();
                var hLevel = Math.min(6, hMatch[1].length + 2); // # -> h3, ## -> h4, ### -> h5, #### -> h6
                html.push('<h' + hLevel + ' class="s4t-peek-h' + hMatch[1].length + '">' + inlineFormatMarkdown(hMatch[2]) + '</h' + hLevel + '>');
                continue;
            }

            // Blockquote
            var bqMatch = rawLine.match(/^>\s*(.+)$/);
            if (bqMatch) {
                closeAllLists();
                html.push('<blockquote>' + inlineFormatMarkdown(bqMatch[1]) + '</blockquote>');
                continue;
            }

            // Lists: unordered (- * +) or ordered (1. 2.)
            var ulMatch = rawLine.match(/^(\s*)([-*+])\s+(.+)$/);
            var olMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.+)$/);
            var listMatch = ulMatch || olMatch;

            if (listMatch) {
                var indentStr = listMatch[1];
                var spaceCount = 0;
                for (var c = 0; c < indentStr.length; c++) {
                    spaceCount += (indentStr[c] === '\t' ? 2 : 1);
                }
                var level = Math.floor(spaceCount / 2); // 0 = root list, 1 = 1st sub-bullet, 2 = 2nd sub-bullet...
                var type = ulMatch ? 'ul' : 'ol';
                var itemContent = inlineFormatMarkdown(listMatch[3]);

                if (level > listStack.length) {
                    while (level > listStack.length) {
                        html.push('<' + type + '><li>');
                        listStack.push({ type: type, level: listStack.length });
                    }
                    html.push(itemContent);
                } else if (level === listStack.length) {
                    html.push('<' + type + '><li>' + itemContent);
                    listStack.push({ type: type, level: level });
                } else if (level === listStack.length - 1) {
                    if (listStack[listStack.length - 1].type !== type) {
                        var prev = listStack.pop();
                        html.push('</li></' + prev.type + '><' + type + '><li>' + itemContent);
                        listStack.push({ type: type, level: level });
                    } else {
                        html.push('</li><li>' + itemContent);
                    }
                } else {
                    while (listStack.length > level + 1) {
                        var popped = listStack.pop();
                        html.push('</li></' + popped.type + '>');
                    }
                    if (listStack.length > 0 && listStack[listStack.length - 1].type !== type) {
                        var prevList = listStack.pop();
                        html.push('</li></' + prevList.type + '><' + type + '><li>' + itemContent);
                        listStack.push({ type: type, level: level });
                    } else {
                        html.push('</li><li>' + itemContent);
                    }
                }
                continue;
            }

            // Regular paragraph line
            closeAllLists();
            html.push('<p>' + inlineFormatMarkdown(trimmed) + '</p>');
        }

        closeAllLists();
        return html.join('\n');
    }

    function normalizeCommentKey(value) {
        if (typeof s4tCommentHeadingKey === 'function') {
            return s4tCommentHeadingKey(value);
        }
        var clean = String(value || '')
            .normalize('NFKC')
            .replace(/[\u200b-\u200d\ufeff]/g, '')
            .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
            .replace(/[*_`]/g, '')
            .replace(/[\s:：\-–—]+$/, '')
            .trim()
            .toLowerCase();
        if (/^test[\s_–—\-]*cases?$/.test(clean)) return 'test cases';
        if (/^branch(?:es)?$/.test(clean)) return 'branch';
        if (/^(?:tech|technical)[\s_–—\-]*design$/.test(clean)) return 'tech design';
        return clean;
    }

    function isCommentHeadingPresent(foundHeadings, requiredName) {
        var reqKey = normalizeCommentKey(requiredName);
        var reqNorm = String(requiredName || '').toLowerCase().trim();
        return (foundHeadings || []).some(function (h) {
            var hKey = normalizeCommentKey(h);
            var hNorm = String(h || '').toLowerCase().trim();
            if (hKey === reqKey) return true;
            if (hNorm === reqNorm) return true;
            if (reqNorm && (hNorm.indexOf(reqNorm) !== -1 || reqNorm.indexOf(hNorm) !== -1)) return true;
            return false;
        });
    }

    function extractCommentHeadings(actions) {
        var headings = new Set();
        (actions || []).forEach(function (action) {
            var text = action.data && action.data.text;
            if (!text || typeof text !== 'string') return;
            var lines = text.split(/\r?\n/);
            lines.forEach(function (line) {
                var match = line.match(/^#{1,3}\s+(.+)$/);
                if (match) {
                    var raw = match[1].replace(/[*_`]/g, '').trim();
                    var clean = raw.replace(/[:–—\-#*]+$/, '').trim().toLowerCase();
                    if (clean) headings.add(clean);
                    var prefix = raw.split(/[:：–—\-]/)[0].trim().toLowerCase();
                    if (prefix) headings.add(prefix);
                }
            });
        });
        return Array.from(headings);
    }

    function getRequiredCommentNames() {
        var board = (typeof getBoardShortLink === 'function' ? getBoardShortLink() : '') || '';
        var raw = '';
        try {
            raw = localStorage.getItem('s4t-attention-comment-names-' + board) || '';
        } catch (_) {}
        if (!raw.trim()) raw = 'Tech Design\nTest Cases\nBranch';
        return raw.split(/[\r\n,]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function computePosition(cardRect, popoverWidth, popoverHeight, winWidth, winHeight) {
        var margin = 12;
        var spaceRight = winWidth - cardRect.right - margin;
        var spaceLeft = cardRect.left - margin;
        var spaceBottom = winHeight - cardRect.bottom - margin;
        var spaceTop = cardRect.top - margin;

        var placement = 'right';
        if (spaceRight >= popoverWidth) {
            placement = 'right';
        } else if (spaceLeft >= popoverWidth) {
            placement = 'left';
        } else if (spaceBottom >= popoverHeight) {
            placement = 'bottom';
        } else if (spaceTop >= popoverHeight) {
            placement = 'top';
        } else {
            placement = spaceRight >= spaceLeft ? 'right' : 'left';
        }

        var left = 0, top = 0;
        if (placement === 'right') {
            left = cardRect.right + margin;
            top = Math.max(margin, Math.min(cardRect.top, winHeight - popoverHeight - margin));
        } else if (placement === 'left') {
            left = Math.max(margin, cardRect.left - popoverWidth - margin);
            top = Math.max(margin, Math.min(cardRect.top, winHeight - popoverHeight - margin));
        } else if (placement === 'bottom') {
            top = cardRect.bottom + margin;
            left = Math.max(margin, Math.min(cardRect.left, winWidth - popoverWidth - margin));
        } else { // top
            top = Math.max(margin, cardRect.top - popoverHeight - margin);
            left = Math.max(margin, Math.min(cardRect.left, winWidth - popoverWidth - margin));
        }

        return {
            left: Math.round(left),
            top: Math.round(top),
            placement: placement
        };
    }

    function getCardShortLink(card) {
        if (!card) return null;
        var link = (card.matches && card.matches('a[href*="/c/"]')) ? card : card.querySelector('a[href*="/c/"]');
        if (!link) {
            link = card.querySelector('[data-testid="card-name"] a, .list-card-title');
            if (link && !link.matches('a[href*="/c/"]')) link = null;
        }
        if (!link) return null;
        var match = (link.getAttribute('href') || '').match(/\/c\/([a-zA-Z0-9]+)/);
        return match ? match[1] : null;
    }

    function ensureBackdrop() {
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.className = 's4t-card-peek-backdrop';
            backdrop.setAttribute('aria-hidden', 'true');
            backdrop.addEventListener('pointerdown', function () {
                closePeek();
            });
            document.body.appendChild(backdrop);
        }
        return backdrop;
    }

    function onCardEnter() {
        clearTimeout(closeTimer);
        closeTimer = null;
    }

    function onCardLeave(e) {
        if (popover && e && e.relatedTarget && popover.contains(e.relatedTarget)) {
            clearTimeout(closeTimer);
            closeTimer = null;
            return;
        }
        scheduleClose();
    }

    function bindCardListeners(card) {
        if (!card) return;
        card.addEventListener('pointerenter', onCardEnter);
        card.addEventListener('pointerleave', onCardLeave);
    }

    function unbindCardListeners(card) {
        if (!card) return;
        card.removeEventListener('pointerenter', onCardEnter);
        card.removeEventListener('pointerleave', onCardLeave);
    }

    function ensurePopover() {
        if (!popover) {
            popover = document.createElement('div');
            popover.className = 's4t-card-peek-popover';
            popover.setAttribute('role', 'dialog');
            popover.setAttribute('aria-label', 'Card Quick Peek');
            popover.setAttribute('aria-modal', 'false');

            popover.addEventListener('pointerenter', function () {
                clearTimeout(closeTimer);
                closeTimer = null;
            });
            popover.addEventListener('pointerleave', function (e) {
                if (activeCard && e && e.relatedTarget && activeCard.contains(e.relatedTarget)) {
                    clearTimeout(closeTimer);
                    closeTimer = null;
                    return;
                }
                scheduleClose();
            });

            document.body.appendChild(popover);
        }
        return popover;
    }

    function getCardSurface(card) {
        if (!card) return null;
        return card.querySelector('[data-testid="trello-card"], .list-card-details, [data-testid="card-content"]') ||
               (card.matches && card.matches('[data-testid="trello-card"], .list-card-details') ? card : null) ||
               card.querySelector('a[href*="/c/"]') ||
               card;
    }

    function isCardModalOpen() {
        if (typeof window !== 'undefined' && /^\/c\/[a-zA-Z0-9]+/.test(window.location.pathname || '')) {
            return true;
        }
        if (typeof document !== 'undefined') {
            var modal = document.querySelector('[data-testid="card-back"], .card-detail-window');
            if (modal && modal.getClientRects && modal.getClientRects().length > 0 &&
                modal.querySelector('[data-testid="card-back-title"], [data-testid="card-back-title-input"], .card-detail-title')) {
                return true;
            }
        }
        return false;
    }

    function openPeek(card) {
        if (!isEnabled()) return;
        var shortLink = getCardShortLink(card);
        if (!shortLink) return;

        clearTimeout(closeTimer);
        clearTimeout(hoverTimer);
        closeTimer = null;
        hoverTimer = null;

        activeCard = card;
        activeShortLink = shortLink;
        bindCardListeners(card);

        var bd = ensureBackdrop();
        var pop = ensurePopover();

        var cardBox = getCardSurface(card) || card;
        cardBox.classList.add('s4t-card-peek-spotlight');

        var cached = peekCache.get(shortLink);
        if (cached && cached.data) {
            // Instant render from cache (no loading flicker)
            renderContent(card, cached.data);
        } else {
            // Initial loading skeleton state
            renderLoading(card);
        }

        // Position popover safely
        pop.style.display = 'block';
        pop.style.visibility = 'visible';
        pop.style.pointerEvents = 'auto';
        if (bd) {
            bd.style.display = 'block';
        }
        updatePosition(card, pop);

        // Animate in smoothly
        requestAnimationFrame(function () {
            bd.classList.add('s4t-active');
            pop.classList.add('s4t-active');
        });

        // Load card data (background revalidate if cached, or fresh fetch)
        fetchCardData(shortLink, function (err, data) {
            if (activeShortLink !== shortLink || !pop.isConnected || !card.isConnected) return;
            if (err || !data) {
                if (!cached) renderError();
            } else {
                renderContent(card, data);
                updatePosition(card, pop);
            }
        });
    }

    function updatePosition(card, pop) {
        if (!card || !pop) return;
        if (!card.isConnected) {
            closePeek();
            return;
        }
        var cardBox = getCardSurface(card) || card;
        var cardRect = cardBox.getBoundingClientRect();
        var winWidth = window.innerWidth || (document.documentElement && document.documentElement.clientWidth) || 1024;
        var winHeight = window.innerHeight || (document.documentElement && document.documentElement.clientHeight) || 768;
        if (winWidth <= 50 || winHeight <= 50) return;

        var width = Math.max(280, Math.min(POPOVER_WIDTH, winWidth - 24));
        var height = Math.max(200, Math.min(POPOVER_HEIGHT, winHeight - 24));

        var pos = computePosition(cardRect, width, height, winWidth, winHeight);
        pop.style.width = width + 'px';
        pop.style.left = pos.left + 'px';
        pop.style.top = pos.top + 'px';
        pop.dataset.placement = pos.placement;
    }

    function renderLoading(card) {
        var pop = ensurePopover();

        pop.innerHTML = [
            '<div class="s4t-card-peek-header">',
            '  <span class="s4t-card-peek-header-title">Description / Scope</span>',
            '  <span class="s4t-card-peek-badge">Quick View</span>',
            '</div>',
            '<div class="s4t-card-peek-body">',
            '  <div class="s4t-card-peek-row1">',
            '    <div class="s4t-card-peek-loading-shimmer" style="height:120px;"></div>',
            '  </div>',
            '  <div class="s4t-card-peek-row2">',
            '    <div class="s4t-card-peek-grid-col">',
            '      <div class="s4t-card-peek-section-heading">Checklists</div>',
            '      <div class="s4t-card-peek-loading-shimmer" style="height:32px;"></div>',
            '    </div>',
            '    <div class="s4t-card-peek-grid-col">',
            '      <div class="s4t-card-peek-section-heading">Important Comments</div>',
            '      <div class="s4t-card-peek-loading-shimmer" style="height:32px;"></div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
    }

    function renderError() {
        var pop = ensurePopover();
        pop.innerHTML = [
            '<div class="s4t-card-peek-header">',
            '  <span class="s4t-card-peek-header-title">Description / Scope</span>',
            '  <span class="s4t-card-peek-badge">Quick View</span>',
            '</div>',
            '<div class="s4t-card-peek-body" style="padding:16px;text-align:center;color:var(--ds-text-subtle,#626f86)">',
            '  Could not load card details. Try opening the card directly.',
            '</div>'
        ].join('');
    }

    function copyTextToClipboard(text, callback) {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                callback(true);
            }).catch(function () {
                fallbackCopy(text, callback);
            });
            return;
        }
        fallbackCopy(text, callback);
    }

    function fallbackCopy(text, callback) {
        try {
            if (typeof document === 'undefined') {
                callback(false);
                return;
            }
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            var success = false;
            try {
                success = document.execCommand('copy');
            } catch (_) {}
            ta.remove();
            callback(success);
        } catch (_) {
            callback(false);
        }
    }

    function showToast(anchor, message, isError) {
        if (typeof document === 'undefined') return;
        var toast = (typeof document.querySelector === 'function') ? document.querySelector('.s4t-card-toast.s4t-screen-toast') : null;
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 's4t-card-toast s4t-screen-toast';
            if (toast.classList && toast.classList.add) {
                toast.classList.add('s4t-card-toast');
                toast.classList.add('s4t-screen-toast');
            }
            toast.setAttribute('role', 'status');
            toast.setAttribute('aria-live', 'polite');
            var parent = document.body || document;
            if (parent && typeof parent.appendChild === 'function') {
                parent.appendChild(toast);
            }
        }
        clearTimeout(toast._timer);
        toast.textContent = (isError ? '' : '✓ ') + message;
        if (toast.classList && toast.classList.toggle) {
            toast.classList.toggle('s4t-card-toast-error', !!isError);
        }
        toast.hidden = false;
        toast._timer = setTimeout(function () {
            if (typeof toast.remove === 'function') toast.remove();
        }, 1800);
        if (typeof document.dispatchEvent === 'function') {
            document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
        }
    }

    function createCopyDescriptionButton(data) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 's4t-card-copy s4t-card-peek-copy-btn';
        btn.setAttribute('aria-label', 'Copy description');
        btn.setAttribute('data-tooltip', 'Copy description');
        btn.setAttribute('title', 'Copy description');
        var copyIcon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>';
        btn.innerHTML = copyIcon;

        btn.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            e.stopPropagation();
        });
        btn.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
        });
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new Event('s4t-dismiss-tooltip'));
            }
            btn.removeAttribute('data-tooltip');

            var rawText = (data && typeof data.desc === 'string') ? data.desc : '';
            if (!rawText || !rawText.trim()) {
                showToast(btn, 'No description to copy', true);
                return;
            }

            if (btn.disabled) return;
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');

            var plainText = rawText.trim();
            var htmlText = safeRenderDescription(rawText);

            var writeAction;
            if (typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
                writeAction = navigator.clipboard.write([
                    new ClipboardItem({
                        'text/html': new Blob([htmlText], { type: 'text/html' }),
                        'text/plain': new Blob([plainText], { type: 'text/plain' })
                    })
                ]).catch(function () {
                    return navigator.clipboard.writeText(plainText);
                });
            } else if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
                writeAction = navigator.clipboard.writeText(plainText);
            } else {
                writeAction = new Promise(function (resolve, reject) {
                    fallbackCopy(plainText, function (ok) {
                        if (ok) resolve(); else reject(new Error('Copy failed'));
                    });
                });
            }

            Promise.resolve(writeAction).then(function () {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
                btn.textContent = '✓';
                btn.setAttribute('data-copied', '');
                btn.setAttribute('aria-label', 'Copied');
                showToast(btn, 'Description copied', false);
            }).catch(function () {
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
                btn.textContent = '!';
                btn.setAttribute('aria-label', 'Copy failed. Try again.');
                showToast(btn, 'Copy failed. Try again.', true);
            }).finally(function () {
                clearTimeout(btn._reset);
                btn._reset = setTimeout(function () {
                    btn.innerHTML = copyIcon;
                    btn.removeAttribute('data-copied');
                    btn.setAttribute('aria-label', 'Copy description');
                    btn.setAttribute('data-tooltip', 'Copy description');
                }, 1400);
            });
        });
        return btn;
    }

    function renderContent(card, data) {
        var pop = ensurePopover();
        var descHtml = safeRenderDescription(data.desc);

        // Checklists breakdown
        var checklists = Array.isArray(data.checklists) ? data.checklists : [];
        var checklistsHtml = '';
        if (!checklists.length) {
            checklistsHtml = '<div class="s4t-peek-empty-item">None added</div>';
        } else {
            checklistsHtml = checklists.map(function (list) {
                var items = Array.isArray(list.checkItems) ? list.checkItems : [];
                var done = items.filter(function (it) { return it.state === 'complete'; }).length;
                var total = items.length;
                var isDone = total > 0 && done === total;
                return [
                    '<div class="s4t-peek-item s4t-peek-checklist-item' + (isDone ? ' s4t-peek-done' : '') + '">',
                    '  <span class="s4t-peek-item-name" title="' + escapeHtml(list.name) + '">' + escapeHtml(list.name) + '</span>',
                    '  <span class="s4t-peek-item-count">(' + done + '/' + total + ')</span>',
                    '</div>'
                ].join('');
            }).join('');
        }

        // Comments heading check
        var foundHeadings = extractCommentHeadings(data.actions);
        var requiredNames = getRequiredCommentNames();
        var commentsHtml = '';
        if (!requiredNames.length) {
            commentsHtml = '<div class="s4t-peek-empty-item">No required headings configured</div>';
        } else {
            commentsHtml = requiredNames.map(function (name) {
                var isPresent = isCommentHeadingPresent(foundHeadings, name);
                return [
                    '<div class="s4t-peek-item ' + (isPresent ? 's4t-peek-present' : 's4t-peek-missing') + '">',
                    '  <span class="s4t-peek-status-icon">' + (isPresent ? '✓' : '✕') + '</span>',
                    '  <span class="s4t-peek-item-name">' + escapeHtml(name) + '</span>',
                    '</div>'
                ].join('');
            }).join('');
        }

        pop.innerHTML = [
            '<div class="s4t-card-peek-header">',
            '  <span class="s4t-card-peek-header-title">Description / Scope</span>',
            '  <span class="s4t-card-peek-badge">Quick View</span>',
            '</div>',
            '<div class="s4t-card-peek-body">',
            '  <div class="s4t-card-peek-row1">',
            '    <div class="s4t-card-peek-desc">' + descHtml + '</div>',
            '  </div>',
            '  <div class="s4t-card-peek-row2">',
            '    <div class="s4t-card-peek-grid-col">',
            '      <div class="s4t-card-peek-section-heading">Checklists (' + checklists.length + ')</div>',
            '      <div class="s4t-card-peek-items-list">' + checklistsHtml + '</div>',
            '    </div>',
            '    <div class="s4t-card-peek-grid-col">',
            '      <div class="s4t-card-peek-section-heading">Important Comments</div>',
            '      <div class="s4t-card-peek-items-list">' + commentsHtml + '</div>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');

        var row1 = pop.querySelector('.s4t-card-peek-row1');
        if (row1) {
            var copyBtn = createCopyDescriptionButton(data);
            row1.appendChild(copyBtn);
        }
    }

    function fetchCardData(shortLink, callback, forceFresh) {
        var cached = peekCache.get(shortLink);
        var now = Date.now();

        if (cached && !forceFresh) {
            var isStale = (now - cached.time) > CACHE_FRESH_MS;
            callback(null, cached.data);
            if (!isStale) return;
        }

        if (typeof $ === 'undefined' || !$.ajax) {
            if (!cached) callback(new Error('jQuery unavailable'));
            return;
        }

        $.ajax({
            url: '/1/cards/' + encodeURIComponent(shortLink),
            data: {
                fields: 'name,desc,badges',
                checklists: 'all',
                actions: 'commentCard',
                action_fields: 'data',
                actions_limit: 50
            },
            dataType: 'json',
            timeout: 15000,
            cache: false,
            xhrFields: { withCredentials: true }
        }).done(function (data) {
            if (data && typeof data === 'object') {
                peekCache.set(shortLink, { data: data, time: Date.now() });
                callback(null, data);
            } else if (!cached) {
                callback(new Error('Invalid response'));
            }
        }).fail(function (xhr, status, error) {
            if (!cached) {
                callback(error || new Error('Request failed'));
            }
        });
    }

    function closePeek() {
        clearTimeout(hoverTimer);
        clearTimeout(closeTimer);
        hoverTimer = null;
        closeTimer = null;

        if (activeCard) {
            unbindCardListeners(activeCard);
            var cardBox = getCardSurface(activeCard) || activeCard;
            cardBox.classList.remove('s4t-card-peek-spotlight');
            activeCard.classList.remove('s4t-card-peek-spotlight');
            activeCard = null;
        }
        if (typeof document !== 'undefined') {
            document.querySelectorAll('.s4t-card-peek-spotlight').forEach(function (el) {
                el.classList.remove('s4t-card-peek-spotlight');
            });
        }
        activeShortLink = null;

        if (popover) {
            var toast = popover.querySelector('.s4t-card-toast');
            if (toast) toast.remove();
            popover.classList.remove('s4t-active');
            popover.style.display = 'none';
            popover.style.visibility = 'hidden';
            popover.style.pointerEvents = 'none';
        }
        if (backdrop) {
            backdrop.classList.remove('s4t-active');
            backdrop.style.display = 'none';
        }
    }

    function scheduleClose() {
        clearTimeout(hoverTimer);
        clearTimeout(closeTimer);
        hoverTimer = null;
        closeTimer = setTimeout(closePeek, CLOSE_DELAY);
    }

    var REGISTRATION_PAPER_ICON = '<i class="fi fi-tr-registration-paper" aria-hidden="true"><svg viewBox="0 0 512 512" width="14" height="14" fill="currentColor" stroke="currentColor" stroke-width="24" stroke-linejoin="round" stroke-linecap="round" fill-rule="evenodd" aria-hidden="true"><path d="M56 0 L227 0 L233 4 L235 9 L233 17 L228 21 L112 21 L123 38 L128 56 L128 454 L131 465 L137 475 L150 486 L168 491 L184 489 L196 483 L206 473 L210 466 L213 456 L215 431 L223 413 L239 396 L256 387 L269 384 L405 384 L405 329 L409 322 L419 320 L425 324 L427 329 L427 384 L456 384 L472 388 L489 398 L501 411 L508 424 L512 440 L512 456 L510 466 L503 482 L489 498 L472 508 L456 512 L163 512 L147 508 L137 503 L120 488 L112 475 L107 458 L107 128 L56 128 L40 124 L30 119 L11 101 L4 88 L0 72 L0 56 L2 46 L14 23 L32 8 L40 4 Z M362 0 L385 0 L409 4 L441 17 L464 33 L479 48 L495 71 L507 100 L512 127 L512 150 L506 181 L494 208 L481 227 L462 246 L440 261 L410 273 L389 277 L358 277 L337 273 L317 266 L291 251 L270 232 L252 207 L240 179 L235 154 L235 123 L239 102 L251 72 L266 50 L285 31 L302 19 L331 6 Z M62 21 L54 22 L40 28 L28 40 L24 48 L21 61 L22 74 L28 88 L40 100 L54 106 L106 107 L107 61 L106 54 L100 40 L86 27 L74 22 Z M368 21 L346 24 L323 32 L303 44 L283 63 L270 82 L261 103 L256 128 L256 149 L260 171 L272 199 L287 219 L300 231 L315 241 L341 252 L363 256 L383 256 L409 251 L430 242 L449 229 L464 214 L474 200 L484 179 L490 155 L491 133 L489 116 L482 93 L467 67 L451 50 L433 37 L414 28 L390 22 Z M436 106 L442 107 L447 112 L448 120 L446 124 L384 184 L370 191 L353 192 L340 188 L334 184 L311 160 L309 160 L299 148 L299 140 L303 135 L314 134 L347 167 L357 171 L365 170 L371 167 L425 113 Z M275 405 L264 407 L255 411 L242 423 L235 440 L234 460 L231 471 L219 491 L451 491 L464 488 L476 481 L484 472 L490 458 L490 438 L484 424 L472 412 L458 406 Z"/></svg></i>';

    function createPeekButton(card) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 's4t-card-peek-btn';
        btn.setAttribute('aria-label', 'Quick peek out card preview');
        btn.setAttribute('data-tooltip', 'Quick Peek out');
        btn.innerHTML = REGISTRATION_PAPER_ICON;

        btn.addEventListener('pointerenter', function (event) {
            if (!isEnabled()) return;
            clearTimeout(closeTimer);
            clearTimeout(hoverTimer);
            hoverTimer = setTimeout(function () {
                openPeek(card);
            }, HOVER_DELAY);
        });

        btn.addEventListener('pointerleave', function (event) {
            if (activeCard && event.relatedTarget && activeCard.contains(event.relatedTarget)) {
                return;
            }
            if (popover && event.relatedTarget && popover.contains(event.relatedTarget)) {
                return;
            }
            scheduleClose();
        });

        btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            openPeek(card);
        });

        return btn;
    }

    function isCardContainer(el, cardSurface) {
        if (!el) return true;
        if (el === cardSurface || (el.matches && el.matches('[data-testid="trello-card"], .list-card, .list-card-details, [data-testid="card-content"]'))) return true;
        return !!el.querySelector('[data-testid="card-name"], .list-card-title, .js-card-name');
    }

    function mountCards() {
        mountTimer = null;
        if (!isEnabled()) {
            document.querySelectorAll('.s4t-card-peek-btn, .s4t-card-peek-footer, .s4t-card-peek-badges-slot').forEach(function (el) { el.remove(); });
            return;
        }

        var cardSelector = '[data-testid="list-card"]:not(.placeholder), .list-card:not(.placeholder), [data-testid="trello-card"]';
        var cards = document.querySelectorAll(cardSelector);
        cards.forEach(function (card) {
            var cardSurface = getCardSurface(card);
            if (!cardSurface || cardSurface.querySelector('.s4t-card-peek-btn')) return;

            var btn = createPeekButton(card);

            var badgesTarget = cardSurface.querySelector('[data-testid="card-front-badges"], .badges, [data-testid="badges"], .js-badges');
            var membersTarget = cardSurface.querySelector('[data-testid="card-front-members"], .list-card-members');
            if (!membersTarget) {
                var avatarEl = cardSurface.querySelector('[data-testid="card-front-avatar"], [data-testid="card-front-member"], [data-testid*="member-avatar"], .list-card-members .member');
                if (avatarEl) {
                    membersTarget = avatarEl.closest('[data-testid="card-front-members"], .list-card-members') || avatarEl;
                }
            }

            if (membersTarget && membersTarget.parentElement && cardSurface.contains(membersTarget.parentElement)) {
                var memberRow = membersTarget.parentElement;
                if (!isCardContainer(memberRow, cardSurface)) {
                    // Modern Trello bottom row container that houses members (and optionally badges)
                    if (!badgesTarget || !memberRow.contains(badgesTarget)) {
                        btn.classList.add('s4t-lead-alone');
                    }
                    memberRow.insertBefore(btn, memberRow.firstChild);
                } else {
                    // Full card container without a sub-row: place before badges if present, else before members
                    var anchor = (badgesTarget && cardSurface.contains(badgesTarget)) ? badgesTarget : membersTarget;
                    if (anchor === membersTarget) btn.classList.add('s4t-lead-alone');
                    anchor.parentElement.insertBefore(btn, anchor);
                }
            } else if (badgesTarget && badgesTarget.parentElement && cardSurface.contains(badgesTarget.parentElement)) {
                // Card has badges but no assigned members
                var badgeRow = badgesTarget.parentElement;
                if (!isCardContainer(badgeRow, cardSurface)) {
                    badgeRow.insertBefore(btn, badgeRow.firstChild);
                } else {
                    badgeRow.insertBefore(btn, badgesTarget);
                }
            } else {
                // Neither badges nor members: dedicated bottom-left row inside the card surface
                var footer = cardSurface.querySelector('.s4t-card-peek-footer');
                if (!footer) {
                    footer = document.createElement('div');
                    footer.className = 's4t-card-peek-footer';
                    cardSurface.appendChild(footer);
                }
                footer.prepend(btn);
            }
        });
    }

    function scheduleMount() {
        if (!mountTimer) {
            mountTimer = setTimeout(mountCards, 120);
        }
    }

    if (typeof document !== 'undefined') {
        // Keyboard support: Escape closes any open peek
        document.addEventListener('keydown', function (event) {
            if (event.key === 'Escape' && popover && popover.classList.contains('s4t-active')) {
                closePeek();
            }
        });

        // Close immediately on blur, tab switch, or navigation so Trello stays 100% responsive
        document.addEventListener('visibilitychange', closePeek);
        if (typeof window !== 'undefined') {
            window.addEventListener('blur', closePeek);
            window.addEventListener('focus', closePeek);
            window.addEventListener('pagehide', closePeek);
        }

        // Close immediately when mouse leaves browser window boundary (another monitor, Chrome tab bar, taskbar)
        document.documentElement.addEventListener('mouseleave', closePeek);
        document.addEventListener('mouseleave', closePeek);
        if (typeof window !== 'undefined') {
            window.addEventListener('mouseout', function (event) {
                if (!event.relatedTarget) {
                    closePeek();
                }
            });
        }

        // Maintain hover zone across active card and popover; close immediately if moving over another card
        document.addEventListener('pointermove', function (event) {
            if (!popover || !popover.classList.contains('s4t-active')) return;
            if (popover.contains(event.target)) {
                clearTimeout(closeTimer);
                closeTimer = null;
                return;
            }
            if (activeCard && activeCard.contains(event.target)) {
                clearTimeout(closeTimer);
                closeTimer = null;
                return;
            }
            // If pointer moved over another card entirely, close immediately
            var otherCard = event.target && event.target.closest && event.target.closest('[data-testid="list-card"], .list-card, [data-testid="trello-card"]');
            if (otherCard && otherCard !== activeCard) {
                closePeek();
            }
        }, { passive: true });

        // Clicking outside the popover (including clicking the card to open it) immediately closes peek
        document.addEventListener('pointerdown', function (event) {
            if (popover && popover.classList.contains('s4t-active')) {
                if (!popover.contains(event.target)) {
                    if (event.target && event.target.closest && event.target.closest('.s4t-card-peek-btn')) {
                        return;
                    }
                    closePeek();
                }
            }
        }, true);

        // Clicking any card surface or card link immediately closes the peek popover
        document.addEventListener('click', function (event) {
            if (!popover || !popover.classList.contains('s4t-active')) return;
            if (event.target && event.target.closest) {
                if (event.target.closest('.s4t-card-peek-btn') || popover.contains(event.target)) {
                    return;
                }
                if (event.target.closest('[data-testid="list-card"], .list-card, [data-testid="trello-card"], a[href*="/c/"]')) {
                    closePeek();
                }
            }
        }, true);

        // Listen for preference changes
        document.addEventListener('s4t-preferences-changed', function () {
            if (!isEnabled()) closePeek();
            scheduleMount();
        });

        function checkModalRoute() {
            if (typeof window === 'undefined') return;
            var match = (window.location.pathname || '').match(/^\/c\/([a-zA-Z0-9]+)/);
            var current = match ? match[1] : null;
            if (current && popover && popover.classList.contains('s4t-active')) {
                closePeek();
            }
            if (lastModalShortLink && lastModalShortLink !== current) {
                // Closed or switched away from card modal: invalidate cached card data
                invalidateCache(lastModalShortLink);
            }
            lastModalShortLink = current;
        }

        if (typeof window !== 'undefined') {
            window.addEventListener('popstate', checkModalRoute);
        }
        document.addEventListener('s4t-checklist-updated', function () {
            invalidateCache();
        });
        document.addEventListener('s4t-comments-updated', function () {
            invalidateCache();
        });

        if (typeof window !== 'undefined') {
            window.addEventListener('resize', function () {
                if (document.hidden) {
                    closePeek();
                    return;
                }
                if (activeCard && popover && popover.classList.contains('s4t-active')) {
                    updatePosition(activeCard, popover);
                }
            });
        }

        document.addEventListener('scroll', function (event) {
            // If scrolling the board (not inside the popover), close peek to avoid misalignments
            if (popover && popover.classList.contains('s4t-active') && (!event.target || !popover.contains(event.target))) {
                closePeek();
            }
        }, true);

        // MutationObserver to mount icons on dynamically rendered cards and detect card modal edits
        if (typeof MutationObserver !== 'undefined' && document.body) {
            new MutationObserver(function (mutations) {
                checkModalRoute();
                if (isCardModalOpen() && popover && popover.classList.contains('s4t-active')) {
                    closePeek();
                }
                var shouldMount = false;
                var commentOrChecklistSelector = '.comment-container, .phenom-comment, .current-comment, .action-comment, [data-testid="action-comment"], [data-testid="card-back-comment"], [data-testid="comment-content"], [data-testid="comment-text"], .checklist-item, [data-testid="check-item-container"], .card-detail-item, [data-testid="card-description-editor"]';

                for (var i = 0; i < mutations.length; i++) {
                    var m = mutations[i];
                    if (m.target && m.target.nodeType === 1) {
                        if (m.target.closest && m.target.closest('.s4t-card-peek-popover, .s4t-card-peek-backdrop')) continue;
                        if (lastModalShortLink && m.target.closest && m.target.closest(commentOrChecklistSelector)) {
                            invalidateCache(lastModalShortLink);
                        }
                    }
                    if (m.addedNodes && m.addedNodes.length > 0) {
                        for (var n = 0; n < m.addedNodes.length; n++) {
                            var node = m.addedNodes[n];
                            if (node.nodeType === 1 && (
                                node.classList.contains('s4t-card-peek-btn') ||
                                node.classList.contains('s4t-card-peek-footer') ||
                                node.classList.contains('s4t-card-peek-popover') ||
                                node.classList.contains('s4t-card-peek-backdrop')
                            )) {
                                continue;
                            }
                            shouldMount = true;
                            break;
                        }
                    }
                    if (shouldMount && !lastModalShortLink) break;
                }
                if (shouldMount) scheduleMount();
            }).observe(document.body, { childList: true, subtree: true });
        }

        // Initial mount
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scheduleMount);
        } else {
            scheduleMount();
        }
    }

    return {
        computePosition: computePosition,
        extractCommentHeadings: extractCommentHeadings,
        safeRenderDescription: safeRenderDescription,
        normalizeCommentKey: normalizeCommentKey,
        isCommentHeadingPresent: isCommentHeadingPresent,
        createPeekButton: createPeekButton,
        createCopyDescriptionButton: createCopyDescriptionButton,
        isCardModalOpen: isCardModalOpen,
        open: openPeek,
        close: closePeek,
        mount: mountCards,
        invalidate: invalidateCache,
        fetchCardData: fetchCardData,
        formatBullets: formatBullets
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = s4tCardPeek;
}
