const test = require('node:test');
const assert = require('node:assert/strict');
const cardPeek = require('../card-peek.js');

test('computePosition places popover to the right when there is space without overlapping', () => {
    const cardRect = { left: 100, right: 360, top: 200, bottom: 280, width: 260, height: 80 };
    const winWidth = 1400;
    const winHeight = 900;
    const popWidth = 420;
    const popHeight = 310;

    const pos = cardPeek.computePosition(cardRect, popWidth, popHeight, winWidth, winHeight);

    assert.equal(pos.placement, 'right');
    assert.ok(pos.left >= cardRect.right, 'Popover must be strictly to the right of the card');
    assert.ok(pos.left + popWidth <= winWidth, 'Popover must fit within window width');
    assert.ok(pos.top >= 0 && pos.top + popHeight <= winHeight, 'Popover must fit within window height');
});

test('computePosition flips to the left when right side has insufficient space', () => {
    const cardRect = { left: 1050, right: 1350, top: 200, bottom: 280, width: 300, height: 80 };
    const winWidth = 1400;
    const winHeight = 900;
    const popWidth = 420;
    const popHeight = 310;

    const pos = cardPeek.computePosition(cardRect, popWidth, popHeight, winWidth, winHeight);

    assert.equal(pos.placement, 'left');
    assert.ok(pos.left + popWidth <= cardRect.left, 'Popover must be strictly to the left of the card');
    assert.ok(pos.left >= 0, 'Popover must not overflow left window edge');
    assert.ok(pos.top >= 0 && pos.top + popHeight <= winHeight, 'Popover must fit within window height');
});

test('computePosition clamps vertical position when card is near the bottom edge', () => {
    const cardRect = { left: 100, right: 360, top: 750, bottom: 850, width: 260, height: 100 };
    const winWidth = 1400;
    const winHeight = 900;
    const popWidth = 420;
    const popHeight = 310;

    const pos = cardPeek.computePosition(cardRect, popWidth, popHeight, winWidth, winHeight);

    assert.ok(pos.top + popHeight <= winHeight, `Popover top (${pos.top}) + height (${popHeight}) must not exceed winHeight (${winHeight})`);
    assert.ok(pos.top >= 10, 'Popover must stay within top boundary');
});

test('extractCommentHeadings identifies H1-H3 markdown headings from comment actions', () => {
    const actions = [
        {
            data: {
                text: '## Tech Design:\nHere is the proposed design.\n### Test Cases -\n1. Test login\n2. Test logout'
            }
        },
        {
            data: {
                text: '# Branch: feature/sprint-helper\nSome notes.'
            }
        },
        {
            data: {
                text: 'Just regular conversation without any heading.'
            }
        }
    ];

    const headings = cardPeek.extractCommentHeadings(actions);

    assert.ok(headings.includes('tech design'));
    assert.ok(headings.includes('test cases'));
    assert.ok(headings.includes('branch'));
    assert.ok(headings.length >= 3);
});

test('extractCommentHeadings handles empty, missing, or malformed action data safely', () => {
    assert.deepEqual(cardPeek.extractCommentHeadings([]), []);
    assert.deepEqual(cardPeek.extractCommentHeadings([{}, { data: null }, { data: { text: null } }]), []);
});

test('safeRenderDescription escapes dangerous HTML and formats markdown', () => {
    const attack = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    const renderedAttack = cardPeek.safeRenderDescription(attack);

    assert.ok(!renderedAttack.includes('<script'));
    assert.ok(!renderedAttack.includes('<img'));
    assert.ok(renderedAttack.includes('&lt;script&gt;'));

    const markdown = '**Scope details** with `const a = 1;` and *notes*';
    const renderedMarkdown = cardPeek.safeRenderDescription(markdown);

    assert.ok(renderedMarkdown.includes('<strong>Scope details</strong>'));
    assert.ok(renderedMarkdown.includes('<code>const a = 1;</code>'));
    assert.ok(renderedMarkdown.includes('<em>notes</em>'));

    const empty = cardPeek.safeRenderDescription('');
    assert.ok(empty.includes('No description provided'));
});

