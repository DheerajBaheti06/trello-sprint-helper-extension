const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('sprint-helper.js', 'utf8');
const helpers = source.slice(source.indexOf('function s4tEscapeHtml('), source.indexOf('function s4tSprintSummary('));
const renderer = source.slice(source.indexOf('function renderMembersHtml('), source.indexOf('function s4tBindMetricCopy('));
const ctx = vm.createContext({URL});
vm.runInContext(helpers + renderer, ctx);

test('member markup treats names, usernames and initials as text and metrics as numbers', () => {
    const attack = '\"><svg onload="alert(1)">';
    const html = ctx.renderMembersHtml([{name:attack, username:attack, initials:attack,
        avatar:'https://evil.example/tracker', assigned:attack, completed:attack,
        remaining:attack, completionPercentage:attack, cardsTotal:attack}], false);
    assert.ok(!html.includes('<svg'));
    assert.ok(!html.includes('<img'));
    assert.ok(html.includes('&quot;&gt;&lt;svg'));
    assert.ok(html.includes('0 assigned'));
    assert.ok(html.includes('width:0%;'));
    const normal = ctx.renderMembersHtml([{name:'A & B', avatar:'https://trello-members.s3.amazonaws.com/avatar.png',
        assigned:8, completed:3, remaining:5, completionPercentage:37.5, cardsTotal:2}], false);
    assert.ok(normal.includes('alt="A &amp; B"'));
    assert.ok(normal.includes('8 assigned'));
});

test('avatar URLs reject executable schemes, credentials and lookalike hosts', () => {
    for (const value of ['javascript:alert(1)', 'data:image/svg+xml,<svg/>', 'http://trello.com/a',
        'https://trello.com.evil.example/a', 'https://eviltrello.com/a', 'https://user:pass@trello.com/a', '//trello.com/a']) {
        assert.equal(ctx.s4tSafeAvatarUrl(value), '', value);
    }
    for (const value of ['https://trello.com/a', 'https://avatar-management--avatars.us-west-2.prod.public.atl-paas.net/a',
        'https://trello-members.s3.amazonaws.com/a', 'https://secure.gravatar.com/avatar/a']) {
        assert.equal(ctx.s4tSafeAvatarUrl(value), value);
    }
});

test('spreadsheet export escapes real card fields and neutralizes formula prefixes', async () => {
    let captured;
    const button = {text(){return this;}, after(){return this;}};
    const anchor = {attr(){return this;}, 0:{dispatchEvent(){}}, remove(){}};
    const $ = () => ({find:()=>({attr:()=>'/board.json'}), ...anchor});
    $.each = (items, callback) => items.forEach((item, i) => callback(i, item));
    $.getJSON = (_, callback) => callback({lists:[{id:'a',name:'=HYPERLINK("https://evil.example")'}],
        cards:[{idList:'a',name:'<img src=x onerror=alert(document.domain)>',desc:'\t+SUM(1,1)'}]});
    const exportCtx = vm.createContext({$, $excel_btn:button, reg:/\((\d+)\)/, URL,
        Blob:class {constructor(parts){captured=parts.join('');}},
        window:{URL:{createObjectURL:()=> 'blob:test'}},
        document:{location:{href:'https://trello.com/b/test/board'},createEvent:()=>({initMouseEvent(){}})}});
    vm.runInContext(helpers + source.slice(source.indexOf('function showExcelExport('), source.indexOf('// for settings')), exportCtx);
    exportCtx.showExcelExport();
    assert.ok(!captured.includes('<img'));
    assert.ok(captured.includes('&lt;img src=x onerror=alert(document.domain)&gt;'));
    assert.ok(captured.includes('&#39;=HYPERLINK'));
    assert.ok(captured.includes('&#39;\t+SUM'));
    for (const value of ['=1+1', '+1', '-1', '@SUM(A1)', '\r\n =1']) {
        assert.ok(ctx.s4tSpreadsheetText(value).startsWith('&#39;'));
    }
    assert.equal(ctx.s4tSpreadsheetText('ordinary task'), 'ordinary task');
});

test('board heading escapes data and extension resources are scoped to Trello', () => {
    assert.ok(source.includes('s4tEscapeHtml(data.boardName)'));
    const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
    for (const entry of manifest.web_accessible_resources) {
        assert.deepEqual(entry.matches, ['https://trello.com/*']);
    }
});
