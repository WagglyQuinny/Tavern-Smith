import {
  AIBackendConfig,
  AIPresetId,
  ContextTheme,
  ModelCompatibilityFormat,
  TagDefinition,
} from '../types';

export interface AIPresetMeta {
  id: AIPresetId;
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
    label: 'LM Studio (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:1234/v1',
    defaultModel: 'llama-3.3-70b-instruct',
    description: 'Local OpenAI-compatible server running via LM Studio on port 1234 (No key needed).',
    requiresKey: false,
    suggestedModels: [
      'llama-3.3-70b-instruct',
      'qwen2.5-32b-instruct',
      'deepseek-r1-distill-llama-8b',
      'mistral-nemo-instruct-2407',
    ],
  },
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.3:latest',
    description: 'Local Ollama daemon with /v1 and /api/tags support on port 11434 (No key needed).',
    requiresKey: false,
    suggestedModels: [
      'llama3.3:latest',
      'llama3.2:latest',
      'deepseek-r1:14b',
      'qwen2.5:14b',
      'mistral-nemo:latest',
    ],
  },
  {
    id: 'koboldcpp',
    label: 'KoboldCPP / TextGenWebUI (Local)',
    group: 'Local Server',
    defaultUrl: 'http://localhost:5001/v1',
    defaultModel: 'koboldcpp-model',
    description: 'Local GGUF server exposing /v1/chat/completions and /api/v1/generate fallback.',
    requiresKey: false,
    suggestedModels: ['koboldcpp-model', 'text-generation-webui'],
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    group: 'Cloud API',
    defaultUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    description: 'Google Gemini OpenAI-compatible endpoint & native v1beta/models scanner.',
    requiresKey: true,
    suggestedModels: [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash-thinking-exp',
    ],
  },
  {
    id: 'xai_grok',
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
    label: 'Meta Llama 4 / Muse (OpenRouter)',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-4-maverick',
    description: 'OpenRouter unified gateway for Meta Llama 4 Maverick/Scout, DeepSeek, and Claude.',
    requiresKey: true,
    suggestedModels: [
      'meta-llama/llama-4-maverick',
      'meta-llama/llama-4-scout',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-r1',
      'anthropic/claude-3.7-sonnet',
    ],
  },
  {
    id: 'groq_llama',
    label: 'Meta Llama 4 / Muse (Groq)',
    group: 'Meta Llama & Cloud',
    defaultUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'meta-llama/llama-4-scout-17b-16e-instruct',
    description: 'Ultra-low-latency LPU inference for Meta Llama 4, Llama 3.3, and DeepSeek R1.',
    requiresKey: true,
    suggestedModels: [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'meta-llama/llama-4-maverick-17b-128e-instruct',
      'llama-3.3-70b-versatile',
      'deepseek-r1-distill-llama-70b',
    ],
  },
  {
    id: 'meta_direct',
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
    label: 'OpenAI / Anthropic / Custom Compatible',
    group: 'Cloud API',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    description: 'Any OpenAI-compatible v1 chat/completions endpoint or custom proxy.',
    requiresKey: true,
    suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'claude-3-7-sonnet-latest'],
  },
];

export const COMPATIBILITY_FORMAT_LABELS: Record<
  Exclude<ModelCompatibilityFormat, 'auto'>,
  string
> = {
  llama_3_4: 'Llama 3 / 4 Instruct',
  deepseek_qwen_think: 'DeepSeek / Qwen <think>',
  gemini_thinking: 'Gemini Thinking',
  xai_grok_reasoning: 'xAI Grok Reasoning',
  mistral: 'Mistral Instruct',
  claude_chatml: 'Claude / ChatML',
  kobold_raw: 'Kobold Raw',
};

/**
 * Automatically detects the model family and compatibility format from the selected model ID and preset.
 */
