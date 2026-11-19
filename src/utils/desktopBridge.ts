import { AppVaultStateResponse, DiskStateResponse } from '../types';

interface TauriCoreApi {
  invoke: <T = unknown>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriWindowGlobal extends Window {
  __TAURI__?: {
    core?: TauriCoreApi;
  };
}

function getTauriInvoke(): TauriCoreApi['invoke'] | null {
  if (typeof window === 'undefined') return null;
  const tauri = (window as TauriWindowGlobal).__TAURI__;
  if (tauri?.core && typeof tauri.core.invoke === 'function') {
    return tauri.core.invoke;
  }
  return null;
}

/**
 * Returns true when running inside the native Tauri v2 desktop wrapper
 * (Windows portable .exe, macOS .dmg/.app, Linux .AppImage).
 */
export function isTauriDesktop(): boolean {
  return getTauriInvoke() !== null;
}

/**
 * Scans the active Saves folder (via Tauri IPC on desktop or `/api/disk/state` in web/dev mode).
 */
export async function fetchDiskState(): Promise<DiskStateResponse | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke<DiskStateResponse>('get_disk_state');
    } catch {
      return null;
    }
  }

  if (typeof fetch !== 'function') return null;
  const res = await fetch('/api/disk/state', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as DiskStateResponse;
}

/**
 * Persists characters, lorebooks, themes, tags, and meta JSON to disk.
 */
export async function saveDiskState(
  payload: Record<string, unknown>
): Promise<DiskStateResponse> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<DiskStateResponse>('save_disk_state', { body: payload });
  }

  const res = await fetch('/api/disk/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as DiskStateResponse;
}

/**
 * Physically deletes a `.json` file inside the active Saves folder and returns the refreshed scan.
 */
export async function deleteDiskFile(
  payload: Record<string, unknown>
): Promise<DiskStateResponse | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    return await invoke<DiskStateResponse>('delete_disk_file', { body: payload });
  }

  const res = await fetch('/api/disk/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return null;
  return (await res.json()) as DiskStateResponse;
}

/**
 * Reads the app-private encrypted API key vault state (`.tavernsmith-app/`).
 */
export async function fetchAppVaultState(): Promise<AppVaultStateResponse | null> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke<AppVaultStateResponse>('get_app_vault');
    } catch {
      return null;
    }
  }

  if (typeof fetch !== 'function') return null;
  const res = await fetch('/api/vault', { cache: 'no-store' });
  if (!res.ok) return null;
  return (await res.json()) as AppVaultStateResponse;
}

/**
 * Persists the encrypted API key vault envelope to `.tavernsmith-app/credentials.vault.enc`.
 */
