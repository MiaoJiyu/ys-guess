(function () {
  const T = window.__TEYVAT__;
  if (!T) { console.error('Teyvat bridge unavailable'); return; }
  const { state, $, esc, toast, showPanel, openModal, closeModal, modalHeader, apiFetch, applyAccount, connect } = T;

  const TOKEN_KEY = 'teyvat_token';
  const SID_KEY = 'teyvat_session_id';

  function token() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
  function setToken(value) { try { value ? localStorage.setItem(TOKEN_KEY, value) : localStorage.removeItem(TOKEN_KEY); } catch {} state.token = value || ''; }
  function sid() {
    let value = '';
    try { value = localStorage.getItem(SID_KEY) || ''; } catch {}
    if (!value) {
      value = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(SID_KEY, value); } catch {}
    }
    state.sessionId = value;
    return value;
  }

  async function api(path, options = {}) {
    const headers = Object.assign({}, options.headers || {});
    const current = token();
    if (current) headers.Authorization = 'Bearer ' + current;
    headers['X-Session-Id'] = sid();
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function showAuth(message) {
    openModal(
      modalHeader('旅行者身份认证', '注册账号后即可进入联机大厅；首个注册的账号自动成为管理员') +
      `<div class="modal-body">
        <div class="hub-tabs" style="margin-bottom:14px;">
          <button class="hub-tab active" data-auth="login">登录</button>
          <button class="hub-tab" data-auth="register">注册</button>
        </div>
        <div class="modal-form">
          <label>账号<input id="authUsername" autocomplete="username" placeholder="3-24 位字母、数字、下划线或汉字"></label>
          <label>昵称<input id="authNickname" maxlength="8" placeholder="游戏内显示名称（注册时填写）"></label>
          <label>密码<input id="authPassword" type="password" autocomplete="current-password" placeholder="至少 6 位"></label>
          <label id="authAdminCodeLabel">管理员邀请码（选填）<input id="authAdminCode" type="password" autocomplete="off" placeholder="仅首个管理员账号需要，普通注册可留空"></label>
          <div class="form-error" id="authError">${esc(message || '')}</div>
          <div class="modal-actions"><button class="btn btn-gold" id="authSubmit">登录</button></div>
        </div>
      </div>`,
      'slim'
    );
    let mode = 'login';
    const nicknameLabel = $('authNickname').closest('label');
    const adminCodeLabel = $('authAdminCodeLabel');
    nicknameLabel.style.display = 'none';
    adminCodeLabel.style.display = 'none';
    document.querySelectorAll('[data-auth]').forEach((tab) => {
      tab.onclick = () => {
        mode = tab.dataset.auth;
        document.querySelectorAll('[data-auth]').forEach((t) => t.classList.toggle('active', t === tab));
        nicknameLabel.style.display = mode === 'register' ? '' : 'none';
        adminCodeLabel.style.display = mode === 'register' ? '' : 'none';
        $('authSubmit').textContent = mode === 'register' ? '注册并进入' : '登录';
      };
    });
    const submit = async () => {
      const button = $('authSubmit');
      button.disabled = true;
      button.textContent = '请稍候…';
      $('authError').textContent = '';
      const payload = {
        username: $('authUsername').value.trim(),
        password: $('authPassword').value,
        nickname: $('authNickname').value.trim(),
        adminCode: $('authAdminCode').value.trim(),
      };
      try {
        const { response, data } = await api(`/api/auth/${mode === 'login' ? 'login' : 'register'}`, {
          method: 'POST', body: JSON.stringify(payload),
        });
        if (!response.ok || !data.ok) throw new Error(data.error || '认证失败');
        setToken(data.token);
        applyAccount(data.user);
        closeModal();
        showPanel('hub');
        await connect();
        await loadRooms();
      } catch (error) {
        $('authError').textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = mode === 'register' ? '注册并进入' : '登录';
      }
    };
    $('authSubmit').onclick = submit;
    $('authPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
    $('authUsername').focus();
  }

  async function ensureAuth() {
    sid();
    if (!token()) { showAuth(); return; }
    try {
      const { response, data } = await api('/api/auth/me');
      if (!response.ok || !data.ok) {
        setToken('');
        state.user = null;
        showAuth('登录状态已失效，请重新登录');
        return;
      }
      state.token = token();
      applyAccount(data.user);
      await connect();
      await loadRooms();
    } catch {
      setConnSafe('offline', '网络异常');
      showAuth('网络异常，请重试登录');
    }
  }

  function setConnSafe(kind, text) {
    const badge = $('connBadge');
    if (!badge) return;
    badge.className = `conn ${kind}`;
    const label = badge.querySelector('span');
    if (label) label.textContent = text;
  }

  function logout(message) {
    setToken('');
    state.user = null;
    state.myId = null;
    state.room = null;
    window.dispatchEvent(new Event('teyvat-account'));
    showAuth(message || '已退出登录');
  }

  function roomCard(room, type) {
    const isLan = type === 'lan';
    const status = room.state === 'waiting' ? '等待中' : room.state === 'playing' ? '对局中' : '已结束';
    const badge = isLan ? '<span class="room-badge lan">局域网 · 免密</span>' : '<span class="room-badge public">公网 · 需密码</span>';
    return `<article class="room-card">
      <div class="room-top"><span class="room-code">${esc(room.code)}</span>${badge}</div>
      <div class="room-meta">
        <span>房主 ${esc(room.hostName || '旅人')}</span>
        <span>${room.playerCount || 0}/${room.maxPlayers || 8} 人</span>
        <span>${esc(room.pool || '全部')}</span>
        <span>${Number(room.matchRounds) || 3} 局</span>
        <span>${esc(status)}</span>
      </div>
      <button class="btn btn-gold" data-enter="${esc(room.code)}" data-type="${type}">${isLan ? '免密进入' : '输入密码进入'}</button>
    </article>`;
  }

  function bindRoomCards(root, type) {
    root.querySelectorAll('[data-enter]').forEach((button) => {
      button.onclick = () => {
        const code = button.dataset.enter;
        if (type === 'lan') {
          const rooms = state.lanRooms || [];
          const room = rooms.find((item) => item.code === code);
          if (!room) { toast('房间已消失，请刷新大厅', true); return; }
          enterLanRoom(room);
        } else {
          openJoin(code);
        }
      };
    });
  }

  function renderHubRooms() {
    const publicList = (state.rooms || []).filter((room) => room.visibility !== 'lan');
    const lanList = state.lanRooms || [];
    $('publicRoomCount').textContent = String(publicList.length);
    $('lanRoomCount').textContent = String(lanList.length);
    const publicRoot = $('publicRooms');
    const lanRoot = $('lanRooms');
    publicRoot.innerHTML = publicList.length
      ? publicList.map((room) => roomCard(room, 'public')).join('')
      : '<div class="room-empty"><b>还没有公网房间</b>创建房间后，把 6 位房间号码与密码告诉同伴。</div>';
    lanRoot.innerHTML = lanList.length
      ? lanList.map((room) => roomCard(room, 'lan')).join('')
      : '<div class="room-empty"><b>未发现局域网房间</b>请在同一局域网运行 <code>npm start</code>，再点击刷新大厅。</div>';
    bindRoomCards(publicRoot, 'public');
    bindRoomCards(lanRoot, 'lan');
  }

  async function loadRooms() {
    try {
      const { data } = await api('/api/rooms');
      if (data.ok) {
        state.rooms = data.list || [];
        window.dispatchEvent(new CustomEvent('teyvat-rooms', { detail: state.rooms }));
      }
    } catch { /* 保留上次列表 */ }
    try {
      const { data } = await api('/api/lan/discover');
      const rooms = data.rooms || [];
      for (const peer of data.peers || []) {
        if (!rooms.some((room) => room.serverAddress === peer.ip)) {
          rooms.push({ code: '局域网服务', visibility: 'lan', hostName: peer.ip, playerCount: 0, maxPlayers: 8, state: 'waiting', pool: '全部', matchRounds: 3, lanToken: '', serverAddress: peer.ip, serverPort: peer.httpPort });
        }
      }
      state.lanRooms = rooms;
      window.dispatchEvent(new CustomEvent('teyvat-lan-rooms', { detail: rooms }));
    } catch { /* 云端部署下没有本地广播，静默忽略 */ }
    renderHubRooms();
  }

  function openCreate() {
    openModal(
      modalHeader('创建房间', '公网房间必须设置房间密码；局域网房间无需密码，同网段自动发现') +
      `<div class="modal-body"><div class="modal-form">
        <label>房间类型<select id="createVisibility">
          <option value="public">公网房间（EdgeOne Makers）</option>
          <option value="lan">局域网房间（本地 Node.js 服务）</option>
        </select></label>
        <label id="createPasswordLabel">房间密码（至少 4 位）<input id="createPassword" type="password" placeholder="仅同房玩家知道"></label>
        <label>每人猜测次数<input id="createGuesses" type="number" min="1" max="123" value="8"></label>
        <div class="form-error" id="createError"></div>
        <div class="modal-actions"><button class="btn btn-gold" id="createSubmit">开启秘境</button></div>
      </div></div>`,
      'slim'
    );
    const visibility = $('createVisibility');
    const passwordLabel = $('createPasswordLabel');
    const sync = () => { passwordLabel.style.display = visibility.value === 'public' ? '' : 'none'; };
    visibility.onchange = sync;
    sync();
    $('createSubmit').onclick = async () => {
      const button = $('createSubmit');
      if (button.disabled) return;
      const password = $('createPassword').value;
      if (visibility.value === 'public' && password.length < 4) {
        $('createError').textContent = '公网房间密码至少 4 位';
        return;
      }
      const guesses = Math.min(123, Math.max(1, Number($('createGuesses').value) || 8));
      button.disabled = true;
      button.textContent = '开启中…';
      try {
        const ok = await T.sendMsg({
          type: 'create', name: state.myName, visibility: visibility.value,
          password, maxGuesses: guesses,
        });
        if (ok) { closeModal(); await loadRooms(); }
        else $('createError').textContent = '创建失败，请查看提示后重试';
      } finally {
        button.disabled = false;
        button.textContent = '开启秘境';
      }
    };
  }

  function openJoin(prefill = '') {
    openModal(
      modalHeader('加入房间', '输入 6 位房间号码与房间密码') +
      `<div class="modal-body"><div class="modal-form">
        <label>房间号码<input id="joinCode" inputmode="numeric" maxlength="6" value="${esc(prefill)}" placeholder="000000"></label>
        <label>房间密码<input id="joinPassword" type="password" placeholder="请输入房间密码"></label>
        <div class="form-error" id="joinError"></div>
        <div class="modal-actions"><button class="btn btn-gold" id="joinSubmit">进入房间</button></div>
      </div></div>`,
      'slim'
    );
    const submit = async () => {
      const button = $('joinSubmit');
      if (button.disabled) return;
      const code = $('joinCode').value.trim();
      if (!/^\d{6}$/.test(code)) { $('joinError').textContent = '请输入 6 位房间号码'; return; }
      button.disabled = true;
      button.textContent = '进入中…';
      try {
        const ok = await T.sendMsg({ type: 'join', name: state.myName, roomCode: code, password: $('joinPassword').value });
        if (ok) closeModal();
        else $('joinError').textContent = '加入失败，请检查房间号码与密码';
      } finally {
        button.disabled = false;
        button.textContent = '进入房间';
      }
    };
    $('joinSubmit').onclick = submit;
    $('joinPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
  }

  async function enterLanRoom(room) {
    if (!room.code || !/^\d{6}$/.test(room.code)) {
      toast('发现的是局域网服务，请打开其提供的地址加入房间', true);
      return;
    }
    const ok = await T.sendMsg({ type: 'join', name: state.myName, roomCode: room.code, lanToken: room.lanToken, visibility: 'lan' });
    if (ok) toast('已进入局域网房间');
  }

  function openAccount() {
    const user = state.user || {};
    openModal(
      modalHeader('账号中心', '身份由注册账号识别，昵称由账号统一管理') +
      `<div class="modal-body"><div class="modal-form">
        <div class="hub-head" style="padding:12px 0;margin:0;">
          <div><div class="eyebrow">${esc(user.role === 'admin' ? 'ADMINISTRATOR' : 'TRAVELER')}</div>
          <h3 style="margin:4px 0;">${esc(user.nickname || user.username || '旅行者')}</h3>
          <p>@${esc(user.username || '')} · Rating ${esc(String(Number(user.stats?.rating ?? 1500)))}</p></div>
        </div>
        <div class="form-error" id="accountError"></div>
        <div class="modal-actions">
          ${user.role === 'admin' ? '<button class="btn btn-ghost" id="accountAdmin">管理控制台</button>' : ''}
          <button class="btn btn-ghost" id="accountLogout">退出登录</button>
        </div>
      </div></div>`,
      'slim'
    );
    const adminButton = $('accountAdmin');
    if (adminButton) adminButton.onclick = () => openAdminConsole();
    $('accountLogout').onclick = () => logout('已退出登录');
  }

  async function adminApi(path, options = {}) {
    const { response, data } = await api(path, options);
    if (!response.ok || !data.ok) throw new Error(data.error || '操作失败');
    return data;
  }

  async function openAdminConsole() {
    if (!state.user || state.user.role !== 'admin') { toast('仅管理员可进入控制台', true); return; }
    let tab = 'users';
    openModal(
      modalHeader('管理员控制台', '可编辑全部用户信息、战绩、房间、外挂与公告') +
      `<div class="modal-body"><div class="admin-console">
        <div class="hub-tabs">
          <button class="hub-tab active" data-admin-tab="users">用户</button>
          <button class="hub-tab" data-admin-tab="rooms">房间</button>
          <button class="hub-tab" data-admin-tab="cheat">外挂</button>
          <button class="hub-tab" data-admin-tab="notice">公告</button>
        </div>
        <div id="adminPane">加载中…</div>
      </div></div>`,
      'wide'
    );
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.onclick = () => {
        tab = button.dataset.adminTab;
        document.querySelectorAll('[data-admin-tab]').forEach((item) => item.classList.toggle('active', item === button));
        renderAdminPane();
      };
    });
    await renderAdminPane();

    async function renderAdminPane() {
      const pane = $('adminPane');
      if (!pane) return;
      pane.textContent = '加载中…';
      try {
        if (tab === 'users') await renderUsers(pane);
        else if (tab === 'rooms') await renderRooms(pane);
        else if (tab === 'cheat') await renderCheat(pane);
        else renderNotice(pane);
      } catch (error) {
        pane.innerHTML = `<div class="form-error">${esc(error.message)}</div>`;
      }
    }

    async function renderUsers(pane) {
      const data = await adminApi('/api/admin/users');
      pane.innerHTML = `<div class="admin-section"><h4>全部用户（${data.list.length}）</h4>
        <div class="table-wrap"><table class="admin-table"><thead><tr><th>账号 / 昵称</th><th>角色</th><th>Rating</th><th>战绩</th><th>操作</th></tr></thead><tbody>
        ${data.list.map((user) => `<tr data-user="${esc(user.id)}">
          <td><b>${esc(user.nickname || user.username)}</b><br><small>@${esc(user.username)}</small></td>
          <td><select data-field="role"><option value="user"${user.role === 'user' ? ' selected' : ''}>用户</option><option value="admin"${user.role === 'admin' ? ' selected' : ''}>管理员</option></select></td>
          <td><input data-field="rating" type="number" value="${esc(String(Number(user.stats?.rating ?? 1500)))}"></td>
          <td><input data-field="games" type="number" value="${esc(String(Number(user.stats?.games ?? 0)))}" title="场次"><input data-field="wins" type="number" value="${esc(String(Number(user.stats?.wins ?? 0)))}" title="胜场"></td>
          <td><div class="admin-actions"><button class="btn btn-small btn-ghost" data-action="save">保存</button><button class="btn btn-small btn-ghost" data-action="password">重置密码</button><button class="btn btn-small btn-danger" data-action="delete">删除</button></div></td>
        </tr>`).join('')}
        </tbody></table></div></div>`;
      pane.querySelectorAll('[data-user]').forEach((row) => {
        const id = row.dataset.user;
        row.querySelector('[data-action="save"]').onclick = async () => {
          const value = (field) => row.querySelector(`[data-field="${field}"]`).value;
          try {
            await adminApi('/api/admin/users', {
              method: 'POST',
              body: JSON.stringify({ id, action: 'update', patch: {
                role: value('role'),
                stats: { rating: Number(value('rating')), games: Number(value('games')), wins: Number(value('wins')) },
              } }),
            });
            toast('用户信息已保存');
            await renderUsers(pane);
          } catch (error) { toast(error.message, true); }
        };
        row.querySelector('[data-action="password"]').onclick = async () => {
          const password = prompt('输入新密码（至少 6 位）', '');
          if (!password || password.length < 6) { toast('新密码至少 6 位', true); return; }
          try {
            await adminApi('/api/admin/users', { method: 'POST', body: JSON.stringify({ id, action: 'resetPassword', password }) });
            toast('密码已重置');
          } catch (error) { toast(error.message, true); }
        };
        row.querySelector('[data-action="delete"]').onclick = async () => {
          if (!confirm('确定删除该用户及其全部战绩吗？')) return;
          try {
            await adminApi('/api/admin/users', { method: 'POST', body: JSON.stringify({ id, action: 'delete' }) });
            await renderUsers(pane);
          } catch (error) { toast(error.message, true); }
        };
      });
    }

    async function renderRooms(pane) {
      const data = await adminApi('/api/admin/rooms');
      pane.innerHTML = `<div class="admin-section"><h4>全部房间（${data.list.length}）</h4>
        ${data.list.length ? data.list.map((room) => `<div class="admin-section" data-room="${esc(room.code)}">
          <div class="room-top"><span class="room-code">${esc(room.code)}</span><span class="room-badge ${room.visibility === 'lan' ? 'lan' : 'public'}">${room.visibility === 'lan' ? '局域网' : '公网'}</span></div>
          <div class="room-meta"><span>房主 ${esc(room.hostName)}</span><span>${room.playerCount}/${room.maxPlayers} 人</span><span>${esc(room.state)}</span></div>
          <div class="admin-actions">
            <button class="btn btn-small btn-danger" data-action="close">解散房间</button>
            ${(room.players || []).map((p) => `<button class="btn btn-small btn-ghost" data-action="kick" data-player="${esc(p.id)}">踢出 ${esc(p.name)}</button><button class="btn btn-small btn-ghost" data-action="reset-focus" data-player="${esc(p.id)}">重置切屏 ${p.focusLosses || 0}</button>`).join('')}
          </div>
        </div>`).join('') : '<div class="room-empty"><b>暂无房间</b></div>'}
      </div>`;
      pane.querySelectorAll('[data-room]').forEach((block) => {
        const code = block.dataset.room;
        const close = block.querySelector('[data-action="close"]');
        if (close) close.onclick = async () => {
          if (!confirm('确定解散该房间吗？')) return;
          try { await adminApi('/api/admin/rooms', { method: 'POST', body: JSON.stringify({ code, action: 'close' }) }); await renderRooms(pane); }
          catch (error) { toast(error.message, true); }
        };
        block.querySelectorAll('[data-action="kick"]').forEach((button) => {
          button.onclick = async () => {
            try { await adminApi('/api/admin/rooms', { method: 'POST', body: JSON.stringify({ code, action: 'kick', playerId: button.dataset.player }) }); await renderRooms(pane); }
            catch (error) { toast(error.message, true); }
          };
        });
        block.querySelectorAll('[data-action="reset-focus"]').forEach((button) => {
          button.onclick = async () => {
            try { await adminApi('/api/admin/focus', { method: 'POST', body: JSON.stringify({ code, playerId: button.dataset.player }) }); await renderRooms(pane); }
            catch (error) { toast(error.message, true); }
          };
        });
      });
    }

    async function renderCheat(pane) {
      const status = await adminApi('/api/admin/cheat');
      const setAt = status.setAt ? new Date(status.setAt).toLocaleString('zh-CN', { hour12: false }) : '从未设置';
      pane.innerHTML = `<div class="admin-section"><h4>外挂辅助密码</h4>
        <p class="setting-hint">当前状态：${status.configured ? '已设置' : '未设置'} · 设置人 ${esc(status.setBy || '—')} · 设置时间 ${esc(setAt)}。密码仅以哈希保存，不会回显。</p>
        <div class="modal-form">
          <label>新密码（至少 8 位）<input id="adminCheatPassword" type="password" maxlength="64" placeholder="输入新的外挂密码"></label>
          <div class="form-error" id="adminCheatError"></div>
          <div class="modal-actions">
            <button class="btn btn-small btn-gold" id="adminCheatSet">设置 / 更新</button>
            <button class="btn btn-small btn-danger" id="adminCheatClear"${status.configured ? '' : ' disabled'}>清除密码</button>
          </div>
        </div>
      </div>`;
      $('adminCheatSet').onclick = async () => {
        const password = $('adminCheatPassword').value;
        if (password.length < 8) { $('adminCheatError').textContent = '密码至少 8 位'; return; }
        try {
          await adminApi('/api/admin/cheat', { method: 'POST', body: JSON.stringify({ action: 'set', password }) });
          $('adminCheatPassword').value = '';
          toast('外挂密码已更新');
          await renderCheat(pane);
        } catch (error) { $('adminCheatError').textContent = error.message; }
      };
      $('adminCheatClear').onclick = async () => {
        if (!confirm('确定清除外挂密码吗？')) return;
        try {
          await adminApi('/api/admin/cheat', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
          toast('外挂密码已清除');
          await renderCheat(pane);
        } catch (error) { toast(error.message, true); }
      };
    }

    function renderNotice(pane) {
      pane.innerHTML = `<div class="admin-section"><h4>全服公告</h4>
        <div class="modal-form"><label>公告内容<input id="adminNotice" maxlength="100" placeholder="将推送给所有在线玩家"></label>
        <div class="modal-actions"><button class="btn btn-gold" id="adminNoticeSend">发送公告</button></div></div></div>`;
      const send = $('adminNoticeSend');
      if (!send) return;
      send.onclick = async () => {
        try {
          await adminApi('/api/admin/notice', { method: 'POST', body: JSON.stringify({ message: $('adminNotice').value }) });
          toast('公告已发送');
        } catch (error) { toast(error.message, true); }
      };
    }
  }

  const FEEDBACK_TYPE_LABELS = { bug: '问题反馈', feature: '功能建议', experience: '体验反馈', other: '其它' };
  const FEEDBACK_STATUS_LABELS = { pending: '待处理', processing: '处理中', resolved: '已解决' };
  let feedbackFilter = 'all';

  function feedbackTime(timestamp) {
    const date = new Date(Number(timestamp) || Date.now());
    return date.toLocaleString('zh-CN', { hour12: false });
  }

  function feedbackContextText(context = {}) {
    const parts = [];
    if (context.viewport) parts.push(`屏幕 ${context.viewport}`);
    if (context.language) parts.push(`语言 ${context.language}`);
    if (context.localTime) parts.push(`提交于 ${context.localTime}`);
    if (context.url) parts.push(`页面 ${context.url}`);
    if (context.userAgent) parts.push(`浏览器 ${context.userAgent}`);
    return parts.join(' · ');
  }

  function feedbackCard(item, admin = false) {
    const context = feedbackContextText(item.context);
    const reply = item.reply
      ? `<div class="feedback-reply"><b>${esc(item.handledByName || '管理员')} 回复：</b>${esc(item.reply)}</div>`
      : '';
    return `<article class="feedback-card" data-feedback="${esc(item.id)}">
      <div class="fb-top">
        <div><h4>${esc(item.title)}</h4><div class="feedback-meta">
          <span>${esc(FEEDBACK_TYPE_LABELS[item.type] || item.type)}</span>
          <span>${esc(item.nickname || item.username)}</span>
          <span>${esc(feedbackTime(item.createdAt))}</span>
          ${item.roomCode ? `<span>房间 ${esc(item.roomCode)}</span>` : ''}
          ${item.contact ? `<span>联系 ${esc(item.contact)}</span>` : ''}
        </div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">
          <span class="fb-badge ${esc(item.type)}">${esc(FEEDBACK_TYPE_LABELS[item.type] || item.type)}</span>
          <span class="fb-badge ${esc(item.status)}">${esc(FEEDBACK_STATUS_LABELS[item.status] || item.status)}</span>
        </div>
      </div>
      <p>${esc(item.description)}</p>
      ${context ? `<div class="feedback-context">${esc(context)}</div>` : ''}
      ${reply}
      ${admin ? `<div class="feedback-tools">
        <label>状态<select data-fb-status>${['pending', 'processing', 'resolved'].map((status) => `<option value="${status}"${item.status === status ? ' selected' : ''}>${FEEDBACK_STATUS_LABELS[status]}</option>`).join('')}</select></label>
        <label>回复 / 处理记录<input data-fb-reply value="${esc(item.reply)}" maxlength="1000" placeholder="记录处理进展或解决说明"></label>
        <button class="btn btn-small btn-gold" data-fb-save>保存处理</button>
      </div>` : ''}
    </article>`;
  }

  async function loadMyFeedback() {
    const listRoot = $('myFeedbackList');
    if (!listRoot) return;
    listRoot.innerHTML = '<div class="lb-empty">加载中…</div>';
    try {
      const { response, data } = await api('/api/feedback/mine');
      if (!response.ok || !data.ok) throw new Error(data.error || '加载失败');
      listRoot.innerHTML = data.list.length
        ? data.list.map((item) => feedbackCard(item)).join('')
        : '<div class="lb-empty"><b>还没有提交过反馈</b>你的建议和问题记录会显示在这里。</div>';
    } catch (error) {
      listRoot.innerHTML = `<div class="lb-empty">${esc(error.message)}</div>`;
    }
  }

  async function loadAdminFeedback() {
    const listRoot = $('adminFeedbackList');
    if (!listRoot) return;
    listRoot.innerHTML = '<div class="lb-empty">加载中…</div>';
    try {
      const { response, data } = await api(`/api/admin/feedback?status=${encodeURIComponent(feedbackFilter)}`);
      if (!response.ok || !data.ok) throw new Error(data.error || '加载失败');
      const counts = data.counts || {};
      $('fbCountAll').textContent = String(counts.all || 0);
      $('fbCountPending').textContent = String(counts.pending || 0);
      $('fbCountProcessing').textContent = String(counts.processing || 0);
      $('fbCountResolved').textContent = String(counts.resolved || 0);
      listRoot.innerHTML = data.list.length
        ? data.list.map((item) => feedbackCard(item, true)).join('')
        : '<div class="lb-empty"><b>该状态下没有反馈</b>切换筛选条件查看其它记录。</div>';
      listRoot.querySelectorAll('[data-fb-save]').forEach((button) => {
        button.onclick = async () => {
          const card = button.closest('[data-feedback]');
          const id = card.dataset.feedback;
          const status = card.querySelector('[data-fb-status]').value;
          const reply = card.querySelector('[data-fb-reply]').value;
          button.disabled = true;
          try {
            const { response: saveResponse, data: saveData } = await api('/api/admin/feedback', {
              method: 'POST', body: JSON.stringify({ id, status, reply }),
            });
            if (!saveResponse.ok || !saveData.ok) throw new Error(saveData.error || '保存失败');
            toast(saveData.message || '反馈已更新');
            await loadAdminFeedback();
          } catch (error) {
            toast(error.message, true);
            button.disabled = false;
          }
        };
      });
    } catch (error) {
      listRoot.innerHTML = `<div class="lb-empty">${esc(error.message)}</div>`;
    }
  }

  async function loadFeedbackPanel() {
    const isAdmin = state.user && state.user.role === 'admin';
    $('feedbackUserView').classList.toggle('hidden', isAdmin);
    $('feedbackAdminView').classList.toggle('hidden', !isAdmin);
    $('feedbackTitle').textContent = isAdmin ? '反馈处理中心' : '写下你的建议';
    $('feedbackSub').textContent = isAdmin
      ? '查看全部用户反馈，按状态筛选，并记录回复与处理结果。'
      : '问题描述、发生场景与房间信息会帮助管理员更快定位问题。提交成功后可在下方查看处理进度。';
    if (isAdmin) await loadAdminFeedback();
    else await loadMyFeedback();
  }

  async function submitFeedback(event) {
    event.preventDefault();
    const errorBox = $('feedbackError');
    const button = $('feedbackSubmit');
    errorBox.textContent = '';
    if (button.disabled) return;
    const description = $('feedbackDescription').value.trim();
    const roomCode = $('feedbackRoomCode').value.trim();
    if (description.length < 5) { errorBox.textContent = '问题描述至少 5 个字'; return; }
    if (roomCode && !/^\d{6}$/.test(roomCode)) { errorBox.textContent = '房间号应为 6 位数字'; return; }
    button.disabled = true;
    button.textContent = '提交中…';
    try {
      const payload = {
        type: $('feedbackType').value,
        title: $('feedbackTitleInput').value.trim(),
        description,
        roomCode,
        contact: $('feedbackContact').value.trim(),
        context: {
          url: location.href,
          userAgent: navigator.userAgent,
          viewport: `${window.innerWidth}×${window.innerHeight}`,
          language: navigator.language,
          localTime: new Date().toLocaleString('zh-CN', { hour12: false }),
        },
      };
      const { response, data } = await api('/api/feedback', { method: 'POST', body: JSON.stringify(payload) });
      if (!response.ok || !data.ok) throw new Error(data.error || '提交失败');
      toast(data.message || '反馈提交成功');
      $('feedbackForm').reset();
      await loadMyFeedback();
    } catch (error) {
      errorBox.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = '提交反馈';
    }
  }

  function openCheatActivation() {
    const me = myRoomPlayer();
    if (me && me.cheatActive) { toast('本场已启用无限星辉'); return; }
    openModal(
      modalHeader('启用外挂', '输入管理员设置的外挂密语，仅对当前大场生效') +
      `<div class="modal-body"><div class="modal-form">
        <label>外挂密码<input id="cheatPassword" type="password" maxlength="64" placeholder="请输入密语"></label>
        <div class="form-error" id="cheatError"></div>
        <div class="modal-actions"><button class="btn btn-gold" id="cheatActivate">启用无限星辉</button></div>
      </div></div>`,
      'slim'
    );
    const submit = async () => {
      const button = $('cheatActivate');
      if (button.disabled) return;
      const password = $('cheatPassword').value;
      if (!password) { $('cheatError').textContent = '请输入外挂密码'; return; }
      button.disabled = true;
      button.textContent = '验证中…';
      $('cheatError').textContent = '';
      try {
        const ok = await T.sendMsg({ type: 'cheat_activate', password });
        if (ok) closeModal();
        else $('cheatError').textContent = '激活失败，请查看提示后重试';
      } finally {
        button.disabled = false;
        button.textContent = '启用无限星辉';
      }
    };
    $('cheatActivate').onclick = submit;
    $('cheatPassword').addEventListener('keydown', (event) => { if (event.key === 'Enter') submit(); });
    $('cheatPassword').focus();
  }

  let lastFocusReportAt = 0;
  let focusAppealPending = false;

  function focusActive() {
    return !!(state.room && state.room.state === 'playing' && !state.roundOver);
  }

  function reportFocusLoss(reason) {
    if (!focusActive()) return;
    if (!document.hidden && document.hasFocus()) return;
    const now = Date.now();
    if (now - lastFocusReportAt < 1500) return;
    lastFocusReportAt = now;
    const nonce = (globalThis.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${now}-${Math.random().toString(36).slice(2)}`;
    T.sendMsg({ type: 'focus_loss', nonce, reason, at: now });
  }

  function myRoomPlayer() {
    return (state.room && state.room.players || []).find((player) => player.id === state.myId);
  }

  function renderFocusAlert() {
    const alert = $('focusAlert');
    if (!alert) return;
    const me = myRoomPlayer();
    const until = Number(me && me.focusLossPendingUntil || 0);
    const remaining = Math.ceil(until - Date.now() / 1000);
    if (focusActive() && me && me.focusLossPendingUntil && remaining > 0) {
      alert.classList.remove('hidden');
      const used = me.focusAppealUsed;
      $('focusAlertText').textContent = used
        ? `切屏 ${me.focusLosses} 次，${remaining} 秒后判负。本局撤销机会已使用。`
        : `切屏 ${me.focusLosses} 次，${remaining} 秒后判负。若为误判，请返回页面后撤销。`;
      const button = $('focusAppealBtn');
      button.disabled = used || focusAppealPending;
      button.textContent = focusAppealPending ? '撤销中…' : used ? '撤销已使用' : '误判撤销';
    } else {
      alert.classList.add('hidden');
    }
  }

  async function appealFocusLoss() {
    if (focusAppealPending) return;
    focusAppealPending = true;
    renderFocusAlert();
    try {
      await T.sendMsg({ type: 'focus_appeal' });
    } finally {
      focusAppealPending = false;
      renderFocusAlert();
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reportFocusLoss('visibility');
  });
  window.addEventListener('blur', () => reportFocusLoss('blur'));
  window.addEventListener('teyvat-focus-event', (event) => {
    if (event.detail && event.detail.type === 'focus_appeal_result') renderFocusAlert();
    if (event.detail && event.detail.type === 'focus_forfeit') {
      const alert = $('focusAlert');
      if (alert) alert.classList.add('hidden');
    }
  });
  window.addEventListener('teyvat-hub-open', renderFocusAlert);
  window.addEventListener('teyvat-left-room', renderFocusAlert);
  window.addEventListener('teyvat-feedback-open', () => loadFeedbackPanel());
  setInterval(renderFocusAlert, 500);

  window.__TEYVAT_ADMIN__ = openAdminConsole;

  window.addEventListener('teyvat-account', (event) => {
    const isAdmin = event.detail && event.detail.role === 'admin';
    $('topAdminBtn').classList.toggle('hidden', !isAdmin);
    $('adminBtn').classList.toggle('hidden', !isAdmin);
    if (!isAdmin) {
      $('feedbackUserView').classList.remove('hidden');
      $('feedbackAdminView').classList.add('hidden');
    }
  });
  window.addEventListener('teyvat-unauthorized', () => logout('需要登录后才能继续'));
  window.addEventListener('teyvat-rooms', () => renderHubRooms());
  window.addEventListener('teyvat-lan-rooms', () => renderHubRooms());
  window.addEventListener('teyvat-panel-change', (event) => {
    clearInterval(state.hubTimer);
    state.hubTimer = null;
    if (event.detail === 'hub') state.hubTimer = setInterval(loadRooms, 5000);
  });
  window.addEventListener('teyvat-left-room', () => loadRooms());

  function bind() {
    $('hubBtn').onclick = () => showPanel('hub');
    $('feedbackBtn').onclick = () => showPanel('feedback');
    $('feedbackRefreshBtn').onclick = () => loadFeedbackPanel();
    $('feedbackForm').onsubmit = submitFeedback;
    document.querySelectorAll('[data-status]').forEach((tab) => {
      tab.onclick = () => {
        feedbackFilter = tab.dataset.status;
        document.querySelectorAll('[data-status]').forEach((item) => item.classList.toggle('active', item === tab));
        loadAdminFeedback();
      };
    });
    $('accountBtn').onclick = openAccount;
    $('adminBtn').onclick = openAdminConsole;
    $('topAdminBtn').onclick = openAdminConsole;
    $('hubCreateBtn').onclick = openCreate;
    $('hubJoinBtn').onclick = () => openJoin('');
    $('hubRefreshBtn').onclick = loadRooms;
    const appeal = $('focusAppealBtn');
    if (appeal) appeal.onclick = appealFocusLoss;
    const cheat = $('cheatBtn');
    if (cheat) cheat.onclick = openCheatActivation;
    $('createBtn').onclick = () => { showPanel('hub'); openCreate(); };
    $('joinBtn').onclick = () => openJoin($('codeInput').value.trim());
    document.querySelectorAll('.hub-tab[data-tab]').forEach((tab) => {
      tab.onclick = () => {
        state.hubTab = tab.dataset.tab;
        document.querySelectorAll('.hub-tab[data-tab]').forEach((item) => item.classList.toggle('active', item === tab));
        $('publicRooms').classList.toggle('hidden', state.hubTab !== 'public');
        $('lanRooms').classList.toggle('hidden', state.hubTab !== 'lan');
      };
    });
  }

  function start() {
    bind();
    ensureAuth();
  }

  if (window.__TEYVAT_READY__) start();
  else window.addEventListener('teyvat-ready', start);
})();
