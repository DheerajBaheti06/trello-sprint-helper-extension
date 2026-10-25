const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const sheets = require('../google-sheets.js');
const background = require('../background.js');

test('s4tNormalizeSheetsWebhookUrl handles deployment IDs and full URLs', () => {
    assert.equal(
        sheets.s4tNormalizeSheetsWebhookUrl('AKfycbx_test123-abc'),
        'https://script.google.com/macros/s/AKfycbx_test123-abc/exec'
    );
    assert.equal(
        sheets.s4tNormalizeSheetsWebhookUrl('https://script.google.com/macros/s/AKfycbx_test123-abc/exec'),
        'https://script.google.com/macros/s/AKfycbx_test123-abc/exec'
    );
    assert.equal(
        sheets.s4tNormalizeSheetsWebhookUrl('https://script.google.com/macros/s/AKfycbx_test123-abc'),
        'https://script.google.com/macros/s/AKfycbx_test123-abc/exec'
    );
    assert.equal(sheets.s4tNormalizeSheetsWebhookUrl(''), '');
    assert.equal(sheets.s4tNormalizeSheetsWebhookUrl('   '), '');
});

test('generateSheetTabCandidates generates smart variations for date-based sprint names', () => {
    const candidates = sheets.generateSheetTabCandidates('02 September 2026');
    assert.ok(candidates.includes('02 September 2026'));
    assert.ok(candidates.includes('2 September 2026'));
    assert.ok(candidates.includes('02 Sep 2026'));
    assert.ok(candidates.includes('2 Sep 2026'));
    assert.ok(candidates.includes('02-Sep-2026'));

    const custom = sheets.generateSheetTabCandidates('Sprint 14');
    assert.deepEqual(custom, ['Sprint 14']);
});

test('s4tExtractBoardDateCandidate extracts clean date string from board title', () => {
    assert.equal(sheets.s4tExtractBoardDateCandidate('Sprint 02 September 2026'), '02 September 2026');
    assert.equal(sheets.s4tExtractBoardDateCandidate('Release 16th Oct 2025'), '16 October 2025');
    assert.equal(sheets.s4tExtractBoardDateCandidate('General Backlog'), 'General Backlog');
});

test('s4tFormatDeveloperRecords accurately maps assigned, completed, and remaining points', () => {
    const rawMembers = [
        {
            name: 'Alex Johnson',
            assigned: 17.5,
            completed: 14.5,
            remaining: 3.0,
            notSureAssigned: 2.0,
            notSureCompleted: 1.0
        },
        {
            username: '@sarah',
            assigned: 8.0,
            completed: 8.0,
            remaining: 0.0
        }
    ];

    // Without excludeNotSure
    const normal = sheets.s4tFormatDeveloperRecords(rawMembers, false);
    assert.equal(normal.length, 2);
    assert.equal(normal[0].name, 'Alex Johnson');
    assert.equal(normal[0].completed, 14.5);
    assert.equal(normal[0].remaining, 3.0);
    assert.equal(normal[0].assigned, 17.5);
    assert.equal(normal[1].name, '@sarah');

    // With excludeNotSure
    const excluded = sheets.s4tFormatDeveloperRecords(rawMembers, true);
    assert.equal(excluded[0].assigned, 15.5);
    assert.equal(excluded[0].completed, 13.5);
    assert.equal(excluded[0].remaining, 2.0);
    assert.equal(excluded[1].assigned, 8.0);
});

test('executePushToGoogleSheet handles successful push and matched tab', async () => {
    let capturedUrl = '';
    let capturedOptions = null;

    const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedOptions = options;
        return {
            ok: true,
            text: async () => "SUCCESS: Data received for '02 September 2026'"
        };
    };

    const result = await background.executePushToGoogleSheet({
        deploymentId: 'AKfycbx_sample',
        sprintRelease: '02 September 2026',
        boardName: 'Sprint 02 September 2026',
        developers: [{ name: 'Dev 1', completed: 5, remaining: 2, assigned: 7 }]
    }, mockFetch);

    assert.equal(result.success, true);
    assert.ok(result.message.startsWith('SUCCESS:'));
    assert.equal(result.matchedTab, '02 September 2026');
    assert.equal(capturedUrl, 'https://script.google.com/macros/s/AKfycbx_sample/exec');
    assert.equal(capturedOptions.redirect, 'follow');

    const payload = JSON.parse(capturedOptions.body);
    assert.equal(payload.release, '02 September 2026');
    assert.equal(payload.boardName, 'Sprint 02 September 2026');
    assert.equal(payload.developers[0].name, 'Dev 1');
    assert.equal(payload.developers[0].assigned, 7);
});

