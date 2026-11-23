import fs from 'node:fs';
import path from 'node:path';
import { credentialsFromEnv, credentialStatus } from '../shared/tencent.js';

function readEnvFile() {
  const candidates = [
    path.resolve(process.cwd(), 'tencent_api.env'),
    path.resolve(process.cwd(), 'dist', 'tencent_api.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const values = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
    return values;
  }
  return {};
}

export default async function onRequest(context = {}) {
  const fromFile = readEnvFile();
  const fromRuntime = credentialsFromEnv(context.env || {});
  const credentials = {
    secretId: fromRuntime.secretId || fromFile.SecretId || '',
    secretKey: fromRuntime.secretKey || fromFile.SecretKey || '',
  };
  const source = fromRuntime.secretId && fromRuntime.secretKey
    ? 'runtime-env'
    : (credentials.secretId && credentials.secretKey ? 'tencent_api.env' : 'unconfigured');
  const status = credentialStatus({ ...credentials, __credentialSource: source });
  return new Response(JSON.stringify({ ok: true, cloudFunction: true, ...status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
