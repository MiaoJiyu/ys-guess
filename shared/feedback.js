import { addToIndexUnlocked, getIndex, withStoreLock } from './store.js';

export const FEEDBACK_TYPES = ['bug', 'feature', 'experience', 'other'];
export const FEEDBACK_STATUSES = ['pending', 'processing', 'resolved'];

export const FEEDBACK_TYPE_LABELS = {
  bug: '问题反馈',
  feature: '功能建议',
  experience: '体验反馈',
  other: '其它',
};

export const FEEDBACK_STATUS_LABELS = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决',
};

function clean(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

export function publicFeedback(item) {
  if (!item) return null;
  return {
    id: item.id,
    userId: item.userId,
    username: item.username,
    nickname: item.nickname,
    type: item.type,
    title: item.title,
    description: item.description,
    roomCode: item.roomCode || '',
    contact: item.contact || '',
    context: item.context || {},
    status: item.status,
    reply: item.reply || '',
    handledBy: item.handledBy || '',
    handledByName: item.handledByName || '',
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function createFeedback(store, user, data) {
  const description = clean(data.description, 2000);
  if (description.length < 5) throw new Error('问题描述至少 5 个字');
  const type = FEEDBACK_TYPES.includes(data.type) ? data.type : 'bug';
  const now = Date.now();
  const item = {
    id: `fb_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.id,
    username: user.username,
    nickname: user.nickname || user.username,
    type,
    title: clean(data.title, 80) || FEEDBACK_TYPE_LABELS[type],
    description,
    roomCode: clean(data.roomCode, 12),
    contact: clean(data.contact, 80),
    context: {
      url: clean(data.context?.url, 300),
      userAgent: clean(data.context?.userAgent, 300),
      viewport: clean(data.context?.viewport, 40),
      language: clean(data.context?.language, 20),
      localTime: clean(data.context?.localTime, 40),
    },
    status: 'pending',
    reply: '',
    handledBy: '',
    handledByName: '',
    createdAt: now,
    updatedAt: now,
  };
  await withStoreLock(async () => {
    await store.putJSON(`feedback:${item.id}`, item);
    await addToIndexUnlocked(store, 'feedback', item.id);
  });
  return item;
}

export async function getFeedback(store, id) {
  if (!id) return null;
  return store.getJSON(`feedback:${id}`, null);
}

export async function listFeedback(store, { userId = '', status = 'all' } = {}) {
  const ids = await getIndex(store, 'feedback');
  const list = [];
  for (const id of ids) {
    const item = await getFeedback(store, id);
    if (!item) continue;
    if (userId && item.userId !== userId) continue;
    if (status !== 'all' && item.status !== status) continue;
    list.push(publicFeedback(item));
  }
  list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}

export async function updateFeedback(store, id, patch, admin) {
  const item = await getFeedback(store, id);
  if (!item) throw new Error('反馈不存在');
  if (patch.status !== undefined) {
    if (!FEEDBACK_STATUSES.includes(patch.status)) throw new Error('状态值无效');
    item.status = patch.status;
  }
  if (patch.reply !== undefined) item.reply = clean(patch.reply, 1000);
  item.handledBy = admin.id;
  item.handledByName = admin.nickname || admin.username;
  item.updatedAt = Date.now();
  await store.putJSON(`feedback:${item.id}`, item);
  return item;
}

export async function feedbackCounts(store) {
  const all = await listFeedback(store);
  return {
    all: all.length,
    pending: all.filter((item) => item.status === 'pending').length,
    processing: all.filter((item) => item.status === 'processing').length,
    resolved: all.filter((item) => item.status === 'resolved').length,
  };
}
