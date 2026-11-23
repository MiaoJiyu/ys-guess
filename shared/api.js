import { ALL_COLS, COL_LABELS, EMOTES, POOLS, SERVER_VERSION } from './constants.js';
import { CHARACTERS, deleteRoom, expireRoomIfNeeded, getRoom, listRooms, performAction, roomPayload, roomSummary, saveRoom } from './engine.js';
import { hashPassword, signToken, verifyPassword, verifyToken, randomId } from './crypto.js';
import { appendEvent, createStore, readEvents } from './store.js';
import {
  defaultStats, deleteLegacyPlayer, deleteUser, getLeaderboard, getUser,
  listLegacyPlayers, listUsers, publicUser, saveUser, seedLegacyPlayer,
} from './user-store.js';
import { credentialStatus, credentialsFromEnv } from './tencent.js';
import {
  createFeedback, feedbackCounts, listFeedback, publicFeedback, updateFeedback,
} from './feedback.js';
import { LEGACY_PLAYERS } from './legacy-players.js';

let legacySeedPromise = null;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

function tokenFrom(request) {
  const header = request.headers.get('authorization') || '';
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const cookie = request.headers.get('cookie') || '';
  const match = cookie.match(/(?:^|;\s*)teyvat_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function secret(env) {
  return env.AUTH_SECRET || env.__authSecret || (env.__runtime === 'cloud' ? '' : 'teyvat-local-development-secret');
}

function authErrorMessage(env) {
  return secret(env) ? '' : '服务端未配置 AUTH_SECRET，请先在 EdgeOne 项目环境变量中配置';
}

async function resolveSession(store, request, env) {
  const key = secret(env);
  if (!key) return { user: null, claims: null };
  const payload = await verifyToken(tokenFrom(request), key);
  if (!payload) return { user: null, claims: null };
  const user = await getUser(store, payload.sub);
  if (!user || user.disabled) return { user: null, claims: payload };
  if (Number(payload.ver || 0) !== Number(user.passwordVersion || 0)) return { user: null, claims: payload };
  return { user, claims: payload };
}

function sessionId(request) {
  return request.headers.get('x-session-id') || randomId(12);
}

function requireAdmin(user) {
  return user && user.role === 'admin';
}

async function ensureLegacySeeded(store) {
  if (!legacySeedPromise) {
    legacySeedPromise = (async () => {
      if (await store.get('_legacySeeded')) return;
      for (const player of LEGACY_PLAYERS) await seedLegacyPlayer(store, player.name, player);
      await store.put('_legacySeeded', '1');
    })().catch((error) => {
      legacySeedPromise = null;
      throw error;
    });
  }
  return legacySeedPromise;
}

export async function handleApi(context) {
  const request = context.request;
  const env = context.env || {};
  const store = env.__store || createStore(env);
  await ensureLegacySeeded(store);
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();
  const { user, claims } = await resolveSession(store, request, env);
  const sid = sessionId(request);

  if (path === '/api/health' && method === 'GET') {
    return json({
      ok: true, version: SERVER_VERSION, runtime: env.__runtime || 'edge',
      characters: CHARACTERS.length,
      rooms: (await listRooms(store)).length,
      users: (await listUsers(store)).length,
      credentials: credentialStatus(env),
      time: Date.now() / 1000,
    });
  }

  if (path === '/api/auth/register' && method === 'POST') {
    if (!secret(env)) return json({ ok: false, error: authErrorMessage(env) }, 500);
    const data = await body(request);
    const username = String(data.username || '').trim().toLowerCase();
    const nickname = String(data.nickname || data.username || '').trim().slice(0, 8);
    const password = String(data.password || '');
    if (!/^[a-z0-9_\u4e00-\u9fa5]{3,24}$/.test(username)) return json({ ok: false, error: '账号需为 3-24 位字母、数字、下划线或汉字' }, 400);
    if (password.length < 6) return json({ ok: false, error: '密码至少 6 位' }, 400);
    if (!nickname) return json({ ok: false, error: '请输入游戏昵称' }, 400);
    if (await getUserByUsernameSafe(store, username)) return json({ ok: false, error: '账号已存在' }, 409);
    const users = await listUsers(store);
    const isFirst = users.length === 0;
    const adminCode = env.ADMIN_BOOTSTRAP_CODE;
    if (isFirst && adminCode && String(data.adminCode || '') !== adminCode) {
      return json({ ok: false, error: '首个管理员账号需要有效的管理员邀请码' }, 403);
    }
    const credentials = await hashPassword(password);
    let created;
    try {
      created = await saveUser(store, {
        id: randomId(12), username, nickname,
        passwordSalt: credentials.salt, passwordHash: credentials.hash,
        role: isFirst && (!adminCode || String(data.adminCode || '') === adminCode) ? 'admin' : 'user',
        passwordVersion: 0,
        disabled: false, createdAt: Date.now(), lastLoginAt: Date.now(),
        stats: defaultStats(),
      });
    } catch (error) {
      return json({ ok: false, error: error.message }, 409);
    }
    const token = await signToken(created, secret(env));
    await appendEvent(store, 'global', { type: 'leaderboard', list: await getLeaderboard(store) });
    return json({ ok: true, token, user: publicUser(created) });
  }

  if (path === '/api/auth/login' && method === 'POST') {
    if (!secret(env)) return json({ ok: false, error: authErrorMessage(env) }, 500);
    const data = await body(request);
    const username = String(data.username || '').trim().toLowerCase();
    const found = await getUserByUsernameSafe(store, username);
    if (!found || found.disabled) return json({ ok: false, error: '账号不存在或已被停用' }, 401);
    const ok = await verifyPassword(String(data.password || ''), found.passwordSalt, found.passwordHash);
    if (!ok) return json({ ok: false, error: '账号或密码错误' }, 401);
    found.lastLoginAt = Date.now();
    await saveUser(store, found);
    const token = await signToken(found, secret(env));
    return json({ ok: true, token, user: publicUser(found) });
  }

  if (path === '/api/auth/me' && method === 'GET') {
    if (!user) return json({ ok: false, user: null, claims: claims || null }, 401);
    return json({ ok: true, user: publicUser(user), claims });
  }

  if (path === '/api/bootstrap' && method === 'GET') {
    const events = [];
    events.push({ type: 'characters', list: CHARACTERS, total: CHARACTERS.length, version: SERVER_VERSION, columns: ALL_COLS, columnLabels: COL_LABELS });
    events.push({
      type: 'welcome', version: SERVER_VERSION, emotes: EMOTES, pools: POOLS,
      columns: ALL_COLS, hintCost: 20, maxPlayers: 8, serverTime: Date.now() / 1000,
    });
    events.push({ type: 'leaderboard', list: await getLeaderboard(store) });
    events.push({ type: 'room_list', list: (await listRooms(store)).map(roomSummary) });
    if (user) {
      events.push({ type: 'profile', user: publicUser(user) });
      const code = await store.get(`session-room:${sid}`);
      const room = code ? await getRoom(store, code) : null;
      if (room && room.players[sid]) events.push(roomPayload(room, sid, await getLeaderboard(store)));
    }
    return json({ ok: true, events, user: user ? publicUser(user) : null });
  }

  if (path === '/api/events' && method === 'GET') {
    const since = Number(url.searchParams.get('since') || 0);
    const requestedRoom = url.searchParams.get('room') || (await store.get(`session-room:${sid}`)) || '';
    const room = requestedRoom ? await getRoom(store, requestedRoom) : null;
    const isMember = !!room && (
      !!room.players[sid] || (!!user && Object.values(room.players).some((p) => p.userId === user.id))
    );
    if (isMember) {
      const pending = [];
      await expireRoomIfNeeded(store, room, (scope, event) => {
        const task = appendEvent(store, scope, event);
        pending.push(task);
        return task;
      });
      await Promise.all(pending);
      await saveRoom(store, room);
    }
    const scopes = ['global', `user:${user?.id || sid}`];
    if (isMember) scopes.push(`room:${room.code}`);
    const list = await readEvents(store, scopes, since);
    return json({ ok: true, events: list, cursor: list.reduce((max, item) => Math.max(max, item.id), since) });
  }

  if (path === '/api/action' && method === 'POST') {
    const data = await body(request);
    const collected = [];
    const append = async (scope, event) => {
      const id = await appendEvent(store, scope, event);
      collected.push({ id, scope, event });
    };
    const result = await performAction({ store, user, sessionId: sid, append, env }, data);
    return json({ ...result, events: collected });
  }

  if (path === '/api/rooms' && method === 'GET') {
    return json({ ok: true, list: (await listRooms(store)).map(roomSummary) });
  }

  if (path === '/api/feedback' && method === 'POST') {
    if (!user) return json({ ok: false, error: '请先登录后再提交反馈' }, 401);
    const lastAt = Number(await store.get(`feedback:cooldown:${user.id}`)) || 0;
    if (Date.now() - lastAt < 8000) return json({ ok: false, error: '提交过于频繁，请稍后再试' }, 429);
    try {
      const item = await createFeedback(store, user, await body(request));
      await store.put(`feedback:cooldown:${user.id}`, String(Date.now()));
      return json({ ok: true, message: '反馈提交成功，我们会尽快查看', feedback: publicFeedback(item) });
    } catch (error) {
      return json({ ok: false, error: error.message }, 400);
    }
  }

  if (path === '/api/feedback/mine' && method === 'GET') {
    if (!user) return json({ ok: false, error: '请先登录' }, 401);
    return json({ ok: true, list: await listFeedback(store, { userId: user.id }) });
  }

  if (path === '/api/lan/discover' && method === 'GET') {
    if (!user) return json({ ok: false, error: '请先登录' }, 401);
    const discovered = typeof env.__discoverLan === 'function' ? await env.__discoverLan() : [];
    const roomSummaries = (await listRooms(store))
      .filter((room) => room.visibility === 'lan')
      .map((room) => ({ ...roomSummary(room), lanToken: room.lanToken }));
    return json({
      ok: true, rooms: roomSummaries, peers: discovered,
      download: env.__lanDownload || null,
      note: discovered.length || roomSummaries.length ? '' : '请在局域网模式下启动本地 Node.js 服务后再发现房间',
    });
  }

  if (path.startsWith('/api/admin/')) {
    if (!requireAdmin(user)) return json({ ok: false, error: '需要管理员权限' }, 403);

    if (path === '/api/admin/summary' && method === 'GET') {
      return json({
        ok: true,
        users: (await listUsers(store)).length,
        rooms: (await listRooms(store)).length,
        legacy: (await listLegacyPlayers(store)).length,
        feedback: await feedbackCounts(store),
      });
    }

    if (path === '/api/admin/feedback' && method === 'GET') {
      const status = url.searchParams.get('status') || 'all';
      return json({
        ok: true,
        status,
        counts: await feedbackCounts(store),
        list: await listFeedback(store, { status }),
      });
    }

    if (path === '/api/admin/feedback' && method === 'POST') {
      const data = await body(request);
      try {
        const item = await updateFeedback(store, data.id, data, user);
        return json({
          ok: true,
          message: '反馈已更新',
          feedback: publicFeedback(item),
          counts: await feedbackCounts(store),
        });
      } catch (error) {
        return json({ ok: false, error: error.message }, 400);
      }
    }

    if (path === '/api/admin/users' && method === 'GET') {
      return json({ ok: true, list: (await listUsers(store)).map(publicUser) });
    }

    if (path === '/api/admin/users' && method === 'POST') {
      const data = await body(request);
      const target = await getUser(store, data.id);
      if (!target) return json({ ok: false, error: '用户不存在' }, 404);
      if (data.action === 'delete') {
        if (target.id === user.id) return json({ ok: false, error: '不能删除当前管理员账号' }, 400);
        await deleteUser(store, target.id);
      } else if (data.action === 'resetPassword') {
        const password = String(data.password || '');
        if (password.length < 6) return json({ ok: false, error: '新密码至少 6 位' }, 400);
        const credentials = await hashPassword(password);
        target.passwordSalt = credentials.salt;
        target.passwordHash = credentials.hash;
        target.passwordVersion = Number(target.passwordVersion || 0) + 1;
        await saveUser(store, target);
      } else if (data.action === 'update') {
        const patch = data.patch || {};
        if (patch.username) target.username = String(patch.username).trim().toLowerCase();
        if (patch.nickname) target.nickname = String(patch.nickname).trim().slice(0, 8);
        if (patch.role === 'admin' || patch.role === 'user') target.role = patch.role;
        if ('disabled' in patch) target.disabled = !!patch.disabled;
        if (patch.stats) target.stats = { ...target.stats, ...patch.stats };
        await saveUser(store, target);
      } else {
        return json({ ok: false, error: '未知操作' }, 400);
      }
      await appendEvent(store, 'global', { type: 'leaderboard', list: await getLeaderboard(store) });
      return json({ ok: true, list: (await listUsers(store)).map(publicUser) });
    }

    if (path === '/api/admin/rooms' && method === 'GET') {
      const rooms = await listRooms(store);
      return json({ ok: true, list: rooms.map((room) => ({ ...roomSummary(room), players: Object.values(room.players).map((p) => ({ id: p.id, userId: p.userId, name: p.name, rating: p.rating, focusLosses: Number(p.focusLosses || 0) })) })) });
    }

    if (path === '/api/admin/rooms' && method === 'POST') {
      const data = await body(request);
      const room = await getRoom(store, data.code);
      if (!room) return json({ ok: false, error: '房间不存在' }, 404);
      if (data.action === 'close') {
        for (const playerId of Object.keys(room.players)) await store.delete(`session-room:${playerId}`);
        await deleteRoom(store, room.code);
        const rooms = await listRooms(store);
        await appendEvent(store, 'global', { type: 'room_list', list: rooms.map(roomSummary) });
        return json({ ok: true });
      }
      if (data.action === 'kick' && data.playerId) {
        delete room.players[data.playerId];
        await store.delete(`session-room:${data.playerId}`);
        if (!Object.keys(room.players).length) await deleteRoom(store, room.code);
        else {
          if (room.hostId === data.playerId) room.hostId = Object.keys(room.players)[0];
          room.hostName = room.players[room.hostId]?.name || room.hostName;
          await saveRoom(store, room);
          await appendEvent(store, `room:${room.code}`, roomPayload(room, null));
        }
        await appendEvent(store, 'global', { type: 'room_list', list: (await listRooms(store)).map(roomSummary) });
        return json({ ok: true });
      }
      if (data.action === 'update') {
        const patch = data.patch || {};
        if ('maxGuesses' in patch) room.maxGuesses = Math.max(1, Math.min(CHARACTERS.length, Number(patch.maxGuesses) || 8));
        if ('matchRounds' in patch) room.matchRounds = Math.max(1, Math.min(20, Number(patch.matchRounds) || 3));
        if ('timeLimit' in patch) room.timeLimit = Math.max(0, Math.min(600, Number(patch.timeLimit) || 0));
        if ('pool' in patch && POOLS.includes(patch.pool)) room.pool = patch.pool;
        if ('hintsEnabled' in patch) room.hintsEnabled = !!patch.hintsEnabled;
        await store.putJSON(`room:${room.code}`, room);
        await appendEvent(store, `room:${room.code}`, roomPayload(room, null));
        return json({ ok: true });
      }
      return json({ ok: false, error: '未知操作' }, 400);
    }

    if (path === '/api/admin/focus' && method === 'POST') {
      const data = await body(request);
      const room = await getRoom(store, data.code);
      if (!room) return json({ ok: false, error: '房间不存在' }, 404);
      if (room.state !== 'playing') return json({ ok: false, error: '仅对局中可重置切屏计数' }, 400);
      const player = room.players[data.playerId];
      if (!player) return json({ ok: false, error: '玩家不在该房间' }, 404);
      player.focusLosses = 0;
      player.focusLossEvents = [];
      player.focusLossPendingUntil = 0;
      player.focusAppealUsed = false;
      player.focusLossForfeited = false;
      await store.putJSON(`room:${room.code}`, room);
      await appendEvent(store, `room:${room.code}`, {
        type: 'focus_reset', playerId: player.id, name: player.name,
        message: `管理员已重置 ${player.name} 的切屏计数。`,
      });
      await appendEvent(store, `room:${room.code}`, roomPayload(room, null));
      return json({ ok: true, list: Object.values(room.players).map((p) => ({ id: p.id, name: p.name, focusLosses: p.focusLosses })) });
    }

    if (path === '/api/admin/cheat' && method === 'GET') {
      const saved = await store.getJSON('cheat:password', null);
      return json({
        ok: true,
        configured: !!(saved?.hash && saved?.salt),
        setBy: saved?.setBy || '',
        setAt: Number(saved?.setAt || 0),
      });
    }

    if (path === '/api/admin/cheat' && method === 'POST') {
      const data = await body(request);
      if (data.action === 'clear') {
        await store.delete('cheat:password');
        return json({ ok: true, configured: false, message: '外挂密码已清除' });
      }
      const password = String(data.password || '');
      if (password.length < 8) return json({ ok: false, error: '外挂密码至少 8 位' }, 400);
      const credentials = await hashPassword(password);
      await store.putJSON('cheat:password', {
        salt: credentials.salt, hash: credentials.hash,
        setBy: user.id, setAt: Date.now(),
      });
      return json({
        ok: true, configured: true, setBy: user.id, setAt: Date.now(),
        message: '外挂密码已更新',
      });
    }

    if (path === '/api/admin/notice' && method === 'POST') {
      const data = await body(request);
      await appendEvent(store, 'global', { type: 'error', message: `管理员公告：${String(data.message || '').slice(0, 100)}` });
      return json({ ok: true });
    }

    if (path === '/api/admin/legacy' && method === 'GET') {
      return json({ ok: true, list: await listLegacyPlayers(store) });
    }

    if (path === '/api/admin/legacy' && method === 'POST') {
      const data = await body(request);
      const entries = Array.isArray(data.list) ? data.list : [];
      for (const entry of entries) {
        const name = String(entry.name || '').trim().slice(0, 24);
        if (!name) continue;
        if (entry.delete) await deleteLegacyPlayer(store, name);
        else await seedLegacyPlayer(store, name, entry.stats || entry);
      }
      await appendEvent(store, 'global', { type: 'leaderboard', list: await getLeaderboard(store) });
      return json({ ok: true, list: await listLegacyPlayers(store) });
    }
  }

  if (path === '/api/tencent/status' && method === 'GET') {
    const envCredentials = credentialsFromEnv(env);
    return json({ ok: true, ...credentialStatus({ ...envCredentials, __credentialSource: env.__credentialSource || 'runtime-env' }) });
  }

  return json({ ok: false, error: '接口不存在' }, 404);
}

async function getUserByUsernameSafe(store, username) {
  const id = await store.get(`username:${username}`);
  return id ? getUser(store, id) : null;
}

export { json };
