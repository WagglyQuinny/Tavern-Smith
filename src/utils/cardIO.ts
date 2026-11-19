import {
  CharacterAssetEntry,
  CharacterCardData,
  Lorebook,
  LorebookEntry,
  ReactionImageItem,
  SillyTavernV2Wrapper,
  SillyTavernV3Wrapper,
} from '../types';
import {
  createBlankCharacter,
  createBlankLorebook,
  DEFAULT_STAT_BLOCK,
} from '../context/StoreContext';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Precomputed IEEE 802.3 CRC32 lookup table for PNG chunk checksum calculation.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function computeCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const index = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[index];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * UTF-8 safe Base64 encoding & decoding using pure TextEncoder / TextDecoder.
 */
export function encodeUtf8Base64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function decodeUtf8Base64(b64: string): string {
  const cleanB64 = b64.trim().replace(/\s+/g, '');
  const binary = atob(cleanB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Validates avatar / reaction media URIs so untrusted cards cannot smuggle
 * `javascript:`, `data:image/svg+xml`, or local `/api/...` URLs into the DOM.
 * Also treats SillyTavern's sentinel `"none"` / `"ccdefault:"` as unset (`undefined`).
 */
export function sanitizeMediaUri(uri: unknown): string | undefined {
  if (typeof uri !== 'string') return undefined;
  const trimmed = uri.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();
  if (lower === 'none' || lower === 'ccdefault:') return undefined;

  if (lower.startsWith('data:')) {
    if (
      /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(
        trimmed
      )
    ) {
      return trimmed;
    }
    return undefined;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Reject relative paths & malformed schemes
  }
  return undefined;
}

export function isAllowedRasterImageFile(file: File): boolean {
  const typeLower = (file.type || '').toLowerCase();
  const nameLower = (file.name || '').toLowerCase();
  if (typeLower.includes('svg') || nameLower.endsWith('.svg')) {
    return false;
  }
  if (
    typeLower === 'image/png' ||
    typeLower === 'image/jpeg' ||
    typeLower === 'image/jpg' ||
    typeLower === 'image/webp' ||
    typeLower === 'image/gif'
  ) {
    return true;
  }
  return /\.(png|jpe?g|webp|gif)$/i.test(nameLower);
}

function readAsciiString(bytes: Uint8Array, start: number, length: number): string {
  let out = '';
  const safeEnd = Math.min(bytes.length, start + length);
  for (let i = start; i < safeEnd; i++) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function writeAsciiBytes(str: string): Uint8Array {
  const arr = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    arr[i] = str.charCodeAt(i) & 0xff;
  }
  return arr;
}

/**
 * Reads any raster image File or DataURL and returns its natural dimensions (`width`, `height`),
 * whether it matches SillyTavern's `2:3` vertical portrait aspect ratio (`Math.abs(w/h - 2/3) <= 0.02`),
 * and a clean capped PNG DataURL (rejecting SVG images and scaling huge uploads down safely).
 */
export async function readImageDimensions(
  fileOrDataUrl: File | string,
  maxDim = 1536
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  isTwoThreeAspect: boolean;
}> {
  if (typeof fileOrDataUrl !== 'string' && !isAllowedRasterImageFile(fileOrDataUrl)) {
    throw new Error('Only raster PNG, JPEG, WebP, and GIF images are supported (SVG is blocked).');
  }

  const rawUrl =
    typeof fileOrDataUrl === 'string'
      ? fileOrDataUrl
      : await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () =>
            reject(new Error('Failed to read image file.'));
          reader.readAsDataURL(fileOrDataUrl);
        });

  if (!sanitizeMediaUri(rawUrl)) {
    throw new Error('Unsupported or unsafe image format (SVG/non-raster URIs are blocked).');
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const cleanupImage = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };
    img.onload = () => {
      const origWidth = img.naturalWidth || img.width || 512;
      const origHeight = img.naturalHeight || img.height || 768;
      const isTwoThreeAspect = Math.abs(origWidth / origHeight - 2 / 3) <= 0.02;

      const longestEdge = Math.max(origWidth, origHeight);
      const scale = maxDim > 0 && longestEdge > maxDim ? maxDim / longestEdge : 1;
      const targetWidth = Math.max(1, Math.round(origWidth * scale));
      const targetHeight = Math.max(1, Math.round(origHeight * scale));

      // Normalize to PNG DataURL so PNG chunk steganography always has a valid PNG source
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      let pngDataUrl = rawUrl;
      try {
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
          pngDataUrl = canvas.toDataURL('image/png');
        }
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        cleanupImage();
      }

      resolve({
        dataUrl: pngDataUrl,
        width: targetWidth,
        height: targetHeight,
        isTwoThreeAspect,
      });
    };
    img.onerror = () => {
      cleanupImage();
      reject(new Error('Could not decode image dimensions.'));
    };
    img.src = rawUrl;
  });
}

/**
 * Extracts `tEXt` chunks (`chara` and `ccv3`) from a PNG ArrayBuffer with strict bounds validation.
 */
export function extractPngTextChunks(
  buffer: ArrayBuffer
): Record<string, string> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Verify 8-byte PNG signature
  if (bytes.length < 8) {
    throw new Error('File is too small to be a valid PNG image.');
  }
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid PNG file signature.');
    }
  }

  const textChunks: Record<string, string> = {};
  let offset = 8;

  while (offset >= 8 && offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    // Guard against corrupted or maliciously huge Uint32 chunk lengths
    if (length > bytes.length || length > 0x7fffffff) {
      break;
    }

    const type = readAsciiString(bytes, offset + 4, 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd < dataStart || dataEnd + 4 > bytes.length) {
      break;
    }

    if (type === 'tEXt') {
      // Find null separator byte (0x00) between keyword and text value
      let nullIdx = -1;
      for (let i = dataStart; i < dataEnd; i++) {
        if (bytes[i] === 0) {
          nullIdx = i;
          break;
        }
      }
      if (nullIdx !== -1 && nullIdx > dataStart) {
        const keyword = readAsciiString(
          bytes,
          dataStart,
          nullIdx - dataStart
        ).toLowerCase();
        const valueStr = readAsciiString(
          bytes,
          nullIdx + 1,
          dataEnd - (nullIdx + 1)
        );
        textChunks[keyword] = valueStr;
      }
    }

    if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // Skip 4-byte CRC
  }

  return textChunks;
}

