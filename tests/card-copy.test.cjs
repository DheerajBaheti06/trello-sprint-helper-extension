const test = require('node:test');
const assert = require('node:assert/strict');

// Set up simulated DOM environment for card-copy.js
function createMockElement(tagName, attributes = {}, text = '') {
    const classList = new Set();
    const attrs = { ...attributes };
    const children = [];
    const listeners = {};
    let styleText = '';

    const el = {
        nodeType: 1,
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
        setAttribute: (k, v) => { attrs[k] = String(v); },
        getAttribute: (k) => attrs[k] !== undefined ? attrs[k] : null,
        hasAttribute: (k) => k in attrs,
        removeAttribute: (k) => { delete attrs[k]; },
        get attributes() {
            return Object.keys(attrs).map(k => ({ name: k, value: attrs[k] }));
        },
        get style() {
            return {
                cssText: styleText,
                getPropertyValue: () => '',
                setProperty: (k, v) => { styleText += `${k}:${v};`; }
            };
        },
        get childNodes() {
            return children;
        },
        get textContent() {
            let res = text;
            for (const ch of children) {
                res += ch.textContent;
            }
            return res;
        },
        set textContent(val) {
            text = val;
            children.length = 0;
        },
        get innerHTML() {
            return children.map(c => c.nodeType === 3 ? c.textContent : `<${c.tagName.toLowerCase()}>${c.innerHTML}</${c.tagName.toLowerCase()}>`).join('') + text;
        },
        get innerText() {
            return this.textContent;
        },
        append: (...nodes) => {
            for (const n of nodes) {
                n.parentElement = el;
                children.push(n);
            }
        },
        appendChild: (node) => {
            node.parentElement = el;
            children.push(node);
            return node;
        },
        after: (...nodes) => {
            if (el.parentElement) {
                const idx = el.parentElement.childNodes.indexOf(el);
                for (let i = 0; i < nodes.length; i++) {
                    nodes[i].parentElement = el.parentElement;
                    el.parentElement.childNodes.splice(idx + 1 + i, 0, nodes[i]);
                }
            }
        },
        remove: () => {
            if (el.parentElement) {
                const idx = el.parentElement.childNodes.indexOf(el);
                if (idx !== -1) el.parentElement.childNodes.splice(idx, 1);
            }
        },
        cloneNode: function (deep) {
            const clone = createMockElement(this.tagName, attrs, text);
            clone.className = this.className;
            if (deep) {
                for (const ch of children) {
                    if (ch.nodeType === 3) {
                        clone.appendChild(createMockTextNode(ch.textContent));
                    } else {
                        clone.appendChild(ch.cloneNode(true));
                    }
                }
            }
            return clone;
        },
        querySelector: (sel) => {
            const all = el.querySelectorAll(sel);
            return all.length ? all[0] : null;
        },
        querySelectorAll: (sel) => {
            const results = [];
            function traverse(node) {
                for (const child of node.childNodes) {
                    if (child.nodeType === 1) {
                        if (matchesSelector(child, sel)) results.push(child);
                        traverse(child);
                    }
                }
            }
            traverse(el);
            return results;
        },
        closest: (sel) => {
            let curr = el;
            while (curr) {
                if (curr.nodeType === 1 && matchesSelector(curr, sel)) return curr;
                curr = curr.parentElement;
            }
            return null;
        },
        matches: (sel) => matchesSelector(el, sel),
        addEventListener: (event, handler) => {
            listeners[event] = listeners[event] || [];
            listeners[event].push(handler);
        },
        dispatchEvent: (event) => {
            const handlers = listeners[event.type] || [];
            for (const h of handlers) h(event);
            return true;
        },
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 50, width: 100, height: 50 }),
        parentElement: null,
        isConnected: true
    };

    if (attributes.class) el.className = attributes.class;
    return el;
}

function createMockTextNode(txt) {
    return {
        nodeType: 3,
        textContent: txt,
        parentElement: null
    };
}

