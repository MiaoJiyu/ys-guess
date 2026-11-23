import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = 8803;
const base = `http://127.0.0.1:${port}`;
const testData = path.join(root, 'data', 'feedback-smoke');
fs.rmSync(testData, { recursive: true, force: true });
const child = spawn(process.execPath, ['server.js', String(port)], {
  cwd: root, stdio: 'ignore', env: { ...process.env, TEYVAT_DATA_DIR: testData },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function raw(url, options = {}) {
  const response = await fetch(base + url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function request(url, options = {}) {
  const { response, data } = await raw(url, options);
  if (!response.ok || data.ok === false) throw new Error(`${url}: ${data.error || response.status}`);
  return data;
}

function auth(token) {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Session-Id': `fb-${Math.random().toString(36).slice(2)}` };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  for (let i = 0; i < 50; i += 1) {
    try { if ((await raw('/api/health')).response.ok) break; } catch {}
    await sleep(200);
  }
  const suffix = Date.now().toString(36);
  const admin = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `fbadmin_${suffix}`, password: 'test123456', nickname: '反馈管理员' }),
  });
  const user = await request('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: `fbuser_${suffix}`, password: 'test123456', nickname: '反馈用户' }),
  });

  const anonymous = await raw('/api/feedback', {
    method: 'POST', body: JSON.stringify({ description: '未登录用户提交反馈' }),
  });
  assert(anonymous.response.status === 401, '未登录不应提交反馈');

  const submitted = await request('/api/feedback', {
    method: 'POST', headers: auth(user.token),
    body: JSON.stringify({
      type: 'bug', title: '大厅刷新按钮无响应',
      description: '在公网大厅点击刷新后列表没有更新，希望修复。',
      roomCode: '123456', contact: 'test@example.com',
      context: { url: 'https://example.com/', userAgent: 'test-browser', viewport: '1280×720', language: 'zh-CN', localTime: '2026-11-23 12:00:00' },
    }),
  });
  assert(submitted.ok && submitted.feedback.status === 'pending', '反馈提交后应为待处理');
  assert(/成功/.test(submitted.message), '反馈提交缺少成功提示文案');
  assert(submitted.feedback.context.viewport === '1280×720', '反馈上下文未保存');

  const mine = await request('/api/feedback/mine', { headers: auth(user.token) });
  assert(mine.list.length === 1 && mine.list[0].id === submitted.feedback.id, '用户无法查看自己的反馈');

  const denied = await raw('/api/admin/feedback', { headers: auth(user.token) });
  assert(denied.response.status === 403, '普通用户不应访问管理员反馈列表');

  const all = await request('/api/admin/feedback', { headers: auth(admin.token) });
  assert(all.counts.all === 1 && all.counts.pending === 1, '管理员反馈统计异常');
  const pending = await request('/api/admin/feedback?status=pending', { headers: auth(admin.token) });
  const resolvedBefore = await request('/api/admin/feedback?status=resolved', { headers: auth(admin.token) });
  assert(pending.list.length === 1 && resolvedBefore.list.length === 0, '状态筛选异常');

  const processing = await request('/api/admin/feedback', {
    method: 'POST', headers: auth(admin.token),
    body: JSON.stringify({ id: submitted.feedback.id, status: 'processing', reply: '已定位问题，正在修复。' }),
  });
  assert(processing.feedback.status === 'processing' && processing.feedback.reply, '管理员处理状态或回复未保存');
  const processingList = await request('/api/admin/feedback?status=processing', { headers: auth(admin.token) });
  assert(processingList.list.length === 1, '处理中筛选未生效');

  const resolved = await request('/api/admin/feedback', {
    method: 'POST', headers: auth(admin.token),
    body: JSON.stringify({ id: submitted.feedback.id, status: 'resolved', reply: '已修复，请刷新后重试。' }),
  });
  assert(resolved.feedback.handledByName === '反馈管理员', '处理人记录缺失');
  const resolvedList = await request('/api/admin/feedback?status=resolved', { headers: auth(admin.token) });
  assert(resolvedList.counts.resolved === 1 && resolvedList.list.length === 1, '已解决筛选未生效');

  const myUpdated = await request('/api/feedback/mine', { headers: auth(user.token) });
  assert(myUpdated.list[0].status === 'resolved' && /已修复/.test(myUpdated.list[0].reply), '用户未看到最新处理状态与回复');

  const summary = await request('/api/admin/summary', { headers: auth(admin.token) });
  assert(summary.feedback.resolved === 1, '管理概览未统计反馈状态');

  console.log('FEEDBACK_TEST_OK');
} finally {
  child.kill('SIGTERM');
  fs.rmSync(testData, { recursive: true, force: true });
}