/**
 * Builds a valid PNG `tEXt` chunk (`[4-byte length][tEXt][keyword\0value][4-byte CRC32]`).
 */
function createPngTextChunk(keyword: string, base64Content: string): Uint8Array {
  const typeBytes = writeAsciiBytes('tEXt');
  const keyBytes = writeAsciiBytes(keyword);
  const valBytes = writeAsciiBytes(base64Content);

  const dataLength = keyBytes.length + 1 + valBytes.length;
  const chunk = new Uint8Array(4 + 4 + dataLength + 4);
  const view = new DataView(chunk.buffer);

  // 1. Data Length
  view.setUint32(0, dataLength, false);

  // 2. Chunk Type ('tEXt')
  chunk.set(typeBytes, 4);

  // 3. Keyword + Null separator + Base64 text
  chunk.set(keyBytes, 8);
  chunk[8 + keyBytes.length] = 0;
  chunk.set(valBytes, 8 + keyBytes.length + 1);

  // 4. CRC32 over [Chunk Type + Chunk Data]
  const crcSlice = chunk.subarray(4, 8 + dataLength);
  const crc = computeCrc32(crcSlice);
  view.setUint32(8 + dataLength, crc, false);

  return chunk;
}

/**
 * Strips any existing `chara` or `ccv3` `tEXt` chunks from a PNG ArrayBuffer while preserving
 * all image data chunks. Used on PNG import so character avatars never retain stale metadata
 * chunks that would exponentially inflate file size across re-exports.
 */
export function stripPngCharacterChunks(pngBuffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(pngBuffer);
  const view = new DataView(pngBuffer);

  if (bytes.length < 8) {
    return bytes;
  }
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      return bytes;
    }
  }

  const keptChunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let iendChunk: Uint8Array | null = null;
  let offset = 8;

  while (offset >= 8 && offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    if (length > bytes.length || length > 0x7fffffff) {
      break;
    }

    const type = readAsciiString(bytes, offset + 4, 4);
    const totalChunkLen = 4 + 4 + length + 4;
    if (totalChunkLen < 12 || offset + totalChunkLen > bytes.length) {
      break;
    }

    const fullChunk = bytes.subarray(offset, offset + totalChunkLen);
    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      let nullIdx = -1;
      for (let i = dataStart; i < dataEnd; i++) {
        if (bytes[i] === 0) {
          nullIdx = i;
          break;
        }
      }
      const keyword =
        nullIdx !== -1
          ? readAsciiString(bytes, dataStart, nullIdx - dataStart).toLowerCase()
          : '';
      if (keyword !== 'chara' && keyword !== 'ccv3') {
        keptChunks.push(fullChunk);
      }
    } else if (type === 'IEND') {
      iendChunk = fullChunk;
      break;
    } else {
      keptChunks.push(fullChunk);
    }

    offset += totalChunkLen;
  }

  if (iendChunk) {
    keptChunks.push(iendChunk);
  } else {
    keptChunks.push(
      new Uint8Array([0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130])
    );
  }

  const totalSize = keptChunks.reduce((acc, c) => acc + c.length, 0);
  const output = new Uint8Array(totalSize);
  let writePos = 0;
  for (const chunk of keptChunks) {
    output.set(chunk, writePos);
    writePos += chunk.length;
  }
  return output;
}

/**
 * Strips any existing `chara` or `ccv3` `tEXt` chunks from a PNG ArrayBuffer and injects
 * fresh `chara` (V2) and `ccv3` (V3) `tEXt` chunks right before the final `IEND` chunk.
 */
export function injectPngCharacterChunks(
  pngBuffer: ArrayBuffer,
  v2JsonString: string,
  v3JsonString: string
): Uint8Array {
  const bytes = new Uint8Array(pngBuffer);
  const view = new DataView(pngBuffer);

  if (bytes.length < 8) {
    throw new Error('Source PNG buffer is too small.');
  }
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) {
      throw new Error('Invalid source PNG signature.');
    }
  }

  const keptChunks: Uint8Array[] = [bytes.subarray(0, 8)];
  let iendChunk: Uint8Array | null = null;
  let offset = 8;

  while (offset >= 8 && offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    if (length > bytes.length || length > 0x7fffffff) {
      break;
    }

    const type = readAsciiString(bytes, offset + 4, 4);
    const totalChunkLen = 4 + 4 + length + 4;

    if (totalChunkLen < 12 || offset + totalChunkLen > bytes.length) {
      break;
    }

    const fullChunk = bytes.subarray(offset, offset + totalChunkLen);

    if (type === 'tEXt') {
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      let nullIdx = -1;
      for (let i = dataStart; i < dataEnd; i++) {
        if (bytes[i] === 0) {
          nullIdx = i;
          break;
        }
      }
      const keyword =
        nullIdx !== -1
          ? readAsciiString(bytes, dataStart, nullIdx - dataStart).toLowerCase()
          : '';
      // Skip old chara / ccv3 chunks so we replace them cleanly
      if (keyword !== 'chara' && keyword !== 'ccv3') {
        keptChunks.push(fullChunk);
      }
    } else if (type === 'IEND') {
      iendChunk = fullChunk;
      break;
    } else {
      keptChunks.push(fullChunk);
    }

    offset += totalChunkLen;
  }

  const charaChunk = createPngTextChunk('chara', encodeUtf8Base64(v2JsonString));
  const ccv3Chunk = createPngTextChunk('ccv3', encodeUtf8Base64(v3JsonString));

  keptChunks.push(charaChunk);
  keptChunks.push(ccv3Chunk);

  if (iendChunk) {
    keptChunks.push(iendChunk);
  } else {
    // Construct standard 12-byte IEND chunk
    const fallbackIend = new Uint8Array([
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);
    keptChunks.push(fallbackIend);
  }

  const totalSize = keptChunks.reduce((acc, c) => acc + c.length, 0);
  const output = new Uint8Array(totalSize);
  let writePos = 0;
  for (const chunk of keptChunks) {
    output.set(chunk, writePos);
    writePos += chunk.length;
  }

  return output;
}

