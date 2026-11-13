import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemma-3-27b-it',
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
 * Normalizes requested Gemini model names to active supported models
 * and prevents any deprecated 1.5 / 2.0 / 2.5 aliases from causing 404 errors.
 */
function resolveServerGeminiModel(rawModel?: string): string {
  const clean = (rawModel || '').trim().replace(/^models\//i, '');
  if (!clean) return 'gemini-3.8-flash';

  const lower = clean.toLowerCase();
  if (
    lower.startsWith('gemini-1.5') ||
    lower.startsWith('gemini-2.0') ||
    lower.startsWith('gemini-2.5') ||
    lower === 'gemini-pro'
  ) {
    return 'gemini-3.8-flash';
  }

  if (
    SUPPORTED_GEMINI_MODELS.includes(clean) ||
    lower.startsWith('gemini-3.') ||
    lower.startsWith('gemma-3')
  ) {
    return clean;
  }

  return 'gemini-3.8-flash';
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

  app.use(express.json({ limit: '10mb' }));

  // GET /api/gemini/models — Returns supported Gemini models
  app.get('/api/gemini/models', async (req, res) => {
    try {
      const customKey = extractCustomApiKey(req);
      if (!customKey && !process.env.GEMINI_API_KEY) {
        res.status(403).json({
          error:
            'No Gemini API key provided and server GEMINI_API_KEY is not configured.',
          models: SUPPORTED_GEMINI_MODELS,
        });
        return;
      }

      res.json({
        models: SUPPORTED_GEMINI_MODELS,
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

      let resolvedInlineData: { mimeType: string; data: string } | null = null;
      if (
        inlineData &&
        typeof inlineData === 'object' &&
        typeof inlineData.data === 'string' &&
        inlineData.data.trim()
      ) {
        resolvedInlineData = {
          mimeType:
            typeof inlineData.mimeType === 'string' && inlineData.mimeType
              ? inlineData.mimeType
              : 'image/jpeg',
          data: inlineData.data.trim(),
        };
      } else if (typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
        const commaIndex = imageDataUrl.indexOf(',');
        if (commaIndex !== -1) {
          const header = imageDataUrl.slice(5, commaIndex);
          const mimeMatch = header.split(';')[0] || 'image/jpeg';
          const base64Part = imageDataUrl.slice(commaIndex + 1).trim();
          if (base64Part) {
            resolvedInlineData = {
              mimeType: mimeMatch,
              data: base64Part,
            };
          }
        }
      }

      const contentsPayload = resolvedInlineData
        ? {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: resolvedInlineData.mimeType,
                  data: resolvedInlineData.data,
                },
              },
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
