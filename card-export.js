/* Interactive Sheet Column Designer & Board Card Export for Sprint Helper */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.s4tOpenCardExport = api.s4tOpenCardExport;
        root.s4tExportCardFields = api.s4tExportCardFields;
        root.s4tExtractFieldValue = api.s4tExtractFieldValue;
        root.s4tBuildExportCsv = api.s4tBuildExportCsv;
        root.s4tBuildExportExcel = api.s4tBuildExportExcel;
        root.s4tBuildExportTsv = api.s4tBuildExportTsv;
        root.s4tFilterAndSortCards = api.s4tFilterAndSortCards;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    var FIELD_DEFINITIONS = [
        { key: 'list', label: 'List Name', desc: 'Trello List name (e.g. "Screening", "In Progress").' },
        { key: 'title', label: 'Title (Clean)', desc: 'Clean card title (without point badges).' },
        { key: 'title_raw', label: 'Title (Raw)', desc: 'Full card title (including any points or tags).' },
        { key: 'points', label: 'Story Points', desc: 'Story points (estimated/assigned).' },
        { key: 'completed_points', label: 'Completed Points', desc: 'Completed points (from [ ] or { }).' },
        { key: 'remaining_points', label: 'Remaining Points', desc: 'Remaining points.' },
        { key: 'members', label: 'Developers', desc: 'Developer / member names (or usernames).' },
        { key: 'labels', label: 'Labels', desc: 'Label names (comma-separated).' },
        { key: 'due', label: 'Due Date', desc: 'Due date formatted (e.g. "2026-09-15").' },
        { key: 'status', label: 'Status', desc: 'Completion status ("Done" if in done list or dueComplete, otherwise "In Progress").' },
        { key: 'desc', label: 'Description', desc: 'Card description.' },
        { key: 'url', label: 'Card URL', desc: 'Direct link to Trello card (https://trello.com/c/...).' },
        { key: 'checklists', label: 'Checklists', desc: 'Checklist completion summary (e.g. "3/5").' },
        { key: 'blank', label: 'Blank Column', desc: 'Empty cell (for manual spreadsheet notes/remarks).' }
    ];

    var FIELD_MAP = {};
    FIELD_DEFINITIONS.forEach(function (f) { FIELD_MAP[f.key] = f; });

    var DEFAULT_COLUMNS = [
        { id: 'c_area', header: 'Area', source: 'list', cellType: 'text' },
        { id: 'c_tasks', header: 'Tasks', source: 'title', cellType: 'text' },
        { id: 'c_pts', header: 'Points', source: 'points', cellType: 'text' },
        { id: 'c_assignee', header: 'Assignee', source: 'members', cellType: 'dev_select' },
        { id: 'c_labels', header: 'Labels', source: 'labels', cellType: 'text' },
        { id: 'c_due', header: 'Due Date', source: 'due', cellType: 'text' },
        { id: 'c_status', header: 'Status', source: 'status', cellType: 'checkbox' },
        { id: 'c_remarks', header: 'Remarks', source: 'blank', cellType: 'custom_select', customOptions: 'In Progress, Blocked, Ready for QA, Approved' }
    ];

    function s4tEscapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function s4tNeutralizeFormula(text) {
        var str = String(text == null ? '' : text);
        if (/^[\s\u0000-\u001f]*[=+@-]/.test(str)) {
            return "'" + str;
        }
        return str;
    }

    function s4tSpreadsheetText(value) {
        return s4tEscapeHtml(s4tNeutralizeFormula(value));
    }

    function parsePoints(str) {
        if (typeof globalThis !== 'undefined' && typeof globalThis.parsePoints === 'function') {
            return globalThis.parsePoints(str);
        }
        var pAssigned = null, pCompleted = null;
        if (!str || typeof str !== 'string') return { assigned: null, completed: null };
        var slashM = str.match(/[(\[{\[]\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*\/\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*[)\]}]/);
        if (slashM) {
            pCompleted = parseFloat(slashM[1]);
            pAssigned = parseFloat(slashM[2]);
            return { assigned: pAssigned, completed: pCompleted };
        }
        var pM = str.match(/\(\s*(?:est|estimate|points?|pts?|sp)?\s*[:=]?\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*(?:pts?|points?|sp)?\s*\)/i);
        if (pM) {
            var v = parseFloat(pM[1]);
            if (!isNaN(v) && v >= 0) pAssigned = v;
        }
        var cM = str.match(/[\[\{]\s*(?:done|completed|spent|consumed)?\s*[:=]?\s*((?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+))\s*(?:pts?|points?|sp)?\s*[\]\}]/i);
        if (cM) {
            var cv = parseFloat(cM[1]);
            if (!isNaN(cv) && cv >= 0) pCompleted = cv;
        }
        return { assigned: pAssigned, completed: pCompleted };
    }

    function cleanTitle(title) {
        return String(title || '')
            .replace(/[([{]\s*(?:\?|\d+(?:\.\d+)?)(?:\s*\/\s*\d+(?:\.\d+)?)?\s*(?:pts?|points?)?\s*[)\]}]/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim() || title;
    }

    function isDoneList(listName) {
        var name = String(listName || '').toLowerCase();
        return /\b(done|finished|completed|shipped|released|closed|resolved|deploy(ed)?)\b/i.test(name);
    }

    function s4tExtractFieldValue(card, sourceKey, lookup) {
        if (!card || !sourceKey) return '';
        var listsById = (lookup && lookup.listsById) || new Map();
        var membersById = (lookup && lookup.membersById) || new Map();
        var labelsById = (lookup && lookup.labelsById) || new Map();

        switch (sourceKey) {
            case 'list': {
                var l = listsById.get(card.idList);
                return l ? (l.name || '') : '';
            }
            case 'title': {
                return cleanTitle(card.name);
            }
            case 'title_raw': {
                return card.name || '';
            }
            case 'points': {
                var pts = parsePoints(card.name);
                return pts.assigned !== null ? String(pts.assigned) : '';
            }
            case 'completed_points': {
                var pts2 = parsePoints(card.name);
                return pts2.completed !== null ? String(pts2.completed) : '';
            }
            case 'remaining_points': {
                var pts3 = parsePoints(card.name);
                if (pts3.assigned !== null) {
                    var comp = pts3.completed || 0;
                    return String(Math.max(0, Math.round((pts3.assigned - comp) * 100) / 100));
                } else if (pts3.completed !== null) {
                    return '0';
                }
                return '';
            }
            case 'members': {
                var memberIds = card.idMembers || [];
                return memberIds.map(function (id) {
                    var m = membersById.get(id);
                    return m ? (m.fullName || m.username || '') : '';
                }).filter(Boolean).join(', ');
            }
            case 'labels': {
                var labels = Array.isArray(card.labels) && card.labels.length ? card.labels : [];
                if (!labels.length && Array.isArray(card.idLabels)) {
                    labels = card.idLabels.map(function (id) { return labelsById.get(id); }).filter(Boolean);
                }
                return labels.map(function (lb) { return lb.name || lb.color || ''; }).filter(Boolean).join(', ');
            }
            case 'due': {
                if (!card.due) return '';
                try {
                    return String(card.due).slice(0, 10);
                } catch (_) {
                    return String(card.due);
                }
            }
            case 'status': {
                var targetList = listsById.get(card.idList);
                var isDone = card.dueComplete || (targetList && isDoneList(targetList.name));
                return isDone ? 'Done' : 'In Progress';
            }
            case 'desc': {
                return card.desc || '';
            }
            case 'url': {
                if (card.shortUrl) return card.shortUrl;
                if (card.shortLink) return 'https://trello.com/c/' + card.shortLink;
                if (card.url) return card.url;
                return card.id ? 'https://trello.com/c/' + card.id : '';
            }
            case 'checklists': {
                if (card.badges && card.badges.checkItems) {
                    return (card.badges.checkItemsChecked || 0) + '/' + card.badges.checkItems;
                }
                if (Array.isArray(card.checklists) && card.checklists.length) {
                    var total = 0, checked = 0;
                    card.checklists.forEach(function (cl) {
                        if (Array.isArray(cl.checkItems)) {
                            total += cl.checkItems.length;
                            cl.checkItems.forEach(function (ci) {
                                if (ci.state === 'complete') checked++;
                            });
                        }
                    });
                    return total > 0 ? (checked + '/' + total) : '';
                }
                return '';
            }
            case 'blank':
            default:
                return '';
        }
    }

    function s4tFilterAndSortCards(cards, boardData, options) {
        if (!Array.isArray(cards)) return [];
        var opts = options || {};
        var excludedLists = new Set(opts.excludedListIds || []);
        var excludedMembers = new Set(opts.excludedMemberIds || []);
        var excludedLabels = new Set(opts.excludedLabelIds || []);
        var excludeNotSure = !!opts.excludeNotSure;
        var notSureListIds = new Set();

        if (boardData && Array.isArray(boardData.lists)) {
            boardData.lists.forEach(function (l) {
                if (excludeNotSure && /\bnot[\s_-]*sure\b/i.test(l.name)) {
                    notSureListIds.add(l.id);
                }
            });
        }

        var isCommonCardFn = (typeof globalThis !== 'undefined' && typeof globalThis.s4tIsCommonCard === 'function')
            ? globalThis.s4tIsCommonCard
            : function (c) { return /\b(release|template)\b/i.test(c.name || ''); };

        var filtered = cards.filter(function (card) {
            if (!card || card.closed) return false;
            if (isCommonCardFn(card)) return false;
            if (excludedLists.has(card.idList)) return false;
            if (notSureListIds.has(card.idList)) return false;

            if (excludedMembers.size > 0) {
                var members = card.idMembers || [];
                if (members.length === 0 && excludedMembers.has('__unassigned__')) return false;
                if (members.length > 0 && members.every(function (id) { return excludedMembers.has(id); })) return false;
            }

            if (excludedLabels.size > 0) {
                var cardLabels = Array.isArray(card.labels) ? card.labels.map(function (l) { return l.id || l.name; }) : [];
                if (!cardLabels.length && Array.isArray(card.idLabels)) cardLabels = card.idLabels;
                if (cardLabels.length === 0 && excludedLabels.has('__unlabeled__')) return false;
                if (cardLabels.some(function (lbl) { return excludedLabels.has(lbl); })) return false;
            }

            return true;
        });

        var sortBy = opts.sortBy || 'list';
        var listIndexMap = new Map();
        if (boardData && Array.isArray(boardData.lists)) {
            boardData.lists.forEach(function (l, idx) { listIndexMap.set(l.id, idx); });
        }
        var memberNameMap = new Map();
        if (boardData && Array.isArray(boardData.members)) {
            boardData.members.forEach(function (m) { memberNameMap.set(m.id, (m.fullName || m.username || '').toLowerCase()); });
        }

        filtered.sort(function (a, b) {
            switch (sortBy) {
                case 'dev': {
                    var devA = (a.idMembers && a.idMembers[0] && memberNameMap.get(a.idMembers[0])) || 'zzz';
                    var devB = (b.idMembers && b.idMembers[0] && memberNameMap.get(b.idMembers[0])) || 'zzz';
                    return devA.localeCompare(devB);
                }
                case 'title': {
                    var titleA = cleanTitle(a.name).toLowerCase();
                    var titleB = cleanTitle(b.name).toLowerCase();
                    return titleA.localeCompare(titleB);
                }
                case 'points_desc': {
                    var pa = parsePoints(a.name).assigned || 0;
                    var pb = parsePoints(b.name).assigned || 0;
                    return pb - pa;
                }
                case 'points_asc': {
                    var pa2 = parsePoints(a.name).assigned || 0;
                    var pb2 = parsePoints(b.name).assigned || 0;
                    return pa2 - pb2;
                }
                case 'due': {
                    var dueA = a.due || '9999-99-99';
                    var dueB = b.due || '9999-99-99';
                    return dueA.localeCompare(dueB);
                }
                case 'list':
                default: {
                    var idxA = listIndexMap.has(a.idList) ? listIndexMap.get(a.idList) : 999;
                    var idxB = listIndexMap.has(b.idList) ? listIndexMap.get(b.idList) : 999;
                    if (idxA !== idxB) return idxA - idxB;
                    return (a.pos || 0) - (b.pos || 0);
                }
            }
        });

        return filtered;
    }

    function getCardGroupKey(card, sortBy, lookup) {
        if (!card) return '';
        var listsById = (lookup && lookup.listsById) || new Map();
        var membersById = (lookup && lookup.membersById) || new Map();
        switch (sortBy) {
            case 'dev': {
                var mId = card.idMembers && card.idMembers[0];
                var m = mId ? membersById.get(mId) : null;
                return m ? (m.fullName || m.username || 'Unassigned') : 'Unassigned';
            }
            case 'due': {
                return card.due ? String(card.due).slice(0, 10) : 'No Due Date';
            }
            case 'points_desc':
            case 'points_asc': {
                var pts = parsePoints(card.name).assigned;
                return pts !== null ? (pts + ' Points') : '0 Points';
            }
            case 'title': {
                var t = cleanTitle(card.name).trim();
                return t ? t.charAt(0).toUpperCase() : '#';
            }
            case 'list':
            default: {
                var l = listsById.get(card.idList);
                return l ? (l.name || 'Unknown List') : 'Unknown List';
            }
        }
    }

    function s4tBuildExportCsv(columns, cards, lookup, options) {
        var opts = options || {};
        var insertSeparator = !!opts.insertSeparatorRow;
        var sortBy = opts.sortBy || 'list';
        var lines = [];
        var headers = columns.map(function (c) {
            var h = String(c.header || '').replace(/"/g, '""');
            return '"' + s4tNeutralizeFormula(h) + '"';
        });
        lines.push(headers.join(','));

        var prevGroup = null;
        cards.forEach(function (card) {
            if (insertSeparator) {
                var grp = getCardGroupKey(card, sortBy, lookup);
                if (prevGroup !== null && grp !== prevGroup) {
                    lines.push(columns.map(function () { return '""'; }).join(','));
                }
                prevGroup = grp;
            }
            var row = columns.map(function (c) {
                var val = s4tExtractFieldValue(card, c.source, lookup);
                var safeVal = s4tNeutralizeFormula(val);
                return '"' + String(safeVal).replace(/"/g, '""') + '"';
            });
            lines.push(row.join(','));
        });

        return '\uFEFF' + lines.join('\r\n');
    }

    function s4tBuildExportExcel(columns, cards, lookup, title, options) {
        var opts = options;
        if (typeof title === 'object' && title !== null && !options) {
            opts = title;
            title = 'Sprint Cards';
        }
        opts = opts || {};
        var insertSeparator = !!opts.insertSeparatorRow;
        var sortBy = opts.sortBy || 'list';

        var sheetTitle = s4tEscapeHtml(title || 'Sprint Cards');
        var s = [
            '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">',
            '<head>',
            '<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
            '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>',
            '<x:Name>' + sheetTitle + '</x:Name>',
            '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>',
            '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->',
            '<style>',
            'table { border-collapse: collapse; width: 100%; font-family: \'Times New Roman\', Times, serif; font-size: 11pt; }',
            'th { border: 1px solid #7cb594; padding: 8px 12px; text-align: left; background-color: #b7e1cd; color: #000000; font-weight: bold; font-family: \'Times New Roman\', Times, serif; }',
            'td { border: 1px solid #dfe1e6; padding: 6px 10px; vertical-align: top; mso-number-format:"\\@"; font-family: \'Times New Roman\', Times, serif; color: #000000; }',
            'tr.s4t-even td { background-color: #f4f5f7; }',
            'tr.s4t-sep td { height: 12px; background-color: #ebecf0; border: 1px solid #dfe1e6; }',
            '</style>',
            '</head>',
            '<body>',
            '<table border="1">',
            '<thead><tr>'
        ];

        columns.forEach(function (c) {
            s.push('<th>' + s4tSpreadsheetText(c.header || '') + '</th>');
        });
        s.push('</tr></thead><tbody>');

        var prevGroup = null;
        cards.forEach(function (card, rIdx) {
            var grp = getCardGroupKey(card, sortBy, lookup);
            if (prevGroup !== null && grp !== prevGroup) {
                if (insertSeparator) {
                    s.push('<tr class="s4t-sep"><td colspan="' + columns.length + '">&nbsp;</td></tr>');
                }
            }
            prevGroup = grp;

            var trClass = (rIdx % 2 === 1) ? ' class="s4t-even"' : '';

            s.push('<tr' + trClass + '>');
            columns.forEach(function (c) {
                var val = s4tExtractFieldValue(card, c.source, lookup);
                s.push('<td>' + s4tSpreadsheetText(val) + '</td>');
            });
            s.push('</tr>');
        });

        s.push('</tbody></table></body></html>');
        return s.join('\n');
    }

    function s4tBuildExportTsv(columns, cards, lookup, options) {
        var opts = options || {};
        var insertSeparator = !!opts.insertSeparatorRow;
        var sortBy = opts.sortBy || 'list';
        var lines = [];
        lines.push(columns.map(function (c) { return s4tNeutralizeFormula(c.header || '').replace(/\t/g, ' '); }).join('\t'));

        var prevGroup = null;
        cards.forEach(function (card) {
            if (insertSeparator) {
                var grp = getCardGroupKey(card, sortBy, lookup);
                if (prevGroup !== null && grp !== prevGroup) {
                    lines.push(columns.map(function () { return ''; }).join('\t'));
                }
                prevGroup = grp;
            }
            var row = columns.map(function (c) {
                var val = s4tExtractFieldValue(card, c.source, lookup);
                return s4tNeutralizeFormula(val).replace(/[\t\r\n]+/g, ' ');
            });
            lines.push(row.join('\t'));
        });

        return lines.join('\n');
    }

    var activeOverlay = null;

    function s4tOpenCardExport(options) {
        if (typeof document === 'undefined') return;
        var opts = options || {};

        if (activeOverlay) {
            activeOverlay.remove();
            activeOverlay = null;
        }
        $('#s4t-modal-overlay, #s4t-cards-overlay, #s4t-eow-overlay, #s4t-sheets-overlay').remove();

        var boardShortLink = opts.boardShortLink || (typeof getBoardShortLink === 'function' ? getBoardShortLink() : '');
        var boardName = opts.boardName || $('.board-name span.text, [data-testid="board-name-display"]').text().trim() || 'Board Cards';

        var storageKey = 's4t_card_export_cfg_' + (boardShortLink || 'default');
        var savedColumns = null;
        var savedInsertSeparator = false;
        var savedColorByGroup = false;
        try {
            var rawSaved = localStorage.getItem(storageKey) || localStorage.getItem('s4t_card_export_cfg_default');
            if (rawSaved) {
                var parsed = JSON.parse(rawSaved);
                if (Array.isArray(parsed) && parsed.length) {
                    savedColumns = parsed;
                } else if (parsed && Array.isArray(parsed.columns)) {
                    savedColumns = parsed.columns;
                    savedInsertSeparator = !!parsed.insertSeparatorRow;
                }
            }
        } catch (_) {}

        var state = {
            currentTab: 'sheet',
            columns: savedColumns || JSON.parse(JSON.stringify(DEFAULT_COLUMNS)),
            insertSeparatorRow: savedInsertSeparator,
            excludedListIds: new Set(),
            excludeNotSure: true,
            excludedMemberIds: new Set(),
            excludedLabelIds: new Set(),
            sortBy: 'list',
            previewVisible: false,
            previewDirty: false,
            boardData: opts.boardData || (typeof cachedBoardData !== 'undefined' ? cachedBoardData : null),
            lookup: null,
            filteredCards: [],
            selectedFormat: 'excel' // 'excel' or 'csv'
        };

        var overlay = $('<div id="s4t-export-overlay" class="s4t-modal-backdrop" role="presentation">');
        var dialog = $('<section id="s4t-export-dialog" class="s4t-export-dialog" role="dialog" aria-modal="true" aria-labelledby="s4t-export-title">');
        overlay.append(dialog);
        $('body').append(overlay);
        activeOverlay = overlay;

        function close() {
            if (activeOverlay === overlay) activeOverlay = null;
            overlay.remove();
            $(document).off('keydown.s4tExportClose');
            $(document).off('click.s4tFormatMenuClose');
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('s4t-dismiss-tooltip'));
            }
        }

        $(document).on('keydown.s4tExportClose', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) close();
        });

        overlay.on('click', function (e) {
            if (e.target === overlay[0]) close();
        });

        dialog.html([
            '<header class="s4t-export-header s4t-modal-header">',
            '  <div class="s4t-export-title-row s4t-modal-title-area">',
            '    <div class="s4t-feature-title">',
            '      <svg class="s4t-export-title-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>',
            '      <h2 id="s4t-export-title" class="s4t-modal-title">Export Board Cards</h2>',
            '    </div>',
            '    <span class="s4t-export-board-tag s4t-board-badge">' + s4tEscapeHtml(boardName) + '</span>',
            '    <span class="s4t-export-match-count" id="s4t-export-count-badge">0 cards matching</span>',
            '  </div>',
            '  <div class="s4t-export-header-actions">',
            '    <button type="button" class="s4t-btn s4t-btn-subtle s4t-sheet-reset-btn" id="s4t-header-reset-btn" title="Reset to default columns" data-tooltip="Reset to default columns">↺ Reset Template</button>',
            '    <button type="button" class="s4t-export-close-btn s4t-close-btn" aria-label="Close" data-tooltip="Close">✕</button>',
            '  </div>',
            '</header>',
            '<div class="s4t-export-tabs-bar" role="tablist">',
            '  <button type="button" class="s4t-export-tab s4t-tab-active" data-tab="sheet" role="tab" aria-selected="true" id="s4t-tab-btn-sheet">',
            '    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>',
            '    Sheet Designer & Preview',
            '  </button>',
            '  <button type="button" class="s4t-export-tab" data-tab="exclusions" role="tab" aria-selected="false" id="s4t-tab-btn-exclusions">',
            '    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
            '    Exclusions & Ordering',
            '  </button>',
            '</div>',
            '<div class="s4t-export-body">',
            '  <div class="s4t-export-loading"><div class="s4t-export-spinner"></div> Loading board cards...</div>',
            '</div>'
        ].join(''));

        if (typeof s4tFeatureHelp === 'function') {
            dialog.find('.s4t-feature-title').append(s4tFeatureHelp("Export Cards",
                "Export board cards to Excel, CSV or Google Sheets.",
                "• Dynamic column builder with 14 card fields\n• Drag-and-drop column reordering\n• List, member and label exclusions\n• Custom row sort ordering\n• Line breaks between groups\n• Live 20-card preview\n• Direct Google Sheets clipboard paste",
                "Exports cards matching current exclusions. Formula characters (=, +, -, @) are automatically neutralized.",
                "Customize headers and source fields, set exclusions, preview rows, then copy for Google Sheets or download Excel/CSV."
            ));
        } else if (typeof globalThis !== 'undefined' && typeof globalThis.s4tFeatureHelp === 'function') {
            dialog.find('.s4t-feature-title').append(globalThis.s4tFeatureHelp("Export Cards",
                "Export board cards to Excel, CSV or Google Sheets.",
                "• Dynamic column builder with 14 card fields\n• Drag-and-drop column reordering\n• List, member and label exclusions\n• Custom row sort ordering\n• Line breaks between groups\n• Live 20-card preview\n• Direct Google Sheets clipboard paste",
                "Exports cards matching current exclusions. Formula characters (=, +, -, @) are automatically neutralized.",
                "Customize headers and source fields, set exclusions, preview rows, then copy for Google Sheets or download Excel/CSV."
            ));
        }

        dialog.find('.s4t-export-close-btn').on('click', close);

        dialog.find('#s4t-header-reset-btn').on('click', function () {
            state.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            state.insertSeparatorRow = false;
            dialog.find('#s4t-toggle-separator').prop('checked', false);
            state.previewDirty = true;
            saveConfig();
            renderSheetTableContent();
            updateColumnsCountBadge();
            showToast('Reset to default column layout.');
        });

        function updateColumnsCountBadge() {
            var count = state.columns ? state.columns.length : 0;
            dialog.find('#s4t-sheet-col-count').text(count + (count === 1 ? ' column' : ' columns'));
        }

        function setupLookup(data) {
            state.boardData = data;
            var listsById = new Map();
            var membersById = new Map();
            var labelsById = new Map();
            (data.lists || []).forEach(function (l) { listsById.set(l.id, l); });
            (data.members || []).forEach(function (m) { membersById.set(m.id, m); });
            (data.labels || []).forEach(function (lb) { labelsById.set(lb.id || lb.name, lb); });
            state.lookup = { listsById: listsById, membersById: membersById, labelsById: labelsById };
            updateFilteredCards();
            renderLayout();
        }

        function updateFilteredCards() {
            if (!state.boardData) return;
            state.filteredCards = s4tFilterAndSortCards(state.boardData.cards || [], state.boardData, {
                excludedListIds: Array.from(state.excludedListIds),
                excludeNotSure: state.excludeNotSure,
                excludedMemberIds: Array.from(state.excludedMemberIds),
                excludedLabelIds: Array.from(state.excludedLabelIds),
                sortBy: state.sortBy
            });
            dialog.find('#s4t-export-count-badge').text(state.filteredCards.length + ' cards matching');
        }

        function saveConfig() {
            try {
                var cfg = {
                    columns: state.columns,
                    insertSeparatorRow: state.insertSeparatorRow
                };
                localStorage.setItem(storageKey, JSON.stringify(cfg));
                localStorage.setItem('s4t_card_export_cfg_default', JSON.stringify(cfg));
            } catch (_) {}
        }

        function renderLayout() {
            var body = dialog.find('.s4t-export-body').empty();

            // Tab Navigation Handling
            dialog.find('.s4t-export-tab').off('click').on('click', function () {
                var tab = $(this).attr('data-tab');
                state.currentTab = tab;
                dialog.find('.s4t-export-tab').removeClass('s4t-tab-active').attr('aria-selected', 'false');
                $(this).addClass('s4t-tab-active').attr('aria-selected', 'true');
                if (tab === 'sheet') {
                    dialog.find('#s4t-tab-sheet-view').prop('hidden', false);
                    dialog.find('#s4t-tab-exclusions-view').prop('hidden', true);
                    dialog.find('#s4t-header-reset-btn').show();
                } else {
                    dialog.find('#s4t-tab-sheet-view').prop('hidden', true);
                    dialog.find('#s4t-tab-exclusions-view').prop('hidden', false);
                    dialog.find('#s4t-header-reset-btn').hide();
                }
            });

            // Container for Tab 1 (Sheet View)
            var sheetView = $('<div id="s4t-tab-sheet-view" class="s4t-tab-view" role="tabpanel" aria-labelledby="s4t-tab-btn-sheet">');
            body.append(sheetView);

            // Container for Tab 2 (Exclusions View)
            var exclusionsView = $('<div id="s4t-tab-exclusions-view" class="s4t-tab-view" role="tabpanel" aria-labelledby="s4t-tab-btn-exclusions" hidden>');
            body.append(exclusionsView);

            // Render Tab 1 (Sheet Designer & Preview Table)
            renderSheetTab(sheetView);

            // Render Tab 2 (Attention-like Exclusions)
            renderExclusionsTab(exclusionsView);

            // Render Footer with Actions
            renderFooter();
        }

        function renderSheetTab(container) {
            container.empty();

            var topBar = $('<div class="s4t-sheet-top-bar">');
            topBar.append([
                '<div class="s4t-sheet-hint">',
                '  <strong>Spreadsheet Columns:</strong> Rename headers, map data sources & formats, or drag cards to reorder.',
                '</div>',
                '<div class="s4t-sheet-top-actions">',
                '  <span class="s4t-sheet-col-count-badge" id="s4t-sheet-col-count"></span>',
                '</div>'
            ].join(''));
            container.append(topBar);

            // Sheet Grid Wrapper with horizontal & vertical scroll
            var gridWrapper = $('<div class="s4t-sheet-grid-wrapper">');
            var table = $('<table class="s4t-sheet-grid-table" id="s4t-sheet-table">');
            gridWrapper.append(table);
            container.append(gridWrapper);

            // Guide Banner below table grid
            var guideBanner = $('<details class="s4t-sheet-guide-banner">');
            guideBanner.html([
                '<summary class="s4t-sheet-guide-header">',
                '  <div class="s4t-sheet-guide-title-wrap">',
                '    <span class="s4t-sheet-guide-icon">💡</span>',
                '    <span class="s4t-sheet-guide-title">Spreadsheet Designer Tips & Quick Guide</span>',
                '  </div>',
                '  <span class="s4t-sheet-guide-toggle-hint">Click to expand tips ▾</span>',
                '</summary>',
                '<div class="s4t-sheet-guide-grid">',
                '  <div class="s4t-sheet-guide-item"><strong>↔ Drag & Drop Columns:</strong> Grab the <span class="s4t-sheet-guide-badge">⋮⋮</span> handle on any column header to rearrange column sequence.</div>',
                '  <div class="s4t-sheet-guide-item"><strong>✏️ Rename & Map:</strong> Edit header text directly and use <em>Source: ⓘ</em> to map to 14 fields (lists, points, devs, dates, checklists, etc.).</div>',
                '  <div class="s4t-sheet-guide-item"><strong>🎯 Selectable Formats:</strong> Set column format to <em>Board Devs Dropdown</em>, <em>QA Checkbox</em>, or <em>Custom Dropdown</em> for external team roles.</div>',
                '  <div class="s4t-sheet-guide-item"><strong>🟢 Classic Green First Row:</strong> Headers are formatted with standard spreadsheet green, bold text, and Times New Roman font.</div>',
                '  <div class="s4t-sheet-guide-item"><strong>📂 Group Separators:</strong> Enable <em>"Line break between groups"</em> to automatically insert divider rows between developers or lists.</div>',
                '  <div class="s4t-sheet-guide-item"><strong>⚡ Instant Export:</strong> Click <em>Copy for Google Sheets</em> for immediate TSV paste, or download formatted <em>Excel (.xls)</em> or <em>CSV</em>.</div>',
                '</div>'
            ].join(''));
            container.append(guideBanner);

            renderSheetTableContent();
            updateColumnsCountBadge();
        }

        function renderSheetTableContent() {
            var table = dialog.find('#s4t-sheet-table').empty();

            // 1. THEAD - Column Headers Side by Side
            var thead = $('<thead>');
            var trHead = $('<tr>');

            state.columns.forEach(function (col, idx) {
                var th = $('<th class="s4t-sheet-th" draggable="true" data-col-idx="' + idx + '">');

                var card = $('<div class="s4t-sheet-th-card">');

                // Card Top Row: Drag handle, Col Badge, Delete button
                var cardTop = $('<div class="s4t-sheet-card-top">');
                var dragHandle = $('<span class="s4t-sheet-drag-handle" title="Drag to reorder column">⋮⋮</span>');
                var colBadge = $('<span class="s4t-sheet-col-badge">').text('Col ' + (idx + 1));
                var delBtn = $('<button type="button" class="s4t-sheet-col-del" title="Remove column" aria-label="Remove column">✕</button>')
                    .prop('disabled', state.columns.length <= 1)
                    .on('click', function () {
                        if (state.columns.length > 1) {
                            state.columns.splice(idx, 1);
                            state.previewDirty = true;
                            saveConfig();
                            renderSheetTableContent();
                            updateColumnsCountBadge();
                        }
                    });
                cardTop.append(dragHandle, colBadge, delBtn);

                // Card Input Row
                var cardInputRow = $('<div class="s4t-sheet-card-input-row">');
                var headerInput = $('<input type="text" class="s4t-sheet-header-input" placeholder="Column Header" aria-label="Header Name">')
                    .val(col.header || '');

                headerInput.on('input', function () {
                    col.header = $(this).val();
                    state.previewDirty = true;
                    saveConfig();
                    renderDirtyIndicator();
                });
                cardInputRow.append(headerInput);

                // Source Mapping: Header row with label + info icon next to it, and small centered select box
                var sourceRow = $('<div class="s4t-sheet-source-row">');
                var sourceHeader = $('<div class="s4t-sheet-source-header">');
                var sourceLabel = $('<span class="s4t-sheet-source-label">Source:</span>');
                var currentField = FIELD_MAP[col.source] || FIELD_DEFINITIONS[0];
                var infoIcon = $('<span class="s4t-field-info-icon" tabindex="0" role="button" aria-label="Field details" data-tooltip="' + s4tEscapeHtml(currentField.desc) + '">ⓘ</span>');
                sourceHeader.append(sourceLabel, infoIcon);

                var selectWrap = $('<div class="s4t-sheet-source-select-wrap">');
                var sourceSelect = $('<select class="s4t-sheet-source-select" aria-label="Field Mapping">');

                FIELD_DEFINITIONS.forEach(function (f) {
                    var opt = $('<option>').val(f.key).text(f.label);
                    if (f.key === col.source) opt.prop('selected', true);
                    sourceSelect.append(opt);
                });

                sourceSelect.on('change', function () {
                    col.source = $(this).val();
                    var updated = FIELD_MAP[col.source] || FIELD_DEFINITIONS[0];
                    infoIcon.attr('data-tooltip', updated.desc);
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });
                selectWrap.append(sourceSelect);
                sourceRow.append(sourceHeader, selectWrap);

                // Format / Cell Type Row
                var typeRow = $('<div class="s4t-sheet-type-row">');
                var typeHeader = $('<div class="s4t-sheet-type-header"><span class="s4t-sheet-type-label">Format:</span></div>');
                var typeSelect = $('<select class="s4t-sheet-type-select" aria-label="Cell Format">');
                [
                    { val: 'text', text: 'Standard Text' },
                    { val: 'dev_select', text: 'Dropdown (Board Devs)' },
                    { val: 'checkbox', text: 'Checkbox (QA / Review)' },
                    { val: 'custom_select', text: 'Custom Dropdown...' }
                ].forEach(function (t) {
                    var opt = $('<option>').val(t.val).text(t.text);
                    if ((col.cellType || 'text') === t.val) opt.prop('selected', true);
                    typeSelect.append(opt);
                });

                var customInput = $('<input type="text" class="s4t-sheet-custom-options-input" placeholder="e.g. PO, CS, QA, Lead" title="Comma-separated dropdown options" aria-label="Custom dropdown values">')
                    .val(col.customOptions || '')
                    .prop('hidden', (col.cellType || 'text') !== 'custom_select');

                customInput.on('input', function () {
                    col.customOptions = $(this).val();
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });

                typeSelect.on('change', function () {
                    col.cellType = $(this).val();
                    customInput.prop('hidden', col.cellType !== 'custom_select');
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });
                typeRow.append(typeHeader, typeSelect, customInput);

                card.append(cardTop, cardInputRow, sourceRow, typeRow);
                th.append(card);
                trHead.append(th);

                // HTML5 Drag and drop column shifting
                bindColumnDragEvents(th, idx);
            });

            // Last TH: "+ Add Column" horizontally aligned
            var addTh = $('<th class="s4t-sheet-th-add">');
            var addBtn = $('<button type="button" class="s4t-sheet-add-btn">' +
                '<span class="s4t-sheet-add-icon">+</span>' +
                '<span class="s4t-sheet-add-label">Add Column</span>' +
                '</button>');
            addBtn.on('click', function () {
                var newId = 'col_' + Date.now();
                state.columns.push({ id: newId, header: 'New Column', source: 'title', cellType: 'text' });
                state.previewDirty = true;
                saveConfig();
                renderSheetTableContent();
                updateColumnsCountBadge();
            });
            addTh.append(addBtn);
            trHead.append(addTh);

            thead.append(trHead);
            table.append(thead);

            // 2. TBODY - Preview Rows or Initial Placeholder
            var tbody = $('<tbody>');
            table.append(tbody);
            renderSheetTableBody();
        }

        function renderDirtyIndicator() {
            var banner = dialog.find('.s4t-sheet-dirty-row');
            if (state.previewVisible && state.previewDirty && !banner.length) {
                renderSheetTableBody();
            }
        }

        function renderSheetTableBody() {
            var tbody = dialog.find('#s4t-sheet-table tbody').empty();
            var totalColSpan = state.columns.length + 1;
            dialog.find('.s4t-sheet-preview-blur-overlay').remove();

            if (!state.previewVisible) {
                // Render 5 virtual skeleton spreadsheet rows so grid and columns are clear
                for (var r = 0; r < 5; r++) {
                    var virtTr = $('<tr class="s4t-sheet-virtual-row">');
                    var widths = ['72%', '88%', '50%', '76%', '60%', '94%', '42%'];
                    state.columns.forEach(function (col, cIdx) {
                        var virtTd = $('<td class="s4t-sheet-cell s4t-sheet-virtual-cell">');
                        var skeletonLine = $('<div class="s4t-sheet-skeleton-line">');
                        skeletonLine.css('width', widths[(r * 2 + cIdx) % widths.length]);
                        virtTd.append(skeletonLine);
                        virtTr.append(virtTd);
                    });
                    virtTr.append($('<td class="s4t-sheet-cell-empty">'));
                    tbody.append(virtTr);
                }

                // Frosted glass overlay with crisp CTA button in center
                var blurOverlay = $('<div class="s4t-sheet-preview-blur-overlay">');
                var ctaCard = $('<div class="s4t-sheet-preview-cta-card">');
                ctaCard.html([
                    '<div class="s4t-sheet-preview-cta-icon">📊</div>',
                    '<div class="s4t-sheet-preview-cta-title">Spreadsheet Preview</div>',
                    '<p class="s4t-sheet-preview-cta-text">Click below to view a 20-card preview using your customized columns and exclusions.</p>',
                    '<button type="button" class="s4t-btn s4t-btn-primary s4t-btn-generate-preview">👁️ Generate 20-Card Preview</button>'
                ].join(''));

                ctaCard.find('.s4t-btn-generate-preview').on('click', function () {
                    state.previewVisible = true;
                    state.previewDirty = false;
                    renderSheetTableBody();
                });

                blurOverlay.append(ctaCard);
                dialog.find('.s4t-sheet-grid-wrapper').append(blurOverlay);
                return;
            }

            // Dirty banner if settings changed
            if (state.previewDirty) {
                var dirtyTr = $('<tr class="s4t-sheet-dirty-row">');
                var dirtyTd = $('<td colspan="' + totalColSpan + '">');
                dirtyTd.html([
                    '<div class="s4t-dirty-banner">',
                    '  <span>⚡ Column or exclusion settings changed.</span>',
                    '  <button type="button" class="s4t-btn s4t-btn-warning s4t-dirty-refresh-btn">🔄 Update Preview</button>',
                    '</div>'
                ].join(''));

                dirtyTd.find('.s4t-dirty-refresh-btn').on('click', function () {
                    state.previewDirty = false;
                    renderSheetTableBody();
                });

                dirtyTr.append(dirtyTd);
                tbody.append(dirtyTr);
            }

            var sampleCards = state.filteredCards.slice(0, 20);
            if (!sampleCards.length) {
                var emptyTr = $('<tr>');
                var emptyTd = $('<td colspan="' + totalColSpan + '" class="s4t-sheet-empty-td">No cards match the current exclusions. Adjust settings in Exclusions tab.</td>');
                emptyTr.append(emptyTd);
                tbody.append(emptyTr);
                return;
            }

            var prevGroupKey = null;
            var groupIndex = 0;
            sampleCards.forEach(function (card, rIdx) {
                var grpKey = getCardGroupKey(card, state.sortBy, state.lookup);
                if (prevGroupKey !== null && grpKey !== prevGroupKey) {
                    groupIndex++;
                    if (state.insertSeparatorRow) {
                        var sepTr = $('<tr class="s4t-sheet-separator-row">');
                        sepTr.append($('<td colspan="' + totalColSpan + '" class="s4t-sheet-separator-cell">'));
                        tbody.append(sepTr);
                    }
                }
                prevGroupKey = grpKey;

                var tr = $('<tr class="s4t-sheet-row">');

                state.columns.forEach(function (col) {
                    var val = s4tExtractFieldValue(card, col.source, state.lookup);
                    var td = $('<td class="s4t-sheet-cell">');
                    var cellType = col.cellType || 'text';

                    if (cellType === 'checkbox') {
                        var chkWid = $('<label class="s4t-sheet-cell-checkbox-wrap">');
                        var isChecked = val === 'Done' || val === '3/5' || val === 'true';
                        var inp = $('<input type="checkbox" class="s4t-sheet-cell-checkbox">').prop('checked', isChecked);
                        var chkTxt = $('<span class="s4t-sheet-cell-checkbox-label">').text(val ? val : (isChecked ? 'Done' : 'Pending'));
                        inp.on('change', function () {
                            chkTxt.text(this.checked ? 'Done' : 'Pending');
                        });
                        chkWid.append(inp, chkTxt);
                        td.append(chkWid);
                    } else if (cellType === 'dev_select') {
                        var devSel = $('<select class="s4t-sheet-cell-select" aria-label="Assignee">');
                        devSel.append($('<option value="">').text('-- Select Dev --'));
                        (state.boardData.members || []).forEach(function (m) {
                            var mName = m.fullName || m.username || '';
                            var opt = $('<option>').val(mName).text(mName);
                            if (val && val.toLowerCase().includes(mName.toLowerCase())) opt.prop('selected', true);
                            devSel.append(opt);
                        });
                        td.append(devSel);
                    } else if (cellType === 'custom_select') {
                        var custSel = $('<select class="s4t-sheet-cell-select" aria-label="Role / Value">');
                        var rawOpts = col.customOptions || 'Product Owner, CS Member, QA, Tech Lead';
                        var optList = rawOpts.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
                        if (!optList.length) optList = ['Product Owner', 'CS Member', 'QA', 'Tech Lead'];
                        optList.forEach(function (optVal) {
                            var opt = $('<option>').val(optVal).text(optVal);
                            if (val && val.toLowerCase() === optVal.toLowerCase()) opt.prop('selected', true);
                            custSel.append(opt);
                        });
                        td.append(custSel);
                    } else {
                        td.text(val);
                    }
                    if (val) td.attr('title', val);
                    tr.append(td);
                });
                // Empty cell under "+ Add Column"
                tr.append($('<td class="s4t-sheet-cell-empty">'));
                tbody.append(tr);
            });

            // Note footer row inside table
            var noteTr = $('<tr class="s4t-sheet-note-row">');
            var noteText = 'Showing preview of first ' + sampleCards.length + ' cards (' + state.filteredCards.length + ' total cards will be exported).' +
                (state.insertSeparatorRow ? ' • Group line breaks enabled.' : '');
            var noteTd = $('<td colspan="' + totalColSpan + '">').text(noteText);
            noteTr.append(noteTd);
            tbody.append(noteTr);
        }

        var draggedIdx = null;

        function bindColumnDragEvents(th, idx) {
            th.on('dragstart', function (e) {
                draggedIdx = idx;
                $(this).addClass('s4t-col-dragging');
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.setData('text/plain', String(idx));
                    e.originalEvent.dataTransfer.effectAllowed = 'move';
                }
            });

            th.on('dragend', function () {
                $(this).removeClass('s4t-col-dragging');
                dialog.find('.s4t-sheet-th').removeClass('s4t-col-dragover');
            });

            th.on('dragover', function (e) {
                e.preventDefault();
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.dropEffect = 'move';
                }
                $(this).addClass('s4t-col-dragover');
            });

            th.on('dragleave', function () {
                $(this).removeClass('s4t-col-dragover');
            });

            th.on('drop', function (e) {
                e.preventDefault();
                $(this).removeClass('s4t-col-dragover');
                var fromIdx = draggedIdx;
                var toIdx = idx;
                if (fromIdx !== null && fromIdx !== toIdx && fromIdx >= 0 && toIdx >= 0) {
                    var movedCol = state.columns.splice(fromIdx, 1)[0];
                    state.columns.splice(toIdx, 0, movedCol);
                    state.previewDirty = true;
                    saveConfig();
                    renderSheetTableContent();
                }
                draggedIdx = null;
            });
        }

        function renderExclusionsTab(container) {
            container.empty();

            var header = $('<div class="s4t-export-att-header">');
            header.append([
                '<div class="s4t-export-att-heading">',
                '  <h3>Exclusions & Sort Ordering</h3>',
                '  <p class="s4t-export-att-sub">Check items to exclude them from the exported spreadsheet.</p>',
                '</div>',
                '<div class="s4t-export-att-sort-box">',
                '  <label class="s4t-sheet-topbar-toggle s4t-export-separator-toggle" title="Insert an empty line break row between groups (e.g. per developer or list)" data-tooltip="Insert an empty line break row between groups (e.g. per developer or list)">',
                '    <input type="checkbox" id="s4t-toggle-separator"' + (state.insertSeparatorRow ? ' checked' : '') + '>',
                '    <span>Line break between groups</span>',
                '  </label>',
                '  <label for="s4t-sort-select"><strong>Sort Rows By:</strong></label>',
                '  <select id="s4t-sort-select" class="s4t-export-select">',
                '    <option value="list"' + (state.sortBy === 'list' ? ' selected' : '') + '>Board List Order</option>',
                '    <option value="dev"' + (state.sortBy === 'dev' ? ' selected' : '') + '>Developer / Assignee Name</option>',
                '    <option value="title"' + (state.sortBy === 'title' ? ' selected' : '') + '>Card Title (A-Z)</option>',
                '    <option value="points_desc"' + (state.sortBy === 'points_desc' ? ' selected' : '') + '>Story Points (High to Low)</option>',
                '    <option value="points_asc"' + (state.sortBy === 'points_asc' ? ' selected' : '') + '>Story Points (Low to High)</option>',
                '    <option value="due"' + (state.sortBy === 'due' ? ' selected' : '') + '>Due Date</option>',
                '  </select>',
                '</div>'
            ].join(''));
            container.append(header);

            header.find('#s4t-toggle-separator').on('change', function () {
                state.insertSeparatorRow = this.checked;
                state.previewDirty = true;
                saveConfig();
                if (state.previewVisible) renderSheetTableBody();
            });

            // Columns Grid modeled strictly after Attention panel (.s4t-export-att-columns)
            var columnsGrid = $('<div class="s4t-export-att-columns">');

            // 1. Lists Column
            var listsCol = $('<div class="s4t-export-att-col">');
            var listsHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<h4>').text('Exclude lists'),
                $('<div class="s4t-export-att-list-groups">')
            );
            listsCol.append(listsHead);
            listsCol.append($('<p class="s4t-export-att-col-hint">').text('Cards in checked lists are excluded from export.'));

            function groupLists(group) {
                var all = state.boardData.lists || [];
                if (group === 'all') return all;
                var pattern = group === 'todo' ? /\bto[\s-]*do\b/i : /\bnot[\s-]+sure\b/i;
                return all.filter(function (l) { return pattern.test(l.name); });
            }

            function updateListGroupToggles() {
                listsHead.find('[data-list-group]').each(function () {
                    var groupKey = this.getAttribute('data-list-group');
                    var lists = groupLists(groupKey);
                    var checked = lists.filter(function (l) { return state.excludedListIds.has(l.id); }).length;
                    this.checked = lists.length > 0 && checked === lists.length;
                    this.indeterminate = checked > 0 && checked < lists.length;
                    this.disabled = lists.length === 0;
                });
            }

            var listsScroll = $('<div class="s4t-export-att-lists">');
            (state.boardData.lists || []).forEach(function (l) {
                var isExcluded = state.excludedListIds.has(l.id);
                var opt = $('<label class="s4t-export-att-option">');
                var chk = $('<input type="checkbox" data-exclude-list="' + s4tEscapeHtml(l.id) + '"' + (isExcluded ? ' checked' : '') + '>');
                chk.on('change', function () {
                    if (this.checked) state.excludedListIds.add(l.id);
                    else state.excludedListIds.delete(l.id);
                    updateListGroupToggles();
                    onExclusionsChanged();
                });
                opt.append(chk, $('<span>').text(l.name));
                listsScroll.append(opt);
            });
            listsCol.append(listsScroll);

            [
                { key: 'all', name: 'All lists' },
                { key: 'todo', name: 'All Todo lists' },
                { key: 'not-sure', name: 'All Not Sure lists' }
            ].forEach(function (group) {
                var count = groupLists(group.key).length;
                var description = group.name + ' (' + count + ')';
                var input = $('<input type="checkbox">').attr({ 'data-list-group': group.key, 'aria-label': description });
                input.on('change', function () {
                    var ids = groupLists(group.key).map(function (l) { return l.id; });
                    var isChecked = this.checked;
                    ids.forEach(function (id) {
                        if (isChecked) state.excludedListIds.add(id);
                        else state.excludedListIds.delete(id);
                    });
                    if (group.key === 'not-sure') {
                        state.excludeNotSure = isChecked;
                    }
                    listsScroll.find('[data-exclude-list]').each(function () {
                        this.checked = state.excludedListIds.has(this.getAttribute('data-exclude-list'));
                    });
                    updateListGroupToggles();
                    onExclusionsChanged();
                });
                var toggleLabel = $('<label class="s4t-export-att-group-toggle">')
                    .attr('data-tooltip', description)
                    .append(input);
                listsHead.find('.s4t-export-att-list-groups').append(toggleLabel);
            });
            updateListGroupToggles();
            columnsGrid.append(listsCol);

            // 2. Members Column
            var membersCol = $('<div class="s4t-export-att-col">');
            var membersHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<h4>').text('Members'),
                $('<div class="s4t-export-att-list-groups s4t-export-att-member-group">')
            );
            membersCol.append(membersHead);
            membersCol.append($('<p class="s4t-export-att-col-hint">').text('Cards assigned to checked members are excluded.'));

            var allMemberIds = ['__unassigned__'].concat((state.boardData.members || []).map(function (m) { return m.id; }));

            function updateMemberGroupToggle() {
                var checked = allMemberIds.filter(function (id) { return state.excludedMemberIds.has(id); }).length;
                var input = membersHead.find('[data-member-group="all"]')[0];
                if (input) {
                    input.checked = allMemberIds.length > 0 && checked === allMemberIds.length;
                    input.indeterminate = checked > 0 && checked < allMemberIds.length;
                    input.disabled = allMemberIds.length === 0;
                }
            }

            var allMembersInput = $('<input type="checkbox" data-member-group="all" aria-label="All members">');
            allMembersInput.on('change', function () {
                var isChecked = this.checked;
                allMemberIds.forEach(function (id) {
                    if (isChecked) state.excludedMemberIds.add(id);
                    else state.excludedMemberIds.delete(id);
                });
                membersScroll.find('[data-exclude-member]').each(function () {
                    this.checked = state.excludedMemberIds.has(this.getAttribute('data-exclude-member'));
                });
                updateMemberGroupToggle();
                onExclusionsChanged();
            });

            membersHead.find('.s4t-export-att-member-group').append(
                $('<label class="s4t-export-att-group-toggle" data-tooltip="All members (' + allMemberIds.length + ')">').append(allMembersInput)
            );

            var membersScroll = $('<div class="s4t-export-att-members">');
            var unassignedOpt = $('<label class="s4t-export-att-option">');
            var unassignedChk = $('<input type="checkbox" data-exclude-member="__unassigned__"' + (state.excludedMemberIds.has('__unassigned__') ? ' checked' : '') + '>');
            unassignedChk.on('change', function () {
                if (this.checked) state.excludedMemberIds.add('__unassigned__');
                else state.excludedMemberIds.delete('__unassigned__');
                updateMemberGroupToggle();
                onExclusionsChanged();
            });
            unassignedOpt.append(unassignedChk, $('<span><em>(Unassigned cards)</em></span>'));
            membersScroll.append(unassignedOpt);

            (state.boardData.members || []).forEach(function (m) {
                var isExcluded = state.excludedMemberIds.has(m.id);
                var opt2 = $('<label class="s4t-export-att-option">');
                var chk2 = $('<input type="checkbox" data-exclude-member="' + s4tEscapeHtml(m.id) + '"' + (isExcluded ? ' checked' : '') + '>');
                chk2.on('change', function () {
                    if (this.checked) state.excludedMemberIds.add(m.id);
                    else state.excludedMemberIds.delete(m.id);
                    updateMemberGroupToggle();
                    onExclusionsChanged();
                });
                opt2.append(chk2, $('<span>').text(m.fullName || m.username));
                membersScroll.append(opt2);
            });
            membersCol.append(membersScroll);
            updateMemberGroupToggle();
            columnsGrid.append(membersCol);

            // 3. Labels Column
            var labelsCol = $('<div class="s4t-export-att-col">');
            var labelsHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<h4>').text('Labels'),
                $('<div class="s4t-export-att-list-groups s4t-export-att-label-group">')
            );
            labelsCol.append(labelsHead);
            labelsCol.append($('<p class="s4t-export-att-col-hint">').text('Cards with checked labels are excluded.'));

            var allLabelKeys = ['__unlabeled__'].concat((state.boardData.labels || []).map(function (lb) { return lb.id || lb.name; }));

            function updateLabelGroupToggle() {
                var checked = allLabelKeys.filter(function (k) { return state.excludedLabelIds.has(k); }).length;
                var input = labelsHead.find('[data-label-group="all"]')[0];
                if (input) {
                    input.checked = allLabelKeys.length > 0 && checked === allLabelKeys.length;
                    input.indeterminate = checked > 0 && checked < allLabelKeys.length;
                    input.disabled = allLabelKeys.length === 0;
                }
            }

            var allLabelsInput = $('<input type="checkbox" data-label-group="all" aria-label="All labels">');
            allLabelsInput.on('change', function () {
                var isChecked = this.checked;
                allLabelKeys.forEach(function (k) {
                    if (isChecked) state.excludedLabelIds.add(k);
                    else state.excludedLabelIds.delete(k);
                });
                labelsScroll.find('[data-exclude-label]').each(function () {
                    this.checked = state.excludedLabelIds.has(this.getAttribute('data-exclude-label'));
                });
                updateLabelGroupToggle();
                onExclusionsChanged();
            });

            labelsHead.find('.s4t-export-att-label-group').append(
                $('<label class="s4t-export-att-group-toggle" data-tooltip="All labels (' + allLabelKeys.length + ')">').append(allLabelsInput)
            );

            var labelsScroll = $('<div class="s4t-export-att-labels">');
            var unlabeledOpt = $('<label class="s4t-export-att-option">');
            var unlabeledChk = $('<input type="checkbox" data-exclude-label="__unlabeled__"' + (state.excludedLabelIds.has('__unlabeled__') ? ' checked' : '') + '>');
            unlabeledChk.on('change', function () {
                if (this.checked) state.excludedLabelIds.add('__unlabeled__');
                else state.excludedLabelIds.delete('__unlabeled__');
                updateLabelGroupToggle();
                onExclusionsChanged();
            });
            unlabeledOpt.append(unlabeledChk, $('<span><em>(Cards with no label)</em></span>'));
            labelsScroll.append(unlabeledOpt);

            (state.boardData.labels || []).forEach(function (lb) {
                var key = lb.id || lb.name;
                var isExcluded = state.excludedLabelIds.has(key);
                var opt3 = $('<label class="s4t-export-att-option">');
                var chk3 = $('<input type="checkbox" data-exclude-label="' + s4tEscapeHtml(key) + '"' + (isExcluded ? ' checked' : '') + '>');
                chk3.on('change', function () {
                    if (this.checked) state.excludedLabelIds.add(key);
                    else state.excludedLabelIds.delete(key);
                    updateLabelGroupToggle();
                    onExclusionsChanged();
                });
                var dot = $('<span class="s4t-export-att-label-dot">').css('background-color', lb.color || '#626f86');
                opt3.append(chk3, dot, $('<span>').text(lb.name || lb.color || 'Label'));
                labelsScroll.append(opt3);
            });
            labelsCol.append(labelsScroll);
            updateLabelGroupToggle();
            columnsGrid.append(labelsCol);

            container.append(columnsGrid);

            // Bind sort select
            header.find('#s4t-sort-select').on('change', function () {
                state.sortBy = $(this).val();
                onExclusionsChanged();
            });
        }

        function onExclusionsChanged() {
            updateFilteredCards();
            state.previewDirty = true;
            renderDirtyIndicator();
        }

        function renderFooter() {
            dialog.find('.s4t-export-footer').remove();
            var footer = $('<footer class="s4t-export-footer">');

            footer.append([
                '<div class="s4t-export-footer-status" id="s4t-export-toast" hidden></div>',
                '<div class="s4t-export-footer-buttons">',
                '  <button type="button" class="s4t-btn s4t-btn-secondary" id="s4t-btn-copy-tsv" title="Copy tab-separated table to clipboard for instant Google Sheets paste" data-tooltip="Copy tab-separated table to clipboard for instant Google Sheets paste">📋 Copy for Google Sheets</button>',
                '  <div class="s4t-split-download-group">',
                '    <button type="button" class="s4t-btn s4t-btn-primary" id="s4t-btn-main-download">📊 Download Excel (.xls)</button>',
                '    <button type="button" class="s4t-btn s4t-btn-primary s4t-split-arrow" id="s4t-btn-format-toggle" title="Select format (Excel / CSV)" data-tooltip="Select format (Excel / CSV)" aria-label="Select format" aria-haspopup="true" aria-expanded="false">▾</button>',
                '    <div class="s4t-split-menu" id="s4t-format-menu" role="menu" hidden>',
                '      <button type="button" class="s4t-split-item" data-fmt="excel" role="menuitem">📊 Excel Spreadsheet (.xls)</button>',
                '      <button type="button" class="s4t-split-item" data-fmt="csv" role="menuitem">📄 CSV File (.csv)</button>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join(''));

            dialog.append(footer);
            bindFooterEvents();
        }

        function bindFooterEvents() {
            function pulseButton($btn) {
                $btn.addClass('s4t-metric-copied');
                setTimeout(function () {
                    $btn.removeClass('s4t-metric-copied');
                }, 1500);
            }

            var exportOpts = function () {
                return {
                    insertSeparatorRow: !!state.insertSeparatorRow,
                    sortBy: state.sortBy
                };
            };

            // Copy for Google Sheets (instant TSV copy of all cards)
            dialog.find('#s4t-btn-copy-tsv').on('click', function () {
                updateFilteredCards();
                if (!state.filteredCards.length) {
                    showToast('No cards to export with current exclusions.');
                    return;
                }
                var $btn = $(this);
                pulseButton($btn);
                var tsv = s4tBuildExportTsv(state.columns, state.filteredCards, state.lookup, exportOpts());
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(tsv).then(function () {
                        showToast('✓ Copied ' + state.filteredCards.length + ' cards to clipboard for Google Sheets! Press Ctrl+V in your sheet.');
                    }).catch(function () {
                        fallbackCopy(tsv);
                    });
                } else {
                    fallbackCopy(tsv);
                }
            });

            // Toggle format menu
            dialog.find('#s4t-btn-format-toggle').on('click', function (e) {
                e.stopPropagation();
                var menu = dialog.find('#s4t-format-menu');
                var isHidden = !menu.prop('hidden');
                menu.prop('hidden', isHidden);
                $(this).attr('aria-expanded', String(!isHidden));
            });

            $(document).off('click.s4tFormatMenuClose').on('click.s4tFormatMenuClose', function () {
                dialog.find('#s4t-format-menu').prop('hidden', true);
                dialog.find('#s4t-btn-format-toggle').attr('aria-expanded', 'false');
            });

            // Format selection
            dialog.find('.s4t-split-item').on('click', function () {
                var fmt = $(this).attr('data-fmt');
                state.selectedFormat = fmt;
                if (fmt === 'csv') {
                    dialog.find('#s4t-btn-main-download').text('📄 Download CSV (.csv)');
                } else {
                    dialog.find('#s4t-btn-main-download').text('📊 Download Excel (.xls)');
                }
                dialog.find('#s4t-format-menu').prop('hidden', true);
                dialog.find('#s4t-btn-format-toggle').attr('aria-expanded', 'false');
            });

            // Main download button click
            dialog.find('#s4t-btn-main-download').on('click', function () {
                updateFilteredCards();
                if (!state.filteredCards.length) {
                    showToast('No cards to export with current exclusions.');
                    return;
                }
                var $btn = $(this);
                pulseButton($btn);
                var safeBase = (boardName.replace(/[^a-z0-9_-]/gi, '_').toLowerCase() || 'board') + '_cards';
                if (state.selectedFormat === 'csv') {
                    var csv = s4tBuildExportCsv(state.columns, state.filteredCards, state.lookup, exportOpts());
                    triggerDownload(csv, safeBase + '.csv', 'text/csv;charset=utf-8;');
                    showToast('✓ Downloaded ' + state.filteredCards.length + ' cards as CSV (.csv)!');
                } else {
                    var excel = s4tBuildExportExcel(state.columns, state.filteredCards, state.lookup, boardName, exportOpts());
                    triggerDownload(excel, safeBase + '.xls', 'application/ms-excel');
                    showToast('✓ Downloaded ' + state.filteredCards.length + ' cards as Excel (.xls)!');
                }
            });
        }

        function showToast(msg) {
            var toast = dialog.find('#s4t-export-toast');
            toast.text(msg).prop('hidden', false).addClass('s4t-metric-toast-success');
            clearTimeout(showToast.timer);
            showToast.timer = setTimeout(function () {
                toast.removeClass('s4t-metric-toast-success');
                setTimeout(function () {
                    toast.prop('hidden', true);
                }, 200);
            }, 3000);
        }

        function triggerDownload(content, filename, mimeType) {
            var blob = new Blob([content], { type: mimeType });
            var url = (window.URL || window.webkitURL).createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                (window.URL || window.webkitURL).revokeObjectURL(url);
            }, 500);
        }

        function fallbackCopy(text) {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showToast('✓ Copied ' + state.filteredCards.length + ' cards! Press Ctrl+V in your Google Sheet.');
            } catch (_) {
                showToast('Could not copy to clipboard automatically.');
            }
            document.body.removeChild(ta);
        }

        // Fetch Board Data
        if (state.boardData) {
            setupLookup(state.boardData);
        } else if (typeof fetchBoardData === 'function') {
            fetchBoardData(boardShortLink, false, function (err, data) {
                if (err || !data) {
                    dialog.find('.s4t-export-body').html(
                        '<div class="s4t-export-error">Failed to load board data: ' + s4tEscapeHtml(err ? err.message : 'Unknown error') + '</div>'
                    );
                } else {
                    setupLookup(data);
                }
            });
        } else {
            dialog.find('.s4t-export-body').html(
                '<div class="s4t-export-error">Board fetcher is not available in the current environment.</div>'
            );
        }
    }

    return {
        s4tOpenCardExport: s4tOpenCardExport,
        s4tExportCardFields: FIELD_DEFINITIONS,
        s4tExtractFieldValue: s4tExtractFieldValue,
        s4tBuildExportCsv: s4tBuildExportCsv,
        s4tBuildExportExcel: s4tBuildExportExcel,
        s4tBuildExportTsv: s4tBuildExportTsv,
        s4tFilterAndSortCards: s4tFilterAndSortCards
    };
}));
