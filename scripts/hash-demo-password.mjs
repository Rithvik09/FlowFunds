// Generates a PBKDF2 hash/salt pair using the exact same algorithm as src/auth.ts,
// for seeding the demo user in migrations/0002_seed_demo_user.sql. Run with:
//   node scripts/hash-demo-password.mjs <password>
const password = process.argv[2];
if (!password) {
  console.error('Usage: node scripts/hash-demo-password.mjs <password>');
  process.exit(1);
}

const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const saltBytes = crypto.getRandomValues(new Uint8Array(16));
const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, [
  'deriveBits',
]);
const derived = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
  keyMaterial,
  HASH_BITS,
);

console.log('hash:', toHex(derived));
console.log('salt:', toHex(saltBytes.buffer));