test('isCommentHeadingPresent matches various comment heading formats and casings', () => {
    // TESTCASES variations matching 'Test Cases'
    assert.ok(cardPeek.isCommentHeadingPresent(['testcases'], 'Test Cases'));
    assert.ok(cardPeek.isCommentHeadingPresent(['TESTCASES'], 'Test Cases'));
    assert.ok(cardPeek.isCommentHeadingPresent(['test-cases'], 'Test Cases'));
    assert.ok(cardPeek.isCommentHeadingPresent(['test_cases'], 'Test Cases'));
    assert.ok(cardPeek.isCommentHeadingPresent(['test cases'], 'Test Cases'));

    // Reverse: required name is 'TESTCASES'
    assert.ok(cardPeek.isCommentHeadingPresent(['test cases'], 'TESTCASES'));
    assert.ok(cardPeek.isCommentHeadingPresent(['Test Cases'], 'TESTCASES'));
    assert.ok(cardPeek.isCommentHeadingPresent(['testcases'], 'TESTCASES'));

    // Branch variations
    assert.ok(cardPeek.isCommentHeadingPresent(['branch'], 'Branch'));
    assert.ok(cardPeek.isCommentHeadingPresent(['branches'], 'Branch'));
    assert.ok(cardPeek.isCommentHeadingPresent(['Branches'], 'Branch'));

    // Tech Design variations
    assert.ok(cardPeek.isCommentHeadingPresent(['tech design'], 'Tech Design'));
    assert.ok(cardPeek.isCommentHeadingPresent(['technical design'], 'Tech Design'));
    assert.ok(cardPeek.isCommentHeadingPresent(['tech-design'], 'Tech Design'));

    // Non-matching
    assert.ok(!cardPeek.isCommentHeadingPresent(['random heading'], 'Test Cases'));
    assert.ok(!cardPeek.isCommentHeadingPresent([], 'Branch'));
});

test('cardPeek.close runs safely without errors', () => {
    assert.doesNotThrow(() => {
        cardPeek.close();
    });
});

test('card-peek.js includes Description / Scope header title and lifecycle listeners', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../card-peek.js'), 'utf8');

    assert.ok(src.includes('Description / Scope'), 'Must include "Description / Scope" as header title');
    assert.ok(src.includes("window.addEventListener('blur', closePeek)"), 'Must close peek on window blur');
    assert.ok(src.includes("document.addEventListener('visibilitychange', closePeek)"), 'Must close peek on visibilitychange');
    assert.ok(src.includes("popover.addEventListener('pointerleave', function (e) {"), 'Must handle popover pointerleave with activeCard transition check');
    assert.ok(src.includes("bindCardListeners(card)"), 'Must bind hover listeners to activeCard');
    assert.ok(src.includes("document.addEventListener('pointerdown'"), 'Must dismiss peek on outside pointerdown');
    assert.ok(src.includes("document.addEventListener('pointermove'"), 'Must maintain hover zone in pointermove');
});

test('sprint-helper.css has safe backdrop pointer-events, hidden inactive popover, and inline checklist item spacing', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../sprint-helper.css'), 'utf8');

    assert.ok(css.includes('.s4t-card-peek-backdrop.s4t-active {\n    opacity: 1;\n    pointer-events: none;'), 'Active backdrop must have pointer-events: none');
    assert.ok(css.includes('visibility: hidden;\n    pointer-events: none;'), 'Inactive popover must have visibility: hidden and pointer-events: none');
    assert.ok(css.includes('justify-content: flex-start;'), 'Checklist items must not space-between count from name');
    assert.ok(css.includes('flex: 0 1 auto;'), 'Checklist name must not stretch to push count far right');
});

test('cardPeek.invalidate clears cache entries safely', () => {
    assert.equal(typeof cardPeek.invalidate, 'function');
    assert.doesNotThrow(() => {
        cardPeek.invalidate('card123');
        cardPeek.invalidate(); // full clear
    });
});

