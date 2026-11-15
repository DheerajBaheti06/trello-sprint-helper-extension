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
        root.s4tParseCustomOptions = api.s4tParseCustomOptions;
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
        { key: 'product_owner', label: 'Product Owner', desc: 'Product Owner extracted from card labels ending with a dot "." (e.g. "Kashvi." -> "Kashvi").' },
        { key: 'labels', label: 'Labels', desc: 'Label names (excluding developer and product member labels).' },
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
        { id: 'c_list', header: 'List Name', source: 'list', cellType: 'text' },
        { id: 'c_title', header: 'Title', source: 'title', cellType: 'text' },
        { id: 'c_labels', header: 'Labels', source: 'labels', cellType: 'text' },
        { id: 'c_status', header: 'Status', source: 'blank', cellType: 'custom_select', customOptions: 'Going Live, Not Going Live' },
        { id: 'c_dev_owner', header: 'Dev Owner', source: 'members', cellType: 'dev_select' },
        { id: 'c_dev_conf', header: 'Dev Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_mgr_conf', header: 'Mgr Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_po_owner', header: 'Product Owner', source: 'product_owner', cellType: 'custom_select', customOptions: '' },
        { id: 'c_po_conf', header: 'Product Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_cs_owner', header: 'CS Owner', source: 'blank', cellType: 'custom_select', customOptions: '' },
        { id: 'c_cs_conf', header: 'CS Confidence', source: 'blank', cellType: 'custom_select', customOptions: 'High, Medium, Low, NA' },
        { id: 'c_risk', header: 'Risk (Comments)', source: 'blank', cellType: 'text' },
        { id: 'c_resolution', header: 'Resolution (Comments)', source: 'blank', cellType: 'text' }
    ];

    function s4tParseCustomOptions(rawOptions, fallback) {
        var raw = (rawOptions == null || String(rawOptions).trim() === '') ? (fallback || '') : rawOptions;
        var list = String(raw)
            .split(',')
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
        var seen = new Set();
        var deduplicated = [];
        list.forEach(function (opt) {
            var lower = opt.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                deduplicated.push(opt);
            }
        });
        return deduplicated;
    }

    function s4tIsCsOwnerCol(col) {
        if (!col) return false;
        return col.id === 'c_cs_owner' || (col.header && col.header.trim().toLowerCase() === 'cs owner');
    }

    function s4tCleanLegacyCsOwner(col) {
        if (!col || !s4tIsCsOwnerCol(col)) return;
        if (!col.userFilled || !col.customOptions || /harshali|tanisha|cs member|qa|tech lead/i.test(col.customOptions)) {
            col.customOptions = '';
        }
    }

    function s4tGetDotLabels(boardData) {
        var seen = new Set();
        var list = [];
        function addLabel(name) {
            var trimmed = String(name || '').trim();
            if (/[.．…]$/.test(trimmed)) {
                if (trimmed.length <= 80 && !/[\r\n]/.test(trimmed)) {
                    var clean = trimmed.replace(/[.．…]+$/, '').trim();
                    if (clean && !seen.has(clean.toLowerCase())) {
                        seen.add(clean.toLowerCase());
                        list.push(clean);
                    }
                }
            }
        }
        if (boardData) {
            if (Array.isArray(boardData.labels)) {
                boardData.labels.forEach(function (lb) { if (lb && lb.name) addLabel(lb.name); });
            }
            if (Array.isArray(boardData.cards)) {
                boardData.cards.forEach(function (c) {
                    if (c && Array.isArray(c.labels)) {
                        c.labels.forEach(function (lb) { if (lb && lb.name) addLabel(lb.name); });
                    }
                });
            }
            if (boardData.labelNames && typeof boardData.labelNames === 'object') {
                Object.values(boardData.labelNames).forEach(function (val) {
                    if (typeof val === 'string') addLabel(val);
                });
            }
        }
        if (typeof document !== 'undefined') {
            try {
                var domLabels = document.querySelectorAll(
                    '[data-testid*="card-label"], [data-testid*="compact-card-label"], [data-testid*="labels-popover"], [data-testid*="label-suggestion"], .card-label, .js-card-label, .edit-labels-list li, .js-select-label, input[data-testid*="label-name"], input.js-label-name, span[class*="label"], div[class*="label"], [data-color]'
                );
                for (var i = 0; i < domLabels.length; i++) {
                    var el = domLabels[i];
                    if (!el) continue;
                    var text = (el.textContent || '').trim();
                    if (text) addLabel(text);
                    var titleAttr = (el.getAttribute('title') || '').trim();
                    if (titleAttr) addLabel(titleAttr);
                    var ariaAttr = (el.getAttribute('aria-label') || '').trim();
                    if (ariaAttr) addLabel(ariaAttr);
                    if (el.tagName === 'INPUT' && el.value) {
                        addLabel(el.value);
                    }
                }
            } catch (_) { }
        }
        return list;
    }

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
            case 'product_owner': {
                var poLabels = Array.isArray(card.labels) && card.labels.length ? card.labels : [];
                if (!poLabels.length && Array.isArray(card.idLabels)) {
                    poLabels = card.idLabels.map(function (id) { return labelsById.get(id); }).filter(Boolean);
                }
                for (var pi = 0; pi < poLabels.length; pi++) {
                    var lName = (poLabels[pi].name || '').trim();
                    if (lName.endsWith('.')) {
                        return lName.replace(/\.+$/, '').trim();
                    }
                }
                return '';
            }
            case 'labels': {
                var labels = Array.isArray(card.labels) && card.labels.length ? card.labels : [];
                if (!labels.length && Array.isArray(card.idLabels)) {
                    labels = card.idLabels.map(function (id) { return labelsById.get(id); }).filter(Boolean);
                }
                var memberNamesSet = new Set();
                membersById.forEach(function (m) {
                    if (m && m.fullName) memberNamesSet.add(m.fullName.trim().toLowerCase());
                    if (m && m.username) memberNamesSet.add(m.username.trim().toLowerCase());
                });
                return labels.map(function (lb) {
                    return (lb.name || lb.color || '').trim();
                }).filter(function (name) {
                    if (!name) return false;
                    if (name.endsWith('.')) return false;
                    if (memberNamesSet.has(name.toLowerCase())) return false;
                    return true;
                }).join(', ');
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
        var activeCols = (columns || []).filter(function (c) { return !c.hidden; });
        var lines = [];
        var headers = activeCols.map(function (c) {
            var h = String(c.header || '').replace(/"/g, '""');
            return '"' + s4tNeutralizeFormula(h) + '"';
        });
        lines.push(headers.join(','));

        var prevGroup = null;
        cards.forEach(function (card) {
            if (insertSeparator) {
                var grp = getCardGroupKey(card, sortBy, lookup);
                if (prevGroup !== null && grp !== prevGroup) {
                    lines.push(activeCols.map(function () { return '""'; }).join(','));
                }
                prevGroup = grp;
            }
            var row = activeCols.map(function (c) {
                var cellKey = card.id + '_' + c.id;
                var val = (opts.editedCells && opts.editedCells[cellKey] !== undefined)
                    ? opts.editedCells[cellKey]
                    : s4tExtractFieldValue(card, c.source, lookup);
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
        var activeCols = (columns || []).filter(function (c) { return !c.hidden; });

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

        activeCols.forEach(function (c) {
            s.push('<th>' + s4tSpreadsheetText(c.header || '') + '</th>');
        });
        s.push('</tr></thead><tbody>');

        var prevGroup = null;
        cards.forEach(function (card, rIdx) {
            var grp = getCardGroupKey(card, sortBy, lookup);
            if (prevGroup !== null && grp !== prevGroup) {
                if (insertSeparator) {
                    s.push('<tr class="s4t-sep"><td colspan="' + activeCols.length + '">&nbsp;</td></tr>');
                }
            }
            prevGroup = grp;

            var trClass = (rIdx % 2 === 1) ? ' class="s4t-even"' : '';

            s.push('<tr' + trClass + '>');
            activeCols.forEach(function (c) {
                var cellKey = card.id + '_' + c.id;
                var val = (opts.editedCells && opts.editedCells[cellKey] !== undefined)
                    ? opts.editedCells[cellKey]
                    : s4tExtractFieldValue(card, c.source, lookup);
                var extraStyle = '';
                var valNorm = String(val || '').trim().toLowerCase();
                if (valNorm === 'going live' || valNorm === 'high') {
                    extraStyle = ' color: #059669; font-weight: bold;';
                } else if (valNorm === 'low' || valNorm === 'not going live') {
                    extraStyle = ' color: #dc2626; font-weight: bold;';
                } else if (valNorm === 'medium') {
                    extraStyle = ' color: #d97706;';
                } else if (valNorm === 'na') {
                    extraStyle = ' color: #6b7280;';
                }
                s.push('<td' + (extraStyle ? ' style="' + extraStyle + '"' : '') + '>' + s4tSpreadsheetText(val) + '</td>');
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
        var activeCols = (columns || []).filter(function (c) { return !c.hidden; });
        var lines = [];
        lines.push(activeCols.map(function (c) { return s4tNeutralizeFormula(c.header || '').replace(/\t/g, ' '); }).join('\t'));

        var prevGroup = null;
        cards.forEach(function (card) {
            if (insertSeparator) {
                var grp = getCardGroupKey(card, sortBy, lookup);
                if (prevGroup !== null && grp !== prevGroup) {
                    lines.push(activeCols.map(function () { return ''; }).join('\t'));
                }
                prevGroup = grp;
            }
            var row = activeCols.map(function (c) {
                var cellKey = card.id + '_' + c.id;
                var val = (opts.editedCells && opts.editedCells[cellKey] !== undefined)
                    ? opts.editedCells[cellKey]
                    : s4tExtractFieldValue(card, c.source, lookup);
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

        var storageKey = 's4t_card_export_cfg_v2_' + (boardShortLink || 'default');
        var savedColumns = null;
        var savedInsertSeparator = false;
        var savedColorByGroup = false;
        try {
            var rawSaved = localStorage.getItem(storageKey) || localStorage.getItem('s4t_card_export_cfg_v2_default');
            if (rawSaved) {
                var parsed = JSON.parse(rawSaved);
                if (Array.isArray(parsed) && parsed.length) {
                    savedColumns = parsed;
                } else if (parsed && Array.isArray(parsed.columns)) {
                    savedColumns = parsed.columns;
                    savedInsertSeparator = !!parsed.insertSeparatorRow;
                }
            }
        } catch (_) { }

        var state = {
            currentTab: 'sheet',
            columns: savedColumns || JSON.parse(JSON.stringify(DEFAULT_COLUMNS)),
            insertSeparatorRow: savedInsertSeparator,
            editedCells: {},
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

        var dotLabels = s4tGetDotLabels(state.boardData);
        var dotLabelsStr = dotLabels.join(', ');

        // All columns ON by default when opening export dialog
        (state.columns || []).forEach(function (c) {
            c.hidden = false;
            // Prevent Status column or custom dropdown from erroneously inheriting/pulling title
            if ((c.id === 'c_status' || (c.header && c.header.trim().toLowerCase() === 'status') || c.cellType === 'custom_select') && (c.source === 'title' || c.source === 'title_raw')) {
                c.source = 'blank';
            }
            // Product Owner dropdown values must only come from dot-terminated labels
            if (c.source === 'product_owner' || (c.header && c.header.trim().toLowerCase() === 'product owner') || c.id === 'c_po_owner') {
                if (c.customOptions && c.customOptions.includes('Product Owner, CS Member, QA, Tech Lead')) {
                    c.customOptions = dotLabelsStr;
                } else if (!c.customOptions) {
                    c.customOptions = dotLabelsStr;
                }
            }
            // CS Owner column starts unfilled just like Product Owner until filled once by user
            if (s4tIsCsOwnerCol(c)) {
                s4tCleanLegacyCsOwner(c);
            }
        });

        var overlay = $('<div id="s4t-export-overlay" class="s4t-modal-backdrop" role="presentation">');
        var dialog = $('<section id="s4t-export-dialog" class="s4t-export-dialog" role="dialog" aria-modal="true" aria-labelledby="s4t-export-title">');
        overlay.append(dialog);
        $('body').append(overlay);
        activeOverlay = overlay;

        function close() {
            if (isGuideActive) {
                toggleGuideMode();
            }
            if (activeOverlay === overlay) activeOverlay = null;
            overlay.remove();
            $(document).off('keydown.s4tExportClose');
            $(document).off('click.s4tFormatMenuClose');
            if (typeof document !== 'undefined') {
                document.dispatchEvent(new CustomEvent('s4t-dismiss-tooltip'));
            }
        }

        $(document).on('keydown.s4tExportClose', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                if (isGuideActive) {
                    toggleGuideMode();
                    return;
                }
                close();
            }
        });

        overlay.on('click', function (e) {
            if (e.target === overlay[0]) close();
        });

        dialog.html([
            '<header class="s4t-export-header s4t-modal-header">',
            '  <div class="s4t-export-title-row s4t-modal-title-area">',
            '    <div class="s4t-feature-title">',
            '      <h2 id="s4t-export-title" class="s4t-modal-title">Export Board Cards</h2>',
            '    </div>',
            '    <span class="s4t-export-board-tag s4t-board-badge">' + s4tEscapeHtml(boardName) + '</span>',
            '    <span class="s4t-export-match-count s4t-metric-badge" id="s4t-export-count-badge" role="button" tabindex="0" data-tooltip="Double-click to copy matching card count" data-copy-value="0">0 cards matching</span>',
            '  </div>',
            '  <div class="s4t-export-header-actions">',
            '    <button type="button" class="s4t-btn s4t-btn-subtle s4t-sheet-guide-btn" id="s4t-export-guide-btn" data-tooltip="Interactive Guide Tour" aria-pressed="false"><svg class="s4t-guide-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg><span>Guide</span></button>',
            '    <button type="button" class="s4t-btn s4t-btn-subtle s4t-sheet-reset-btn" id="s4t-header-reset-btn" data-tooltip="Reset to default columns">↺ Reset Template</button>',
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
        if (typeof s4tBindMetricCopy === 'function') {
            s4tBindMetricCopy(dialog);
        } else if (typeof globalThis !== 'undefined' && typeof globalThis.s4tBindMetricCopy === 'function') {
            globalThis.s4tBindMetricCopy(dialog);
        }

        var isGuideActive = false;

        dialog.find('#s4t-export-guide-btn').on('click', function (e) {
            e.stopPropagation();
            toggleGuideMode();
        });

        function toggleGuideMode() {
            isGuideActive = !isGuideActive;
            var guideBtn = dialog.find('#s4t-export-guide-btn');

            if (!isGuideActive) {
                dialog.removeClass('s4t-guide-active-mode');
                guideBtn.removeClass('s4t-guide-active').attr('aria-pressed', 'false');
                dialog.find('#s4t-guide-freeze-overlay').remove();
                dialog.find('.s4t-cloud-tooltip').remove();
                $(window).off('resize.s4tGuide');
                return;
            }

            if (state.currentTab !== 'sheet') {
                dialog.find('#s4t-tab-btn-sheet').trigger('click');
            }

            dialog.addClass('s4t-guide-active-mode');
            guideBtn.addClass('s4t-guide-active').attr('aria-pressed', 'true');

            dialog.find('#s4t-guide-freeze-overlay').remove();
            dialog.find('.s4t-cloud-tooltip').remove();

            var freezeOverlay = $('<div id="s4t-guide-freeze-overlay" class="s4t-guide-freeze-overlay">');
            freezeOverlay.on('click mousedown mouseup', function (e) {
                e.preventDefault();
                e.stopPropagation();
            });
            dialog.append(freezeOverlay);

            renderCloudyTooltips();

            $(window).off('resize.s4tGuide').on('resize.s4tGuide', function () {
                if (isGuideActive) {
                    renderCloudyTooltips();
                }
            });
        }

        function renderCloudyTooltips() {
            dialog.find('.s4t-cloud-tooltip').remove();

            var dialogOffset = dialog.offset() || { top: 0, left: 0 };
            var dialogWidth = dialog.outerWidth();
            var dialogHeight = dialog.outerHeight();

            var guideItems = [
                {
                    target: '#s4t-tab-btn-exclusions',
                    title: '🔍 Exclusions & Ordering',
                    desc: 'Switch tabs to exclude specific lists, members, or labels before exporting.',
                    placement: 'bottom'
                },
                {
                    target: '.s4t-sheet-topbar-left',
                    title: '📂 Group Separators & Sort',
                    desc: 'Auto-insert line breaks between groups, and sort cards by developer, list, or title.',
                    placement: 'bottom'
                },
                {
                    target: '.s4t-sheet-th-card:first .s4t-sheet-drag-handle',
                    fallbackTarget: '.s4t-sheet-th-card:first',
                    title: '↔ Drag & Drop Sequence',
                    desc: 'Grab the 6-dot grip handle to rearrange column sequence in your export.',
                    placement: 'bottom'
                },
                {
                    target: '.s4t-sheet-th-card:first .s4t-sheet-header-input',
                    fallbackTarget: '.s4t-sheet-th-card:first',
                    title: '✏️ Rename & 👁️ Hide',
                    desc: 'Edit header text directly, or click 👁 to hide this column without deleting it.',
                    placement: 'bottom'
                },
                {
                    target: '.s4t-sheet-th-card:first .s4t-sheet-source-header',
                    fallbackTarget: '.s4t-sheet-th-card:first',
                    title: '🎯 Field Mapping & Dtypes',
                    desc: 'Map to 14 card fields (points, devs, dates) and select String, Devs, or Custom format.',
                    placement: 'bottom'
                },
                {
                    target: '#s4t-btn-copy',
                    fallbackTarget: '.s4t-export-footer-actions',
                    title: '⚡ Instant Export',
                    desc: 'One-click copy formatted TSV directly to clipboard for Google Sheets, or download Excel & CSV.',
                    placement: 'top'
                }
            ];

            guideItems.forEach(function (item) {
                var $el = dialog.find(item.target);
                if ((!$el.length || !$el.is(':visible')) && item.fallbackTarget) {
                    $el = dialog.find(item.fallbackTarget);
                }
                if (!$el.length || !$el.is(':visible')) return;

                var elOffset = $el.offset();
                var elW = $el.outerWidth();
                var elH = $el.outerHeight();

                var $tooltip = $('<div class="s4t-cloud-tooltip">');
                $tooltip.html([
                    '<div class="s4t-cloud-arrow"></div>',
                    '<div class="s4t-cloud-header">',
                    '  <span class="s4t-cloud-icon">☁️</span>',
                    '  <strong class="s4t-cloud-title">' + s4tEscapeHtml(item.title) + '</strong>',
                    '</div>',
                    '<div class="s4t-cloud-desc">' + s4tEscapeHtml(item.desc) + '</div>'
                ].join(''));

                dialog.append($tooltip);

                var tipW = $tooltip.outerWidth() || 240;
                var tipH = $tooltip.outerHeight() || 85;

                var targetCenterX = (elOffset.left - dialogOffset.left) + (elW / 2);
                var targetTopY = (elOffset.top - dialogOffset.top);
                var targetBottomY = targetTopY + elH;

                var top, left;
                var arrowClass = 'arrow-top';

                if (item.placement === 'top' || (targetBottomY + tipH + 16 > dialogHeight && targetTopY - tipH - 16 > 0)) {
                    top = targetTopY - tipH - 12;
                    arrowClass = 'arrow-bottom';
                } else {
                    top = targetBottomY + 12;
                    arrowClass = 'arrow-top';
                }

                left = targetCenterX - (tipW / 2);

                var padding = 12;
                var clampedLeft = Math.max(padding, Math.min(left, dialogWidth - tipW - padding));
                var clampedTop = Math.max(padding, Math.min(top, dialogHeight - tipH - padding));
                var arrowOffset = Math.max(16, Math.min(targetCenterX - clampedLeft, tipW - 16));

                $tooltip.addClass(arrowClass);
                $tooltip.find('.s4t-cloud-arrow').css('left', arrowOffset + 'px');
                $tooltip.css({
                    top: clampedTop + 'px',
                    left: clampedLeft + 'px'
                });
            });
        }

        dialog.find('#s4t-header-reset-btn').on('click', function () {
            state.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
            var dotLabels = s4tGetDotLabels(state.boardData);
            var dotLabelsStr = dotLabels.join(', ');
            state.columns.forEach(function (c) {
                c.hidden = false;
                if (c.source === 'product_owner' || (c.header && c.header.trim().toLowerCase() === 'product owner') || c.id === 'c_po_owner') {
                    c.customOptions = dotLabelsStr;
                }
            });
            state.insertSeparatorRow = false;
            state.editedCells = {};
            dialog.find('#s4t-toggle-separator').prop('checked', false);
            state.previewDirty = true;
            saveConfig();
            renderSheetTableContent();
            updateColumnsCountBadge();
            updateActionButtonsState();
            showToast('Reset to default column layout.');
        });

        function updateColumnsCountBadge() {
            var count = state.columns ? state.columns.length : 0;
            var activeCount = state.columns ? state.columns.filter(function (c) { return !c.hidden; }).length : 0;
            var text = (activeCount === count)
                ? (count + (count === 1 ? ' column' : ' columns'))
                : (activeCount + '/' + count + ' columns');
            dialog.find('#s4t-sheet-col-count').text(text);
        }

        function isCustomDtypeMissing(col) {
            if (!col || col.cellType !== 'custom_select') return false;
            var raw = (col.customOptions || '').trim();
            if (!raw) return true;
            var validItems = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
            return validItems.length === 0;
        }

        function getFirstValidationError() {
            var activeCols = (state.columns || []).filter(function (c) { return !c.hidden; });
            if (activeCols.length === 0) {
                return { type: 'all_hidden', msg: 'At least one column must be visible to export.' };
            }
            for (var i = 0; i < state.columns.length; i++) {
                var c = state.columns[i];
                if (!c.hidden && isCustomDtypeMissing(c)) {
                    var isPo = c.source === 'product_owner' || (c.header && c.header.trim().toLowerCase() === 'product owner') || c.id === 'c_po_owner';
                    var isCs = (c.header && c.header.trim().toLowerCase() === 'cs owner') || c.id === 'c_cs_owner';
                    if (isPo) {
                        return { type: 'missing_po', col: c, msg: '⚠️ Required: Please fill in Product Owner options before exporting.' };
                    }
                    if (isCs) {
                        return { type: 'missing_cs', col: c, msg: '⚠️ Required: Please fill in CS Owner options before exporting.' };
                    }
                    return { type: 'missing_custom', col: c, msg: '⚠️ Required: Please fill in custom options before exporting.' };
                }
            }
            if (dialog.find('.s4t-input-required-error').length > 0) {
                return { type: 'input_error', msg: '⚠️ Required: Please fill in required options before exporting.' };
            }
            return null;
        }

        function hasValidationErrors() {
            return getFirstValidationError() !== null;
        }

        function updateActionButtonsState() {
            var valErr = getFirstValidationError();
            var hasErr = (valErr !== null);
            var copyBtn = dialog.find('#s4t-btn-copy-tsv');
            var downloadBtn = dialog.find('#s4t-btn-main-download');
            var formatToggle = dialog.find('#s4t-btn-format-toggle');
            var splitGroup = dialog.find('.s4t-split-download-group');
            var formatMenu = dialog.find('#s4t-format-menu');

            if (hasErr) {
                var copyTip = valErr.msg.replace('exporting.', 'copying table.').replace('export.', 'copying table.');
                var downTip = valErr.msg.replace('exporting.', 'downloading file.').replace('export.', 'downloading file.');
                copyBtn.addClass('s4t-btn-disabled').attr('aria-disabled', 'true').attr('data-tooltip', copyTip);
                downloadBtn.addClass('s4t-btn-disabled').attr('aria-disabled', 'true').attr('data-tooltip', downTip);
                formatToggle.addClass('s4t-btn-disabled').attr('aria-disabled', 'true');
                splitGroup.addClass('s4t-group-disabled');
                formatMenu.prop('hidden', true);
            } else {
                copyBtn.removeClass('s4t-btn-disabled').removeAttr('aria-disabled').attr('data-tooltip', 'Copy tab-separated table to clipboard for instant Google Sheets paste');
                downloadBtn.removeClass('s4t-btn-disabled').removeAttr('aria-disabled').removeAttr('data-tooltip');
                formatToggle.removeClass('s4t-btn-disabled').removeAttr('aria-disabled');
                splitGroup.removeClass('s4t-group-disabled');
            }
        }

        function attachDropdownHover(el) {
            var $select = $(el);
            if (!$select.length || $select.data('s4t-enhanced')) return;
            $select.data('s4t-enhanced', true);

            // Native showPicker capability check for environments that support it
            try {
                if (typeof el.showPicker === 'function') {
                    // showPicker is natively available
                }
            } catch (_) { }

            // Hide native select visually while keeping it fully synchronized in the DOM
            $select.addClass('s4t-select-replaced').prop('hidden', true);

            var $wrap = $('<div class="s4t-custom-dropdown" draggable="false">');
            if ($select.hasClass('s4t-sheet-source-select')) $wrap.addClass('s4t-custom-source-dropdown');
            if ($select.hasClass('s4t-sheet-type-select')) $wrap.addClass('s4t-custom-type-dropdown');
            if ($select.hasClass('s4t-sheet-cell-select')) $wrap.addClass('s4t-custom-cell-dropdown');
            if ($select.attr('id') === 's4t-sort-select') $wrap.addClass('s4t-custom-sort-dropdown');

            var $trigger = $('<button type="button" class="s4t-custom-dropdown-trigger" aria-haspopup="listbox" aria-expanded="false" draggable="false">');
            var $label = $('<span class="s4t-custom-dropdown-label">');
            var $arrow = $('<span class="s4t-custom-dropdown-arrow" aria-hidden="true">▾</span>');
            $trigger.append($label, $arrow);

            var $menu = $('<div class="s4t-custom-dropdown-menu" role="listbox" hidden draggable="false">');

            function refreshOptions() {
                $menu.empty();
                var currentVal = $select.val();
                var selectedText = '';
                $select.find('option').each(function () {
                    var val = $(this).val();
                    var text = $(this).text();
                    var isSelected = val === currentVal || (!currentVal && !val && !selectedText);
                    if (isSelected && !selectedText) selectedText = text;

                    var $item = $('<div class="s4t-custom-dropdown-item" role="option" draggable="false">')
                        .attr('data-val', val)
                        .text(text);
                    if (isSelected) $item.addClass('s4t-selected');

                    $item.on('mousedown', function (e) {
                        e.preventDefault();
                    });

                    $item.on('click', function (e) {
                        e.stopPropagation();
                        e.preventDefault();
                        $select.val(val).trigger('change');
                        closeDropdown();
                    });

                    $menu.append($item);
                });

                if (!selectedText) {
                    var firstOpt = $select.find('option:first');
                    selectedText = firstOpt.length ? firstOpt.text() : '';
                }
                $label.text(selectedText);

                if ($select.prop('disabled')) {
                    $wrap.addClass('s4t-dropdown-disabled');
                    $trigger.prop('disabled', true).attr('aria-disabled', 'true');
                } else {
                    $wrap.removeClass('s4t-dropdown-disabled');
                    $trigger.prop('disabled', false).removeAttr('aria-disabled');
                }
            }

            refreshOptions();

            // Sync with select change events
            $select.on('change.s4tSync', function () {
                var currentVal = $select.val();
                var selectedOpt = $select.find('option').filter(function () { return $(this).val() === currentVal; });
                if (selectedOpt.length) {
                    $label.text(selectedOpt.text());
                    $menu.find('.s4t-custom-dropdown-item').removeClass('s4t-selected');
                    $menu.find('[data-val="' + currentVal + '"]').addClass('s4t-selected');
                }
            });

            var openedAt = 0;
            function openDropdown() {
                if ($select.prop('disabled')) return;
                openedAt = Date.now();
                dialog.find('.s4t-custom-dropdown-menu').not($menu).prop('hidden', true);
                dialog.find('.s4t-custom-dropdown-trigger').not($trigger).attr('aria-expanded', 'false');
                dialog.find('.s4t-custom-dropdown').not($wrap).removeClass('s4t-dropdown-open s4t-dropdown-up s4t-dropdown-align-right');
                dialog.find('.s4t-sheet-th').removeClass('s4t-th-dropdown-active');
                dialog.find('.s4t-sheet-cell').removeClass('s4t-cell-dropdown-active');
                dialog.find('.s4t-sheet-row').removeClass('s4t-row-dropdown-active');

                refreshOptions();
                $menu.prop('hidden', false);
                $trigger.attr('aria-expanded', 'true');
                $wrap.addClass('s4t-dropdown-open');
                $wrap.closest('.s4t-sheet-th').addClass('s4t-th-dropdown-active');
                $wrap.closest('.s4t-sheet-cell').addClass('s4t-cell-dropdown-active');
                $wrap.closest('.s4t-sheet-row').addClass('s4t-row-dropdown-active');

                try {
                    var wrapRect = $wrap[0].getBoundingClientRect();
                    var dialogRect = dialog[0].getBoundingClientRect();
                    var gridWrap = dialog.find('.s4t-sheet-grid-wrapper');
                    var bottomBoundary = gridWrap.length ? Math.min(dialogRect.bottom, gridWrap[0].getBoundingClientRect().bottom) : dialogRect.bottom;
                    var topBoundary = gridWrap.length ? Math.max(dialogRect.top, gridWrap[0].getBoundingClientRect().top) : dialogRect.top;
                    var rightBoundary = gridWrap.length ? Math.min(dialogRect.right, gridWrap[0].getBoundingClientRect().right) : dialogRect.right;
                    var leftBoundary = gridWrap.length ? Math.max(dialogRect.left, gridWrap[0].getBoundingClientRect().left) : dialogRect.left;

                    if (wrapRect.bottom + 180 > bottomBoundary && wrapRect.top - 180 > topBoundary) {
                        $wrap.addClass('s4t-dropdown-up');
                    } else {
                        $wrap.removeClass('s4t-dropdown-up');
                    }

                    var menuHalfWidth = 110;
                    var wrapCenter = wrapRect.left + wrapRect.width / 2;
                    if (wrapCenter + menuHalfWidth > rightBoundary) {
                        $wrap.addClass('s4t-dropdown-align-right');
                    } else {
                        $wrap.removeClass('s4t-dropdown-align-right');
                    }
                    if (wrapCenter - menuHalfWidth < leftBoundary) {
                        $wrap.addClass('s4t-dropdown-align-left');
                    } else {
                        $wrap.removeClass('s4t-dropdown-align-left');
                    }
                } catch (_) { }
            }

            function closeDropdown() {
                $menu.prop('hidden', true);
                $trigger.attr('aria-expanded', 'false');
                $wrap.removeClass('s4t-dropdown-open s4t-dropdown-up s4t-dropdown-align-right s4t-dropdown-align-left');
                $wrap.closest('.s4t-sheet-th').removeClass('s4t-th-dropdown-active');
                $wrap.closest('.s4t-sheet-cell').removeClass('s4t-cell-dropdown-active');
                $wrap.closest('.s4t-sheet-row').removeClass('s4t-row-dropdown-active');
            }

            // Open on hover (mouseover / mouseenter) & close on mouseleave
            var hoverTimer;
            $wrap.on('mouseenter', function () {
                if ($select.prop('disabled')) return;
                clearTimeout(hoverTimer);
                openDropdown();
            }).on('mouseleave', function () {
                hoverTimer = setTimeout(function () {
                    closeDropdown();
                }, 140);
            });

            // Prevent browser native button active white flash on mousedown
            $trigger.on('mousedown', function (e) {
                e.preventDefault();
            });

            // Single click toggles dropdown
            $trigger.on('click', function (e) {
                e.stopPropagation();
                e.preventDefault();
                if ($select.prop('disabled')) return;
                if ($menu.prop('hidden')) {
                    openDropdown();
                } else {
                    // If opened by hover within last 400ms, user click intended to open/focus, stay open
                    if (Date.now() - openedAt < 400) {
                        return;
                    }
                    closeDropdown();
                }
            });

            // Keyboard accessibility
            $wrap.on('keydown', function (e) {
                if (e.key === 'Escape') {
                    closeDropdown();
                    $trigger.focus();
                }
            });

            // Close on mousedown outside
            $(document).off('mousedown.s4tCustomDropClose').on('mousedown.s4tCustomDropClose', function (e) {
                if (!$(e.target).closest('.s4t-custom-dropdown').length) {
                    dialog.find('.s4t-custom-dropdown-menu').prop('hidden', true);
                    dialog.find('.s4t-custom-dropdown-trigger').attr('aria-expanded', 'false');
                    dialog.find('.s4t-custom-dropdown').removeClass('s4t-dropdown-open s4t-dropdown-up s4t-dropdown-align-right');
                    dialog.find('.s4t-sheet-th').removeClass('s4t-th-dropdown-active');
                    dialog.find('.s4t-sheet-cell').removeClass('s4t-cell-dropdown-active');
                    dialog.find('.s4t-sheet-row').removeClass('s4t-row-dropdown-active');
                }
            });

            $wrap.append($trigger, $menu);

            if ($select.parent().length) {
                $select.after($wrap);
            } else {
                setTimeout(function () {
                    $select.after($wrap);
                    refreshOptions();
                }, 0);
            }
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

            // Dynamically refresh Product Owner options from latest dot-terminated labels
            var latestDotLabels = s4tGetDotLabels(data);
            var latestDotStr = latestDotLabels.join(', ');
            state.columns.forEach(function (c) {
                if (c.source === 'product_owner' || (c.header && c.header.trim().toLowerCase() === 'product owner') || c.id === 'c_po_owner') {
                    if (latestDotStr) {
                        c.customOptions = latestDotStr;
                    } else if (!c.customOptions || c.customOptions.includes('Product Owner, CS Member, QA, Tech Lead')) {
                        c.customOptions = '';
                    }
                }
                if (s4tIsCsOwnerCol(c)) {
                    s4tCleanLegacyCsOwner(c);
                }
            });

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
            var count = state.filteredCards.length;
            dialog.find('#s4t-export-count-badge')
                .text(count + ' cards matching')
                .attr('data-copy-value', count);
        }

        function saveConfig() {
            try {
                var cfg = {
                    columns: state.columns,
                    insertSeparatorRow: state.insertSeparatorRow
                };
                localStorage.setItem(storageKey, JSON.stringify(cfg));
                localStorage.setItem('s4t_card_export_cfg_v2_default', JSON.stringify(cfg));
            } catch (_) { }
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

            // Sheet Grid Container (viewport container that holds the scrollable grid & stationary overlay)
            var gridContainer = $('<div class="s4t-sheet-grid-container">');
            // Sheet Grid Wrapper with horizontal & vertical scroll
            var gridWrapper = $('<div class="s4t-sheet-grid-wrapper">');
            var table = $('<table class="s4t-sheet-grid-table" id="s4t-sheet-table">');
            gridWrapper.append(table);
            gridContainer.append(gridWrapper);
            container.append(gridContainer);

            renderSheetTableContent();
            updateColumnsCountBadge();
        }

        function renderSheetTableContent() {
            var table = dialog.find('#s4t-sheet-table').empty();

            // 1. THEAD - Column Headers Side by Side
            var thead = $('<thead>');
            var trHead = $('<tr>');

            state.columns.forEach(function (col, idx) {
                var isHidden = !!col.hidden;
                var th = $('<th class="s4t-sheet-th" draggable="' + (isHidden ? 'false' : 'true') + '" data-col-idx="' + idx + '">');
                if (isHidden) th.addClass('s4t-sheet-th-hidden');

                var card = $('<div class="s4t-sheet-th-card">');

                // Card Top Row: Drag handle, Col Badge, Hide button, Delete button
                var cardTop = $('<div class="s4t-sheet-card-top">');
                var dragHandle = $('<span class="s4t-sheet-drag-handle" data-tooltip="' + (isHidden ? 'Column is hidden from export (read-only)' : 'Drag to reorder column') + '" aria-label="' + (isHidden ? 'Column is hidden from export (read-only)' : 'Drag to reorder column') + '">' +
                    '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor" aria-hidden="true">' +
                    '<circle cx="5" cy="3.5" r="1.3"/><circle cx="11" cy="3.5" r="1.3"/>' +
                    '<circle cx="5" cy="8" r="1.3"/><circle cx="11" cy="8" r="1.3"/>' +
                    '<circle cx="5" cy="12.5" r="1.3"/><circle cx="11" cy="12.5" r="1.3"/>' +
                    '</svg></span>');
                var colBadge = $('<span class="s4t-sheet-col-badge">').text('Col ' + (idx + 1));

                var eyeOnSvg = '<svg class="s4t-col-eye-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
                var eyeOffSvg = '<svg class="s4t-col-eye-svg" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

                var hideBtn = $('<button type="button" class="s4t-sheet-col-hide' + (isHidden ? ' s4t-is-hidden' : '') + '" data-tooltip="' + (isHidden ? 'Unhide column' : 'Hide column from export') + '" aria-label="' + (isHidden ? 'Unhide column' : 'Hide column') + '"></button>')
                    .html(isHidden ? eyeOffSvg : eyeOnSvg);

                if (isHidden) {
                    card.addClass('s4t-col-card-hidden');
                    colBadge.text('Col ' + (idx + 1) + ' (Hidden)');
                }

                hideBtn.on('click', function (e) {
                    e.stopPropagation();
                    col.hidden = !col.hidden;
                    state.previewDirty = true;
                    saveConfig();
                    renderSheetTableContent();
                    updateColumnsCountBadge();
                    updateActionButtonsState();
                });

                var delBtn = $('<button type="button" class="s4t-sheet-col-del" data-tooltip="Remove column" aria-label="Remove column">✕</button>')
                    .prop('disabled', isHidden || state.columns.length <= 1)
                    .on('click', function () {
                        if (isHidden) return;
                        if (state.columns.length > 1) {
                            state.columns.splice(idx, 1);
                            state.previewDirty = true;
                            saveConfig();
                            renderSheetTableContent();
                            updateColumnsCountBadge();
                            updateActionButtonsState();
                        }
                    });
                cardTop.append(dragHandle, colBadge, hideBtn, delBtn);

                // Card Input Row
                var cardInputRow = $('<div class="s4t-sheet-card-input-row">');
                var headerInput = $('<input type="text" class="s4t-sheet-header-input" placeholder="Column Header" aria-label="Header Name">')
                    .val(col.header || '')
                    .prop('readonly', isHidden);
                headerInput.attr('draggable', 'false');
                headerInput.on('dragstart', function (e) {
                    e.stopPropagation();
                    return false;
                });
                headerInput.on('mousedown focus', function () {
                    th.attr('draggable', 'false');
                });
                if (isHidden) {
                    headerInput.attr('tabindex', '-1').attr('title', 'Column is hidden from export (read-only)');
                }

                headerInput.on('input', function () {
                    if (isHidden) return;
                    col.header = $(this).val();
                    if (col.header && col.header.trim().toLowerCase() === 'status') {
                        if (col.source === 'title' || col.source === 'title_raw') {
                            col.source = 'blank';
                            sourceSelect.val('blank');
                            var updatedBlank = FIELD_MAP['blank'] || FIELD_DEFINITIONS[0];
                            infoIcon.attr('data-tooltip', updatedBlank.desc);
                        }
                    }
                    state.previewDirty = true;
                    saveConfig();
                    renderDirtyIndicator();
                });
                cardInputRow.append(headerInput);

                // Source Mapping: Header row with label + info icon next to it, and small centered select box
                var sourceRow = $('<div class="s4t-sheet-source-row">');
                var sourceHeader = $('<div class="s4t-sheet-source-header">');
                var sourceLabel = $('<span class="s4t-sheet-source-label">Shows:</span>');
                var currentField = FIELD_MAP[col.source] || FIELD_DEFINITIONS[0];
                var infoSvg = '<svg class="s4t-field-info-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
                var infoIcon = $('<span class="s4t-field-info-icon" tabindex="0" role="button" aria-label="Field details" data-tooltip="' + s4tEscapeHtml(currentField.desc) + '"></span>').append(infoSvg);
                sourceHeader.append(sourceLabel, infoIcon);

                var selectWrap = $('<div class="s4t-sheet-source-select-wrap">');
                var sourceSelect = $('<select class="s4t-sheet-source-select" aria-label="Field Mapping">')
                    .prop('disabled', isHidden);

                FIELD_DEFINITIONS.forEach(function (f) {
                    var opt = $('<option>').val(f.key).text(f.label);
                    if (f.key === col.source) opt.prop('selected', true);
                    sourceSelect.append(opt);
                });

                sourceSelect.on('change', function () {
                    col.source = $(this).val();
                    var updated = FIELD_MAP[col.source] || FIELD_DEFINITIONS[0];
                    infoIcon.attr('data-tooltip', updated.desc);
                    if (col.source === 'product_owner') {
                        var dotLabels = s4tGetDotLabels(state.boardData);
                        col.customOptions = dotLabels.join(', ');
                        customInput.val(col.customOptions);
                    }
                    validateCustomOptions();
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });
                selectWrap.append(sourceSelect);
                sourceRow.append(sourceHeader, selectWrap);
                attachDropdownHover(sourceSelect);

                // Format / dtype Row
                var typeRow = $('<div class="s4t-sheet-type-row">');
                var typeHeader = $('<div class="s4t-sheet-type-header"><span class="s4t-sheet-type-label">dtype:</span></div>');
                var typeSelect = $('<select class="s4t-sheet-type-select" aria-label="Cell Data Type">')
                    .prop('disabled', isHidden);

                var currentType = col.cellType;
                if (!currentType || currentType === 'checkbox') currentType = 'text';
                [
                    { val: 'text', text: 'String' },
                    { val: 'dev_select', text: 'Devs' },
                    { val: 'custom_select', text: 'Custom' }
                ].forEach(function (t) {
                    var opt = $('<option>').val(t.val).text(t.text);
                    if (currentType === t.val) opt.prop('selected', true);
                    typeSelect.append(opt);
                });

                if (s4tIsCsOwnerCol(col)) {
                    s4tCleanLegacyCsOwner(col);
                }
                var isPoCol = col.source === 'product_owner' || (col.header && col.header.trim().toLowerCase() === 'product owner') || col.id === 'c_po_owner';
                var customPlaceholder = isPoCol ? 'e.g. Prapti, Kashvi' : 'e.g. In Progress, Blocked, Ready for QA';
                var customInput = $('<input type="text" class="s4t-sheet-custom-options-input" placeholder="' + customPlaceholder + '" data-tooltip="Comma-separated custom dropdown options" aria-label="Custom dropdown values" draggable="false">')
                    .val(col.customOptions || '')
                    .prop('hidden', currentType !== 'custom_select')
                    .prop('readonly', isHidden);
                customInput.on('dragstart', function (e) {
                    e.stopPropagation();
                    return false;
                });
                customInput.on('mousedown focus', function () {
                    th.attr('draggable', 'false');
                });
                if (isHidden) {
                    customInput.attr('tabindex', '-1');
                }

                function validateCustomOptions() {
                    var isMissing = !col.hidden && isCustomDtypeMissing(col);
                    if (col.cellType === 'custom_select' && isMissing) {
                        customInput.addClass('s4t-input-required-error');
                        var isPo = col.source === 'product_owner' || (col.header && col.header.trim().toLowerCase() === 'product owner') || col.id === 'c_po_owner';
                        var isCs = (col.header && col.header.trim().toLowerCase() === 'cs owner') || col.id === 'c_cs_owner';
                        var tip = isPo ? 'Required: Enter Product Owner options (board has no dot labels)' : (isCs ? 'Required: Enter CS Owner options' : 'Required: Enter comma-separated dropdown options');
                        customInput.attr('data-tooltip', tip);
                    } else {
                        customInput.removeClass('s4t-input-required-error');
                        customInput.attr('data-tooltip', 'Comma-separated custom dropdown options');
                    }
                    updateActionButtonsState();
                }
                validateCustomOptions();

                customInput.on('input', function () {
                    if (isHidden) return;
                    col.customOptions = $(this).val();
                    if (s4tIsCsOwnerCol(col)) {
                        col.userFilled = !!(col.customOptions && col.customOptions.trim());
                    }
                    validateCustomOptions();
                    updateActionButtonsState();
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });

                if (isPoCol) {
                    customInput.on('focus click', function () {
                        if (isHidden) return;
                        var latest = s4tGetDotLabels(state.boardData);
                        if (latest.length) {
                            var latestStr = latest.join(', ');
                            if (!col.customOptions || col.customOptions !== latestStr) {
                                col.customOptions = latestStr;
                                $(this).val(latestStr);
                                validateCustomOptions();
                                updateActionButtonsState();
                                state.previewDirty = true;
                                saveConfig();
                                if (state.previewVisible) renderSheetTableBody();
                            }
                        }
                    });
                }

                typeSelect.on('change', function () {
                    col.cellType = $(this).val();
                    var isCustom = col.cellType === 'custom_select';
                    if (isCustom && (col.source === 'title' || col.source === 'title_raw')) {
                        col.source = 'blank';
                        sourceSelect.val('blank');
                        var updated = FIELD_MAP['blank'] || FIELD_DEFINITIONS[0];
                        infoIcon.attr('data-tooltip', updated.desc);
                    }
                    customInput.prop('hidden', !isCustom);
                    validateCustomOptions();
                    updateActionButtonsState();
                    if (isCustom) {
                        customInput.focus();
                    }
                    state.previewDirty = true;
                    saveConfig();
                    if (state.previewVisible) renderSheetTableBody();
                });
                typeRow.append(typeHeader, typeSelect, customInput);
                attachDropdownHover(typeSelect);

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
                state.columns.push({ id: newId, header: 'New Column', source: 'blank', cellType: 'text' });
                state.previewDirty = true;
                saveConfig();
                renderSheetTableContent();
                updateColumnsCountBadge();
                updateActionButtonsState();
                setTimeout(function () {
                    var wrapper = dialog.find('.s4t-sheet-grid-wrapper');
                    if (wrapper.length) {
                        wrapper.animate({ scrollLeft: wrapper[0].scrollWidth }, 250);
                    }
                }, 10);
            });
            addTh.append(addBtn);

            addTh.on('dragenter dragover', function (e) {
                e.preventDefault();
                if (draggedIdx === null) return false;
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.dropEffect = 'move';
                }
                dialog.find('.s4t-sheet-th').removeClass('s4t-col-dragover s4t-col-drop-before s4t-col-drop-after');
                $(this).addClass('s4t-col-dragover s4t-col-drop-before');
                return false;
            });

            addTh.on('dragleave', function (e) {
                var rect = this.getBoundingClientRect();
                var oe = e.originalEvent;
                if (oe && (oe.clientX < rect.left || oe.clientX >= rect.right || oe.clientY < rect.top || oe.clientY >= rect.bottom)) {
                    $(this).removeClass('s4t-col-dragover s4t-col-drop-before');
                }
            });

            addTh.on('drop', function (e) {
                e.preventDefault();
                if (e.originalEvent && e.originalEvent.stopPropagation) {
                    e.originalEvent.stopPropagation();
                }
                dialog.removeClass('s4t-is-dragging-col');
                dialog.find('.s4t-sheet-th, .s4t-sheet-th-add').removeClass('s4t-col-dragover s4t-col-dragging s4t-col-drop-before s4t-col-drop-after');

                var fromIdx = draggedIdx;
                if ((fromIdx === null || isNaN(fromIdx)) && e.originalEvent && e.originalEvent.dataTransfer) {
                    var dt = e.originalEvent.dataTransfer.getData('text/col-idx') || e.originalEvent.dataTransfer.getData('text/plain');
                    if (dt !== '') fromIdx = parseInt(dt, 10);
                }
                if (fromIdx !== null && !isNaN(fromIdx) && fromIdx >= 0 && fromIdx < state.columns.length) {
                    var toIdx = state.columns.length - 1;
                    if (fromIdx !== toIdx) {
                        var movedCol = state.columns.splice(fromIdx, 1)[0];
                        state.columns.splice(toIdx, 0, movedCol);
                        state.previewDirty = true;
                        saveConfig();
                        renderSheetTableContent();
                        updateColumnsCountBadge();
                        updateActionButtonsState();
                    }
                }
                draggedIdx = null;
                return false;
            });

            trHead.append(addTh);

            thead.append(trHead);
            table.append(thead);

            // 2. TBODY - Preview Rows or Initial Placeholder
            var tbody = $('<tbody>');
            table.append(tbody);
            renderSheetTableBody();
            updateActionButtonsState();
        }

        function renderDirtyIndicator() {
            var banner = dialog.find('.s4t-dirty-blur-overlay');
            if (state.previewVisible && state.previewDirty && !banner.length) {
                renderSheetTableBody();
            }
        }

        function renderSheetTableBody() {
            var tbody = dialog.find('#s4t-sheet-table tbody').empty();
            var totalColSpan = state.columns.length + 1;
            dialog.find('.s4t-sheet-preview-blur-overlay').remove();

            if (!state.previewVisible) {
                // Render placeholder greyish rows so the entire spreadsheet grid spans full width and height
                for (var r = 0; r < 14; r++) {
                    var tr = $('<tr class="s4t-sheet-row s4t-sheet-placeholder-row">');
                    for (var c = 0; c < state.columns.length; c++) {
                        var td = $('<td class="s4t-sheet-cell s4t-sheet-placeholder-cell">&nbsp;</td>');
                        tr.append(td);
                    }
                    tr.append($('<td class="s4t-sheet-cell s4t-sheet-placeholder-cell s4t-sheet-placeholder-add">&nbsp;</td>'));
                    tbody.append(tr);
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
                var mountContainer = dialog.find('.s4t-sheet-grid-container');
                if (!mountContainer.length) mountContainer = dialog.find('.s4t-sheet-grid-wrapper');
                mountContainer.append(blurOverlay);

                var syncOverlayWidth = function () {
                    var tableEl = dialog.find('#s4t-sheet-table');
                    var tw = tableEl.outerWidth() || (tableEl[0] ? tableEl[0].scrollWidth : 0);
                    var ww = dialog.find('.s4t-sheet-grid-wrapper').outerWidth() || 0;
                    var w = Math.max(tw, ww);
                    if (w > 0 && mountContainer.hasClass('s4t-sheet-grid-wrapper')) {
                        blurOverlay.css('min-width', w + 'px');
                    }
                };
                syncOverlayWidth();
                setTimeout(syncOverlayWidth, 50);
                return;
            }

            // Dirty banner if settings changed: consistent full-width gray blur overlay with dark theme card
            if (state.previewDirty) {
                var dirtyOverlay = $('<div class="s4t-sheet-preview-blur-overlay s4t-dirty-blur-overlay">');
                var dirtyCard = $('<div class="s4t-dirty-dark-card">');
                dirtyCard.html([
                    '<div class="s4t-dirty-icon">⚡</div>',
                    '<div class="s4t-dirty-title">Column or exclusion settings changed.</div>',
                    '<button type="button" class="s4t-btn s4t-btn-primary s4t-dirty-refresh-btn">👁️ Generate Preview</button>'
                ].join(''));

                dirtyCard.find('.s4t-dirty-refresh-btn').on('click', function () {
                    state.previewDirty = false;
                    renderSheetTableBody();
                });

                dirtyOverlay.append(dirtyCard);
                var mountContainer = dialog.find('.s4t-sheet-grid-container');
                if (!mountContainer.length) mountContainer = dialog.find('.s4t-sheet-grid-wrapper');
                mountContainer.append(dirtyOverlay);

                var syncDirtyWidth = function () {
                    var tableEl = dialog.find('#s4t-sheet-table');
                    var tw = tableEl.outerWidth() || (tableEl[0] ? tableEl[0].scrollWidth : 0);
                    var ww = dialog.find('.s4t-sheet-grid-wrapper').outerWidth() || 0;
                    var w = Math.max(tw, ww);
                    if (w > 0 && mountContainer.hasClass('s4t-sheet-grid-wrapper')) {
                        dirtyOverlay.css('min-width', w + 'px');
                    }
                };
                syncDirtyWidth();
                setTimeout(syncDirtyWidth, 50);
                return;
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
                    var td = $('<td class="s4t-sheet-cell">');
                    var cellKey = card.id + '_' + col.id;
                    var baseVal = s4tExtractFieldValue(card, col.source, state.lookup);
                    var val = (state.editedCells && state.editedCells[cellKey] !== undefined)
                        ? state.editedCells[cellKey]
                        : baseVal;
                    var cellType = col.cellType || 'text';

                    if (col.hidden) {
                        td.addClass('s4t-sheet-cell-hidden');
                        var displayVal = val || '';
                        var hiddenSpan = $('<span class="s4t-sheet-hidden-placeholder">');
                        if (displayVal) {
                            hiddenSpan.text(displayVal).attr('title', displayVal + ' (Hidden from export - read-only)');
                        } else {
                            hiddenSpan.text('— Hidden —').attr('title', 'Hidden from export');
                        }
                        td.append(hiddenSpan);
                        tr.append(td);
                        return;
                    }

                    if (cellType === 'checkbox') {
                        var chkWid = $('<label class="s4t-sheet-cell-checkbox-wrap">');
                        var isChecked = val === 'Done' || val === '3/5' || val === 'true';
                        var inp = $('<input type="checkbox" class="s4t-sheet-cell-checkbox">').prop('checked', isChecked);
                        var chkTxt = $('<span class="s4t-sheet-cell-checkbox-label">').text(val ? val : (isChecked ? 'Done' : 'Pending'));
                        inp.on('change', function () {
                            var checkedVal = this.checked ? 'Done' : 'Pending';
                            chkTxt.text(checkedVal);
                            state.editedCells = state.editedCells || {};
                            state.editedCells[cellKey] = checkedVal;
                        });
                        chkWid.append(inp, chkTxt);
                        td.append(chkWid);
                    } else if (cellType === 'dev_select') {
                        td.addClass('s4t-sheet-cell-has-dropdown');
                        var devSel = $('<select class="s4t-sheet-cell-select" aria-label="Assignee">');
                        devSel.append($('<option value="">').text('-- Select Dev --'));
                        var isDevCellEdited = !!(state.editedCells && state.editedCells[cellKey] !== undefined);
                        var isDevTitleLeak = (col.source === 'title' || col.source === 'title_raw') && !isDevCellEdited;
                        var effectiveDevVal = isDevTitleLeak ? '' : (val || '');
                        var matchedDev = false;
                        (state.boardData.members || []).forEach(function (m) {
                            var mName = m.fullName || m.username || '';
                            if (!mName) return;
                            var opt = $('<option>').val(mName).text(mName);
                            if (effectiveDevVal && (effectiveDevVal.toLowerCase() === mName.toLowerCase() || effectiveDevVal.toLowerCase().includes(mName.toLowerCase()))) {
                                opt.prop('selected', true);
                                matchedDev = true;
                            }
                            devSel.append(opt);
                        });
                        if (effectiveDevVal && !matchedDev && (isDevCellEdited || col.source === 'members' || col.source === 'member_names')) {
                            var customDevOpt = $('<option>').val(effectiveDevVal).text(effectiveDevVal).prop('selected', true);
                            devSel.append(customDevOpt);
                        }
                        devSel.on('change', function () {
                            state.editedCells = state.editedCells || {};
                            state.editedCells[cellKey] = $(this).val();
                        });
                        td.append(devSel);
                        attachDropdownHover(devSel);
                    } else if (cellType === 'custom_select') {
                        td.addClass('s4t-sheet-cell-has-dropdown');
                        var custSel = $('<select class="s4t-sheet-cell-select" aria-label="Role / Value">');
                        var optList = s4tParseCustomOptions(col.customOptions);
                        var isCellEdited = !!(state.editedCells && state.editedCells[cellKey] !== undefined);
                        var isTitleLeak = (col.source === 'title' || col.source === 'title_raw' || col.id === 'c_status' || (col.header && col.header.trim().toLowerCase() === 'status')) && !isCellEdited;
                        var isPoCol = col.source === 'product_owner' || (col.header && col.header.trim().toLowerCase() === 'product owner') || col.id === 'c_po_owner';
                        var hasMatched = false;
                        if (val && !isTitleLeak) {
                            hasMatched = optList.some(function (optVal) {
                                return optVal.toLowerCase() === val.toLowerCase();
                            });
                            if (!hasMatched) {
                                optList.unshift(val);
                            }
                        }
                        if ((!val || isTitleLeak) && (col.source === 'blank' || isTitleLeak)) {
                            custSel.append($('<option value="">').text('-- Select --').prop('selected', true));
                        } else if ((!val || isTitleLeak) && isPoCol) {
                            custSel.append($('<option value="">').text('-- Select PO --').prop('selected', true));
                        }
                        optList.forEach(function (optVal) {
                            var opt = $('<option>').val(optVal).text(optVal);
                            if (val && !isTitleLeak && val.toLowerCase() === optVal.toLowerCase()) {
                                opt.prop('selected', true);
                            }
                            custSel.append(opt);
                        });
                        custSel.on('change', function () {
                            state.editedCells = state.editedCells || {};
                            state.editedCells[cellKey] = $(this).val();
                        });
                        td.append(custSel);
                        attachDropdownHover(custSel);
                    } else if (col.source === 'blank') {
                        var cellInp = $('<input type="text" class="s4t-sheet-cell-input" placeholder="—" aria-label="' + s4tEscapeHtml(col.header || 'Comment') + '" draggable="false">')
                            .val(val || '');
                        cellInp.on('dragstart', function (e) {
                            e.stopPropagation();
                            return false;
                        });
                        cellInp.on('input change', function () {
                            state.editedCells = state.editedCells || {};
                            state.editedCells[cellKey] = $(this).val();
                        });
                        td.append(cellInp);
                    } else {
                        td.text(val);
                    }
                    if (val && cellType !== 'dev_select' && cellType !== 'custom_select' && col.source !== 'blank') td.attr('title', val);
                    tr.append(td);
                });
                // Empty cell under "+ Add Column"
                tr.append($('<td class="s4t-sheet-cell s4t-sheet-cell-empty">&nbsp;</td>'));
                tbody.append(tr);
            });

            // Note footer row inside table
            var noteTr = $('<tr class="s4t-sheet-note-row">');
            var noteText = 'Showing preview of first ' + sampleCards.length + ' cards (' + state.filteredCards.length + ' total cards will be exported).' +
                (state.insertSeparatorRow ? ' • Group line breaks enabled.' : '');
            var noteTd = $('<td colspan="' + totalColSpan + '">');
            var noteContent = $('<span class="s4t-sheet-note-content">').text(noteText);
            noteTd.append(noteContent);
            noteTr.append(noteTd);
            tbody.append(noteTr);
        }

        var draggedIdx = null;

        function bindColumnDragEvents(th, idx) {
            var col = state.columns[idx];
            if (col && col.hidden) {
                th.attr('draggable', 'false');
                return;
            }

            // Keep draggable false by default so that clicking or selecting text in inputs
            // never initiates an HTML5 drag on the parent column.
            th.attr('draggable', 'false');

            var isDragging = false;

            // Only enable draggable on TH when mouse is pressed on a non-input area of the card
            th.on('mousedown', function (e) {
                if (col && col.hidden) return;
                var target = e.target;
                if (target && target.closest && target.closest('input, textarea, select, button, .s4t-custom-dropdown, .s4t-custom-dropdown-trigger, .s4t-custom-dropdown-menu, .s4t-sheet-col-hide, .s4t-sheet-col-del')) {
                    th.attr('draggable', 'false');
                    return;
                }
                th.attr('draggable', 'true');
            });

            // Revert draggable to false if mouse is released or leaves without dragging
            th.on('mouseup mouseleave', function () {
                if (!isDragging && draggedIdx === null) {
                    th.attr('draggable', 'false');
                }
            });

            // Ensure draggable remains strictly false whenever hovering or focusing input elements
            th.find('input, textarea, select, button, .s4t-custom-dropdown').on('mouseenter focus mousedown', function () {
                th.attr('draggable', 'false');
            });

            th.on('dragstart', function (e) {
                var target = e.target;
                if (target && target.closest && target.closest('input, textarea, select, button, .s4t-custom-dropdown')) {
                    e.preventDefault();
                    if (e.originalEvent && e.originalEvent.stopPropagation) {
                        e.originalEvent.stopPropagation();
                    }
                    th.attr('draggable', 'false');
                    return false;
                }
                if (th.attr('draggable') !== 'true') {
                    e.preventDefault();
                    return false;
                }
                isDragging = true;
                draggedIdx = idx;
                dialog.addClass('s4t-is-dragging-col');
                if (window.requestAnimationFrame) {
                    window.requestAnimationFrame(function () {
                        th.addClass('s4t-col-dragging');
                    });
                } else {
                    setTimeout(function () {
                        th.addClass('s4t-col-dragging');
                    }, 0);
                }
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.setData('text/plain', String(idx));
                    e.originalEvent.dataTransfer.setData('text/col-idx', String(idx));
                    e.originalEvent.dataTransfer.effectAllowed = 'move';
                }
            });

            th.on('dragend', function () {
                draggedIdx = null;
                isDragging = false;
                dialog.removeClass('s4t-is-dragging-col');
                th.attr('draggable', 'false');
                dialog.find('.s4t-sheet-th, .s4t-sheet-th-add').removeClass('s4t-col-dragging s4t-col-dragover s4t-col-drop-before s4t-col-drop-after');
            });

            th.on('dragenter dragover', function (e) {
                e.preventDefault();
                if (draggedIdx === null) return false;
                if (e.originalEvent && e.originalEvent.dataTransfer) {
                    e.originalEvent.dataTransfer.dropEffect = 'move';
                }

                var rect = this.getBoundingClientRect();
                var clientX = (e.clientX !== undefined && e.clientX !== 0) ? e.clientX : (e.originalEvent && e.originalEvent.clientX ? e.originalEvent.clientX : 0);
                var relX = clientX - rect.left;
                var isAfter = relX > (rect.width / 2);

                dialog.find('.s4t-sheet-th, .s4t-sheet-th-add').removeClass('s4t-col-drop-before s4t-col-drop-after');

                $(this).addClass('s4t-col-dragover');
                if (isAfter) {
                    $(this).addClass('s4t-col-drop-after');
                } else {
                    $(this).addClass('s4t-col-drop-before');
                }
                return false;
            });

            th.on('dragleave', function (e) {
                var rect = this.getBoundingClientRect();
                var oe = e.originalEvent;
                if (oe && (oe.clientX < rect.left || oe.clientX >= rect.right || oe.clientY < rect.top || oe.clientY >= rect.bottom)) {
                    $(this).removeClass('s4t-col-dragover s4t-col-drop-before s4t-col-drop-after');
                }
            });

            th.on('drop', function (e) {
                e.preventDefault();
                if (e.originalEvent && e.originalEvent.stopPropagation) {
                    e.originalEvent.stopPropagation();
                }
                var isAfter = $(this).hasClass('s4t-col-drop-after');
                dialog.removeClass('s4t-is-dragging-col');
                dialog.find('.s4t-sheet-th, .s4t-sheet-th-add').removeClass('s4t-col-dragover s4t-col-dragging s4t-col-drop-before s4t-col-drop-after');
                th.attr('draggable', 'false');

                var fromIdx = draggedIdx;
                if ((fromIdx === null || isNaN(fromIdx)) && e.originalEvent && e.originalEvent.dataTransfer) {
                    var dt = e.originalEvent.dataTransfer.getData('text/col-idx') || e.originalEvent.dataTransfer.getData('text/plain');
                    if (dt !== '') fromIdx = parseInt(dt, 10);
                }
                var targetTh = $(this).closest('.s4t-sheet-th');
                var targetIdx = (targetTh.length && targetTh.attr('data-col-idx') !== undefined) ? parseInt(targetTh.attr('data-col-idx'), 10) : idx;

                if (fromIdx !== null && !isNaN(fromIdx) && targetIdx !== null && !isNaN(targetIdx) && fromIdx >= 0 && targetIdx >= 0 && fromIdx < state.columns.length && targetIdx < state.columns.length) {
                    var toIdx = targetIdx;
                    if (fromIdx < targetIdx) {
                        toIdx = isAfter ? targetIdx : (targetIdx - 1);
                    } else if (fromIdx > targetIdx) {
                        toIdx = isAfter ? (targetIdx + 1) : targetIdx;
                    }

                    if (fromIdx !== toIdx && toIdx >= 0 && toIdx < state.columns.length) {
                        var movedCol = state.columns.splice(fromIdx, 1)[0];
                        state.columns.splice(toIdx, 0, movedCol);
                        state.previewDirty = true;
                        saveConfig();
                        renderSheetTableContent();
                        updateColumnsCountBadge();
                        updateActionButtonsState();
                    }
                }
                draggedIdx = null;
                isDragging = false;
                return false;
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
                '  <label class="s4t-sheet-topbar-toggle s4t-export-separator-toggle" data-tooltip="Insert an empty line break row between groups (e.g. per developer or list)">',
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
            // Columns Grid modeled strictly after Attention panel (.s4t-export-att-columns)
            var columnsGrid = $('<div class="s4t-export-att-columns">');

            var attInfoSvg = '<svg class="s4t-att-info-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
            function makeAttInfoIcon(label, tooltip) {
                return $('<span class="s4t-att-info-icon" tabindex="0" role="button" aria-label="' + s4tEscapeHtml(label) + '" data-tooltip="' + s4tEscapeHtml(tooltip) + '"></span>').append(attInfoSvg);
            }

            // 1. Members Column (Column 1)
            var membersCol = $('<div class="s4t-export-att-col">');
            var membersHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<div class="s4t-export-att-heading-title">').append(
                    $('<h4>').text('Members'),
                    makeAttInfoIcon('Members details', 'Match any selected member. All members are included by default.')
                ),
                $('<div class="s4t-export-att-list-groups s4t-export-att-member-group">')
            );
            membersCol.append(membersHead);

            var allMemberIds = ['__unassigned__'].concat((state.boardData.members || []).map(function (m) { return m.id; }));

            function updateMemberGroupToggle() {
                var includedCount = allMemberIds.filter(function (id) { return !state.excludedMemberIds.has(id); }).length;
                var input = membersHead.find('[data-member-group="all"]')[0];
                if (input) {
                    input.checked = allMemberIds.length > 0 && includedCount === allMemberIds.length;
                    input.indeterminate = includedCount > 0 && includedCount < allMemberIds.length;
                    input.disabled = allMemberIds.length === 0;
                }
            }

            var allMembersInput = $('<input type="checkbox" data-member-group="all" aria-label="All members">');
            allMembersInput.on('change', function () {
                var isChecked = this.checked;
                if (isChecked) {
                    state.excludedMemberIds.clear();
                } else {
                    allMemberIds.forEach(function (id) {
                        state.excludedMemberIds.add(id);
                    });
                }
                membersScroll.find('[data-member-toggle]').each(function () {
                    this.checked = isChecked;
                });
                updateMemberGroupToggle();
                renderExcludeLists();
                onExclusionsChanged();
            });

            membersHead.find('.s4t-export-att-member-group').append(
                $('<label class="s4t-export-att-group-toggle" data-tooltip="All members (' + allMemberIds.length + ')">')
                    .append(allMembersInput)
                    .on('mousedown pointerdown', function () { $(this).addClass('s4t-tooltip-dismissed'); })
                    .on('mouseleave focusout', function () { $(this).removeClass('s4t-tooltip-dismissed'); })
            );

            var membersScroll = $('<div class="s4t-export-att-members">');
            var unassignedOpt = $('<label class="s4t-export-att-option">');
            var unassignedIncluded = !state.excludedMemberIds.has('__unassigned__');
            var unassignedChk = $('<input type="checkbox" data-member-toggle="__unassigned__"' + (unassignedIncluded ? ' checked' : '') + '>');
            unassignedChk.on('change', function () {
                if (this.checked) state.excludedMemberIds.delete('__unassigned__');
                else state.excludedMemberIds.add('__unassigned__');
                updateMemberGroupToggle();
                renderExcludeLists();
                onExclusionsChanged();
            });
            unassignedOpt.append(unassignedChk, $('<span><em>(Unassigned cards)</em></span>'));
            membersScroll.append(unassignedOpt);

            (state.boardData.members || []).forEach(function (m) {
                var isIncluded = !state.excludedMemberIds.has(m.id);
                var opt2 = $('<label class="s4t-export-att-option">');
                var chk2 = $('<input type="checkbox" data-member-toggle="' + s4tEscapeHtml(m.id) + '"' + (isIncluded ? ' checked' : '') + '>');
                chk2.on('change', function () {
                    if (this.checked) state.excludedMemberIds.delete(m.id);
                    else state.excludedMemberIds.add(m.id);
                    updateMemberGroupToggle();
                    renderExcludeLists();
                    onExclusionsChanged();
                });
                opt2.append(chk2, $('<span>').text(m.fullName || m.username));
                membersScroll.append(opt2);
            });
            membersCol.append(membersScroll);
            updateMemberGroupToggle();
            columnsGrid.append(membersCol);

            // 2. Exclude lists Column (Column 2 - modeled after Attention filters 3rd column)
            var listsCol = $('<div class="s4t-export-att-col">');
            var listsHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<div class="s4t-export-att-heading-title">').append(
                    $('<h4>').text('Exclude lists'),
                    makeAttInfoIcon('Exclude lists details', 'Cards in checked lists are excluded from export.')
                ),
                $('<div class="s4t-export-att-list-groups">')
            );
            listsCol.append(listsHead);

            function getMemberLists(boardData, excludedMemberIds) {
                if (!boardData || !Array.isArray(boardData.lists)) return [];
                var allLists = boardData.lists.filter(function (l) { return !l.closed; });
                var allCards = (boardData.cards || []).filter(function (c) { return !c.closed; });
                var allMemIds = ['__unassigned__'].concat((boardData.members || []).map(function (m) { return m.id; }));
                var includedCount = allMemIds.filter(function (id) { return !excludedMemberIds.has(id); }).length;
                if (includedCount === 0) return [];
                if (!allCards.length) return allLists;

                var listIdsWithCards = new Set();
                allCards.forEach(function (card) {
                    var cardMembers = card.idMembers || [];
                    var matches = false;
                    if (cardMembers.length === 0) {
                        matches = !excludedMemberIds.has('__unassigned__');
                    } else {
                        matches = cardMembers.some(function (id) { return !excludedMemberIds.has(id); });
                    }
                    if (matches) {
                        listIdsWithCards.add(card.idList);
                    }
                });
                return allLists.filter(function (list) { return listIdsWithCards.has(list.id); });
            }

            function groupLists(group) {
                var all = getMemberLists(state.boardData, state.excludedMemberIds);
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

            var listGroups = [
                { key: 'all', name: 'All lists' },
                { key: 'todo', name: 'All Todo lists' },
                { key: 'not-sure', name: 'All Not Sure lists' }
            ];

            function renderListGroupToggles() {
                var groupsContainer = listsHead.find('.s4t-export-att-list-groups').empty();
                listGroups.forEach(function (group) {
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
                        .append(input)
                        .on('mousedown pointerdown', function () { $(this).addClass('s4t-tooltip-dismissed'); })
                        .on('mouseleave focusout', function () { $(this).removeClass('s4t-tooltip-dismissed'); });
                    groupsContainer.append(toggleLabel);
                });
                updateListGroupToggles();
            }

            var listsScroll = $('<div class="s4t-export-att-lists">');

            function renderExcludeLists() {
                var availableLists = getMemberLists(state.boardData, state.excludedMemberIds);
                var allMemIds = ['__unassigned__'].concat((state.boardData.members || []).map(function (m) { return m.id; }));
                var includedCount = allMemIds.filter(function (id) { return !state.excludedMemberIds.has(id); }).length;
                listsScroll.empty();

                if (includedCount === 0) {
                    listsScroll.append($('<p class="s4t-export-att-note" role="status">').text('NOTE: - No members selected. Select a member to see available lists.'));
                } else if (!availableLists.length) {
                    listsScroll.append($('<p class="s4t-export-att-note" role="status">').text('No lists found for the selected members.'));
                } else {
                    availableLists.forEach(function (l) {
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
                }
                renderListGroupToggles();
            }

            listsCol.append(listsScroll);
            renderExcludeLists();
            columnsGrid.append(listsCol);

            // 3. Labels Column (Column 3)
            var labelsCol = $('<div class="s4t-export-att-col">');
            var labelsHead = $('<div class="s4t-export-att-column-heading">').append(
                $('<div class="s4t-export-att-heading-title">').append(
                    $('<h4>').text('Labels'),
                    makeAttInfoIcon('Labels details', 'Match any selected label. All labels and unlabeled cards are included by default.')
                ),
                $('<div class="s4t-export-att-list-groups s4t-export-att-label-group">')
            );
            labelsCol.append(labelsHead);

            var LABEL_COLORS = {
                green: '#4bce97',
                yellow: '#f5cd47',
                orange: '#fea362',
                red: '#f87168',
                purple: '#9f8fef',
                blue: '#579dff',
                sky: '#6cc3e0',
                lime: '#94c748',
                pink: '#e774bb',
                black: '#8590a2'
            };

            var allLabelKeys = ['__unlabeled__'].concat((state.boardData.labels || []).map(function (lb) { return lb.id || lb.name; }));

            function updateLabelGroupToggle() {
                var includedCount = allLabelKeys.filter(function (k) { return !state.excludedLabelIds.has(k); }).length;
                var input = labelsHead.find('[data-label-group="all"]')[0];
                if (input) {
                    input.checked = allLabelKeys.length > 0 && includedCount === allLabelKeys.length;
                    input.indeterminate = includedCount > 0 && includedCount < allLabelKeys.length;
                    input.disabled = allLabelKeys.length === 0;
                }
            }

            var allLabelsInput = $('<input type="checkbox" data-label-group="all" aria-label="All labels">');
            allLabelsInput.on('change', function () {
                var isChecked = this.checked;
                if (isChecked) {
                    state.excludedLabelIds.clear();
                } else {
                    allLabelKeys.forEach(function (k) {
                        state.excludedLabelIds.add(k);
                    });
                }
                labelsScroll.find('[data-label-toggle]').each(function () {
                    this.checked = isChecked;
                });
                updateLabelGroupToggle();
                onExclusionsChanged();
            });

            labelsHead.find('.s4t-export-att-label-group').append(
                $('<label class="s4t-export-att-group-toggle" data-tooltip="All labels (' + allLabelKeys.length + ')">')
                    .append(allLabelsInput)
                    .on('mousedown pointerdown', function () { $(this).addClass('s4t-tooltip-dismissed'); })
                    .on('mouseleave focusout', function () { $(this).removeClass('s4t-tooltip-dismissed'); })
            );

            var labelsScroll = $('<div class="s4t-export-att-labels">');
            var unlabeledOpt = $('<label class="s4t-export-att-option">');
            var unlabeledIncluded = !state.excludedLabelIds.has('__unlabeled__');
            var unlabeledChk = $('<input type="checkbox" data-label-toggle="__unlabeled__"' + (unlabeledIncluded ? ' checked' : '') + '>');
            unlabeledChk.on('change', function () {
                if (this.checked) state.excludedLabelIds.delete('__unlabeled__');
                else state.excludedLabelIds.add('__unlabeled__');
                updateLabelGroupToggle();
                onExclusionsChanged();
            });
            var unlabeledDot = $('<span class="s4t-export-att-label-dot s4t-label-dot-none" aria-hidden="true">');
            unlabeledOpt.append(unlabeledChk, unlabeledDot, $('<span><em>(Cards with no label)</em></span>'));
            labelsScroll.append(unlabeledOpt);

            (state.boardData.labels || []).forEach(function (lb) {
                var key = lb.id || lb.name;
                var isIncluded = !state.excludedLabelIds.has(key);
                var opt3 = $('<label class="s4t-export-att-option">');
                var chk3 = $('<input type="checkbox" data-label-toggle="' + s4tEscapeHtml(key) + '"' + (isIncluded ? ' checked' : '') + '>');
                chk3.on('change', function () {
                    if (this.checked) state.excludedLabelIds.delete(key);
                    else state.excludedLabelIds.add(key);
                    updateLabelGroupToggle();
                    onExclusionsChanged();
                });
                var colorKey = (lb.color || '').split('_')[0].toLowerCase();
                var colorHex = LABEL_COLORS[colorKey] || '#8590a2';
                var dot = $('<span class="s4t-export-att-label-dot" aria-hidden="true">').css('background-color', colorHex);
                var labelName = lb.name || (lb.color ? lb.color.replace(/_/g, ' ') + ' (unnamed)' : 'Unnamed label');
                opt3.append(chk3, dot, $('<span>').text(labelName));
                labelsScroll.append(opt3);
            });
            labelsCol.append(labelsScroll);
            updateLabelGroupToggle();
            columnsGrid.append(labelsCol);

            container.append(columnsGrid);

            // Bind sort select
            var sortSelect = header.find('#s4t-sort-select');
            attachDropdownHover(sortSelect);
            sortSelect.on('change', function () {
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
                '<div class="s4t-export-footer-left">',
                '  <span class="s4t-sheet-col-count-badge" id="s4t-sheet-col-count"></span>',
                '</div>',
                '<div class="s4t-export-footer-status" id="s4t-export-toast" hidden></div>',
                '<div class="s4t-export-footer-buttons">',
                '  <button type="button" class="s4t-btn s4t-btn-secondary" id="s4t-btn-copy-tsv" data-tooltip="Copy tab-separated table to clipboard for instant Google Sheets paste">📋 Copy for Google Sheets</button>',
                '  <div class="s4t-split-download-group">',
                '    <button type="button" class="s4t-btn s4t-btn-primary" id="s4t-btn-main-download">📊 Download Excel (.xls)</button>',
                '    <button type="button" class="s4t-btn s4t-btn-primary s4t-split-arrow" id="s4t-btn-format-toggle" data-tooltip="Select format (Excel / CSV)" aria-label="Select format" aria-haspopup="true" aria-expanded="false">▾</button>',
                '    <div class="s4t-split-menu" id="s4t-format-menu" role="menu" hidden>',
                '      <button type="button" class="s4t-split-item" data-fmt="excel" role="menuitem">📊 Excel Spreadsheet (.xls)</button>',
                '      <button type="button" class="s4t-split-item" data-fmt="csv" role="menuitem">📄 CSV File (.csv)</button>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join(''));

            dialog.append(footer);
            updateColumnsCountBadge();
            bindFooterEvents();
            updateActionButtonsState();
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
                    sortBy: state.sortBy,
                    editedCells: state.editedCells || {}
                };
            };

            // Copy for Google Sheets (instant TSV copy of all cards)
            dialog.find('#s4t-btn-copy-tsv').on('click', function () {
                var valErr = getFirstValidationError();
                if (valErr) {
                    dialog.find('.s4t-input-required-error:first').focus();
                    if (valErr.type === 'missing_po') {
                        showToast('⚠️ Required: Please fill in Product Owner options before copying table.');
                    } else if (valErr.type === 'missing_cs') {
                        showToast('⚠️ Required: Please fill in CS Owner options before copying table.');
                    } else {
                        showToast('⚠️ Required: Please fill in custom options before copying table.');
                    }
                    return;
                }
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

            // Toggle format menu (click, hover, and mousedown)
            var splitGroup = dialog.find('.s4t-split-download-group');
            var formatToggle = dialog.find('#s4t-btn-format-toggle');
            var formatMenu = dialog.find('#s4t-format-menu');

            var splitHoverTimer;
            splitGroup.on('mouseenter', function () {
                if (hasValidationErrors()) {
                    formatMenu.prop('hidden', true);
                    return;
                }
                clearTimeout(splitHoverTimer);
                formatMenu.prop('hidden', false);
                formatToggle.attr('aria-expanded', 'true');
            }).on('mouseleave', function () {
                splitHoverTimer = setTimeout(function () {
                    formatMenu.prop('hidden', true);
                    formatToggle.attr('aria-expanded', 'false');
                }, 150);
            });

            formatToggle.on('mousedown', function (e) {
                e.preventDefault();
            });

            formatToggle.on('click', function (e) {
                e.stopPropagation();
                if (hasValidationErrors()) {
                    dialog.find('.s4t-input-required-error:first').focus();
                    showToast('⚠️ Required: Please fill in custom options before choosing export format.');
                    return;
                }
                formatMenu.prop('hidden', false);
                $(this).attr('aria-expanded', 'true');
            });

            $(document).off('click.s4tFormatMenuClose').on('click.s4tFormatMenuClose', function () {
                formatMenu.prop('hidden', true);
                formatToggle.attr('aria-expanded', 'false');
            });

            // Format selection
            dialog.find('.s4t-split-item').on('mousedown', function (e) {
                e.preventDefault();
            });
            dialog.find('.s4t-split-item').on('click', function () {
                var valErr = getFirstValidationError();
                if (valErr) {
                    dialog.find('.s4t-input-required-error:first').focus();
                    if (valErr.type === 'missing_po') {
                        showToast('⚠️ Required: Please fill in Product Owner options before choosing export format.');
                    } else if (valErr.type === 'missing_cs') {
                        showToast('⚠️ Required: Please fill in CS Owner options before choosing export format.');
                    } else {
                        showToast('⚠️ Required: Please fill in custom options before choosing export format.');
                    }
                    return;
                }
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
                var valErr = getFirstValidationError();
                if (valErr) {
                    dialog.find('.s4t-input-required-error:first').focus();
                    if (valErr.type === 'missing_po') {
                        showToast('⚠️ Required: Please fill in Product Owner options before downloading file.');
                    } else if (valErr.type === 'missing_cs') {
                        showToast('⚠️ Required: Please fill in CS Owner options before downloading file.');
                    } else {
                        showToast('⚠️ Required: Please fill in custom options before downloading file.');
                    }
                    return;
                }
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

        // Setup Window Focus Sync: Re-sync dot labels when switching back to tab/window
        $(window).off('focus.s4tExportSync').on('focus.s4tExportSync', function () {
            if (!dialog.is(':visible')) return;
            var currentDotLabels = s4tGetDotLabels(state.boardData);
            var currentDotStr = currentDotLabels.join(', ');
            var changed = false;
            state.columns.forEach(function (c) {
                if (c.source === 'product_owner' || (c.header && c.header.trim().toLowerCase() === 'product owner') || c.id === 'c_po_owner') {
                    if (currentDotStr && c.customOptions !== currentDotStr) {
                        c.customOptions = currentDotStr;
                        changed = true;
                    }
                }
            });
            if (changed) {
                saveConfig();
                renderSheetTableContent();
                updateActionButtonsState();
            }
            if (typeof fetchBoardData === 'function' && boardShortLink) {
                fetchBoardData(boardShortLink, true, function (err, freshData) {
                    if (!err && freshData) {
                        setupLookup(freshData);
                    }
                });
            }
        });

        // Fetch Board Data
        if (state.boardData) {
            setupLookup(state.boardData);
            if (typeof fetchBoardData === 'function' && boardShortLink) {
                fetchBoardData(boardShortLink, true, function (err, freshData) {
                    if (!err && freshData) {
                        setupLookup(freshData);
                    }
                });
            }
        } else if (typeof fetchBoardData === 'function') {
            fetchBoardData(boardShortLink, true, function (err, data) {
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
        s4tFilterAndSortCards: s4tFilterAndSortCards,
        s4tParseCustomOptions: s4tParseCustomOptions,
        s4tGetDotLabels: s4tGetDotLabels
    };
}));
