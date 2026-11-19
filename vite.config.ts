import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const META_FILENAME = '_tavernsmith_meta.json';
const LEGACY_VAULT_FILENAME = '_tavernsmith_vault.enc';
const APP_VAULT_DIRNAME = '.tavernsmith-app';
const APP_VAULT_FILENAME = 'credentials.vault.enc';
const APP_VAULT_KEY_FILENAME = 'vault.key';

const MAX_DISK_BODY_BYTES = 128 * 1024 * 1024;

function sanitizeDiskFileName(raw: string): string {
  const base = path.basename(String(raw || 'untitled')).replace(/\.json$/i, '');
  const clean =
    base
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled';
  return `${clean}.json`;
}

function getCanonicalWorkspaceRoot(): string {
  try {
    return fs.realpathSync(process.cwd());
  } catch {
    return path.resolve(process.cwd());
  }
}

function isFileConfinedInDir(dirPath: string, candidatePath: string): boolean {
  try {
    const realDir = fs.realpathSync(dirPath);
    const realCandidate = fs.realpathSync(candidatePath);
    const rel = path.relative(realDir, realCandidate);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

function isLocalHostname(hostname: string): boolean {
  const clean = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return clean === 'localhost' || clean === '127.0.0.1' || clean === '::1';
}

function isLocalHostHeader(hostHeader?: string): boolean {
  if (!hostHeader || typeof hostHeader !== 'string') return false;
  try {
    const parsed = new URL(`http://${hostHeader.trim()}`);
    return isLocalHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function validateLocalApiRequest(
  req: IncomingMessage,
  requireJsonContentType: boolean
): { ok: true } | { ok: false; status: number; error: string } {
  const hostHeader = req.headers.host;
  if (!isLocalHostHeader(hostHeader)) {
    return {
      ok: false,
      status: 403,
      error: 'Blocked request with non-local Host header.',
    };
  }

  const secFetchSite = String(req.headers['sec-fetch-site'] || '')
    .trim()
    .toLowerCase();
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return {
      ok: false,
      status: 403,
      error: 'Blocked cross-site request to local TavernSmith API.',
    };
  }

  const originHeader = req.headers.origin;
  if (typeof originHeader === 'string' && originHeader.trim()) {
    try {
      const originUrl = new URL(originHeader.trim());
      if (
        (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') ||
        !isLocalHostname(originUrl.hostname) ||
        originUrl.host.toLowerCase() !== String(hostHeader).trim().toLowerCase()
      ) {
        return {
          ok: false,
          status: 403,
          error: 'Blocked cross-origin request to local TavernSmith API.',
        };
      }
    } catch {
      return {
        ok: false,
        status: 403,
        error: 'Blocked request with malformed Origin header.',
      };
    }
  }

  if (requireJsonContentType) {
    const contentType = String(req.headers['content-type'] || '')
      .trim()
      .toLowerCase();
    if (!contentType.startsWith('application/json')) {
      return {
        ok: false,
        status: 415,
        error: 'POST requests to local APIs must use Content-Type: application/json.',
      };
    }
  }

  return { ok: true };
}

function resolveSavesRoot(): {
  diskRoot: string;
  resolvedPath: string;
  charsDir: string;
  loreDir: string;
  themesDir: string;
  tagsDir: string;
} {
  const workspaceRoot = getCanonicalWorkspaceRoot();
  const resolvedPath = path.join(workspaceRoot, 'Saves');
  const diskRoot = './Saves/';

  const charsDir = path.join(resolvedPath, 'Characters');
  const loreDir = path.join(resolvedPath, 'Lorebooks');
  const themesDir = path.join(resolvedPath, 'Themes');
  const tagsDir = path.join(resolvedPath, 'Tags');

  fs.mkdirSync(resolvedPath, { recursive: true });
  fs.mkdirSync(charsDir, { recursive: true });
  fs.mkdirSync(loreDir, { recursive: true });
  fs.mkdirSync(themesDir, { recursive: true });
  fs.mkdirSync(tagsDir, { recursive: true });

  return { diskRoot, resolvedPath, charsDir, loreDir, themesDir, tagsDir };
}

function resolveAppVaultPaths(): {
  appVaultDir: string;
  vaultFilePath: string;
  keyFilePath: string;
  legacyVaultPath: string;
} {
  const workspaceRoot = getCanonicalWorkspaceRoot();
  const appVaultDir = path.join(workspaceRoot, APP_VAULT_DIRNAME);
  fs.mkdirSync(appVaultDir, { recursive: true, mode: 0o700 });
  return {
    appVaultDir,
    vaultFilePath: path.join(appVaultDir, APP_VAULT_FILENAME),
    keyFilePath: path.join(appVaultDir, APP_VAULT_KEY_FILENAME),
    legacyVaultPath: path.join(workspaceRoot, 'Saves', LEGACY_VAULT_FILENAME),
  };
}

function readOrCreateAppVaultKey(keyFilePath: string): string {
  try {
    if (fs.existsSync(keyFilePath)) {
      const existing = fs.readFileSync(keyFilePath, 'utf8').trim();
      if (existing.length >= 32) {
        return existing;
      }
    }
  } catch {
    // Regenerate below
  }
  const generated = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(keyFilePath, `${generated}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    fs.chmodSync(keyFilePath, 0o600);
  } catch {
    // Ignore on Windows
  }
  return generated;
}

function readAppVaultStateOnDisk(): {
  ok: true;
  storagePath: string;
  appKey: string;
  vault: Record<string, unknown> | null;
  legacyVault: Record<string, unknown> | null;
} {
  const { vaultFilePath, keyFilePath, legacyVaultPath } = resolveAppVaultPaths();
  const appKey = readOrCreateAppVaultKey(keyFilePath);
  let vault: Record<string, unknown> | null = null;
  let legacyVault: Record<string, unknown> | null = null;

  if (fs.existsSync(vaultFilePath)) {
    const inspected = inspectDiskJsonFile(vaultFilePath);
    if (inspected.ok) {
      vault = inspected.parsed;
    }
  }

  if (!vault && fs.existsSync(legacyVaultPath)) {
    const inspectedLegacy = inspectDiskJsonFile(legacyVaultPath);
    if (inspectedLegacy.ok) {
      legacyVault = inspectedLegacy.parsed;
    }
  }

  return {
    ok: true,
    storagePath: `./${APP_VAULT_DIRNAME}/`,
    appKey,
    vault,
    legacyVault,
  };
}

function saveAppVaultStateOnDisk(body: Record<string, unknown>): {
  ok: true;
  storagePath: string;
  saved: boolean;
} {
  const { vaultFilePath, keyFilePath, legacyVaultPath } = resolveAppVaultPaths();
  readOrCreateAppVaultKey(keyFilePath);

  if (body.vault && typeof body.vault === 'object' && !Array.isArray(body.vault)) {
    fs.writeFileSync(
      vaultFilePath,
      JSON.stringify(body.vault, null, 2),
      { encoding: 'utf8', mode: 0o600 }
    );
    try {
      fs.chmodSync(vaultFilePath, 0o600);
    } catch {
      // Ignore on Windows
    }
  }

  if (body.removeLegacy === true && fs.existsSync(legacyVaultPath)) {
    try {
      fs.unlinkSync(legacyVaultPath);
    } catch {
      // Ignore if already removed
    }
  }

  return {
    ok: true,
    storagePath: `./${APP_VAULT_DIRNAME}/`,
    saved: true,
  };
}

type DiskScannedFileEntry = {
  id: string;
  folderPath: string;
  fileName: string;
  kind: 'character' | 'lorebook' | 'theme' | 'tag' | 'meta' | 'vault';
  sizeBytes: number;
  updatedAt: string;
  content: string;
  isCorrupted?: boolean;
  corruptReason?: string;
};

function inspectDiskJsonFile(fullPath: string): {
  ok: true;
  parsed: Record<string, unknown>;
  content: string;
  sizeBytes: number;
  updatedAt: string;
} | {
  ok: false;
  reason: string;
  content: string;
  sizeBytes: number;
  updatedAt: string;
} {
  let sizeBytes = 0;
  let updatedAt = new Date().toISOString();
  let content = '';
  try {
    const stat = fs.statSync(fullPath);
    sizeBytes = stat.size;
    updatedAt = stat.mtime.toISOString();
    content = fs.readFileSync(fullPath, 'utf8');
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Unreadable file',
      content: '',
      sizeBytes,
      updatedAt,
    };
  }

  if (!content.trim()) {
    return {
      ok: false,
      reason: 'File is empty (0 bytes or whitespace only)',
      content,
      sizeBytes,
      updatedAt,
    };
  }

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        reason: 'JSON root must be an object',
        content: content.slice(0, 16384),
        sizeBytes,
        updatedAt,
      };
    }
    return {
      ok: true,
      parsed: parsed as Record<string, unknown>,
      content,
      sizeBytes,
      updatedAt,
    };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : 'Malformed JSON syntax',
      content: content.slice(0, 16384),
      sizeBytes,
      updatedAt,
    };
  }
}

export function scanSavesDirectoryOnDisk() {
  const { diskRoot, resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot();

  const characters: Record<string, unknown>[] = [];
  const lorebooks: Record<string, unknown>[] = [];
  const themes: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  let meta: Record<string, unknown> | null = null;
  const files: DiskScannedFileEntry[] = [];

  // 1. Read all .json files inside ./Saves/Characters/ strictly as characters[]
  if (fs.existsSync(charsDir)) {
    const charEntries = fs
      .readdirSync(charsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of charEntries) {
      const fullPath = path.join(charsDir, entry.name);
      if (!isFileConfinedInDir(charsDir, fullPath)) continue;
      const inspected = inspectDiskJsonFile(fullPath);
      if (!inspected.ok) {
        files.push({
          id: `Characters/${entry.name}`,
          folderPath: 'Characters/',
          fileName: entry.name,
          kind: 'character',
          sizeBytes: inspected.sizeBytes,
          updatedAt: inspected.updatedAt,
          content: inspected.content,
          isCorrupted: true,
          corruptReason: inspected.reason,
        });
        continue;
      }
      if (inspected.parsed._tavernsmithType === 'lorebook') {
        continue;
      }
      characters.push({
        ...inspected.parsed,
        _diskFileName: entry.name,
        _diskUpdatedAt: inspected.updatedAt,
      });
      files.push({
        id: `Characters/${entry.name}`,
        folderPath: 'Characters/',
        fileName: entry.name,
        kind: 'character',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  // 2. Read all .json files inside ./Saves/Lorebooks/ strictly as lorebooks[]
  if (fs.existsSync(loreDir)) {
    const loreEntries = fs
      .readdirSync(loreDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of loreEntries) {
      const fullPath = path.join(loreDir, entry.name);
      if (!isFileConfinedInDir(loreDir, fullPath)) continue;
      const inspected = inspectDiskJsonFile(fullPath);
      if (!inspected.ok) {
        files.push({
          id: `Lorebooks/${entry.name}`,
          folderPath: 'Lorebooks/',
          fileName: entry.name,
          kind: 'lorebook',
          sizeBytes: inspected.sizeBytes,
          updatedAt: inspected.updatedAt,
          content: inspected.content,
          isCorrupted: true,
          corruptReason: inspected.reason,
        });
        continue;
      }
      if (inspected.parsed._tavernsmithType === 'character') {
        continue;
      }
      lorebooks.push({
        ...inspected.parsed,
        _tavernsmithType: 'lorebook',
        _diskFileName: entry.name,
        _diskUpdatedAt: inspected.updatedAt,
      });
      files.push({
        id: `Lorebooks/${entry.name}`,
        folderPath: 'Lorebooks/',
        fileName: entry.name,
        kind: 'lorebook',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  // 3. Read all .json files inside ./Saves/Themes/ strictly as themes[]
  if (fs.existsSync(themesDir)) {
    const themeEntries = fs
      .readdirSync(themesDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of themeEntries) {
      const fullPath = path.join(themesDir, entry.name);
      if (!isFileConfinedInDir(themesDir, fullPath)) continue;
      const inspected = inspectDiskJsonFile(fullPath);
      if (!inspected.ok) {
        files.push({
          id: `Themes/${entry.name}`,
          folderPath: 'Themes/',
          fileName: entry.name,
          kind: 'theme',
          sizeBytes: inspected.sizeBytes,
          updatedAt: inspected.updatedAt,
          content: inspected.content,
          isCorrupted: true,
          corruptReason: inspected.reason,
        });
        continue;
      }
      themes.push({
        ...inspected.parsed,
        _tavernsmithType: 'theme',
        _diskFileName: entry.name,
        _diskUpdatedAt: inspected.updatedAt,
      });
      files.push({
        id: `Themes/${entry.name}`,
        folderPath: 'Themes/',
        fileName: entry.name,
        kind: 'theme',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  // 4. Read all .json files inside ./Saves/Tags/ strictly as tags[]
  if (fs.existsSync(tagsDir)) {
    const tagEntries = fs
      .readdirSync(tagsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of tagEntries) {
      const fullPath = path.join(tagsDir, entry.name);
      if (!isFileConfinedInDir(tagsDir, fullPath)) continue;
      const inspected = inspectDiskJsonFile(fullPath);
      if (!inspected.ok) {
        files.push({
          id: `Tags/${entry.name}`,
          folderPath: 'Tags/',
          fileName: entry.name,
          kind: 'tag',
          sizeBytes: inspected.sizeBytes,
          updatedAt: inspected.updatedAt,
          content: inspected.content,
          isCorrupted: true,
          corruptReason: inspected.reason,
        });
        continue;
      }
      tags.push({
        ...inspected.parsed,
        _tavernsmithType: 'tag',
        _diskFileName: entry.name,
        _diskUpdatedAt: inspected.updatedAt,
      });
      files.push({
        id: `Tags/${entry.name}`,
        folderPath: 'Tags/',
        fileName: entry.name,
        kind: 'tag',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  // 5. Read ./Saves/_tavernsmith_meta.json
  const metaPath = path.join(resolvedPath, META_FILENAME);
  if (fs.existsSync(metaPath) && isFileConfinedInDir(resolvedPath, metaPath)) {
    const inspected = inspectDiskJsonFile(metaPath);
    if (!inspected.ok) {
      files.push({
        id: `/${META_FILENAME}`,
        folderPath: '/',
        fileName: META_FILENAME,
        kind: 'meta',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
        isCorrupted: true,
        corruptReason: inspected.reason,
      });
    } else {
      meta = inspected.parsed;
      files.push({
        id: `/${META_FILENAME}`,
        folderPath: '/',
        fileName: META_FILENAME,
        kind: 'meta',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  return {
    ok: true,
    diskRoot,
    resolvedPath: diskRoot,
    characters,
    lorebooks,
    themes,
    tags,
    meta,
    vault: null,
    files,
    updatedAt: new Date().toISOString(),
  };
}

function extractEntityIdFromJson(parsed: Record<string, unknown>): string {
  const source =
    parsed.payload &&
    typeof parsed.payload === 'object' &&
    !Array.isArray(parsed.payload)
      ? (parsed.payload as Record<string, unknown>)
      : parsed;

  if (typeof source.id === 'string' && source.id.trim()) {
    return source.id.trim();
  }
  if (source.data && typeof source.data === 'object') {
    const dataObj = source.data as Record<string, unknown>;
    if (typeof dataObj.id === 'string' && dataObj.id.trim()) {
      return dataObj.id.trim();
    }
    if (dataObj.extensions && typeof dataObj.extensions === 'object') {
      const extObj = dataObj.extensions as Record<string, unknown>;
      if (extObj.tavernsmith && typeof extObj.tavernsmith === 'object') {
        const tsObj = extObj.tavernsmith as Record<string, unknown>;
        if (typeof tsObj.id === 'string' && tsObj.id.trim()) {
          return tsObj.id.trim();
        }
      }
    }
  }
  if (source.extensions && typeof source.extensions === 'object') {
    const extObj = source.extensions as Record<string, unknown>;
    if (extObj.tavernsmith && typeof extObj.tavernsmith === 'object') {
      const tsObj = extObj.tavernsmith as Record<string, unknown>;
      if (typeof tsObj.id === 'string' && tsObj.id.trim()) {
        return tsObj.id.trim();
      }
    }
  }
  return '';
}

function reserveUniqueDiskFileName(
  preferredName: string,
  usedNamesLower: Set<string>
): string {
  const initial = sanitizeDiskFileName(preferredName);
  const stem = initial.replace(/\.json$/i, '');
  let candidate = initial;
  let suffix = 2;
  while (usedNamesLower.has(candidate.toLowerCase())) {
    candidate = `${stem}_${suffix}.json`;
    suffix++;
  }
  usedNamesLower.add(candidate.toLowerCase());
  return candidate;
}

function pruneValidOrphanJsonFiles(
  targetDir: string,
  writtenFilesLower: Set<string>
) {
  try {
    const existingFiles = fs.readdirSync(targetDir);
    for (const fileName of existingFiles) {
      if (!fileName.toLowerCase().endsWith('.json')) continue;
      if (!writtenFilesLower.has(fileName.toLowerCase())) {
        const orphanPath = path.join(targetDir, fileName);
        if (fs.existsSync(orphanPath) && isFileConfinedInDir(targetDir, orphanPath)) {
          // Keep corrupted/unparseable files flagged in Settings > Saved Files until explicitly deleted by the user
          const inspected = inspectDiskJsonFile(orphanPath);
          if (inspected.ok) {
            fs.unlinkSync(orphanPath);
          }
        }
      }
    }
  } catch {
    // Ignore directory prune errors
  }
}

export function saveToSavesDirectoryOnDisk(body: Record<string, unknown>) {
  const { resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot();

  // 1. Write characters strictly into ./Saves/Characters/[UniqueSanitizedName].json
  if (Array.isArray(body.characters)) {
    const usedCharTargets = new Set<string>();
    const writtenCharFiles = new Set<string>();

    for (const item of body.characters) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        content?: string;
        payload?: Record<string, unknown>;
      };
      const payload = entry.payload || (item as Record<string, unknown>);
      if (payload._tavernsmithType === 'lorebook') {
        continue; // NEVER write a Lorebook into ./Saves/Characters/
      }
      const rawName =
        entry.fileName ||
        (payload.data &&
        typeof payload.data === 'object' &&
        typeof (payload.data as Record<string, unknown>).name === 'string'
          ? String((payload.data as Record<string, unknown>).name)
          : typeof payload.name === 'string'
            ? payload.name
            : 'untitled');
      const targetFileName = reserveUniqueDiskFileName(rawName, usedCharTargets);
      const outContent =
        typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify(
              {
                ...payload,
                _tavernsmithType: 'character',
              },
              null,
              2
            );

      fs.writeFileSync(
        path.join(charsDir, targetFileName),
        outContent,
        'utf8'
      );
      writtenCharFiles.add(targetFileName.toLowerCase());
    }

    pruneValidOrphanJsonFiles(charsDir, writtenCharFiles);
  }

  // 2. Write lorebooks strictly into ./Saves/Lorebooks/[UniqueSanitizedName].json
  if (Array.isArray(body.lorebooks)) {
    const usedLoreTargets = new Set<string>();
    const writtenBookFiles = new Set<string>();

    for (const item of body.lorebooks) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        content?: string;
        payload?: Record<string, unknown>;
      };
      const payload = entry.payload || (item as Record<string, unknown>);
      if (payload._tavernsmithType === 'character') {
        continue; // NEVER write a Character into ./Saves/Lorebooks/
      }
      const rawName =
        entry.fileName ||
        (typeof payload.name === 'string' ? payload.name : 'untitled_lorebook');
      const targetFileName = reserveUniqueDiskFileName(rawName, usedLoreTargets);
      const outContent =
        typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify(
              {
                ...payload,
                _tavernsmithType: 'lorebook',
              },
              null,
              2
            );

      fs.writeFileSync(
        path.join(loreDir, targetFileName),
        outContent,
        'utf8'
      );
      writtenBookFiles.add(targetFileName.toLowerCase());
    }

    pruneValidOrphanJsonFiles(loreDir, writtenBookFiles);
  }

  // 3. Write added/modified themes compactly into ./Saves/Themes/[UniqueSanitizedName].json
  if (Array.isArray(body.themes)) {
    const usedThemeTargets = new Set<string>();
    const writtenThemeFiles = new Set<string>();

    for (const item of body.themes) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        content?: string;
        payload?: Record<string, unknown>;
      };
      const payload = entry.payload || (item as Record<string, unknown>);
      const rawName =
        entry.fileName ||
        (typeof payload.name === 'string' ? payload.name : 'custom_theme');
      const targetFileName = reserveUniqueDiskFileName(rawName, usedThemeTargets);
      // Minified JSON for space-efficient storage
      const outContent =
        typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify({
              ...payload,
              _tavernsmithType: 'theme',
            });

      fs.writeFileSync(
        path.join(themesDir, targetFileName),
        outContent,
        'utf8'
      );
      writtenThemeFiles.add(targetFileName.toLowerCase());
    }

    pruneValidOrphanJsonFiles(themesDir, writtenThemeFiles);
  }

  // 4. Write added/modified tags compactly into ./Saves/Tags/[UniqueSanitizedName].json
  if (Array.isArray(body.tags)) {
    const usedTagTargets = new Set<string>();
    const writtenTagFiles = new Set<string>();

    for (const item of body.tags) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        content?: string;
        payload?: Record<string, unknown>;
      };
      const payload = entry.payload || (item as Record<string, unknown>);
      const rawName =
        entry.fileName ||
        (typeof payload.name === 'string' ? payload.name : 'custom_tag');
      const targetFileName = reserveUniqueDiskFileName(rawName, usedTagTargets);
      // Minified JSON for space-efficient storage
      const outContent =
        typeof entry.content === 'string'
          ? entry.content
          : JSON.stringify({
              ...payload,
              _tavernsmithType: 'tag',
            });

      fs.writeFileSync(
        path.join(tagsDir, targetFileName),
        outContent,
        'utf8'
      );
      writtenTagFiles.add(targetFileName.toLowerCase());
    }

    pruneValidOrphanJsonFiles(tagsDir, writtenTagFiles);
  }

  // 5. Write slim workspace settings & active IDs into ./Saves/_tavernsmith_meta.json
  if (body.meta && typeof body.meta === 'object') {
    fs.writeFileSync(
      path.join(resolvedPath, META_FILENAME),
      JSON.stringify(body.meta, null, 2),
      'utf8'
    );
  }

  // Immediately re-scan the disk and return the fresh disk state
  return scanSavesDirectoryOnDisk();
}

export function deleteFromSavesDirectoryOnDisk(body: Record<string, unknown>) {
  const { resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot();

  const rawFolder = String(body.folder || body.kind || '').toLowerCase();

  const candidateNames = new Set<string>();
  const rawFileName =
    typeof body.fileName === 'string' ? body.fileName.trim() : '';
  const rawSavedFileName =
    typeof body.savedFileName === 'string' ? body.savedFileName.trim() : '';
  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  const rawId = typeof body.id === 'string' ? body.id.trim() : '';

  if (rawFileName) {
    candidateNames.add(path.basename(rawFileName));
  }
  if (rawSavedFileName) {
    candidateNames.add(path.basename(rawSavedFileName));
  }

  if (rawFolder === 'root' || rawFolder === 'meta') {
    for (const name of candidateNames) {
      if (name !== META_FILENAME) continue;
      const targetPath = path.join(resolvedPath, name);
      if (fs.existsSync(targetPath) && isFileConfinedInDir(resolvedPath, targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          // Ignore if already removed
        }
      }
    }
    return scanSavesDirectoryOnDisk();
  }

  if (rawFolder === 'vault') {
    return scanSavesDirectoryOnDisk();
  }

  const targetDir =
    rawFolder === 'lorebooks' || rawFolder === 'lorebook'
      ? loreDir
      : rawFolder === 'themes' || rawFolder === 'theme'
        ? themesDir
        : rawFolder === 'tags' || rawFolder === 'tag'
          ? tagsDir
          : charsDir;

  let deletedAny = false;
  for (const name of candidateNames) {
    if (!name || name === '.' || name === '..' || !name.toLowerCase().endsWith('.json')) {
      continue;
    }
    const targetPath = path.join(targetDir, name);
    const rel = path.relative(targetDir, targetPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (fs.existsSync(targetPath) && isFileConfinedInDir(targetDir, targetPath)) {
      try {
        fs.unlinkSync(targetPath);
        deletedAny = true;
      } catch {
        // Ignore if already removed
      }
    }
  }

  // Match by internal JSON `id` across target directory in case filename changed
  if (rawId && fs.existsSync(targetDir)) {
    const entries = fs
      .readdirSync(targetDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'));
    for (const entry of entries) {
      const fullPath = path.join(targetDir, entry.name);
      if (!isFileConfinedInDir(targetDir, fullPath)) continue;
      try {
        const parsed = JSON.parse(
          fs.readFileSync(fullPath, 'utf8')
        ) as Record<string, unknown>;
        if (extractEntityIdFromJson(parsed) === rawId) {
          fs.unlinkSync(fullPath);
          deletedAny = true;
        }
      } catch {
        // Ignore unreadable file
      }
    }
  }

  // Fallback to sanitized name ONLY if no file was matched by savedFileName/fileName/id
  if (!deletedAny && rawName) {
    const sanitizedTarget = path.join(targetDir, sanitizeDiskFileName(rawName));
    if (fs.existsSync(sanitizedTarget) && isFileConfinedInDir(targetDir, sanitizedTarget)) {
      try {
        fs.unlinkSync(sanitizedTarget);
      } catch {
        // Ignore if already removed
      }
    }
  }

  return scanSavesDirectoryOnDisk();
}

function createHttpError(message: string, statusCode: number): Error & {
  statusCode: number;
} {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function readJsonRequestBody(
  req: IncomingMessage
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    // If Express body-parser already parsed req.body, use it directly
    const maybeExpressReq = req as IncomingMessage & {
      body?: Record<string, unknown>;
    };
    if (maybeExpressReq.body && typeof maybeExpressReq.body === 'object') {
      resolve(maybeExpressReq.body);
      return;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > MAX_DISK_BODY_BYTES) {
        settled = true;
        req.destroy();
        reject(createHttpError('Request body exceeds 128 MB limit', 413));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(createHttpError('JSON request body must be an object', 400));
          return;
        }
        resolve(parsed as Record<string, unknown>);
      } catch {
        reject(createHttpError('Invalid JSON request body', 400));
      }
    });
    req.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
  });
}

function isBlockedStaticPath(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  const segments = decoded
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean);
  for (const seg of segments) {
    const lower = seg.toLowerCase();
    if (
      lower === '..' ||
      lower === 'saves' ||
      lower === APP_VAULT_DIRNAME.toLowerCase() ||
      lower === '.git' ||
      lower === '.env' ||
      lower.startsWith('.env.') ||
      lower === 'server.cjs' ||
      lower === 'server.py' ||
      lower.endsWith('.bat') ||
      lower.endsWith('.command') ||
      lower.endsWith('.sh') ||
      lower.endsWith('.ps1')
    ) {
      return true;
    }
  }
  return false;
}

function createDiskApiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url || '';
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;

    if (isBlockedStaticPath(pathname)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('Forbidden');
      return;
    }

    const isDiskRoute = pathname.startsWith('/api/disk/');
    const isVaultRoute = pathname === '/api/vault';
    if (!isDiskRoute && !isVaultRoute) {
      next();
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    const requireJson =
      req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
    const check = validateLocalApiRequest(req, requireJson);
    if (!check.ok) {
      res.statusCode = check.status;
      res.end(JSON.stringify({ ok: false, error: check.error }));
      return;
    }

    try {
      if (req.method === 'GET' && pathname === '/api/disk/state') {
        const state = scanSavesDirectoryOnDisk();
        res.statusCode = 200;
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/disk/save') {
        const body = await readJsonRequestBody(req);
        const state = saveToSavesDirectoryOnDisk(body);
        res.statusCode = 200;
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/disk/delete') {
        const body = await readJsonRequestBody(req);
        const state = deleteFromSavesDirectoryOnDisk(body);
        res.statusCode = 200;
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/vault') {
        const state = readAppVaultStateOnDisk();
        res.statusCode = 200;
        res.end(JSON.stringify(state));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/vault') {
        const body = await readJsonRequestBody(req);
        const state = saveAppVaultStateOnDisk(body);
        res.statusCode = 200;
        res.end(JSON.stringify(state));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    } catch (err: unknown) {
      const statusCode =
        typeof (err as { statusCode?: unknown })?.statusCode === 'number'
          ? (err as { statusCode: number }).statusCode
          : 500;
      res.statusCode = statusCode;
      res.end(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : 'Disk API failure',
        })
      );
    }
  };
}

function tavernSmithDiskApiPlugin(): Plugin {
  // Ensure ./Saves/ and ./.tavernsmith-app/ exist on startup
  resolveSavesRoot();
  resolveAppVaultPaths();

  return {
    name: 'tavernsmith-local-disk-api',
    configureServer(server) {
      server.middlewares.use(createDiskApiMiddleware());
    },
    configurePreviewServer(server) {
      server.middlewares.use(createDiskApiMiddleware());
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      {
        name: 'suppress-hmr-websocket-error',
        enforce: 'post',
        transform(code, id) {
          if (id.includes('vite/dist/client/client.mjs')) {
            return code
              .replace(
                'reject(/* @__PURE__ */ new Error("WebSocket closed without opened."));',
                'resolve();'
              )
              .replace(
                'transport.connect(createHMRHandler(handleMessage));',
                '/* HMR WebSocket disabled */'
              );
          }
          return null;
        },
      },
      tavernSmithDiskApiPlugin(),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), '.'),
      },
    },
    server: {
      host: '127.0.0.1',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    preview: {
      host: '127.0.0.1',
    },
  };
});
