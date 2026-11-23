import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (!matches.length) throw new Error('未找到内联脚本');
const temp = path.join(root, 'data', 'inline-check.js');
fs.mkdirSync(path.dirname(temp), { recursive: true });
fs.writeFileSync(temp, matches[0][1], 'utf8');
try {
  execFileSync(process.execPath, ['--check', temp], { stdio: 'inherit' });
  console.log('INLINE_JS_OK');
} finally {
  fs.rmSync(temp, { force: true });
}