test('executePushToGoogleSheet retries candidates on tab not found and stops on match', async () => {
    const attempts = [];
    const mockFetch = async (url, options) => {
        const payload = JSON.parse(options.body);
        attempts.push(payload.release);
        if (payload.release === '02 Sep 2026') {
            return {
                ok: true,
                text: async () => "SUCCESS: Data received for '02 Sep 2026'"
            };
        }
        return {
            ok: true,
            text: async () => "ERROR: Sheet '" + payload.release + "' not found"
        };
    };

    const result = await background.executePushToGoogleSheet({
        deploymentId: 'AKfycbx_sample',
        sprintRelease: '02 September 2026',
        developers: [{ name: 'Dev 1', completed: 5, remaining: 2 }]
    }, mockFetch);

    assert.equal(result.success, true);
    assert.equal(result.matchedTab, '02 Sep 2026');
    assert.ok(attempts.length >= 2);
});

test('executePushToGoogleSheet reports handled error when sheet tab is not found anywhere', async () => {
    const mockFetch = async (url, options) => {
        const payload = JSON.parse(options.body);
        return {
            ok: true,
            text: async () => "ERROR: Sheet '" + payload.release + "' not found"
        };
    };

    const result = await background.executePushToGoogleSheet({
        deploymentId: 'AKfycbx_sample',
        sprintRelease: 'Sprint 99',
        developers: []
    }, mockFetch);

    assert.equal(result.success, false);
    assert.equal(result.errorType, 'not_found');
    assert.ok(result.message.includes('not found'));
});

test('executePushToGoogleSheet rejects missing or invalid deployment ID', async () => {
    const result = await background.executePushToGoogleSheet({
        deploymentId: '',
        sprintRelease: '02 September 2026'
    }, async () => {});

    assert.equal(result.success, false);
    assert.equal(result.errorType, 'invalid_url');
});

test('manifest.json has required host_permissions, background service worker, and no options_ui', () => {
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    assert.ok(Array.isArray(manifest.host_permissions));
    assert.ok(manifest.host_permissions.includes('https://script.google.com/*'));
    assert.ok(manifest.host_permissions.includes('https://script.googleusercontent.com/*'));
    assert.equal(manifest.background.service_worker, 'background.js');
    assert.ok(manifest.content_scripts[0].js.includes('google-sheets.js'));
    assert.equal(manifest.options_ui, undefined, 'options_ui should be removed since configuration is in Settings');
});

test('options.html and options.js are removed in favor of in-extension Settings', () => {
    assert.equal(fs.existsSync('options.html'), false, 'options.html must not exist');
    assert.equal(fs.existsSync('options.js'), false, 'options.js must not exist');
});

test('sprint-helper.css guarantees sheets dialog has top z-index above members burndown modal', () => {
    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(
        css.includes('#s4t-sheets-overlay') && css.includes('z-index: 2147483647 !important;'),
        '#s4t-sheets-overlay must have maximum z-index 2147483647'
    );
    assert.ok(
        css.includes('#s4t-modal-overlay') && css.includes('z-index: 2147483640 !important;'),
        '#s4t-modal-overlay must be 2147483640 so sheets dialog renders in front'
    );
    assert.ok(
        css.includes('.s4t-sheets-url-status.s4t-status-ok'),
        'css must style url status ok'
    );
    assert.ok(
        css.includes('.s4t-sheets-url-status.s4t-status-missing'),
        'css must style url status missing'
    );
    assert.ok(
        css.includes('.s4t-sheets-btn') && css.includes('margin-right: 18px;'),
        '.s4t-sheets-btn must have margin-right to prevent mixing with Exclude Not Sure checkbox'
    );
    assert.ok(
        css.includes('.s4t-sheets-copy-btn'),
        'css must style copy tab button'
    );
    assert.ok(
        css.includes('.s4t-sheets-success-view'),
        'css must style success view with big green tickmark'
    );
});

test('google-sheets.js provides copy button, direct settings link, and clean success screen', () => {
    const js = fs.readFileSync('google-sheets.js', 'utf8');
    assert.ok(js.includes('s4t-sheets-copy-tab-btn'), 'modal must include copy tab name button');
    assert.ok(js.includes('s4t-sheets-success-view'), 'modal must render success view on push success');
    assert.ok(js.includes('s4t-open-settings-link'), 'modal must provide direct settings link');
    assert.ok(js.includes('s4tPreferences.open'), 'modal must open Settings dialog on click');
});

