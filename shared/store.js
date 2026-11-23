const memory = new Map();

export function createBlobAdapter(blobStore, namespace = 'teyvat') {
  const objectKey = (key) => `${namespace}/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const value = await blobStore.get(objectKey(key), { type: 'text', consistency: 'strong' });
      if (value === null || value === undefined) return null;
      return typeof value === 'string' ? value : String(value);
    },
    async put(key, value) {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      await blobStore.set(objectKey(key), raw);
    },
    async delete(key) {
      await blobStore.delete(objectKey(key));
    },
  };
}

function assertBinding(binding) {
  if (!binding) return;
  for (const method of ['get', 'put']) {
    if (typeof binding[method] !== 'function') throw new Error(`存储绑定缺少 ${method}() 方法`);
  }
  if (typeof binding.delete !== 'function') throw new Error('存储绑定缺少 delete() 方法');
}

function pickBinding(env) {
  if (!env) return null;
  if (env.__storeBinding) {
    assertBinding(env.__storeBinding);
    return env.__storeBinding;
  }
  if (env.__blob) {
    for (const method of ['get', 'set', 'delete']) {
      if (typeof env.__blob[method] !== 'function') throw new Error(`Blob 存储缺少 ${method}() 方法`);
    }
    return createBlobAdapter(env.__blob);
  }
  return null;
}

export function createStore(env) {
  const binding = pickBinding(env);

  const store = {
    async get(key) {
      if (binding) {
        const value = await binding.get(key);
        if (value === null || value === undefined) return null;
        return typeof value === 'string' ? value : String(value);
      }
      return memory.has(key) ? memory.get(key) : null;
    },
    async put(key, value) {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      if (binding) await binding.put(key, raw);
      else memory.set(key, raw);
    },
    async delete(key) {
      if (binding?.delete) await binding.delete(key);
      else if (binding) await binding.put(key, '');
      else memory.delete(key);
    },
    async getJSON(key, fallback = null) {
      const raw = await store.get(key);
      if (raw === null || raw === '') return fallback;
      try { return JSON.parse(raw); } catch { return fallback; }
    },
    async putJSON(key, value) {
      await store.put(key, JSON.stringify(value));
    },
  };

  return store;
}

export async function getIndex(store, name) {
  const list = await store.getJSON(`index:${name}`, []);
  return Array.isArray(list) ? list : [];
}

export async function setIndex(store, name, list) {
  await store.putJSON(`index:${name}`, Array.isArray(list) ? list : []);
}

let storeQueue = Promise.resolve();

export function withStoreLock(task) {
  const result = storeQueue.then(task);
  storeQueue = result.catch(() => {});
  return result;
}

export async function addToIndexUnlocked(store, name, value) {
  const list = await getIndex(store, name);
  if (!list.includes(value)) {
    list.push(value);
    await setIndex(store, name, list);
  }
  return list;
}

export async function removeFromIndexUnlocked(store, name, value) {
  const list = await getIndex(store, name);
  const next = list.filter((item) => item !== value);
  if (next.length !== list.length) await setIndex(store, name, next);
  return next;
}

export function addToIndex(store, name, value) {
  return withStoreLock(() => addToIndexUnlocked(store, name, value));
}

export function removeFromIndex(store, name, value) {
  return withStoreLock(() => removeFromIndexUnlocked(store, name, value));
}

export function appendEvent(store, scope, event) {
  return withStoreLock(async () => {
    const seq = Number((await store.get('_eventSeq')) || 0) + 1;
    await store.put('_eventSeq', String(seq));
    const key = `events:${scope}`;
    const list = await store.getJSON(key, []);
    list.push({ id: seq, event });
    await store.putJSON(key, Array.isArray(list) ? list.slice(-300) : []);
    return seq;
  });
}

export async function readEvents(store, scopes, since = 0) {
  const result = [];
  for (const scope of new Set(scopes.filter(Boolean))) {
    const list = await store.getJSON(`events:${scope}`, []);
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (Number(item.id) > Number(since)) result.push(item);
    }
  }
  result.sort((a, b) => a.id - b.id);
  return result;
}