test('createPeekButton uses bold fi-tr-registration-paper icon with vector SVG', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../card-peek.js'), 'utf8');

    assert.ok(src.includes('class="fi fi-tr-registration-paper"'), 'Must have fi-tr-registration-paper class');
    assert.ok(src.includes('viewBox="0 0 512 512"'), 'Must have 512x512 viewBox for registration paper icon');
    assert.ok(src.includes('stroke-width="24"'), 'Must have stroke-width 24 for bold icon lines');
    assert.ok(src.includes('stroke="currentColor"'), 'Must have stroke=currentColor for bold vector outline');
    assert.ok(src.includes('REGISTRATION_PAPER_ICON'), 'Must define registration paper icon constant');
});

test('createCopyDescriptionButton creates styled copy button and handles copy feedback', async () => {
    function createMockElement(tagName) {
        const classList = new Set();
        const attributes = {};
        const listeners = {};
        const el = {
            tagName: tagName.toUpperCase(),
            classList: {
                add: (c) => classList.add(c),
                remove: (c) => classList.delete(c),
                contains: (c) => classList.has(c),
                toggle: (c, val) => {
                    if (val === undefined) val = !classList.has(c);
                    if (val) classList.add(c); else classList.delete(c);
                    return val;
                }
            },
            get className() {
                return Array.from(classList).join(' ');
            },
            set className(val) {
                classList.clear();
                (val || '').split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
            },
            setAttribute: (k, v) => { attributes[k] = String(v); },
            getAttribute: (k) => attributes[k] !== undefined ? attributes[k] : null,
            hasAttribute: (k) => k in attributes,
            removeAttribute: (k) => { delete attributes[k]; },
            addEventListener: (event, handler) => {
                listeners[event] = listeners[event] || [];
                listeners[event].push(handler);
            },
            removeEventListener: (event, handler) => {
                if (!listeners[event]) return;
                listeners[event] = listeners[event].filter(h => h !== handler);
            },
            dispatchEvent: (event) => {
                const handlers = listeners[event.type] || [];
                for (const h of handlers) h(event);
                return true;
            },
            click: function () {
                this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
            },
            appendChild: function (child) { return child; },
            remove: function () {},
            innerHTML: '',
            textContent: '',
            disabled: false
        };
        return el;
    }

    const prevDoc = global.document;
    const prevNav = global.navigator;

    global.document = {
        createElement: (tag) => createMockElement(tag),
        dispatchEvent: () => true
    };

    let copiedText = null;
    global.navigator = {
        clipboard: {
            writeText: async (text) => {
                copiedText = text;
                return true;
            }
        }
    };

    try {
        const cardData = { desc: 'Test card description scope' };
        const btn = cardPeek.createCopyDescriptionButton(cardData);

        assert.ok(btn.classList.contains('s4t-card-copy'), 'Must have .s4t-card-copy class');
        assert.ok(btn.classList.contains('s4t-card-peek-copy-btn'), 'Must have .s4t-card-peek-copy-btn class');
        assert.equal(btn.getAttribute('aria-label'), 'Copy description');
        assert.equal(btn.getAttribute('title'), null, 'Must NOT have title attribute to prevent browser native tooltip');
        assert.equal(btn.getAttribute('data-tooltip'), 'Copy description', 'Must have data-tooltip attribute for custom tooltip');

        // Simulate click
        btn.click();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(copiedText, 'Test card description scope', 'Description must be written to clipboard');
        assert.equal(btn.textContent, '✓', 'Button content must switch to checkmark');
        assert.ok(btn.hasAttribute('data-copied'), 'Button must receive [data-copied] attribute for animation');
    } finally {
        global.document = prevDoc;
        global.navigator = prevNav;
    }
});

