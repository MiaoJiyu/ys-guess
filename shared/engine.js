import { CHARACTERS } from './characters.js';
import { avatarIconUrl } from './avatars.js';
import {
  ALL_COLS, CHEAT_LOCK_SECONDS, CHEAT_MAX_ATTEMPTS, CHEAT_REVEAL_RATE,
  COL_LABELS, EMOTES, FOCUS_DEDUPE_MS, FOCUS_GRACE_SECONDS, FOCUS_LOSS_LIMIT,
  HINT_FIELDS, HINT_SCORE_COST, K_FACTOR, MAX_HINTS_PER_MATCH, MAX_MATCH_ROUNDS,
  MAX_PLAYERS, MAX_TIME_LIMIT, MIN_RATING, MODIFIERS, POOLS, REGION_ORDER,
  DAYS_IN_MONTH, SERVER_VERSION, STARTING_RATING,
} from './constants.js';
import { hashPassword, randomDigits, randomId, verifyPassword } from './crypto.js';
import { getIndex, setIndex, removeFromIndexUnlocked, addToIndexUnlocked, withStoreLock } from './store.js';
import { applyRatingChange, getLeaderboard, recordMatchStats, titleFor } from './user-store.js';

const MAX_GUESSES_LIMIT = CHARACTERS.length;

for (const character of CHARACTERS) {
  character.avatar = avatarIconUrl(character.name);
}

export function poolCharacters(pool) {
  if (!pool || pool === '全部' || !POOLS.includes(pool)) return CHARACTERS;
  return CHARACTERS.filter((c) => c.region === pool);
}

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function pickTarget(room) {
  const pool = poolCharacters(room.pool);
  const names = new Set(pool.map((character) => character.name));
  let bag = (room.targetBag || []).filter((name) => names.has(name));
  const last = (room.recentTargets || []).at(-1);
  if (!bag.length) {
    bag = shuffle(pool.map((character) => character.name));
    if (bag.length > 1 && bag[0] === last) {
      const swapIndex = 1 + Math.floor(Math.random() * (bag.length - 1));
      [bag[0], bag[swapIndex]] = [bag[swapIndex], bag[0]];
    }
  }
  const name = bag.shift();
  room.targetBag = bag;
  return pool.find((character) => character.name === name) || pool[0];
}

function chooseModifier() {
  const total = MODIFIERS.reduce((sum, m) => sum + (m.weight || 1), 0);
  let pick = Math.random() * total;
  for (const modifier of MODIFIERS) {
    pick -= modifier.weight || 1;
    if (pick <= 0) return { ...modifier };
  }
  return { ...MODIFIERS[0] };
}

export function regionStatus(guess, target) {
  if (guess === target) return 'correct';
  if (guess === '其他' || target === '其他') return 'wrong';
  const gi = REGION_ORDER.indexOf(guess);
  const ti = REGION_ORDER.indexOf(target);
  if (gi < 0 || ti < 0) return 'wrong';
  return Math.abs(gi - ti) === 1 ? 'similar' : 'wrong';
}

function dayOfYear(value) {
  const [month, day] = String(value).split('/').map(Number);
  return DAYS_IN_MONTH.slice(0, month - 1).reduce((a, b) => a + b, 0) + day;
}

function bdayDiff(a, b) {
  const diff = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(diff, 365 - diff);
}

function birthdayCell(guess, target) {
  if (guess === '/' || target === '/') return { text: guess, status: 'wrong' };
  if (guess === target) return { text: guess, status: 'correct' };
  let raw = dayOfYear(target) - dayOfYear(guess);
  if (raw > 182) raw -= 365;
  if (raw < -182) raw += 365;
  return { text: guess + (raw > 0 ? ' ↑' : ' ↓'), status: bdayDiff(guess, target) <= 30 ? 'similar' : 'wrong' };
}

function verNum(value) {
  if (value === '/') return -1;
  const [major, minor] = String(value).split('.').map(Number);
  return major * 100 + minor;
}

function verMajor(value) {
  if (value === '/') return -1;
  return Number(String(value).split('.')[0]);
}

function versionCell(guess, target) {
  if (guess === '/' || target === '/') return { text: guess, status: 'wrong' };
  if (guess === target) return { text: guess, status: 'correct' };
  const status = Math.abs(verMajor(guess) - verMajor(target)) <= 1 ? 'similar' : 'wrong';
  return { text: guess + (verNum(target) > verNum(guess) ? ' ↑' : ' ↓'), status };
}

