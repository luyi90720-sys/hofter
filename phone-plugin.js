/**
 * ============================================================
 *  小手机 — Roche 异世界通信终端插件 v1.0.1
 *  
 *  功能：
 *  - 悬浮球入口，SVG小手机图标，可拖拽，位置持久化
 *  - 聊天面板：读取线上会话消息
 *  - 实时捕捉线下<msg>标签，注入线上会话（通过roche API）
 *  - 三种输入状态：草稿 / Enter发送(仅线上) / 发送键(触发线下)
 *  - 线下发送拦截：拼接小手机待发消息
 *  - CSS预设系统：保存/切换/编辑多套预设
 *  - 双击头像切换角色
 *  - 设置面板：启用/关闭、重置位置、预设管理
 *  
 *  消息格式：<msg from="角色名" device="设备名">内容</msg>
 *  数据存储：roche.storage + roche.memory API
 * ============================================================
 */

(function () {
  'use strict';

  var PLUGIN_ID = 'roche-phone';
  var APP_ID = 'roche-phone-app';
  var DEFAULT_MSG_LIMIT = 75;
  var CAPTURE_INTERVAL = 2000;
  var POLL_INTERVAL = 2000;

  var MSG_TAG_REGEX = /<msg\s+from=["']([^"']*)["'](?:\s+device=["']([^"']*)["'])?\s*>([\s\S]*?)<\/msg>/g;

  var PHONE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" ry="3"/><line x1="12" y1="18" x2="12" y2="18.01" stroke-width="2"/></svg>';
  var SEND_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  var SETTINGS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
  var CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  var DEFAULT_PHONE_CSS = '.roche-phone-panel{--phone-bg:#fff;--phone-header-bg:rgba(255,255,255,.95);--phone-header-text:#000;--phone-header-sub:#a1a1aa;--phone-bubble-sent-bg:#000;--phone-bubble-sent-text:#fff;--phone-bubble-received-bg:#f4f4f5;--phone-bubble-received-text:#18181b;--phone-input-bg:#f4f4f5;--phone-input-text:#18181b;--phone-border:#f4f4f5;--phone-accent:#000;--phone-font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;--phone-font-size:14px;--phone-bubble-radius:18px;--phone-shadow:0 12px 40px rgba(0,0,0,.15);--phone-min-width:280px;--phone-min-height:360px;--phone-radius:24px}.roche-phone-panel{position:fixed;z-index:99999;min-width:var(--phone-min-width);min-height:var(--phone-min-height);background:var(--phone-bg);border-radius:var(--phone-radius);box-shadow:var(--phone-shadow);border:1px solid var(--phone-border);display:flex;flex-direction:column;overflow:hidden;font-family:var(--phone-font-family);font-size:var(--phone-font-size);transition:opacity .2s ease,transform .2s ease;resize:both}.roche-phone-panel.is-hidden{opacity:0;transform:scale(.92) translateY(12px);pointer-events:none}.roche-phone-header{display:flex;align-items:center;padding:8px 10px;background:var(--phone-header-bg);backdrop-filter:blur(12px);border-bottom:1px solid var(--phone-border);flex-shrink:0;user-select:none;gap:6px}.roche-phone-header-drag{flex:1;min-width:20px;min-height:28px;cursor:move}.roche-phone-size-btns{display:flex;gap:2px;flex-shrink:0}.roche-phone-size-btn{width:26px;height:26px;border:none;background:transparent;color:var(--phone-header-sub);border-radius:6px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;font-size:14px;font-weight:700;line-height:1}.roche-phone-size-btn:hover{background:var(--phone-input-bg);color:var(--phone-header-text)}.roche-phone-header-avatar{width:36px;height:36px;border-radius:50%;background:#e4e4e7;flex-shrink:0;background-size:cover;background-position:center;cursor:pointer;transition:box-shadow .15s}.roche-phone-header-avatar:hover{box-shadow:0 0 0 2px var(--phone-accent)}.roche-phone-header-info{flex:1;min-width:0}.roche-phone-header-name{font-weight:700;font-size:15px;color:var(--phone-header-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.roche-phone-header-status{font-size:11px;color:var(--phone-header-sub);letter-spacing:.05em}.roche-phone-header-btn{width:32px;height:32px;border:none;background:transparent;color:var(--phone-header-sub);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;flex-shrink:0}.roche-phone-header-btn:hover{background:var(--phone-input-bg);color:var(--phone-header-text)}.roche-phone-header-btn svg{width:18px;height:18px}.roche-phone-messages{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:6px;overscroll-behavior-y:contain;scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.12) transparent}.roche-phone-messages::-webkit-scrollbar{width:5px}.roche-phone-messages::-webkit-scrollbar-track{background:transparent}.roche-phone-messages::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:999px}.roche-phone-load-more{text-align:center;padding:8px 0}.roche-phone-load-more button{background:none;border:1px solid var(--phone-border);border-radius:999px;padding:6px 16px;font-size:12px;color:var(--phone-header-sub);cursor:pointer;transition:all .15s}.roche-phone-load-more button:hover{background:var(--phone-input-bg);color:var(--phone-header-text)}.roche-phone-msg{display:flex;flex-direction:column;max-width:78%}.roche-phone-msg--sent{align-self:flex-end;align-items:flex-end}.roche-phone-msg--received{align-self:flex-start;align-items:flex-start}.roche-phone-msg-sender{font-size:11px;font-weight:600;color:var(--phone-header-sub);margin-bottom:2px;padding:0 4px}.roche-phone-msg-bubble{padding:9px 14px;border-radius:var(--phone-bubble-radius);word-break:break-word;white-space:pre-wrap;line-height:1.45;font-size:var(--phone-font-size)}.roche-phone-msg--sent .roche-phone-msg-bubble{background:var(--phone-bubble-sent-bg);color:var(--phone-bubble-sent-text);border-bottom-right-radius:4px}.roche-phone-msg--received .roche-phone-msg-bubble{background:var(--phone-bubble-received-bg);color:var(--phone-bubble-received-text);border-bottom-left-radius:4px}.roche-phone-msg-time{font-size:10px;color:var(--phone-header-sub);margin-top:2px;padding:0 4px}.roche-phone-input-area{display:flex;align-items:flex-end;padding:10px 12px;border-top:1px solid var(--phone-border);background:var(--phone-bg);flex-shrink:0;gap:8px}.roche-phone-input{flex:1;resize:none;border:none;outline:none;background:var(--phone-input-bg);color:var(--phone-input-text);border-radius:20px;padding:10px 16px;font-family:var(--phone-font-family);font-size:var(--phone-font-size);line-height:1.4;max-height:100px;overflow-y:auto}.roche-phone-input::placeholder{color:var(--phone-header-sub)}.roche-phone-send-btn{width:40px;height:40px;border-radius:50%;border:none;background:var(--phone-accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:transform .15s}.roche-phone-send-btn:hover{transform:scale(1.05)}.roche-phone-send-btn:active{transform:scale(.95)}.roche-phone-send-btn svg{width:18px;height:18px}.roche-phone-ball{position:fixed;z-index:99998;width:52px;height:52px;border-radius:50%;background:#fff;box-shadow:0 4px 16px rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;touch-action:none;transition:transform .15s,box-shadow .15s;border:1px solid rgba(0,0,0,.06)}.roche-phone-ball:hover{transform:scale(1.08);box-shadow:0 6px 20px rgba(0,0,0,.18)}.roche-phone-ball:active{transform:scale(.95)}.roche-phone-ball svg{width:24px;height:24px;color:#18181b}.roche-phone-ball-badge{position:absolute;top:-2px;right:-2px;min-width:18px;height:18px;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid #fff;pointer-events:none}.roche-phone-ball-badge.is-empty{display:none}.roche-phone-char-picker{position:absolute;top:100%;left:0;right:0;background:var(--phone-bg);border-radius:0 0 var(--phone-radius) var(--phone-radius);box-shadow:0 8px 24px rgba(0,0,0,.1);border-top:1px solid var(--phone-border);max-height:240px;overflow-y:auto;z-index:10}.roche-phone-char-item{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;transition:background .15s}.roche-phone-char-item:hover{background:var(--phone-input-bg)}.roche-phone-char-item.is-active{background:var(--phone-input-bg);font-weight:700}.roche-phone-char-item-avatar{width:32px;height:32px;border-radius:50%;background:#e4e4e7;flex-shrink:0;background-size:cover;background-position:center}.roche-phone-char-item-name{font-size:14px;color:var(--phone-header-text)}.roche-phone-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--phone-header-sub);padding:40px 20px;text-align:center}.roche-phone-empty svg{width:48px;height:48px;margin-bottom:12px;opacity:.3}.roche-phone-empty p{font-size:13px;line-height:1.5}.roche-phone-settings{position:absolute;inset:0;background:var(--phone-bg);z-index:20;display:flex;flex-direction:column;overflow:hidden}.roche-phone-settings-header{display:flex;align-items:center;padding:12px 14px;border-bottom:1px solid var(--phone-border);flex-shrink:0}.roche-phone-settings-title{flex:1;font-weight:700;font-size:15px;color:var(--phone-header-text)}.roche-phone-settings-body{flex:1;overflow-y:auto;padding:16px}.roche-phone-settings-section{margin-bottom:20px}.roche-phone-settings-label{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--phone-header-sub);margin-bottom:8px}.roche-phone-settings-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--phone-border)}.roche-phone-settings-row-label{font-size:14px;color:var(--phone-header-text)}.roche-phone-settings-btn{padding:8px 16px;border-radius:999px;border:1px solid var(--phone-border);background:var(--phone-bg);color:var(--phone-header-text);font-size:13px;font-weight:600;cursor:pointer;transition:all .15s}.roche-phone-settings-btn:hover{background:var(--phone-input-bg)}.roche-phone-preset-item{display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:12px;margin-bottom:4px;cursor:pointer;transition:background .15s}.roche-phone-preset-item:hover{background:var(--phone-input-bg)}.roche-phone-preset-item.is-active{background:var(--phone-input-bg);font-weight:700}.roche-phone-preset-name{font-size:14px;color:var(--phone-header-text)}.roche-phone-preset-actions{display:flex;gap:4px}.roche-phone-preset-action{width:28px;height:28px;border:none;background:transparent;color:var(--phone-header-sub);border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:14px;transition:all .15s}.roche-phone-preset-action:hover{background:var(--phone-input-bg);color:var(--phone-header-text)}.roche-phone-css-editor{width:100%;min-height:120px;border:1px solid var(--phone-border);border-radius:12px;padding:10px;font-family:"SFMono-Regular",Consolas,monospace;font-size:12px;line-height:1.5;resize:vertical;background:var(--phone-input-bg);color:var(--phone-input-text);outline:none}.roche-phone-css-editor:focus{border-color:var(--phone-accent)}';

  // ========== 全局状态 ==========
  var S = {
    roche: null, ball: null, panel: null, styleEl: null,
    isOpen: false, isSettingsOpen: false, isCharPickerOpen: false,
    currentCharId: null, currentConvId: null, currentCharName: '', currentCharAvatar: '',
    chars: [], conversations: [],
    phoneMessages: [], // 小手机自己的消息列表（从roche.storage读取）
    displayedCount: DEFAULT_MSG_LIMIT,
    pendingOnlineMsgs: [], unreadCount: 0,
    ballPos: { left: 20, top: 200 }, panelPos: { left: 40, top: 60 }, panelSize: { width: 380, height: 580 },
    presets: [], activePreset: 'default', enabled: true,
    intervals: [], captureTimer: null,
    processedMsgKeys: {}, lastCaptureTs: {},
    dragging: false
  };

  // ========== 工具 ==========
  function escapeHtml(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function formatTime(ts) { var d = new Date(ts); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); }
  function genId() { return 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 10000); }

  // ========== 持久化 ==========
  async function loadState() {
    try {
      var p;
      p = await S.roche.storage.get('phone_ballPos'); if (p) S.ballPos = p;
      p = await S.roche.storage.get('phone_panelPos'); if (p) S.panelPos = p;
      p = await S.roche.storage.get('phone_panelSize'); if (p) S.panelSize = p;
      p = await S.roche.storage.get('phone_enabled'); if (p !== null && p !== undefined) S.enabled = p;
      p = await S.roche.storage.get('phone_presets'); if (p && Array.isArray(p)) S.presets = p;
      p = await S.roche.storage.get('phone_activePreset'); if (p) S.activePreset = p;
      p = await S.roche.storage.get('phone_currentCharId'); if (p) S.currentCharId = p;
    } catch (e) { console.warn('[小手机] 加载状态失败:', e); }
  }
  async function saveState() {
    try {
      await S.roche.storage.set('phone_ballPos', S.ballPos);
      await S.roche.storage.set('phone_panelPos', S.panelPos);
      await S.roche.storage.set('phone_panelSize', S.panelSize);
      await S.roche.storage.set('phone_enabled', S.enabled);
      await S.roche.storage.set('phone_presets', S.presets);
      await S.roche.storage.set('phone_activePreset', S.activePreset);
      if (S.currentCharId) await S.roche.storage.set('phone_currentCharId', S.currentCharId);
    } catch (e) { console.warn('[小手机] 保存状态失败:', e); }
  }

  // ========== 小手机消息存储（roche.storage） ==========
  async function getPhoneMessages() {
    var key = 'phone_msgs_' + (S.currentConvId || 'default');
    var msgs = await S.roche.storage.get(key);
    return msgs || [];
  }
  async function addPhoneMessage(msg) {
    var key = 'phone_msgs_' + (S.currentConvId || 'default');
    var msgs = await getPhoneMessages();
    msgs.push(msg);
    await S.roche.storage.set(key, msgs);
    S.phoneMessages = msgs;
  }

  // ========== 角色与会话 ==========
  async function loadChars() {
    try {
      var chars = await S.roche.character.list();
      S.chars = chars || [];
      if (!S.currentCharId && S.chars.length > 0) S.currentCharId = S.chars[0].id;
      await loadCurrentChar();
    } catch (e) { console.warn('[小手机] 加载角色列表失败:', e); }
  }
  async function loadCurrentChar() {
    if (!S.currentCharId) return;
    try {
      var c = await S.roche.character.get(S.currentCharId);
      if (c) {
        S.currentCharName = c.handle || c.name || '未知';
        S.currentCharAvatar = c.avatar || '';
        S.currentConvId = c.conversationId || '';
        console.log('[小手机] 当前角色:', S.currentCharName, '会话ID:', S.currentConvId);
      }
    } catch (e) { console.warn('[小手机] 加载角色信息失败:', e); }
  }
  async function loadConversations() {
    try {
      var convs = await S.roche.conversation.list();
      S.conversations = convs || [];
    } catch (e) { console.warn('[小手机] 加载会话列表失败:', e); }
  }

  // ========== 消息读取与渲染 ==========
  async function loadMessages() {
    if (!S.currentConvId) return;
    try {
      S.phoneMessages = await getPhoneMessages();
      renderMessages();
    } catch (e) { console.warn('[小手机] 加载消息失败:', e); }
  }
  function renderMessages() {
    var ct = document.querySelector('.roche-phone-messages');
    if (!ct) return;
    var msgs = S.phoneMessages;
    var start = Math.max(0, msgs.length - S.displayedCount);
    var vis = msgs.slice(start);
    var html = '';
    if (start > 0) html += '<div class="roche-phone-load-more"><button onclick="window.__rochePhoneLoadMore()">加载更多 (剩余 ' + start + ' 条)</button></div>';
    for (var i = 0; i < vis.length; i++) {
      var m = vis[i];
      var isSent = m.isMe === true;
      var side = isSent ? 'sent' : 'received';
      var sn = isSent ? '' : (m.senderName || S.currentCharName);
      var t = (m.text || '').trim();
      if (!t) continue;
      html += '<div class="roche-phone-msg roche-phone-msg--' + side + '">';
      if (!isSent && sn) html += '<div class="roche-phone-msg-sender">' + escapeHtml(sn) + '</div>';
      html += '<div class="roche-phone-msg-bubble">' + escapeHtml(t) + '</div>';
      html += '<div class="roche-phone-msg-time">' + formatTime(m.timestamp) + '</div></div>';
    }
    if (!html || html.indexOf('roche-phone-msg--') === -1) {
      html = '<div class="roche-phone-empty">' + PHONE_SVG + '<p>暂无消息<br>双击头像切换角色，当角色在线下发送手机消息时，会实时同步到这里</p></div>';
    }
    var isAtBottom = ct.scrollHeight - ct.scrollTop - ct.clientHeight < 30;
    ct.innerHTML = html;
    if (isAtBottom) ct.scrollTop = ct.scrollHeight;
  }
  window.__rochePhoneLoadMore = function () { S.displayedCount += 50; loadMessages(); };

  // ========== 消息捕捉：通过 roche API 轮询线下会话 ==========
  function startCapture() {
    S.captureTimer = setInterval(function () { pollOfflineMessages(); }, CAPTURE_INTERVAL);
    // 首次立即执行一次
    pollOfflineMessages();
  }
  function stopCapture() {
    if (S.captureTimer) { clearInterval(S.captureTimer); S.captureTimer = null; }
  }

  async function pollOfflineMessages() {
    if (!S.currentCharId) return;
    try {
      // 收集所有可能的会话ID（多来源，不跳过任何会话）
      var convIds = [];

      // 来源1：角色主会话（最可能包含线下<msg>标签的会话）
      if (S.currentConvId) {
        convIds.push(S.currentConvId);
        console.log('[小手机] 使用角色主会话:', S.currentConvId);
      }

      // 来源2：通过 conversation.list({ memberId }) 查找
      try {
        var convs = await S.roche.conversation.list({ memberId: S.currentCharId });
        if (convs && convs.length > 0) {
          for (var i = 0; i < convs.length; i++) {
            var cid = convs[i].id || convs[i].conversationId;
            if (cid && convIds.indexOf(cid) === -1) {
              convIds.push(cid);
            }
          }
        }
        console.log('[小手机] conversation.list(memberId) 找到', convs ? convs.length : 0, '个会话');
      } catch (e) {
        console.warn('[小手机] conversation.list(memberId) 失败:', e);
      }

      // 来源3：列出所有会话，筛选包含该角色的
      if (convIds.length === 0) {
        try {
          var allConvs = await S.roche.conversation.list();
          if (allConvs && allConvs.length > 0) {
            for (var i = 0; i < allConvs.length; i++) {
              var c = allConvs[i];
              var cid = c.id || c.conversationId;
              // 匹配：contactId 是该角色，或 members 包含该角色
              if (cid && (c.contactId === S.currentCharId ||
                  (c.members && c.members.indexOf(S.currentCharId) !== -1))) {
                if (convIds.indexOf(cid) === -1) convIds.push(cid);
              }
            }
          }
          console.log('[小手机] conversation.list(all) 筛选后找到', convIds.length, '个会话');
        } catch (e) {
          console.warn('[小手机] conversation.list(all) 失败:', e);
        }
      }

      if (convIds.length === 0) {
        console.warn('[小手机] 未找到任何会话，无法捕捉消息');
        return;
      }

      // 遍历所有会话，查找 <msg> 标签
      for (var i = 0; i < convIds.length; i++) {
        var convId = convIds[i];
        try {
          var msgs = await S.roche.memory.getShortTerm({
            conversationId: convId,
            limit: 30
          });
          if (!msgs || msgs.length === 0) continue;

          // 按会话追踪时间戳，避免跨会话干扰
          var lastTs = S.lastCaptureTs[convId] || 0;
          var newMsgs = [];
          for (var j = 0; j < msgs.length; j++) {
            var m = msgs[j];
            if (m.timestamp && m.timestamp > lastTs) {
              newMsgs.push(m);
            }
          }

          if (newMsgs.length === 0) continue;
          console.log('[小手机] 会话', convId, '发现', newMsgs.length, '条新消息');

          for (var j = 0; j < newMsgs.length; j++) {
            var msg = newMsgs[j];
            var text = msg.text || '';
            if (!text) continue;
            var parsed = parseMsgTags(text);
            for (var k = 0; k < parsed.length; k++) {
              var msgKey = convId + '_' + (msg.id || (msg.timestamp + '_' + j)) + '_' + k;
              if (!S.processedMsgKeys[msgKey]) {
                S.processedMsgKeys[msgKey] = true;
                await injectMsgToPhone(parsed[k]);
              }
            }
          }

          // 更新该会话的最后时间戳
          var maxTs = 0;
          for (var j = 0; j < newMsgs.length; j++) {
            if (newMsgs[j].timestamp && newMsgs[j].timestamp > maxTs) {
              maxTs = newMsgs[j].timestamp;
            }
          }
          if (maxTs > 0) S.lastCaptureTs[convId] = maxTs;

        } catch (e) {
          console.warn('[小手机] 读取会话消息失败:', convId, e);
        }
      }
    } catch (e) {
      console.warn('[小手机] 轮询线下消息失败:', e);
    }
  }

  function parseMsgTags(text) {
    var results = [];
    var regex = new RegExp(MSG_TAG_REGEX.source, 'g');
    var match;
    while ((match = regex.exec(text)) !== null) {
      results.push({ from: match[1] || '', device: match[2] || '', content: match[3] || '' });
    }
    if (results.length > 0) {
      console.log('[小手机] 解析到', results.length, '条<msg>标签:', results.map(function(r) { return r.from + ':' + r.content.substring(0, 30); }).join(', '));
    }
    return results;
  }

  async function injectMsgToPhone(pm) {
    var isUser = pm.from === 'user' || pm.from === '{{user}}';
    // from="char" 或 from="<char>" 都是角色消息，用角色名显示
    var senderName = isUser ? '' : S.currentCharName;
    if (!isUser && pm.from && pm.from !== 'char' && pm.from !== '<char>') {
      senderName = pm.from; // 其他角色名直接用
    }
    var msg = {
      id: genId(),
      isMe: isUser,
      text: pm.content.trim(),
      timestamp: Date.now(),
      senderName: senderName
    };
    if (!isUser) msg.senderId = S.currentCharId || '';

    await addPhoneMessage(msg);
    console.log('[小手机] 消息已注入:', pm.from, '→', senderName, ':', pm.content.substring(0, 50));

    if (S.isOpen) {
      renderMessages();
    }
    if (!isUser && !S.isOpen) {
      S.unreadCount++;
      updateBadge();
    }
  }

  // ========== 消息发送 ==========
  async function sendOnlineOnly(text) {
    if (!text.trim()) return;
    var msg = { id: genId(), isMe: true, text: text.trim(), timestamp: Date.now() };
    await addPhoneMessage(msg);
    S.pendingOnlineMsgs.push(text.trim());
    renderMessages();
  }

  async function sendOnlineAndOffline(text) {
    if (!text.trim()) return;
    await sendOnlineOnly(text);
    var all = S.pendingOnlineMsgs.slice();
    S.pendingOnlineMsgs = [];
    injectToOfflineInput(all.map(function (t) { return '<msg from="user">' + t + '</msg>'; }).join('\n'));
  }

  function injectToOfflineInput(text) {
    var input = document.querySelector('.chat-input-textarea')
      || document.querySelector('textarea[placeholder*="Type"]')
      || document.querySelector('textarea');
    if (!input) { console.warn('[小手机] 找不到线下输入框'); return; }
    var combined = (input.value || '') ? input.value + '\n' + text : text;
    var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    if (setter) setter.set.call(input, combined);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(function () {
      var btn = document.querySelector('.chat-input-send-button') || document.querySelector('.chat-input-send') || document.querySelector('button[class*="send"]');
      if (btn) btn.click();
      else input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    }, 200);
  }

  function interceptOfflineSend() {
    var btn = document.querySelector('.chat-input-send-button') || document.querySelector('.chat-input-send') || document.querySelector('button[class*="send"]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (S.pendingOnlineMsgs.length === 0) return;
      var mt = S.pendingOnlineMsgs.map(function (t) { return '<msg from="user">' + t + '</msg>'; }).join('\n');
      var input = document.querySelector('.chat-input-textarea') || document.querySelector('textarea');
      if (input) {
        var combined = (input.value || '') ? input.value + '\n' + mt : mt;
        var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
        if (setter) setter.set.call(input, combined);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      S.pendingOnlineMsgs = [];
    }, true);
  }

  // ========== 悬浮球 ==========
  function createFloatingBall() {
    if (document.querySelector('.roche-phone-ball')) return;
    var ball = document.createElement('div');
    ball.className = 'roche-phone-ball';
    ball.innerHTML = PHONE_SVG + '<div class="roche-phone-ball-badge is-empty">0</div>';
    applyBallPosition(ball);
    ball.addEventListener('click', function () { if (!S.dragging) togglePanel(); });
    makeDraggable(ball, 'ball');
    document.body.appendChild(ball);
    S.ball = ball;
    if (!S.enabled) ball.style.display = 'none';
  }
  function applyBallPosition(ball) {
    S.ballPos.left = Math.max(0, Math.min(S.ballPos.left, window.innerWidth - 60));
    S.ballPos.top = Math.max(0, Math.min(S.ballPos.top, window.innerHeight - 60));
    ball.style.left = S.ballPos.left + 'px'; ball.style.top = S.ballPos.top + 'px'; ball.style.right = 'auto'; ball.style.bottom = 'auto';
  }
  function updateBadge() {
    var b = document.querySelector('.roche-phone-ball-badge'); if (!b) return;
    if (S.unreadCount > 0) { b.textContent = S.unreadCount > 99 ? '99+' : S.unreadCount; b.classList.remove('is-empty'); } else b.classList.add('is-empty');
  }

  // ========== 拖拽 ==========
  function makeDraggable(el, type) {
    el.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      S.dragging = false;
      var sx = e.clientX, sy = e.clientY;
      var target = (type === 'panel' && S.panel) ? S.panel : el;
      var rect = target.getBoundingClientRect(), sl = rect.left, st = rect.top;
      el.setPointerCapture(e.pointerId);
      function onMove(ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) S.dragging = true;
        var nl = Math.max(0, Math.min(sl + dx, window.innerWidth - target.offsetWidth));
        var nt = Math.max(0, Math.min(st + dy, window.innerHeight - target.offsetHeight));
        target.style.left = nl + 'px'; target.style.top = nt + 'px'; target.style.right = 'auto'; target.style.bottom = 'auto';
        if (type === 'ball') { S.ballPos.left = nl; S.ballPos.top = nt; } else { S.panelPos.left = nl; S.panelPos.top = nt; }
      }
      function onUp() { el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); setTimeout(function () { S.dragging = false; }, 80); saveState(); }
      el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp);
    });
  }

  // ========== 聊天面板 ==========
  function createChatPanel() {
    if (document.querySelector('.roche-phone-panel')) return;
    var panel = document.createElement('div');
    panel.className = 'roche-phone-panel is-hidden';
    applyPanelPosition(panel);
    panel.innerHTML = buildPanelHTML();
    document.body.appendChild(panel);
    S.panel = panel;
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function (e) { var cr = e[0].contentRect; if (cr.width > 0) { S.panelSize.width = Math.round(cr.width); S.panelSize.height = Math.round(cr.height); } });
      ro.observe(panel); S.intervals.push(ro);
    }
    bindPanelEvents(panel);
  }
  function applyPanelPosition(p) {
    var w = S.panelSize.width, h = S.panelSize.height;
    S.panelPos.left = Math.max(0, Math.min(S.panelPos.left, window.innerWidth - w));
    S.panelPos.top = Math.max(0, Math.min(S.panelPos.top, window.innerHeight - h));
    p.style.left = S.panelPos.left + 'px'; p.style.top = S.panelPos.top + 'px'; p.style.right = 'auto'; p.style.bottom = 'auto'; p.style.width = w + 'px'; p.style.height = h + 'px';
  }
  function buildPanelHTML() {
    var cn = escapeHtml(S.currentCharName || '选择角色'), ca = S.currentCharAvatar ? 'background-image:url(' + escapeHtml(S.currentCharAvatar) + ')' : '';
    return '<div class="roche-phone-header">'
      + '<div class="roche-phone-header-drag" id="roche-phone-drag-area"></div>'
      + '<div class="roche-phone-header-avatar" id="roche-phone-avatar" style="' + ca + '" title="双击切换角色"></div>'
      + '<div class="roche-phone-header-info"><div class="roche-phone-header-name">' + cn + '</div><div class="roche-phone-header-status">ONLINE</div></div>'
      + '<div class="roche-phone-size-btns"><button class="roche-phone-size-btn" id="roche-phone-shrink-btn" title="缩小">−</button><button class="roche-phone-size-btn" id="roche-phone-expand-btn" title="放大">+</button></div>'
      + '<button class="roche-phone-header-btn" id="roche-phone-settings-btn" title="设置">' + SETTINGS_SVG + '</button>'
      + '<button class="roche-phone-header-btn" id="roche-phone-close-btn" title="关闭">' + CLOSE_SVG + '</button>'
      + '</div>'
      + '<div class="roche-phone-char-picker" id="roche-phone-char-picker" style="display:none"></div>'
      + '<div class="roche-phone-messages" id="roche-phone-messages"></div>'
      + '<div class="roche-phone-input-area"><textarea class="roche-phone-input" id="roche-phone-input" placeholder="输入消息..." rows="1"></textarea><button class="roche-phone-send-btn" id="roche-phone-send-btn" title="发送并触发线下">' + SEND_SVG + '</button></div>'
      + '<div class="roche-phone-settings" id="roche-phone-settings" style="display:none"></div>';
  }
  function bindPanelEvents(panel) {
    panel.querySelector('#roche-phone-close-btn').addEventListener('click', function () { togglePanel(); });
    panel.querySelector('#roche-phone-settings-btn').addEventListener('click', function () { toggleSettings(); });
    // 双击头像切换角色
    var avatar = panel.querySelector('#roche-phone-avatar');
    avatar.addEventListener('dblclick', function (e) { e.stopPropagation(); toggleCharPicker(); });
    // 拖拽区
    var drag = panel.querySelector('#roche-phone-drag-area');
    makeDraggable(drag, 'panel'); drag.style.cursor = 'move';
    // 缩放
    panel.querySelector('#roche-phone-shrink-btn').addEventListener('click', function () { resizePanel(-60, -80); });
    panel.querySelector('#roche-phone-expand-btn').addEventListener('click', function () { resizePanel(60, 80); });
    // 输入
    var input = panel.querySelector('#roche-phone-input');
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); var t = input.value.trim(); if (t) { sendOnlineOnly(t); input.value = ''; input.style.height = 'auto'; } }
    });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 100) + 'px'; });
    // 发送
    panel.querySelector('#roche-phone-send-btn').addEventListener('click', function () {
      var t = input.value.trim();
      if (t) { sendOnlineAndOffline(t); input.value = ''; input.style.height = 'auto'; }
      else if (S.pendingOnlineMsgs.length > 0) { var all = S.pendingOnlineMsgs.slice(); S.pendingOnlineMsgs = []; injectToOfflineInput(all.map(function (x) { return '<msg from="user">' + x + '</msg>'; }).join('\n')); }
    });
  }
  function resizePanel(dw, dh) {
    S.panelSize.width = Math.max(280, Math.min(S.panelSize.width + dw, window.innerWidth - S.panelPos.left));
    S.panelSize.height = Math.max(360, Math.min(S.panelSize.height + dh, window.innerHeight - S.panelPos.top));
    if (S.panel) { S.panel.style.width = S.panelSize.width + 'px'; S.panel.style.height = S.panelSize.height + 'px'; }
    saveState();
  }
  function onWindowResize() { if (S.ball) applyBallPosition(S.ball); if (S.panel) applyPanelPosition(S.panel); }
  function togglePanel() {
    S.isOpen = !S.isOpen;
    if (S.panel) {
      if (S.isOpen) { S.panel.classList.remove('is-hidden'); S.unreadCount = 0; updateBadge(); loadMessages(); }
      else { S.panel.classList.add('is-hidden'); closeCharPicker(); closeSettings(); }
    }
  }

  // ========== 角色选择器 ==========
  function toggleCharPicker() {
    S.isCharPickerOpen = !S.isCharPickerOpen;
    var p = document.querySelector('#roche-phone-char-picker');
    if (!p) return;
    if (S.isCharPickerOpen) { renderCharPicker(p); p.style.display = 'block'; } else p.style.display = 'none';
  }
  function closeCharPicker() { S.isCharPickerOpen = false; var p = document.querySelector('#roche-phone-char-picker'); if (p) p.style.display = 'none'; }
  function renderCharPicker(ct) {
    var html = '';
    for (var i = 0; i < S.chars.length; i++) {
      var c = S.chars[i];
      html += '<div class="roche-phone-char-item' + (c.id === S.currentCharId ? ' is-active' : '') + '" data-char-id="' + c.id + '">'
        + '<div class="roche-phone-char-item-avatar" style="' + (c.avatar ? 'background-image:url(' + escapeHtml(c.avatar) + ')' : '') + '"></div>'
        + '<div class="roche-phone-char-item-name">' + escapeHtml(c.handle || c.name || '未知') + '</div></div>';
    }
    ct.innerHTML = html;
    ct.querySelectorAll('.roche-phone-char-item').forEach(function (el) { el.addEventListener('click', function () { switchChar(this.getAttribute('data-char-id')); }); });
  }
  async function switchChar(id) {
    S.currentCharId = id; await loadCurrentChar(); updatePanelHeader(); closeCharPicker();
    S.displayedCount = DEFAULT_MSG_LIMIT; S.phoneMessages = []; S.pendingOnlineMsgs = [];
    S.processedMsgKeys = {}; S.lastCaptureTs = {};
    await loadMessages(); await saveState();
  }
  function updatePanelHeader() {
    var n = document.querySelector('.roche-phone-header-name'), a = document.querySelector('#roche-phone-avatar');
    if (n) n.textContent = S.currentCharName || '选择角色';
    if (a) a.style.backgroundImage = S.currentCharAvatar ? 'url(' + S.currentCharAvatar + ')' : 'none';
  }

  // ========== 设置 ==========
  function toggleSettings() { S.isSettingsOpen = !S.isSettingsOpen; var s = document.querySelector('#roche-phone-settings'); if (!s) return; if (S.isSettingsOpen) { renderSettings(s); s.style.display = 'flex'; } else s.style.display = 'none'; }
  function closeSettings() { S.isSettingsOpen = false; var s = document.querySelector('#roche-phone-settings'); if (s) s.style.display = 'none'; }
  function renderSettings(ct) {
    var pi = '<div class="roche-phone-preset-item' + (S.activePreset === 'default' ? ' is-active' : '') + '" data-preset="default"><span class="roche-phone-preset-name">默认</span><div class="roche-phone-preset-actions"><button class="roche-phone-preset-action" data-action="apply" data-preset="default" title="应用">✓</button></div></div>';
    for (var i = 0; i < S.presets.length; i++) { var p = S.presets[i]; pi += '<div class="roche-phone-preset-item' + (S.activePreset === p.id ? ' is-active' : '') + '" data-preset="' + p.id + '"><span class="roche-phone-preset-name">' + escapeHtml(p.name) + '</span><div class="roche-phone-preset-actions"><button class="roche-phone-preset-action" data-action="apply" data-preset="' + p.id + '" title="应用">✓</button><button class="roche-phone-preset-action" data-action="edit" data-preset="' + p.id + '" title="编辑">✎</button><button class="roche-phone-preset-action" data-action="delete" data-preset="' + p.id + '" title="删除">✕</button></div></div>'; }
    ct.innerHTML = '<div class="roche-phone-settings-header"><button class="roche-phone-header-btn" id="roche-phone-settings-back">' + CHEVRON_SVG + '</button><div class="roche-phone-settings-title">设置</div></div><div class="roche-phone-settings-body"><div class="roche-phone-settings-section"><div class="roche-phone-settings-label">悬浮球</div><div class="roche-phone-settings-row"><span class="roche-phone-settings-row-label">启用悬浮球</span><button class="roche-phone-settings-btn" id="roche-phone-toggle-enabled">' + (S.enabled ? '已启用' : '已关闭') + '</button></div><div class="roche-phone-settings-row"><span class="roche-phone-settings-row-label">重置位置</span><button class="roche-phone-settings-btn" id="roche-phone-reset-pos">重置</button></div></div><div class="roche-phone-settings-section"><div class="roche-phone-settings-label">样式预设</div>' + pi + '<div style="margin-top:8px"><button class="roche-phone-settings-btn" id="roche-phone-new-preset">新建预设</button></div></div><div class="roche-phone-settings-section" id="roche-phone-css-section" style="display:none"><div class="roche-phone-settings-label">CSS 编辑器</div><textarea class="roche-phone-css-editor" id="roche-phone-css-editor" placeholder="输入自定义CSS..."></textarea><div style="margin-top:8px;display:flex;gap:8px"><button class="roche-phone-settings-btn" id="roche-phone-save-css">保存</button><button class="roche-phone-settings-btn" id="roche-phone-preview-css">预览</button></div></div></div>';
    bindSettingsEvents(ct);
  }
  function bindSettingsEvents(ct) {
    ct.querySelector('#roche-phone-settings-back').addEventListener('click', function () { toggleSettings(); });
    ct.querySelector('#roche-phone-toggle-enabled').addEventListener('click', async function () { S.enabled = !S.enabled; if (S.ball) S.ball.style.display = S.enabled ? '' : 'none'; if (!S.enabled && S.isOpen) togglePanel(); this.textContent = S.enabled ? '已启用' : '已关闭'; await saveState(); });
    ct.querySelector('#roche-phone-reset-pos').addEventListener('click', async function () { S.ballPos = { left: 20, top: 200 }; S.panelPos = { left: 40, top: 60 }; S.panelSize = { width: 380, height: 580 }; if (S.ball) applyBallPosition(S.ball); if (S.panel) applyPanelPosition(S.panel); await saveState(); });
    ct.querySelectorAll('.roche-phone-preset-action').forEach(function (el) { el.addEventListener('click', function () { handlePresetAction(this.getAttribute('data-action'), this.getAttribute('data-preset')); }); });
    ct.querySelector('#roche-phone-new-preset').addEventListener('click', function () { var name = prompt('预设名称:'); if (!name) return; var id = 'preset_' + Date.now(); S.presets.push({ id: id, name: name, css: '' }); S.activePreset = id; saveState().then(function () { renderSettings(ct); showCSSEditor(id); }); });
    ct.querySelector('#roche-phone-save-css').addEventListener('click', function () { var editor = ct.querySelector('#roche-phone-css-editor'); var preset = findPreset(S.activePreset); if (preset && editor) { preset.css = editor.value; saveState().then(function () { applyPresetCSS(); }); } });
    ct.querySelector('#roche-phone-preview-css').addEventListener('click', function () { var editor = ct.querySelector('#roche-phone-css-editor'); if (editor) applyCustomCSS(editor.value); });
  }
  function handlePresetAction(action, id) {
    if (action === 'apply') { S.activePreset = id; applyPresetCSS(); saveState(); renderSettings(document.querySelector('#roche-phone-settings')); }
    else if (action === 'edit') { showCSSEditor(id); }
    else if (action === 'delete') { S.presets = S.presets.filter(function (p) { return p.id !== id; }); if (S.activePreset === id) { S.activePreset = 'default'; applyPresetCSS(); } saveState(); renderSettings(document.querySelector('#roche-phone-settings')); }
  }
  function showCSSEditor(id) { var s = document.querySelector('#roche-phone-css-section'), e = document.querySelector('#roche-phone-css-editor'); if (!s || !e) return; s.style.display = 'block'; var p = findPreset(id); e.value = p ? p.css : ''; }
  function findPreset(id) { if (id === 'default') return { id: 'default', name: '默认', css: '' }; for (var i = 0; i < S.presets.length; i++) if (S.presets[i].id === id) return S.presets[i]; return null; }
  function applyPresetCSS() { var p = findPreset(S.activePreset); applyCustomCSS(p && p.css ? p.css : ''); }
  function applyCustomCSS(css) { if (S.styleEl) S.styleEl.remove(); S.styleEl = document.createElement('style'); S.styleEl.setAttribute('data-roche-phone', 'true'); S.styleEl.textContent = DEFAULT_PHONE_CSS + '\n' + (css || ''); document.head.appendChild(S.styleEl); }
  function startMessagePolling() { S.intervals.push(setInterval(function () { if (S.isOpen && S.currentConvId) loadMessages(); }, POLL_INTERVAL)); }

  // ========== 注册 ==========
  window.RochePlugin.register({
    id: PLUGIN_ID, name: '小手机', version: '1.0.1',
    apps: [{
      id: APP_ID, name: '小手机', icon: 'phone_iphone', iconImage: '',
      async mount(container, roche) {
        S.roche = roche;
        await loadState();
        await loadChars();
        await loadConversations();
        applyPresetCSS();
        createFloatingBall();
        createChatPanel();
        startCapture();
        startMessagePolling();
        interceptOfflineSend();
        window.addEventListener('resize', onWindowResize);

        // App 主页面
        container.innerHTML = '<div class="roche-plugin-phone-app" style="padding:20px;font-family:-apple-system,BlinkMacSystemFont,sans-serif">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">'
          + '<h2 style="font-size:20px;font-weight:700;margin:0">小手机</h2>'
          + '<button id="roche-phone-app-close" style="padding:8px 20px;border-radius:999px;border:1px solid #e4e4e7;background:#fff;color:#18181b;font-size:14px;font-weight:600;cursor:pointer">关闭</button>'
          + '</div>'
          + '<p style="color:#71717a;font-size:14px;line-height:1.6;margin-bottom:12px">小手机插件已在运行。点击屏幕上的悬浮球即可打开聊天界面。</p>'
          + '<div style="margin-bottom:16px">'
          + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer">'
          + '<input type="checkbox" id="roche-phone-app-toggle-ball" ' + (S.enabled ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer">'
          + '<span style="font-size:14px;color:#18181b">启用悬浮球</span>'
          + '</label>'
          + '</div>'
          + '<p style="color:#71717a;font-size:13px;line-height:1.5">'
          + '• 双击头像切换角色<br>'
          + '• Enter 发送仅同步到线上<br>'
          + '• 发送键 同时触发线下回复<br>'
          + '• 悬浮球可拖拽，位置自动保存</p>'
          + '</div>';

        // 关闭按钮
        container.querySelector('#roche-phone-app-close').addEventListener('click', function () { roche.ui.closeApp(); });
        // 悬浮球开关
        container.querySelector('#roche-phone-app-toggle-ball').addEventListener('change', async function () {
          S.enabled = this.checked;
          if (S.ball) S.ball.style.display = S.enabled ? '' : 'none';
          if (!S.enabled && S.isOpen) togglePanel();
          await saveState();
        });

        console.log('[小手机] 插件已加载 v1.0.1');
      },
      async unmount(container) {
        for (var i = 0; i < S.intervals.length; i++) { var item = S.intervals[i]; if (item && typeof item.disconnect === 'function') item.disconnect(); else clearInterval(item); }
        S.intervals = []; stopCapture(); window.removeEventListener('resize', onWindowResize); container.replaceChildren();
      }
    }]
  });
})();
