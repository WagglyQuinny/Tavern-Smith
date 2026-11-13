import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';

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

  fs.mkdirSync(resolvedPath, { recursive: true });
  fs.mkdirSync(charsDir, { recursive: true });
  fs.mkdirSync(loreDir, { recursive: true });

  return { diskRoot, resolvedPath, charsDir, loreDir };
}

export function scanSavesDirectoryOnDisk(customSavePath?: string) {
  const { diskRoot, resolvedPath, charsDir, loreDir } =
    resolveSavesRoot(customSavePath);

  const characters: Record<string, unknown>[] = [];
  const lorebooks: Record<string, unknown>[] = [];
  let meta: Record<string, unknown> | null = null;
  let vault: Record<string, unknown> | null = null;
  const files: Array<{
    id: string;
    folderPath: string;
    fileName: string;
    kind: 'character' | 'lorebook' | 'meta' | 'vault';
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

  // 3. Read ./Saves/_tavernsmith_meta.json
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

  // 4. Read ./Saves/_tavernsmith_vault.enc
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
    meta,
    vault,
    files,
    updatedAt: new Date().toISOString(),
  };
}

export function saveToSavesDirectoryOnDisk(body: Record<string, unknown>) {
  const customSavePath =
    typeof body.customSavePath === 'string' ? body.customSavePath : undefined;
  const { resolvedPath, charsDir, loreDir } = resolveSavesRoot(customSavePath);

  // 1. Write characters strictly into ./Saves/Characters/[SanitizedName].json
  if (Array.isArray(body.characters)) {
    for (const item of body.characters) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        oldFileName?: string;
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
      const targetFileName = sanitizeDiskFileName(rawName);

      if (entry.oldFileName) {
        const cleanOld = sanitizeDiskFileName(entry.oldFileName);
        if (cleanOld !== targetFileName) {
          const oldPath = path.join(charsDir, cleanOld);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // Ignore unlink error
            }
          }
        }
      }

      const outPayload = {
        ...payload,
        _tavernsmithType: 'character',
      };
      fs.writeFileSync(
        path.join(charsDir, targetFileName),
        JSON.stringify(outPayload, null, 2),
        'utf8'
      );
    }
  }

  // 2. Write lorebooks strictly into ./Saves/Lorebooks/[SanitizedName].json
  if (Array.isArray(body.lorebooks)) {
    for (const item of body.lorebooks) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as {
        fileName?: string;
        oldFileName?: string;
        payload?: Record<string, unknown>;
      };
      const payload = entry.payload || (item as Record<string, unknown>);
      if (payload._tavernsmithType === 'character') {
        continue; // NEVER write a Character into ./Saves/Lorebooks/
      }
      const rawName =
        entry.fileName ||
        (typeof payload.name === 'string' ? payload.name : 'untitled_lorebook');
      const targetFileName = sanitizeDiskFileName(rawName);

      if (entry.oldFileName) {
        const cleanOld = sanitizeDiskFileName(entry.oldFileName);
        if (cleanOld !== targetFileName) {
          const oldPath = path.join(loreDir, cleanOld);
          if (fs.existsSync(oldPath)) {
            try {
              fs.unlinkSync(oldPath);
            } catch {
              // Ignore unlink error
            }
          }
        }
      }

      const outPayload = {
        ...payload,
        _tavernsmithType: 'lorebook',
      };
      fs.writeFileSync(
        path.join(loreDir, targetFileName),
        JSON.stringify(outPayload, null, 2),
        'utf8'
      );
    }
  }

  // 3. Write custom tags, themes, and app settings into ./Saves/_tavernsmith_meta.json
  if (body.meta && typeof body.meta === 'object') {
    fs.writeFileSync(
      path.join(resolvedPath, META_FILENAME),
      JSON.stringify(body.meta, null, 2),
      'utf8'
    );
  }

  // 4. Write AES-256-GCM encrypted API keys into ./Saves/_tavernsmith_vault.enc
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
    typeof body.customSavePath === 'string' ? body.customSavePath : undefined;
  const { charsDir, loreDir } = resolveSavesRoot(customSavePath);

  const rawFolder = String(body.folder || body.kind || '').toLowerCase();
  const rawFileName = String(body.fileName || '');
  if (rawFileName) {
    const safeName = path.basename(rawFileName);
    const targetDir =
      rawFolder === 'lorebooks' || rawFolder === 'lorebook'
        ? loreDir
        : charsDir;
    const targetPath = path.join(targetDir, safeName);
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
    req.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
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
            res.statusCode = 500;
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
