import {
  AIBackendConfig,
  AIPresetId,
  ContextTheme,
  ModelCompatibilityFormat,
  ProviderKeyId,
  TagDefinition,
} from '../types';
import { getDecryptedKeyForProvider } from '../utils/cryptoVault';
import { compressImageForVision } from '../utils/cardIO';
import { desktopFetch, isTauriDesktop } from '../utils/desktopBridge';
import { sortTagsByContextOrder } from '../utils/tagOrder';

export { compressImageForVision };

/**
 * Vision-capable model keywords automatically detected from `config.modelName` / `config.model`.
 */
export const VISION_MODEL_SUBSTRINGS: readonly string[] = [
  'gemini',
  'gemma-4',
  'gemma4',
  'gemma-3',
  'gemma3',
  'qwen-vl',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen2.5vl',
  'qwen3',
  'pixtral',
  'llava',
  'llama-4',
  'llama4',
  'llama-3.2-vision',
  'llama3.2-vision',
  'minicpm-v',
  'internvl',
  'mistral-small-3',
  'kimi-vl',
  'glm-4v',
  'glm-4.1v',
  'molmo',
  'cogvlm',
  'grok',
  'gpt-4o',
  'gpt-4.1',
  'gpt-4.5',
  'gpt-5',
  'o1-',
  'o3-',
  'o4-',
  'claude-3',
  'claude-4',
  'vision',
  '-vl',
  ':vl',
  'vl-',
];

/**
 * Auto-detects whether a model string supports multimodal vision inputs.
 */
export function isModelVisionCapable(modelName?: string): boolean {
  const lower = (modelName || '').trim().toLowerCase();
  if (!lower) return false;
  return VISION_MODEL_SUBSTRINGS.some((token) => lower.includes(token));
}

/**
 * Returns true if the active AI backend configuration supports vision input
 * (either auto-detected from `config.modelName` / `config.model`, or via `config.forceEnableVision`).
 */
export function doesBackendSupportVision(
  config?: AIBackendConfig | null
): boolean {
  if (!config) return false;
  if (config.forceEnableVision) return true;
  const rawModel = (config.modelName || config.model || '').toLowerCase();
  return isModelVisionCapable(rawModel);
}

export interface AIPresetMeta {
  id: AIPresetId;
  providerKey: ProviderKeyId;
  label: string;
  group: string;
  defaultUrl: string;
  defaultModel: string;
  description: string;
  requiresKey: boolean;
  suggestedModels: string[];
}

export const GEMINI_PRIORITY_MODELS: readonly string[] = [];