export function judge(guess, target, enabledCols = ALL_COLS) {
  const result = [{ key: 'name', text: guess.name, status: guess.name === target.name ? 'correct' : 'wrong' }];
  for (const col of enabledCols) {
    if (col === 'gender') {
      result.push({ key: col, text: guess.gender, status: guess.gender === target.gender ? 'correct' : 'wrong' });
    } else if (col === 'region') {
      result.push({ key: col, text: guess.region, status: regionStatus(guess.region, target.region) });
    } else if (col === 'element') {
      result.push({ key: col, text: guess.element, status: guess.element === target.element ? 'correct' : 'wrong' });
    } else if (col === 'weapon') {
      result.push({ key: col, text: guess.weapon, status: guess.weapon === target.weapon ? 'correct' : 'wrong' });
    } else if (col === 'birthday') {
      const cell = birthdayCell(guess.birthday, target.birthday);
      result.push({ key: col, text: cell.text, status: cell.status });
    } else if (col === 'version') {
      const cell = versionCell(guess.version, target.version);
      result.push({ key: col, text: cell.text, status: cell.status });
    } else if (col === 'rarity') {
      result.push({ key: col, text: `${guess.rarity}星`, status: guess.rarity === target.rarity ? 'correct' : 'wrong' });
    }
  }
  return result;
}

export function calculateRatingDeltas(players) {
  if (players.length < 2 || !players.some((p) => Number(p.wins) > 0)) {
    return Object.fromEntries(players.map((p) => [p.id, 0]));
  }
  const ranked = [...players].sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore);
  const rankMap = new Map(ranked.map((p, index) => [p.id, index]));
  const maxScore = Math.max(1, ...players.map((p) => Number(p.totalScore) || 0));
  const maxWins = Math.max(1, ...players.map((p) => Number(p.wins) || 0));
  const deltas = {};
  for (const p of players) {
    let sum = 0;
    for (const other of players) {
      if (other.id === p.id) continue;
      const expected = 1 / (1 + 10 ** ((other.rating - p.rating) / 400));
      const actual = rankMap.get(p.id) < rankMap.get(other.id) ? 1 : rankMap.get(p.id) > rankMap.get(other.id) ? 0 : 0.5;
      sum += actual - expected;
    }
    const scoreShare = (Number(p.totalScore) || 0) / maxScore;
    const winShare = (Number(p.wins) || 0) / maxWins;
    const performance = 0.85 + scoreShare * 0.45 + winShare * 0.2;
    deltas[p.id] = Math.round((K_FACTOR * sum * performance) / (players.length - 1));
  }
  return deltas;
}

export function publicPlayer(p) {
  return {
    id: p.id,
    userId: p.userId || null,
    name: p.name,
    guessesCount: p.guesses.length,
    done: p.done,
    winOrder: p.winOrder,
    roundScore: p.roundScore,
    totalScore: p.totalScore,
    guessedNames: p.guesses.map((g) => g.name),
    wins: p.wins,
    rating: p.rating,
    hintsLeft: p.hintsLeft,
    roundHints: p.roundHints,
    streak: p.streak,
    bestStreak: p.bestStreak,
    perfects: p.perfects,
    roundBreakdown: p.roundBreakdown,
    focusLosses: Number(p.focusLosses || 0),
    focusLossPendingUntil: Number(p.focusLossPendingUntil || 0) / 1000,
    focusAppealUsed: !!p.focusAppealUsed,
    focusLossForfeited: !!p.focusLossForfeited,
    cheatActive: !!p.cheatActive,
  };
}

export function roomPayload(room, viewerId, leaderboard = []) {
  return {
    type: 'room_update',
    code: room.code,
    hostId: room.hostId,
    maxGuesses: room.maxGuesses,
    maxGuessesLimit: MAX_GUESSES_LIMIT,
    matchRounds: room.matchRounds,
    currentMatchRound: room.currentMatchRound,
    state: room.state,
    enabledCols: room.enabledCols,
    players: Object.values(room.players).map(publicPlayer),
    you: viewerId,
    hintsEnabled: room.hintsEnabled,
    hintsPerMatch: room.hintsPerMatch,
    hintCost: HINT_SCORE_COST,
    timeLimit: room.timeLimit,
    roundDeadline: room.roundDeadline,
    doubleFinal: room.doubleFinal,
    pool: room.pool,
    poolSize: poolCharacters(room.pool).length,
    roundMaxGuesses: room.roundMaxGuesses || room.maxGuesses,
    modifier: room.modifier,
    maxPlayers: MAX_PLAYERS,
    visibility: room.visibility,
    focusLossLimit: FOCUS_LOSS_LIMIT,
    focusGraceSeconds: FOCUS_GRACE_SECONDS,
    serverTime: Date.now() / 1000,
    version: SERVER_VERSION,
    leaderboard,
  };
}

export function roomSummary(room) {
  return {
    code: room.code,
    visibility: room.visibility,
    hostName: room.hostName,
    playerCount: Object.keys(room.players).length,
    maxPlayers: MAX_PLAYERS,
    state: room.state,
    maxGuesses: room.maxGuesses,
    matchRounds: room.matchRounds,
    pool: room.pool,
    timeLimit: room.timeLimit,
    hasPassword: !!room.passwordHash,
    createdAt: room.createdAt,
    serverTime: Date.now() / 1000,
  };
}

