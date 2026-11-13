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
  'qwen3',
  'pixtral',
  'llava',
  'llama-4',
  'llama4',
  'llama-3.2-vision',
  'llama3.2-vision',
  'minicpm-v',
  'grok',
  'gpt-4o',
  'gpt-4.1',
  'claude-3',
  'claude-4',
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

export const GEMINI_PRIORITY_MODELS: readonly string[] = [
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

export function isDeprecatedGeminiModel(rawModel?: string): boolean {
  const m = (rawModel || '').trim().replace(/^models\//i, '').toLowerCase();
  if (!m) return false;
  return (
    m === 'gemini-pro' ||
    m.startsWith('gemini-1.') ||
    m.startsWith('gemini-2.0') ||
    m.startsWith('gemini-2.5')
  );
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
    defaultModel: 'gemma-4-27b-it',
    description:
      'Local OpenAI-compatible server running via LM Studio on port 1234 (Supports Gemma 4, Llama 3/4, Qwen, DeepSeek).',
    requiresKey: false,
    suggestedModels: [
      'gemma-4-27b-it',
      'gemma-4-12b-it',
      'gemma-3-27b-it',
      'llama-3.3-70b-instruct',
      'qwen2.5-32b-instruct',
      'deepseek-r1-distill-llama-8b',
      'mistral-nemo-instruct-2407',
    ],
  },
  {
    id: 'ollama',
    providerKey: 'ollama',
    label: 'Ollama (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: 'gemma4:latest',
    description:
      'Local Ollama daemon with /v1 and /api/tags support on port 11434 (No key needed).',
    requiresKey: false,
    suggestedModels: [
      'gemma4:latest',
      'gemma3:27b',
      'llama3.3:latest',
      'llama3.2:latest',
      'deepseek-r1:14b',
      'qwen2.5:14b',
      'mistral-nemo:latest',
    ],
  },
  {
    id: 'koboldcpp',
    providerKey: 'kobold',
    label: 'KoboldCPP / TextGenWebUI (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:5001/v1',
    defaultModel: 'koboldcpp-model',
    description:
      'Local GGUF server exposing /v1/chat/completions and /api/v1/generate fallback.',
    requiresKey: false,
    suggestedModels: ['koboldcpp-model', 'gemma-4-gguf', 'text-generation-webui'],
  },
  {
    id: 'gemini',
    providerKey: 'google',
    label: 'Google Gemini',
    group: 'Cloud API',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.8-flash',
    description:
      'Google Gemini API. Calls Google Generative Language REST API directly when a Gemini API key is provided, or /api/gemini when left empty.',
    requiresKey: true,
    suggestedModels: [...GEMINI_PRIORITY_MODELS],
  },
  {
    id: 'xai_grok',
    providerKey: 'xai',
    label: 'X / xAI Grok',
    group: 'Cloud API',
    defaultUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3-beta',
    description: 'xAI Grok endpoint with reasoning_content parsing.',
    requiresKey: true,
    suggestedModels: ['grok-3-beta', 'grok-3-mini-beta', 'grok-2-latest'],
  },
  {
    id: 'openrouter_llama',
    providerKey: 'openrouter',
    label: 'OpenRouter (Llama 4 / Gemma 4 / DeepSeek)',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-4-maverick',
    description:
      'OpenRouter unified gateway for Meta Llama 4, Google Gemma 4, DeepSeek R1, and Claude.',
    requiresKey: true,
    suggestedModels: [
      'meta-llama/llama-4-maverick',
      'meta-llama/llama-4-scout',
      'google/gemma-4-27b-it',
      'google/gemma-3-27b-it',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.7-sonnet',
    ],
  },
  {
    id: 'groq_llama',
    providerKey: 'groq',
    label: 'Groq LPU (Llama 4 / Gemma / DeepSeek)',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    description:
      'Ultra-low-latency LPU inference for Meta Llama 4, Gemma, and DeepSeek R1.',
    requiresKey: true,
    suggestedModels: [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'gemma2-9b-it',
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
    ],
  },
  {
    id: 'meta_direct',
    providerKey: 'meta',
    label: 'Meta Llama Direct API',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://api.llama.com/compat/v1',
    defaultModel: 'Llama-4-Maverick-17B-128E-Instruct-FP8',
    description: 'Direct Meta Llama compatibility endpoint.',
    requiresKey: true,
    suggestedModels: [
      'Llama-4-Maverick-17B-128E-Instruct-FP8',
      'Llama-4-Scout-17B-16E-Instruct-FP8',
      'Llama-3.3-70B-Instruct',
    ],
  },
  {
    id: 'openai_compatible',
    providerKey: 'openai',
    label: 'OpenAI API',
    group: 'Cloud API',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    description: 'Official OpenAI chat/completions endpoint.',
    requiresKey: true,
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
  },
  {
    id: 'anthropic',
    providerKey: 'anthropic',
    label: 'Anthropic Claude (Compatible)',
    group: 'Cloud API',
    defaultUrl: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-3-7-sonnet-latest',
    description: 'Anthropic Claude OpenAI-compatible endpoint or proxy.',
    requiresKey: true,
    suggestedModels: [
      'claude-3-7-sonnet-latest',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
    ],
  },
  {
    id: 'custom',
    providerKey: 'custom',
    label: 'Custom OpenAI-Compatible Proxy',
    group: 'Cloud API',
    defaultUrl: 'http://localhost:8000/v1',
    defaultModel: 'custom-model',
    description: 'Any custom vLLM, TabbyAPI, Aphrodite, or OpenAI-compatible endpoint.',
    requiresKey: false,
    suggestedModels: ['custom-model', 'gemma-4-27b-it', 'llama-3.3-70b-instruct'],
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

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  models: string[];
  detectedFormatLabel: string;
  diagnosticSummary: string;
  message: string;
  corsHint?: string;
}

/**
 * Synthesizes the active Context Theme's instructions and ALL associated Tag definitions
 * into a unified system prompt context block for AI generation and ghost-text.
 *
 * CRITICAL RULE: Always includes all attached tags (including `isNsfw: true` tags)
 * regardless of whether "Hide NSFW Content" is toggled ON in the visual UI!
 */
export function buildActiveAIContextBlock(
  theme?: ContextTheme,
  allTags: TagDefinition[] = [],
  activeItemTags: string[] = []
): string {
  if (!theme) return '';

  const combinedTagNames = Array.from(
    new Set([...(theme.associatedTags || []), ...activeItemTags])
  ).filter(Boolean);

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
      const key = `main:${mainMatch.name.toLowerCase()}`;
      if (!emittedKeys.has(key)) {
        emittedKeys.add(key);
        const desc =
          mainMatch.aiContextDescription ||
          mainMatch.aiDescription ||
          mainMatch.description ||
          '';
        const nsfwMarker = mainMatch.isNsfw ? ' • NSFW 18+' : '';
        tagContextLines.push(
          `- [${mainMatch.name}] (${mainMatch.category}${nsfwMarker}): ${desc}`
        );
      }
    }
  }

  return [
    `### Overarching Context Theme: ${theme.name}`,
    theme.aiContextPrompt.trim(),
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
    const rootUrl = trimmed.slice(0, -7);
    return { rootUrl, v1Url: `${rootUrl}/v1` };
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

export function isGeminiBackend(config: AIBackendConfig): boolean {
  const urlLower = (config.url || '').trim().toLowerCase();
  const modelLower = (config.modelName || '').trim().toLowerCase();
  return (
    config.preset === 'gemini' ||
    urlLower.startsWith('/api/gemini') ||
    urlLower.includes('/api/gemini') ||
    urlLower.includes('generativelanguage.googleapis.com') ||
    modelLower.startsWith('gemini-')
  );
}

/**
 * Resolves the active provider's API key, checking the in-memory `config.apiKey` first
 * and decrypting on-demand from the AES-256-GCM vault (`_tavernsmith_vault_enc`) if needed.
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

/**
 * Determines whether the active backend is Local (LM Studio, Ollama, KoboldCPP, Custom)
 * or uses a Thinking/Reasoning model family (Gemma 4, DeepSeek, Qwen, Gemini, Grok).
 */
export function isLocalOrThinkingBackend(
  config: AIBackendConfig,
  effectiveFormat?: Exclude<ModelCompatibilityFormat, 'auto'>
): boolean {
  const fmt = effectiveFormat || resolveEffectiveFormat(config);
  const urlLower = (config.url || '').toLowerCase();
  const modelLower = (config.modelName || config.model || '').toLowerCase();
  const isLocal =
    config.preset === 'lmstudio' ||
    config.preset === 'ollama' ||
    config.preset === 'koboldcpp' ||
    config.preset === 'custom' ||
    urlLower.includes('localhost') ||
    urlLower.includes('127.0.0.1');
  const isThinking =
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
    modelLower.includes('grok');
  return isLocal || isThinking;
}

/**
 * Enforces a minimum of 4096 tokens for Local AIs and Thinking models so internal reasoning
 * never exhausts `max_tokens` / `maxOutputTokens` and returns an empty 200 OK payload.
 */
export function resolveEffectiveMaxTokens(
  config: AIBackendConfig,
  requestedMaxTokens?: number,
  effectiveFormat?: Exclude<ModelCompatibilityFormat, 'auto'>
): number {
  const base = requestedMaxTokens ?? config.maxTokens ?? 4096;
  if (isLocalOrThinkingBackend(config, effectiveFormat)) {
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
    return 'gemini-3.8-flash';
  }
  return m;
}

/**
 * Merges live scanned Gemini/Gemma/API models with the prioritized Gemini 4 / 3.8 / Gemma 4 catalog
 * without hiding any model returned by the API pull.
 */
export function buildMergedGeminiModelList(scannedModels: string[] = []): string[] {
  const cleanedScanned = scannedModels
    .map((id) => (id || '').trim().replace(/^models\//i, ''))
    .filter(Boolean);

  return Array.from(new Set([...GEMINI_PRIORITY_MODELS, ...cleanedScanned]));
}

/**
 * Live Model Scanner:
 * - For Google Gemini with a user API key: calls Google's direct REST API
 *   (`https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=...`, following `nextPageToken`)
 *   and merges ALL returned models with the Gemini 4 / 3.8 / Gemma 4 priority catalog.
 * - For Google Gemini without an API key: queries `/api/gemini/models`.
 * - For other providers: queries `/v1/models`, Ollama `/api/tags`, and KoboldCPP `/api/v1/model`.
 */
export async function fetchModels(
  config: AIBackendConfig,
  abortSignal?: AbortSignal
): Promise<string[]> {
  const effectiveKey = await resolveEffectiveApiKey(config);

  // 1. Google Gemini backend
  if (isGeminiBackend(config)) {
    if (effectiveKey) {
      const scannedIds: string[] = [];
      let pageToken = '';
      let pageCount = 0;

      do {
        const pageParam = pageToken
          ? `&pageToken=${encodeURIComponent(pageToken)}`
          : '';
        const url = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000${pageParam}&key=${encodeURIComponent(effectiveKey)}`;

        let directRes: Response;
        try {
          directRes = await fetch(url, {
            method: 'GET',
            headers: { Accept: 'application/json' },
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
          }>) {
            const id = (m.name || m.id || '').replace(/^models\//i, '').trim();
            if (id) {
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

      return buildMergedGeminiModelList(scannedIds);
    }

    // Only call /api/gemini/models when the user did NOT enter a Gemini API key
    const geminiRes = await fetch('/api/gemini/models', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abortSignal,
    });
    const geminiData = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      throw new AIServiceError(
        geminiData?.error ||
          `Gemini endpoint returned HTTP ${geminiRes.status}`,
        { statusCode: geminiRes.status }
      );
    }
    if (Array.isArray(geminiData?.models) && geminiData.models.length > 0) {
      return buildMergedGeminiModelList(geminiData.models);
    }
    return [...GEMINI_PRIORITY_MODELS];
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(effectiveKey);

  const collectedModels: string[] = [];
  const pushModels = (items: string[]) => {
    for (const raw of items) {
      const clean = (raw || '').trim();
      if (clean && !collectedModels.includes(clean)) {
        collectedModels.push(clean);
      }
    }
  };

  try {
    // 2. Standard OpenAI-Compatible `GET /v1/models`
    const response = await fetch(`${v1Url}/models`, {
      method: 'GET',
      headers,
      signal: abortSignal,
    });

    if (response.ok) {
      const payload = await response.json();
      if (Array.isArray(payload?.data)) {
        pushModels(
          payload.data.map(
            (item: { id?: string; name?: string; model?: string } | string) =>
              typeof item === 'string'
                ? item
                : item.id || item.name || item.model || ''
          )
        );
      } else if (Array.isArray(payload?.models)) {
        pushModels(
          payload.models.map(
            (item: { id?: string; name?: string; model?: string } | string) =>
              typeof item === 'string'
                ? item
                : (item.id || item.name || item.model || '').replace(/^models\//, '')
          )
        );
      } else if (Array.isArray(payload)) {
        pushModels(
          payload.map(
            (item: { id?: string; name?: string; model?: string } | string) =>
              typeof item === 'string'
                ? item
                : item.id || item.name || item.model || ''
          )
        );
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new AIServiceError(
        `Invalid API Key or unauthorized access (HTTP ${response.status})`,
        { statusCode: response.status }
      );
    }

    // 3. Ollama Native Check: `GET /api/tags` (merged with /v1/models so neither endpoint hides models)
    if (config.preset === 'ollama' || rootUrl.includes('11434')) {
      try {
        const ollamaRes = await fetch(`${rootUrl}/api/tags`, {
          method: 'GET',
          headers,
          signal: abortSignal,
        });
        if (ollamaRes.ok) {
          const ollamaData = await ollamaRes.json();
          if (Array.isArray(ollamaData?.models)) {
            pushModels(
              ollamaData.models.map(
                (m: { name?: string; model?: string }) => m.name || m.model || ''
              )
            );
          }
        }
      } catch (ollamaErr: unknown) {
        if (ollamaErr instanceof DOMException && ollamaErr.name === 'AbortError') {
          throw ollamaErr;
        }
      }
    }

    if (collectedModels.length > 0) {
      return collectedModels;
    }

    // 4. KoboldCPP Fallback: `GET /api/v1/model`
    const fallbackRes = await fetch(`${rootUrl}/api/v1/model`, {
      method: 'GET',
      headers,
      signal: abortSignal,
    });

    if (fallbackRes.ok) {
      const fallbackData = await fallbackRes.json();
      if (typeof fallbackData?.result === 'string' && fallbackData.result.trim()) {
        return [fallbackData.result.trim()];
      }
    }

    if (!response.ok) {
      throw new AIServiceError(
        `Endpoint returned HTTP ${response.status} (${response.statusText || 'Error'})`,
        { statusCode: response.status }
      );
    }

    return [config.modelName || 'default-model'];
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    if (err instanceof AIServiceError) {
      throw err;
    }
    const isLocal =
      config.url.includes('localhost') || config.url.includes('127.0.0.1');
    const diagnostic = isLocal
      ? 'Server Offline or Localhost CORS blocked'
      : `Server unreachable at ${config.url}`;
    throw new AIServiceError(diagnostic, {
      isCorsOrNetworkError: true,
    });
  }
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
      detectedFormatLabel: fmt,
      diagnosticSummary: `Invalid or missing API Key for ${presetMeta.label}`,
      message: `🔴 Connection Failed • Invalid or missing API Key for ${presetMeta.label}`,
    };
  }

  try {
    const models = await fetchModels({ ...config, apiKey: effectiveKey }, signal);
    const latencyMs = Math.max(1, Math.round(performance.now() - start));
    const chosenModel =
      models.includes(config.modelName) && config.modelName
        ? config.modelName
        : models[0] || config.modelName;
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

    return {
      ok: true,
      latencyMs,
      models,
      detectedFormatLabel,
      diagnosticSummary: `${latencyMs}ms latency • ${models.length} models detected • Format: ${detectedFormatLabel}${keyModeNote}`,
      message: `🟢 Connected & Verified • ${latencyMs}ms latency • ${models.length} models detected • Format: ${detectedFormatLabel}${keyModeNote}`,
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
   * Uses `thinkingLevel: "LOW"` and `maxOutputTokens: 8192` on Gemini 3.8 / 4.
   */
  isGhostText?: boolean;
  activeTheme?: ContextTheme;
  allTags?: TagDefinition[];
  characterTags?: string[];
  /**
   * Optional visual context Data URL (Portrait or Temporary Reference Image).
   * NEVER passed by inline Ghost-Text autocomplete; only used on-demand in AI Assist / Wizard.
   */
  imageDataUrl?: string;
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
  const themeAndTagBlock = options?.activeTheme
    ? buildActiveAIContextBlock(
        options.activeTheme,
        options.allTags || [],
        options.characterTags || []
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
    effectiveFormat
  );
  const temperature = options?.temperature ?? config.temperature ?? 0.75;

  // Compress image for Vision Context if provided (~260 tokens max, 512px longest edge, JPEG 0.8)
  let compressedJpegDataUrl: string | undefined;
  let compressedBase64Data: string | undefined;
  if (options?.imageDataUrl && typeof options.imageDataUrl === 'string') {
    try {
      compressedJpegDataUrl = await compressImageForVision(
        options.imageDataUrl,
        512
      );
      const commaIdx = compressedJpegDataUrl.indexOf(',');
      compressedBase64Data =
        commaIdx !== -1
          ? compressedJpegDataUrl.slice(commaIdx + 1).trim()
          : compressedJpegDataUrl;
    } catch {
      compressedJpegDataUrl = undefined;
      compressedBase64Data = undefined;
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

      if (compressedBase64Data) {
        userParts.push({
          inlineData: {
            mimeType: 'image/jpeg',
            data: compressedBase64Data,
          },
        });
      }

      // Gemini 3.8 / 4 use unified maxOutputTokens (thinking + output combined) and `thinkingLevel`
      // (`LOW` for Ghost Text, `MEDIUM` for AI Assist/Wizard). Never send `thinkingBudget` or `"MINIMAL"`.
      const geminiMaxOutputTokens = is38Or4
        ? isGhostText
          ? 8192
          : 16384
        : Math.max(8192, maxTokens);

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

      const endpointUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(effectiveKey)}`;

      const sendDirectRequest = async (includeThinkingConfig: boolean) => {
        let res: Response;
        try {
          res = await fetch(endpointUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
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
          usedVisionContext: Boolean(compressedBase64Data),
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
        ...(compressedBase64Data
          ? {
              inlineData: {
                mimeType: 'image/jpeg',
                data: compressedBase64Data,
              },
            }
          : {}),
      }),
    });

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
      usedVisionContext: Boolean(compressedBase64Data),
    };
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(effectiveKey);

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

  // Multimodal OpenAI/LM Studio/OpenRouter content array structures when compressedJpegDataUrl is present
  const systemMergedUserMessages = compressedJpegDataUrl
    ? [
        {
          role: 'user',
          content: [
            { type: 'text', text: mergedPromptText },
            { type: 'image_url', image_url: { url: compressedJpegDataUrl } },
          ],
        },
      ]
    : textOnlySystemMergedMessages;

  const isSystemMergedFormat =
    effectiveFormat === 'gemma' || effectiveFormat === 'mistral';

  const primaryMessages = isSystemMergedFormat
    ? systemMergedUserMessages
    : compressedJpegDataUrl
      ? [
          { role: 'system', content: fullSystemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: compressedJpegDataUrl } },
            ],
          },
        ]
      : textOnlyStandardMessages;

  // For Gemma (and system-merged formats), strictly send ONLY universally supported fields
  // (`model`, `messages`, `temperature`, `max_tokens`) so LM Studio / llama.cpp Jinja templates never return HTTP 400.
  const primaryPayload =
    effectiveFormat === 'gemma'
      ? {
          model: config.modelName || 'local-model',
          messages: primaryMessages,
          temperature,
          max_tokens: maxTokens,
        }
      : {
          model: config.modelName || 'local-model',
          messages: primaryMessages,
          temperature,
          max_tokens: maxTokens,
          stream: false,
          ...(options?.stop ? { stop: options.stop } : {}),
        };

  // If Kobold Raw format is explicitly chosen, try `/api/v1/generate` first
  if (effectiveFormat === 'kobold_raw') {
    try {
      const koboldRes = await fetch(`${rootUrl}/api/v1/generate`, {
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
      if (koboldRes.ok) {
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
    chatResponse = await fetch(`${v1Url}/chat/completions`, {
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
      const fallbackResponse = await fetch(`${rootUrl}/api/v1/generate`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          prompt: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}\n\n### Response:\n`,
          max_length: maxTokens,
          temperature,
        }),
      });

      if (fallbackResponse.ok) {
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
    const data = await chatResponse.json().catch(() => ({}));
    const { result, hadReasoningOnly } = parseChatCompletionData(
      data,
      effectiveFormat,
      fullSystemPrompt
    );
    if (result) {
      return {
        ...result,
        usedVisionContext: Boolean(compressedJpegDataUrl),
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
      const retryResponse = await fetch(`${v1Url}/chat/completions`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          model: config.modelName || 'local-model',
          messages: systemMergedUserMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (retryResponse.ok) {
        const retryData = await retryResponse.json().catch(() => ({}));
        const { result: retryResult, hadReasoningOnly } = parseChatCompletionData(
          retryData,
          'gemma',
          fullSystemPrompt
        );
        if (retryResult) {
          return {
            ...retryResult,
            usedVisionContext: Boolean(compressedJpegDataUrl),
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

    if (compressedJpegDataUrl) {
      const mmprojWarning =
        'Local server returned HTTP 400 for image input — this GGUF model likely lacks a Vision (mmproj) projector adapter in LM Studio / Ollama. Automatically retried using text-only context.';

      const textOnlyMessages = isSystemMergedFormat
        ? textOnlySystemMergedMessages
        : textOnlyStandardMessages;

      const textOnlyRetryRes = await fetch(`${v1Url}/chat/completions`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          model: config.modelName || 'local-model',
          messages: textOnlyMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      if (textOnlyRetryRes.ok) {
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
        const mergedTextOnlyRes = await fetch(`${v1Url}/chat/completions`, {
          method: 'POST',
          headers,
          signal: abortSignal,
          body: JSON.stringify({
            model: config.modelName || 'local-model',
            messages: textOnlySystemMergedMessages,
            temperature,
            max_tokens: maxTokens,
          }),
        });
        if (mergedTextOnlyRes.ok) {
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
    const fallbackResponse = await fetch(`${rootUrl}/api/v1/generate`, {
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

    if (fallbackResponse.ok) {
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
  const fullSystemPrompt = buildFullSystemPromptForRequest(systemContext, options);
  const effectiveKey = await resolveEffectiveApiKey(config);
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
      ...(effectiveKey ? { apiKey: effectiveKey } : {}),
    }),
  });

  if (!response.ok || !response.body) {
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