export function detectModelCompatibilityFormat(
  modelName: string,
  preset: AIPresetId
): Exclude<ModelCompatibilityFormat, 'auto'> {
  const m = (modelName || '').toLowerCase();

  if (preset === 'koboldcpp' || m.includes('kobold')) {
    return 'kobold_raw';
  }
  if (
    m.includes('deepseek') ||
    m.includes('qwen') ||
    m.includes('qwq') ||
    m.includes('r1')
  ) {
    return 'deepseek_qwen_think';
  }
  if (preset === 'gemini' || m.includes('gemini')) {
    return 'gemini_thinking';
  }
  if (preset === 'xai_grok' || m.includes('grok')) {
    return 'xai_grok_reasoning';
  }
  if (m.includes('mistral') || m.includes('mixtral') || m.includes('nemo')) {
    return 'mistral';
  }
  if (m.includes('claude') || m.includes('gpt-') || m.includes('o1') || m.includes('o3')) {
    return 'claude_chatml';
  }
  if (
    m.includes('llama') ||
    m.includes('muse') ||
    preset === 'openrouter_llama' ||
    preset === 'groq_llama' ||
    preset === 'meta_direct'
  ) {
    return 'llama_3_4';
  }

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
 * Strips `<think>...</think>`, `<thought>...</thought>`, and `<reasoning>...</reasoning>`
 * blocks from raw LLM responses so chain-of-thought never pollutes Character or Lorebook fields.
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

  // Match complete <think>...</think>, <thought>...</thought>, <reasoning>...</reasoning>
  const tagRegex = /<(think|thought|reasoning)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  cleaned = cleaned.replace(tagRegex, (_fullMatch, _tag, innerText) => {
    if (innerText && innerText.trim()) {
      extractedBlocks.push(innerText.trim());
    }
    return '';
  });

  // Also handle unclosed leading <think> if max_tokens cut off or model omitted opening tag before </think>
  if (cleaned.includes('</think>')) {
    const parts = cleaned.split('</think>');
    if (parts.length > 1) {
      const thoughtPart = parts[0].replace(/<think[^>]*>/gi, '').trim();
      if (thoughtPart) {
        extractedBlocks.push(thoughtPart);
      }
      cleaned = parts.slice(1).join('</think>');
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
  message: string;
  corsHint?: string;
}

/**
 * Synthesizes the active Context Theme's instructions and associated Tag definitions
 * into a unified system prompt context block for AI generation and ghost-text.
 */
export function buildActiveAIContextBlock(
  theme?: ContextTheme,
  allTags: TagDefinition[] = [],
  activeItemTags: string[] = []
): string {
  if (!theme) return '';

  const combinedTagNames = Array.from(
    new Set([...(theme.associatedTags || []), ...activeItemTags])
  );

  const matchedTags = combinedTagNames
    .map((tagName) =>
      allTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase())
    )
    .filter((t): t is TagDefinition => Boolean(t));

  const tagContextLines = matchedTags
    .map((t) => `- [${t.name}] (${t.category}): ${t.aiContextDescription}`)
    .join('\n');

  return [
    `### Overarching Context Theme: ${theme.name}`,
    theme.aiContextPrompt.trim(),
    matchedTags.length > 0
      ? `\n### Active Semantic Tag Directives:\n${tagContextLines}`
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

/**
 * Live Model Scanner: Queries `/v1/models`, Ollama `/api/tags`, Gemini `/v1beta/models`,
 * and KoboldCPP `/api/v1/model` to discover all hosted models on the target backend.
 */
export async function fetchModels(
  config: AIBackendConfig,
  abortSignal?: AbortSignal
): Promise<string[]> {
  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(config.apiKey);

  // 1. If Gemini endpoint and key provided, support both /v1beta/openai/models and native /v1beta/models?key=
  if (
    config.preset === 'gemini' ||
    config.url.includes('generativelanguage.googleapis.com')
  ) {
    try {
      const keyParam = config.apiKey.trim()
        ? `?key=${encodeURIComponent(config.apiKey.trim())}`
        : '';
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models${keyParam}`,
        {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: abortSignal,
        }
      );
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        if (Array.isArray(geminiData?.models)) {
          const parsed = geminiData.models
            .map((m: { name?: string }) =>
              (m.name || '').replace(/^models\//, '')
            )
            .filter((name: string) => name.startsWith('gemini'));
          if (parsed.length > 0) return parsed;
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
    }
  }

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
    const rawMessage = err instanceof Error ? err.message : 'Network error';
    throw new AIServiceError(`Failed to reach ${config.url}: ${rawMessage}`, {
      isCorsOrNetworkError: true,
    });
  }
}

/**
 * Wrapper used by Options View and TopBar to scan available models and measure latency.
 */
export async function testBackendConnection(
  config: AIBackendConfig,
  signal?: AbortSignal
): Promise<ConnectionTestResult> {
  const start = performance.now();
  try {
    const models = await fetchModels(config, signal);
    const latencyMs = Math.round(performance.now() - start);
    return {
      ok: true,
      latencyMs,
      models,
      message:
        models.length > 0
          ? `Connected (${latencyMs}ms) · ${models.length} model${models.length === 1 ? '' : 's'} discovered`
          : `Connected (${latencyMs}ms) · Endpoint reachable`,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw err;
    }
    const latencyMs = Math.round(performance.now() - start);
    if (err instanceof AIServiceError) {
      return {
        ok: false,
        latencyMs,
        models: [],
        message: err.message,
        corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
      };
    }
    return {
      ok: false,
      latencyMs,
      models: [],
      message: 'Connection failed. Verify the server URL and CORS settings.',
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
 * Generates completion and returns both the stripped clean content AND any extracted
 * `<think>...</think>` or `reasoning_content` thoughts for the collapsible AI Reasoning accordion.
 */
export async function generateCompletionDetailed(
  prompt: string,
  systemContext: string,
  config: AIBackendConfig,
  abortSignal?: AbortSignal,
  options?: GenerateCompletionOptions
): Promise<DetailedCompletionResult> {
  const { rootUrl, v1Url } = normalizeBaseUrl(config.url);
  const headers = buildAuthHeaders(config.apiKey);
  const effectiveFormat = resolveEffectiveFormat(config);
  const fullSystemPrompt = buildFullSystemPromptForRequest(systemContext, options);

  const maxTokens = options?.maxTokens ?? config.maxTokens ?? 512;
  const temperature = options?.temperature ?? config.temperature ?? 0.75;

  // Format-specific payload adjustments
  const messages =
    effectiveFormat === 'mistral'
      ? [
          {
            role: 'user',
            content: `${fullSystemPrompt}\n\n### Request:\n${prompt}`,
          },
        ]
      : [
          { role: 'system', content: fullSystemPrompt },
          { role: 'user', content: prompt },
        ];

  // If Kobold Raw format is explicitly chosen, try `/api/v1/generate` first
  if (effectiveFormat === 'kobold_raw') {
    try {
      const koboldRes = await fetch(`${rootUrl}/api/v1/generate`, {
        method: 'POST',
        headers,
        signal: abortSignal,
        body: JSON.stringify({
          prompt: `${fullSystemPrompt}\n\n### User Request:\n${prompt}\n\n### Response:\n`,
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
      body: JSON.stringify({
        model: config.modelName || 'local-model',
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
        ...(options?.stop ? { stop: options.stop } : {}),
      }),
    });

    if (chatResponse.ok) {
      const data = await chatResponse.json();
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
          detectedFormat: effectiveFormat,
          sentSystemPrompt: fullSystemPrompt,
        };
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
          prompt: `${fullSystemPrompt}\n\n### User Request:\n${prompt}\n\n### Response:\n`,
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
          prompt: `${fullSystemPrompt}\n\n### User Request:\n${prompt}\n\n### Response:\n`,
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

    if (err instanceof AIServiceError) {
      throw err;
    }

    const msg = err instanceof Error ? err.message : 'Network connection failed';
    throw new AIServiceError(`Cannot connect to AI endpoint (${config.url}): ${msg}`, {
      isCorsOrNetworkError: true,
    });
  }
}

/**
 * Standard string-returning wrapper that automatically strips `<think>...</think>` blocks.
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