export async function getRoom(store, code) {
  if (!code) return null;
  return store.getJSON(`room:${code}`, null);
}

export function saveRoom(store, room) {
  return withStoreLock(async () => {
    room.updatedAt = Date.now();
    await store.putJSON(`room:${room.code}`, room);
    await addToIndexUnlocked(store, 'rooms', room.code);
  });
}

export function deleteRoom(store, code) {
  return withStoreLock(async () => {
    await store.delete(`room:${code}`);
    await removeFromIndexUnlocked(store, 'rooms', code);
  });
}

export async function listRooms(store) {
  const codes = await getIndex(store, 'rooms');
  const rooms = [];
  for (const code of codes) {
    const room = await getRoom(store, code);
    if (room && Object.keys(room.players).length > 0) rooms.push(room);
    else if (room) await deleteRoom(store, code);
  }
  return rooms;
}

function makePlayer(id, userId, name, rating) {
  return {
    id, userId, name,
    guesses: [], guessCells: [], done: false, winOrder: null,
    roundScore: 0, totalScore: 0, wins: 0,
    rating: Number(rating || STARTING_RATING),
    streak: 0, bestStreak: 0, perfects: 0,
    hintsLeft: 0, roundHints: 0, hintLog: [], hintsUsedTotal: 0,
    roundBreakdown: null,
    focusLosses: 0, focusLossEvents: [], focusLossPendingUntil: 0,
    focusAppealUsed: false, focusLossForfeited: false,
    cheatActive: false, lastHintAt: 0,
  };
}

function resetFocus(p) {
  p.focusLosses = 0;
  p.focusLossEvents = [];
  p.focusLossPendingUntil = 0;
  p.focusAppealUsed = false;
  p.focusLossForfeited = false;
}

function resetPlayer(p, hintsPerMatch) {
  p.guesses = []; p.guessCells = []; p.done = false; p.winOrder = null;
  p.roundScore = 0; p.totalScore = 0; p.wins = 0;
  p.streak = 0; p.bestStreak = 0; p.perfects = 0;
  p.hintsLeft = hintsPerMatch; p.roundHints = 0; p.hintLog = [];
  p.hintsUsedTotal = 0; p.roundBreakdown = null;
  resetFocus(p);
  p.cheatActive = false;
}

function resetMatch(room) {
  room.currentMatchRound = 0;
  room.matchSettled = false;
  room.history = [];
  room.winCounter = 0;
  room.roundDeadline = 0;
  room.roundToken = (room.roundToken || 0) + 1;
  for (const p of Object.values(room.players)) resetPlayer(p, room.hintsPerMatch);
}

function calculateRoundScore(p, room) {
  const modifier = room.modifier || {};
  const effective = Number(room.roundMaxGuesses || room.maxGuesses);
  const used = p.guesses.length;
  const remain = Math.max(0, effective - used);
  const base = 100;
  const remainBonus = remain * 15;
  const extraRemain = remain * Number(modifier.remain_extra || 0);
  const flatBonus = Number(modifier.flat_bonus || 0);
  const perfectBonus = used === 1 ? 25 : 0;
  const streakBonus = Math.min(30, Math.max(0, p.streak) * 10);
  let multiplier = Number(modifier.score_mult || 1);
  if (room.doubleFinal && room.currentMatchRound + 1 === room.matchRounds) multiplier *= 2;
  const subtotal = base + remainBonus + extraRemain + flatBonus + perfectBonus + streakBonus;
  const beforeHint = Math.round(subtotal * multiplier);
  const penalty = modifier.free_hint ? 0 : p.roundHints * HINT_SCORE_COST;
  return {
    base, remainBonus, extraRemain, flatBonus, perfectBonus, streakBonus,
    multiplier, beforeHint, hintPenalty: penalty, total: Math.max(0, beforeHint - penalty),
  };
}

