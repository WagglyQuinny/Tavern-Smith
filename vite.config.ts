import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

const META_FILENAME = '_tavernsmith_meta.json';
const VAULT_FILENAME = '_tavernsmith_vault.enc';

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

function isPathInsideWorkspace(rootDir: string, candidatePath: string): boolean {
  const rel = path.relative(rootDir, candidatePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function hasWorkspaceConfinedAncestor(
  rootDir: string,
  candidatePath: string
): boolean {
  let probe = candidatePath;
  while (!fs.existsSync(probe)) {
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  try {
    const realAncestor = fs.existsSync(probe) ? fs.realpathSync(probe) : probe;
    const rel = path.relative(rootDir, realAncestor);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  } catch {
    return false;
  }
}

function resolveSavesRoot(customSavePath?: string): {
  diskRoot: string;
  resolvedPath: string;
  charsDir: string;
  loreDir: string;
  themesDir: string;
  tagsDir: string;
} {
  const workspaceRoot = getCanonicalWorkspaceRoot();
  const defaultPath = path.join(workspaceRoot, 'Saves');
  const trimmed = (customSavePath || '').trim();
  const useCustom =
    trimmed &&
    trimmed !== './Saves' &&
    trimmed !== './Saves/' &&
    trimmed !== '/Saves/';

  let resolvedPath = defaultPath;
  let diskRoot = './Saves/';

  if (useCustom) {
    const candidate = path.resolve(workspaceRoot, trimmed);
    if (
      isPathInsideWorkspace(workspaceRoot, candidate) &&
      hasWorkspaceConfinedAncestor(workspaceRoot, candidate)
    ) {
      resolvedPath = candidate;
      const normalizedRel = path
        .relative(workspaceRoot, candidate)
        .replace(/\\/g, '/')
        .replace(/\/+$/, '');
      diskRoot = `./${normalizedRel}/`;
    }
  }

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

export function scanSavesDirectoryOnDisk(customSavePath?: string) {
  const { diskRoot, resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot(customSavePath);

  const characters: Record<string, unknown>[] = [];
  const lorebooks: Record<string, unknown>[] = [];
  const themes: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  let meta: Record<string, unknown> | null = null;
  let vault: Record<string, unknown> | null = null;
  const files: DiskScannedFileEntry[] = [];

  // 1. Read all .json files inside ./Saves/Characters/ strictly as characters[]
  if (fs.existsSync(charsDir)) {
    const charEntries = fs
      .readdirSync(charsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of charEntries) {
      const fullPath = path.join(charsDir, entry.name);
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
  if (fs.existsSync(metaPath)) {
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

  // 6. Read ./Saves/_tavernsmith_vault.enc
  const vaultPath = path.join(resolvedPath, VAULT_FILENAME);
  if (fs.existsSync(vaultPath)) {
    const inspected = inspectDiskJsonFile(vaultPath);
    if (!inspected.ok) {
      files.push({
        id: `/${VAULT_FILENAME}`,
        folderPath: '/',
        fileName: VAULT_FILENAME,
        kind: 'vault',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
        isCorrupted: true,
        corruptReason: inspected.reason,
      });
    } else {
      vault = inspected.parsed;
      files.push({
        id: `/${VAULT_FILENAME}`,
        folderPath: '/',
        fileName: VAULT_FILENAME,
        kind: 'vault',
        sizeBytes: inspected.sizeBytes,
        updatedAt: inspected.updatedAt,
        content: inspected.content,
      });
    }
  }

  return {
    ok: true,
    diskRoot,
    resolvedPath,
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
        if (fs.existsSync(orphanPath)) {
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
  const customSavePath =
    typeof body.customSavePath === 'string'
      ? body.customSavePath
      : typeof body.savesDir === 'string'
        ? body.savesDir
        : undefined;
  const { resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot(customSavePath);

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

  // 6. Write AES-256-GCM encrypted API keys into ./Saves/_tavernsmith_vault.enc
  if (body.vault && typeof body.vault === 'object') {
    fs.writeFileSync(
      path.join(resolvedPath, VAULT_FILENAME),
      JSON.stringify(body.vault, null, 2),
      'utf8'
    );
  }

  // Immediately re-scan the disk and return the fresh disk state
  return scanSavesDirectoryOnDisk(customSavePath);
}

export function deleteFromSavesDirectoryOnDisk(body: Record<string, unknown>) {
  const customSavePath =
    typeof body.customSavePath === 'string'
      ? body.customSavePath
      : typeof body.savesDir === 'string'
        ? body.savesDir
        : undefined;
  const { resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot(customSavePath);

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

  if (rawFolder === 'root' || rawFolder === 'meta' || rawFolder === 'vault') {
    const allowedRootFiles = new Set([META_FILENAME, VAULT_FILENAME]);
    for (const name of candidateNames) {
      if (!allowedRootFiles.has(name)) continue;
      const targetPath = path.join(resolvedPath, name);
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {
          // Ignore if already removed
        }
      }
    }
    return scanSavesDirectoryOnDisk(customSavePath);
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
    const targetPath = path.join(targetDir, name);
    const rel = path.relative(targetDir, targetPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) continue;
    if (fs.existsSync(targetPath)) {
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
    if (fs.existsSync(sanitizedTarget)) {
      try {
        fs.unlinkSync(sanitizedTarget);
      } catch {
        // Ignore if already removed
      }
    }
  }

  return scanSavesDirectoryOnDisk(customSavePath);
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
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
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

function tavernSmithDiskApiPlugin(): Plugin {
  // Ensure ./Saves/, ./Saves/Characters/, and ./Saves/Lorebooks/ exist on startup
  resolveSavesRoot();

  return {
    name: 'tavernsmith-local-disk-api',
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const rawUrl = req.url || '';
          const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
          const pathname = parsedUrl.pathname;

          if (!pathname.startsWith('/api/disk/')) {
            next();
            return;
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

          try {
            if (req.method === 'GET' && pathname === '/api/disk/state') {
              const customPath =
                parsedUrl.searchParams.get('customSavePath') || undefined;
              const state = scanSavesDirectoryOnDisk(customPath);
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
                error:
                  err instanceof Error ? err.message : 'Disk API failure',
              })
            );
          }
        }
      );
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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
