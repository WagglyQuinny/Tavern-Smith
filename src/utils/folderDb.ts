/**
 * IndexedDB Persistence Layer for Local PC `FileSystemDirectoryHandle`
 * Allows TavernSmith to remember the user's selected local Save Folder across browser restarts
 * and perform Two-Way Live Directory Sync on launch.
 */

const DB_NAME = 'tavernsmith_fs_db';
const DB_VERSION = 1;
const STORE_NAME = 'directory_handles';
const ACTIVE_HANDLE_KEY = 'active_save_folder_handle';

export interface StoredDirectoryRecord {
  handle: any;
  folderName: string;
  folderPath: string;
  savedAt: string;
}

function openFolderDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB is not available in this browser environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error('Failed to open IndexedDB.'));
  });
}

/**
 * Saves the selected `FileSystemDirectoryHandle` to IndexedDB so it persists across reloads.
 */
export async function saveDirectoryHandleToIndexedDB(
  dirHandle: any,
  folderPath: string
): Promise<void> {
  try {
    const db = await openFolderDatabase();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record: StoredDirectoryRecord = {
        handle: dirHandle,
        folderName: dirHandle?.name || 'SaveFolder',
        folderPath,
        savedAt: new Date().toISOString(),
      };
      store.put(record, ACTIVE_HANDLE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error('Failed to store directory handle.'));
      };
    });
  } catch {
    // Gracefully ignore if browser restricts storing handles in private/iframe mode
  }
}

/**
 * Loads the previously saved `FileSystemDirectoryHandle` from IndexedDB on app launch.
 */
export async function loadDirectoryHandleFromIndexedDB(): Promise<StoredDirectoryRecord | null> {
  try {
    const db = await openFolderDatabase();
    return await new Promise<StoredDirectoryRecord | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_HANDLE_KEY);

      req.onsuccess = () => {
        db.close();
        const result = req.result as StoredDirectoryRecord | undefined;
        if (result && result.handle) {
          resolve(result);
        } else {
          resolve(null);
        }
      };

      req.onerror = () => {
        db.close();
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Clears the stored `FileSystemDirectoryHandle` from IndexedDB when resetting workspace defaults.
 */
export async function clearDirectoryHandleFromIndexedDB(): Promise<void> {
  try {
    const db = await openFolderDatabase();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(ACTIVE_HANDLE_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    });
  } catch {
    // Ignore
  }
}

/**
 * Queries current read/write permission state on a `FileSystemDirectoryHandle` without triggering a prompt.
 */
export async function queryDirectoryHandlePermission(
  dirHandle: any,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!dirHandle) return 'denied';
  try {
    if (typeof dirHandle.queryPermission === 'function') {
      const status = await dirHandle.queryPermission({ mode });
      return status || 'prompt';
    }
    return 'granted';
  } catch {
    return 'prompt';
  }
}

/**
 * Requests read/write permission on a stored `FileSystemDirectoryHandle` (must be called from a user click gesture).
 */
export async function requestDirectoryHandlePermission(
  dirHandle: any,
  mode: 'read' | 'readwrite' = 'readwrite'
): Promise<'granted' | 'prompt' | 'denied'> {
  if (!dirHandle) return 'denied';
  try {
    if (typeof dirHandle.requestPermission === 'function') {
      const status = await dirHandle.requestPermission({ mode });
      return status || 'denied';
    }
    return 'granted';
  } catch {
    return 'denied';
  }
}
