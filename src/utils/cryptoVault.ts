/**
 * AES-256-GCM Encrypted Credential Vault (`./.tavernsmith-app/credentials.vault.enc`)
 * Uses standard Web Crypto API (`crypto.subtle`) with:
 * - PBKDF2 key derivation (SHA-256, 100,000 iterations)
 * - 16-byte random salt (`Uint8Array(16)`)
 * - 12-byte random IV (`Uint8Array(12)`)
 * - AES-GCM 256-bit authenticated encryption
 *
 * Security model:
 * - Stored separately outside `./Saves/` inside `./.tavernsmith-app/credentials.vault.enc`.
 * - Encrypted automatically (no PIN required) using a separate app-private key file
 *   (`./.tavernsmith-app/vault.key`, mode `0600`) that is NEVER embedded inside the vault
 *   ciphertext envelope and NEVER included in `./Saves/` or backup exports.
 * - Transparently migrates legacy `./Saves/_tavernsmith_vault.enc` files into
 *   `./.tavernsmith-app/` on first load.
 */

import { fetchAppVaultState, saveAppVaultState } from './desktopBridge';

export const VAULT_FILENAME = 'credentials.vault.enc';
export const LEGACY_VAULT_FILENAME = '_tavernsmith_vault.enc';
export const APP_VAULT_STORAGE_PATH = './.tavernsmith-app/';

const PBKDF2_ITERATIONS = 100_000;
const MIN_PBKDF2_ITERATIONS = 10_000;
const MAX_PBKDF2_ITERATIONS = 1_000_000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12;
const LEGACY_DISK_VAULT_SECRET =
  'tavernsmith-disk-vault-v2-aes-256-gcm-key-derivation';

export interface EncryptedVaultEnvelope {
  version: 1 | 2;
  alg: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  hasCustomPassphrase: boolean;
  saltBase64: string;
  ivBase64: string;
  ciphertextBase64: string;
  /** Legacy v1 field only — never written in v2 app-vault envelopes */
  deviceSecretBase64?: string;
  updatedAt: string;
}

export interface VaultStatusInfo {
  isEncrypted: boolean;
  hasCustomPassphrase: boolean;
  isLocked: boolean;
  needsLegacyUnlock: boolean;
  storagePath: string;
  keyCount: number;
  updatedAt: string | null;
}

export interface AppVaultLoadResult {
  ok: boolean;
  locked: boolean;
  needsLegacyUnlock: boolean;
  migratedLegacy: boolean;
  storagePath: string;
  keys: Record<string, string>;
  error?: string;
}

// Pure in-memory session state (persisted to `./.tavernsmith-app/credentials.vault.enc` via `/api/vault`)
let inMemoryVaultEnvelope: EncryptedVaultEnvelope | null = null;
let inMemoryPendingLegacyVault: EncryptedVaultEnvelope | null = null;
let inMemoryAppVaultKey: string | null = null;
let inMemoryStoragePath = APP_VAULT_STORAGE_PATH;
let inMemoryPassphrase: string | null = null;
let inMemoryDecryptedKeys: Record<string, string> = {};
let inMemoryProviderModels: Record<string, string> = {};
let vaultLockedState = false;
let vaultWriteQueue: Promise<unknown> = Promise.resolve();
let onVaultDiskFlushCallback:
  | ((envelope: EncryptedVaultEnvelope) => void)
  | null = null;

function getWebCrypto(): Crypto | null {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto;
  }
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    return window.crypto;
  }
  return null;
}

export function registerVaultDiskFlushCallback(
  cb: ((envelope: EncryptedVaultEnvelope) => void) | null
): void {
  onVaultDiskFlushCallback = cb;
}

export function setAppVaultKey(
  appKeyBase64: string | null,
  storagePath?: string
): void {
  inMemoryAppVaultKey =
    appKeyBase64 && appKeyBase64.trim().length > 0
      ? appKeyBase64.trim()
      : null;
  if (storagePath && storagePath.trim()) {
    inMemoryStoragePath = storagePath.trim();
  }
}