export async function saveAppVaultState(payload: {
  vault: unknown;
  removeLegacy?: boolean;
}): Promise<{ ok: boolean; storagePath?: string; saved?: boolean }> {
  const invoke = getTauriInvoke();
  if (invoke) {
    try {
      return await invoke<{ ok: boolean; storagePath?: string; saved?: boolean }>(
        'save_app_vault',
        { body: payload }
      );
    } catch {
      return { ok: false };
    }
  }

  if (typeof fetch !== 'function') return { ok: false };
  try {
    const res = await fetch('/api/vault', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as {
      ok: boolean;
      storagePath?: string;
      saved?: boolean;
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Opens the active TavernSmith Saves directory in the native OS file manager
 * (Windows Explorer, macOS Finder, or Linux xdg-open). Desktop-only.
 */
export async function openDesktopSavesFolder(): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  const invoke = getTauriInvoke();
  if (!invoke) {
    return {
      ok: false,
      error: 'Opening folders directly requires the TavernSmith desktop app.',
    };
  }
  try {
    const openedPath = await invoke<string>('open_saves_folder');
    return { ok: true, path: openedPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    let chunk = '';
    for (let j = 0; j < slice.length; j++) {
      chunk += String.fromCharCode(slice[j]);
    }
    parts.push(chunk);
  }
  return btoa(parts.join(''));
}

/**
 * Opens a native OS Save dialog in Tauri desktop mode and writes the exported Blob to disk.
 * Returns `'unavailable'` when not running inside Tauri so browser `<a download>` takes over.
 */
export async function saveDesktopExportFile(
  blob: Blob,
  filename: string
): Promise<'saved' | 'cancelled' | 'unavailable'> {
  const invoke = getTauriInvoke();
  if (!invoke) return 'unavailable';

  try {
    const buffer = await blob.arrayBuffer();
    const base64Data = uint8ArrayToBase64(new Uint8Array(buffer));
    const lower = filename.toLowerCase();
    const isPng = lower.endsWith('.png');
    const isJson = lower.endsWith('.json');
    const filterName = isPng
      ? 'PNG Character Card'
      : isJson
        ? 'JSON File'
        : 'All Files';
    const extensions = isPng ? ['png'] : isJson ? ['json'] : [];

    const result = await invoke<{ saved: boolean; cancelled?: boolean }>(
      'save_export_file',
      {
        defaultName: filename,
        base64Data,
        filterName,
        extensions,
      }
    );

    if (result?.saved) return 'saved';
    if (result?.cancelled) return 'cancelled';
    return 'unavailable';
  } catch {
    return 'unavailable';
  }
}

interface NativeHttpResponsePayload {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function normalizeHeadersToRecord(
  headers?: HeadersInit
): Record<string, string> {
  const result: Record<string, string> = {};
  if (!headers) return result;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key) result[key] = value;
    }
    return result;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      result[key] = value;
    }
  }
  return result;
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('The operation was aborted.', 'AbortError');
  }
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

/**
 * Drop-in `fetch` wrapper for AI backend requests.
 * Inside Tauri desktop mode, routes `http://` and `https://` requests through the
 * native Rust HTTP client (`http_fetch`) so local servers (Ollama on Windows, LM Studio,
 * KoboldCPP, LAN hosts) and cloud APIs never fail due to WebView `Origin` / CORS rejections.
 * In web/dev mode (or for relative `/api/...` paths), delegates directly to browser `fetch`.
 */
export async function desktopFetch(
  url: string,
  init?: RequestInit
): Promise<Response> {
  const invoke = getTauriInvoke();
  const isAbsoluteHttp = /^https?:\/\//i.test(url);

  if (!invoke || !isAbsoluteHttp) {
    return fetch(url, init);
  }

  const signal = init?.signal;
  if (signal?.aborted) {
    throw createAbortError();
  }

  const method = (init?.method || 'GET').toUpperCase();
  const headers = normalizeHeadersToRecord(init?.headers);
  const body =
    typeof init?.body === 'string'
      ? init.body
      : init?.body != null
        ? String(init.body)
        : undefined;

  const invokePromise = invoke<NativeHttpResponsePayload>('http_fetch', {
    request: {
      url,
      method,
      headers,
      body,
    },
  });

  let nativeRes: NativeHttpResponsePayload;
  if (signal) {
    let onAbort: (() => void) | null = null;
    const abortPromise = new Promise<never>((_, reject) => {
      onAbort = () => reject(createAbortError());
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      nativeRes = await Promise.race([invokePromise, abortPromise]);
    } finally {
      if (onAbort) {
        signal.removeEventListener('abort', onAbort);
      }
    }
  } else {
    nativeRes = await invokePromise;
  }

  const status =
    typeof nativeRes.status === 'number' &&
    nativeRes.status >= 200 &&
    nativeRes.status <= 599
      ? nativeRes.status
      : 502;
  const responseHeaders = new Headers();
  if (nativeRes.headers && typeof nativeRes.headers === 'object') {
    for (const [k, v] of Object.entries(nativeRes.headers)) {
      if (typeof v === 'string') {
        try {
          responseHeaders.append(k, v);
        } catch {
          // Skip invalid header names/values
        }
      }
    }
  }

  const isNullBodyStatus =
    status === 204 || status === 205 || status === 304;
  return new Response(isNullBodyStatus ? null : nativeRes.body ?? '', {
    status,
    headers: responseHeaders,
  });
}

