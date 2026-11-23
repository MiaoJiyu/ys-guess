import { STARTING_RATING, MIN_RATING } from './constants.js';
import {
  getIndex, setIndex, addToIndex, removeFromIndex,
  addToIndexUnlocked, removeFromIndexUnlocked, withStoreLock,
} from './store.js';

export function defaultStats() {
  return { rating: STARTING_RATING, games: 0, wins: 0, bestStreak: 0, perfects: 0, hintsUsed: 0 };
}

export async function getUser(store, id) {
  if (!id) return null;
  return store.getJSON(`user:${id}`, null);
}

export async function getUserByUsername(store, username) {
  const id = await getUsernameOwner(store, username);
  return id ? getUser(store, id) : null;
}

export async function getUsernameOwner(store, username) {
  return store.get(`username:${String(username).toLowerCase()}`);
}

export function saveUser(store, user) {
  return withStoreLock(async () => {
    const existing = await getUser(store, user.id);
    const username = String(user.username || '').toLowerCase();
    const owner = await getUsernameOwner(store, username);
    if (owner && owner !== user.id) throw new Error('账号已存在');
    const next = {
      ...defaultStats(),
      ...user,
      username,
      passwordVersion: Number(user.passwordVersion ?? existing?.passwordVersion ?? 0),
      stats: { ...defaultStats(), ...(user.stats || {}) },
    };
    await store.putJSON(`user:${next.id}`, next);
    await addToIndexUnlocked(store, 'users', next.id);
    await store.put(`username:${next.username.toLowerCase()}`, next.id);
    if (existing && existing.username !== next.username) {
      await store.delete(`username:${existing.username.toLowerCase()}`);
    }
    return next;
  });
}

export async function listUsers(store) {
  const ids = await getIndex(store, 'users');
  const users = [];
  for (const id of ids) {
    const user = await getUser(store, id);
    if (user) users.push(user);
  }
  return users;
}

export function deleteUser(store, id) {
  return withStoreLock(async () => {
    const user = await getUser(store, id);
    if (!user) return false;
    await store.delete(`user:${id}`);
    await store.delete(`username:${user.username.toLowerCase()}`);
    await removeFromIndexUnlocked(store, 'users', id);
    return true;
  });
}

export async function listLegacyPlayers(store) {
  const names = await getIndex(store, 'legacyPlayers');
  const result = [];
  for (const name of names) {
    const stats = await store.getJSON(`legacy:${name}`, null);
    if (stats) result.push({ name, ...stats });
  }
  return result;
}

export async function seedLegacyPlayer(store, name, stats) {
  await addToIndex(store, 'legacyPlayers', name);
  const old = await store.getJSON(`legacy:${name}`, {});
  await store.putJSON(`legacy:${name}`, { ...defaultStats(), ...old, ...stats });
}

export async function deleteLegacyPlayer(store, name) {
  await store.delete(`legacy:${name}`);
  await removeFromIndex(store, 'legacyPlayers', name);
}

export function titleFor(rating, wins = 0) {
  if (rating >= 1900) return '爱上雷神isolation';
  if (rating >= 1750) return '深渊满星旅人';
  if (rating >= 1600) return '元素共鸣者';
  if (rating >= 1450 || wins >= 10) return '风之翼冒险家';
  if (wins >= 3) return '初露锋芒';
  return '初来乍到的旅行者';
}

function normalizeEntry(name, stats) {
  const rating = Number(stats.rating ?? STARTING_RATING);
  const wins = Number(stats.wins ?? 0);
  return {
    name,
    rating,
    games: Number(stats.games ?? 0),
    wins,
    bestStreak: Number(stats.bestStreak ?? stats.best_streak ?? 0),
    perfects: Number(stats.perfects ?? 0),
    hintsUsed: Number(stats.hintsUsed ?? stats.hints_used ?? 0),
    title: titleFor(rating, wins),
  };
}

export async function getLeaderboard(store, limit = 50) {
  const users = await listUsers(store);
  const legacy = await listLegacyPlayers(store);
  const list = [
    ...users.filter((u) => !u.disabled).map((u) => normalizeEntry(u.nickname || u.username, u.stats)),
    ...legacy.map((p) => normalizeEntry(p.name, p)),
  ];
  list.sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name, 'zh-CN'));
  return list.slice(0, limit);
}

export async function applyRatingChange(store, id, nickname, delta) {
  const user = id ? await getUser(store, id) : null;
  if (user) {
    const old = Number(user.stats.rating);
    const next = Math.max(MIN_RATING, old + Math.round(delta));
    user.stats.rating = next;
    user.stats.games = Number(user.stats.games || 0) + 1;
    await saveUser(store, user);
    return { old, next };
  }
  if (!nickname) return { old: STARTING_RATING, next: STARTING_RATING };
  const legacy = await store.getJSON(`legacy:${nickname}`, defaultStats());
  const old = Number(legacy.rating ?? STARTING_RATING);
  const next = Math.max(MIN_RATING, old + Math.round(delta));
  await seedLegacyPlayer(store, nickname, { ...legacy, rating: next, games: Number(legacy.games || 0) + 1 });
  return { old, next };
}

export async function recordMatchStats(store, player, room) {
  const patch = {
    wins: Number(player.wins || 0),
    bestStreak: Number(player.bestStreak || 0),
    perfects: Number(player.perfects || 0),
    hintsUsed: Number(player.hintsUsedTotal || 0),
  };
  if (player.userId) {
    const user = await getUser(store, player.userId);
    if (user) {
      user.stats.wins = Number(user.stats.wins || 0) + patch.wins;
      user.stats.bestStreak = Math.max(Number(user.stats.bestStreak || 0), patch.bestStreak);
      user.stats.perfects = Number(user.stats.perfects || 0) + patch.perfects;
      user.stats.hintsUsed = Number(user.stats.hintsUsed || 0) + patch.hintsUsed;
      await saveUser(store, user);
      return;
    }
  }
  const legacy = await store.getJSON(`legacy:${player.name}`, defaultStats());
  await seedLegacyPlayer(store, player.name, {
    ...legacy,
    wins: Number(legacy.wins || 0) + patch.wins,
    bestStreak: Math.max(Number(legacy.bestStreak || 0), patch.bestStreak),
    perfects: Number(legacy.perfects || 0) + patch.perfects,
    hintsUsed: Number(legacy.hintsUsed || 0) + patch.hintsUsed,
  });
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role,
    disabled: !!user.disabled,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    stats: { ...defaultStats(), ...(user.stats || {}) },
  };
}
