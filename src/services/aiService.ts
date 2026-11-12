import {
  AIBackendConfig,
  AIPresetId,
  ContextTheme,
  ModelCompatibilityFormat,
  ProviderKeyId,
  TagDefinition,
} from '../types';

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
    defaultUrl: '/api/gemini',
    defaultModel: 'gemini-3.8-flash',
    description:
      'Server-side Google Gemini integration powered by @google/genai.',
    requiresKey: false,
    suggestedModels: [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemma-3-27b-it',
    ],
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

  return {
    content: cleaned.trim(),
    reasoning: extractedBlocks.join('\n\n'),
  };
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
    modelLower.startsWith('gemini-')
  );
}

/**
 * Live Model Scanner: Queries `/api/gemini/models` for server-side Gemini,
 * or `/v1/models`, Ollama `/api/tags`, and KoboldCPP `/api/v1/model` for local/custom backends.
 */
export async function fetchModels(
  config: AIBackendConfig,
  abortSignal?: AbortSignal
): Promise<string[]> {
  // 1. Server-side Gemini endpoint (`/api/gemini/models`)
  if (isGeminiBackend(config)) {
    const geminiRes = await fetch('/api/gemini/models', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: abortSignal,
    });
    const geminiData = await geminiRes.json().catch(() => ({}));
    if (!geminiRes.ok) {
      throw new AIServiceError(
        geminiData?.error ||
          `Server Gemini endpoint returned HTTP ${geminiRes.status}`,
        { statusCode: geminiRes.status }
      );
    }
    if (Array.isArray(geminiData?.models) && geminiData.models.length > 0) {
      return geminiData.models;
    }
    return [
      'gemini-3.8-flash',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemma-3-27b-it',
    ];
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(config.apiKey);

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
        const list = payload.data
          .map((item: { id?: string; name?: string }) => item.id || item.name || '')
          .filter(Boolean);
        if (list.length > 0) return list;
      }
      if (Array.isArray(payload?.models)) {
        const list = payload.models
          .map((item: { id?: string; name?: string } | string) =>
            typeof item === 'string'
              ? item
              : (item.id || item.name || '').replace(/^models\//, '')
          )
          .filter(Boolean);
        if (list.length > 0) return list;
      }
    }

    if (response.status === 401 || response.status === 403) {
      throw new AIServiceError(
        `Invalid API Key or unauthorized access (HTTP ${response.status})`,
        { statusCode: response.status }
      );
    }

    // 3. Ollama Native Fallback: `GET /api/tags`
    if (config.preset === 'ollama' || rootUrl.includes('11434')) {
      const ollamaRes = await fetch(`${rootUrl}/api/tags`, {
        method: 'GET',
        headers,
        signal: abortSignal,
      });
      if (ollamaRes.ok) {
        const ollamaData = await ollamaRes.json();
        if (Array.isArray(ollamaData?.models)) {
          const list = ollamaData.models
            .map((m: { name?: string; model?: string }) => m.name || m.model || '')
            .filter(Boolean);
          if (list.length > 0) return list;
        }
      }
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

  if (
    presetMeta?.requiresKey &&
    !isGeminiBackend(config) &&
    !config.apiKey.trim()
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
    const models = await fetchModels(config, signal);
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

    return {
      ok: true,
      latencyMs,
      models,
      detectedFormatLabel,
      diagnosticSummary: `${latencyMs}ms latency • ${models.length} models detected • Format: ${detectedFormatLabel}`,
      message: `🟢 Connected & Verified • ${latencyMs}ms latency • ${models.length} models detected • Format: ${detectedFormatLabel}`,
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
  activeTheme?: ContextTheme;
  allTags?: TagDefinition[];
  characterTags?: string[];
}

export interface DetailedCompletionResult {
  content: string;
  reasoning: string;
  detectedFormat: Exclude<ModelCompatibilityFormat, 'auto'>;
  sentSystemPrompt: string;
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

/**
 * Helper to parse a successful OpenAI-compatible chat completion JSON payload.
 */
function parseChatCompletionData(
  data: any,
  detectedFormat: Exclude<ModelCompatibilityFormat, 'auto'>,
  sentSystemPrompt: string
): DetailedCompletionResult | null {
  const messageObj = data?.choices?.[0]?.message;
  const rawContent =
    messageObj?.content ??
    data?.choices?.[0]?.text ??
    data?.response ??
    '';
  const reasoningField =
    messageObj?.reasoning_content ??
    messageObj?.reasoning ??
    data?.choices?.[0]?.reasoning_content ??
    '';

  const parsed = extractThinkingAndCleanContent(
    typeof rawContent === 'string' ? rawContent : '',
    typeof reasoningField === 'string' ? reasoningField : undefined
  );

  if (parsed.content) {
    return {
      content: parsed.content,
      reasoning: parsed.reasoning,
      detectedFormat,
      sentSystemPrompt,
    };
  }
  return null;
}

/**
 * Generates completion and returns both the stripped clean content AND any extracted
 * `<think>...</think>`, `<|thought|>...<|/thought|>`, or `reasoning_content` thoughts.
 *
 * Includes critical Gemma 4 / LM Studio compatibility:
 * - When `effectiveFormat === 'gemma'`, merges the system prompt into the `user` message
 *   (`"[SYSTEM INSTRUCTIONS]\n" + systemPrompt + "\n\n[USER REQUEST]\n" + userPrompt`)
 *   and sends strictly `{ model, messages, temperature, max_tokens }`.
 * - Also automatically falls back to this system-merged user payload if any server returns HTTP 400!
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

  // Server-side Google Gemini route (`/api/gemini/generate`)
  if (isGeminiBackend(config)) {
    const response = await fetch('/api/gemini/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      signal: abortSignal,
      body: JSON.stringify({
        model: config.modelName || 'gemini-3.8-flash',
        prompt,
        systemInstruction: fullSystemPrompt,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new AIServiceError(
        data?.error ||
          `Server Gemini endpoint returned HTTP ${response.status}`,
        { statusCode: response.status }
      );
    }

    const parsed = extractThinkingAndCleanContent(
      typeof data?.text === 'string' ? data.text : '',
      typeof data?.reasoning === 'string' ? data.reasoning : undefined
    );

    return {
      content: parsed.content,
      reasoning: parsed.reasoning,
      detectedFormat: 'gemini_thinking',
      sentSystemPrompt: fullSystemPrompt,
    };
  }

  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(config.apiKey);

  const maxTokens = options?.maxTokens ?? config.maxTokens ?? 512;
  const temperature = options?.temperature ?? config.temperature ?? 0.75;

  const systemMergedUserMessages = [
    {
      role: 'user',
      content: `[SYSTEM INSTRUCTIONS]\n${fullSystemPrompt}\n\n[USER REQUEST]\n${prompt}`,
    },
  ];

  const isSystemMergedFormat =
    effectiveFormat === 'gemma' || effectiveFormat === 'mistral';

  const primaryMessages = isSystemMergedFormat
    ? systemMergedUserMessages
    : [
        { role: 'system', content: fullSystemPrompt },
        { role: 'user', content: prompt },
      ];

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
        const koboldData = await koboldRes.json();
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
  try {
    const chatResponse = await fetch(`${v1Url}/chat/completions`, {
      method: 'POST',
      headers,
      signal: abortSignal,
      body: JSON.stringify(primaryPayload),
    });

    if (chatResponse.ok) {
      const data = await chatResponse.json();
      const parsedResult = parseChatCompletionData(
        data,
        effectiveFormat,
        fullSystemPrompt
      );
      if (parsedResult) return parsedResult;
    }

    // Automatic Gemma / Local Server HTTP 400 Fallback:
    // If a local server (LM Studio, llama.cpp, vLLM, etc.) rejects `"role": "system"` or extra OpenAI params with HTTP 400/422,
    // immediately retry with the System-Merged User Message and minimal `{ model, messages, temperature, max_tokens }` payload!
    if (chatResponse.status === 400 || chatResponse.status === 422) {
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
        const retryData = await retryResponse.json();
        const retryResult = parseChatCompletionData(
          retryData,
          'gemma',
          fullSystemPrompt
        );
        if (retryResult) return retryResult;
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
        const fallbackData = await fallbackResponse.json();
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
    }

    throw new AIServiceError(
      `AI endpoint returned HTTP ${chatResponse.status}: ${chatResponse.statusText || 'Generation failed'}`,
      { statusCode: chatResponse.status }
    );
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }

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
        const fallbackData = await fallbackResponse.json();
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

    // If a localhost backend is unreachable in the hosted browser environment,
    // automatically fall back to the server-side Gemini endpoint (`/api/gemini/generate`)
    // so the app keeps working for everyone who opens it!
    const isLocalhostUrl =
      config.url.includes('localhost') || config.url.includes('127.0.0.1');
    if (isLocalhostUrl) {
      try {
        const serverGeminiFallback = await fetch('/api/gemini/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          signal: abortSignal,
          body: JSON.stringify({
            model: 'gemini-3.8-flash',
            prompt,
            systemInstruction: fullSystemPrompt,
          }),
        });
        if (serverGeminiFallback.ok) {
          const geminiData = await serverGeminiFallback.json();
          const parsed = extractThinkingAndCleanContent(
            typeof geminiData?.text === 'string' ? geminiData.text : '',
            typeof geminiData?.reasoning === 'string'
              ? geminiData.reasoning
              : undefined
          );
          if (parsed.content) {
            return {
              content: parsed.content,
              reasoning: parsed.reasoning,
              detectedFormat: 'gemini_thinking',
              sentSystemPrompt: fullSystemPrompt,
            };
          }
        }
      } catch (geminiFallbackErr: unknown) {
        if (
          geminiFallbackErr instanceof DOMException &&
          geminiFallbackErr.name === 'AbortError'
        ) {
          throw geminiFallbackErr;
        }
      }
    }

    if (err instanceof AIServiceError) {
      throw err;
    }

    const msg = err instanceof Error ? err.message : 'Network connection failed';
    throw new AIServiceError(
      `Cannot connect to AI endpoint (${config.url}): ${msg}`,
      {
        isCorsOrNetworkError: true,
      }
    );
  }
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
  const response = await fetch('/api/gemini/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    signal: abortSignal,
    body: JSON.stringify({
      model: config.modelName || 'gemini-3.8-flash',
      prompt,
      systemInstruction: fullSystemPrompt,
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
