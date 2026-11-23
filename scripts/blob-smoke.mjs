import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const modulePath = path.join(root, 'dist', 'cloud-functions', 'api', '[[default]].js');
const { default: onRequest } = await import(pathToFileURL(modulePath).href);

const objects = new Map();
const blob = {
  async get(key, options) {
    if (options?.consistency !== 'strong') throw new Error('Blob 读取未使用强一致模式');
    return objects.has(key) ? objects.get(key) : null;
  },
  async set(key, value) { objects.set(key, String(value)); },
  async delete(key) { objects.delete(key); },
};

const env = { __blob: blob, AUTH_SECRET: 'blob-smoke-secret' };

async function call(url, options = {}, overrideEnv = env) {
  const response = await onRequest({
    request: new Request(`https://example.com${url}`, options),
    env: overrideEnv,
  });
  return { response, data: await response.json() };
}

const health = await call('/api/health');
if (!health.data.ok || health.data.runtime !== 'cloud' || health.data.characters !== 123) {
  throw new Error(`云函数冒烟测试失败：${JSON.stringify(health.data)}`);
}

const noSecretEnv = { __blob: blob };
const healthWithoutSecret = await call('/api/health', {}, noSecretEnv);
if (!healthWithoutSecret.response.ok) throw new Error('缺少 AUTH_SECRET 时健康检查不应失败');
const registerWithoutSecret = await call('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ username: 'nosecret', password: 'test123456', nickname: '无密钥' }),
}, noSecretEnv);
if (registerWithoutSecret.response.status !== 500) throw new Error('缺少 AUTH_SECRET 时注册应返回配置错误');

const suffix = Date.now().toString(36);
const registered = await call('/api/auth/register', {
  method: 'POST',
  body: JSON.stringify({ username: `blob_${suffix}`, password: 'test123456', nickname: 'Blob测试' }),
});
if (!registered.response.ok || !registered.data.ok) {
  throw new Error(`Blob 写入测试失败：${JSON.stringify(registered.data)}`);
}

const loggedIn = await call('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ username: `blob_${suffix}`, password: 'test123456' }),
});
if (!loggedIn.data.ok) throw new Error('Blob 读取测试失败');

const hasNamespacedKey = [...objects.keys()].some((key) => key.startsWith('teyvat/'));
if (!hasNamespacedKey) throw new Error('未使用 teyvat/ Blob 命名空间');

console.log('BLOB_SMOKE_OK');