function finishRound(store, room, reason, emit) {
  if (room.state !== 'playing') return;
  room.state = 'round_ended';
  room.currentMatchRound += 1;
  room.roundDeadline = 0;
  const target = room.target;
  const ranking = [];
  for (const p of Object.values(room.players)) {
    p.totalScore += p.roundScore;
    p.focusLossPendingUntil = 0;
    if (p.winOrder === 1) {
      p.wins += 1;
      p.streak += 1;
      p.bestStreak = Math.max(p.bestStreak, p.streak);
      if (p.guesses.length === 1) p.perfects += 1;
    } else {
      p.streak = 0;
    }
    ranking.push({
      name: p.name, guesses: p.guesses.length, winOrder: p.winOrder,
      roundScore: p.roundScore, guessLog: p.guessCells, wins: p.wins,
      totalScore: p.totalScore, rating: p.rating, streak: p.streak,
      hintsUsed: p.roundHints, breakdown: p.roundBreakdown,
      perfect: p.winOrder === 1 && p.guesses.length === 1,
      focusLosses: Number(p.focusLosses || 0),
      focusLossForfeited: !!p.focusLossForfeited,
    });
  }
  ranking.sort((a, b) => (a.winOrder ?? 1e9) - (b.winOrder ?? 1e9) || a.guesses - b.guesses);
  room.history.push({
    round: room.currentMatchRound, target: target?.name,
    element: target?.element,
    winner: Object.values(room.players).find((p) => p.winOrder === 1)?.name || null,
    reason,
  });
  room.history = room.history.slice(-MAX_MATCH_ROUNDS);
  emit(`room:${room.code}`, {
    type: 'game_end', target, ranking, enabledCols: room.enabledCols,
    currentMatchRound: room.currentMatchRound, matchRounds: room.matchRounds,
    reason, modifier: room.modifier, doubleFinal: room.doubleFinal,
    serverTime: Date.now() / 1000,
  });
  emit(`room:${room.code}`, roomPayload(room, null));
}

async function finishMatch(store, room, emit) {
  if (room.state !== 'round_ended' || room.matchSettled) return;
  room.matchSettled = true;
  room.state = 'match_ended';
  room.roundDeadline = 0;
  const players = Object.values(room.players).map((p) => ({
    id: p.id, userId: p.userId, name: p.name, rating: p.rating,
    wins: p.wins, totalScore: p.totalScore,
  }));
  const deltas = calculateRatingDeltas(players);
  const ratingResults = [];
  for (const p of Object.values(room.players)) {
    p.cheatActive = false;
    const delta = deltas[p.id] || 0;
    const change = await applyRatingChange(store, p.userId, p.name, delta);
    p.rating = change.next;
    await recordMatchStats(store, p, room);
    ratingResults.push({ id: p.id, name: p.name, oldRating: change.old, newRating: change.next, delta: change.next - change.old });
  }
  const ratingMap = new Map(ratingResults.map((r) => [r.id, r]));
  const finalRanking = Object.values(room.players).map((p) => {
    const rr = ratingMap.get(p.id) || {};
    return {
      name: p.name, wins: p.wins, totalScore: p.totalScore,
      bestStreak: p.bestStreak, perfects: p.perfects, hintsUsed: p.hintsUsedTotal,
      oldRating: rr.oldRating ?? p.rating, newRating: rr.newRating ?? p.rating, delta: rr.delta ?? 0,
    };
  }).sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore);
  emit(`room:${room.code}`, {
    type: 'match_end', finalRanking, matchRounds: room.matchRounds,
    history: room.history, mvp: finalRanking[0]?.name || null,
  });
  emit('global', { type: 'leaderboard', list: await getLeaderboard(store) });
  emit(`room:${room.code}`, roomPayload(room, null));
}

function startSmallRound(store, room, emit) {
  room.roundToken = (room.roundToken || 0) + 1;
  const modifier = chooseModifier();
  room.modifier = modifier;
  const effective = Number(room.maxGuesses) + Number(modifier.guess_delta || 0);
  room.roundMaxGuesses = Math.max(1, Math.min(MAX_GUESSES_LIMIT, effective));
  const target = pickTarget(room);
  room.target = target;
  room.recentTargets = [...(room.recentTargets || []), target.name].slice(-8);
  room.state = 'playing';
  room.winCounter = 0;
  room.roundDeadline = room.timeLimit > 0 ? Date.now() / 1000 + room.timeLimit : 0;
  for (const p of Object.values(room.players)) {
    p.guesses = []; p.guessCells = []; p.done = false; p.winOrder = null;
    p.roundScore = 0; p.roundHints = 0; p.hintLog = []; p.roundBreakdown = null;
    resetFocus(p);
  }
  emit(`room:${room.code}`, {
    type: 'game_start', enabledCols: room.enabledCols, modifier,
    roundMaxGuesses: room.roundMaxGuesses, timeLimit: room.timeLimit,
    roundDeadline: room.roundDeadline, serverTime: Date.now() / 1000,
    pool: room.pool, currentMatchRound: room.currentMatchRound,
    matchRounds: room.matchRounds, doubleFinal: room.doubleFinal,
  });
  emit(`room:${room.code}`, roomPayload(room, null));
}

