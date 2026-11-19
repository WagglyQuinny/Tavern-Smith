import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const META_FILENAME = '_tavernsmith_meta.json';
const LEGACY_VAULT_FILENAME = '_tavernsmith_vault.enc';
const APP_VAULT_DIRNAME = '.tavernsmith-app';
const APP_VAULT_FILENAME = 'credentials.vault.enc';
const APP_VAULT_KEY_FILENAME = 'vault.key';

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
  req: express.Request,
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
    // Regenerate below if unreadable
  }
  const generated = crypto.randomBytes(32).toString('base64');
  fs.writeFileSync(keyFilePath, `${generated}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  try {
    fs.chmodSync(keyFilePath, 0o600);
  } catch {
    // Ignore chmod error on Windows
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
      // Ignore chmod error on Windows
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

function scanSavesDirectoryOnDisk() {
  const { diskRoot, resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot();

  const characters: Record<string, unknown>[] = [];
  const lorebooks: Record<string, unknown>[] = [];
  const themes: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  let meta: Record<string, unknown> | null = null;
  const vault: Record<string, unknown> | null = null;
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
    vault,
    files,
    updatedAt: new Date().toISOString(),
  };
}

function saveToSavesDirectoryOnDisk(body: Record<string, unknown>) {
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
        continue;
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
        continue;
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

  // 5. Write workspace settings & active IDs into ./Saves/_tavernsmith_meta.json
  if (body.meta && typeof body.meta === 'object') {
    fs.writeFileSync(
      path.join(resolvedPath, META_FILENAME),
      JSON.stringify(body.meta, null, 2),
      'utf8'
    );
  }

  // Note: Encrypted API credentials are stored outside ./Saves/ via /api/vault (./.tavernsmith-app/).
  return scanSavesDirectoryOnDisk();
}

function deleteFromSavesDirectoryOnDisk(body: Record<string, unknown>) {
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
    const allowedRootFiles = new Set([META_FILENAME]);
    for (const name of candidateNames) {
      if (!allowedRootFiles.has(name)) continue;
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
    if (!name || name === '.' || name === '..') continue;
    if (!name.toLowerCase().endsWith('.json')) continue;
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

  if (!deletedAny && rawName) {
    const sanitizedTarget = path.join(targetDir, sanitizeDiskFileName(rawName));
    if (
      fs.existsSync(sanitizedTarget) &&
      isFileConfinedInDir(targetDir, sanitizedTarget)
    ) {
      try {
        fs.unlinkSync(sanitizedTarget);
      } catch {
        // Ignore if already removed
      }
    }
  }

  return scanSavesDirectoryOnDisk();
}

function extractCustomApiKey(req: express.Request): string {
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const googHeader = req.headers['x-goog-api-key'];
  if (typeof googHeader === 'string' && googHeader.trim()) {
    return googHeader.trim();
  }
  const bodyKey =
    req.body && typeof req.body.apiKey === 'string'
      ? req.body.apiKey.trim()
      : '';
  return bodyKey;
}

function createGeminiClient(customApiKey?: string): GoogleGenAI {
  const effectiveKey =
    (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  return new GoogleGenAI({
    apiKey: effectiveKey,
    httpOptions: {
      headers: {
        'User-Agent': 'tavernsmith-local',
      },
    },
  });
}

function resolveServerGeminiModel(rawModel?: string): string {
  const clean = (rawModel || '').trim().replace(/^models\//i, '');
  return clean || 'gemini-2.5-flash';
}

function formatGeminiErrorMessage(err: unknown): {
  status: number;
  message: string;
} {
  const rawMessage =
    err instanceof Error ? err.message : 'Server-side Gemini API request failed';
  const statusMatch =
    typeof (err as { status?: number })?.status === 'number'
      ? (err as { status: number }).status
      : rawMessage.includes('403') || rawMessage.includes('PERMISSION_DENIED')
        ? 403
        : rawMessage.includes('400') || rawMessage.includes('API_KEY_INVALID')
          ? 400
          : rawMessage.includes('429') ||
              rawMessage.includes('RESOURCE_EXHAUSTED')
            ? 429
            : rawMessage.includes('404') || rawMessage.includes('NOT_FOUND')
              ? 404
              : 500;

  if (statusMatch === 400 || statusMatch === 403) {
    return {
      status: statusMatch,
      message:
        'Gemini API authentication error. Verify your Gemini API key in Options or GEMINI_API_KEY in .env.',
    };
  }

  if (statusMatch === 429) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Verify quota or billing for your Gemini API key.',
    };
  }

  return {
    status: statusMatch,
    message: rawMessage,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '127.0.0.1';

  // Ensure ./Saves/ (with Characters, Lorebooks, Themes, Tags) and ./.tavernsmith-app/ exist on startup
  resolveSavesRoot();
  resolveAppVaultPaths();

  // Set baseline security headers & block direct static HTTP access to private save/vault/dotfile/launcher paths
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let decodedPath = req.path || '/';
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      res.status(403).json({ ok: false, error: 'Access denied' });
      return;
    }
    const rawPath = decodedPath.replace(/\\/g, '/').toLowerCase();
    const segments = rawPath.split('/').filter(Boolean);
    if (
      segments.some(
        (s) =>
          s === '..' ||
          s === 'saves' ||
          s === '.tavernsmith-app' ||
          s === '.git' ||
          s === '.env' ||
          s.startsWith('.env.') ||
          s === 'server.cjs' ||
          s === 'server.py' ||
          s.endsWith('.bat') ||
          s.endsWith('.command') ||
          s.endsWith('.sh') ||
          s.endsWith('.ps1')
      )
    ) {
      res.status(403).json({ ok: false, error: 'Access denied' });
      return;
    }
    next();
  });

  // Localhost-only same-origin & CSRF protection on all /api/* routes
  app.use('/api', (req, res, next) => {
    const requireJson =
      req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH';
    const check = validateLocalApiRequest(req, requireJson);
    if (!check.ok) {
      res.status(check.status).json({ ok: false, error: check.error });
      return;
    }
    next();
  });

  app.use(express.json({ limit: '128mb' }));
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      const errObj = err as { type?: string; status?: number; message?: string };
      if (errObj?.type === 'entity.too.large' || errObj?.status === 413) {
        res.status(413).json({
          ok: false,
          error: 'Request body exceeds 128 MB limit',
        });
        return;
      }
      if (
        err instanceof SyntaxError ||
        errObj?.type === 'entity.parse.failed' ||
        errObj?.status === 400
      ) {
        res.status(400).json({
          ok: false,
          error: 'Invalid JSON request body',
        });
        return;
      }
      next(err);
    }
  );

  // GET /api/disk/state — Auto-scan ./Saves/Characters/, Lorebooks/, Themes/, Tags/, _tavernsmith_meta.json
  app.get('/api/disk/state', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(scanSavesDirectoryOnDisk());
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to scan ./Saves/',
      });
    }
  });

  // POST /api/disk/save — Overwrite files in ./Saves/ and immediately re-scan disk
  app.post('/api/disk/save', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(saveToSavesDirectoryOnDisk(req.body || {}));
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save to ./Saves/',
      });
    }
  });

  // POST /api/disk/delete — Physically delete file from ./Saves/Characters/, Lorebooks/, Themes/, or Tags/ and re-scan
  app.post('/api/disk/delete', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(deleteFromSavesDirectoryOnDisk(req.body || {}));
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error:
          err instanceof Error ? err.message : 'Failed to delete from ./Saves/',
      });
    }
  });

  // GET /api/vault — Read app-private encrypted API key vault stored outside ./Saves/ in ./.tavernsmith-app/
  app.get('/api/vault', (_req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(readAppVaultStateOnDisk());
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to read app vault',
      });
    }
  });

  // POST /api/vault — Persist app-private encrypted API key vault outside ./Saves/ in ./.tavernsmith-app/
  app.post('/api/vault', (req, res) => {
    try {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(saveAppVaultStateOnDisk(req.body || {}));
    } catch (err: unknown) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Failed to save app vault',
      });
    }
  });

  // GET /api/gemini/models — Pulls ONLY actually available generateContent models from Google Generative Language API
  app.get('/api/gemini/models', async (req, res) => {
    try {
      const customKey = extractCustomApiKey(req);
      const effectiveKey =
        (customKey && customKey.trim()) || process.env.GEMINI_API_KEY || '';
      if (!effectiveKey) {
        res.status(403).json({
          error:
            'No Gemini API key provided and server GEMINI_API_KEY is not configured.',
          models: [],
        });
        return;
      }

      const scannedIds: string[] = [];
      let pageToken = '';
      let pageCount = 0;

      do {
        const pageParam = pageToken
          ? `&pageToken=${encodeURIComponent(pageToken)}`
          : '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageParam}`;
        const apiRes = await fetch(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'x-goog-api-key': effectiveKey,
          },
        });
        const apiData = (await apiRes.json().catch(() => ({}))) as {
          models?: Array<{
            name?: string;
            id?: string;
            supportedGenerationMethods?: string[];
          }>;
          nextPageToken?: string;
          error?: { message?: string };
        };
        if (!apiRes.ok) {
          res.status(apiRes.status).json({
            error:
              apiData?.error?.message ||
              `Gemini API returned HTTP ${apiRes.status}`,
            models: [],
          });
          return;
        }
        if (Array.isArray(apiData?.models)) {
          for (const m of apiData.models) {
            const methods = Array.isArray(m.supportedGenerationMethods)
              ? m.supportedGenerationMethods
              : [];
            if (methods.length > 0 && !methods.includes('generateContent')) {
              continue;
            }
            const id = (m.name || m.id || '').replace(/^models\//i, '').trim();
            if (id && !scannedIds.includes(id)) {
              scannedIds.push(id);
            }
          }
        }
        pageToken =
          typeof apiData?.nextPageToken === 'string'
            ? apiData.nextPageToken.trim()
            : '';
        pageCount += 1;
      } while (pageToken && pageCount < 50);

      res.json({
        models: scannedIds,
        defaultModel: scannedIds[0] || '',
      });
    } catch (err: unknown) {
      const formatted = formatGeminiErrorMessage(err);
      res.status(formatted.status).json({
        error: formatted.message,
        models: [],
      });
    }
  });

  // POST /api/gemini/generate — Standard server-side generateContent call
  app.post('/api/gemini/generate', async (req, res) => {
    try {
      const customKey = extractCustomApiKey(req);
      if (!customKey && !process.env.GEMINI_API_KEY) {
        res.status(403).json({
          error:
            'No Gemini API key provided and server GEMINI_API_KEY is not configured.',
        });
        return;
      }

      const {
        prompt,
        systemInstruction,
        model: requestedModel,
        temperature,
        maxTokens,
        stopSequences,
        responseMimeType,
        responseSchema,
        inlineData,
        inlineDataList,
        imageDataUrl,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing required "prompt" string.' });
        return;
      }

      const ai = createGeminiClient(customKey);
      const model = resolveServerGeminiModel(requestedModel);
      const isGemmaModel = model.toLowerCase().includes('gemma');

      const config: Record<string, unknown> = {};
      let effectivePrompt = prompt;
      if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
        if (isGemmaModel) {
          effectivePrompt = `[System Instructions]\n${systemInstruction.trim()}\n\n[User Request]\n${prompt}`;
        } else {
          config.systemInstruction = systemInstruction;
        }
      }
      if (typeof temperature === 'number' && Number.isFinite(temperature)) {
        config.temperature = Math.min(2, Math.max(0, temperature));
      }
      if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
        config.maxOutputTokens = Math.floor(maxTokens);
      }
      if (Array.isArray(stopSequences)) {
        const cleanStops = stopSequences
          .filter((s): s is string => typeof s === 'string' && s.length > 0)
          .slice(0, 5);
        if (cleanStops.length > 0) {
          config.stopSequences = cleanStops;
        }
      }
      if (responseMimeType && typeof responseMimeType === 'string') {
        config.responseMimeType = responseMimeType;
      }
      if (responseSchema && typeof responseSchema === 'object') {
        config.responseSchema = responseSchema;
      }

      const resolvedInlineDataList: Array<{ mimeType: string; data: string }> = [];
      if (Array.isArray(inlineDataList)) {
        for (const item of inlineDataList) {
          if (
            item &&
            typeof item === 'object' &&
            typeof (item as { data?: unknown }).data === 'string' &&
            (item as { data: string }).data.trim()
          ) {
            const rawMime = (item as { mimeType?: unknown }).mimeType;
            resolvedInlineDataList.push({
              mimeType:
                typeof rawMime === 'string' && rawMime ? rawMime : 'image/jpeg',
              data: (item as { data: string }).data.trim(),
            });
          }
        }
      } else if (
        inlineData &&
        typeof inlineData === 'object' &&
        typeof inlineData.data === 'string' &&
        inlineData.data.trim()
      ) {
        resolvedInlineDataList.push({
          mimeType:
            typeof inlineData.mimeType === 'string' && inlineData.mimeType
              ? inlineData.mimeType
              : 'image/jpeg',
          data: inlineData.data.trim(),
        });
      } else if (
        typeof imageDataUrl === 'string' &&
        imageDataUrl.startsWith('data:image/')
      ) {
        const commaIndex = imageDataUrl.indexOf(',');
        if (commaIndex !== -1) {
          const header = imageDataUrl.slice(5, commaIndex);
          const mimeMatch = header.split(';')[0] || 'image/jpeg';
          const base64Part = imageDataUrl.slice(commaIndex + 1).trim();
          if (base64Part) {
            resolvedInlineDataList.push({
              mimeType: mimeMatch,
              data: base64Part,
            });
          }
        }
      }

      const contentsPayload =
        resolvedInlineDataList.length > 0
          ? {
              parts: [
                { text: effectivePrompt },
                ...resolvedInlineDataList.map((img) => ({
                  inlineData: {
                    mimeType: img.mimeType,
                    data: img.data,
                  },
                })),
              ],
            }
          : effectivePrompt;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model,
        contents: contentsPayload,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const text = response.text ?? '';

      // Extract any thought summaries if returned in candidate parts
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      const thoughtParts: string[] = [];
      for (const part of parts) {
        if (
          part &&
          typeof part === 'object' &&
          'thought' in part &&
          (part as { thought?: boolean; text?: string }).thought &&
          typeof (part as { text?: string }).text === 'string'
        ) {
          thoughtParts.push((part as { text: string }).text);
        }
      }

      res.json({
        text,
        reasoning: thoughtParts.join('\n\n'),
        model,
      });
    } catch (err: unknown) {
      const formatted = formatGeminiErrorMessage(err);
      res.status(formatted.status).json({
        error: formatted.message,
      });
    }
  });

  // POST /api/gemini/stream — Streaming server-side generateContentStream via SSE
  app.post('/api/gemini/stream', async (req, res) => {
    let clientDisconnected = false;
    const markDisconnected = () => {
      clientDisconnected = true;
    };
    req.on('close', markDisconnected);
    res.on('close', markDisconnected);

    try {
      const customKey = extractCustomApiKey(req);
      if (!customKey && !process.env.GEMINI_API_KEY) {
        res.status(403).json({
          error:
            'No Gemini API key provided and server GEMINI_API_KEY is not configured.',
        });
        return;
      }

      const {
        prompt,
        systemInstruction,
        model: requestedModel,
        temperature,
        maxTokens,
      } = req.body ?? {};

      if (!prompt || typeof prompt !== 'string') {
        res.status(400).json({ error: 'Missing required "prompt" string.' });
        return;
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const ai = createGeminiClient(customKey);
      const model = resolveServerGeminiModel(requestedModel);
      const isGemmaModel = model.toLowerCase().includes('gemma');

      const config: Record<string, unknown> = {};
      let effectivePrompt = prompt;
      if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.trim()) {
        if (isGemmaModel) {
          effectivePrompt = `[System Instructions]\n${systemInstruction.trim()}\n\n[User Request]\n${prompt}`;
        } else {
          config.systemInstruction = systemInstruction;
        }
      }
      if (typeof temperature === 'number' && Number.isFinite(temperature)) {
        config.temperature = Math.min(2, Math.max(0, temperature));
      }
      if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
        config.maxOutputTokens = Math.floor(maxTokens);
      }

      const streamResponse = await ai.models.generateContentStream({
        model,
        contents: effectivePrompt,
        config: Object.keys(config).length > 0 ? config : undefined,
      });

      const asyncIter = streamResponse[Symbol.asyncIterator]();
      try {
        while (!clientDisconnected && !res.writableEnded) {
          const nextChunk = await asyncIter.next();
          if (nextChunk.done || clientDisconnected || res.writableEnded) break;
          const c = nextChunk.value as GenerateContentResponse;
          const chunkText = c.text ?? '';
          if (chunkText && !clientDisconnected && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
          }
        }
      } finally {
        if (clientDisconnected && typeof asyncIter.return === 'function') {
          try {
            await asyncIter.return(undefined);
          } catch {
            // Ignore stream cancel errors
          }
        }
      }

      if (!clientDisconnected && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (err: unknown) {
      if (clientDisconnected || res.writableEnded) return;
      const formatted = formatGeminiErrorMessage(err);
      if (!res.headersSent) {
        res.status(formatted.status).json({ error: formatted.message });
      } else {
        res.write(
          `data: ${JSON.stringify({ error: formatted.message, done: true })}\n\n`
        );
        res.end();
      }
    } finally {
      req.off('close', markDisconnected);
      res.off('close', markDisconnected);
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`TavernSmith local server listening on http://${HOST}:${PORT}`);
  });
}

startServer();
