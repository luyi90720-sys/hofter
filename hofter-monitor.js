(function() {
  "use strict";

  /* ============================================
   * hofter-monitor - 前台监控悬浮球控制台
   * 独立运行，hofter退出后仍可使用
   * ============================================ */

  var PLUGIN_ID = "hofter-monitor";
  var ROOT_CLASS = "hofter-monitor-plugin";
  var _state = {
    containerEl: null,
    styleEl: null,
    logs: [],
    maxLogs: 500,
    panelVisible: false,
    ballVisible: true,
    autoScroll: true,
    filterLevel: "all", /* all, info, warn, error */
    observers: [],
    domWatchEnabled: true,
    convWatchEnabled: true,
    position: { x: 20, y: 200 },
    dragging: false,
    dragStart: { x: 0, y: 0 },
    posStart: { x: 0, y: 0 }
  };

  /* ─── 日志工具 ─── */
  function addLog(level, source, message) {
    var entry = {
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }),
      level: level,
      source: source,
      message: message
    };
    _state.logs.push(entry);
    if (_state.logs.length > _state.maxLogs) _state.logs.shift();
    if (_state.panelVisible) appendLogEntry(entry);
  }

  function appendLogEntry(entry) {
    var container = document.getElementById("hm-log-container");
    if (!container) return;
    if (_state.filterLevel !== "all" && entry.level !== _state.filterLevel) return;
    var div = document.createElement("div");
    div.className = "hm-log-entry hm-log-" + entry.level;
    div.innerHTML = '<span class="hm-log-time">' + entry.time + '</span>' +
      '<span class="hm-log-level">' + entry.level.toUpperCase() + '</span>' +
      '<span class="hm-log-source">[' + escapeHtml(entry.source) + ']</span>' +
      '<span class="hm-log-msg">' + escapeHtml(entry.message) + '</span>';
    container.appendChild(div);
    if (_state.autoScroll) container.scrollTop = container.scrollHeight;
    /* 限制DOM中的日志数量 */
    while (container.children.length > 200) container.removeChild(container.firstChild);
  }

  function escapeHtml(s) { if (!s) return ""; return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  function refreshLogPanel() {
    var container = document.getElementById("hm-log-container");
    if (!container) return;
    container.innerHTML = "";
    for (var i = 0; i < _state.logs.length; i++) {
      appendLogEntry(_state.logs[i]);
    }
  }

  /* ─── DOM 监控 ─── */
  function startDOMWatch() {
    if (!_state.domWatchEnabled) return;
    /* 监控Roche侧边栏的DOM变化 */
    var sidebarSelectors = ['[class*="sidebar"]', '[class*="chat-list"]', '[class*="conv-list"]', 'nav', 'aside'];
    for (var s = 0; s < sidebarSelectors.length; s++) {
      var el = document.querySelector(sidebarSelectors[s]);
      if (el) {
        addLog("info", "dom-watch", "Found sidebar: " + sidebarSelectors[s] + " class=" + (el.className || "").substring(0, 60));
        try {
          var obs = new MutationObserver(function(mutations) {
            for (var m = 0; m < mutations.length; m++) {
              var mut = mutations[m];
              if (mut.type === "childList" && mut.addedNodes.length > 0) {
                for (var n = 0; n < mut.addedNodes.length; n++) {
                  var node = mut.addedNodes[n];
                  if (node.nodeType === 1) {
                    var tag = node.tagName;
                    var cn = (node.className || "").substring(0, 40);
                    var dataAttrs = "";
                    if (node.attributes) {
                      for (var a = 0; a < node.attributes.length; a++) {
                        if (node.attributes[a].name.indexOf("data-") === 0) {
                          dataAttrs += node.attributes[a].name + "=" + node.attributes[a].value.substring(0, 20) + " ";
                        }
                      }
                    }
                    addLog("info", "dom-mutation", "Added: <" + tag + "> class=" + cn + " " + dataAttrs.trim());
                  }
                }
              }
            }
          });
          obs.observe(el, { childList: true, subtree: true });
          _state.observers.push(obs);
          addLog("info", "dom-watch", "Observing: " + sidebarSelectors[s]);
        } catch(e) {
          addLog("error", "dom-watch", "Failed to observe: " + e.message);
        }
      }
    }

    /* 监控URL变化 */
    var lastUrl = window.location.href;
    var urlCheckInterval = setInterval(function() {
      if (window.location.href !== lastUrl) {
        addLog("info", "url-watch", "URL changed: " + lastUrl + " -> " + window.location.href);
        lastUrl = window.location.href;
      }
    }, 500);
    _state.observers.push({ disconnect: function() { clearInterval(urlCheckInterval); } });

    /* 记录当前页面结构概览 */
    addLog("info", "dom-scan", "=== DOM Structure Scan ===");
    var allDivs = document.querySelectorAll("div[class]");
    var classStats = {};
    for (var d = 0; d < allDivs.length; d++) {
      var cls = allDivs[d].className;
      if (typeof cls === "string") {
        var parts = cls.split(/\s+/);
        for (var p = 0; p < parts.length; p++) {
          if (parts[p].indexOf("sidebar") >= 0 || parts[p].indexOf("chat") >= 0 || parts[p].indexOf("conv") >= 0 || parts[p].indexOf("session") >= 0 || parts[p].indexOf("message") >= 0 || parts[p].indexOf("contact") >= 0) {
            classStats[parts[p]] = (classStats[parts[p]] || 0) + 1;
          }
        }
      }
    }
    for (var k in classStats) {
      if (classStats.hasOwnProperty(k)) {
        addLog("info", "dom-scan", "Class: ." + k + " count=" + classStats[k]);
      }
    }
    addLog("info", "dom-scan", "=== Scan Complete ===");
  }

  /* ─── 会话列表监控 ─── */
  function startConvWatch() {
    if (!_state.convWatchEnabled) return;
    if (window.roche && roche.conversation && roche.conversation.list) {
      roche.conversation.list().then(function(list) {
        addLog("info", "conv-watch", "Conversations found: " + (list ? list.length : 0));
        if (list && list.length > 0) {
          for (var i = 0; i < Math.min(list.length, 10); i++) {
            var c = list[i];
            addLog("info", "conv-watch", "Conv[" + i + "]: id=" + (c.id||"") + " name=" + (c.name||c.title||"") + " type=" + (c.type||""));
          }
        }
      }).catch(function(e) {
        addLog("error", "conv-watch", "Failed to list conversations: " + (e && e.message ? e.message : String(e)));
      });
    } else {
      addLog("warn", "conv-watch", "roche.conversation API not available");
    }
  }

  /* ─── 拦截 console ─── */
  function hookConsole() {
    var origLog = console.log;
    var origWarn = console.warn;
    var origError = console.error;

    console.log = function() {
      var msg = Array.prototype.slice.call(arguments).join(" ");
      if (msg.indexOf("[hofter") >= 0 || msg.indexOf("hofter") >= 0) {
        addLog("info", "console", msg.substring(0, 200));
      }
      origLog.apply(console, arguments);
    };
    console.warn = function() {
      var msg = Array.prototype.slice.call(arguments).join(" ");
      addLog("warn", "console", msg.substring(0, 200));
      origWarn.apply(console, arguments);
    };
    console.error = function() {
      var msg = Array.prototype.slice.call(arguments).join(" ");
      addLog("error", "console", msg.substring(0, 200));
      origError.apply(console, arguments);
    };

    _state.observers.push({
      disconnect: function() {
        console.log = origLog;
        console.warn = origWarn;
        console.error = origError;
      }
    });
  }

  /* ─── 拦截网络请求 ─── */
  function hookFetch() {
    var origFetch = window.fetch;
    window.fetch = function() {
      var url = arguments[0];
      if (typeof url === "string" && (url.indexOf("chat") >= 0 || url.indexOf("conversation") >= 0 || url.indexOf("message") >= 0)) {
        addLog("info", "network", "fetch: " + url.substring(0, 120));
      }
      return origFetch.apply(this, arguments);
    };
    _state.observers.push({ disconnect: function() { window.fetch = origFetch; } });
  }

  /* ─── UI 渲染 ─── */
  function getStyles() {
    return `
      .${ROOT_CLASS} { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .hm-ball {
        position: fixed; z-index: 999999; width: 44px; height: 44px; border-radius: 50%;
        background: linear-gradient(135deg, #667eea, #764ba2); color: #fff;
        display: flex; align-items: center; justify-content: center; cursor: grab;
        box-shadow: 0 2px 12px rgba(102,126,234,0.4); font-size: 18px; font-weight: 700;
        user-select: none; transition: transform 0.15s, box-shadow 0.15s;
      }
      .hm-ball:hover { transform: scale(1.1); box-shadow: 0 4px 20px rgba(102,126,234,0.6); }
      .hm-ball:active { cursor: grabbing; }
      .hm-panel {
        position: fixed; z-index: 999998; top: 60px; right: 16px;
        width: 380px; max-height: 70vh; background: #1a1a2e; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5); display: flex; flex-direction: column;
        overflow: hidden; font-size: 12px; color: #e0e0e0;
      }
      .hm-panel-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 12px 16px; background: #16213e; border-bottom: 1px solid #0f3460;
      }
      .hm-panel-title { font-size: 14px; font-weight: 700; color: #e94560; }
      .hm-panel-actions { display: flex; gap: 8px; }
      .hm-btn {
        padding: 4px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-size: 11px; font-weight: 600; transition: background 0.15s;
      }
      .hm-btn-primary { background: #e94560; color: #fff; }
      .hm-btn-primary:hover { background: #c73652; }
      .hm-btn-secondary { background: #0f3460; color: #e0e0e0; }
      .hm-btn-secondary:hover { background: #1a4a8a; }
      .hm-btn-active { background: #e94560; color: #fff; }
      .hm-filter-bar {
        display: flex; gap: 4px; padding: 8px 16px; background: #16213e;
        border-bottom: 1px solid #0f3460;
      }
      .hm-filter-btn {
        padding: 3px 8px; border-radius: 4px; border: none; cursor: pointer;
        font-size: 10px; font-weight: 600; background: #0f3460; color: #a0a0a0;
      }
      .hm-filter-btn.active { background: #e94560; color: #fff; }
      .hm-log-container {
        flex: 1; overflow-y: auto; padding: 8px; min-height: 200px; max-height: 50vh;
      }
      .hm-log-entry {
        padding: 3px 6px; border-radius: 4px; margin-bottom: 2px;
        font-family: "Cascadia Code", "Fira Code", monospace; font-size: 11px;
        line-height: 1.5; word-break: break-all;
      }
      .hm-log-entry:hover { background: rgba(255,255,255,0.05); }
      .hm-log-info { color: #a0c4ff; }
      .hm-log-warn { color: #ffd166; background: rgba(255,209,102,0.08); }
      .hm-log-error { color: #ef476f; background: rgba(239,71,111,0.08); }
      .hm-log-time { color: #555; margin-right: 6px; }
      .hm-log-level { font-weight: 700; margin-right: 4px; min-width: 36px; display: inline-block; }
      .hm-log-source { color: #06d6a0; margin-right: 4px; }
      .hm-log-msg { color: #e0e0e0; }
      .hm-status-bar {
        display: flex; justify-content: space-between; padding: 6px 16px;
        background: #16213e; border-top: 1px solid #0f3460; font-size: 10px; color: #555;
      }
    `;
  }

  function renderBall() {
    var ball = document.createElement("div");
    ball.className = "hm-ball";
    ball.id = "hm-ball";
    ball.textContent = "M";
    ball.style.left = _state.position.x + "px";
    ball.style.top = _state.position.y + "px";
    /* 拖拽 */
    ball.addEventListener("mousedown", function(e) {
      _state.dragging = true;
      _state.dragStart = { x: e.clientX, y: e.clientY };
      _state.posStart = { x: _state.position.x, y: _state.position.y };
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!_state.dragging) return;
      _state.position.x = _state.posStart.x + (e.clientX - _state.dragStart.x);
      _state.position.y = _state.posStart.y + (e.clientY - _state.dragStart.y);
      ball.style.left = _state.position.x + "px";
      ball.style.top = _state.position.y + "px";
    });
    document.addEventListener("mouseup", function() { _state.dragging = false; });
    /* 点击切换面板 */
    ball.addEventListener("click", function() {
      if (_state.dragging) return;
      togglePanel();
    });
    document.body.appendChild(ball);
  }

  function togglePanel() {
    if (_state.panelVisible) {
      var panel = document.getElementById("hm-panel");
      if (panel) panel.remove();
      _state.panelVisible = false;
    } else {
      renderPanel();
      _state.panelVisible = true;
    }
  }

  function renderPanel() {
    var panel = document.createElement("div");
    panel.className = "hm-panel";
    panel.id = "hm-panel";
    panel.innerHTML = `
      <div class="hm-panel-header">
        <span class="hm-panel-title">Hofter Monitor</span>
        <div class="hm-panel-actions">
          <button class="hm-btn hm-btn-secondary" onclick="window.__hofterMonitor.scanDOM()">Scan DOM</button>
          <button class="hm-btn hm-btn-secondary" onclick="window.__hofterMonitor.listConvs()">Convs</button>
          <button class="hm-btn hm-btn-secondary" onclick="window.__hofterMonitor.clearLogs()">Clear</button>
          <button class="hm-btn hm-btn-primary" onclick="window.__hofterMonitor.togglePanel()">X</button>
        </div>
      </div>
      <div class="hm-filter-bar">
        <button class="hm-filter-btn ${_state.filterLevel === 'all' ? 'active' : ''}" onclick="window.__hofterMonitor.setFilter('all')">All</button>
        <button class="hm-filter-btn ${_state.filterLevel === 'info' ? 'active' : ''}" onclick="window.__hofterMonitor.setFilter('info')">Info</button>
        <button class="hm-filter-btn ${_state.filterLevel === 'warn' ? 'active' : ''}" onclick="window.__hofterMonitor.setFilter('warn')">Warn</button>
        <button class="hm-filter-btn ${_state.filterLevel === 'error' ? 'active' : ''}" onclick="window.__hofterMonitor.setFilter('error')">Error</button>
      </div>
      <div class="hm-log-container" id="hm-log-container"></div>
      <div class="hm-status-bar">
        <span id="hm-log-count">Logs: ${_state.logs.length}</span>
        <span>Auto-scroll: ON</span>
      </div>
    `;
    document.body.appendChild(panel);
    refreshLogPanel();
  }

  /* ─── API ─── */
  window.__hofterMonitor = {
    togglePanel: function() { togglePanel(); },
    clearLogs: function() { _state.logs = []; refreshLogPanel(); addLog("info", "system", "Logs cleared"); },
    setFilter: function(level) {
      _state.filterLevel = level;
      var btns = document.querySelectorAll(".hm-filter-btn");
      var levels = ["all", "info", "warn", "error"];
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", levels[i] === level);
      }
      refreshLogPanel();
    },
    scanDOM: function() {
      addLog("info", "dom-scan", "=== Manual DOM Scan ===");
      /* 扫描所有可能的聊天列表元素 */
      var selectors = [
        '[class*="sidebar"]', '[class*="chat-list"]', '[class*="conv-list"]',
        '[class*="session-list"]', '[class*="contact-list"]', '[class*="message-list"]',
        'nav', 'aside', '[role="navigation"]', '[role="complementary"]',
        '[class*="list-item"]', '[class*="chat-item"]', '[class*="conv-item"]',
        '[data-id]', '[data-conversation-id]', '[data-session-id]'
      ];
      for (var s = 0; s < selectors.length; s++) {
        var els = document.querySelectorAll(selectors[s]);
        if (els.length > 0) {
          addLog("info", "dom-scan", selectors[s] + " => " + els.length + " elements");
          for (var e = 0; e < Math.min(els.length, 3); e++) {
            var el = els[e];
            var tag = el.tagName;
            var cn = (el.className || "").substring(0, 60);
            var dataAttrs = "";
            if (el.attributes) {
              for (var a = 0; a < el.attributes.length; a++) {
                if (el.attributes[a].name.indexOf("data-") === 0 || el.attributes[a].name === "id" || el.attributes[a].name === "href") {
                  dataAttrs += el.attributes[a].name + "=" + el.attributes[a].value.substring(0, 30) + " ";
                }
              }
            }
            var text = (el.textContent || "").substring(0, 40).replace(/\n/g, " ");
            addLog("info", "dom-scan", "  [" + e + "] <" + tag + "> class=" + cn + " " + dataAttrs.trim() + " text=" + text);
          }
        }
      }
      addLog("info", "dom-scan", "URL: " + window.location.href);
      addLog("info", "dom-scan", "Hash: " + window.location.hash);
      addLog("info", "dom-scan", "=== Scan Complete ===");
    },
    listConvs: function() {
      if (window.roche && roche.conversation && roche.conversation.list) {
        addLog("info", "conv-watch", "Fetching conversation list...");
        roche.conversation.list().then(function(list) {
          addLog("info", "conv-watch", "Conversations: " + (list ? list.length : 0));
          if (list) {
            for (var i = 0; i < list.length; i++) {
              var c = list[i];
              var keys = Object.keys(c).join(", ");
              addLog("info", "conv-watch", "Conv[" + i + "]: " + JSON.stringify(c).substring(0, 150));
              addLog("info", "conv-watch", "Conv[" + i + "] keys: " + keys);
            }
          }
        }).catch(function(e) {
          addLog("error", "conv-watch", "Failed: " + (e && e.message ? e.message : String(e)));
        });
      } else {
        addLog("warn", "conv-watch", "roche.conversation API not available");
      }
    },
    log: function(level, source, message) { addLog(level, source, message); }
  };

  /* ─── 插件注册 ─── */
  if (window.roche && roche.plugin && roche.plugin.register) {
    roche.plugin.register({
      id: PLUGIN_ID,
      name: "Hofter Monitor",
      description: "前台监控悬浮球控制台",
      version: "1.0.0",
      mount: function(container) {
        _state.containerEl = container;
        /* 注入样式 */
        var styleEl = document.createElement("style");
        styleEl.textContent = getStyles();
        styleEl.setAttribute("data-hofter-monitor-style", "1");
        document.head.appendChild(styleEl);
        _state.styleEl = styleEl;
        /* 渲染悬浮球 */
        renderBall();
        /* 启动监控 */
        hookConsole();
        hookFetch();
        startDOMWatch();
        startConvWatch();
        addLog("info", "system", "Hofter Monitor v1.0.0 started");
      },
      unmount: function(container) {
        /* 清理 */
        for (var i = 0; i < _state.observers.length; i++) {
          try { _state.observers[i].disconnect(); } catch(e) {}
        }
        _state.observers = [];
        var ball = document.getElementById("hm-ball");
        if (ball) ball.remove();
        var panel = document.getElementById("hm-panel");
        if (panel) panel.remove();
        if (_state.styleEl && _state.styleEl.parentNode) _state.styleEl.parentNode.removeChild(_state.styleEl);
        addLog("info", "system", "Hofter Monitor stopped");
      }
    });
  }
})();
