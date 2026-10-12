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

test('card header search maintains compact 32px height without padding and title copy has top stacking', () => {
    const cssPath = path.join(__dirname, '..', 'sprint-helper.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    const jsPath = path.join(__dirname, '..', 'comment-layout.js');
    const js = fs.readFileSync(jsPath, 'utf8');

    assert.ok(css.includes('.s4t-card-header-search { display: flex; align-items: center; flex: 0 1 auto; width: max-content; max-width: calc(100vw - 220px); min-width: 0; height: 32px; max-height: 32px; overflow-x: auto; scrollbar-width: none; padding: 0;'), 'header search enforces compact 32px height with 0 padding');
    assert.ok(css.includes('.s4t-card-copy-share { width:32px; height:32px; min-height:32px; max-height:32px; flex:0 0 32px;'), 'share button matches 32px native height');
    assert.ok(js.includes('.s4t-comment-layout-toggle{display:inline-flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;min-height:32px;max-height:32px;'), 'toggle buttons match 32px native height');
    assert.ok(css.includes('.s4t-card-copy-title { position:absolute; z-index:50 !important; pointer-events:auto !important; }'), 'title copy button has high z-index and pointer-events enabled');
    assert.ok(css.includes('[data-testid="card-back"]') && css.includes('position: relative;'), 'card back has relative positioning for reliable child containment');
});

test('card topbar elements mount reliably on first card open after reload without dropping mutations', () => {
    const sprintHelperPath = path.join(__dirname, '..', 'sprint-helper.js');
    const sprintHelper = fs.readFileSync(sprintHelperPath, 'utf8');
    const commentLayoutPath = path.join(__dirname, '..', 'comment-layout.js');
    const commentLayout = fs.readFileSync(commentLayoutPath, 'utf8');
    const cardCopyPath = path.join(__dirname, '..', 'card-copy.js');
    const cardCopy = fs.readFileSync(cardCopyPath, 'utf8');

    assert.ok(sprintHelper.includes('var needsMount=(!bar||!bar.isConnected||!slot||!slot.isConnected)&&cardPresent;'), 'sprint-helper detects unmounted topbar when card is present');
    assert.ok(sprintHelper.includes('node.closest(cardSelector)'), 'sprint-helper recognizes mutations inside open card even if scope was uninitialized');
    assert.ok(sprintHelper.includes('scope = nextScope;'), 'sprint-helper sets scope eagerly when card dialog is detected');
    assert.ok(sprintHelper.includes('onUrlChange()') && sprintHelper.includes('history.pushState'), 'sprint-helper catches route changes immediately');
    assert.ok(commentLayout.includes('needsMount = searchSlot && (!toggle || !toggle.isConnected || !markerButton || !markerButton.isConnected);'), 'comment-layout mounts immediately when topbar slot is present');
    assert.ok(cardCopy.includes('needsMount=((searchSlot&&(!shareButton||!shareButton.isConnected))||(!titleButton||!titleButton.isConnected))&&cardPresent;'), 'card-copy mounts share and title buttons reliably when needed');
});

