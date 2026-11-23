const encoder = new TextEncoder();

export function base64UrlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomId(size = 12) {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, size);
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes).slice(0, size);
}

export function randomDigits(length = 6) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i += 1) out += String(bytes[i] % 10);
  if (out[0] === '0') out = `1${out.slice(1)}`;
  return out;
}

async function derive(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations: 120000, hash: 'SHA-256' },
    key,
    256,
  );
  return base64UrlEncode(new Uint8Array(bits));
}

export async function hashPassword(password, salt = randomId(16)) {
  return { salt, hash: await derive(String(password), salt) };
}

export async function verifyPassword(password, salt, expected) {
  if (!salt || !expected) return false;
  const actual = await derive(String(password), salt);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(signature));
}

export async function signToken(user, secret) {
  const payload = {
    sub: user.id,
    name: user.nickname || user.username,
    username: user.username,
    role: user.role,
    ver: Number(user.passwordVersion || 0),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(secret, `v1.${body}`);
  return `v1.${body}.${signature}`;
}

export async function verifyToken(token, secret) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return null;
  const expected = await hmac(secret, `${parts[0]}.${parts[1]}`);
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
    if (!payload.sub || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
