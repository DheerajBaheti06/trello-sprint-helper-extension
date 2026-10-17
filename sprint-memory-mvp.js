(function () {
  if (window.__s4tMemoryMvpLoaded) return;
  window.__s4tMemoryMvpLoaded = true;

  var config = Object.assign(
    {
      enabled: true,
      useAi: false,
      offlineMode: true,
      autoOpen: false,
      uiTitle: "Sprint Memory",
    },
    window.S4T_MEMORY_CONFIG || {},
  );

  var metadata = {
    feature: "Sprint Memory MVP",
    built: "2026-10-17",
    builtBy: "Dheeraj",
    design: "Minimal Gemini/GPT-inspired Trello panel",
    why: "Keep sprint context, release rationale, and ownership visible without changing the existing Sprint Helper workflows.",
    sprint: "Current sprint",
    mode: config.useAi ? "AI-assisted" : "Offline local mode",
  };

  function safeText(node) {
    if (!node) return "";
    var text = (node.textContent || "").replace(/\s+/g, " ").trim();
    return text;
  }

  function detectBoardName() {
    var title = document.title || "";
    var boardName = title.replace(/\s*-\s*Trello.*$/i, "").trim();
    if (boardName) return boardName;
    var match = /^.*\/b\/[^/]+\/?\s*$/i.test(location.pathname || "");
    if (match) return "Current board";
    return "Current board";
  }

  function detectSprintName() {
    var stored = null;
    try {
      stored = localStorage.getItem("s4t-memory-sprint-name");
    } catch (_) {}
    if (stored) return stored;

    var now = new Date();
    var month = now.toLocaleString("en-US", { month: "short" });
    var year = now.getFullYear();
    return "Sprint • " + month + " " + year;
  }

  function readCardStats() {
    var cards = [];
    var listNames = {};

    var nodeList = document.querySelectorAll(
      '[data-testid="list-card"], .list-card, .js-card',
    );
    Array.prototype.forEach.call(nodeList, function (card) {
      if (!card || !card.isConnected) return;

      var cardNode = card;
      var titleEl = cardNode.querySelector(
        '[data-testid="card-name"], .list-card-title, .js-card-name, .card-title',
      );
      var listEl = cardNode.closest('[data-testid="list"], .list, .js-list');
      var labelEls = cardNode.querySelectorAll(
        '[data-testid="card-label"], .card-label, .list-card-label, .js-card-label',
      );

      var title =
        safeText(titleEl) ||
        safeText(cardNode.querySelector(".card-short-id")) ||
        "Untitled card";
      var listName =
        safeText(
          listEl &&
            listEl.querySelector(
              '[data-testid="list-header-name"], .list-header-name, .list-header, .js-list-header',
            ),
        ) || "Unsorted";
      var labels = Array.prototype.map
        .call(labelEls, function (el) {
          return safeText(el);
        })
        .filter(Boolean);

      cards.push({
        title: title,
        list: listName,
        labels: labels,
      });

      listNames[listName] = (listNames[listName] || 0) + 1;
    });

    return {
      totalCards: cards.length,
      listCount: Object.keys(listNames).length,
      lists: listNames,
      cards: cards.slice(0, 10),
    };
  }

  function buildSummary() {
    var boardName = detectBoardName();
    var stats = readCardStats();
    var totalCards = stats.totalCards;
    var listCount = stats.listCount;
    var topList =
      Object.keys(stats.lists).sort(function (a, b) {
        return stats.lists[b] - stats.lists[a];
      })[0] || "Current board";

    return {
      feature: metadata.feature,
      built: metadata.built,
      builtBy: metadata.builtBy,
      design: metadata.design,
      why: metadata.why,
      board: boardName,
      sprint: detectSprintName(),
      mode: metadata.mode,
      totalCards: totalCards,
      listCount: listCount,
      topList: topList,
      sampleCards: stats.cards,
      summary:
        totalCards +
        " cards across " +
        listCount +
        " lists. The busiest list is " +
        topList +
        ". This board is being reviewed in " +
        metadata.mode +
        ". ",
    };
  }

  function ensureStyles() {
    if (document.getElementById("s4t-memory-panel-style")) return;

    var style = document.createElement("style");
    style.id = "s4t-memory-panel-style";
    style.textContent = [
      "#s4t-memory-panel {",
      "  position: fixed;",
      "  right: 22px;",
      "  top: 72px;",
      "  width: 410px;",
      "  max-width: calc(100vw - 24px);",
      "  background: rgba(15, 19, 23, 0.98);",
      "  border: 1px solid rgba(148, 163, 184, 0.24);",
      "  border-radius: 20px;",
      "  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.45);",
      "  color: #f4f7fb;",
      "  z-index: 2147483646;",
      "  display: none;",
      "  overflow: hidden;",
      '  font-family: Inter, "Segoe UI", Arial, sans-serif;',
      "}",
      "#s4t-memory-panel.open { display: block; }",
      "#s4t-memory-panel * { box-sizing: border-box; }",
      "#s4t-memory-panel-header {",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: space-between;",
      "  gap: 10px;",
      "  padding: 16px 18px 14px;",
      "  border-bottom: 1px solid rgba(148, 163, 184, 0.15);",
      "  background: linear-gradient(135deg, #101827, #111827 55%, #0b1220);",
      "}",
      "#s4t-memory-title-wrap { display: flex; align-items: center; gap: 10px; }",
      "#s4t-memory-icon {",
      "  width: 32px;",
      "  height: 32px;",
      "  border-radius: 10px;",
      "  display: grid;",
      "  place-items: center;",
      "  background: linear-gradient(135deg, rgba(59,130,246,0.28), rgba(168,85,247,0.28));",
      "  color: #dbeafe;",
      "  font-size: 16px;",
      "  font-weight: 700;",
      "}",
      "#s4t-memory-title { font-weight: 700; font-size: 15px; letter-spacing: 0.02em; }",
      "#s4t-memory-status {",
      "  font-size: 10px;",
      "  font-weight: 700;",
      "  padding: 5px 8px;",
      "  border-radius: 999px;",
      "  background: rgba(16, 185, 129, 0.12);",
      "  color: #a7f3d0;",
      "  border: 1px solid rgba(16,185,129,0.28);",
      "}",
      "#s4t-memory-body { padding: 16px 18px 18px; }",
      "#s4t-memory-grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; margin-bottom: 14px; }",
      ".s4t-memory-card {",
      "  background: rgba(15, 23, 42, 0.72);",
      "  border: 1px solid rgba(148, 163, 184, 0.16);",
      "  border-radius: 14px;",
      "  padding: 10px 12px;",
      "}",
      ".s4t-memory-label {",
      "  display: block;",
      "  font-size: 10px;",
      "  color: #93c5fd;",
      "  letter-spacing: 0.04em;",
      "  text-transform: uppercase;",
      "  margin-bottom: 4px;",
      "}",
      ".s4t-memory-value {",
      "  font-size: 12px;",
      "  line-height: 1.45;",
      "  color: #edf6ff;",
      "  font-weight: 600;",
      "}",
      "#s4t-memory-summary {",
      "  background: rgba(17, 24, 39, 0.9);",
      "  border: 1px solid rgba(148, 163, 184, 0.18);",
      "  border-radius: 16px;",
      "  padding: 12px 14px;",
      "  margin-bottom: 14px;",
      "  color: #dfeaf7;",
      "  font-size: 12px;",
      "  line-height: 1.6;",
      "}",
      "#s4t-memory-actions { display: flex; gap: 8px; }",
      ".s4t-memory-btn {",
      "  border: 1px solid rgba(148,163,184,0.2);",
      "  background: rgba(15, 23, 42, 0.8);",
      "  color: #e5eefc;",
      "  padding: 9px 12px;",
      "  border-radius: 10px;",
      "  cursor: pointer;",
      "  font-weight: 600;",
      "  font-size: 12px;",
      "}",
      ".s4t-memory-btn.primary {",
      "  background: linear-gradient(135deg, #2563eb, #8b5cf6);",
      "  border-color: rgba(96,165,250,0.6);",
      "}",
      ".s4t-memory-mini {",
      "  margin-top: 12px;",
      "  font-size: 11px;",
      "  color: #9fb4d1;",
      "  line-height: 1.5;",
      "}",
      "#s4t-memory-launch {",
      "  display: inline-flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  border: 1px solid rgba(148, 163, 184, 0.22);",
      "  border-radius: 10px;",
      "  background: rgba(15, 23, 42, 0.82);",
      "  color: #eaf4ff;",
      "  padding: 8px 12px;",
      "  min-height: 32px;",
      "  font-weight: 700;",
      "  font-size: 12px;",
      "  cursor: pointer;",
      "  letter-spacing: 0.02em;",
      "}",
      "#s4t-memory-launch:hover { filter: brightness(1.08); }",
      "#s4t-memory-panel-close {",
      "  border: 1px solid rgba(148,163,184,0.2);",
      "  background: rgba(15,23,42,0.75);",
      "  color: #edf6ff;",
      "  border-radius: 9px;",
      "  width: 30px;",
      "  height: 30px;",
      "  cursor: pointer;",
      "  font-size: 16px;",
      "}",
      "@media (max-width: 420px) { #s4t-memory-panel { width: calc(100vw - 14px); right: 8px; top: 60px; } }",
    ].join("\n");
    document.head.appendChild(style);
  }

  function renderPanelContent(summary) {
    var panel = document.getElementById("s4t-memory-panel");
    if (!panel) return;

    panel.innerHTML = [
      '<div id="s4t-memory-panel-header">',
      '  <div id="s4t-memory-title-wrap">',
      '    <div id="s4t-memory-icon">M</div>',
      '    <div id="s4t-memory-title">' +
        (summary.feature || metadata.feature) +
        "</div>",
      "  </div>",
      '  <button id="s4t-memory-panel-close" type="button" aria-label="Close Sprint Memory">×</button>',
      "</div>",
      '<div id="s4t-memory-body">',
      '  <div id="s4t-memory-grid">',
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Feature</span><div class="s4t-memory-value">' +
        summary.feature +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Built</span><div class="s4t-memory-value">' +
        summary.built +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Built by</span><div class="s4t-memory-value">' +
        summary.builtBy +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Sprint</span><div class="s4t-memory-value">' +
        summary.sprint +
        "</div></div>",
      "  </div>",
      '  <div id="s4t-memory-summary"><strong>Why it exists.</strong> ' +
        summary.why +
        "</div>",
      '  <div id="s4t-memory-grid">',
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Board</span><div class="s4t-memory-value">' +
        summary.board +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Mode</span><div class="s4t-memory-value">' +
        summary.mode +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Cards</span><div class="s4t-memory-value">' +
        summary.totalCards +
        "</div></div>",
      '    <div class="s4t-memory-card"><span class="s4t-memory-label">Lists</span><div class="s4t-memory-value">' +
        summary.listCount +
        "</div></div>",
      "  </div>",
      '  <div id="s4t-memory-summary"><strong>Design</strong> ' +
        summary.design +
        "</div>",
      '  <div id="s4t-memory-actions">',
      '    <button type="button" class="s4t-memory-btn primary" id="s4t-memory-refresh-btn">Refresh summary</button>',
      '    <button type="button" class="s4t-memory-btn" id="s4t-memory-close-btn">Close</button>',
      "  </div>",
      '  <div class="s4t-memory-mini">Offline mode is active by default. This MVP uses the current Trello board context and existing extension data only; no conversation history is stored.</div>',
      "</div>",
    ].join("");

    var closeBtn = document.getElementById("s4t-memory-panel-close");
    if (closeBtn) closeBtn.addEventListener("click", closeMemoryPanel);

    var refreshBtn = document.getElementById("s4t-memory-refresh-btn");
    if (refreshBtn)
      refreshBtn.addEventListener("click", function () {
        var fresh = buildSummary();
        renderPanelContent(fresh);
      });

    var closeAction = document.getElementById("s4t-memory-close-btn");
    if (closeAction) closeAction.addEventListener("click", closeMemoryPanel);
  }

  function openMemoryPanel() {
    ensureStyles();
    var panel = document.getElementById("s4t-memory-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "s4t-memory-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Sprint Memory");
      document.body.appendChild(panel);
    }

    var summary = buildSummary();
    renderPanelContent(summary);
    panel.classList.add("open");
  }

  function closeMemoryPanel() {
    var panel = document.getElementById("s4t-memory-panel");
    if (panel) panel.classList.remove("open");
  }

  function ensureToolbarButton() {
    if (document.getElementById("s4t-memory-launch")) return;

    var target = document.getElementById("s4t-board-tools");
    if (!target) {
      var header = document.querySelector(
        'header, [data-testid="header"], [class*="header"], [role="navigation"]',
      );
      if (!header) return;
      target = header;
    }

    var button = document.createElement("button");
    button.id = "s4t-memory-launch";
    button.type = "button";
    button.textContent = "Sprint Memory";
    button.title = "Open Sprint Memory MVP";
    button.setAttribute("aria-label", "Open Sprint Memory MVP");
    button.addEventListener("click", function () {
      openMemoryPanel();
    });

    if (target.id === "s4t-board-tools") {
      target.appendChild(button);
    } else {
      target.appendChild(button);
    }
  }

  function boot() {
    ensureStyles();
    ensureToolbarButton();
    if (config.autoOpen) openMemoryPanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.s4tMemoryMvp = {
    open: openMemoryPanel,
    close: closeMemoryPanel,
    buildSummary: buildSummary,
    config: config,
    metadata: metadata,
  };
})();
