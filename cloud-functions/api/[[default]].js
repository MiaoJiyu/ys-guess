import { handleApi } from '../../shared/api.js';
import { createStore } from '../../shared/store.js';

let blobPromise = null;

async function resolveBlob(context) {
  if (context.env?.__blob) return context.env.__blob;
  if (!blobPromise) {
    blobPromise = import('@edgeone/pages-blob')
      .then(({ getStore }) => getStore({ name: 'teyvat-store', consistency: 'strong' }))
      .catch((error) => {
        blobPromise = null;
        throw error;
      });
  }
  return blobPromise;
}

export default async function onRequest(context = {}) {
  const env = { ...(context.env || {}), __runtime: 'cloud' };
  if (!env.__store) {
    const blob = await resolveBlob(context);
    env.__store = createStore({ __blob: blob });
  }
  return handleApi({ ...context, env });
}