export function getAppVaultKey(): string | null {
  return inMemoryAppVaultKey;
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

function clampIterations(iterations?: number): number {
  if (typeof iterations !== 'number' || !Number.isFinite(iterations)) {
    return PBKDF2_ITERATIONS;
  }
  return Math.min(
    MAX_PBKDF2_ITERATIONS,
    Math.max(MIN_PBKDF2_ITERATIONS, Math.floor(iterations))
  );
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from secret material + 16-byte salt using
 * PBKDF2 with SHA-256 and the envelope's iteration count.
 */
async function deriveAesGcmKey(
  secretMaterial: string,
  salt: Uint8Array,
  iterations = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const cryptoApi = getWebCrypto();
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available.');
  }
  const enc = new TextEncoder();
  const baseKey = await cryptoApi.subtle.importKey(
    'raw',
    enc.encode(secretMaterial),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: clampIterations(iterations),
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

function buildAppKeySecret(appKey: string): string {
  return `tavernsmith-app-vault-v2:${appKey}`;
}

function resolveDecryptSecret(
  envelope: EncryptedVaultEnvelope,
  passphraseAttempt?: string | null
): { ok: true; secret: string } | { ok: false; locked: boolean; error: string } {
  const candidatePassphrase = (
    passphraseAttempt ??
    inMemoryPassphrase ??
    ''
  ).trim();

  if (envelope.hasCustomPassphrase) {
    if (!candidatePassphrase) {
      return {
        ok: false,
        locked: true,
        error:
          'Legacy encrypted vault requires its old Passphrase / PIN once to migrate into the automatic app vault.',
      };
    }
    return {
      ok: true,
      secret: `tavernsmith-pin-v1:${candidatePassphrase}`,
    };
  }

  if (envelope.version === 2) {
    if (!inMemoryAppVaultKey) {
      return {
        ok: false,
        locked: false,
        error: 'App vault key is not loaded yet from the local server.',
      };
    }
    return {
      ok: true,
      secret: buildAppKeySecret(inMemoryAppVaultKey),
    };
  }

  // Legacy v1 automatic envelope (only used when migrating old `./Saves/_tavernsmith_vault.enc`)
  if (envelope.deviceSecretBase64) {
    return {
      ok: true,
      secret: `tavernsmith-device-v1:${envelope.deviceSecretBase64}:${LEGACY_DISK_VAULT_SECRET}`,
    };
  }
  if (inMemoryAppVaultKey) {
    return {
      ok: true,
      secret: buildAppKeySecret(inMemoryAppVaultKey),
    };
  }
  return {
    ok: true,
    secret: `tavernsmith-device-v1:${LEGACY_DISK_VAULT_SECRET}`,
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
      const version: 1 | 2 = parsed.version === 2 ? 2 : 1;
      return {
        version,
        alg: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        iterations: clampIterations(parsed.iterations),
        hasCustomPassphrase: Boolean(parsed.hasCustomPassphrase),
        saltBase64: parsed.saltBase64,
        ivBase64: parsed.ivBase64,
        ciphertextBase64: parsed.ciphertextBase64,
        deviceSecretBase64:
          version === 1 && typeof parsed.deviceSecretBase64 === 'string'
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

export function setInMemoryVaultEnvelope(
  raw: unknown
): EncryptedVaultEnvelope | null {
  const normalized = normalizeVaultEnvelope(raw);
  if (normalized) {
    inMemoryVaultEnvelope = normalized;
  }
  return inMemoryVaultEnvelope;
}

export function readEncryptedVaultEnvelope(): EncryptedVaultEnvelope | null {
  return inMemoryVaultEnvelope;
}

export async function persistVaultEnvelopeToServer(
  envelope: EncryptedVaultEnvelope,
  removeLegacy = false
): Promise<boolean> {
  try {
    const data = await saveAppVaultState({ vault: envelope, removeLegacy });
    if (data?.storagePath) {
      inMemoryStoragePath = data.storagePath;
    }
    return Boolean(data?.ok);
  } catch {
    return false;
  }
}

async function runVaultEncryptionNow(
  keysMap: Record<string, string>,
  customPassphrase?: string | null,
  skipDiskFlush = false,
  removeLegacy = false
): Promise<EncryptedVaultEnvelope | null> {
  const existingEnvelope = inMemoryVaultEnvelope;
  if (
    vaultLockedState &&
    customPassphrase === undefined &&
    !inMemoryPassphrase
  ) {
    // Never overwrite decrypted keys or ciphertext while a legacy vault is still locked
    return existingEnvelope;
  }

  const sanitized: Record<string, string> = {};
  for (const [k, v] of Object.entries(keysMap || {})) {
    if (typeof v === 'string' && v.trim()) {
      sanitized[k] = v.trim();
    }
  }

  inMemoryDecryptedKeys = { ...sanitized };

  const cryptoApi = getWebCrypto();
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    return null;
  }

  // Ensure we have the separate app-private key from Tauri IPC or `/api/vault`
  if (!inMemoryAppVaultKey) {
    try {
      const data = await fetchAppVaultState();
      if (data?.ok && typeof data.appKey === 'string' && data.appKey.trim()) {
        setAppVaultKey(data.appKey, data.storagePath);
      }
    } catch {
      // Offline / non-server environment
    }
  }

  const cleanCustom =
    customPassphrase !== undefined
      ? (customPassphrase || '').trim()
      : (inMemoryPassphrase || '').trim();

  let secret = '';
  let hasCustomPassphrase = false;

  if (cleanCustom.length > 0) {
    inMemoryPassphrase = cleanCustom;
    secret = `tavernsmith-pin-v1:${cleanCustom}`;
    hasCustomPassphrase = true;
  } else {
    inMemoryPassphrase = null;
    if (!inMemoryAppVaultKey) {
      return null;
    }
    secret = buildAppKeySecret(inMemoryAppVaultKey);
    hasCustomPassphrase = false;
  }

  try {
    const salt = cryptoApi.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
    const iv = cryptoApi.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));
    const key = await deriveAesGcmKey(secret, salt, PBKDF2_ITERATIONS);

    const enc = new TextEncoder();
    const plaintextBytes = enc.encode(JSON.stringify(sanitized));
    const cipherBuffer = await cryptoApi.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      plaintextBytes
    );

    const envelope: EncryptedVaultEnvelope = {
      version: 2,
      alg: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256',
      iterations: PBKDF2_ITERATIONS,
      hasCustomPassphrase,
      saltBase64: bytesToBase64(salt),
      ivBase64: bytesToBase64(iv),
      ciphertextBase64: bytesToBase64(new Uint8Array(cipherBuffer)),
      updatedAt: new Date().toISOString(),
    };

    inMemoryVaultEnvelope = envelope;
    inMemoryPendingLegacyVault = null;
    vaultLockedState = false;

    if (!skipDiskFlush) {
      await persistVaultEnvelopeToServer(envelope, removeLegacy);
      if (onVaultDiskFlushCallback) {
        onVaultDiskFlushCallback(envelope);
      }
    }

    return envelope;
  } catch {
    return null;
  }
}

/**
 * Serialized AES-256-GCM encryption & persistence of `savedProviderKeys`
 * into `./.tavernsmith-app/credentials.vault.enc` (outside `./Saves/`).
 */
export function encryptAndSaveProviderKeys(
  keysMap: Record<string, string>,
  customPassphrase?: string | null,
  skipDiskFlush = false
): Promise<EncryptedVaultEnvelope | null> {
  const snapshot = { ...(keysMap || {}) };
  const next = vaultWriteQueue.then(
    () => runVaultEncryptionNow(snapshot, customPassphrase, skipDiskFlush, false),
    () => runVaultEncryptionNow(snapshot, customPassphrase, skipDiskFlush, false)
  );
  vaultWriteQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Decrypts an encrypted vault envelope using Web Crypto AES-256-GCM + PBKDF2.
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
  const envelope = inMemoryVaultEnvelope || inMemoryPendingLegacyVault;

  if (!envelope) {
    vaultLockedState = false;
    return {
      ok: true,
      locked: false,
      keys: { ...inMemoryDecryptedKeys },
    };
  }

  const cryptoApi = getWebCrypto();
  if (!cryptoApi?.subtle) {
    return {
      ok: false,
      locked: false,
      keys: { ...inMemoryDecryptedKeys },
      error: 'Web Crypto API (crypto.subtle) is not available.',
    };
  }

  const resolvedSecret = resolveDecryptSecret(envelope, passphraseAttempt);
  if (!resolvedSecret.ok) {
    if (resolvedSecret.locked) {
      vaultLockedState = true;
    }
    return {
      ok: false,
      locked: resolvedSecret.locked,
      keys: {},
      error: resolvedSecret.error,
    };
  }

  try {
    const salt = base64ToBytes(envelope.saltBase64);
    const iv = base64ToBytes(envelope.ivBase64);
    const ciphertext = base64ToBytes(envelope.ciphertextBase64);

    const key = await deriveAesGcmKey(
      resolvedSecret.secret,
      salt,
      envelope.iterations
    );
    const decryptedBuffer = await cryptoApi.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      ciphertext as unknown as BufferSource
    );

    const dec = new TextDecoder();
    const jsonStr = dec.decode(decryptedBuffer);
    const parsed = JSON.parse(jsonStr);
    const cleanKeys: Record<string, string> = {};

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.trim()) {
          cleanKeys[k] = v.trim();
        }
      }
    }

    inMemoryDecryptedKeys = cleanKeys;
    const candidatePassphrase = (
      passphraseAttempt ??
      inMemoryPassphrase ??
      ''
    ).trim();
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
          'Incorrect Vault Passphrase / PIN. Could not decrypt legacy AES-256-GCM vault.',
      };
    }
    return {
      ok: false,
      locked: false,
      keys: {},
      error: 'Could not decrypt encrypted app key vault.',
    };
  }
}