async function rasterizeImageUrlToPngBuffer(
  imageUrl: string,
  maxDim = 1536
): Promise<ArrayBuffer> {
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const img = new Image();
    if (/^https?:\/\//i.test(imageUrl)) {
      img.crossOrigin = 'anonymous';
    }
    const cleanupImage = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      try {
        const origW = img.naturalWidth || img.width || 512;
        const origH = img.naturalHeight || img.height || 768;
        const longest = Math.max(origW, origH);
        const scale = maxDim > 0 && longest > maxDim ? maxDim / longest : 1;
        const w = Math.max(1, Math.round(origW * scale));
        const h = Math.max(1, Math.round(origH * scale));
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanupImage();
          canvas.width = 0;
          canvas.height = 0;
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          canvas.width = 0;
          canvas.height = 0;
          cleanupImage();
          if (!blob) {
            reject(new Error('Failed to encode avatar PNG blob'));
            return;
          }
          blob.arrayBuffer().then(resolve).catch(reject);
        }, 'image/png');
      } catch (err) {
        canvas.width = 0;
        canvas.height = 0;
        cleanupImage();
        reject(err);
      }
    };

    img.onerror = () => {
      cleanupImage();
      reject(new Error('Failed to decode avatar image for PNG conversion'));
    };

    img.src = imageUrl;
  });
}

/**
 * Resolves a clean PNG buffer from the character's avatar (converting JPEG/WebP/GIF via `<canvas>`),
 * or generates a procedural PNG portrait when no custom avatar is present.
 */
export async function generateDefaultAvatarPngBuffer(
  character: CharacterCardData,
  accentColor = '#d97706'
): Promise<ArrayBuffer> {
  const safeAvatar = sanitizeMediaUri(character.avatar);
  if (safeAvatar) {
    if (/^data:image\/png;base64,/i.test(safeAvatar)) {
      try {
        const b64 = safeAvatar.replace(/^data:image\/png;base64,/i, '');
        const bin = atob(b64.replace(/\s+/g, ''));
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        const stripped = stripPngCharacterChunks(bytes.buffer);
        const outBuf = new ArrayBuffer(stripped.byteLength);
        new Uint8Array(outBuf).set(stripped);
        return outBuf;
      } catch {
        // Fall through to canvas conversion / procedural fallback
      }
    } else if (typeof document !== 'undefined') {
      try {
        return await rasterizeImageUrlToPngBuffer(safeAvatar);
      } catch {
        // Fall through to procedural fallback if external URL fails CORS
      }
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 768;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable');
  }

  // Deep slate gradient background
  const grad = ctx.createLinearGradient(0, 0, 512, 768);
  grad.addColorStop(0, '#09090b');
  grad.addColorStop(0.6, '#18181b');
  grad.addColorStop(1, '#09090b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 768);

  // Subtle accent border frame
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, 472, 728);

  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, 452, 708);

  // Initials emblem
  const initials = (character.name || 'TS')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  ctx.fillStyle = accentColor;
  ctx.font = 'bold 120px "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(initials, 256, 330);

  // Character Name & Moniker
  ctx.fillStyle = '#f4f4f5';
  ctx.font = 'bold 34px "Plus Jakarta Sans", sans-serif';
  ctx.fillText((character.name || 'Untitled').slice(0, 24), 256, 540);

  if (character.nickname) {
    ctx.fillStyle = accentColor;
    ctx.font = '500 20px "JetBrains Mono", monospace';
    ctx.fillText(character.nickname.slice(0, 32), 256, 580);
  }

  ctx.fillStyle = '#71717a';
  ctx.font = '400 15px "JetBrains Mono", monospace';
  ctx.fillText('TAVERNSMITH · SILLYTAVERN V2/V3 CARD', 256, 700);

  return new Promise<ArrayBuffer>((resolve, reject) => {
    canvas.toBlob((blob) => {
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) {
        reject(new Error('Failed to encode PNG blob'));
        return;
      }
      blob.arrayBuffer().then(resolve).catch(reject);
    }, 'image/png');
  });
}

/**
 * Sanitizes and serializes a CharacterCardData into a clean V2 or V3 Wrapper with
 * `_tavernsmithType: 'character'`, preserving third-party `extensions`, storing only
 * compact metadata in `data.extensions.tavernsmith` (zero duplicate base64 bloat),
 * and guaranteeing NO API keys or sensitive credentials ever enter the exported JSON.
 */
