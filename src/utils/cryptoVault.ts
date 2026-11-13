/**
 * AES-256-GCM Encrypted Credential Vault (`_tavernsmith_vault_enc`)
 * Uses pure browser Web Crypto API (`window.crypto.subtle`) with:
 * - PBKDF2 key derivation (SHA-256, 100,000 iterations)
 * - 16-byte random salt (`Uint8Array(16)`)
 * - 12-byte random IV (`Uint8Array(12)`)
 * - AES-GCM 256-bit authenticated encryption
 *
 * Supports both automatic device-key encryption and an optional user-defined
 * Vault Passphrase / PIN to lock/unlock the API key vault.
 */

export const ENCRYPTED_VAULT_STORAGE_KEY = '_tavernsmith_vault_enc';
export const DEVICE_SEED_STORAGE_KEY = '_tavernsmith_vault_device_seed';
export const PROVIDER_MODELS_STORAGE_KEY = '_tavernsmith_provider_models_v1';
export const LEGACY_PLAINTEXT_CREDENTIALS_KEY =
  'tavernsmith_provider_credentials_v1';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;

export interface EncryptedVaultEnvelope {
  version: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  hasCustomPassphrase: boolean;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  updatedAt: string;
}

export interface VaultStatusInfo {
  isEncrypted: boolean;
  hasCustomPassphrase: boolean;
  isLocked: boolean;
  keyCount: number;
  updatedAt: string | null;
}

// In-memory session state (never persisted to disk/localStorage)
let inMemoryPassphrase: string | null = null;
let inMemoryDecryptedKeys: Record<string, string> = {};
let vaultLockedState = false;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function safeStorageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or restricted origin errors
  }
}

function safeStorageRemove(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch {
    // Ignore restricted origin errors
  }
}

/**
 * Generates or retrieves the per-device 256-bit random seed used when no custom
 * user passphrase/PIN is active.
 */
