// Client-side encryption for vault secrets (passwords). The master password is
// stretched with PBKDF2-SHA256 into an AES-GCM key that lives only in memory for
// the session. The database only ever stores ciphertext + a random salt + a
// "verifier" (a known string encrypted with the key) used to confirm the master
// password on unlock. Forgetting the master password means the secrets are
// unrecoverable by design.

const PBKDF2_ITERATIONS = 210_000;
const VERIFIER_PLAINTEXT = "vault-verifier-v1";

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

// Returns an ArrayBuffer (not a view) so it satisfies BufferSource on the strict
// lib.dom Web Crypto overloads without SharedArrayBuffer ambiguity.
function fromB64(s: string): ArrayBuffer {
  const bin = atob(s);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return buf;
}

export function randomSaltB64(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(masterPassword: string, saltB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(masterPassword),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

// Encrypt a UTF-8 string → "ivB64:cipherB64".
export async function encryptString(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plaintext));
  return `${toB64(iv)}:${toB64(cipher)}`;
}

export async function decryptString(key: CryptoKey, blob: string): Promise<string> {
  const [ivB64, cipherB64] = blob.split(":");
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivB64) },
    key,
    fromB64(cipherB64),
  );
  return dec.decode(plain);
}

// First-time setup: produce {salt, verifier} to persist server-side.
export async function makeVerifier(masterPassword: string): Promise<{ salt: string; verifier: string }> {
  const salt = randomSaltB64();
  const key = await deriveKey(masterPassword, salt);
  const verifier = await encryptString(key, VERIFIER_PLAINTEXT);
  return { salt, verifier };
}

// Unlock attempt: derive the key and confirm it decrypts the verifier. Returns
// the key on success, or null if the master password is wrong.
export async function unlock(
  masterPassword: string,
  salt: string,
  verifier: string,
): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(masterPassword, salt);
    const check = await decryptString(key, verifier);
    return check === VERIFIER_PLAINTEXT ? key : null;
  } catch {
    return null;
  }
}

// Secrets are stored as an encrypted JSON object so a single ciphertext can hold
// username, password, and notes together.
export type SecretFields = { username?: string; password?: string; notes?: string };

export async function encryptSecret(key: CryptoKey, fields: SecretFields): Promise<string> {
  return encryptString(key, JSON.stringify(fields));
}

export async function decryptSecret(key: CryptoKey, blob: string): Promise<SecretFields> {
  return JSON.parse(await decryptString(key, blob)) as SecretFields;
}