test('WORKFLOW-RULES.md contains concise, accurate Google Sheets section without auto-detect claims', () => {
    const rules = fs.readFileSync('WORKFLOW-RULES.md', 'utf8');
    assert.ok(rules.includes('## Google Sheets Integration'), 'rules must have Google Sheets section');
    assert.ok(rules.includes('Webhook setup'), 'rules must explain webhook setup');
    assert.ok(!rules.includes('auto detect') && !rules.includes('automatically tests common date variations'), 'rules must not claim auto detection');
});

test('executeVerifyWebhookUrl verifies active Google Apps Script endpoint via GET', async () => {
    let capturedMethod = '';
    let capturedUrl = '';
    const mockFetch = async (url, options) => {
        capturedUrl = url;
        capturedMethod = options.method;
        return {
            ok: true,
            text: async () => 'SUCCESS: Webhook URL is verified and active'
        };
    };

    const res = await background.executeVerifyWebhookUrl('AKfycbx_test123', mockFetch);
    assert.equal(res.success, true);
    assert.equal(capturedMethod, 'GET');
    assert.equal(capturedUrl, 'https://script.google.com/macros/s/AKfycbx_test123/exec');
    assert.ok(res.message.includes('SUCCESS:'));
});

test('executeVerifyWebhookUrl rejects non-success or errored responses', async () => {
    const mockFetchError = async () => ({
        ok: false,
        status: 404,
        text: async () => 'Page not found'
    });

    const res = await background.executeVerifyWebhookUrl('AKfycbx_test123', mockFetchError);
    assert.equal(res.success, false);
    assert.ok(res.message.includes('404') || res.message.includes('not found'));
});

test('executeVerifyWebhookUrl rejects invalid URL or ID format', async () => {
    const res = await background.executeVerifyWebhookUrl('https://malicious-site.com/webhook', async () => {});
    assert.equal(res.success, false);
    assert.equal(res.errorType, 'invalid_url');
});

test('s4tIsSheetsVerified and s4tSetSheetsVerified manage verification flag in google-sheets.js', () => {
    assert.equal(typeof sheets.s4tIsSheetsVerified, 'function');
    assert.equal(typeof sheets.s4tSetSheetsVerified, 'function');

    // Without deployment ID, returns false
    assert.equal(sheets.s4tIsSheetsVerified(), false);
});

test('feature-preferences.js integrates full-width Google Sheets field with inline verification', () => {
    const fp = fs.readFileSync('feature-preferences.js', 'utf8');
    assert.ok(fp.includes('s4t-preferences-sheets'), 'feature-preferences must create .s4t-preferences-sheets fieldset');
    assert.ok(fp.includes('Verify & Save'), 'feature-preferences must have Verify & Save button');
    assert.ok(fp.includes('s4t-pref-status-success'), 'feature-preferences must include success status');
    assert.ok(fp.includes('s4t-pref-status-error'), 'feature-preferences must include error status');
    assert.ok(fp.includes('s4t-sheets-verified-changed'), 'feature-preferences must dispatch s4t-sheets-verified-changed event');
    assert.ok(fp.includes('isSheetsVerified: function'), 's4tPreferences must export isSheetsVerified method');
});

test('sprint-helper.js only renders Push to Sheets button in Members Burndown when verified', () => {
    const sh = fs.readFileSync('sprint-helper.js', 'utf8');
    assert.ok(sh.includes('s4tIsSheetsVerified'), 'sprint-helper must check s4tIsSheetsVerified');
    assert.ok(sh.includes('s4t-sheets-verified-changed.s4tBurndown'), 'sprint-helper must listen for verification changes');
    assert.ok(sh.includes('#s4t-push-sheets-btn'), 'sprint-helper references #s4t-push-sheets-btn');
});

test('sprint-helper.css formats .s4t-preferences-sheets as full width beneath Appearance', () => {
    const css = fs.readFileSync('sprint-helper.css', 'utf8');
    assert.ok(
        css.includes('#s4t-preferences-dialog .s4t-preferences-sheets') &&
        css.includes('grid-column: 1 / -1;'),
        '.s4t-preferences-sheets must span full width with grid-column: 1 / -1'
    );
    assert.ok(css.includes('.s4t-preferences-sheets-btn'), 'css must style verify button');
    assert.ok(css.includes('.s4t-preferences-sheets-spinner'), 'css must style inline button spinner');
    assert.ok(css.includes('.s4t-pref-status-success'), 'css must style inline success state');
    assert.ok(css.includes('.s4t-pref-status-error'), 'css must style inline error state');
});