/**
 * Loads the app-private encrypted key vault from `GET /api/vault` (`./.tavernsmith-app/`),
 * auto-decrypts without requiring a PIN, and seamlessly migrates any legacy
 * `./Saves/_tavernsmith_vault.enc` out of `./Saves/`.
 */
export async function loadAppVaultFromServer(): Promise<AppVaultLoadResult> {
  let data: {
    ok?: boolean;
    storagePath?: string;
    appKey?: string;
    vault?: unknown;
    legacyVault?: unknown;
  } | null = null;

  const retryDelays = [0, 350, 900];
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    if (retryDelays[attempt] > 0) {
      await new Promise((r) => setTimeout(r, retryDelays[attempt]));
    }
    try {
      const res = await fetchAppVaultState();
      if (res?.ok) {
        data = res;
        break;
      }
    } catch {
      // Retry on transient startup window
    }
  }

  if (!data?.ok || typeof data.appKey !== 'string' || !data.appKey.trim()) {
    return {
      ok: false,
      locked: false,
      needsLegacyUnlock: false,
      migratedLegacy: false,
      storagePath: inMemoryStoragePath,
      keys: { ...inMemoryDecryptedKeys },
      error: 'Local app vault storage is unavailable.',
    };
  }

  setAppVaultKey(data.appKey, data.storagePath);

  const appEnvelope = normalizeVaultEnvelope(data.vault);
  if (appEnvelope) {
    inMemoryVaultEnvelope = appEnvelope;
    inMemoryPendingLegacyVault = null;
    const dec = await decryptProviderKeysFromVault(null, appEnvelope);
    if (dec.ok && (appEnvelope.version === 1 || appEnvelope.deviceSecretBase64)) {
      // Upgrade v1 envelope inside app dir to v2 (no embedded secret)
      await runVaultEncryptionNow(dec.keys, null, false, false);
    }
    return {
      ok: dec.ok,
      locked: dec.locked,
      needsLegacyUnlock: dec.locked && appEnvelope.hasCustomPassphrase,
      migratedLegacy: false,
      storagePath: inMemoryStoragePath,
      keys: dec.keys,
      error: dec.error,
    };
  }

  const legacyEnvelope = normalizeVaultEnvelope(data.legacyVault);
  if (legacyEnvelope) {
    if (legacyEnvelope.hasCustomPassphrase) {
      inMemoryPendingLegacyVault = legacyEnvelope;
      inMemoryVaultEnvelope = legacyEnvelope;
      vaultLockedState = true;
      return {
        ok: false,
        locked: true,
        needsLegacyUnlock: true,
        migratedLegacy: false,
        storagePath: inMemoryStoragePath,
        keys: {},
        error:
          'Found a legacy PIN-protected vault in ./Saves/. Enter your old PIN once in Options to migrate your keys into the automatic app vault.',
      };
    }

    // Auto-migrate legacy non-PIN vault out of ./Saves/ into ./.tavernsmith-app/
    const dec = await decryptProviderKeysFromVault(null, legacyEnvelope);
    if (dec.ok) {
      await runVaultEncryptionNow(dec.keys, null, false, true);
      return {
        ok: true,
        locked: false,
        needsLegacyUnlock: false,
        migratedLegacy: true,
        storagePath: inMemoryStoragePath,
        keys: dec.keys,
      };
    }
  }

  vaultLockedState = false;
  return {
    ok: true,
    locked: false,
    needsLegacyUnlock: false,
    migratedLegacy: false,
    storagePath: inMemoryStoragePath,
    keys: { ...inMemoryDecryptedKeys },
  };
}