test('sprint-helper.css styles copy button in top-right of description area with copied animation', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../sprint-helper.css'), 'utf8');

    assert.ok(css.includes('.s4t-card-peek-row1 {\n    position: relative;'), 'Row 1 must be relative for positioning copy button');
    assert.ok(css.includes('.s4t-card-peek-copy-btn {\n    position: absolute;\n    top: 8px;\n    right: 14px;'), 'Copy button must be absolute in top right');
    assert.ok(css.includes('.s4t-card-peek-copy-btn[data-copied] {'), 'Copy button must have [data-copied] styles');
    assert.ok(css.includes('animation: s4t-share-copied .28s ease-out;'), 'Copy button must trigger s4t-share-copied animation');
    assert.ok(css.includes('.s4t-card-peek-desc {\n    min-height: 120px;\n    max-height: 220px;\n    overflow-y: auto;\n    font-size: 13px;\n    line-height: 1.55;\n    color: var(--ds-text, #172b4d);\n    word-break: break-word;\n    scrollbar-width: thin;\n    padding-right: 36px;'), 'Description area must have padding-right to avoid copy button overlap');
});

test('card-peek.js immediately closes peek when a card is clicked or modal route opens', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const src = fs.readFileSync(path.join(__dirname, '../card-peek.js'), 'utf8');

    // Click handler on card surfaces
    assert.ok(src.includes("event.target.closest('[data-testid=\"list-card\"], .list-card, [data-testid=\"trello-card\"], a[href*=\"/c/\"]')"), 'Must capture card surface or card link click to close peek');
    // Pointerdown outside popover closes peek immediately
    assert.ok(src.includes('// Clicking outside the popover (including clicking the card to open it) immediately closes peek'), 'Pointerdown must close peek on outside clicks');
    // Modal route detection
    assert.ok(src.includes('if (current && popover && popover.classList.contains(\'s4t-active\')) {\n                closePeek();\n            }'), 'Must close peek immediately when route changes to /c/...');
    // MutationObserver modal check
    assert.ok(src.includes('if (isCardModalOpen() && popover && popover.classList.contains(\'s4t-active\')) {\n                    closePeek();\n                }'), 'MutationObserver must close peek if modal dialog appears');
});

test('isCardModalOpen accurately distinguishes between board shell container and an open card modal', () => {
    const prevDoc = global.document;
    const prevWin = global.window;

    try {
        global.window = { location: { pathname: '/b/board123/my-board' } };
        // Empty shell container in Trello board DOM
        global.document = {
            querySelector: (sel) => {
                if (sel.includes('[data-testid="card-back-container"]')) {
                    return { style: {}, hasAttribute: () => false };
                }
                return null;
            }
        };

        // Must NOT report modal open on board
        assert.equal(cardPeek.isCardModalOpen(), false, 'Board page with background shell must not be considered an open card modal');

        // Real open card modal
        global.document = {
            querySelector: (sel) => {
                if (sel.includes('[data-testid="card-back"]')) {
                    return {
                        style: {},
                        hasAttribute: () => false,
                        getClientRects: () => [{ width: 700, height: 600 }],
                        querySelector: (childSel) => ({ textContent: 'Card Title' })
                    };
                }
                return null;
            }
        };

        assert.equal(cardPeek.isCardModalOpen(), true, 'Visible modal with title must be recognized as open');
    } finally {
        global.document = prevDoc;
        global.window = prevWin;
    }
});

test('formatBullets converts markdown dash and asterisk list markers into round bullets', () => {
    assert.equal(cardPeek.formatBullets('- Item 1\n- Item 2'), '• Item 1\n• Item 2');
    assert.equal(cardPeek.formatBullets('* Item A\n* Item B'), '• Item A\n• Item B');
    assert.equal(cardPeek.formatBullets('+ Item X\n+ Item Y'), '• Item X\n• Item Y');
    assert.equal(cardPeek.formatBullets('  - Indented'), '  • Indented');
    // Dividers or numbers should remain untouched
    assert.equal(cardPeek.formatBullets('--- divider'), '--- divider');
    assert.equal(cardPeek.formatBullets('-10% decrease'), '-10% decrease');
});

