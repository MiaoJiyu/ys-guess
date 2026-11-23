const encoder = new TextEncoder();

export function credentialsFromEnv(env = {}) {
  return {
    secretId: env.SecretId || env.TENCENT_SECRET_ID || '',
    secretKey: env.SecretKey || env.TENCENT_SECRET_KEY || '',
  };
}

export function credentialStatus(env = {}) {
  const credentials = credentialsFromEnv(env);
  return {
    configured: !!(credentials.secretId && credentials.secretKey),
    secretIdMasked: credentials.secretId ? `${credentials.secretId.slice(0, 4)}***` : '',
    source: env.__credentialSource || 'runtime-env',
  };
}

function sha256Hex(text) {
  return crypto.subtle.digest('SHA-256', encoder.encode(text)).then((buffer) =>
    [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join(''));
}

function hmac(key, message) {
  return crypto.subtle.importKey('raw', typeof key === 'string' ? encoder.encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    .then((imported) => crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function signDateKey(secretKey, date) {
  return hmac(`TC3${secretKey}`, date);
}

export async function tc3Headers({ credentials, service, host, region, action, payload = {}, version = '2020-01-01', endpoint = '' }) {
  if (!credentials.secretId || !credentials.secretKey) throw new Error('腾讯云密钥未配置');
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const timestamp = Math.floor(now.getTime() / 1000);
  const body = JSON.stringify(payload);
  const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST', '/', '', canonicalHeaders, signedHeaders, await sha256Hex(body),
  ].join('\n');
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    algorithm, String(timestamp), credentialScope, await sha256Hex(canonicalRequest),
  ].join('\n');
  const dateKey = await signDateKey(credentials.secretKey, date);
  const regionKey = await hmac(dateKey, region);
  const serviceKey = await hmac(regionKey, service);
  const signingKey = await hmac(serviceKey, 'tc3_request');
  const signature = hex(await hmac(signingKey, stringToSign));
  return {
    Authorization: `${algorithm} Credential=${credentials.secretId}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`,
    Host: host,
    'Content-Type': 'application/json',
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': region,
    ...(endpoint ? { 'X-TC-Endpoint': endpoint } : {}),
  };
}
