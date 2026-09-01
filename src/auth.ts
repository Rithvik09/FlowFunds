// Password hashing and JWT issuance/verification for the Workers runtime — deliberately
// built on Web Crypto (available natively in Workers) rather than a Node-only library like
// bcrypt, which doesn't run in the Workers runtime without extra bundling workarounds.

const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, saltBytes);
  return { hash: toHex(hash), salt: toHex(saltBytes.buffer as ArrayBuffer) };
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const saltBytes = fromHex(salt);
  const derived = await derive(password, saltBytes);
  return toHex(derived) === hash;
}

async function derive(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS,
  );
}

// --- JWT (HMAC-SHA256), signed/verified with the JWT_SECRET Worker secret ---

export interface JwtPayload {
  sub: string; // user id
  email: string;
  exp: number; // unix seconds
}

function base64UrlEncode(data: ArrayBuffer | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

async function hmacSha256(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
}

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSha256(secret, `${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${base64UrlEncode(signature)}`;
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  const expectedSignature = base64UrlEncode(await hmacSha256(secret, `${encodedHeader}.${encodedPayload}`));
  if (expectedSignature !== encodedSignature) return null;

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
  if (payload.exp * 1000 < Date.now()) return null; // expired

  return payload;
}