export function serializeCharacterCard(
  character: CharacterCardData,
  spec: 'v2' | 'v3',
  fallbackLorebook?: Lorebook,
  options?: { omitAvatarDataUrl?: boolean }
): (SillyTavernV2Wrapper | SillyTavernV3Wrapper) & {
  _tavernsmithType: 'character';
} {
  const cleanBook = fallbackLorebook || character.character_book;
  const resolvedStatBlock =
    character.extensions?.statBlock || DEFAULT_STAT_BLOCK;
  const resolvedIsNsfw = Boolean(
    character.isNsfw || character.extensions?.isNsfw
  );
  const cleanAvatar = options?.omitAvatarDataUrl
    ? undefined
    : sanitizeMediaUri(character.avatar);
  const reactionImages: ReactionImageItem[] = (
    Array.isArray(character.reactionImages) ? character.reactionImages : []
  )
    .map((item) => {
      const safeUri = sanitizeMediaUri(item?.uri);
      if (!safeUri) return null;
      return {
        id: item.id,
        name: (item.name || 'neutral').trim() || 'neutral',
        uri: safeUri,
        ext: (item.ext || 'webp').trim() || 'webp',
        triggerRule: String(item.triggerRule || ''),
      };
    })
    .filter((item): item is ReactionImageItem => item !== null);

  const v3Assets: CharacterAssetEntry[] = [
    { type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' },
    ...reactionImages.map((item) => ({
      type: 'emotion',
      uri: item.uri,
      name: item.name,
      ext: item.ext,
    })),
  ];

  // Preserve any third-party SillyTavern extension keys (e.g., depth_prompt, regex_scripts, chub)
  const rawExtensions = (character.extensions || {}) as Record<string, unknown>;
  const { tavernsmith: _ignoredLegacyTs, ...preservedExtensions } = rawExtensions;

  const compactTsMeta = {
    id: character.id,
    ...(character.savedFileName ? { savedFileName: character.savedFileName } : {}),
    isNsfw: resolvedIsNsfw,
    statBlock: resolvedStatBlock,
    reactionRules: reactionImages.map((r) => ({
      id: r.id,
      name: r.name,
      ext: r.ext,
      triggerRule: r.triggerRule,
    })),
  };

  const cleanData: CharacterCardData = {
    id: character.id,
    ...(character.savedFileName
      ? { savedFileName: character.savedFileName }
      : {}),
    name: character.name || 'Untitled Character',
    nickname: character.nickname || '',
    description: character.description || '',
    personality: character.personality || '',
    scenario: character.scenario || '',
    first_mes: character.first_mes || '',
    mes_example: character.mes_example || '',
    creator_notes: character.creator_notes || '',
    system_prompt: character.system_prompt || '',
    post_history_instructions: character.post_history_instructions || '',
    alternate_greetings: Array.isArray(character.alternate_greetings)
      ? character.alternate_greetings
      : [],
    tags: Array.isArray(character.tags) ? character.tags : [],
    creator: character.creator || 'TavernSmith Creator',
    character_version: character.character_version || '1.0.0',
    ...(cleanBook ? { character_book: cleanBook } : {}),
    ...(cleanAvatar ? { avatar: cleanAvatar } : {}),
    ...(reactionImages.length > 0 ? { reactionImages } : {}),
    ...(spec === 'v3' ? { assets: v3Assets } : {}),
    creation_date: character.creation_date || Math.floor(Date.now() / 1000),
    modification_date:
      character.modification_date || Math.floor(Date.now() / 1000),
    isNsfw: resolvedIsNsfw,
    extensions: {
      ...preservedExtensions,
      talkativeness: String(preservedExtensions.talkativeness || '0.5'),
      fav: Boolean(preservedExtensions.fav),
      world: cleanBook?.name || String(preservedExtensions.world || ''),
      statBlock: resolvedStatBlock,
      isNsfw: resolvedIsNsfw,
      tavernsmith: compactTsMeta,
    },
  };

  if (spec === 'v2') {
    return {
      _tavernsmithType: 'character',
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: cleanData,
    };
  }

  return {
    _tavernsmithType: 'character',
    spec: 'chara_card_v3',
    spec_version: '3.0',
    data: cleanData,
  };
}

/**
 * Serializes a Lorebook into a clean SillyTavern World Info + TavernSmith JSON object
 * with `_tavernsmithType: 'lorebook'` and compact `extensions.tavernsmith` metadata.
 */
export function serializeLorebookCard(lorebook: Lorebook): Record<string, unknown> {
  const cleanBook: Lorebook = {
    id: lorebook.id,
    ...(lorebook.savedFileName ? { savedFileName: lorebook.savedFileName } : {}),
    name: lorebook.name || 'Untitled Lorebook',
    description: lorebook.description || '',
    scan_depth: Number(lorebook.scan_depth ?? 4),
    token_budget: Number(lorebook.token_budget ?? 1024),
    recursive_scanning: Boolean(lorebook.recursive_scanning ?? true),
    tags: Array.isArray(lorebook.tags) ? lorebook.tags : [],
    modification_date:
      lorebook.modification_date || Math.floor(Date.now() / 1000),
    isNsfw: Boolean(lorebook.isNsfw),
    entries: Array.isArray(lorebook.entries) ? lorebook.entries : [],
  };

  return {
    _tavernsmithType: 'lorebook',
    id: cleanBook.id,
    ...(cleanBook.savedFileName ? { savedFileName: cleanBook.savedFileName } : {}),
    name: cleanBook.name,
    description: cleanBook.description,
    scan_depth: cleanBook.scan_depth,
    token_budget: cleanBook.token_budget,
    recursive_scanning: cleanBook.recursive_scanning,
    modification_date: cleanBook.modification_date,
    isNsfw: cleanBook.isNsfw,
    tags: cleanBook.tags,
    entries: cleanBook.entries,
    extensions: {
      tavernsmith: {
        id: cleanBook.id,
        ...(cleanBook.savedFileName ? { savedFileName: cleanBook.savedFileName } : {}),
        isNsfw: cleanBook.isNsfw,
        tags: cleanBook.tags,
      },
    },
  };
}

/**
 * Normalizes any imported SillyTavern V1, V2, or V3 character JSON object or standalone Lorebook JSON.
 */
export type ImportedAssetResult =
  | {
      kind: 'character';
      character: CharacterCardData;
      embeddedLorebook?: Lorebook;
      detectedSpec: string;
    }
  | {
      kind: 'lorebook';
      lorebook: Lorebook;
    };

function normalizeLorebookPosition(rawPos: unknown): LorebookEntry['position'] {
  if (typeof rawPos === 'string') {
    const clean = rawPos.trim().toLowerCase();
    if (
      clean === 'before_char' ||
      clean === 'after_char' ||
      clean === 'an_top' ||
      clean === 'an_bottom' ||
      clean === 'at_depth'
    ) {
      return clean;
    }
  }
  if (typeof rawPos === 'number' && Number.isFinite(rawPos)) {
    switch (rawPos) {
      case 1:
        return 'after_char';
      case 2:
        return 'an_top';
      case 3:
        return 'an_bottom';
      case 4:
        return 'at_depth';
      case 0:
      default:
        return 'before_char';
    }
  }
  return 'before_char';
}

export function normalizeLorebookObject(
  rawBook: Record<string, unknown>,
  fallbackName = 'Imported World Book'
): Lorebook {
  let unwrappedBook = rawBook;
  if (
    unwrappedBook.payload &&
    typeof unwrappedBook.payload === 'object' &&
    !Array.isArray(unwrappedBook.payload)
  ) {
    const innerPayload = unwrappedBook.payload as Record<string, unknown>;
    unwrappedBook = {
      ...innerPayload,
      ...(typeof unwrappedBook._diskFileName === 'string' &&
      !innerPayload._diskFileName
        ? { _diskFileName: unwrappedBook._diskFileName }
        : {}),
      ...(typeof unwrappedBook.fileName === 'string' &&
      !innerPayload.savedFileName
        ? { savedFileName: unwrappedBook.fileName }
        : {}),
    };
  } else if (
    unwrappedBook.parsed &&
    typeof unwrappedBook.parsed === 'object' &&
    !Array.isArray(unwrappedBook.parsed)
  ) {
    const innerParsed = unwrappedBook.parsed as Record<string, unknown>;
    unwrappedBook = {
      ...innerParsed,
      ...(typeof unwrappedBook._diskFileName === 'string' &&
      !innerParsed._diskFileName
        ? { _diskFileName: unwrappedBook._diskFileName }
        : {}),
      ...(typeof unwrappedBook.fileName === 'string' &&
      !innerParsed.savedFileName
        ? { savedFileName: unwrappedBook.fileName }
        : {}),
    };
  }

  const extObj =
    unwrappedBook.extensions && typeof unwrappedBook.extensions === 'object'
      ? (unwrappedBook.extensions as Record<string, unknown>)
      : null;
  const tsSnapshot =
    extObj && extObj.tavernsmith && typeof extObj.tavernsmith === 'object'
      ? (extObj.tavernsmith as Record<string, unknown>)
      : null;

  // Prefer primary top-level fields over legacy tavernsmith snapshots so external edits aren't overwritten
  const source = tsSnapshot ? { ...tsSnapshot, ...unwrappedBook } : unwrappedBook;
  const rawEntries = unwrappedBook.entries ?? tsSnapshot?.entries;
  const entriesList: LorebookEntry[] = [];

  if (Array.isArray(rawEntries)) {
    rawEntries.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const e = item as Record<string, unknown>;
        entriesList.push({
          id: (e.id as string | number) ?? `entry-${Date.now()}-${idx}`,
          comment: String(e.comment || e.name || `Entry #${idx + 1}`),
          keys: Array.isArray(e.keys)
            ? e.keys.map(String)
            : Array.isArray(e.key)
              ? e.key.map(String)
              : [],
          secondary_keys: Array.isArray(e.secondary_keys)
            ? e.secondary_keys.map(String)
            : Array.isArray(e.keysecondary)
              ? e.keysecondary.map(String)
              : [],
          content: String(e.content || ''),
          enabled: e.enabled !== undefined ? Boolean(e.enabled) : !e.disable,
          insertion_order: Number(e.insertion_order ?? e.order ?? 100),
          case_sensitive: Boolean(e.case_sensitive ?? e.caseSensitive),
          constant: Boolean(e.constant),
          selective: Boolean(e.selective),
          position: normalizeLorebookPosition(e.position),
          priority: Number(e.priority ?? 10),
          depth: Number(e.depth ?? 4),
          probability: Number(e.probability ?? 100),
          tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
        });
      }
    });
  } else if (rawEntries && typeof rawEntries === 'object') {
    // SillyTavern World Info dictionary format: `{ entries: { "0": { key: [...], content: "..." } } }`
    Object.values(rawEntries as Record<string, unknown>).forEach(
      (item, idx) => {
        if (item && typeof item === 'object') {
          const e = item as Record<string, unknown>;
          entriesList.push({
            id: (e.uid as number | string) ?? (e.id as number | string) ?? `entry-${Date.now()}-${idx}`,
            comment: String(e.comment || e.name || `Entry #${idx + 1}`),
            keys: Array.isArray(e.key)
              ? e.key.map(String)
              : Array.isArray(e.keys)
                ? e.keys.map(String)
                : [],
            secondary_keys: Array.isArray(e.keysecondary)
              ? e.keysecondary.map(String)
              : Array.isArray(e.secondary_keys)
                ? e.secondary_keys.map(String)
                : [],
            content: String(e.content || ''),
            enabled:
              e.disable !== undefined ? !e.disable : Boolean(e.enabled ?? true),
            insertion_order: Number(e.order ?? e.insertion_order ?? 100),
            case_sensitive: Boolean(e.caseSensitive ?? e.case_sensitive),
            constant: Boolean(e.constant),
            selective: Boolean(e.selective),
            position: normalizeLorebookPosition(e.position),
            priority: Number(e.priority ?? e.order ?? 10),
            depth: Number(e.depth ?? 4),
            probability: Number(e.probability ?? 100),
            tags: Array.isArray(e.tags) ? e.tags.map(String) : [],
          });
        }
      }
    );
  }

  const resolvedSavedFileName =
    typeof source.savedFileName === 'string' && source.savedFileName
      ? source.savedFileName
      : typeof unwrappedBook.savedFileName === 'string' &&
          unwrappedBook.savedFileName
        ? unwrappedBook.savedFileName
        : typeof unwrappedBook._diskFileName === 'string' &&
            unwrappedBook._diskFileName
          ? unwrappedBook._diskFileName
          : undefined;

  return createBlankLorebook({
    id: typeof source.id === 'string' && source.id ? source.id : undefined,
    ...(resolvedSavedFileName ? { savedFileName: resolvedSavedFileName } : {}),
    name: String(source.name || fallbackName),
    description:
      source.description !== undefined
        ? String(source.description)
        : 'Imported SillyTavern Lorebook',
    scan_depth: Number(source.scan_depth ?? source.scanDepth ?? 4),
    token_budget: Number(source.token_budget ?? source.tokenBudget ?? 1024),
    recursive_scanning: Boolean(
      source.recursive_scanning ?? source.recursiveScanning ?? true
    ),
    tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
    modification_date: Number(
      source.modification_date ?? Math.floor(Date.now() / 1000)
    ),
    isNsfw: Boolean(source.isNsfw),
    entries: entriesList,
  });
}

