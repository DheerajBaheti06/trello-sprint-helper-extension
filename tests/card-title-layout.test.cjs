const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('card title textarea CSS enforces overflow-y hidden and 100% width', () => {
    const cssPath = path.join(__dirname, '..', 'sprint-helper.css');
    const css = fs.readFileSync(cssPath, 'utf8');

    assert.ok(css.includes('textarea[data-testid="card-back-title"]'), 'includes card-back-title selector');
    assert.ok(css.includes('overflow-y: hidden !important'), 'forces overflow-y: hidden on title textareas');
    assert.ok(css.includes('resize: none !important'), 'disables manual resize on title textareas');
    assert.ok(css.includes('[data-testid="card-back-title-container"]'), 'includes card-back-title-container selector');
    assert.ok(css.includes('[data-testid="card-back-title-container"] > .picker'), 'hides picker inside title container');
});

test('comment toolbar uses flexible responsive layout in comment-layout.js', () => {
    const jsPath = path.join(__dirname, '..', 'comment-layout.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    assert.ok(js.includes('flex:0 1 auto'), 'allows toolbar to shrink with flex:0 1 auto');
    assert.ok(js.includes('max-width:calc(100vw - 220px)'), 'caps toolbar max-width to protect title space');
    assert.ok(js.includes('max-width:240px'), 'caps navigator max-width to 240px');
});

test('sprint-helper.js prevents showPointPicker from attaching to title container on card open', () => {
    const jsPath = path.join(__dirname, '..', 'sprint-helper.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    // Verify recalcTotalsObserver does not match textarea[data-testid='card-back-title'] unconditionally
    const observerMatch = js.indexOf('recalcTotalsObserver =');
    assert.ok(observerMatch > 0, 'found recalcTotalsObserver');
    const observerEnd = js.indexOf('recalcTotalsObserver.observe', observerMatch);
    const observerChunk = js.slice(observerMatch, observerEnd);

    assert.ok(!observerChunk.includes('textarea[data-testid=\'card-back-title\']'), 'does not match view-mode textarea in recalcTotalsObserver');
    assert.ok(observerChunk.includes('[data-testid="card-back-title-container"] > .picker'), 'cleans up any rogue pickers from title container');

    // Verify showPointPicker guards against title container
    const pickerMatch = js.indexOf('function showPointPicker(');
    assert.ok(pickerMatch > 0, 'found showPointPicker');
    const pickerChunk = js.slice(pickerMatch, pickerMatch + 600);

    assert.ok(pickerChunk.includes('[data-testid="card-back-title-container"]'), 'guards against title container in showPointPicker');
});

test('title-points-editor.js auto-expands height for multiline wrapped titles and resets on finish', () => {
    const jsPath = path.join(__dirname, '..', 'title-points-editor.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    assert.ok(js.includes('if (viewing && input.scrollHeight > input.clientHeight)'), 'detects wrapped multiline title overflow');
    assert.ok(js.includes("input.style.height = input.scrollHeight + 'px'"), 'sets height to scrollHeight to fit all lines');
    assert.ok(js.includes("input.style.height = ''"), 'resets style height on finish edit');
});
