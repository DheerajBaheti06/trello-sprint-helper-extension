/* Background service worker for Sprint Helper - Google Sheets Webhook Integration */

function s4tNormalizeSheetsWebhookUrl(raw) {
    var input = String(raw || '').trim();
    if (!input) return '';
    if (input.startsWith('https://script.google.com/macros/s/') && input.endsWith('/exec')) {
        return input;
    }
    if (input.startsWith('https://script.google.com/macros/s/')) {
        return input.replace(/\/+$/, '') + '/exec';
    }
    // If user provided just the Deployment ID
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

    // Match formats like "02 September 2026" or "2 Sep 2026" or "02-Sep-2026"
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

        // Common tab naming variations
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

async function executePushToGoogleSheet(options, customFetch) {
    var fetchFn = customFetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
        throw new Error('fetch is not available in the current environment.');
    }

    var rawUrl = options.webhookUrl || options.deploymentId || '';
    var webhookUrl = s4tNormalizeSheetsWebhookUrl(rawUrl);

    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/')) {
        return {
            success: false,
            message: 'Invalid Google Apps Script Webhook URL or Deployment ID. Please check your Extension Settings.',
            errorType: 'invalid_url'
        };
    }

    var sprintRelease = String(options.sprintRelease || '').trim();
    if (!sprintRelease) {
        return {
            success: false,
            message: 'Target sheet tab name is required.',
            errorType: 'missing_tab'
        };
    }

    var developers = Array.isArray(options.developers) ? options.developers : [];
    var boardName = String(options.boardName || '').trim() || sprintRelease;
    var candidates = generateSheetTabCandidates(sprintRelease);
    var lastResponseText = '';

    for (var i = 0; i < candidates.length; i++) {
        var candidateTab = candidates[i];
        var payload = {
            release: candidateTab,
            sheetName: candidateTab,
            boardName: boardName,
            developers: developers.map(function (dev) {
                var comp = Number(dev.completed) || 0;
                var rem = Number(dev.remaining) || 0;
                var assigned = dev.assigned !== undefined && dev.assigned !== null ? Number(dev.assigned) : (comp + rem);
                return {
                    name: String(dev.name || dev.username || '').trim(),
                    completed: comp,
                    remaining: rem,
                    assigned: assigned
                };
            })
        };

        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;

        try {
            var fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload),
                redirect: 'follow' // CRITICAL for Google Apps Script 302 redirects
            };
            if (controller) {
                fetchOptions.signal = controller.signal;
            }

            var res = await fetchFn(webhookUrl, fetchOptions);
            if (timeoutId) clearTimeout(timeoutId);

            var resText = await res.text();
            lastResponseText = resText.trim();

            if (res.ok && lastResponseText.startsWith('SUCCESS:')) {
                return {
                    success: true,
                    message: lastResponseText,
                    matchedTab: candidateTab
                };
            }

            // If the error is NOT a missing tab (e.g., script crash/syntax error/unauthorized), stop retrying
            var isNotFound = lastResponseText.toLowerCase().includes('not found') ||
                             lastResponseText.toLowerCase().includes('does not exist');
            if (!isNotFound) {
                return {
                    success: false,
                    message: lastResponseText,
                    errorType: 'script_error'
                };
            }
        } catch (err) {
            if (timeoutId) clearTimeout(timeoutId);
            if (err && err.name === 'AbortError') {
                return {
                    success: false,
                    message: 'Request timed out after 12 seconds. Please check your internet connection and Deployment ID.',
                    errorType: 'timeout'
                };
            }
            lastResponseText = err && err.message ? err.message : String(err);
        }
    }

    return {
        success: false,
        message: lastResponseText || ('Sheet tab "' + sprintRelease + '" not found in your spreadsheet.'),
        errorType: 'not_found'
    };
}

async function executeVerifyWebhookUrl(rawUrl, customFetch) {
    var fetchFn = customFetch || (typeof fetch === 'function' ? fetch : null);
    if (!fetchFn) {
        throw new Error('fetch is not available in the current environment.');
    }

    var webhookUrl = s4tNormalizeSheetsWebhookUrl(rawUrl);
    if (!webhookUrl || !webhookUrl.startsWith('https://script.google.com/macros/s/')) {
        return {
            success: false,
            message: 'Invalid Google Apps Script Webhook URL or Deployment ID.',
            errorType: 'invalid_url'
        };
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 12000) : null;

    try {
        var fetchOptions = {
            method: 'GET',
            redirect: 'follow'
        };
        if (controller) {
            fetchOptions.signal = controller.signal;
        }

        var res = await fetchFn(webhookUrl, fetchOptions);
        if (timeoutId) clearTimeout(timeoutId);

        var resText = (await res.text()).trim();

        if (res.ok && (resText.startsWith('SUCCESS:') || resText.toLowerCase().includes('success'))) {
            return {
                success: true,
                message: resText || 'SUCCESS: Webhook URL is verified and active',
                normalizedUrl: webhookUrl
            };
        }

        return {
            success: false,
            message: resText || ('Endpoint returned HTTP ' + res.status),
            errorType: 'verification_failed'
        };
    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err && err.name === 'AbortError') {
            return {
                success: false,
                message: 'Connection timed out after 12 seconds.',
                errorType: 'timeout'
            };
        }
        return {
            success: false,
            message: err && err.message ? err.message : String(err),
            errorType: 'exception'
        };
    }
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (message && message.action === 's4t-push-to-sheets') {
            executePushToGoogleSheet(message).then(function (result) {
                sendResponse(result);
            }).catch(function (error) {
                sendResponse({
                    success: false,
                    message: error && error.message ? error.message : String(error),
                    errorType: 'exception'
                });
            });
            return true; // asynchronous response
        }
        if (message && message.action === 's4t-verify-webhook') {
            executeVerifyWebhookUrl(message.webhookUrl).then(function (result) {
                sendResponse(result);
            }).catch(function (error) {
                sendResponse({
                    success: false,
                    message: error && error.message ? error.message : String(error),
                    errorType: 'exception'
                });
            });
            return true;
        }
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        s4tNormalizeSheetsWebhookUrl: s4tNormalizeSheetsWebhookUrl,
        generateSheetTabCandidates: generateSheetTabCandidates,
        executePushToGoogleSheet: executePushToGoogleSheet,
        executeVerifyWebhookUrl: executeVerifyWebhookUrl
    };
}