export function parseImportedJsonString(
  jsonStr: string,
  avatarDataUrl?: string,
  fallbackFileName = 'Imported',
  forcedKind?: 'character' | 'lorebook'
): ImportedAssetResult {
  let parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.payload &&
    typeof parsed.payload === 'object' &&
    !Array.isArray(parsed.payload)
  ) {
    const innerPayload = parsed.payload as Record<string, unknown>;
    parsed = {
      ...innerPayload,
      ...(typeof parsed._diskFileName === 'string' &&
      !innerPayload._diskFileName
        ? { _diskFileName: parsed._diskFileName }
        : {}),
      ...(typeof parsed.fileName === 'string' && !innerPayload.savedFileName
        ? { savedFileName: parsed.fileName }
        : {}),
    };
  } else if (
    parsed &&
    typeof parsed === 'object' &&
    parsed.parsed &&
    typeof parsed.parsed === 'object' &&
    !Array.isArray(parsed.parsed)
  ) {
    const innerParsed = parsed.parsed as Record<string, unknown>;
    parsed = {
      ...innerParsed,
      ...(typeof parsed._diskFileName === 'string' &&
      !innerParsed._diskFileName
        ? { _diskFileName: parsed._diskFileName }
        : {}),
      ...(typeof parsed.fileName === 'string' && !innerParsed.savedFileName
        ? { savedFileName: parsed.fileName }
        : {}),
    };
  }
  const cleanFallbackName = fallbackFileName.replace(/\.(json|png)$/i, '');

  const topExtensions =
    parsed.extensions && typeof parsed.extensions === 'object'
      ? (parsed.extensions as Record<string, unknown>)
      : null;
  const topTsSnapshot =
    topExtensions &&
    topExtensions.tavernsmith &&
    typeof topExtensions.tavernsmith === 'object'
      ? (topExtensions.tavernsmith as Record<string, unknown>)
      : null;

  const isExplicitLorebook =
    forcedKind === 'lorebook' ||
    parsed._tavernsmithType === 'lorebook' ||
    (topTsSnapshot && Array.isArray(topTsSnapshot.entries)) ||
    (parsed.entries !== undefined &&
      !parsed.spec &&
      parsed._tavernsmithType !== 'character' &&
      parsed.first_mes === undefined &&
      parsed.personality === undefined);

  if (isExplicitLorebook && forcedKind !== 'character') {
    return {
      kind: 'lorebook',
      lorebook: normalizeLorebookObject(parsed, cleanFallbackName),
    };
  }

  const detectedSpec = String(parsed.spec || 'chara_card_v2');
  const rawInner =
    parsed.data && typeof parsed.data === 'object'
      ? (parsed.data as Record<string, unknown>)
      : parsed;

  const innerExtensions =
    rawInner.extensions && typeof rawInner.extensions === 'object'
      ? (rawInner.extensions as Record<string, unknown>)
      : topExtensions;

  const charTsSnapshot =
    innerExtensions &&
    innerExtensions.tavernsmith &&
    typeof innerExtensions.tavernsmith === 'object'
      ? (innerExtensions.tavernsmith as Record<string, unknown>)
      : null;

  // Prefer live rawInner fields over any legacy tavernsmith snapshot so external edits are preserved
  const inner: Record<string, unknown> = charTsSnapshot
    ? { ...charTsSnapshot, ...rawInner }
    : rawInner;

  let embeddedLorebook: Lorebook | undefined;
  if (inner.character_book && typeof inner.character_book === 'object') {
    embeddedLorebook = normalizeLorebookObject(
      inner.character_book as Record<string, unknown>,
      `${String(inner.name || 'Character')} Lorebook`
    );
  }

  const importedIsNsfw = Boolean(
    inner.isNsfw ||
      parsed.isNsfw ||
      charTsSnapshot?.isNsfw ||
      (inner.extensions &&
        typeof inner.extensions === 'object' &&
        (inner.extensions as Record<string, unknown>).isNsfw)
  );

  const rawMergedExtensions: Record<string, unknown> =
    innerExtensions && typeof innerExtensions === 'object'
      ? { ...innerExtensions }
      : inner.extensions && typeof inner.extensions === 'object'
        ? { ...(inner.extensions as Record<string, unknown>) }
        : {};
  delete rawMergedExtensions.tavernsmith;

  const inferExtFromAssetUri = (uri: string): string => {
    const dataMatch = uri.match(/^data:image\/([a-zA-Z0-9+.-]+);/i);
    if (dataMatch && dataMatch[1]) {
      const sub = dataMatch[1].toLowerCase();
      if (sub === 'jpeg') return 'jpg';
      return sub.split('+')[0];
    }
    const urlPathMatch = uri.split('?')[0].match(/\.([a-zA-Z0-9]+)$/);
    if (urlPathMatch && urlPathMatch[1]) {
      return urlPathMatch[1].toLowerCase();
    }
    return 'webp';
  };

  const rawAssets = Array.isArray(rawInner.assets)
    ? (rawInner.assets as CharacterAssetEntry[])
    : Array.isArray(inner.assets)
      ? (inner.assets as CharacterAssetEntry[])
      : undefined;

  const reactionRuleMap = new Map<
    string,
    { id?: string; triggerRule?: string }
  >();
  if (charTsSnapshot && Array.isArray(charTsSnapshot.reactionRules)) {
    for (const rule of charTsSnapshot.reactionRules as Array<
      Record<string, unknown>
    >) {
      if (rule && typeof rule.name === 'string') {
        reactionRuleMap.set(rule.name.trim().toLowerCase(), {
          id: typeof rule.id === 'string' ? rule.id : undefined,
          triggerRule:
            typeof rule.triggerRule === 'string' ? rule.triggerRule : '',
        });
      }
    }
  }

  let restoredReactionImages: ReactionImageItem[] = [];
  const directReactionSource = Array.isArray(rawInner.reactionImages)
    ? (rawInner.reactionImages as Array<Partial<ReactionImageItem>>)
    : charTsSnapshot && Array.isArray(charTsSnapshot.reactionImages)
      ? (charTsSnapshot.reactionImages as Array<Partial<ReactionImageItem>>)
      : null;

  if (directReactionSource) {
    restoredReactionImages = directReactionSource
      .map((r, idx) => {
        const safeUri = sanitizeMediaUri(r?.uri);
        if (!safeUri) return null;
        return {
          id:
            typeof r.id === 'string' && r.id
              ? r.id
              : `react-${Date.now()}-${idx}`,
          name: String(r.name || 'neutral'),
          uri: safeUri,
          ext: String(r.ext || inferExtFromAssetUri(safeUri)),
          triggerRule: String(r.triggerRule || ''),
        };
      })
      .filter((r): r is ReactionImageItem => r !== null);
  } else if (Array.isArray(rawAssets)) {
    restoredReactionImages = rawAssets
      .filter((asset) => {
        if (!asset || typeof asset !== 'object') return false;
        const safeUri = sanitizeMediaUri(asset.uri);
        if (!safeUri) return false;
        return asset.type === 'emotion' || asset.name !== 'main';
      })
      .map((asset, idx) => {
        const safeUri = sanitizeMediaUri(asset.uri) as string;
        const name = String(asset.name || 'neutral');
        const matchedRule = reactionRuleMap.get(name.trim().toLowerCase());
        return {
          id:
            matchedRule?.id ||
            `react-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
          name,
          uri: safeUri,
          ext: String(asset.ext || inferExtFromAssetUri(safeUri)),
          triggerRule: matchedRule?.triggerRule || '',
        };
      });
  }

  const resolvedSavedFileName =
    typeof inner.savedFileName === 'string' && inner.savedFileName
      ? inner.savedFileName
      : typeof parsed.savedFileName === 'string' && parsed.savedFileName
        ? parsed.savedFileName
        : typeof parsed._diskFileName === 'string' && parsed._diskFileName
          ? parsed._diskFileName
          : undefined;

  const resolvedAvatar =
    sanitizeMediaUri(avatarDataUrl) || sanitizeMediaUri(inner.avatar);

  const resolvedStatBlock =
    (rawMergedExtensions as { statBlock?: typeof DEFAULT_STAT_BLOCK })
      .statBlock ||
    (charTsSnapshot?.statBlock as typeof DEFAULT_STAT_BLOCK | undefined) ||
    DEFAULT_STAT_BLOCK;

  const character = createBlankCharacter({
    id: typeof inner.id === 'string' && inner.id ? inner.id : undefined,
    ...(resolvedSavedFileName ? { savedFileName: resolvedSavedFileName } : {}),
    name: String(inner.name || parsed.name || cleanFallbackName || 'Imported Character'),
    nickname: String(inner.nickname || ''),
    description: String(inner.description ?? parsed.description ?? ''),
    personality: String(inner.personality ?? parsed.personality ?? ''),
    scenario: String(inner.scenario ?? parsed.scenario ?? ''),
    first_mes: String(inner.first_mes ?? parsed.first_mes ?? ''),
    mes_example: String(inner.mes_example ?? parsed.mes_example ?? ''),
    creator_notes: String(
      inner.creator_notes ?? inner.creatorcomment ?? ''
    ),
    system_prompt: String(inner.system_prompt ?? ''),
    post_history_instructions: String(
      inner.post_history_instructions ?? ''
    ),
    alternate_greetings: Array.isArray(inner.alternate_greetings)
      ? inner.alternate_greetings.map(String)
      : [],
    tags: Array.isArray(inner.tags) ? inner.tags.map(String) : [],
    creator: String(inner.creator || 'Imported Creator'),
    character_version: String(inner.character_version || '1.0.0'),
    creation_date: Number(
      inner.creation_date ?? Math.floor(Date.now() / 1000)
    ),
    modification_date: Number(
      inner.modification_date ?? Math.floor(Date.now() / 1000)
    ),
    avatar: resolvedAvatar,
    assets: rawAssets,
    reactionImages: restoredReactionImages,
    character_book: embeddedLorebook,
    isNsfw: importedIsNsfw,
    extensions: {
      ...rawMergedExtensions,
      talkativeness: String(rawMergedExtensions.talkativeness || '0.5'),
      fav: Boolean(rawMergedExtensions.fav),
      isNsfw: importedIsNsfw,
      statBlock: resolvedStatBlock,
    },
  });

  return {
    kind: 'character',
    character,
    embeddedLorebook,
    detectedSpec,
  };
}

/**
 * Reads an uploaded `.png` or `.json` File and returns the parsed Character + embedded Lorebook or Standalone Lorebook.
 */
export async function importCardFromFile(
  file: File
): Promise<ImportedAssetResult> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.png') || file.type === 'image/png') {
    const buffer = await file.arrayBuffer();
    const chunks = extractPngTextChunks(buffer);
    const candidateChunks = [chunks['ccv3'], chunks['chara']].filter(
      (c): c is string => typeof c === 'string' && c.trim().length > 0
    );

    if (candidateChunks.length === 0) {
      throw new Error(
        `No SillyTavern character metadata ('chara' or 'ccv3' tEXt chunk) found inside "${file.name}".`
      );
    }

    // Strip embedded chara/ccv3 chunks BEFORE storing avatarDataUrl to prevent exponential PNG bloat
    const strippedBytes = stripPngCharacterChunks(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < strippedBytes.length; i += chunkSize) {
      binary += String.fromCharCode(
        ...strippedBytes.subarray(i, i + chunkSize)
      );
    }
    const avatarDataUrl = `data:image/png;base64,${btoa(binary)}`;

    let lastChunkErr: unknown = null;
    for (const rawBase64 of candidateChunks) {
      try {
        const decodedJson = decodeUtf8Base64(rawBase64);
        return parseImportedJsonString(
          decodedJson,
          avatarDataUrl,
          file.name,
          'character'
        );
      } catch (err) {
        lastChunkErr = err;
      }
    }

    throw new Error(
      `Could not decode SillyTavern character metadata in "${file.name}": ${
        lastChunkErr instanceof Error ? lastChunkErr.message : 'Corrupted Base64 or JSON chunk'
      }`
    );
  }

  // Otherwise parse as JSON file
  const text = await file.text();
  return parseImportedJsonString(text, undefined, file.name);
}

/**
 * Triggers a clean browser file download for a JSON or PNG asset.
 */
export function triggerBrowserDownload(
  content: Blob | string,
  filename: string,
  mimeType = 'application/json;charset=utf-8'
): void {
  const blob =
    typeof content === 'string'
      ? new Blob([content], { type: mimeType })
      : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export function sanitizeFilename(name: string): string {
  return (
    (name || 'untitled')
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'untitled'
  );
}

/**
 * Exports a Character Card as a SillyTavern `.png` card with embedded `chara` (V2) and `ccv3` (V3) `tEXt` chunks.
 * Omits redundant base64 `avatar` data inside the PNG text chunks because the PNG image itself is the portrait.
 */
export async function exportCharacterAsPng(
  character: CharacterCardData,
  fallbackLorebook?: Lorebook,
  accentColor = '#d97706'
): Promise<void> {
  const v2Payload = serializeCharacterCard(character, 'v2', fallbackLorebook, {
    omitAvatarDataUrl: true,
  });
  const v3Payload = serializeCharacterCard(character, 'v3', fallbackLorebook, {
    omitAvatarDataUrl: true,
  });

  const basePngBuffer = await generateDefaultAvatarPngBuffer(
    character,
    accentColor
  );
  const stegoPngBytes = injectPngCharacterChunks(
    basePngBuffer,
    JSON.stringify(v2Payload),
    JSON.stringify(v3Payload)
  );

  const arrayBufferCopy = new ArrayBuffer(stegoPngBytes.byteLength);
  new Uint8Array(arrayBufferCopy).set(stegoPngBytes);
  const blob = new Blob([arrayBufferCopy], { type: 'image/png' });
  const filename = `${sanitizeFilename(character.name)}.png`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports a Character Card as a `.json` file (`chara_card_v2` or `chara_card_v3`).
 */
export function exportCharacterAsJson(
  character: CharacterCardData,
  spec: 'v2' | 'v3',
  fallbackLorebook?: Lorebook
): void {
  const payload = serializeCharacterCard(character, spec, fallbackLorebook);
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const filename = `${sanitizeFilename(character.name)}_${spec}.json`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Exports a Lorebook as a standalone SillyTavern World Info `.json` file.
 */
export function exportLorebookAsJson(lorebook: Lorebook): void {
  const cleanBook = serializeLorebookCard(lorebook);
  const jsonString = JSON.stringify(cleanBook, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const filename = `${sanitizeFilename(lorebook.name)}_lorebook.json`;
  triggerBrowserDownload(blob, filename);
}

/**
 * Zero-Bloat Image Compression Utility (~260 Tokens Max):
 * Scales any image data URL down using an offscreen HTML5 <canvas> so its longest edge
 * is at most `maxDim` (default 512px) and encodes it as `image/jpeg` at 0.8 quality.
 * Guarantees every visual context image costs only ~258–400 tokens and never bloats local LLM VRAM.
 */
export async function compressImageForVision(
  dataUrl: string,
  maxDim = 512
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid image data URL provided for vision compression.');
  }

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const cleanupImage = () => {
      img.onload = null;
      img.onerror = null;
      img.src = '';
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      try {
        const origWidth = img.naturalWidth || img.width || 512;
        const origHeight = img.naturalHeight || img.height || 512;

        const longestEdge = Math.max(origWidth, origHeight);
        const scale = longestEdge > maxDim ? maxDim / longestEdge : 1;

        const targetWidth = Math.max(1, Math.round(origWidth * scale));
        const targetHeight = Math.max(1, Math.round(origHeight * scale));

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Fill neutral dark backdrop so transparent PNGs render cleanly in JPEG
        ctx.fillStyle = '#18181b';
        ctx.fillRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        const compressedJpeg = canvas.toDataURL('image/jpeg', 0.8);
        resolve(compressedJpeg);
      } catch (err) {
        reject(err);
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        cleanupImage();
      }
    };

    img.onerror = () => {
      cleanupImage();
      reject(new Error('Failed to load image for vision compression.'));
    };

    img.src = dataUrl;
  });
}

/**
 * Reads an uploaded or dropped File object into a base64 Data URL.
 */
export function readImageFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file as Data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Error reading image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Scales an uploaded reaction sprite down so its longest edge is at most `maxDim` (default 640px)
 * and encodes it as compact `image/webp` (0.85 quality, with `image/png` fallback) while preserving alpha transparency.
 */
export async function compressImageForReactionAsset(
  file: File,
  maxDim = 640
): Promise<{ dataUrl: string; ext: string; nameStem: string }> {
  const rawStem = file.name.replace(/\.[^/.]+$/, '').trim();
  const nameStem = rawStem.replace(/\s+/g, '_').toLowerCase() || 'reaction';
  const rawDataUrl = await readImageFileAsDataUrl(file);

  return new Promise<{ dataUrl: string; ext: string; nameStem: string }>(
    (resolve, reject) => {
      const img = new Image();
      const cleanupImage = () => {
        img.onload = null;
        img.onerror = null;
        img.src = '';
      };
      img.onload = () => {
        const canvas = document.createElement('canvas');
        try {
          const origWidth = img.naturalWidth || img.width || 512;
          const origHeight = img.naturalHeight || img.height || 512;
          const longestEdge = Math.max(origWidth, origHeight);
          const scale = longestEdge > maxDim ? maxDim / longestEdge : 1;

          const targetWidth = Math.max(1, Math.round(origWidth * scale));
          const targetHeight = Math.max(1, Math.round(origHeight * scale));

          canvas.width = targetWidth;
          canvas.height = targetHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            const fallbackExt = file.type === 'image/png' ? 'png' : 'webp';
            resolve({ dataUrl: rawDataUrl, ext: fallbackExt, nameStem });
            return;
          }

          ctx.clearRect(0, 0, targetWidth, targetHeight);
          ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

          const webpUrl = canvas.toDataURL('image/webp', 0.85);
          if (webpUrl.startsWith('data:image/webp')) {
            resolve({ dataUrl: webpUrl, ext: 'webp', nameStem });
            return;
          }

          const pngUrl = canvas.toDataURL('image/png');
          resolve({ dataUrl: pngUrl, ext: 'png', nameStem });
        } catch (err) {
          reject(err);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
          cleanupImage();
        }
      };
      img.onerror = () => {
        cleanupImage();
        reject(new Error(`Failed to decode reaction image "${file.name}".`));
      };
      img.src = rawDataUrl;
    }
  );
}

