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

// Compares two equal-length hex digests without short-circuiting on the first
// differing character. Length is not secret here (both are fixed-width SHA-256
// digests), so returning early on a length mismatch leaks nothing.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const saltBytes = fromHex(salt);
  const derived = await derive(password, saltBytes);
  return timingSafeEqualHex(toHex(derived), hash);
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

function base64UrlDecodeToBytes(value: string): Uint8Array {
  const binary = base64UrlDecode(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// crypto.subtle.verify does the signature comparison internally in constant time,
// which is why this is preferred over recomputing the HMAC and comparing strings.
async function hmacVerify(secret: string, message: string, signature: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'verify',
  ]);
  return crypto.subtle.verify('HMAC', key, signature as BufferSource, new TextEncoder().encode(message));
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

  let payload: JwtPayload;
  try {
    const valid = await hmacVerify(secret, `${encodedHeader}.${encodedPayload}`, base64UrlDecodeToBytes(encodedSignature));
    if (!valid) return null;
    payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload;
  } catch {
    return null; // malformed base64 or JSON — fail closed rather than throwing
  }

  // `exp` is typed `number`, but the decode path receives whatever was signed.
  // Without this check a payload lacking `exp` gives NaN, and `NaN < Date.now()`
  // is false — which would read as "not expired" and never expire.
  if (typeof payload?.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
  if (payload.exp * 1000 < Date.now()) return null; // expired

  return payload;
}
