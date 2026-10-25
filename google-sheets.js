/* Google Sheets Webhook Integration for Sprint Helper */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.s4tOpenGoogleSheetsModal = api.s4tOpenGoogleSheetsModal;
        root.s4tPushToGoogleSheet = api.s4tPushToGoogleSheet;
        root.s4tGetBoardSheetTab = api.s4tGetBoardSheetTab;
        root.s4tSaveBoardSheetTab = api.s4tSaveBoardSheetTab;
        root.s4tGetSheetsDeploymentId = api.s4tGetSheetsDeploymentId;
        root.s4tSaveSheetsDeploymentId = api.s4tSaveSheetsDeploymentId;
        root.s4tIsSheetsVerified = api.s4tIsSheetsVerified;
        root.s4tSetSheetsVerified = api.s4tSetSheetsVerified;
        root.s4tNormalizeSheetsWebhookUrl = api.s4tNormalizeSheetsWebhookUrl;
        root.generateSheetTabCandidates = api.generateSheetTabCandidates;
        root.s4tExtractBoardDateCandidate = api.s4tExtractBoardDateCandidate;
        root.s4tFormatDeveloperRecords = api.s4tFormatDeveloperRecords;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    var cachedDeploymentId = '';
    try {
        cachedDeploymentId = (localStorage.getItem('s4t_sheets_deployment_id') || '').trim();
    } catch (_) {}

    function s4tNormalizeSheetsWebhookUrl(raw) {
        var input = String(raw || '').trim();
        if (!input) return '';
        if (input.startsWith('https://script.google.com/macros/s/') && input.endsWith('/exec')) {
            return input;
        }
        if (input.startsWith('https://script.google.com/macros/s/')) {
            return input.replace(/\/+$/, '') + '/exec';
        }
        var idMatch = input.match(/^([A-Za-z0-9_\-]+)$/);
        if (idMatch) {
            return 'https://script.google.com/macros/s/' + idMatch[1] + '/exec';
        }
        return input;
    }

    function generateSheetTabCandidates(rawRelease) {
        var base = String(rawRelease || '').trim();
        var set = new Set();
        if (base) set.add(base);

        var dateMatch = base.match(/(\d{1,2})[\s\-_]+([A-Za-z]+)[\s\-_]+(\d{2,4})/);
        if (dateMatch) {
            var day = parseInt(dateMatch[1], 10);
            var dayPadded = String(day).padStart(2, '0');
            var month = dateMatch[2];
            var yearFull = dateMatch[3].length === 2 ? '20' + dateMatch[3] : dateMatch[3];
            var yearShort = yearFull.slice(-2);

            var monthMap = {
                jan: 'January', feb: 'February', mar: 'March', apr: 'April',
                may: 'May', jun: 'June', jul: 'July', aug: 'August',
                sep: 'September', sept: 'September', oct: 'October', nov: 'November', dec: 'December'
            };

            var monthPrefix = month.toLowerCase().slice(0, 3);
            var fullMonth = monthMap[monthPrefix] || month;
            var shortMonth = month.slice(0, 3);

            set.add(dayPadded + ' ' + fullMonth + ' ' + yearFull);      // 02 September 2026
            set.add(day + ' ' + fullMonth + ' ' + yearFull);            // 2 September 2026
            set.add(dayPadded + ' ' + shortMonth + ' ' + yearFull);     // 02 Sep 2026
            set.add(day + ' ' + shortMonth + ' ' + yearFull);           // 2 Sep 2026
            set.add(dayPadded + ' ' + shortMonth + ' ' + yearShort);    // 02 Sep 26
            set.add(day + ' ' + shortMonth + ' \'' + yearShort);        // 2 Sep '26
            set.add(dayPadded + '-' + shortMonth + '-' + yearFull);     // 02-Sep-2026
            set.add('Release ' + dayPadded + ' ' + shortMonth + ' ' + yearFull);
        }

        return Array.from(set);
    }

    function s4tExtractBoardDateCandidate(boardName) {
        var text = String(boardName || '').trim();
        if (!text) return '';
        var match = text.match(/(\d{1,2})(?:st|nd|rd|th)?[\s_/-]*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\s_/-]*(\d{4})/i);
        if (match) {
            var day = String(parseInt(match[1], 10)).padStart(2, '0');
            var monthPrefix = match[2].slice(0, 3).toLowerCase();
            var monthMap = {
                jan: 'September', feb: 'February', mar: 'March', apr: 'April',
                may: 'May', jun: 'June', jul: 'July', aug: 'August',
                sep: 'September', oct: 'October', nov: 'November', dec: 'December'
            };
            monthMap.jan = 'January';
            var fullMonth = monthMap[monthPrefix] || match[2];
            return day + ' ' + fullMonth + ' ' + match[3];
        }
        return text;
    }

    function s4tGetBoardSheetTab(boardId) {
        if (!boardId) return '';
        try {
            return localStorage.getItem('s4t_sheets_tab_' + boardId) || '';
        } catch (_) {
            return '';
        }
    }

    function s4tSaveBoardSheetTab(boardId, tabName) {
        if (!boardId) return;
        var val = String(tabName || '').trim();
        try {
            if (val) {
                localStorage.setItem('s4t_sheets_tab_' + boardId, val);
            } else {
                localStorage.removeItem('s4t_sheets_tab_' + boardId);
            }
        } catch (_) {}

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            var obj = {}; obj['s4t_sheets_tab_' + boardId] = val;
            chrome.storage.sync.set(obj, function () {});
        }
    }

    function s4tRefreshDeploymentId(cb) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            chrome.storage.sync.get(['s4t_sheets_deployment_id', 'sheetsDeploymentId', 's4t_sheets_verified'], function (res) {
                if (res) {
                    var val = res.s4t_sheets_deployment_id || res.sheetsDeploymentId || '';
                    if (val) {
                        cachedDeploymentId = val.trim();
                        try { localStorage.setItem('s4t_sheets_deployment_id', cachedDeploymentId); } catch (_) {}
                    }
                    if (res.s4t_sheets_verified) {
                        try { localStorage.setItem('s4t_sheets_verified', 'true'); } catch (_) {}
                    }
                }
                if (cb) cb(s4tGetSheetsDeploymentId());
            });
        } else if (cb) {
            cb(s4tGetSheetsDeploymentId());
        }
    }

    function s4tGetSheetsDeploymentId() {
        if (cachedDeploymentId) return cachedDeploymentId;
        if (typeof s4tPreferences !== 'undefined' && s4tPreferences.sheetsDeploymentId) {
            var prefVal = s4tPreferences.sheetsDeploymentId();
            if (prefVal) return prefVal.trim();
        }
        try {
            var val = localStorage.getItem('s4t_sheets_deployment_id');
            if (val) return val.trim();
        } catch (_) {}
        return '';
    }

    function s4tIsSheetsVerified() {
        var depId = s4tGetSheetsDeploymentId();
        if (!depId) return false;
        try {
            var isVer = localStorage.getItem('s4t_sheets_verified');
            if (isVer === 'true' || isVer === '1') return true;
        } catch (_) {}
        if (typeof s4tPreferences !== 'undefined' && typeof s4tPreferences.isSheetsVerified === 'function') {
            return s4tPreferences.isSheetsVerified();
        }
        return false;
    }

    function s4tSetSheetsVerified(verified) {
        try {
            if (verified) localStorage.setItem('s4t_sheets_verified', 'true');
            else localStorage.removeItem('s4t_sheets_verified');
        } catch (_) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            if (verified) chrome.storage.sync.set({ s4t_sheets_verified: true }, function () {});
            else chrome.storage.sync.remove(['s4t_sheets_verified'], function () {});
        }
    }

    function s4tSaveSheetsDeploymentId(val) {
        var cleanVal = String(val || '').trim();
        cachedDeploymentId = cleanVal;
        try {
            if (cleanVal) localStorage.setItem('s4t_sheets_deployment_id', cleanVal);
            else {
                localStorage.removeItem('s4t_sheets_deployment_id');
                localStorage.removeItem('s4t_sheets_verified');
            }
        } catch (_) {}
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
            if (cleanVal) {
                var obj = { s4t_sheets_deployment_id: cleanVal, sheetsDeploymentId: cleanVal };
                chrome.storage.sync.set(obj, function () {});
            } else {
                chrome.storage.sync.remove(['s4t_sheets_deployment_id', 'sheetsDeploymentId', 's4t_sheets_verified'], function () {});
            }
        }
    }

    // Preload deployment id from sync storage on startup
    s4tRefreshDeploymentId();

    function s4tFormatDeveloperRecords(members, excludeNotSure) {
        if (!Array.isArray(members)) return [];
        return members.map(function (m) {
            var number = function (v) { return Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0; };
            var assigned = number(m.assigned);
            var completed = number(m.completed);
            var remaining = number(m.remaining);

            if (excludeNotSure && (m.notSureAssigned || m.notSureCompleted)) {
                assigned = Math.round(Math.max(0, assigned - (m.notSureAssigned || 0)) * 100) / 100;
                completed = Math.round(Math.max(0, completed - (m.notSureCompleted || 0)) * 100) / 100;
                remaining = Math.round(Math.max(0, assigned - completed) * 100) / 100;
            }

            return {
                name: String(m.name || m.username || '').trim(),
                completed: completed,
                remaining: remaining,
                assigned: assigned
            };
        });
    }

    function s4tPushToGoogleSheet(options, callback) {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({
                action: 's4t-push-to-sheets',
                webhookUrl: options.webhookUrl || options.deploymentId,
                sprintRelease: options.sprintRelease,
                developers: options.developers,
                boardName: options.boardName
            }, function (response) {
                var lastErr = chrome.runtime.lastError;
                if (lastErr) {
                    callback({
                        success: false,
                        message: lastErr.message || 'Could not communicate with extension background worker.',
                        errorType: 'runtime_error'
                    });
                } else if (response) {
                    callback(response);
                } else {
                    callback({
                        success: false,
                        message: 'Empty response from background worker.',
                        errorType: 'empty_response'
                    });
                }
            });
        } else if (typeof executePushToGoogleSheet === 'function') {
            executePushToGoogleSheet(options).then(callback).catch(function (err) {
                callback({
                    success: false,
                    message: err && err.message ? err.message : String(err),
                    errorType: 'exception'
                });
            });
        } else {
            callback({
                success: false,
                message: 'Chrome extension runtime is not available.',
                errorType: 'no_runtime'
            });
        }
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

    var activeOverlay = null;

    function s4tOpenGoogleSheetsModal(options) {
        if (!options) options = {};
        if (activeOverlay) {
            activeOverlay.remove();
            activeOverlay = null;
        }

        var boardId = options.boardId || (typeof getBoardShortLink === 'function' ? getBoardShortLink() : '') || 'current';
        var boardName = options.boardName || $('.board-name span.text, [data-testid="board-name-display"]').text().trim() || 'Active Board';
        var excludeNotSure = !!options.excludeNotSure;
        var members = options.members || [];
        var developers = s4tFormatDeveloperRecords(members, excludeNotSure);

        var savedTab = s4tGetBoardSheetTab(boardId);
        var initialTab = savedTab || s4tExtractBoardDateCandidate(boardName) || boardName;

        var overlay = document.createElement('div');
        overlay.id = 's4t-sheets-overlay';
        overlay.className = 's4t-modal-backdrop';

        var dialog = document.createElement('section');
        dialog.id = 's4t-sheets-dialog';
        dialog.className = 's4t-sheets-dialog';
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 's4t-sheets-title');

        function close() {
            if (activeOverlay === overlay) activeOverlay = null;
            overlay.remove();
        }

        function renderDialog(deploymentId) {
            var hasUrl = !!deploymentId;

            function openSettings(e) {
                if (e && e.preventDefault) e.preventDefault();
                close();
                if (typeof s4tPreferences !== 'undefined' && typeof s4tPreferences.open === 'function') {
                    s4tPreferences.open();
                }
            }

            var urlStatusHtml = hasUrl
                ? '<div class="s4t-sheets-url-status s4t-status-ok"><span class="s4t-status-icon">✓</span> Webhook URL available</div>'
                : '<div class="s4t-sheets-url-status s4t-status-missing"><span class="s4t-status-icon">⚠️</span> Webhook URL not set. Please enter URL in <a href="#" id="s4t-open-settings-link" class="s4t-sheets-options-link">Settings ⚙️</a>.</div>';

            dialog.innerHTML = [
                '<header class="s4t-sheets-header">',
                '<div class="s4t-sheets-title-row">',
                '<svg class="s4t-sheets-title-icon" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>',
                '<h2 id="s4t-sheets-title">Push to Google Sheets</h2>',
                '</div>',
                '<button type="button" class="s4t-sheets-close-btn" aria-label="Close">✕</button>',
                '</header>',

                '<div class="s4t-sheets-body">',
                // Explicit user confirmation warning
                '<div class="s4t-sheets-warning-box">',
                '<span class="s4t-sheets-warning-icon" aria-hidden="true">⚠️</span>',
                '<div class="s4t-sheets-warning-content">',
                '<strong>Are you sure this sheet name is correct?</strong> Otherwise another sheet will get updated.',
                '</div>',
                '</div>',

                '<div class="s4t-sheets-field">',
                '<label for="s4t-sheets-tab-input" class="s4t-sheets-field-title">Sheet Tab Name:</label>',
                '<div class="s4t-sheets-input-wrap">',
                '<input type="text" id="s4t-sheets-tab-input" class="s4t-sheets-input" value="' + s4tEscapeHtml(initialTab) + '" placeholder="e.g. 02 September 2026" required>',
                '<button type="button" id="s4t-sheets-copy-tab-btn" class="s4t-sheets-copy-btn" title="Copy sheet tab name" aria-label="Copy sheet tab name">',
                '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
                '</button>',
                '</div>',
                '</div>',

                urlStatusHtml,

                '<div id="s4t-sheets-status-container" class="s4t-sheets-status-container" role="status" aria-live="polite"></div>',
                '</div>',

                '<footer class="s4t-sheets-footer">',
                '<button type="button" class="s4t-sheets-btn-cancel">Cancel</button>',
                '<button type="button" id="s4t-sheets-confirm-btn" class="s4t-sheets-btn-confirm"' + (!hasUrl ? ' disabled title="Set Webhook URL in Sprint Helper Settings"' : '') + '>',
                '<span class="s4t-sheets-btn-spinner" aria-hidden="true" hidden></span>',
                '<span class="s4t-sheets-btn-text">Confirm & Push</span>',
                '</button>',
                '</footer>'
            ].join('');

            dialog.querySelector('.s4t-sheets-close-btn').onclick = close;
            dialog.querySelector('.s4t-sheets-btn-cancel').onclick = close;

            var openSettingsLink = dialog.querySelector('#s4t-open-settings-link');
            if (openSettingsLink) openSettingsLink.onclick = openSettings;

            var copyBtn = dialog.querySelector('#s4t-sheets-copy-tab-btn');
            if (copyBtn) {
                copyBtn.onclick = function () {
                    var tabInput = dialog.querySelector('#s4t-sheets-tab-input');
                    var val = tabInput ? tabInput.value.trim() : '';
                    if (!val) return;
                    function onCopied() {
                        copyBtn.classList.add('s4t-copied');
                        copyBtn.setAttribute('title', 'Copied!');
                        copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
                        setTimeout(function () {
                            copyBtn.classList.remove('s4t-copied');
                            copyBtn.setAttribute('title', 'Copy sheet tab name');
                            copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>';
                        }, 1500);
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(val).then(onCopied).catch(function () {
                            try {
                                tabInput.select();
                                document.execCommand('copy');
                                onCopied();
                            } catch (_) {}
                        });
                    } else {
                        try {
                            tabInput.select();
                            document.execCommand('copy');
                            onCopied();
                        } catch (_) {}
                    }
                };
            }

            var confirmBtn = dialog.querySelector('#s4t-sheets-confirm-btn');
            confirmBtn.onclick = function () {
                var tabInput = dialog.querySelector('#s4t-sheets-tab-input');
                var tabName = tabInput ? tabInput.value.trim() : '';
                var statusContainer = dialog.querySelector('#s4t-sheets-status-container');
                statusContainer.innerHTML = '';

                if (!tabName) {
                    statusContainer.innerHTML = '<div class="s4t-sheets-error-banner"><span class="s4t-sheets-banner-icon">❌</span><div class="s4t-sheets-banner-text">Please enter a sheet tab name.</div></div>';
                    if (tabInput) tabInput.focus();
                    return;
                }

                if (!deploymentId) {
                    statusContainer.innerHTML = '<div class="s4t-sheets-error-banner"><span class="s4t-sheets-banner-icon">❌</span><div class="s4t-sheets-banner-text">Webhook URL not set. Please <a href="#" id="s4t-err-settings-link" class="s4t-sheets-options-link">open Settings ⚙️</a> to set it.</div></div>';
                    var errSettingsLink = dialog.querySelector('#s4t-err-settings-link');
                    if (errSettingsLink) errSettingsLink.onclick = openSettings;
                    return;
                }

                // Save confirmed tab for current board
                s4tSaveBoardSheetTab(boardId, tabName);

                // UI loading state
                confirmBtn.disabled = true;
                confirmBtn.classList.add('s4t-btn-loading');
                confirmBtn.querySelector('.s4t-sheets-btn-text').textContent = 'Pushing…';
                var spinner = confirmBtn.querySelector('.s4t-sheets-btn-spinner');
                if (spinner) spinner.hidden = false;

                s4tPushToGoogleSheet({
                    webhookUrl: deploymentId,
                    sprintRelease: tabName,
                    boardName: boardName,
                    developers: developers
                }, function (result) {
                    confirmBtn.disabled = false;
                    confirmBtn.classList.remove('s4t-btn-loading');
                    confirmBtn.querySelector('.s4t-sheets-btn-text').textContent = 'Confirm & Push';
                    if (spinner) spinner.hidden = true;

                    if (result && result.success) {
                        // Success: Show big green tickmark view and auto-close popup
                        dialog.innerHTML = [
                            '<div class="s4t-sheets-success-view">',
                            '<div class="s4t-sheets-success-icon-wrap">',
                            '<svg class="s4t-sheets-big-tick" viewBox="0 0 24 24" width="60" height="60" fill="none" stroke="#0f9d58" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
                            '<circle cx="12" cy="12" r="10" fill="#e6f4ea" stroke="#0f9d58" stroke-width="2"/>',
                            '<path d="M8 12.5l2.5 2.5L16 9" stroke="#0f9d58" stroke-width="2.5"/>',
                            '</svg>',
                            '</div>',
                            '<h2 class="s4t-sheets-success-title">Successfully Pushed!</h2>',
                            '<p class="s4t-sheets-success-subtitle">Sprint points updated in <strong>\'' + s4tEscapeHtml(result.matchedTab || tabName) + '\'</strong></p>',
                            '</div>'
                        ].join('');
                        setTimeout(function () {
                            if (activeOverlay === overlay) close();
                        }, 1800);
                    } else {
                        // Failure: Keep popup UI intact so user can check/change sheet name and retry
                        var errorMsg = (result && result.message) || 'Unknown error occurred.';
                        var handledReason = '';

                        if (result && (result.errorType === 'not_found' || errorMsg.toLowerCase().includes('not found') || errorMsg.toLowerCase().includes('does not exist'))) {
                            handledReason = 'Sheet tab <strong>\'' + s4tEscapeHtml(tabName) + '\'</strong> was not found in your spreadsheet.';
                        } else if (result && result.errorType === 'timeout') {
                            handledReason = 'Request timed out after 12 seconds. Please check your internet connection.';
                        } else if (result && result.errorType === 'invalid_url') {
                            handledReason = 'Invalid Webhook URL. Please check <a href="#" id="s4t-fail-settings-link" class="s4t-sheets-options-link">Settings ⚙️</a>.';
                        } else {
                            handledReason = s4tEscapeHtml(errorMsg);
                        }

                        statusContainer.innerHTML = [
                            '<div class="s4t-sheets-error-banner">',
                            '<span class="s4t-sheets-banner-icon">❌</span>',
                            '<div class="s4t-sheets-banner-text">',
                            '<strong>Push failed:</strong> ' + handledReason,
                            '</div>',
                            '</div>'
                        ].join('');

                        var failSettingsLink = dialog.querySelector('#s4t-fail-settings-link');
                        if (failSettingsLink) failSettingsLink.onclick = openSettings;

                        if (tabInput) tabInput.focus();
                    }
                });
            };
        }

        var currentId = s4tGetSheetsDeploymentId();
        renderDialog(currentId);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        activeOverlay = overlay;

        overlay.onmousedown = function (e) {
            if (e.target === overlay) close();
        };

        $(document).off('keydown.s4tSheetsEsc').on('keydown.s4tSheetsEsc', function (e) {
            if (e.key === 'Escape' || e.keyCode === 27) {
                close();
                $(document).off('keydown.s4tSheetsEsc');
            }
        });

        // Background sync to ensure fresh storage value without delaying opening
        s4tRefreshDeploymentId(function (freshId) {
            if (activeOverlay === overlay && freshId && freshId !== currentId) {
                renderDialog(freshId);
            }
        });
    }

    return {
        s4tOpenGoogleSheetsModal: s4tOpenGoogleSheetsModal,
        s4tPushToGoogleSheet: s4tPushToGoogleSheet,
        s4tGetBoardSheetTab: s4tGetBoardSheetTab,
        s4tSaveBoardSheetTab: s4tSaveBoardSheetTab,
        s4tGetSheetsDeploymentId: s4tGetSheetsDeploymentId,
        s4tSaveSheetsDeploymentId: s4tSaveSheetsDeploymentId,
        s4tIsSheetsVerified: s4tIsSheetsVerified,
        s4tSetSheetsVerified: s4tSetSheetsVerified,
        s4tNormalizeSheetsWebhookUrl: s4tNormalizeSheetsWebhookUrl,
        generateSheetTabCandidates: generateSheetTabCandidates,
        s4tExtractBoardDateCandidate: s4tExtractBoardDateCandidate,
        s4tFormatDeveloperRecords: s4tFormatDeveloperRecords
    };
}));
