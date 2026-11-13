/**
 * AES-256-GCM Encrypted Credential Vault (`./Saves/_tavernsmith_vault.enc`)
 * Uses pure browser Web Crypto API (`window.crypto.subtle`) with:
 * - PBKDF2 key derivation (SHA-256, 100,000 iterations)
 * - 16-byte random salt (`Uint8Array(16)`)
 * - 12-byte random IV (`Uint8Array(12)`)
 * - AES-GCM 256-bit authenticated encryption
 *
 * Strictly zero browser localStorage/IndexedDB usage: the encrypted vault envelope
 * is stored exclusively on disk inside `./Saves/_tavernsmith_vault.enc`.
 */

export const VAULT_FILENAME = '_tavernsmith_vault.enc';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;
const DEFAULT_DISK_VAULT_SECRET =
  'tavernsmith-disk-vault-v2-aes-256-gcm-key-derivation';

export interface EncryptedVaultEnvelope {
  version: 1;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  hasCustomPassphrase: boolean;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  deviceSecretBase64?: string;
  updatedAt: string;
}

export interface VaultStatusInfo {
  isEncrypted: boolean;
  hasCustomPassphrase: boolean;
  isLocked: boolean;
  keyCount: number;
  updatedAt: string | null;
}

// Pure in-memory session state (persisted to disk `./Saves/_tavernsmith_vault.enc` via `/api/disk/save`)
let inMemoryVaultEnvelope: EncryptedVaultEnvelope | null = null;
let inMemoryPassphrase: string | null = null;
let inMemoryDecryptedKeys: Record<string, string> = {};
let inMemoryProviderModels: Record<string, string> = {};
let vaultLockedState = false;
let onVaultDiskFlushCallback:
  | ((envelope: EncryptedVaultEnvelope) => void)
  | null = null;

export function registerVaultDiskFlushCallback(
  cb: ((envelope: EncryptedVaultEnvelope) => void) | null
): void {
  onVaultDiskFlushCallback = cb;
}

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

function generateRandomDeviceSecretBase64(): string {
  const randomBytes = new Uint8Array(32);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < randomBytes.length; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  return bytesToBase64(randomBytes);
}

function getEffectiveSecret(
  customPassphrase?: string | null,
  existingDeviceSecret?: string
): {
  secret: string;
  hasCustomPassphrase: boolean;
  deviceSecretBase64?: string;
} {
  const cleanCustom = (customPassphrase ?? inMemoryPassphrase ?? '').trim();
  if (cleanCustom.length > 0) {
    return {
      secret: `tavernsmith-pin-v1:${cleanCustom}`,
      hasCustomPassphrase: true,
    };
  }
  const devSecret = existingDeviceSecret || generateRandomDeviceSecretBase64();
  return {
    secret: `tavernsmith-device-v1:${devSecret}:${DEFAULT_DISK_VAULT_SECRET}`,
    hasCustomPassphrase: false,
    deviceSecretBase64: devSecret,
  };
}