test('safeRenderDescription renders authentic semantic nested lists with sub-bullets and headings', () => {
    const markdown = '# Scope\n- Feature A\n- Feature B\n  - Sub-feature B1\n  - Sub-feature B2\n* Feature C';
    const rendered = cardPeek.safeRenderDescription(markdown);

    assert.ok(rendered.includes('<h3 class="s4t-peek-h1">Scope</h3>'), 'Must render h3 heading for # Scope');
    assert.ok(rendered.includes('<ul>'), 'Must render ul for lists');
    assert.ok(rendered.includes('<li>Feature A'), 'Must render li for Feature A');
    assert.ok(rendered.includes('<li>Sub-feature B1'), 'Must render li for Sub-feature B1');
    assert.ok(rendered.includes('<li>Sub-feature B2'), 'Must render li for Sub-feature B2');
    assert.ok(rendered.includes('<li>Feature C'), 'Must render li for Feature C');
    // Verify nested ul exists for sub-features
    assert.ok(rendered.indexOf('<ul>') !== rendered.lastIndexOf('<ul>'), 'Must have nested <ul> for sub-bullets');
});

test('createCopyDescriptionButton copies authentic description text without hardcoded bullet replacement', async () => {
    function createMockElement(tagName) {
        const classList = new Set();
        const attributes = {};
        const listeners = {};
        return {
            tagName: tagName.toUpperCase(),
            classList: {
                add: (c) => classList.add(c),
                remove: (c) => classList.delete(c),
                contains: (c) => classList.has(c),
                toggle: (c, val) => {
                    if (val === undefined) val = !classList.has(c);
                    if (val) classList.add(c); else classList.delete(c);
                    return val;
                }
            },
            get className() {
                return Array.from(classList).join(' ');
            },
            set className(val) {
                classList.clear();
                (val || '').split(/\s+/).filter(Boolean).forEach(c => classList.add(c));
            },
            setAttribute: (k, v) => { attributes[k] = String(v); },
            getAttribute: (k) => attributes[k] !== undefined ? attributes[k] : null,
            hasAttribute: (k) => k in attributes,
            removeAttribute: (k) => { delete attributes[k]; },
            addEventListener: (event, handler) => {
                listeners[event] = listeners[event] || [];
                listeners[event].push(handler);
            },
            dispatchEvent: (event) => {
                const handlers = listeners[event.type] || [];
                for (const h of handlers) h(event);
                return true;
            },
            click: function () {
                this.dispatchEvent({ type: 'click', preventDefault() {}, stopPropagation() {} });
            },
            appendChild: function (c) { return c; },
            remove: function () {},
            innerHTML: '',
            textContent: '',
            disabled: false
        };
    }

    const prevDoc = global.document;
    const prevNav = global.navigator;

    let copied = null;
    let appendedToBody = null;

    global.document = {
        createElement: (tag) => createMockElement(tag),
        querySelector: () => null,
        dispatchEvent: () => true,
        body: {
            appendChild: (el) => { appendedToBody = el; return el; }
        }
    };
    global.navigator = {
        clipboard: {
            writeText: async (t) => { copied = t; return true; }
        }
    };

    try {
        const descText = '- Point 1\n- Point 2\n  - Sub point 2.1\n* Point 3';
        const btn = cardPeek.createCopyDescriptionButton({ desc: descText });
        btn.click();
        await new Promise(r => setTimeout(r, 20));

        assert.equal(copied, descText, 'Copied text must preserve authentic markdown dashes and sub-bullet structure');
        assert.ok(appendedToBody, 'Screen toast must be appended to document.body outside popup');
        assert.ok(appendedToBody.classList.contains('s4t-screen-toast'), 'Toast must have s4t-screen-toast class');
    } finally {
        global.document = prevDoc;
        global.navigator = prevNav;
    }
});

test('sprint-helper.css styles peek button box, right margin, and screen toast', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../sprint-helper.css'), 'utf8');

    assert.ok(css.includes('margin-right: 8px;'), 'Button must have 8px right margin');
    assert.ok(css.includes('border: 1px solid var(--ds-border, #091e4224);'), 'Button must have border');
    assert.ok(css.includes('border-radius: 5px;'), 'Button must have 5px border-radius');
    assert.ok(css.includes('.s4t-card-toast.s4t-screen-toast {'), 'Must include screen toast styling');
    assert.ok(css.includes('bottom: 24px !important;'), 'Screen toast must be positioned at bottom of screen');
    assert.ok(css.includes('.s4t-peek-bullet {'), 'Must include description bullet styling');
});