export function isDeprecatedGeminiModel(rawModel?: string): boolean {
  const m = (rawModel || '').trim().replace(/^models\//i, '').toLowerCase();
  if (!m) return false;
  return m === 'gemini-pro' || m.startsWith('gemini-1.0');
}

export function isGemini38Or4Model(rawModel?: string): boolean {
  const m = (rawModel || '').trim().replace(/^models\//i, '').toLowerCase();
  return m.startsWith('gemini-4') || m.startsWith('gemini-3.8');
}

export const AI_BACKEND_PRESETS: AIPresetMeta[] = [
  {
    id: 'lmstudio',
    providerKey: 'lmstudio',
    label: 'LM Studio (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:1234/v1',
    defaultModel: '',
    description:
      'Local OpenAI-compatible server running via LM Studio on port 1234. Shows currently loaded vs. downloaded models.',
    requiresKey: false,
    suggestedModels: [],
  },
  {
    id: 'ollama',
    providerKey: 'ollama',
    label: 'Ollama (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: '',
    description:
      'Local Ollama daemon on port 11434 (No key needed). Queries /api/ps and /api/tags to show loaded vs. installed models.',
    requiresKey: false,
    suggestedModels: [],
  },
  {
    id: 'koboldcpp',
    providerKey: 'kobold',
    label: 'KoboldCPP / TextGenWebUI (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:5001/v1',
    defaultModel: '',
    description:
      'Local GGUF server exposing /v1/chat/completions and /api/v1/generate fallback.',
    requiresKey: false,
    suggestedModels: [],
  },
  {
    id: 'gemini',
    providerKey: 'google',
    label: 'Google Gemini',
    group: 'Cloud API',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: '',
    description:
      'Google Gemini API. Calls Google Generative Language REST API directly when a Gemini API key is provided, or /api/gemini when left empty.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'xai_grok',
    providerKey: 'xai',
    label: 'X / xAI Grok',
    group: 'Cloud API',
    defaultUrl: 'https://api.x.ai/v1',
    defaultModel: '',
    description: 'xAI Grok endpoint with reasoning_content parsing.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'openrouter_llama',
    providerKey: 'openrouter',
    label: 'OpenRouter',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: '',
    description:
      'OpenRouter unified gateway for Meta Llama, Google Gemma, DeepSeek, Claude, and other cloud models.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'groq_llama',
    providerKey: 'groq',
    label: 'Groq LPU',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: '',
    description:
      'Ultra-low-latency LPU inference for Meta Llama, Gemma, and DeepSeek models.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'meta_direct',
    providerKey: 'meta',
    label: 'Meta Llama Direct API',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://api.llama.com/compat/v1',
    defaultModel: '',
    description: 'Direct Meta Llama compatibility endpoint.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'openai_compatible',
    providerKey: 'openai',
    label: 'OpenAI API',
    group: 'Cloud API',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: '',
    description: 'Official OpenAI chat/completions endpoint.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'anthropic',
    providerKey: 'anthropic',
    label: 'Anthropic Claude',
    group: 'Cloud API',
    defaultUrl: 'https://api.anthropic.com/v1',
    defaultModel: '',
    description:
      'Official Anthropic Claude Messages API (direct x-api-key headers) or any custom OpenAI-compatible proxy URL.',
    requiresKey: true,
    suggestedModels: [],
  },
  {
    id: 'custom',
    providerKey: 'custom',
    label: 'Custom OpenAI-Compatible Proxy',
    group: 'Cloud API',
    defaultUrl: 'http://localhost:8000/v1',
    defaultModel: '',
    description: 'Any custom vLLM, TabbyAPI, Aphrodite, or OpenAI-compatible endpoint.',
    requiresKey: false,
    suggestedModels: [],
  },
];

/**
 * Maps any AIPresetId or provider alias to the canonical ProviderKeyId
 * (`google`, `xai`, `openrouter`, `groq`, `meta`, `openai`, `anthropic`, `lmstudio`, `ollama`, `kobold`, `custom`).
 */
export function getProviderKeyId(presetOrId: AIPresetId | string): ProviderKeyId {
  const clean = (presetOrId || '').trim().toLowerCase();
  switch (clean) {
    case 'gemini':
    case 'google':
      return 'google';
    case 'xai_grok':
    case 'xai':
      return 'xai';
    case 'openrouter_llama':
    case 'openrouter':
      return 'openrouter';
    case 'groq_llama':
    case 'groq':
      return 'groq';
    case 'meta_direct':
    case 'meta':
      return 'meta';
    case 'openai_compatible':
    case 'openai':
      return 'openai';
    case 'anthropic':
      return 'anthropic';
    case 'lmstudio':
      return 'lmstudio';
    case 'ollama':
      return 'ollama';
    case 'koboldcpp':
    case 'kobold':
      return 'kobold';
    case 'custom':
    default:
      return 'custom';
  }
}

export const COMPATIBILITY_FORMAT_LABELS: Record<
  Exclude<ModelCompatibilityFormat, 'auto'>,
  string
> = {
  gemma: 'Gemma (System-Merged & Reasoning)',
  deepseek_qwen_think: 'DeepSeek / Qwen (<think>)',
  llama_3_4: 'Llama 3 / 4',
  mistral: 'Mistral',
  xai_grok_reasoning: 'xAI Grok',
  gemini_thinking: 'Google Gemini',
  claude_chatml: 'Anthropic Claude',
  kobold_raw: 'Kobold Raw',
};

/**
 * Strictly inspects the selected Model Name / ID string (`modelName.toLowerCase()`)
 * to determine the compatibility & thinking format, regardless of which endpoint hosts it.
 */
export function detectModelCompatibilityFormat(
  modelName: string,
  preset?: AIPresetId
): Exclude<ModelCompatibilityFormat, 'auto'> {
  const m = (modelName || '').trim().toLowerCase();

  // 1. Gemma family (e.g., gemma-4, gemma4, gemma-3, gemma-2) -> System-Merged & Reasoning
  if (m.includes('gemma')) {
    return 'gemma';
  }
  // 2. DeepSeek / Qwen / QwQ / R1 -> DeepSeek / Qwen (<think>)
  if (
    m.includes('deepseek') ||
    m.includes('qwen') ||
    m.includes('qwq') ||
    m.includes('r1')
  ) {
    return 'deepseek_qwen_think';
  }
  // 3. Llama family -> Llama 3 / 4
  if (m.includes('llama') || m.includes('muse')) {
    return 'llama_3_4';
  }
  // 4. Mistral / Mixtral / Pixtral / Nemo -> Mistral
  if (
    m.includes('mistral') ||
    m.includes('mixtral') ||
    m.includes('pixtral') ||
    m.includes('nemo')
  ) {
    return 'mistral';
  }
  // 5. xAI Grok -> xAI Grok
  if (m.includes('grok')) {
    return 'xai_grok_reasoning';
  }
  // 6. Google Gemini -> Google Gemini
  if (m.includes('gemini')) {
    return 'gemini_thinking';
  }
  // 7. Anthropic Claude -> Anthropic Claude
  if (m.includes('claude')) {
    return 'claude_chatml';
  }
  // 8. Kobold explicit model
  if (m.includes('kobold')) {
    return 'kobold_raw';
  }

  // Fallback only if model name has none of the identifiers above
  if (preset === 'koboldcpp') return 'kobold_raw';
  if (preset === 'gemini') return 'gemini_thinking';
  if (preset === 'xai_grok') return 'xai_grok_reasoning';
  if (preset === 'anthropic') return 'claude_chatml';

  return 'llama_3_4';
}

export function resolveEffectiveFormat(
  config: AIBackendConfig
): Exclude<ModelCompatibilityFormat, 'auto'> {
  if (config.compatibilityFormat && config.compatibilityFormat !== 'auto') {
    return config.compatibilityFormat;
  }
  return detectModelCompatibilityFormat(config.modelName, config.preset);
}

/**
 * Strips `<think>...</think>`, `<thought>...</thought>`, `<reasoning>...</reasoning>`,
 * AND Gemma 4's `<|thought|>...<|/thought|>` blocks from raw LLM responses so chain-of-thought
 * never pollutes Character or Lorebook fields.
 */
export function extractThinkingAndCleanContent(
  rawText: string,
  apiReasoningContent?: string
): { content: string; reasoning: string } {
  const extractedBlocks: string[] = [];

  if (apiReasoningContent && apiReasoningContent.trim()) {
    extractedBlocks.push(apiReasoningContent.trim());
  }

  if (!rawText) {
    return { content: '', reasoning: extractedBlocks.join('\n\n') };
  }

  let cleaned = rawText;

  // 1. Match Gemma 4 special thought delimiters: <|thought|>...<|/thought|> or <|thought|>...</thought>
  const gemmaPipeRegex = /<\|thought\|>([\s\S]*?)(?:<\|\/thought\|>|<\/thought>)/gi;
  cleaned = cleaned.replace(gemmaPipeRegex, (_fullMatch, innerText) => {
    if (innerText && innerText.trim()) {
      extractedBlocks.push(innerText.trim());
    }
    return '';
  });

  // 2. Match complete <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>
  const tagRegex = /<(think|thought|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  cleaned = cleaned.replace(tagRegex, (_fullMatch, _tag, innerText) => {
    if (innerText && innerText.trim()) {
      extractedBlocks.push(innerText.trim());
    }
    return '';
  });

  // 3. Handle unclosed leading <|thought|> before <|/thought|>
  if (cleaned.includes('<|/thought|>')) {
    const parts = cleaned.split('<|/thought|>');
    if (parts.length > 1) {
      const thoughtPart = parts[0].replace(/<\|thought\|>/gi, '').trim();
      if (thoughtPart) {
        extractedBlocks.push(thoughtPart);
      }
      cleaned = parts.slice(1).join('<|/thought|>');
    }
  }

  // 4. Handle unclosed leading <think> or <thought> before </think> or </thought>
  for (const closeTag of ['</think>', '</thought>', '</reasoning>']) {
    if (cleaned.toLowerCase().includes(closeTag)) {
      const idx = cleaned.toLowerCase().indexOf(closeTag);
      const before = cleaned
        .slice(0, idx)
        .replace(/<(think|thought|reasoning)\b[^>]*>/gi, '')
        .replace(/<\|thought\|>/gi, '')
        .trim();
      if (before) {
        extractedBlocks.push(before);
      }
      cleaned = cleaned.slice(idx + closeTag.length);
    }
  }

  // 5. Handle trailing UNCLOSED <think>, <thought>, <reasoning>, or <|thought|> if truncated mid-thought
  const unclosedStartMatch = cleaned.match(
    /(<\|thought\|>|<(?:think|thought|reasoning)\b[^>]*>)/i
  );
  if (unclosedStartMatch && typeof unclosedStartMatch.index === 'number') {
    const trailingThought = cleaned
      .slice(unclosedStartMatch.index + unclosedStartMatch[0].length)
      .trim();
    if (trailingThought) {
      extractedBlocks.push(trailingThought);
    }
    cleaned = cleaned.slice(0, unclosedStartMatch.index);
  }

  return {
    content: cleaned.trim(),
    reasoning: extractedBlocks.join('\n\n'),
  };
}

/**
 * Safely strips thinking/reasoning blocks and markdown code fences (```json ... ```)
 * before parsing an AI JSON response cleanly.
 */
export function parseAiJsonResponse<T = unknown>(rawText: string): T {
  const { content } = extractThinkingAndCleanContent(rawText);
  let cleaned = content.trim();

  // Strip surrounding markdown code fences (e.g. ```json ... ``` or ``` ... ```)
  const fenceMatch = cleaned.match(/^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```$/);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  } else {
    cleaned = cleaned
      .replace(/^```(?:json|JSON)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let jsonCandidate = cleaned;

  if (
    firstBrace !== -1 &&
    (firstBracket === -1 || firstBrace < firstBracket)
  ) {
    const lastBrace = cleaned.lastIndexOf('}');
    if (lastBrace > firstBrace) {
      jsonCandidate = cleaned.slice(firstBrace, lastBrace + 1);
    }
  } else if (firstBracket !== -1) {
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > firstBracket) {
      jsonCandidate = cleaned.slice(firstBracket, lastBracket + 1);
    }
  }

  if (!jsonCandidate) {
    throw new Error('AI returned an empty JSON response.');
  }

  return JSON.parse(jsonCandidate) as T;
}

export class AIServiceError extends Error {
  public readonly isCorsOrNetworkError: boolean;
  public readonly corsHint: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    options?: { isCorsOrNetworkError?: boolean; statusCode?: number }
  ) {
    super(message);
    this.name = 'AIServiceError';
    this.isCorsOrNetworkError = Boolean(options?.isCorsOrNetworkError);
    this.statusCode = options?.statusCode;
    this.corsHint =
      'Local AI unreachable or blocked by browser CORS. In LM Studio, enable "Enable CORS" in the Developer Server tab. In Ollama, launch with OLLAMA_ORIGINS="*" ollama serve. In KoboldCPP, run with --cors.';
  }
}

export interface ModelScanResult {
  models: string[];
  loadedModels: string[];
  modelStatuses: Record<string, 'loaded' | 'not-loaded'>;
  isLocalServer: boolean;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  models: string[];
  loadedModels?: string[];
  modelStatuses?: Record<string, 'loaded' | 'not-loaded'>;
  isLocalServer?: boolean;
  detectedFormatLabel: string;
  diagnosticSummary: string;
  message: string;
  corsHint?: string;
}

const NSFW_KEYWORD_REGEX = /\b(nsfw|smut|erotica|explicit|18\+|hentai|lewd)\b/i;

function isTagDefinitionNsfwForAi(tag: TagDefinition): boolean {
  const cat = (tag.category || '').toLowerCase();
  if (
    cat === 'genitals' ||
    cat.includes('nsfw') ||
    cat.includes('extreme') ||
    cat.includes('hentai')
  ) {
    return true;
  }
  if (tag.isNsfw !== undefined) return Boolean(tag.isNsfw);
  return NSFW_KEYWORD_REGEX.test(tag.name || '');
}

function isThemeNsfwForAi(
  theme: ContextTheme | undefined,
  allTags: TagDefinition[]
): boolean {
  if (!theme) return false;
  if (theme.isNsfw) return true;
  if (NSFW_KEYWORD_REGEX.test(theme.name || '')) return true;

  for (const rawSelected of theme.associatedTags || []) {
    const trimmed = (rawSelected || '').trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const cleanLookup = lower.includes(':') ? lower.split(':')[0].trim() : lower;
    const matched = allTags.find(
      (t) =>
        t.name.trim().toLowerCase() === lower ||
        t.name.trim().toLowerCase() === cleanLookup ||
        t.id === trimmed
    );
    if (matched) {
      if (isTagDefinitionNsfwForAi(matched)) return true;
    } else if (NSFW_KEYWORD_REGEX.test(trimmed)) {
      return true;
    }
  }
  return false;
}

/**
 * Synthesizes the active Context Theme's instructions and associated Tag definitions
 * into a unified system prompt context block for AI generation and ghost-text.
 *
 * When `hideNsfw` is true, NSFW themes, NSFW tags, NSFW-category tags, and explicit
 * keywords are strictly stripped so NSFW directives are never sent to the AI backend.
 */
export function buildActiveAIContextBlock(
  theme?: ContextTheme,
  allTags: TagDefinition[] = [],
  activeItemTags: string[] = [],
  hideNsfw = false
): string {
  const themeBlockedBySfw = Boolean(
    hideNsfw && theme && isThemeNsfwForAi(theme, allTags)
  );
  const usableTheme = theme && !themeBlockedBySfw ? theme : undefined;

  if (!usableTheme && activeItemTags.length === 0 && !hideNsfw) {
    return '';
  }

  const combinedTagNames = sortTagsByContextOrder(
    [...(usableTheme?.associatedTags || []), ...activeItemTags],
    allTags
  );

  const tagContextLines: string[] = [];
  const emittedKeys = new Set<string>();

  for (const rawSelected of combinedTagNames) {
    const trimmed = rawSelected.trim();
    const lower = trimmed.toLowerCase();

    // Check if it matches a Tag directly (or a legacy "Parent: Sub" prefix)
    const cleanLookup = lower.includes(':') ? lower.split(':')[0].trim() : lower;
    const mainMatch = allTags.find(
      (t) =>
        t.name.trim().toLowerCase() === lower ||
        t.name.trim().toLowerCase() === cleanLookup ||
        t.id === trimmed
    );
    if (mainMatch) {
      const tagIsNsfw = isTagDefinitionNsfwForAi(mainMatch);
      if (hideNsfw && tagIsNsfw) {
        continue;
      }
      const key = `main:${mainMatch.name.toLowerCase()}`;
      if (!emittedKeys.has(key)) {
        emittedKeys.add(key);
        const desc =
          mainMatch.aiContextDescription ||
          mainMatch.aiDescription ||
          mainMatch.description ||
          '';
        const nsfwMarker = tagIsNsfw ? ' • NSFW 18+' : '';
        tagContextLines.push(
          `- [${mainMatch.name}] (${mainMatch.category}${nsfwMarker}): ${desc}`
        );
      }
    } else if (trimmed) {
      if (hideNsfw && NSFW_KEYWORD_REGEX.test(trimmed)) {
        continue;
      }
      const key = `custom:${lower}`;
      if (!emittedKeys.has(key)) {
        emittedKeys.add(key);
        tagContextLines.push(
          `- [${trimmed}] (Custom): Incorporate thematic, tonal, and character elements consistent with "${trimmed}".`
        );
      }
    }
  }

  return [
    hideNsfw
      ? '### Content Safety Mode:\nSFW Mode is enabled. Keep all generated content strictly Safe For Work (SFW) and exclude any explicit or NSFW material.'
      : '',
    usableTheme ? `### Overarching Context Theme: ${usableTheme.name}` : '',
    usableTheme ? usableTheme.aiContextPrompt.trim() : '',
    tagContextLines.length > 0
      ? `\n### Active Semantic Tag Directives:\n${tagContextLines.join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeBaseUrl(rawUrl: string): {
  rootUrl: string;
  v1Url: string;
} {
  const trimmed = (rawUrl || 'http://localhost:1234/v1').trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/v1beta/openai')) {
    return {
      rootUrl: trimmed.slice(0, -14),
      v1Url: trimmed,
    };
  }
  if (trimmed.endsWith('/api/v1')) {
    return {
      rootUrl: trimmed.slice(0, -7),
      v1Url: trimmed,
    };
  }
  if (trimmed.endsWith('/v1')) {
    const rootUrl = trimmed.slice(0, -3);
    return { rootUrl, v1Url: trimmed };
  }
  return { rootUrl: trimmed, v1Url: `${trimmed}/v1` };
}

function buildAuthHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`;
  }
  return headers;
}

function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (apiKey && apiKey.trim()) {
    headers['x-api-key'] = apiKey.trim();
  }
  return headers;
}

function isHtmlResponse(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('text/html');
}

function isJsonContentType(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('application/json') || ct.includes('+json');
}

function isNonChatModelId(rawId: string): boolean {
  const id = (rawId || '').trim().toLowerCase();
  if (!id) return true;
  return /(?:^|\/)(?:text-embedding|embedding-|embed-|whisper-|tts-|dall-e|omni-moderation|text-moderation|babbage-|davinci-|imagen-|veo-|sora-)/.test(
    id
  );
}

export function isLocalBackend(config: AIBackendConfig): boolean {
  const urlLower = (config.url || '').trim().toLowerCase();
  return (
    config.preset === 'lmstudio' ||
    config.preset === 'ollama' ||
    config.preset === 'koboldcpp' ||
    urlLower.includes('localhost') ||
    urlLower.includes('127.0.0.1') ||
    urlLower.includes('[::1]')
  );
}

export function isAnthropicDirectBackend(config: AIBackendConfig): boolean {
  const urlLower = (config.url || '').trim().toLowerCase();
  return urlLower.includes('api.anthropic.com');
}

export function isGeminiBackend(config: AIBackendConfig): boolean {
  const urlLower = (config.url || '').trim().toLowerCase();
  return (
    config.preset === 'gemini' ||
    urlLower.startsWith('/api/gemini') ||
    urlLower.includes('/api/gemini') ||
    urlLower.includes('generativelanguage.googleapis.com')
  );
}

/**
 * Resolves the active provider's API key, checking the in-memory `config.apiKey` first
 * and decrypting on-demand from the app-private AES-256-GCM vault if needed.
 */
export async function resolveEffectiveApiKey(
  config: AIBackendConfig
): Promise<string> {
  if (config.apiKey && config.apiKey.trim()) {
    return config.apiKey.trim();
  }
  const providerKeyId = getProviderKeyId(config.preset);
  const fromMap =
    config.savedProviderKeys?.[providerKeyId] ||
    config.savedProviderKeys?.[config.preset] ||
    '';
  if (fromMap && fromMap.trim()) {
    return fromMap.trim();
  }
  const decrypted = await getDecryptedKeyForProvider(providerKeyId, config.preset);
  return (decrypted || '').trim();
}

export function isThinkingModelBackend(
  config: AIBackendConfig,
  effectiveFormat?: Exclude<ModelCompatibilityFormat, 'auto'>
): boolean {
  const fmt = effectiveFormat || resolveEffectiveFormat(config);
  const modelLower = (config.modelName || config.model || '').toLowerCase();
  return (
    fmt === 'gemma' ||
    fmt === 'deepseek_qwen_think' ||
    fmt === 'gemini_thinking' ||
    fmt === 'xai_grok_reasoning' ||
    modelLower.includes('gemma') ||
    modelLower.includes('think') ||
    modelLower.includes('r1') ||
    modelLower.includes('qwq') ||
    modelLower.includes('qwen3') ||
    modelLower.includes('deepseek') ||
    modelLower.includes('gemini') ||
    modelLower.includes('grok') ||
    modelLower.startsWith('o1') ||
    modelLower.startsWith('o3') ||
    modelLower.startsWith('o4')
  );
}

/**
 * Determines whether the active backend is Local (LM Studio, Ollama, KoboldCPP, Custom)
 * or uses a Thinking/Reasoning model family (Gemma 4, DeepSeek, Qwen, Gemini, Grok).
 */
export function isLocalOrThinkingBackend(
  config: AIBackendConfig,
  effectiveFormat?: Exclude<ModelCompatibilityFormat, 'auto'>
): boolean {
  return (
    isLocalBackend(config) ||
    config.preset === 'custom' ||
    isThinkingModelBackend(config, effectiveFormat)
  );
}

/**
 * Resolves `max_tokens` / `maxOutputTokens`.
 * Gives full generation headroom for long-form cards/thinking models while keeping
 * inline Ghost-Text fast and concise on non-thinking models.
 */
export function resolveEffectiveMaxTokens(
  config: AIBackendConfig,
  requestedMaxTokens?: number,
  effectiveFormat?: Exclude<ModelCompatibilityFormat, 'auto'>,
  isGhostText = false
): number {
  const base = requestedMaxTokens ?? config.maxTokens ?? 4096;
  const isThinking = isThinkingModelBackend(config, effectiveFormat);
  if (isGhostText) {
    return isThinking ? Math.max(1024, base) : Math.max(96, Math.min(512, base));
  }
  if (isThinking || isLocalOrThinkingBackend(config, effectiveFormat)) {
    return Math.max(4096, base);
  }
  return Math.max(256, base);
}

/**
 * Preserves the selected Gemini / Gemma model ID, defaulting only when empty.
 */
function normalizeGeminiModelId(rawModel?: string): string {
  const m = (rawModel || '').trim().replace(/^models\//i, '');
  if (!m) {
    return 'gemini-2.5-flash';
  }
  return m;
}

/**
 * Normalizes and deduplicates real models returned by the Gemini API without injecting fake entries.
 */
export function buildMergedGeminiModelList(scannedModels: string[] = []): string[] {
  const cleanedScanned = scannedModels
    .map((id) => (id || '').trim().replace(/^models\//i, ''))
    .filter(Boolean);

  return Array.from(new Set(cleanedScanned));
}

function extractModelsFromOpenAiPayload(payload: unknown): string[] {
  const result: string[] = [];
  const pushItem = (raw: unknown) => {
    if (typeof raw === 'string') {
      const clean = raw.trim();
      if (clean && !isNonChatModelId(clean)) result.push(clean);
      return;
    }
    if (raw && typeof raw === 'object') {
      const obj = raw as {
        id?: string;
        name?: string;
        model?: string;
        type?: string;
      };
      if (obj.type === 'embeddings') return;
      const clean = (obj.id || obj.name || obj.model || '')
        .replace(/^models\//i, '')
        .trim();
      if (clean && !isNonChatModelId(clean)) {
        result.push(clean);
      }
    }
  };

  if (payload && typeof payload === 'object') {
    const obj = payload as { data?: unknown; models?: unknown };
    if (Array.isArray(obj.data)) {
      obj.data.forEach(pushItem);
    } else if (Array.isArray(obj.models)) {
      obj.models.forEach(pushItem);
    } else if (Array.isArray(payload)) {
      payload.forEach(pushItem);
    }
  }
  return Array.from(new Set(result));
}

/**
 * Live Model Scanner with Local Loaded vs. Not-Loaded detection:
 * - Cloud APIs: returns ONLY real models available on the endpoint (zero hardcoded placeholders).
 * - Local Servers:
 *   - Ollama: queries `/api/ps` (currently loaded) + `/api/tags` (all installed).
 *   - LM Studio: queries `/api/v0/models` (`state: 'loaded' | 'not-loaded'`) + `/v1/models`.
 *   - KoboldCPP & other local OpenAI-compatible servers: queries `/v1/models` and `/api/v1/model`.
 */
export async function fetchModelsWithStatus(
  config: AIBackendConfig,
  abortSignal?: AbortSignal
): Promise<ModelScanResult> {
  const effectiveKey = await resolveEffectiveApiKey(config);

  // 1. Google Gemini backend (Direct REST with x-goog-api-key header, or local /api/gemini fallback)
  if (isGeminiBackend(config)) {
    if (effectiveKey) {
      const scannedIds: string[] = [];
      let pageToken = '';
      let pageCount = 0;

      do {
        const pageParam = pageToken
          ? `&pageToken=${encodeURIComponent(pageToken)}`
          : '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageParam}`;

        let directRes: Response;
        try {
          directRes = await desktopFetch(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
              'x-goog-api-key': effectiveKey,
            },
            signal: abortSignal,
          });
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          throw new AIServiceError(
            `Could not reach Google Gemini REST API (generativelanguage.googleapis.com): ${err instanceof Error ? err.message : 'Network error'}`,
            { isCorsOrNetworkError: true }
          );
        }

        const directData = await directRes.json().catch(() => ({}));
        if (!directRes.ok) {
          throw new AIServiceError(
            directData?.error?.message ||
              `Gemini API returned HTTP ${directRes.status} (${directRes.statusText || 'Authentication or key error'})`,
            { statusCode: directRes.status }
          );
        }

        if (Array.isArray(directData?.models)) {
          for (const m of directData.models as Array<{
            name?: string;
            id?: string;
            supportedGenerationMethods?: string[];
          }>) {
            if (
              Array.isArray(m.supportedGenerationMethods) &&
              !m.supportedGenerationMethods.includes('generateContent')
            ) {
              continue;
            }
            const id = (m.name || m.id || '').replace(/^models\//i, '').trim();
            if (id && !isNonChatModelId(id)) {
              scannedIds.push(id);
            }
          }
        }

        pageToken =
          typeof directData?.nextPageToken === 'string'
            ? directData.nextPageToken.trim()
            : '';
        pageCount += 1;
      } while (pageToken && pageCount < 50);

      return {
        models: buildMergedGeminiModelList(scannedIds),
        loadedModels: [],
        modelStatuses: {},
        isLocalServer: false,
      };
    }

    if (isTauriDesktop()) {
      throw new AIServiceError(
        'Enter your Google Gemini API key in Options to connect directly.',
        { statusCode: 401 }
      );
    }

    // Only call /api/gemini/models when the user did NOT enter a Gemini API key
    const geminiRes = await fetch('/api/gemini/models', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abortSignal,
    });
    if (!isJsonContentType(geminiRes)) {
      throw new AIServiceError(
        'Enter your Google Gemini API key to connect directly (no server-side /api/gemini endpoint is active).',
        { statusCode: geminiRes.status || 401 }
      );
    }
    const geminiData = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      throw new AIServiceError(
        geminiData?.error ||
          `Gemini endpoint returned HTTP ${geminiRes.status}`,
        { statusCode: geminiRes.status }
      );
    }
    return {
      models: Array.isArray(geminiData?.models)
        ? buildMergedGeminiModelList(geminiData.models)
        : [],
      loadedModels: [],
      modelStatuses: {},
      isLocalServer: false,
    };
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);

  // 2. Direct Anthropic Messages API (`https://api.anthropic.com/v1/models`)
  if (isAnthropicDirectBackend(config)) {
    if (!effectiveKey) {
      throw new AIServiceError(
        'Anthropic API requires an API key.',
        { statusCode: 401 }
      );
    }
    try {
      const anthropicRes = await desktopFetch(`${v1Url}/models`, {
        method: 'GET',
        headers: buildAnthropicHeaders(effectiveKey),
        signal: abortSignal,
      });
      if (isHtmlResponse(anthropicRes)) {
        throw new AIServiceError(
          'Anthropic endpoint returned an unexpected HTML response.',
          { statusCode: anthropicRes.status }
        );
      }
      const payload = await anthropicRes.json().catch(() => ({}));
      if (!anthropicRes.ok) {
        throw new AIServiceError(
          payload?.error?.message ||
            `Anthropic API returned HTTP ${anthropicRes.status} (${anthropicRes.statusText || 'Error'})`,
          { statusCode: anthropicRes.status }
        );
      }
      return {
        models: extractModelsFromOpenAiPayload(payload),
        loadedModels: [],
        modelStatuses: {},
        isLocalServer: false,
      };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (err instanceof AIServiceError) throw err;
      throw new AIServiceError(
        `Could not reach Anthropic API (${config.url}): ${err instanceof Error ? err.message : 'Network error'}`,
        { isCorsOrNetworkError: true }
      );
    }
  }

  const headers = buildAuthHeaders(effectiveKey);
  const localServer = isLocalBackend(config);
  const isOllama = config.preset === 'ollama' || rootUrl.includes('11434');
  const isLmStudio = config.preset === 'lmstudio' || rootUrl.includes('1234');
  const isKobold = config.preset === 'koboldcpp' || rootUrl.includes('5001');

  const collectedModels: string[] = [];
  const modelStatuses: Record<string, 'loaded' | 'not-loaded'> = {};
  const loadedSet = new Set<string>();

  const registerModel = (
    rawName: string,
    status?: 'loaded' | 'not-loaded',
    preserveExistingStatus = false
  ) => {
    const clean = (rawName || '').trim();
    if (!clean) return;
    if (!collectedModels.includes(clean)) {
      collectedModels.push(clean);
    }
    if (localServer && status) {
      if (!preserveExistingStatus || !modelStatuses[clean]) {
        modelStatuses[clean] = status;
      }
      if (modelStatuses[clean] === 'loaded') {
        loadedSet.add(clean);
      }
    }
  };

  let anyEndpointSucceeded = false;
  let lastHttpErrorStatus = 0;
  let lastHttpErrorText = '';

  try {
    // 3A. Ollama native loaded (`/api/ps`) + installed (`/api/tags`) check
    if (isOllama) {
      try {
        const psRes = await desktopFetch(`${rootUrl}/api/ps`, {
          method: 'GET',
          headers,
          signal: abortSignal,
        });
        if (psRes.ok && !isHtmlResponse(psRes)) {
          anyEndpointSucceeded = true;
          const psData = await psRes.json().catch(() => ({}));
          if (Array.isArray(psData?.models)) {
            for (const m of psData.models as Array<{ name?: string; model?: string }>) {
              const id = (m.name || m.model || '').trim();
              if (id) {
                loadedSet.add(id);
                registerModel(id, 'loaded');
              }
            }
          }
        }
      } catch (psErr: unknown) {
        if (psErr instanceof DOMException && psErr.name === 'AbortError') throw psErr;
      }

      try {
        const tagsRes = await desktopFetch(`${rootUrl}/api/tags`, {
          method: 'GET',
          headers,
          signal: abortSignal,
        });
        if (tagsRes.ok && !isHtmlResponse(tagsRes)) {
          anyEndpointSucceeded = true;
          const tagsData = await tagsRes.json().catch(() => ({}));
          if (Array.isArray(tagsData?.models)) {
            for (const m of tagsData.models as Array<{ name?: string; model?: string }>) {
              const id = (m.name || m.model || '').trim();
              if (id && !isNonChatModelId(id)) {
                registerModel(id, loadedSet.has(id) ? 'loaded' : 'not-loaded');
              }
            }
          }
        } else if (!tagsRes.ok) {
          lastHttpErrorStatus = tagsRes.status;
          lastHttpErrorText = tagsRes.statusText;
        }
      } catch (tagsErr: unknown) {
        if (tagsErr instanceof DOMException && tagsErr.name === 'AbortError') throw tagsErr;
      }
    }

    // 3B. LM Studio native REST API v0 (`/api/v0/models`) for loaded vs. not-loaded state
    let lmStudioV0Succeeded = false;
    if (isLmStudio) {
      try {
        const lmsRes = await desktopFetch(`${rootUrl}/api/v0/models`, {
          method: 'GET',
          headers,
          signal: abortSignal,
        });
        if (lmsRes.ok && !isHtmlResponse(lmsRes)) {
          const lmsData = await lmsRes.json().catch(() => ({}));
          const entries = Array.isArray(lmsData?.data)
            ? lmsData.data
            : Array.isArray(lmsData)
              ? lmsData
              : null;
          if (entries) {
            lmStudioV0Succeeded = true;
            anyEndpointSucceeded = true;
            for (const item of entries as Array<{
              id?: string;
              type?: string;
              state?: string;
            }>) {
              if (!item || item.type === 'embeddings') continue;
              const id = (item.id || '').trim();
              if (!id || isNonChatModelId(id)) continue;
              const state: 'loaded' | 'not-loaded' =
                item.state === 'loaded' ? 'loaded' : 'not-loaded';
              registerModel(id, state);
            }
          }
        }
      } catch (lmsErr: unknown) {
        if (lmsErr instanceof DOMException && lmsErr.name === 'AbortError') throw lmsErr;
      }
    }

    // 3C. Standard OpenAI-Compatible `GET /v1/models`
    let v1Response: Response | null = null;
    try {
      v1Response = await desktopFetch(`${v1Url}/models`, {
        method: 'GET',
        headers,
        signal: abortSignal,
      });
    } catch (v1Err: unknown) {
      if (v1Err instanceof DOMException && v1Err.name === 'AbortError') throw v1Err;
      if (!anyEndpointSucceeded && !isKobold) {
        throw v1Err;
      }
    }

    if (v1Response) {
      if (v1Response.status === 401 || v1Response.status === 403) {
        throw new AIServiceError(
          `Invalid API Key or unauthorized access (HTTP ${v1Response.status})`,
          { statusCode: v1Response.status }
        );
      }

      if (v1Response.ok) {
        if (isHtmlResponse(v1Response)) {
          if (!anyEndpointSucceeded) {
            throw new AIServiceError(
              `Endpoint at ${v1Url}/models returned HTML instead of a model list JSON.`,
              { statusCode: v1Response.status }
            );
          }
        } else {
          anyEndpointSucceeded = true;
          const payload = await v1Response.json().catch(() => ({}));
          const ids = extractModelsFromOpenAiPayload(payload);
          for (const id of ids) {
            if (localServer) {
              const inferredStatus: 'loaded' | 'not-loaded' = isOllama
                ? loadedSet.has(id)
                  ? 'loaded'
                  : 'not-loaded'
                : 'loaded';
              registerModel(
                id,
                inferredStatus,
                lmStudioV0Succeeded || isOllama
              );
            } else {
              registerModel(id);
            }
          }
        }
      } else {
        lastHttpErrorStatus = v1Response.status;
        lastHttpErrorText = v1Response.statusText;
      }
    }

    // 3D. KoboldCPP native loaded model endpoint: `GET /api/v1/model`
    if (isKobold || (localServer && collectedModels.length === 0)) {
      try {
        const koboldRes = await desktopFetch(`${rootUrl}/api/v1/model`, {
          method: 'GET',
          headers,
          signal: abortSignal,
        });
        if (koboldRes.ok && !isHtmlResponse(koboldRes)) {
          anyEndpointSucceeded = true;
          const koboldData = await koboldRes.json().catch(() => ({}));
          if (typeof koboldData?.result === 'string' && koboldData.result.trim()) {
            registerModel(koboldData.result.trim(), 'loaded');
          }
        }
      } catch (koboldErr: unknown) {
        if (koboldErr instanceof DOMException && koboldErr.name === 'AbortError') {
          throw koboldErr;
        }
      }
    }

    if (!anyEndpointSucceeded) {
      if (lastHttpErrorStatus > 0) {
        throw new AIServiceError(
          `Endpoint returned HTTP ${lastHttpErrorStatus} (${lastHttpErrorText || 'Error'})`,
          { statusCode: lastHttpErrorStatus }
        );
      }
      throw new AIServiceError(
        localServer
          ? 'Server Offline or Localhost CORS blocked'
          : `Server unreachable at ${config.url}`,
        { isCorsOrNetworkError: true }
      );
    }

    // Sort local models so currently loaded models always appear first
    const sortedModels = localServer
      ? [
          ...collectedModels.filter((m) => modelStatuses[m] === 'loaded'),
          ...collectedModels.filter((m) => modelStatuses[m] !== 'loaded'),
        ]
      : collectedModels;

    const loadedModels = localServer
      ? sortedModels.filter((m) => modelStatuses[m] === 'loaded')
      : [];

    return {
      models: sortedModels,
      loadedModels,
      modelStatuses: localServer ? modelStatuses : {},
      isLocalServer: localServer,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof AIServiceError) {
      throw err;
    }
    const diagnostic = localServer
      ? 'Server Offline or Localhost CORS blocked'
      : `Server unreachable at ${config.url}`;
    throw new AIServiceError(diagnostic, {
      isCorsOrNetworkError: true,
    });
  }
}

export async function fetchModels(
  config: AIBackendConfig,
  abortSignal?: AbortSignal
): Promise<string[]> {
  const result = await fetchModelsWithStatus(config, abortSignal);
  return result.models;
}

/**
 * Wrapper used by Options View and TopBar to test connection reliability, scan available models, and measure latency.
 */
export async function testBackendConnection(
  config: AIBackendConfig,
  signal?: AbortSignal
): Promise<ConnectionTestResult> {
  const start = performance.now();
  const presetMeta = AI_BACKEND_PRESETS.find((p) => p.id === config.preset);
  const effectiveKey = await resolveEffectiveApiKey(config);

  if (
    presetMeta?.requiresKey &&
    !isGeminiBackend(config) &&
    !effectiveKey
  ) {
    const fmt = COMPATIBILITY_FORMAT_LABELS[resolveEffectiveFormat(config)];
    return {
      ok: false,
      latencyMs: 0,
      models: [],
      loadedModels: [],
      modelStatuses: {},
      isLocalServer: isLocalBackend(config),
      detectedFormatLabel: fmt,
      diagnosticSummary: `Invalid or missing API Key for ${presetMeta.label}`,
      message: `🔴 Connection Failed • Invalid or missing API Key for ${presetMeta.label}`,
    };
  }

  try {
    const scan = await fetchModelsWithStatus(
      { ...config, apiKey: effectiveKey },
      signal
    );
    const { models, loadedModels, modelStatuses, isLocalServer } = scan;
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const chosenModel =
      models.includes(config.modelName) && config.modelName
        ? config.modelName
        : loadedModels[0] || models[0] || '';
    const detectedFmtKey = detectModelCompatibilityFormat(
      chosenModel,
      config.preset
    );
    const detectedFormatLabel = COMPATIBILITY_FORMAT_LABELS[detectedFmtKey];
    const keyModeNote = isGeminiBackend(config)
      ? effectiveKey
        ? ' • Direct Gemini REST API'
        : ' • Using /api/gemini Server Fallback'
      : '';
    const modelSummary = isLocalServer
      ? `${loadedModels.length} loaded / ${models.length} local models`
      : `${models.length} available models`;

    return {
      ok: true,
      latencyMs,
      models,
      loadedModels,
      modelStatuses,
      isLocalServer,
      detectedFormatLabel,
      diagnosticSummary: `${latencyMs}ms latency • ${modelSummary} • Format: ${detectedFormatLabel}${keyModeNote}`,
      message: `🟢 Connected & Verified • ${latencyMs}ms latency • ${modelSummary} • Format: ${detectedFormatLabel}${keyModeNote}`,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const fmt = COMPATIBILITY_FORMAT_LABELS[resolveEffectiveFormat(config)];
    if (err instanceof AIServiceError) {
      return {
        ok: false,
        latencyMs,
        models: [],
        loadedModels: [],
        modelStatuses: {},
        isLocalServer: isLocalBackend(config),
        detectedFormatLabel: fmt,
        diagnosticSummary: err.message,
        message: `🔴 Connection Failed • ${err.message}`,
        corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
      };
    }
    return {
      ok: false,
      latencyMs,
      models: [],
      loadedModels: [],
      modelStatuses: {},
      isLocalServer: isLocalBackend(config),
      detectedFormatLabel: fmt,
      diagnosticSummary: 'Server Offline or Localhost CORS blocked',
      message:
        '🔴 Connection Failed • Server Offline or Localhost CORS blocked',
      corsHint:
        'Enable CORS in LM Studio (Developer -> Enable CORS) or run Ollama with OLLAMA_ORIGINS="*".',
    };
  }
}

export interface GenerateCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  /**
   * True when called from SmartEditor's paused-typing bottom suggestion pill.
   */
  isGhostText?: boolean;
  /**
   * When true, strictly excludes all NSFW tags/directives from the AI context prompt.
   */
  hideNsfw?: boolean;
  activeTheme?: ContextTheme;
  allTags?: TagDefinition[];
  characterTags?: string[];
  /**
   * Optional visual context Data URL (Portrait or Temporary Reference Image).
   * NEVER passed by inline Ghost-Text autocomplete; only used on-demand in AI Assist / Wizard.
   */
  imageDataUrl?: string;
  /**
   * Optional array of visual context Data URLs (Portrait + Extra Context-Only Reference Images).
   * NEVER passed by inline Ghost-Text autocomplete; only used on-demand in AI Assist / Wizard.
   */
  imageDataUrls?: string[];
  /**
   * Optional callback invoked if a local server returns HTTP 400 because the GGUF lacks a vision `mmproj` adapter
   * and TavernSmith automatically retries and succeeds with text-only context.
   */
  onVisionFallback?: (warningMessage: string) => void;
}

export interface DetailedCompletionResult {
  content: string;
  reasoning: string;
  detectedFormat: Exclude<ModelCompatibilityFormat, 'auto'>;
  sentSystemPrompt: string;
  usedVisionContext?: boolean;
  visionFallbackWarning?: string;
}

/**
 * Synthesizes the complete system prompt that gets injected into every AI call.
 */
export function buildFullSystemPromptForRequest(
  systemContext: string,
  options?: GenerateCompletionOptions
): string {
  const themeAndTagBlock =
    options?.activeTheme ||
    (options?.characterTags && options.characterTags.length > 0) ||
    options?.hideNsfw
      ? buildActiveAIContextBlock(
          options?.activeTheme,
          options?.allTags || [],
          options?.characterTags || [],
          Boolean(options?.hideNsfw)
        )
      : '';

  return [
    'You are TavernSmith AI, an expert SillyTavern V2/V3 Character & Lorebook co-author.',
    'Follow SillyTavern formatting conventions: use {{char}} for the character name and {{user}} for the user/player name where appropriate. Output only the requested content without conversational filler.',
    themeAndTagBlock,
    systemContext ? `### Card & Task Context:\n${systemContext.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function extractRawTextFromOpenAiContent(rawContent: unknown): {
  text: string;
  inlineThinking: string;
} {
  if (typeof rawContent === 'string') {
    return { text: rawContent, inlineThinking: '' };
  }
  if (Array.isArray(rawContent)) {
    const textParts: string[] = [];
    const thinkParts: string[] = [];
    for (const part of rawContent) {
      if (!part || typeof part !== 'object') continue;
      const p = part as {
        type?: string;
        text?: string;
        thinking?: string;
        content?: string;
      };
      if (p.type === 'thinking' || p.type === 'reasoning') {
        const t = p.thinking || p.text || p.content || '';
        if (t.trim()) thinkParts.push(t.trim());
      } else if (typeof p.text === 'string') {
        textParts.push(p.text);
      } else if (typeof p.content === 'string') {
        textParts.push(p.content);
      }
    }
    return {
      text: textParts.join(''),
      inlineThinking: thinkParts.join('\n\n'),
    };
  }
  return { text: '', inlineThinking: '' };
}

/**
 * Helper to parse a successful OpenAI-compatible chat completion JSON payload.
 */
function parseChatCompletionData(
  data: any,
  detectedFormat: Exclude<ModelCompatibilityFormat, 'auto'>,
  sentSystemPrompt: string
): { result: DetailedCompletionResult | null; hadReasoningOnly: boolean } {
  const messageObj = data?.choices?.[0]?.message;
  const extractedContent = extractRawTextFromOpenAiContent(
    messageObj?.content ??
      data?.choices?.[0]?.text ??
      data?.response ??
      ''
  );
  const reasoningField =
    messageObj?.reasoning_content ??
    messageObj?.reasoning ??
    data?.choices?.[0]?.reasoning_content ??
    '';

  const combinedApiReasoning = [
    typeof reasoningField === 'string' ? reasoningField : '',
    extractedContent.inlineThinking,
  ]
    .filter(Boolean)
    .join('\n\n');

  const parsed = extractThinkingAndCleanContent(
    extractedContent.text,
    combinedApiReasoning || undefined
  );

  if (parsed.content) {
    return {
      result: {
        content: parsed.content,
        reasoning: parsed.reasoning,
        detectedFormat,
        sentSystemPrompt,
      },
      hadReasoningOnly: false,
    };
  }
  return {
    result: null,
    hadReasoningOnly: Boolean(parsed.reasoning),
  };
}

/**
 * Generates completion and returns both the stripped clean content AND any extracted
 * `<think>...</think>`, `<|thought|>...<|/thought|>`, or `reasoning_content` thoughts.
 *
 * - Calls Google Generative Language REST API directly when a Gemini key is provided (never hits `/api/gemini`).
 * - Guarantees `max_tokens` / `maxOutputTokens` >= 4096 for local AIs & thinking models.
 * - Never throws `HTTP 200: OK` as an error when a 200 OK JSON body is returned.
 */
export async function generateCompletionDetailed(
  prompt: string,
  systemContext: string,
  config: AIBackendConfig,
  abortSignal?: AbortSignal,
  options?: GenerateCompletionOptions
): Promise<DetailedCompletionResult> {
  const effectiveFormat = resolveEffectiveFormat(config);
  const fullSystemPrompt = buildFullSystemPromptForRequest(systemContext, options);
  const effectiveKey = await resolveEffectiveApiKey(config);
  const maxTokens = resolveEffectiveMaxTokens(
    config,
    options?.maxTokens,
    effectiveFormat,
    Boolean(options?.isGhostText)
  );
  const temperature = options?.temperature ?? config.temperature ?? 0.75;

  // Compress all unique images for Vision Context (~260 tokens max per image, 512px longest edge, JPEG 0.8)
  const rawImageUrls = Array.from(
    new Set(
      [
        ...(Array.isArray(options?.imageDataUrls) ? options.imageDataUrls : []),
        ...(options?.imageDataUrl ? [options.imageDataUrl] : []),
      ].filter(
        (u): u is string => typeof u === 'string' && u.trim().length > 0
      )
    )
  );

  const compressedImages: Array<{ dataUrl: string; base64: string }> = [];
  for (const rawUrl of rawImageUrls) {
    try {
      const jpegDataUrl = await compressImageForVision(rawUrl, 512);
      const commaIdx = jpegDataUrl.indexOf(',');
      const base64Data =
        commaIdx !== -1
          ? jpegDataUrl.slice(commaIdx + 1).trim()
          : jpegDataUrl.trim();
      if (jpegDataUrl && base64Data) {
        compressedImages.push({ dataUrl: jpegDataUrl, base64: base64Data });
      }
    } catch {
      // Skip unreadable individual image without blocking generation
    }
  }

  // 1. Google Gemini Route
  // Whenever the user provides a Gemini API key, call Google's direct REST API (`generateContent`) directly!
  // NEVER fall through to `/api/gemini/generate` (which throws HTTP 501/403 when no server key exists).
  if (isGeminiBackend(config)) {
    const geminiModel = normalizeGeminiModelId(config.modelName);

    if (effectiveKey) {
      const modelLower = geminiModel.toLowerCase();
      const isGemmaModel = modelLower.includes('gemma');
      const is38Or4 = isGemini38Or4Model(geminiModel);
      const isHydrogen = modelLower.includes('gemini-4-hydrogen');
      const isGhostText = Boolean(options?.isGhostText);

      const userParts: Array<Record<string, unknown>> = isGemmaModel
        ? [
            {
              text: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}`,
            },
          ]
        : [{ text: prompt }];

      for (const img of compressedImages) {
        userParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: img.base64,
          },
        });
      }

      const geminiMaxOutputTokens = is38Or4
        ? isGhostText
          ? 4096
          : 16384
        : isGhostText
          ? Math.max(1024, maxTokens)
          : Math.max(4096, maxTokens);

      const buildGenerationConfig = (includeThinkingConfig: boolean) => {
        const genCfg: Record<string, unknown> = {
          maxOutputTokens: geminiMaxOutputTokens,
        };
        if (!isHydrogen) {
          genCfg.temperature = temperature;
        }
        if (options?.stop && options.stop.length > 0) {
          genCfg.stopSequences = options.stop;
        }
        if (includeThinkingConfig && is38Or4) {
          genCfg.thinkingConfig = {
            thinkingLevel: isGhostText ? 'LOW' : 'MEDIUM',
          };
        }
        return genCfg;
      };

      const buildDirectBody = (includeThinkingConfig: boolean) =>
        isGemmaModel
          ? {
              contents: [
                {
                  role: 'user',
                  parts: userParts,
                },
              ],
              generationConfig: buildGenerationConfig(includeThinkingConfig),
            }
          : {
              systemInstruction: {
                parts: [{ text: fullSystemPrompt }],
              },
              contents: [
                {
                  role: 'user',
                  parts: userParts,
                },
              ],
              generationConfig: buildGenerationConfig(includeThinkingConfig),
            };

      const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent`;

      const sendDirectRequest = async (includeThinkingConfig: boolean) => {
        let res: Response;
        try {
          res = await desktopFetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'x-goog-api-key': effectiveKey,
            },
            signal: abortSignal,
            body: JSON.stringify(buildDirectBody(includeThinkingConfig)),
          });
        } catch (networkErr: unknown) {
          if (networkErr instanceof DOMException && networkErr.name === 'AbortError') {
            throw networkErr;
          }
          throw new AIServiceError(
            `Network error reaching Google Gemini REST API: ${networkErr instanceof Error ? networkErr.message : 'Request blocked'}`,
            { isCorsOrNetworkError: true }
          );
        }
        const data = await res.json().catch(() => ({}));
        return { res, data };
      };

      let { res: directRes, data: directData } = await sendDirectRequest(is38Or4);

      // Automatic fallback: if any model rejects `thinkingConfig` with HTTP 400, retry once WITHOUT `thinkingConfig`
      if (directRes.status === 400 && is38Or4) {
        ({ res: directRes, data: directData } = await sendDirectRequest(false));
      }

      if (!directRes.ok) {
        throw new AIServiceError(
          directData?.error?.message ||
            `Gemini API returned HTTP ${directRes.status}: ${directRes.statusText || 'Generation failed'}`,
          { statusCode: directRes.status }
        );
      }

      const candidate = directData?.candidates?.[0];
      const parts = candidate?.content?.parts;
      let rawText = '';
      let reasoningText = '';
      if (Array.isArray(parts)) {
        for (const p of parts) {
          if (p?.thought && typeof p?.text === 'string') {
            reasoningText += (reasoningText ? '\n\n' : '') + p.text;
          } else if (typeof p?.text === 'string') {
            rawText += p.text;
          }
        }
      }

      const parsedDirect = extractThinkingAndCleanContent(
        rawText,
        reasoningText || undefined
      );
      if (parsedDirect.content) {
        return {
          content: parsedDirect.content,
          reasoning: parsedDirect.reasoning,
          detectedFormat: 'gemini_thinking',
          sentSystemPrompt: fullSystemPrompt,
          usedVisionContext: compressedImages.length > 0,
        };
      }

      const blockReason = directData?.promptFeedback?.blockReason;
      const finishReason = candidate?.finishReason;
      throw new AIServiceError(
        blockReason
          ? `Gemini blocked the request (${blockReason}).`
          : parsedDirect.reasoning
            ? `Gemini consumed output tokens inside thinking blocks without emitting a final answer (${finishReason || 'EMPTY'}).`
            : `Gemini returned an empty response (${finishReason || 'NO_TEXT'}).`,
        { statusCode: 200 }
      );
    }

    if (isTauriDesktop()) {
      throw new AIServiceError(
        'Enter your Google Gemini API key in Options to generate directly.',
        { statusCode: 401 }
      );
    }

    // Only hit `/api/gemini/generate` when NO custom Gemini API key was supplied
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: abortSignal,
      body: JSON.stringify({
        model: geminiModel,
        prompt,
        systemInstruction: fullSystemPrompt,
        temperature,
        maxTokens,
        stopSequences: options?.stop,
        ...(compressedImages.length > 0
          ? {
              inlineData: {
                mimeType: 'image/jpeg',
                data: compressedImages[0].base64,
              },
              inlineDataList: compressedImages.map((img) => ({
                mimeType: 'image/jpeg',
                data: img.base64,
              })),
            }
          : {}),
      }),
    });

    if (!isJsonContentType(response)) {
      throw new AIServiceError(
        'Enter your Google Gemini API key in Options to generate directly (no local /api/gemini endpoint is active).',
        { statusCode: response.status || 401 }
      );
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AIServiceError(
        data?.error ||
          `Gemini endpoint returned HTTP ${response.status}`,
        { statusCode: response.status }
      );
    }

    const parsed = extractThinkingAndCleanContent(
      typeof data?.text === 'string' ? data.text : '',
      typeof data?.reasoning === 'string' ? data.reasoning : undefined
    );

    if (!parsed.content) {
      throw new AIServiceError(
        parsed.reasoning
          ? 'Gemini returned internal thinking only with empty final output.'
          : 'Gemini returned an empty response.',
        { statusCode: 200 }
      );
    }

    return {
      content: parsed.content,
      reasoning: parsed.reasoning,
      detectedFormat: 'gemini_thinking',
      sentSystemPrompt: fullSystemPrompt,
      usedVisionContext: compressedImages.length > 0,
    };
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);

  // 2. Direct Anthropic Messages API (`POST /v1/messages`)
  if (isAnthropicDirectBackend(config)) {
    if (!effectiveKey) {
      throw new AIServiceError(
        'Anthropic API requires an API key. Enter it in Options.',
        { statusCode: 401 }
      );
    }
    if (!config.modelName || !config.modelName.trim()) {
      throw new AIServiceError(
        'No Anthropic model selected. Click Connect in Options to load available models.'
      );
    }
    const anthropicUserContent =
      compressedImages.length > 0
        ? [
            ...compressedImages.map((img) => ({
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: img.base64,
              },
            })),
            { type: 'text', text: prompt },
          ]
        : prompt;

    let anthropicRes: Response;
    try {
      anthropicRes = await desktopFetch(`${v1Url}/messages`, {
        method: 'POST',
        headers: buildAnthropicHeaders(effectiveKey),
        signal: abortSignal,
        body: JSON.stringify({
          model: config.modelName.trim(),
          max_tokens: maxTokens,
          temperature,
          system: fullSystemPrompt,
          messages: [{ role: 'user', content: anthropicUserContent }],
          ...(options?.stop && options.stop.length > 0
            ? { stop_sequences: options.stop }
            : {}),
        }),
      });
    } catch (networkErr: unknown) {
      if (networkErr instanceof DOMException && networkErr.name === 'AbortError') {
        throw networkErr;
      }
      throw new AIServiceError(
        `Network error reaching Anthropic API: ${networkErr instanceof Error ? networkErr.message : 'Request blocked'}`,
        { isCorsOrNetworkError: true }
      );
    }

    const anthropicData = await anthropicRes.json().catch(() => ({}));
    if (!anthropicRes.ok) {
      throw new AIServiceError(
        anthropicData?.error?.message ||
          `Anthropic API returned HTTP ${anthropicRes.status}: ${anthropicRes.statusText || 'Generation failed'}`,
        { statusCode: anthropicRes.status }
      );
    }

    const blocks = Array.isArray(anthropicData?.content) ? anthropicData.content : [];
    const textParts: string[] = [];
    const thinkParts: string[] = [];
    for (const block of blocks as Array<{
      type?: string;
      text?: string;
      thinking?: string;
    }>) {
      if (block?.type === 'thinking' && typeof block.thinking === 'string') {
        thinkParts.push(block.thinking);
      } else if (block?.type === 'text' && typeof block.text === 'string') {
        textParts.push(block.text);
      }
    }

    const parsedAnthropic = extractThinkingAndCleanContent(
      textParts.join(''),
      thinkParts.join('\n\n') || undefined
    );
    if (!parsedAnthropic.content) {
      throw new AIServiceError(
        parsedAnthropic.reasoning
          ? 'Claude consumed output tokens inside thinking blocks without emitting a final reply.'
          : 'Anthropic returned an empty response.',
        { statusCode: 200 }
      );
    }

    return {
      content: parsedAnthropic.content,
      reasoning: parsedAnthropic.reasoning,
      detectedFormat: 'claude_chatml',
      sentSystemPrompt: fullSystemPrompt,
      usedVisionContext: compressedImages.length > 0,
    };
  }

  const headers = buildAuthHeaders(effectiveKey);
  const resolvedModelName = (config.modelName || '').trim() || 'local-model';

  const mergedPromptText = `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}`;

  // Pure text-only message structures (used when no image is attached OR on mmproj 400 fallback)
  const textOnlySystemMergedMessages = [
    {
      role: 'user',
      content: mergedPromptText,
    },
  ];
  const textOnlyStandardMessages = [
    { role: 'system', content: fullSystemPrompt },
    { role: 'user', content: prompt },
  ];

  const openAiImageParts = compressedImages.map((img) => ({
    type: 'image_url',
    image_url: { url: img.dataUrl },
  }));

  // Multimodal OpenAI/LM Studio/OpenRouter content array structures when compressedImages is non-empty
  const systemMergedUserMessages =
    compressedImages.length > 0
      ? [
          {
            role: 'user',
            content: [
              { type: 'text', text: mergedPromptText },
              ...openAiImageParts,
            ],
          },
        ]
      : textOnlySystemMergedMessages;

  const isSystemMergedFormat =
    effectiveFormat === 'gemma' || effectiveFormat === 'mistral';

  const primaryMessages = isSystemMergedFormat
    ? systemMergedUserMessages
    : compressedImages.length > 0
      ? [
          { role: 'system', content: fullSystemPrompt },
          {
            role: 'user',
            content: [{ type: 'text', text: prompt }, ...openAiImageParts],
          },
        ]
      : textOnlyStandardMessages;

  // For Gemma (and system-merged formats), strictly send ONLY universally supported fields
  // (`model`, `messages`, `temperature`, `max_tokens`) so LM Studio / llama.cpp Jinja templates never return HTTP 400.
  const primaryPayload =
    effectiveFormat === 'gemma'
      ? {
          model: resolvedModelName,
          messages: primaryMessages,
          temperature,
          max_tokens: maxTokens,
        }
      : {
          model: resolvedModelName,
          messages: primaryMessages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          ...(options?.stop ? { stop: options.stop } : {}),
        };

  // If Kobold Raw format is explicitly chosen, try `/api/v1/generate` first
  if (effectiveFormat === 'kobold_raw') {
    try {
      const koboldRes = await desktopFetch(`${rootUrl}/api/v1/generate`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          prompt: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}\n\n### Response:\n`,
          max_length: maxTokens,
          temperature,
          ...(options?.stop ? { stop_sequence: options.stop } : {}),
        }),
      });
      if (koboldRes.ok && !isHtmlResponse(koboldRes)) {
        const koboldData = await koboldRes.json().catch(() => ({}));
        const rawText =
          koboldData?.results?.[0]?.text ?? koboldData?.text ?? '';
        const parsed = extractThinkingAndCleanContent(rawText);
        if (parsed.content) {
          return {
            content: parsed.content,
            reasoning: parsed.reasoning,
            detectedFormat: effectiveFormat,
            sentSystemPrompt: fullSystemPrompt,
          };
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

  // Primary attempt: Standard `/v1/chat/completions`
  let chatResponse: Response;
  try {
    chatResponse = await desktopFetch(`${v1Url}/chat/completions`, {
      method: 'POST',
      headers,
      signal: abortSignal,
      body: JSON.stringify(primaryPayload),
    });
  } catch (networkErr: unknown) {
    if (networkErr instanceof DOMException && networkErr.name === 'AbortError') {
      throw networkErr;
    }

    // Try Kobold `/api/v1/generate` fallback on connection error
    try {
      const fallbackResponse = await desktopFetch(`${rootUrl}/api/v1/generate`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          prompt: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}\n\n### Response:\n`,
          max_length: maxTokens,
          temperature,
        }),
      });

      if (fallbackResponse.ok && !isHtmlResponse(fallbackResponse)) {
        const fallbackData = await fallbackResponse.json().catch(() => ({}));
        const fallbackText =
          fallbackData?.results?.[0]?.text ?? fallbackData?.text ?? '';
        const parsed = extractThinkingAndCleanContent(
          typeof fallbackText === 'string' ? fallbackText : ''
        );
        if (parsed.content) {
          return {
            content: parsed.content,
            reasoning: parsed.reasoning,
            detectedFormat: effectiveFormat,
            sentSystemPrompt: fullSystemPrompt,
          };
        }
      }
    } catch (innerErr: unknown) {
      if (innerErr instanceof DOMException && innerErr.name === 'AbortError') {
        throw innerErr;
      }
    }

    const msg =
      networkErr instanceof Error ? networkErr.message : 'Network connection failed';
    throw new AIServiceError(
      `Cannot connect to AI endpoint (${config.url}): ${msg}`,
      { isCorsOrNetworkError: true }
    );
  }

  if (chatResponse.ok) {
    if (isHtmlResponse(chatResponse)) {
      throw new AIServiceError(
        `AI endpoint (${v1Url}/chat/completions) returned HTML instead of a JSON completion response.`,
        { statusCode: chatResponse.status }
      );
    }
    const data = await chatResponse.json().catch(() => ({}));
    const { result, hadReasoningOnly } = parseChatCompletionData(
      data,
      effectiveFormat,
      fullSystemPrompt
    );
    if (result) {
      return {
        ...result,
        usedVisionContext: compressedImages.length > 0,
      };
    }
    throw new AIServiceError(
      hadReasoningOnly
        ? 'Model returned an empty final reply because internal <think> reasoning consumed the output. Increase Max Tokens or simplify the prompt.'
        : 'Model returned an empty response body with no generated text.',
      { statusCode: 200 }
    );
  }

  // Automatic Gemma / Local Server HTTP 400 Fallback:
  if (chatResponse.status === 400 || chatResponse.status === 422) {
    if (!isSystemMergedFormat) {
      const retryResponse = await desktopFetch(`${v1Url}/chat/completions`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          model: resolvedModelName,
          messages: systemMergedUserMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (retryResponse.ok && !isHtmlResponse(retryResponse)) {
        const retryData = await retryResponse.json().catch(() => ({}));
        const { result: retryResult, hadReasoningOnly } = parseChatCompletionData(
          retryData,
          'gemma',
          fullSystemPrompt
        );
        if (retryResult) {
          return {
            ...retryResult,
            usedVisionContext: compressedImages.length > 0,
          };
        }
        throw new AIServiceError(
          hadReasoningOnly
            ? 'Model consumed all tokens inside internal thinking without emitting a final reply.'
            : 'Model returned an empty completion response.',
          { statusCode: 200 }
        );
      }
    }

    if (compressedImages.length > 0) {
      const mmprojWarning =
        'Local server returned HTTP 400 for image input — this GGUF model likely lacks a Vision (mmproj) projector adapter in LM Studio / Ollama. Automatically retried using text-only context.';

      const textOnlyMessages = isSystemMergedFormat
        ? textOnlySystemMergedMessages
        : textOnlyStandardMessages;

      const textOnlyRetryRes = await desktopFetch(`${v1Url}/chat/completions`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          model: resolvedModelName,
          messages: textOnlyMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (textOnlyRetryRes.ok && !isHtmlResponse(textOnlyRetryRes)) {
        const textOnlyData = await textOnlyRetryRes.json().catch(() => ({}));
        const { result: textOnlyParsed, hadReasoningOnly } =
          parseChatCompletionData(
            textOnlyData,
            effectiveFormat,
            fullSystemPrompt
          );
        if (textOnlyParsed) {
          options?.onVisionFallback?.(mmprojWarning);
          return {
            ...textOnlyParsed,
            usedVisionContext: false,
            visionFallbackWarning: mmprojWarning,
          };
        }
        throw new AIServiceError(
          hadReasoningOnly
            ? 'Model consumed all tokens inside internal thinking without emitting a final reply.'
            : 'Model returned an empty completion response.',
          { statusCode: 200 }
        );
      }

      if (
        !isSystemMergedFormat &&
        (textOnlyRetryRes.status === 400 || textOnlyRetryRes.status === 422)
      ) {
        const mergedTextOnlyRes = await desktopFetch(`${v1Url}/chat/completions`, {
          method: 'POST',
          headers,
          signal: abortSignal,
          body: JSON.stringify({
            model: resolvedModelName,
            messages: textOnlySystemMergedMessages,
            temperature,
            max_tokens: maxTokens,
          }),
        });
        if (mergedTextOnlyRes.ok && !isHtmlResponse(mergedTextOnlyRes)) {
          const mergedTextData = await mergedTextOnlyRes.json().catch(() => ({}));
          const { result: mergedTextParsed, hadReasoningOnly } =
            parseChatCompletionData(
              mergedTextData,
              'gemma',
              fullSystemPrompt
            );
          if (mergedTextParsed) {
            options?.onVisionFallback?.(mmprojWarning);
            return {
              ...mergedTextParsed,
              usedVisionContext: false,
              visionFallbackWarning: mmprojWarning,
            };
          }
          throw new AIServiceError(
            hadReasoningOnly
              ? 'Model consumed all tokens inside internal thinking without emitting a final reply.'
              : 'Model returned an empty completion response.',
            { statusCode: 200 }
          );
        }
      }
    }
  }

  // Fallback: `/api/v1/generate`
  if (
    chatResponse.status === 404 ||
    chatResponse.status === 405 ||
    config.preset === 'koboldcpp'
  ) {
    const fallbackResponse = await desktopFetch(`${rootUrl}/api/v1/generate`, {
      method: 'POST',
      headers,
      signal: abortSignal,
      body: JSON.stringify({
        prompt: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}\n\n### Response:\n`,
        max_length: maxTokens,
        temperature,
        ...(options?.stop ? { stop_sequence: options.stop } : {}),
      }),
    });

    if (fallbackResponse.ok && !isHtmlResponse(fallbackResponse)) {
      const fallbackData = await fallbackResponse.json().catch(() => ({}));
      const fallbackText =
        fallbackData?.results?.[0]?.text ?? fallbackData?.text ?? '';
      const parsed = extractThinkingAndCleanContent(
        typeof fallbackText === 'string' ? fallbackText : ''
      );
      if (parsed.content) {
        return {
          content: parsed.content,
          reasoning: parsed.reasoning,
          detectedFormat: effectiveFormat,
          sentSystemPrompt: fullSystemPrompt,
        };
      }
      throw new AIServiceError(
        'Kobold endpoint returned an empty completion response.',
        { statusCode: 200 }
      );
    }
  }

  const errPayload = await chatResponse.json().catch(() => ({}));
  const detailMsg =
    errPayload?.error?.message ||
    (typeof errPayload?.error === 'string' ? errPayload.error : '') ||
    chatResponse.statusText ||
    'Generation failed';
  throw new AIServiceError(
    `AI endpoint returned HTTP ${chatResponse.status}: ${detailMsg}`,
    { statusCode: chatResponse.status }
  );
}