export async function expireFocusGrace(store, room, emit) {
  if (room.state !== 'playing') return false;
  const now = Date.now();
  const pending = Object.values(room.players).filter((p) =>
    p.focusLossPendingUntil && Number(p.focusLossPendingUntil) <= now);
  if (!pending.length) return false;
  const forfeited = [];
  for (const p of pending) {
    p.done = true;
    p.winOrder = null;
    p.roundScore = 0;
    p.roundBreakdown = null;
    p.focusLossPendingUntil = 0;
    p.focusLossForfeited = true;
    forfeited.push({ id: p.id, name: p.name, count: Number(p.focusLosses || 0) });
    if (p.userId) emit(`user:${p.userId}`, {
      type: 'focus_forfeit', forfeited: true, count: Number(p.focusLosses || 0),
      message: `切屏次数超过 ${FOCUS_LOSS_LIMIT} 次，本局已判定失败。`,
    });
  }
  emit(`room:${room.code}`, {
    type: 'focus_forfeit', players: forfeited, reason: 'focus_loss',
    message: `${forfeited.map((p) => p.name).join('、')} 因切屏超限被判负，本局结束。`,
  });
  finishRound(store, room, 'focus_loss', emit);
  return true;
}

export async function expireRoomIfNeeded(store, room, emit) {
  if (room.state !== 'playing') return;
  if (await expireFocusGrace(store, room, emit)) return;
  if (!room.roundDeadline || Date.now() / 1000 <= room.roundDeadline) return;
  for (const p of Object.values(room.players)) {
    if (!p.done) { p.done = true; p.roundScore = 0; p.roundBreakdown = null; }
  }
  emit(`room:${room.code}`, { type: 'time_up', message: '地脉时限已到，本局结束！' });
  finishRound(store, room, 'timeout', emit);
}

function checkAllDone(store, room, emit) {
  const players = Object.values(room.players);
  if (players.length && players.every((p) => p.done)) finishRound(store, room, 'all_done', emit);
}

function emitRoom(emit, store, room, leaderboard) {
  emit(`room:${room.code}`, roomPayload(room, null, leaderboard));
}

