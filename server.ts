import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const META_FILENAME = '_tavernsmith_meta.json';
const VAULT_FILENAME = '_tavernsmith_vault.enc';

function sanitizeDiskFileName(raw: string): string {
  const base = path.basename(String(raw || 'untitled')).replace(/\.json$/i, '');
  const clean =
    base
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled';
  return `${clean}.json`;
}

function resolveSavesRoot(customSavePath?: string): {
  diskRoot: string;
  resolvedPath: string;
  charsDir: string;
  loreDir: string;
  themesDir: string;
  tagsDir: string;
} {
  const trimmed = (customSavePath || '').trim();
  const useCustom =
    trimmed &&
    trimmed !== './Saves' &&
    trimmed !== './Saves/' &&
    trimmed !== '/Saves/';
  const resolvedPath = useCustom
    ? path.resolve(process.cwd(), trimmed)
    : path.resolve(process.cwd(), 'Saves');
  const diskRoot = useCustom ? trimmed : './Saves/';
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

function scanSavesDirectoryOnDisk(customSavePath?: string) {
  const { diskRoot, resolvedPath, charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot(customSavePath);

  const characters: Record<string, unknown>[] = [];
  const lorebooks: Record<string, unknown>[] = [];
  const themes: Record<string, unknown>[] = [];
  const tags: Record<string, unknown>[] = [];
  let meta: Record<string, unknown> | null = null;
  let vault: Record<string, unknown> | null = null;
  const files: Array<{
    id: string;
    folderPath: string;
    fileName: string;
    kind: 'character' | 'lorebook' | 'theme' | 'tag' | 'meta' | 'vault';
    sizeBytes: number;
    updatedAt: string;
    content: string;
  }> = [];

  // 1. Read all .json files inside ./Saves/Characters/ strictly as characters[]
  if (fs.existsSync(charsDir)) {
    const charEntries = fs
      .readdirSync(charsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of charEntries) {
      const fullPath = path.join(charsDir, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed._tavernsmithType === 'lorebook') {
          continue;
        }
        characters.push({
          ...parsed,
          _diskFileName: entry.name,
          _diskUpdatedAt: stat.mtime.toISOString(),
        });
        files.push({
          id: `Characters/${entry.name}`,
          folderPath: 'Characters/',
          fileName: entry.name,
          kind: 'character',
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          content,
        });
      } catch {
        // Ignore unreadable or corrupted JSON file
      }
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
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed._tavernsmithType === 'character') {
          continue;
        }
        lorebooks.push({
          ...parsed,
          _tavernsmithType: 'lorebook',
          _diskFileName: entry.name,
          _diskUpdatedAt: stat.mtime.toISOString(),
        });
        files.push({
          id: `Lorebooks/${entry.name}`,
          folderPath: 'Lorebooks/',
          fileName: entry.name,
          kind: 'lorebook',
          sizeBytes: stat.size,
          updatedAt: stat.mtime.toISOString(),
          content,
        });
      } catch {
        // Ignore unreadable or corrupted JSON file
      }
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
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          themes.push({
            ...parsed,
            _tavernsmithType: 'theme',
            _diskFileName: entry.name,
            _diskUpdatedAt: stat.mtime.toISOString(),
          });
          files.push({
            id: `Themes/${entry.name}`,
            folderPath: 'Themes/',
            fileName: entry.name,
            kind: 'theme',
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
            content,
          });
        }
      } catch {
        // Ignore unreadable or corrupted JSON file
      }
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
      try {
        const stat = fs.statSync(fullPath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const parsed = JSON.parse(content) as Record<string, unknown>;
        if (parsed && typeof parsed === 'object') {
          tags.push({
            ...parsed,
            _tavernsmithType: 'tag',
            _diskFileName: entry.name,
            _diskUpdatedAt: stat.mtime.toISOString(),
          });
          files.push({
            id: `Tags/${entry.name}`,
            folderPath: 'Tags/',
            fileName: entry.name,
            kind: 'tag',
            sizeBytes: stat.size,
            updatedAt: stat.mtime.toISOString(),
            content,
          });
        }
      } catch {
        // Ignore unreadable or corrupted JSON file
      }
    }
  }

  // 5. Read ./Saves/_tavernsmith_meta.json
  const metaPath = path.join(resolvedPath, META_FILENAME);
  if (fs.existsSync(metaPath)) {
    try {
      const stat = fs.statSync(metaPath);
      const content = fs.readFileSync(metaPath, 'utf8');
      meta = JSON.parse(content) as Record<string, unknown>;
      files.push({
        id: `/${META_FILENAME}`,
        folderPath: '/',
        fileName: META_FILENAME,
        kind: 'meta',
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        content,
      });
    } catch {
      // Ignore malformed meta
    }
  }

  // 6. Read ./Saves/_tavernsmith_vault.enc
  const vaultPath = path.join(resolvedPath, VAULT_FILENAME);
  if (fs.existsSync(vaultPath)) {
    try {
      const stat = fs.statSync(vaultPath);
      const content = fs.readFileSync(vaultPath, 'utf8');
      vault = JSON.parse(content) as Record<string, unknown>;
      files.push({
        id: `/${VAULT_FILENAME}`,
        folderPath: '/',
        fileName: VAULT_FILENAME,
        kind: 'vault',
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        content,
      });
    } catch {
      // Ignore malformed vault
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

function saveToSavesDirectoryOnDisk(body: Record<string, unknown>) {
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

    try {
      const existingCharFiles = fs.readdirSync(charsDir);
      for (const fileName of existingCharFiles) {
        if (!fileName.toLowerCase().endsWith('.json')) continue;
        if (!writtenCharFiles.has(fileName.toLowerCase())) {
          const orphanPath = path.join(charsDir, fileName);
          if (fs.existsSync(orphanPath)) {
            fs.unlinkSync(orphanPath);
          }
        }
      }
    } catch {
      // Ignore directory prune errors
    }
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

    try {
      const existingLoreFiles = fs.readdirSync(loreDir);
      for (const fileName of existingLoreFiles) {
        if (!fileName.toLowerCase().endsWith('.json')) continue;
        if (!writtenBookFiles.has(fileName.toLowerCase())) {
          const orphanPath = path.join(loreDir, fileName);
          if (fs.existsSync(orphanPath)) {
            fs.unlinkSync(orphanPath);
          }
        }
      }
    } catch {
      // Ignore directory prune errors
    }
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

    try {
      const existingThemeFiles = fs.readdirSync(themesDir);
      for (const fileName of existingThemeFiles) {
        if (!fileName.toLowerCase().endsWith('.json')) continue;
        if (!writtenThemeFiles.has(fileName.toLowerCase())) {
          const orphanPath = path.join(themesDir, fileName);
          if (fs.existsSync(orphanPath)) {
            fs.unlinkSync(orphanPath);
          }
        }
      }
    } catch {
      // Ignore directory prune errors
    }
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

    try {
      const existingTagFiles = fs.readdirSync(tagsDir);
      for (const fileName of existingTagFiles) {
        if (!fileName.toLowerCase().endsWith('.json')) continue;
        if (!writtenTagFiles.has(fileName.toLowerCase())) {
          const orphanPath = path.join(tagsDir, fileName);
          if (fs.existsSync(orphanPath)) {
            fs.unlinkSync(orphanPath);
          }
        }
      }
    } catch {
      // Ignore directory prune errors
    }
  }

  // 5. Write workspace settings & active IDs into ./Saves/_tavernsmith_meta.json
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

  return scanSavesDirectoryOnDisk(customSavePath);
}

function deleteFromSavesDirectoryOnDisk(body: Record<string, unknown>) {
  const customSavePath =
    typeof body.customSavePath === 'string'
      ? body.customSavePath
      : typeof body.savesDir === 'string'
        ? body.savesDir
        : undefined;
  const { charsDir, loreDir, themesDir, tagsDir } =
    resolveSavesRoot(customSavePath);

  const rawFolder = String(body.folder || body.kind || '').toLowerCase();
  const targetDir =
    rawFolder === 'lorebooks' || rawFolder === 'lorebook'
      ? loreDir
      : rawFolder === 'themes' || rawFolder === 'theme'
        ? themesDir
        : rawFolder === 'tags' || rawFolder === 'tag'
          ? tagsDir
          : charsDir;

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

  let deletedAny = false;
  for (const name of candidateNames) {
    const targetPath = path.join(targetDir, name);
    if (fs.existsSync(targetPath)) {
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

const SUPPORTED_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-4-argon',
  'gemini-4-carbon',
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
  'gemma-4-31b-it',
  'gemma-4-26b-a4b-it',
];

function extractCustomApiKey(req: express.Request): string {
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
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
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Normalizes requested Gemini model names, defaulting only when empty
 * so any pulled model selected by the user passes through cleanly.
 */
function resolveServerGeminiModel(rawModel?: string): string {
  const clean = (rawModel || '').trim().replace(/^models\//i, '');
  return clean || 'gemini-3.8-flash';
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
        'Gemini API authentication error. Verify your custom Gemini API key or check GEMINI_API_KEY in Settings > Secrets.',
    };
  }

  if (statusMatch === 429) {
    return {
      status: 429,
      message:
        'Gemini API quota exceeded (429 RESOURCE_EXHAUSTED). Enter your own Gemini API key in Options or select a billing-enabled key in Settings > Secrets.',
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

  // Ensure ./Saves/, Characters/, Lorebooks/, Themes/, and Tags/ exist on server startup
  resolveSavesRoot();

  app.use(express.json({ limit: '50mb' }));

  // GET /api/disk/state — Auto-scan ./Saves/Characters/, Lorebooks/, Themes/, Tags/, _tavernsmith_meta.json, _tavernsmith_vault.enc
  app.get('/api/disk/state', (req, res) => {
    try {
      const customSavePath =
        typeof req.query.customSavePath === 'string'
          ? req.query.customSavePath
          : typeof req.query.savesDir === 'string'
            ? req.query.savesDir
            : undefined;
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.json(scanSavesDirectoryOnDisk(customSavePath));
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

  // GET /api/gemini/models — Pulls all available models from Google Generative Language API merged with priority catalog
  app.get('/api/gemini/models', async (req, res) => {
    try {
      const customKey = extractCustomApiKey(req);
      const effectiveKey =
        (customKey && customKey.trim()) || process.env.GEMINI_API_KEY || '';
      if (!effectiveKey) {
        res.status(403).json({
          error:
            'No Gemini API key provided and server GEMINI_API_KEY is not configured.',
          models: SUPPORTED_GEMINI_MODELS,
        });
        return;
      }

      const scannedIds: string[] = [];
      let pageToken = '';
      let pageCount = 0;

      try {
        do {
          const pageParam = pageToken
            ? `&pageToken=${encodeURIComponent(pageToken)}`
            : '';
          const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageParam}&key=${encodeURIComponent(effectiveKey)}`;
          const apiRes = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (!apiRes.ok) break;
          const apiData = (await apiRes.json().catch(() => ({}))) as {
            models?: Array<{ name?: string; id?: string }>;
            nextPageToken?: string;
          };
          if (Array.isArray(apiData?.models)) {
            for (const m of apiData.models) {
              const id = (m.name || m.id || '').replace(/^models\//i, '').trim();
              if (id) scannedIds.push(id);
            }
          }
          pageToken =
            typeof apiData?.nextPageToken === 'string'
              ? apiData.nextPageToken.trim()
              : '';
          pageCount += 1;
        } while (pageToken && pageCount < 50);
      } catch {
        // Fall back cleanly to priority catalog if live list fetch is unreachable
      }

      const mergedModels = Array.from(
        new Set([...SUPPORTED_GEMINI_MODELS, ...scannedIds])
      );

      res.json({
        models: mergedModels,
        defaultModel: 'gemini-3.8-flash',
      });
    } catch (err: unknown) {
      const formatted = formatGeminiErrorMessage(err);
      res.status(formatted.status).json({
        error: formatted.message,
        models: SUPPORTED_GEMINI_MODELS,
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

      const config: Record<string, unknown> = {};
      if (systemInstruction && typeof systemInstruction === 'string') {
        config.systemInstruction = systemInstruction;
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
                { text: prompt },
                ...resolvedInlineDataList.map((img) => ({
                  inlineData: {
                    mimeType: img.mimeType,
                    data: img.data,
                  },
                })),
              ],
            }
          : prompt;

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

      const streamResponse = await ai.models.generateContentStream({
        model,
        contents: prompt,
        config:
          systemInstruction && typeof systemInstruction === 'string'
            ? { systemInstruction }
            : undefined,
      });

      for await (const chunk of streamResponse) {
        const c = chunk as GenerateContentResponse;
        const chunkText = c.text ?? '';
        if (chunkText) {
          res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
        }
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const formatted = formatGeminiErrorMessage(err);
      if (!res.headersSent) {
        res.status(formatted.status).json({ error: formatted.message });
      } else {
        res.write(
          `data: ${JSON.stringify({ error: formatted.message, done: true })}\n\n`
        );
        res.end();
      }
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TavernSmith server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