/**
 * One-time unlock & migration helper for users upgrading from an older PIN-locked
 * `./Saves/_tavernsmith_vault.enc`. Decrypts with the old PIN, re-encrypts automatically
 * using the separate app-private key in `./.tavernsmith-app/`, and removes the old file.
 */
export async function unlockAndMigrateLegacyVault(
  passphraseAttempt: string
): Promise<{
  ok: boolean;
  keys: Record<string, string>;
  error?: string;
}> {
  const targetEnvelope = inMemoryPendingLegacyVault || inMemoryVaultEnvelope;
  if (!targetEnvelope) {
    return { ok: true, keys: { ...inMemoryDecryptedKeys } };
  }

  const dec = await decryptProviderKeysFromVault(
    passphraseAttempt,
    targetEnvelope
  );
  if (!dec.ok) {
    return {
      ok: false,
      keys: {},
      error: dec.error || 'Incorrect legacy PIN.',
    };
  }

  // Re-encrypt automatically without PIN into ./.tavernsmith-app/ and delete legacy ./Saves/_tavernsmith_vault.enc
  inMemoryPassphrase = null;
  await runVaultEncryptionNow(dec.keys, null, false, true);
  return {
    ok: true,
    keys: dec.keys,
  };
}

/**
 * Synchronously returns the currently decrypted in-memory keys map.
 */