test('feature-preferences.js includes Quick View (Peek Out) under Card listing with feature icons', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const content = fs.readFileSync(path.join(__dirname, '../feature-preferences.js'), 'utf8');

    assert.ok(content.includes("'Card listing'"), 'Must define Card listing group');
    assert.ok(content.includes("'cardPeek'"), 'Must define cardPeek feature id');
    assert.ok(content.includes("'Quick View (Peek Out)'"), 'Must use Quick View (Peek Out) as title');
    assert.ok(content.includes("'titlePoints'"), 'Must define titlePoints feature id under Card listing');
    assert.ok(content.includes("'View points (Quick editing)'"), 'Must use View points (Quick editing) as title');
    assert.ok(content.includes('.s4t-card-peek-btn'), 'Must include button selector');
    assert.ok(content.includes('.s4t-card-peek-popover'), 'Must include popover selector');
    assert.ok(content.includes('.s4t-card-peek-backdrop'), 'Must include backdrop selector');
    assert.ok(content.includes('featureIcons'), 'Must define featureIcons map');
    assert.ok(content.includes("['checkAll','cardCopy']"), 'Card tools Left container must only include modal controls');

    // Verify icons appear after names
    const appendTitleIndex = content.indexOf('heading.appendChild(title);');
    const appendIconIndex = content.indexOf('heading.appendChild(icon);');
    assert.ok(appendTitleIndex !== -1 && appendIconIndex !== -1, 'Must append title and icon to heading');
    assert.ok(appendTitleIndex < appendIconIndex, 'Title must be appended before icon so icon appears after name');

    // Verify Card listing is at the bottom of groups
    const cardToolsIndex = content.indexOf("['Card tools'");
    const cardListingIndex = content.indexOf("['Card listing'");
    assert.ok(cardToolsIndex !== -1 && cardListingIndex !== -1, 'Must define Card tools and Card listing groups');
    assert.ok(cardToolsIndex < cardListingIndex, 'Card listing must be positioned after Card tools at the bottom');
});

test('documentation and manifest mention Quick View and version 1.108', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf8'));
    const readme = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
    const changelog = fs.readFileSync(path.join(__dirname, '../CHANGELOG.md'), 'utf8');
    const workflowRules = fs.readFileSync(path.join(__dirname, '../WORKFLOW-RULES.md'), 'utf8');

    assert.equal(manifest.version, '1.108', 'Manifest version must be 1.108');
    assert.ok(manifest.content_scripts[0].js.includes('card-peek.js'), 'card-peek.js must be in manifest content scripts');

    assert.ok(readme.includes('Quick View (Peek Out)'), 'README must mention Quick View (Peek Out)');
    assert.ok(changelog.includes('## 1.108'), 'CHANGELOG must have 1.108 entry');
    assert.ok(changelog.includes('Quick View (Peek Out)'), 'CHANGELOG must mention Quick View (Peek Out)');
    assert.ok(workflowRules.includes('## Quick View (Peek Out)'), 'WORKFLOW-RULES must have Quick View section');
});

test('tooltip z-index is higher than peek popover and selector covers peek copy button', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const css = fs.readFileSync(path.join(__dirname, '../sprint-helper.css'), 'utf8');
    const sprintHelper = fs.readFileSync(path.join(__dirname, '../sprint-helper.js'), 'utf8');

    // Popover has z-index: 2147483510, tooltip must have higher z-index so it renders in front
    assert.ok(css.includes('#s4t-icon-tooltip {\n    position: fixed; z-index: 2147483647 !important;'), 'Tooltip must have max z-index to show in front of popover');
    assert.ok(sprintHelper.includes('.s4t-card-peek-copy-btn[data-tooltip]'), 'Tooltip selector must explicitly match peek copy button');
});