function matchesSelector(el, selector) {
    const parts = selector.split(',').map(s => s.trim());
    return parts.some(part => {
        if (part.startsWith('#')) return el.getAttribute('id') === part.slice(1);
        if (part.startsWith('.')) return el.classList.contains(part.slice(1));
        if (part.startsWith('[')) {
            const match = part.match(/\[([a-zA-Z0-9_-]+)(?:([*^$]?=)"?([^"]*)"?)?\]/);
            if (match) {
                const attr = match[1];
                const op = match[2];
                const val = match[3];
                const actual = el.getAttribute(attr);
                if (actual === null) return false;
                if (!op) return true;
                if (op === '=') return actual === val;
                if (op === '*=') return actual.includes(val);
                if (op === '^=') return actual.startsWith(val);
                if (op === '$=') return actual.endsWith(val);
            }
        }
        return el.tagName.toLowerCase() === part.toLowerCase();
    });
}

// Global DOM setup
global.document = {
    createElement: (tag) => createMockElement(tag),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    dispatchEvent: () => true,
    body: createMockElement('body')
};
global.window = {
    location: { pathname: '/c/test1234/my-card' },
    addEventListener: () => {}
};
global.navigator = {
    clipboard: {
        writeText: async () => true,
        write: async () => true
    }
};
global.MutationObserver = class {
    observe() {}
    disconnect() {}
};

const cardCopy = require('../card-copy.js');

test('extractStructuredText formats unordered lists and nested sub-bullets faithfully', () => {
    // <div>
    //   <p>Task overview:</p>
    //   <ul>
    //     <li>First bullet</li>
    //     <li>Second bullet
    //       <ul>
    //         <li>Sub-bullet 2.1</li>
    //         <li>Sub-bullet 2.2</li>
    //       </ul>
    //     </li>
    //     <li>Third bullet</li>
    //   </ul>
    // </div>
    const container = createMockElement('div');
    const p = createMockElement('p');
    p.appendChild(createMockTextNode('Task overview:'));
    container.appendChild(p);

    const ul = createMockElement('ul');

    const li1 = createMockElement('li');
    li1.appendChild(createMockTextNode('First bullet'));
    ul.appendChild(li1);

    const li2 = createMockElement('li');
    li2.appendChild(createMockTextNode('Second bullet'));

    const subUl = createMockElement('ul');
    const subLi1 = createMockElement('li');
    subLi1.appendChild(createMockTextNode('Sub-bullet 2.1'));
    const subLi2 = createMockElement('li');
    subLi2.appendChild(createMockTextNode('Sub-bullet 2.2'));
    subUl.appendChild(subLi1);
    subUl.appendChild(subLi2);
    li2.appendChild(subUl);
    ul.appendChild(li2);

    const li3 = createMockElement('li');
    li3.appendChild(createMockTextNode('Third bullet'));
    ul.appendChild(li3);

    container.appendChild(ul);

    const extracted = cardCopy.extractStructuredText(container);

    assert.ok(extracted.includes('Task overview:'));
    assert.ok(extracted.includes('- First bullet'));
    assert.ok(extracted.includes('- Second bullet'));
    assert.ok(extracted.includes('  - Sub-bullet 2.1'), 'Sub-bullet 2.1 must have 2-space indent and dash');
    assert.ok(extracted.includes('  - Sub-bullet 2.2'), 'Sub-bullet 2.2 must have 2-space indent and dash');
    assert.ok(extracted.includes('- Third bullet'));
    assert.ok(!extracted.includes('•'), 'Must not inject hardcoded unicode bullet character');
});

test('extractStructuredText formats ordered lists and nested sub-lists', () => {
    const container = createMockElement('div');
    const ol = createMockElement('ol');

    const li1 = createMockElement('li');
    li1.appendChild(createMockTextNode('Step 1'));
    ol.appendChild(li1);

    const li2 = createMockElement('li');
    li2.appendChild(createMockTextNode('Step 2'));

    const subOl = createMockElement('ol');
    const subLi = createMockElement('li');
    subLi.appendChild(createMockTextNode('Sub-step 2.1'));
    subOl.appendChild(subLi);
    li2.appendChild(subOl);
    ol.appendChild(li2);

    container.appendChild(ol);

    const extracted = cardCopy.extractStructuredText(container);

    assert.ok(extracted.includes('1. Step 1'));
    assert.ok(extracted.includes('2. Step 2'));
    assert.ok(extracted.includes('  1. Sub-step 2.1'), 'Nested ordered list item must have 2-space indent and numbering');
});

test('extractStructuredText excludes edit button text from description', () => {
    const container = createMockElement('div');
    const descContent = createMockElement('div', { class: 'ak-renderer-document' });
    descContent.appendChild(createMockTextNode('Genuine card scope description text.'));
    container.appendChild(descContent);

    // Edit button as present in modern Trello
    const editBtn = createMockElement('button', { 'data-testid': 'card-back-description-edit-button' });
    editBtn.appendChild(createMockTextNode('Edit'));
    container.appendChild(editBtn);

    const extracted = cardCopy.extractStructuredText(container);

    assert.equal(extracted, 'Genuine card scope description text.');
    assert.ok(!extracted.includes('Edit'), 'Must not include Edit button text');
});

test('extractStructuredText returns value when source is textarea editor', () => {
    const textarea = createMockElement('textarea');
    textarea.value = '- Draft bullet 1\n  - Draft sub-bullet\n- Draft bullet 2';

    const extracted = cardCopy.extractStructuredText(textarea);

    assert.equal(extracted, '- Draft bullet 1\n  - Draft sub-bullet\n- Draft bullet 2');
});

test('commentPayload cleans HTML and produces structured list plain text', () => {
    const commentNode = createMockElement('div', { class: 'ak-renderer-document' });
    const h3 = createMockElement('h3');
    h3.appendChild(createMockTextNode('Tech Design'));
    commentNode.appendChild(h3);

    const ul = createMockElement('ul');
    const li = createMockElement('li');
    li.appendChild(createMockTextNode('Design API endpoint'));
    ul.appendChild(li);
    commentNode.appendChild(ul);

    const payload = cardCopy.commentPayload(commentNode);

    assert.ok(payload.html.includes('<h3>Tech Design</h3>'));
    assert.ok(payload.text.includes('Tech Design'));
    assert.ok(payload.text.includes('- Design API endpoint'), 'Comment plain text must format list item with dash');
});

test('commentPayload on description node generates rich HTML and structured sub-bullets', () => {
    const descNode = createMockElement('div', { class: 'ak-renderer-document' });
    const p = createMockElement('p');
    p.appendChild(createMockTextNode('Scope details:'));
    descNode.appendChild(p);

    const ul = createMockElement('ul');
    const li1 = createMockElement('li');
    li1.appendChild(createMockTextNode('Primary feature'));
    const subUl = createMockElement('ul');
    const subLi = createMockElement('li');
    subLi.appendChild(createMockTextNode('Sub-feature A'));
    subUl.appendChild(subLi);
    li1.appendChild(subUl);
    ul.appendChild(li1);
    descNode.appendChild(ul);

    // Edit button that should be removed
    const editBtn = createMockElement('button', { 'data-testid': 'edit-button' }, 'Edit');
    descNode.appendChild(editBtn);

    const payload = cardCopy.commentPayload(descNode);

    assert.ok(payload.html.includes('<ul>'), 'Payload HTML must include ul tag');
    assert.ok(payload.html.includes('<li>Primary feature'), 'Payload HTML must include li tag');
    assert.ok(payload.html.includes('<li>Sub-feature A'), 'Payload HTML must include sub-li tag');
    assert.ok(!payload.html.includes('Edit'), 'Payload HTML must not include Edit button');
    assert.ok(payload.text.includes('- Primary feature'), 'Plain text must include dash bullet');
    assert.ok(payload.text.includes('  - Sub-feature A'), 'Plain text must include indented sub-bullet');
});