export function getInMemoryDecryptedKeys(): Record<string, string> {
  return { ...inMemoryDecryptedKeys };
}

/**
 * Retrieves a specific provider's API key on demand when making an AI request
 * or auto-filling provider credentials in Options.
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
 * Updates vault encryption settings safely. Refuses to overwrite a locked vault.
 */
export async function updateVaultPassphrase(
  newPassphrase: string | null
): Promise<{ ok: boolean; message: string }> {
  if (vaultLockedState) {
    return {
      ok: false,
      message: 'Unlock the existing legacy vault first before modifying vault credentials.',
    };
  }
  const clean = (newPassphrase || '').trim();
  const envelope = await encryptAndSaveProviderKeys(
    inMemoryDecryptedKeys,
    clean.length > 0 ? clean : null
  );
  if (!envelope) {
    return {
      ok: false,
      message: 'Failed to encrypt app vault with Web Crypto API.',
    };
  }
  return {
    ok: true,
    message: clean
      ? `AES-256-GCM Vault updated in ${inMemoryStoragePath}${VAULT_FILENAME}.`
      : `Encrypted app vault active (no PIN required) in ${inMemoryStoragePath}${VAULT_FILENAME}.`,
  };
}

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
  const needsLegacyUnlock = Boolean(
    (inMemoryPendingLegacyVault || env?.hasCustomPassphrase) && vaultLockedState
  );
  return {
    isEncrypted: Boolean(env || inMemoryAppVaultKey),
    hasCustomPassphrase: Boolean(env?.hasCustomPassphrase),
    isLocked: needsLegacyUnlock,
    needsLegacyUnlock,
    storagePath: inMemoryStoragePath,
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