/**
 * Server-side streaming helper via `/api/gemini/stream` (SSE).
 */
export async function generateCompletionStream(
  prompt: string,
  systemContext: string,
  config: AIBackendConfig,
  onChunk: (chunkText: string) => void,
  abortSignal?: AbortSignal,
  options?: GenerateCompletionOptions
): Promise<string> {
  const effectiveFormat = resolveEffectiveFormat(config);
  const fullSystemPrompt = buildFullSystemPromptForRequest(systemContext, options);
  const effectiveKey = await resolveEffectiveApiKey(config);
  const maxTokens = resolveEffectiveMaxTokens(
    config,
    options?.maxTokens,
    effectiveFormat,
    Boolean(options?.isGhostText)
  );
  const temperature = options?.temperature ?? config.temperature ?? 0.75;
  const streamHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (effectiveKey) {
    streamHeaders['Authorization'] = `Bearer ${effectiveKey}`;
  }

  const response = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers: streamHeaders,
    signal: abortSignal,
    body: JSON.stringify({
      model: normalizeGeminiModelId(config.modelName),
      prompt,
      systemInstruction: fullSystemPrompt,
      temperature,
      maxTokens,
      stopSequences: options?.stop,
      ...(effectiveKey ? { apiKey: effectiveKey } : {}),
    }),
  });

  if (!response.ok || !response.body || isHtmlResponse(response)) {
    const errData = await response.json().catch(() => ({}));
    throw new AIServiceError(
      errData?.error || `Streaming request failed (HTTP ${response.status})`,
      { statusCode: response.status }
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr) continue;
        try {
          const payload = JSON.parse(jsonStr);
          if (payload.error) {
            throw new AIServiceError(payload.error);
          }
          if (typeof payload.text === 'string' && payload.text) {
            accumulated += payload.text;
            onChunk(payload.text);
          }
        } catch (e) {
          if (e instanceof AIServiceError) throw e;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    try {
      reader.releaseLock();
    } catch {
      // Ignore already released reader
    }
  }

  return extractThinkingAndCleanContent(accumulated).content;
}

/**
 * Standard string-returning wrapper that automatically strips `<think>...</think>` and `<|thought|>...<|/thought|>` blocks.
 */
export async function generateCompletion(
  prompt: string,
  systemContext: string,
  config: AIBackendConfig,
  abortSignal?: AbortSignal,
  options?: GenerateCompletionOptions
): Promise<string> {
  const detailed = await generateCompletionDetailed(
    prompt,
    systemContext,
    config,
    abortSignal,
    options
  );
  return detailed.content;
}