export function normalizeVaultEnvelope(
  raw: unknown
): EncryptedVaultEnvelope | null {
  if (!raw) return null;
  try {
    const parsed = (
      typeof raw === 'string' ? JSON.parse(raw) : raw
    ) as Partial<EncryptedVaultEnvelope>;
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
        deviceSecretBase64:
          typeof parsed.deviceSecretBase64 === 'string'
            ? parsed.deviceSecretBase64
            : undefined,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch {
    // Ignore malformed envelope
  }
  return null;
}

/**
 * Sets the in-memory encrypted envelope loaded from `./Saves/_tavernsmith_vault.enc` on disk.
 */
export function setInMemoryVaultEnvelope(raw: unknown): EncryptedVaultEnvelope | null {
  const normalized = normalizeVaultEnvelope(raw);
  if (normalized) {
    inMemoryVaultEnvelope = normalized;
  }
  return inMemoryVaultEnvelope;
}

/**
 * Returns the current encrypted envelope for writing to `./Saves/_tavernsmith_vault.enc`.
 */
export function readEncryptedVaultEnvelope(): EncryptedVaultEnvelope | null {
  return inMemoryVaultEnvelope;
}

/**
 * Encrypts the `savedProviderKeys` map using AES-256-GCM (PBKDF2 100,000 iterations,
 * random 16-byte salt, random 12-byte IV) and flushes the encrypted envelope to `./Saves/_tavernsmith_vault.enc`.
 */
export async function encryptAndSaveProviderKeys(
  keysMap: Record<string, string>,
  customPassphrase?: string | null,
  skipDiskFlush = false
): Promise<EncryptedVaultEnvelope | null> {
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

  if (
    typeof window === 'undefined' ||
    !window.crypto ||
    !window.crypto.subtle
  ) {
    return null;
  }

  try {
    const existingEnvelope = inMemoryVaultEnvelope;
    if (
      existingEnvelope?.hasCustomPassphrase &&
      vaultLockedState &&
      !inMemoryPassphrase &&
      customPassphrase === undefined
    ) {
      return existingEnvelope;
    }

    const { secret, hasCustomPassphrase, deviceSecretBase64 } =
      getEffectiveSecret(
        customPassphrase,
        existingEnvelope?.deviceSecretBase64
      );
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
      deviceSecretBase64: hasCustomPassphrase ? undefined : deviceSecretBase64,
      updatedAt: new Date().toISOString(),
    };

    inMemoryVaultEnvelope = envelope;
    vaultLockedState = false;

    if (!skipDiskFlush && onVaultDiskFlushCallback) {
      onVaultDiskFlushCallback(envelope);
    }

    return envelope;
  } catch {
    return null;
  }
}

/**
 * Decrypts `./Saves/_tavernsmith_vault.enc` in memory using AES-256-GCM + PBKDF2 (100,000 iterations).
 */
export async function decryptProviderKeysFromVault(
  passphraseAttempt?: string | null,
  envelopeOverride?: unknown
): Promise<{
  ok: boolean;
  locked: boolean;
  keys: Record<string, string>;
  error?: string;
}> {
  if (envelopeOverride !== undefined) {
    setInMemoryVaultEnvelope(envelopeOverride);
  }
  const envelope = inMemoryVaultEnvelope;

  if (!envelope) {
    vaultLockedState = false;
    return {
      ok: true,
      locked: false,
      keys: { ...inMemoryDecryptedKeys },
    };
  }

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
        'Vault is protected with a custom Passphrase / PIN. Unlock it in Options -> AI Connection.',
    };
  }

  try {
    const secret = envelope.hasCustomPassphrase
      ? `tavernsmith-pin-v1:${candidatePassphrase}`
      : envelope.deviceSecretBase64
        ? `tavernsmith-device-v1:${envelope.deviceSecretBase64}:${DEFAULT_DISK_VAULT_SECRET}`
        : `tavernsmith-device-v1:${DEFAULT_DISK_VAULT_SECRET}`;

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
        error:
          'Incorrect Vault Passphrase / PIN. Could not decrypt AES-256-GCM vault.',
      };
    }
    return {
      ok: false,
      locked: false,
      keys: {},
      error: 'Could not decrypt disk key vault.',
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
 * Sets or removes a custom Vault Passphrase / PIN and re-encrypts `./Saves/_tavernsmith_vault.enc`.
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
      ? 'AES-256-GCM Vault locked with your custom Passphrase / PIN and saved to ./Saves/_tavernsmith_vault.enc.'
      : 'Custom Passphrase removed; vault is now encrypted with automatic AES-256-GCM key in ./Saves/_tavernsmith_vault.enc.',
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
 * Stores non-secret `savedProviderModels` in memory (persisted via `_tavernsmith_meta.json`).
 */
export function saveProviderModelsMap(modelsMap: Record<string, string>): void {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(modelsMap || {})) {
    if (typeof v === 'string' && v.trim()) {
      clean[k] = v.trim();
    }
  }
  inMemoryProviderModels = clean;
}

export function loadProviderModelsMap(): Record<string, string> {
  return { ...inMemoryProviderModels };
}