export async function performAction(context, msg) {
  const { store, user, sessionId, append, env = {} } = context;
  const emit = (scope, event) => append(scope, event);
  const type = msg?.type;
  const fail = (message) => ({ ok: false, error: message });

  if (type === 'ping') {
    emit(`user:${user?.id || sessionId}`, { type: 'pong', serverTime: Date.now() / 1000 });
    return { ok: true };
  }

  if (type === 'get_leaderboard') {
    emit(`user:${user?.id || sessionId}`, { type: 'leaderboard', list: await getLeaderboard(store) });
    return { ok: true };
  }

  if (!user) return fail('请先登录后再进行联机');
  const currentRoomCode = await store.get(`session-room:${sessionId}`);

  if (type === 'create') {
    if (currentRoomCode) return fail('请先离开当前房间再创建新房');
    const name = String(msg.name || user.nickname || user.username).trim().slice(0, 8) || user.username.slice(0, 8);
    const visibility = msg.visibility === 'lan' ? 'lan' : 'public';
    const maxGuesses = Math.max(1, Math.min(MAX_GUESSES_LIMIT, Number(msg.maxGuesses) || 8));
    const password = String(msg.password || '');
    if (visibility === 'public' && password.length < 4) return fail('公网房间必须设置至少 4 位房间密码');
    const rooms = await listRooms(store);
    let code = randomDigits(6);
    while (rooms.some((r) => r.code === code)) code = randomDigits(6);
    const credentials = visibility === 'public' ? await hashPassword(password) : { salt: '', hash: '' };
    const room = {
      code, hostId: sessionId, hostName: name, visibility,
      passwordSalt: credentials.salt, passwordHash: credentials.hash,
      lanToken: visibility === 'lan' ? randomId(10) : '',
      maxGuesses, matchRounds: 3, currentMatchRound: 0,
      target: null, state: 'waiting', winCounter: 0,
      enabledCols: [...ALL_COLS], players: {},
      hintsEnabled: true, hintsPerMatch: 2, timeLimit: 0, doubleFinal: false,
      pool: '全部', modifier: null, roundMaxGuesses: maxGuesses,
      roundDeadline: 0, roundToken: 0, history: [], recentTargets: [],
      createdAt: Date.now(),
    };
    room.players[sessionId] = makePlayer(sessionId, user.id, name, user.stats.rating);
    await store.put(`session-room:${sessionId}`, code);
    await saveRoom(store, room);
    emit(`room:${code}`, roomPayload(room, sessionId, await getLeaderboard(store)));
    emit('global', { type: 'room_list', list: (await listRooms(store)).map(roomSummary) });
    return { ok: true, roomCode: code };
  }

  if (type === 'join') {
    if (currentRoomCode) return fail('请先离开当前房间再加入新房');
    const code = String(msg.roomCode || msg.code || '').trim();
    const room = await getRoom(store, code);
    if (!room) return fail('房间不存在或已解散');
    if (room.state !== 'waiting') return fail('对局已开始，无法加入');
    if (Object.keys(room.players).length >= MAX_PLAYERS) return fail(`房间已满（最多 ${MAX_PLAYERS} 人）`);
    if (Object.values(room.players).some((p) => p.userId === user.id)) return fail('你已在这个房间中');
    if (room.visibility === 'public') {
      const ok = await verifyPassword(msg.password || '', room.passwordSalt, room.passwordHash);
      if (!ok) return fail('房间号码或密码错误');
    } else if (!msg.lanToken || room.lanToken !== msg.lanToken) {
      return fail('局域网房间校验失败，请从大厅重新进入');
    }
    const name = String(msg.name || user.nickname || user.username).trim().slice(0, 8) || user.username.slice(0, 8);
    if (Object.values(room.players).some((p) => p.name === name)) return fail('这个昵称已被房间里的旅行者使用');
    room.players[sessionId] = makePlayer(sessionId, user.id, name, user.stats.rating);
    await store.put(`session-room:${sessionId}`, code);
    await saveRoom(store, room);
    emit(`room:${code}`, roomPayload(room, sessionId, await getLeaderboard(store)));
    emit('global', { type: 'room_list', list: (await listRooms(store)).map(roomSummary) });
    return { ok: true, roomCode: code };
  }

  const room = await getRoom(store, currentRoomCode);
  if (!room) return fail('你当前不在房间中');
  const stateBeforeExpiry = room.state;
  await expireRoomIfNeeded(store, room, emit);
  if (stateBeforeExpiry !== room.state) {
    await saveRoom(store, room);
    return { ok: false, silent: true };
  }

  if (type === 'leave') {
    if (room.players[sessionId] && room.players[sessionId].userId !== user.id) return fail('会话身份不匹配');
    const code = room.code;
    delete room.players[sessionId];
    await store.delete(`session-room:${sessionId}`);
    if (!Object.keys(room.players).length) {
      await deleteRoom(store, code);
      emit('global', { type: 'room_list', list: (await listRooms(store)).map(roomSummary) });
    } else {
      if (room.hostId === sessionId) room.hostId = Object.keys(room.players)[0];
      room.hostName = room.players[room.hostId]?.name || room.hostName;
      await saveRoom(store, room);
      emitRoom(emit, store, room, await getLeaderboard(store));
    }
    emit(`user:${user.id}`, { type: 'left' });
    return { ok: true };
  }

  const player = room.players[sessionId];
  if (!player) return fail('你当前不在房间中');
  if (player.userId !== user.id) return fail('会话身份不匹配，请重新进入房间');

  if (type === 'set_options' || type.startsWith('set_')) {
    if (room.hostId !== sessionId || room.state !== 'waiting') return { ok: false, silent: true };
    const changes = type === 'set_options' ? msg : {
      set_cols: { cols: msg.cols }, set_max_guesses: { maxGuesses: msg.n },
      set_match_rounds: { matchRounds: msg.n },
    }[type] || {};
    if ('maxGuesses' in changes) {
      room.maxGuesses = Math.max(1, Math.min(MAX_GUESSES_LIMIT, Number(changes.maxGuesses) || room.maxGuesses));
      room.roundMaxGuesses = room.maxGuesses;
    }
    if ('matchRounds' in changes) room.matchRounds = Math.max(1, Math.min(MAX_MATCH_ROUNDS, Number(changes.matchRounds) || room.matchRounds));
    if ('cols' in changes) room.enabledCols = ALL_COLS.filter((c) => (changes.cols || []).includes(c));
    if ('hintsEnabled' in changes) room.hintsEnabled = !!changes.hintsEnabled;
    if ('hintsPerMatch' in changes) {
      room.hintsPerMatch = Math.max(0, Math.min(MAX_HINTS_PER_MATCH, Number(changes.hintsPerMatch) || 0));
      for (const p of Object.values(room.players)) p.hintsLeft = room.hintsPerMatch;
    }
    if ('timeLimit' in changes) room.timeLimit = Math.max(0, Math.min(MAX_TIME_LIMIT, Number(changes.timeLimit) || 0));
    if ('doubleFinal' in changes) room.doubleFinal = !!changes.doubleFinal;
    if ('pool' in changes && POOLS.includes(changes.pool)) room.pool = changes.pool;
    await saveRoom(store, room);
    emitRoom(emit, store, room, await getLeaderboard(store));
    return { ok: true };
  }

  if (type === 'start' || type === 'rematch') {
    if (room.hostId !== sessionId) return { ok: false, silent: true };
    if (type === 'rematch' && room.state !== 'match_ended') return { ok: false, silent: true };
    if (room.state === 'waiting') { resetMatch(room); startSmallRound(store, room, emit); }
    else if (room.state === 'round_ended') {
      if (room.currentMatchRound < room.matchRounds) startSmallRound(store, room, emit);
      else await finishMatch(store, room, emit);
    } else if (room.state === 'match_ended') {
      if (type === 'rematch') { resetMatch(room); startSmallRound(store, room, emit); }
      else { room.state = 'waiting'; resetMatch(room); emitRoom(emit, store, room, await getLeaderboard(store)); }
    }
    await saveRoom(store, room);
    return { ok: true };
  }

  if (type === 'cheat_activate') {
    if (!['playing', 'round_ended'].includes(room.state)) return fail('只能在本场大场进行中输入外挂密码');
    if (player.cheatActive) return fail('本场已启用无限星辉，无需重复激活');
    const now = Date.now();
    const failKey = `cheat:fail:${user.id}`;
    const failed = await store.getJSON(failKey, { count: 0, until: 0 });
    if (Number(failed.until || 0) > now) {
      return fail(`密码错误次数过多，请 ${Math.ceil((failed.until - now) / 1000)} 秒后重试`);
    }
    const saved = await store.getJSON('cheat:password', null);
    if (!saved?.hash || !saved?.salt) return fail('管理员尚未设置外挂密码');
    const ok = await verifyPassword(String(msg.password || ''), saved.salt, saved.hash);
    if (!ok) {
      const count = Number(failed.count || 0) + 1;
      const locked = count >= CHEAT_MAX_ATTEMPTS;
      await store.putJSON(failKey, {
        count: locked ? 0 : count,
        until: locked ? now + CHEAT_LOCK_SECONDS * 1000 : 0,
      });
      return fail(locked
        ? `密码错误 ${CHEAT_MAX_ATTEMPTS} 次，已锁定 ${CHEAT_LOCK_SECONDS} 秒`
        : `外挂密码错误，还可尝试 ${CHEAT_MAX_ATTEMPTS - count} 次`);
    }
    await store.delete(failKey);
    player.cheatActive = true;
    await saveRoom(store, room);
    emit(`user:${user.id}`, {
      type: 'cheat_result', success: true, active: true,
      message: '外挂激活成功：本场无限星辉已生效',
    });
    emitRoom(emit, store, room, await getLeaderboard(store));
    return { ok: true };
  }

  if (type === 'focus_loss') {
    if (room.state !== 'playing' || player.done || player.focusLossForfeited) return { ok: false, silent: true };
    const nonce = String(msg.nonce || '');
    if (!nonce || (player.focusLossEvents || []).some((item) => item.nonce === nonce)) return { ok: false, silent: true };
    const now = Date.now();
    const last = (player.focusLossEvents || []).at(-1);
    if (last && now - Number(last.at) < FOCUS_DEDUPE_MS) return { ok: false, silent: true };
    const reason = ['blur', 'visibility', 'unknown'].includes(msg.reason) ? msg.reason : 'unknown';
    player.focusLossEvents = [...(player.focusLossEvents || []), { nonce, at: now, reason }].slice(-20);
    player.focusLosses = Number(player.focusLosses || 0) + 1;
    const count = player.focusLosses;
    emit(`user:${user.id}`, {
      type: 'focus_loss', count, limit: FOCUS_LOSS_LIMIT, reason,
      message: `检测到切屏 ${count}/${FOCUS_LOSS_LIMIT} 次。`,
    });
    if (count > FOCUS_LOSS_LIMIT && !player.focusLossPendingUntil) {
      player.focusLossPendingUntil = now + FOCUS_GRACE_SECONDS * 1000;
      emit(`user:${user.id}`, {
        type: 'focus_warning', count, limit: FOCUS_LOSS_LIMIT,
        pendingUntil: player.focusLossPendingUntil / 1000,
        appealAvailable: !player.focusAppealUsed,
        message: `切屏已达 ${count} 次，${FOCUS_GRACE_SECONDS} 秒后判负；回到页面后可选择误判撤销。`,
      });
    } else if (count === FOCUS_LOSS_LIMIT) {
      emit(`user:${user.id}`, {
        type: 'focus_warning', count, limit: FOCUS_LOSS_LIMIT,
        pendingUntil: 0, appealAvailable: !player.focusAppealUsed,
        message: '再切屏 1 次将进入判负确认期。',
      });
    }
    await saveRoom(store, room);
    emitRoom(emit, store, room, await getLeaderboard(store));
    return { ok: true };
  }

  if (type === 'focus_appeal') {
    if (room.state !== 'playing' || !player.focusLossPendingUntil) return fail('当前没有待确认的切屏判负');
    if (Date.now() > Number(player.focusLossPendingUntil)) return fail('判负确认期已结束');
    if (player.focusAppealUsed) return fail('本局已使用过误判撤销');
    player.focusAppealUsed = true;
    player.focusLosses = FOCUS_LOSS_LIMIT;
    player.focusLossPendingUntil = 0;
    emit(`user:${user.id}`, {
      type: 'focus_appeal_result', success: true, count: player.focusLosses,
      limit: FOCUS_LOSS_LIMIT, message: '误判撤销成功，本局计数已回退到阈值上限。',
    });
    await saveRoom(store, room);
    emitRoom(emit, store, room, await getLeaderboard(store));
    return { ok: true };
  }

  if (type === 'guess') {
    if (room.state !== 'playing' || player.done || player.focusLossPendingUntil) return { ok: false, silent: true };
    const name = String(msg.name || '');
    if (player.guesses.some((g) => g.name === name)) return { ok: false, silent: true };
    const guess = CHARACTERS.find((c) => c.name === name);
    if (!guess) return { ok: false, silent: true };
    player.guesses.push(guess);
    const cells = judge(guess, room.target, room.enabledCols);
    player.guessCells.push({ name, cells });
    const correct = guess.name === room.target.name;
    const payload = {
      type: 'guess_result', cells, correct, guessCount: player.guesses.length,
      roundMaxGuesses: room.roundMaxGuesses,
    };
    if (correct) {
      player.done = true;
      room.winCounter += 1;
      player.winOrder = room.winCounter;
      player.roundBreakdown = calculateRoundScore(player, room);
      player.roundScore = player.roundBreakdown.total;
      payload.roundScore = player.roundScore;
      payload.breakdown = player.roundBreakdown;
      emit(`user:${user.id}`, payload);
      finishRound(store, room, 'solved', emit);
    } else {
      if (player.guesses.length >= room.roundMaxGuesses) {
        player.done = true; player.roundScore = 0; player.roundBreakdown = null;
      }
      emit(`user:${user.id}`, payload);
      checkAllDone(store, room, emit);
    }
    await saveRoom(store, room);
    return { ok: true };
  }

  if (type === 'hint') {
    if (room.state !== 'playing' || player.done || player.focusLossPendingUntil) return { ok: false, silent: true };
    const now = Date.now();
    if (now - Number(player.lastHintAt || 0) < 700) return { ok: false, silent: true };
    player.lastHintAt = now;
    const cheat = !!player.cheatActive;
    if (!cheat && (!room.hintsEnabled || player.hintsLeft <= 0)) return { ok: false, silent: true };
    const revealed = new Set(player.hintLog);
    const unrevealed = HINT_FIELDS.filter(([key]) => !revealed.has(key));
    const fields = unrevealed.length ? unrevealed : (cheat ? HINT_FIELDS : []);
    if (!fields.length) return { ok: false, silent: true };
    const [key, label] = fields[Math.floor(Math.random() * fields.length)];
    const value = key === 'rarity' ? `${room.target.rarity}星` : key === 'version' ? `v${room.target.version}` : String(room.target[key]);
    const modifier = room.modifier || {};
    let refunded = false;
    if (cheat) {
      if (!revealed.has(key)) player.hintLog.push(key);
    } else {
      player.hintsLeft = Math.max(0, player.hintsLeft - 1);
      player.roundHints += 1;
      player.hintsUsedTotal += 1;
      player.hintLog.push(key);
      refunded = !!(modifier.hint_refund && player.roundHints === 1);
      if (refunded) player.hintsLeft += 1;
    }
    const revealRate = Math.max(0, Math.min(1, Number(env.CHEAT_REVEAL_RATE ?? CHEAT_REVEAL_RATE)));
    const directReveal = cheat && Math.random() < revealRate;
    emit(`user:${user.id}`, {
      type: 'hint_result', key, label, value, hintsLeft: player.hintsLeft,
      roundHints: player.roundHints,
      cost: cheat || modifier.free_hint ? 0 : HINT_SCORE_COST,
      freeHint: !!modifier.free_hint, refunded,
      cheat, directReveal,
      answerName: directReveal ? room.target.name : null,
      answer: directReveal ? room.target : null,
      message: directReveal ? `元素视野共鸣：答案就是「${room.target.name}」！` : null,
    });
    await saveRoom(store, room);
    emitRoom(emit, store, room, await getLeaderboard(store));
    return { ok: true };
  }

  if (type === 'emote') {
    const emote = EMOTES[String(msg.id || '')];
    const last = Number(await store.get(`emote:${sessionId}`)) || 0;
    if (!emote || Date.now() - last < 1000) return { ok: false, silent: true };
    await store.put(`emote:${sessionId}`, String(Date.now()));
    emit(`room:${room.code}`, {
      type: 'emote', playerId: sessionId, name: player.name,
      emoteId: msg.id, icon: emote.icon, text: emote.text,
    });
    return { ok: true };
  }

  return { ok: false, silent: true };
}

export { CHARACTERS, COL_LABELS, ALL_COLS, EMOTES, POOLS, MAX_GUESSES_LIMIT };