function getOrCreateDeviceSecret(): string {
  const existing = safeStorageGet(DEVICE_SEED_STORAGE_KEY);
  if (existing && existing.length >= 24) {
    return existing;
  }
  const randomBytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const generated = bytesToBase64(randomBytes);
  safeStorageSet(DEVICE_SEED_STORAGE_KEY, generated);
  return generated;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from secret material + 16-byte salt using
 * PBKDF2 with SHA-256 and 100,000 iterations.
 */
async function deriveAesGcmKey(
  secretMaterial: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(secretMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function getEffectiveSecret(customPassphrase?: string | null): {
  secret: string;
  hasCustomPassphrase: boolean;
} {
  const cleanCustom = (customPassphrase ?? inMemoryPassphrase ?? '').trim();
  if (cleanCustom.length > 0) {
    return {
      secret: `tavernsmith-pin-v1:${cleanCustom}`,
      hasCustomPassphrase: true,
    };
  }
  return {
    secret: `tavernsmith-device-v1:${getOrCreateDeviceSecret()}`,
    hasCustomPassphrase: false,
  };
}

/**
 * Reads the raw encrypted envelope from `_tavernsmith_vault_enc` in localStorage.
 */
export function readEncryptedVaultEnvelope(): EncryptedVaultEnvelope | null {
  try {
    const raw = safeStorageGet(ENCRYPTED_VAULT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EncryptedVaultEnvelope>;
    if (
      parsed &&
      parsed.alg === 'AES-256-GCM' &&
      typeof parsed.saltBase64 === 'string' &&
      typeof parsed.ivBase64 === 'string' &&
      typeof parsed.ciphertextBase64 === 'string'
    ) {
      return {
        version: 1,
        alg: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: parsed.iterations || PBKDF2_ITERATIONS,
        hasCustomPassphrase: Boolean(parsed.hasCustomPassphrase),
        saltBase64: parsed.saltBase64,
        ivBase64: parsed.ivBase64,
        ciphertextBase64: parsed.ciphertextBase64,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore malformed envelope
  }
  return null;
}

/**
 * Encrypts the `savedProviderKeys` map using AES-256-GCM (PBKDF2 100,000 iterations,
 * random 16-byte salt, random 12-byte IV) and stores ONLY ciphertext in `_tavernsmith_vault_enc`.
 */
export async function encryptAndSaveProviderKeys(
  keysMap: Record<string, string>,
  customPassphrase?: string | null
): Promise<EncryptedVaultEnvelope | null> {
  // Sanitize map: keep only non-empty trimmed strings
  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(keysMap || {})) {
    if (typeof v === 'string' && v.trim()) {
      sanitized[k] = v.trim();
    }
  }

  inMemoryDecryptedKeys = { ...sanitized };
  if (customPassphrase !== undefined) {
    inMemoryPassphrase =
      customPassphrase && customPassphrase.trim()
        ? customPassphrase.trim()
        : null;
  }

  // Always purge any legacy plaintext key storage
  safeStorageRemove(LEGACY_PLAINTEXT_CREDENTIALS_KEY);

  if (
    typeof window === 'undefined' ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    return null;
  }

  try {
    const existingEnvelope = readEncryptedVaultEnvelope();
    // If vault is currently locked with a custom passphrase and we don't have the passphrase in memory,
    // do not overwrite the custom-passphrase vault with an empty map.
    if (
      existingEnvelope?.hasCustomPassphrase &&
      vaultLockedState &&
      !inMemoryPassphrase &&
      customPassphrase === undefined
    ) {
      return existingEnvelope;
    }

    const { secret, hasCustomPassphrase } =
      getEffectiveSecret(customPassphrase);
    const salt = window.crypto.getRandomValues(
      new Uint8Array(SALT_BYTE_LENGTH)
    );
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
    const key = await deriveAesGcmKey(secret, salt);

    const enc = new TextEncoder();
    const plaintextBytes = enc.encode(JSON.stringify(sanitized));
    const cipherBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      plaintextBytes
    );

    const envelope: EncryptedVaultEnvelope = {
      version: 1,
      alg: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      hasCustomPassphrase,
      saltBase64: bytesToBase64(salt),
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
      updatedAt: new Date().toISOString(),
    };

    safeStorageSet(ENCRYPTED_VAULT_STORAGE_KEY, JSON.stringify(envelope));
    vaultLockedState = false;
    return envelope;
  } catch {
    return null;
  }
}

/**
 * Decrypts `_tavernsmith_vault_enc` in memory using AES-256-GCM + PBKDF2 (100,000 iterations).
 */
export async function decryptProviderKeysFromVault(
  passphraseAttempt?: string | null
): Promise<{
  ok: boolean;
  locked: boolean;
  keys: Record<string, string>;
  error?: string;
}> {
  const envelope = readEncryptedVaultEnvelope();

  // Check for one-time migration from legacy plaintext storage if no encrypted envelope exists yet
  if (!envelope) {
    const migratedKeys = consumeAndMigrateLegacyPlaintextKeys();
    if (Object.keys(migratedKeys).length > 0) {
      await encryptAndSaveProviderKeys(migratedKeys);
    }
    vaultLockedState = false;
    return {
      ok: true,
      locked: false,
      keys: { ...inMemoryDecryptedKeys },
    };
  }

  // Always remove any leftover legacy plaintext keys
  safeStorageRemove(LEGACY_PLAINTEXT_CREDENTIALS_KEY);

  if (
    typeof window === 'undefined' ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    return {
      ok: false,
      locked: false,
      keys: { ...inMemoryDecryptedKeys },
      error: 'Web Crypto API (window.crypto.subtle) is not available.',
    };
  }

  const candidatePassphrase = (
    passphraseAttempt ??
    inMemoryPassphrase ??
    ''
  ).trim();

  if (envelope.hasCustomPassphrase && !candidatePassphrase) {
    vaultLockedState = true;
    return {
      ok: false,
      locked: true,
      keys: {},
      error:
        'Vault is protected with a custom Passphrase / PIN. Unlock it in Options -> AI Connections.',
    };
  }

  try {
    const secret = envelope.hasCustomPassphrase
      ? `tavernsmith-pin-v1:${candidatePassphrase}`
      : `tavernsmith-device-v1:${getOrCreateDeviceSecret()}`;

    const salt = base64ToBytes(envelope.saltBase64);
    const iv = base64ToBytes(envelope.ivBase64);
    const ciphertext = base64ToBytes(envelope.ciphertextBase64);

    const key = await deriveAesGcmKey(secret, salt);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    const dec = new TextDecoder();
    const jsonStr = dec.decode(decryptedBuffer);
    const parsed = JSON.parse(jsonStr);
    const cleanKeys: Record<string, string> = {};

    if (parsed && typeof parsed === 'object') {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) {
          cleanKeys[k] = v.trim();
        }
      }
    }

    inMemoryDecryptedKeys = cleanKeys;
    if (envelope.hasCustomPassphrase && candidatePassphrase) {
      inMemoryPassphrase = candidatePassphrase;
    }
    vaultLockedState = false;

    return {
      ok: true,
      locked: false,
      keys: { ...cleanKeys },
    };
  } catch {
    if (envelope.hasCustomPassphrase) {
      vaultLockedState = true;
      return {
        ok: false,
        locked: true,
        keys: {},
        error: 'Incorrect Vault Passphrase / PIN. Could not decrypt AES-256-GCM vault.',
      };
    }
    return {
      ok: false,
      locked: false,
      keys: {},
      error: 'Could not decrypt device key vault.',
    };
  }
}

/**
 * Synchronously returns the currently decrypted in-memory keys map.
 */
export function getInMemoryDecryptedKeys(): Record<string, string> {
  return { ...inMemoryDecryptedKeys };
}

/**
 * Decrypts or retrieves a specific provider's API key on demand when making an AI request
 * or when the user clicks the Eye icon in Options.
 */
export async function getDecryptedKeyForProvider(
  providerId: string,
  presetId?: string
): Promise<string> {
  if (
    inMemoryDecryptedKeys[providerId] ||
    (presetId && inMemoryDecryptedKeys[presetId])
  ) {
    return (
      inMemoryDecryptedKeys[providerId] ||
      (presetId ? inMemoryDecryptedKeys[presetId] : '') ||
      ''
    );
  }

  const res = await decryptProviderKeysFromVault();
  if (res.ok) {
    return (
      res.keys[providerId] || (presetId ? res.keys[presetId] : '') || ''
    );
  }
  return '';
}

/**
 * Sets or removes a custom Vault Passphrase / PIN and re-encrypts `_tavernsmith_vault_enc`.
 */
export async function updateVaultPassphrase(
  newPassphrase: string | null
): Promise<{ ok: boolean; message: string }> {
  const clean = (newPassphrase || '').trim();
  inMemoryPassphrase = clean.length > 0 ? clean : null;
  const envelope = await encryptAndSaveProviderKeys(
    inMemoryDecryptedKeys,
    inMemoryPassphrase
  );
  if (!envelope) {
    return {
      ok: false,
      message: 'Failed to encrypt vault with Web Crypto API.',
    };
  }
  return {
    ok: true,
    message: clean
      ? 'AES-256-GCM Vault locked with your custom Passphrase / PIN (PBKDF2 100,000 iterations).'
      : 'Custom Passphrase removed; vault is now encrypted with automatic AES-256-GCM device key.',
  };
}

/**
 * Locks the in-memory vault session if a custom passphrase is enabled.
 */
export function lockVaultSessionInMemory(): void {
  const env = readEncryptedVaultEnvelope();
  if (env?.hasCustomPassphrase) {
    inMemoryPassphrase = null;
    inMemoryDecryptedKeys = {};
    vaultLockedState = true;
  }
}

export function getVaultStatusInfo(): VaultStatusInfo {
  const env = readEncryptedVaultEnvelope();
  return {
    isEncrypted: Boolean(env),
    hasCustomPassphrase: Boolean(env?.hasCustomPassphrase),
    isLocked: Boolean(env?.hasCustomPassphrase && vaultLockedState),
    keyCount: Object.keys(inMemoryDecryptedKeys).filter((k) =>
      Boolean(inMemoryDecryptedKeys[k])
    ).length,
    updatedAt: env?.updatedAt || null,
  };
}

/**
 * Persists non-secret `savedProviderModels` separately and migrates any legacy plaintext keys once.
 */
export function saveProviderModelsMap(modelsMap: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(modelsMap || {})) {
    if (typeof v === 'string' && v.trim()) {
      clean[k] = v.trim();
    }
  }
  safeStorageSet(PROVIDER_MODELS_STORAGE_KEY, JSON.stringify(clean));
}

export function loadProviderModelsMap(): Record<string, string> {
  try {
    const raw = safeStorageGet(PROVIDER_MODELS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...parsed };
      }
    }
  } catch {
    // Ignore parse error
  }
  return {};
}

function consumeAndMigrateLegacyPlaintextKeys(): Record<string, string> {
  const migrated: Record<string, string> = {};
  try {
    const raw = safeStorageGet(LEGACY_PLAINTEXT_CREDENTIALS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.savedProviderKeys === 'object') {
        for (const [k, v] of Object.entries(parsed.savedProviderKeys)) {
          if (typeof v === 'string' && v.trim()) {
            migrated[k] = v.trim();
          }
        }
      }
      if (parsed && typeof parsed.savedProviderModels === 'object') {
        saveProviderModelsMap(parsed.savedProviderModels);
      }
      safeStorageRemove(LEGACY_PLAINTEXT_CREDENTIALS_KEY);
    }
  } catch {
    safeStorageRemove(LEGACY_PLAINTEXT_CREDENTIALS_KEY);
  }
  inMemoryDecryptedKeys = { ...inMemoryDecryptedKeys, ...migrated };
  return migrated;
}
