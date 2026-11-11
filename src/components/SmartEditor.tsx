import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from 'react';
import {
  Sparkles,
  Cpu,
  AlertTriangle,
  CornerDownLeft,
  X,
  Loader2,
  Braces,
  Check,
  Eye,
  ChevronDown,
  ChevronRight,
  Brain,
  PlusCircle,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  AIServiceError,
  buildFullSystemPromptForRequest,
  COMPATIBILITY_FORMAT_LABELS,
  generateCompletion,
  generateCompletionDetailed,
  resolveEffectiveFormat,
} from '../services/aiService';
import { estimateTokens } from '../utils/tokenCounter';
import { Tooltip } from './Tooltip';

export interface MacroDefinition {
  macro: string;
  label: string;
  description: string;
}

export const SILLYTAVERN_MACROS: MacroDefinition[] = [
  {
    macro: '{{char}}',
    label: '{{char}}',
    description: "Inserts the active character's name dynamically.",
  },
  {
    macro: '{{user}}',
    label: '{{user}}',
    description: "Inserts the current user/player persona's name.",
  },
  {
    macro: '{{random:A,B}}',
    label: '{{random:A,B}}',
    description: 'Picks one random item from the comma-separated options.',
  },
  {
    macro: '{{roll:1d20}}',
    label: '{{roll:1d20}}',
    description: 'Rolls dice using standard RPG notation (e.g., 1d20, 2d6+3).',
  },
  {
    macro: '{{time}}',
    label: '{{time}}',
    description: 'Inserts the current system clock time.',
  },
  {
    macro: '{{date}}',
    label: '{{date}}',
    description: 'Inserts the current system calendar date.',
  },
  {
    macro: '{{weekday}}',
    label: '{{weekday}}',
    description: 'Inserts the current day of the week (e.g., Monday).',
  },
  {
    macro: '{{idle_duration}}',
    label: '{{idle_duration}}',
    description: 'Time elapsed since the last message in the conversation.',
  },
];

export interface SmartEditorProps {
  label: string;
  fieldKey: string;
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  tooltip?: string;
  rows?: number;
  isPermanentTokenField?: boolean;
  extraContextSummary?: string;
  additionalTags?: string[];
}

/**
 * Renders visible text and highlighted SillyTavern macros (`{{...}}` and `<START>`)
 * inside the synchronized backdrop with ZERO horizontal padding (`px-0`) and ZERO border width (`border-0`)
 * so glyph widths match the transparent foreground `<textarea>` 1:1 without drift or double-rendering.
 */
function renderHighlightedBackdrop(text: string): React.ReactNode[] {
  if (!text) return [];
  const regex = /(\{\{[^{}\n]+\}\}|<START>)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;
    if (
      (part.startsWith('{{') && part.endsWith('}}')) ||
      part === '<START>'
    ) {
      return (
        <mark
          key={index}
          style={{
            backgroundColor:
              'color-mix(in srgb, var(--theme-accent) 26%, transparent)',
            color: 'var(--theme-accent)',
          }}
          className="px-0 py-0 m-0 border-0 rounded-xs font-normal"
        >
          {part}
        </mark>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export const SmartEditor: React.FC<SmartEditorProps> = ({
  label,
  fieldKey,
  value,
  onChange,
  placeholder = 'Write markdown or type {{ for SillyTavern macros...',
  tooltip,
  rows = 5,
  isPermanentTokenField = true,
  extraContextSummary,
  additionalTags = [],
}) => {
  const { character, activeTheme, tags, aiConfig } = useStore();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);

  // Non-AI Macro Autocomplete state
  const [macroMenuOpen, setMacroMenuOpen] = useState(false);
  const [macroQuery, setMacroQuery] = useState('');
  const [macroTriggerIndex, setMacroTriggerIndex] = useState<number | null>(null);
  const [selectedMacroIdx, setSelectedMacroIdx] = useState(0);

  // Predictive AI Ghost Text state
  const [ghostText, setGhostText] = useState('');
  const [isFetchingGhost, setIsFetchingGhost] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // "AI Assist" Drawer state
  const [showGenerateBar, setShowGenerateBar] = useState(false);
  const [customInstruction, setCustomInstruction] = useState('');
  const [assistMode, setAssistMode] = useState<'replace' | 'append'>('replace');
  const [isGeneratingField, setIsGeneratingField] = useState(false);
  const [showPreviewContext, setShowPreviewContext] = useState(false);
  const [lastReasoning, setLastReasoning] = useState<string>('');
  const [showReasoningAccordion, setShowReasoningAccordion] = useState(false);
  const [aiError, setAiError] = useState<{
    message: string;
    corsHint?: string;
  } | null>(null);

  // Timers and AbortControllers for strict memory & race-condition hygiene
  const ghostDebounceTimerRef = useRef<number | null>(null);
  const ghostAbortControllerRef = useRef<AbortController | null>(null);
  const generateAbortControllerRef = useRef<AbortController | null>(null);

  const tokenCount = useMemo(() => estimateTokens(value), [value]);

  const combinedActiveTagNames = useMemo(
    () => Array.from(new Set([...(character.tags || []), ...additionalTags])),
    [character.tags, additionalTags]
  );

  const effectiveFormatLabel = useMemo(() => {
    const fmt = resolveEffectiveFormat(aiConfig);
    return COMPATIBILITY_FORMAT_LABELS[fmt];
  }, [aiConfig]);

  const detectedMacros = useMemo(() => {
    const matches = value.match(/\{\{[^{}\n]+\}\}/g);
    return matches ? Array.from(new Set(matches)) : [];
  }, [value]);

  const filteredMacros = useMemo(() => {
    if (!macroQuery) return SILLYTAVERN_MACROS;
    const q = macroQuery.toLowerCase();
    return SILLYTAVERN_MACROS.filter(
      (item) =>
        item.macro.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q)
    );
  }, [macroQuery]);

  // Synchronize backdrop scroll position with textarea scroll
  const handleScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const cancelPendingGhostRequest = useCallback(() => {
    if (ghostDebounceTimerRef.current !== null) {
      window.clearTimeout(ghostDebounceTimerRef.current);
      ghostDebounceTimerRef.current = null;
    }
    if (ghostAbortControllerRef.current) {
      ghostAbortControllerRef.current.abort();
      ghostAbortControllerRef.current = null;
    }
    setIsFetchingGhost(false);
  }, []);

  useEffect(() => {
    return () => {
      if (ghostDebounceTimerRef.current !== null) {
        window.clearTimeout(ghostDebounceTimerRef.current);
      }
      if (ghostAbortControllerRef.current) {
        ghostAbortControllerRef.current.abort();
      }
      if (generateAbortControllerRef.current) {
        generateAbortControllerRef.current.abort();
      }
    };
  }, []);

  const evaluateMacroTrigger = (textValue: string, caretPos: number) => {
    const textBeforeCaret = textValue.slice(0, caretPos);
    const lastOpenBraces = textBeforeCaret.lastIndexOf('{{');

    if (lastOpenBraces === -1) {
      setMacroMenuOpen(false);
      setMacroTriggerIndex(null);
      return;
    }

    const sliceSinceOpen = textBeforeCaret.slice(lastOpenBraces + 2);
    if (
      sliceSinceOpen.includes('}}') ||
      sliceSinceOpen.includes('\n') ||
      sliceSinceOpen.length > 24
    ) {
      setMacroMenuOpen(false);
      setMacroTriggerIndex(null);
      return;
    }

    setMacroTriggerIndex(lastOpenBraces);
    setMacroQuery(sliceSinceOpen);
    setSelectedMacroIdx(0);
    setMacroMenuOpen(true);
  };

  const insertMacro = (macroString: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const caretPos = textarea.selectionStart ?? value.length;
    const startIdx =
      macroTriggerIndex !== null ? macroTriggerIndex : caretPos;

    const before = value.slice(0, startIdx);
    const after = value.slice(caretPos);
    const updated = `${before}${macroString}${after}`;

    onChange(updated);
    setMacroMenuOpen(false);
    setMacroTriggerIndex(null);
    setMacroQuery('');

    const newCaretPos = startIdx + macroString.length;
    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCaretPos, newCaretPos);
      }
    });
  };

  const acceptGhostText = useCallback(() => {
    if (!ghostText) return;
    const needsLeadingSpace =
      value.length > 0 &&
      !/\s$/.test(value) &&
      !/^[\s.,!?;:'")]/.test(ghostText);
    const combined = `${value}${needsLeadingSpace ? ' ' : ''}${ghostText}`;
    onChange(combined);
    setGhostText('');

    window.requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const end = combined.length;
        textareaRef.current.setSelectionRange(end, end);
      }
    });
  }, [ghostText, value, onChange]);

  // Build snapshot of existing card fields for system context
  const cardContextSnapshot = useMemo(() => {
    return [
      `Character Name: ${character.name || '{{char}}'}`,
      character.nickname ? `Nickname: ${character.nickname}` : '',
      character.description && fieldKey !== 'description'
        ? `Description: ${character.description.slice(0, 500)}`
        : '',
      character.personality && fieldKey !== 'personality'
        ? `Personality: ${character.personality.slice(0, 400)}`
        : '',
      character.scenario && fieldKey !== 'scenario'
        ? `Scenario: ${character.scenario.slice(0, 400)}`
        : '',
      extraContextSummary || '',
    ]
      .filter(Boolean)
      .join('\n');
  }, [
    character.name,
    character.nickname,
    character.description,
    character.personality,
    character.scenario,
    fieldKey,
    extraContextSummary,
  ]);

  const previewSentContextText = useMemo(() => {
    return buildFullSystemPromptForRequest(cardContextSnapshot, {
      activeTheme,
      allTags: tags,
      characterTags: combinedActiveTagNames,
    });
  }, [cardContextSnapshot, activeTheme, tags, combinedActiveTagNames]);

  // Trigger debounced AI Ghost Text when user pauses typing
  useEffect(() => {
    cancelPendingGhostRequest();

    if (
      !isFocused ||
      !aiConfig.ghostTextEnabled ||
      macroMenuOpen ||
      isGeneratingField ||
      value.trim().length < 18
    ) {
      return;
    }

    const delay = Math.max(250, aiConfig.debounceMs || 650);

    ghostDebounceTimerRef.current = window.setTimeout(async () => {
      const controller = new AbortController();
      ghostAbortControllerRef.current = controller;
      setIsFetchingGhost(true);

      const continuationPrompt = [
        `Continue the following "${label}" text naturally with 1 to 2 concise sentences in Markdown.`,
        `Output ONLY the direct continuation text (no quotes around it, no preamble, do not repeat the existing text).`,
        `\nExisting "${label}" text:\n${value.slice(-900)}`,
      ].join('\n');

      try {
        const completion = await generateCompletion(
          continuationPrompt,
          cardContextSnapshot,
          aiConfig,
          controller.signal,
          {
            maxTokens: 90,
            temperature: aiConfig.temperature,
            activeTheme,
            allTags: tags,
            characterTags: combinedActiveTagNames,
          }
        );

        if (!controller.signal.aborted && completion.trim()) {
          const cleaned = completion
            .replace(/^["'`]+|["'`]+$/g, '')
            .trim();
          setGhostText(cleaned);
          setAiError(null);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsFetchingGhost(false);
        }
      }
    }, delay);

    return () => {
      cancelPendingGhostRequest();
    };
  }, [
    value,
    isFocused,
    aiConfig,
    macroMenuOpen,
    isGeneratingField,
    cardContextSnapshot,
    label,
    activeTheme,
    tags,
    combinedActiveTagNames,
    cancelPendingGhostRequest,
  ]);

  // Handle per-field "AI Assist" generation (Rewrite/Generate or Append)
  const handleGenerateField = async (
    modeOverride?: 'replace' | 'append',
    e?: React.FormEvent
  ) => {
    if (e) e.preventDefault();
    const targetMode = modeOverride || assistMode;

    if (generateAbortControllerRef.current) {
      generateAbortControllerRef.current.abort();
    }
    cancelPendingGhostRequest();
    setGhostText('');
    setAiError(null);

    const controller = new AbortController();
    generateAbortControllerRef.current = controller;
    setIsGeneratingField(true);

    const userDirective = customInstruction.trim()
      ? `Custom Instruction from Creator: "${customInstruction.trim()}"`
      : 'Write vivid, high-craft SillyTavern roleplay content tailored to the active Context Theme and semantic tags.';

    const promptText =
      targetMode === 'append' && value.trim()
        ? [
            `Continue and append a new paragraph or section to the "${label}" (${fieldKey}) field for "${character.name || '{{char}}'}".`,
            userDirective,
            `\nExisting "${label}" Content (do NOT repeat this; write only the new continuation to append):\n${value}`,
          ].join('\n')
        : [
            `Write or refine the "${label}" (${fieldKey}) field for the SillyTavern character card "${character.name || '{{char}}'}".`,
            userDirective,
            value.trim()
              ? `\nCurrent "${label}" Draft (improve, expand, or rewrite according to the instructions):\n${value}`
              : `\nThe "${label}" field is currently empty. Generate a complete, compelling entry.`,
            `\nOutput ONLY the raw content for the "${label}" field without conversational filler or markdown code fences.`,
          ].join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        promptText,
        cardContextSnapshot,
        aiConfig,
        controller.signal,
        {
          maxTokens: aiConfig.maxTokens || 512,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: combinedActiveTagNames,
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.reasoning) {
          setLastReasoning(detailed.reasoning);
        }
        if (targetMode === 'append' && value.trim()) {
          const separator = value.endsWith('\n') ? '\n' : '\n\n';
          onChange(`${value}${separator}${detailed.content.trim()}`);
        } else {
          onChange(detailed.content.trim());
        }
        setCustomInstruction('');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      if (err instanceof AIServiceError) {
        setAiError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setAiError({
          message:
            err instanceof Error ? err.message : 'AI generation request failed.',
          corsHint:
            'Verify your local AI server (LM Studio / Ollama) is running and CORS is enabled.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingField(false);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (macroMenuOpen && filteredMacros.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMacroIdx((prev) => (prev + 1) % filteredMacros.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMacroIdx(
          (prev) => (prev - 1 + filteredMacros.length) % filteredMacros.length
        );
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const chosen = filteredMacros[selectedMacroIdx] || filteredMacros[0];
        if (chosen) {
          insertMacro(chosen.macro);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMacroMenuOpen(false);
        return;
      }
    }

    if (ghostText && e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      acceptGhostText();
      return;
    }

    if (ghostText && e.key === 'Escape') {
      e.preventDefault();
      setGhostText('');
      return;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    if (ghostText) {
      setGhostText('');
    }
    onChange(nextValue);
    evaluateMacroTrigger(nextValue, e.target.selectionStart ?? nextValue.length);
  };

  const needsSpaceBeforeGhost =
    value.length > 0 &&
    !/\s$/.test(value) &&
    Boolean(ghostText) &&
    !/^[\s.,!?;:'")]/.test(ghostText);

  return (
    <div
      style={{
        borderColor: isFocused
          ? 'var(--theme-accent)'
          : 'color-mix(in srgb, var(--theme-accent) 30%, transparent)',
      }}
      className="rounded-xl border bg-white dark:bg-slate-900 transition-colors"
    >
      {/* Editor Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-slate-800/80 px-3.5 py-2">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-900 dark:text-white">
            {label}
          </label>
          {tooltip && <Tooltip title={label} content={tooltip} />}
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            · {isPermanentTokenField ? 'Permanent' : 'Initial'}
          </span>
        </div>

        {/* Right Header Controls: Macro Quick-Insert + AI Assist */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const textarea = textareaRef.current;
              const pos = textarea?.selectionStart ?? value.length;
              setMacroTriggerIndex(pos);
              setMacroQuery('');
              setSelectedMacroIdx(0);
              setMacroMenuOpen((prev) => !prev);
            }}
            title="Insert SillyTavern {{macro}} (or type {{ in editor)"
            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 font-mono text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer whitespace-nowrap"
          >
            <Braces className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
            <span>{'{{macro}}'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowGenerateBar((prev) => !prev);
              setAiError(null);
            }}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
          >
            {isGeneratingField ? (
              <Loader2
                className="h-3.5 w-3.5 animate-spin"
                style={{ color: 'var(--theme-accent)' }}
              />
            ) : (
              <Sparkles
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
            )}
            <span>AI Assist</span>
          </button>
        </div>
      </div>

      {/* Expandable Per-Field "AI Assist" Drawer */}
      {showGenerateBar && (
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95 px-3.5 py-3 space-y-2.5">
          <form
            onSubmit={(e) => handleGenerateField(assistMode, e)}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder={`Custom instructions for ${label} (e.g., "Make her more sarcastic", "Emphasize gothic sensory detail")...`}
              className="theme-focus-ring flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isGeneratingField}
                onClick={() => {
                  setAssistMode('replace');
                  handleGenerateField('replace');
                }}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isGeneratingField && assistMode === 'replace' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>{value.trim() ? 'Rewrite / Generate' : 'Generate Field'}</span>
              </button>

              {value.trim() && (
                <button
                  type="button"
                  disabled={isGeneratingField}
                  onClick={() => {
                    setAssistMode('append');
                    handleGenerateField('append');
                  }}
                  className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                >
                  {isGeneratingField && assistMode === 'append' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PlusCircle
                      className="h-3.5 w-3.5"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                  )}
                  <span>Append</span>
                </button>
              )}

              {isGeneratingField ? (
                <button
                  type="button"
                  onClick={() => {
                    if (generateAbortControllerRef.current) {
                      generateAbortControllerRef.current.abort();
                    }
                    setIsGeneratingField(false);
                  }}
                  className="rounded-md border border-rose-300 dark:border-rose-800 px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 cursor-pointer"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowGenerateBar(false)}
                  className="rounded-md p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                  title="Close AI Assist drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {/* AI Assist Sub-bar: Format indicator + Preview Sent Context toggle + Extracted Reasoning toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Theme: <strong className="text-slate-700 dark:text-slate-200">{activeTheme.name}</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Format: <strong className="font-mono text-slate-700 dark:text-slate-200">{effectiveFormatLabel}</strong>
              </span>
              {combinedActiveTagNames.length > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{combinedActiveTagNames.length} active tags injected</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3">
              {lastReasoning && (
                <button
                  type="button"
                  onClick={() => setShowReasoningAccordion((prev) => !prev)}
                  className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-slate-200 hover:underline cursor-pointer"
                >
                  <Brain className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
                  <span>AI Reasoning</span>
                  {showReasoningAccordion ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowPreviewContext((prev) => !prev)}
                className="inline-flex items-center gap-1 font-medium hover:underline cursor-pointer"
                style={{ color: 'var(--theme-accent)' }}
              >
                <Eye className="h-3 w-3" />
                <span>
                  {showPreviewContext ? 'Hide Sent Context' : 'Preview Sent Context'}
                </span>
              </button>
            </div>
          </div>

          {/* Collapsible Preview Sent Context Panel */}
          {showPreviewContext && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Synthesized System Prompt Injected Into Request
              </div>
              <pre className="font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {previewSentContextText}
              </pre>
            </div>
          )}

          {/* Collapsible Extracted AI Reasoning (<think> / reasoning_content) Accordion */}
          {lastReasoning && showReasoningAccordion && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Extracted Model Chain-of-Thought (Stripped from Output)</span>
                <button
                  type="button"
                  onClick={() => setLastReasoning('')}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Clear
                </button>
              </div>
              <pre className="font-mono text-[11px] italic leading-relaxed text-slate-500 dark:text-slate-400 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {lastReasoning}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Helpful CORS / Connection Error Banner */}
      {aiError && (
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold">{aiError.message}</div>
              {aiError.corsHint && (
                <div className="text-[11px] opacity-90">{aiError.corsHint}</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="text-amber-700 dark:text-amber-300 hover:opacity-75 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Synchronized Backdrop Overlay + Transparent Textarea Container */}
      <div className="relative">
        {/* Floating Non-AI Macro Autocomplete Menu */}
        {macroMenuOpen && filteredMacros.length > 0 && (
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="absolute left-3.5 top-2 z-30 w-80 rounded-lg border bg-white dark:bg-slate-900 p-1.5 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-2 py-1 text-[10px] font-medium text-slate-400">
              <span>SillyTavern Macro Autocomplete (Non-AI)</span>
              <span className="font-mono">↑↓ · Enter/Tab</span>
            </div>
            <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
              {filteredMacros.map((item, idx) => {
                const isSelected = idx === selectedMacroIdx;
                return (
                  <button
                    key={item.macro}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      insertMacro(item.macro);
                    }}
                    style={
                      isSelected
                        ? {
                            backgroundColor:
                              'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                          }
                        : undefined
                    }
                    className="w-full flex items-center justify-between gap-2 rounded px-2.5 py-1.5 text-left text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <div
                        className="font-mono font-semibold"
                        style={
                          isSelected ? { color: 'var(--theme-accent)' } : undefined
                        }
                      >
                        {item.label}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {item.description}
                      </div>
                    </div>
                    {isSelected && (
                      <CornerDownLeft
                        className="h-3.5 w-3.5 shrink-0"
                        style={{ color: 'var(--theme-accent)' }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Backdrop Layer: Renders visible text + zero-padding {{macro}} highlights + inline Ghost Text */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-3.5 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 select-none"
        >
          {renderHighlightedBackdrop(value)}
          {ghostText && (
            <span className="opacity-45 italic text-slate-500 dark:text-slate-400">
              {needsSpaceBeforeGhost ? ` ${ghostText}` : ghostText}
            </span>
          )}
          {value.endsWith('\n') ? '\n' : ''}
        </div>

        {/* Foreground Interactive Textarea: Transparent text fill with high-visibility caret for 1:1 pixel alignment */}
        <textarea
          ref={textareaRef}
          rows={rows}
          value={value}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          onFocus={() => setIsFocused(true)}
          onBlur={() => {
            setIsFocused(false);
            window.setTimeout(() => setMacroMenuOpen(false), 150);
          }}
          placeholder={placeholder}
          spellCheck={true}
          style={{
            color: 'transparent',
            WebkitTextFillColor: 'transparent',
            caretColor: 'var(--theme-accent)',
          }}
          className="relative z-10 block w-full resize-y bg-transparent p-3.5 font-mono text-xs leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none selection:bg-sky-500/25"
        />
      </div>

      {/* Zero-Jank Inline Ghost Text Acceptance Bar */}
      {ghostText && (
        <div
          style={{
            borderColor: 'color-mix(in srgb, var(--theme-accent) 30%, transparent)',
            backgroundColor:
              'color-mix(in srgb, var(--theme-accent) 7%, transparent)',
          }}
          className="flex items-center justify-between gap-3 border-t px-3.5 py-1.5 text-xs"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span className="truncate italic text-slate-600 dark:text-slate-300">
              {ghostText}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptGhostText();
              }}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="flex items-center gap-1 rounded border bg-white dark:bg-slate-900 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-900 dark:text-white cursor-pointer"
            >
              <Check className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
              <span>Tab · Accept</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setGhostText('');
              }}
              className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              Esc
            </button>
          </div>
        </div>
      )}

      {/* Footer Status Bar: Detected Macros + Ghost Status + Per-Field Token Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800/70 bg-slate-50/50 dark:bg-slate-950/40 px-3.5 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 rounded-b-xl">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {detectedMacros.length > 0 ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>Macros:</span>
              {detectedMacros.map((m, idx) => (
                <React.Fragment key={m}>
                  {idx > 0 && <span aria-hidden="true">·</span>}
                  <span
                    style={{ color: 'var(--theme-accent)' }}
                    className="font-mono font-medium"
                  >
                    {m}
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : (
            <span>Type {'{{'} for instant SillyTavern macros</span>
          )}

          {isFetchingGhost && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <span>·</span>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Predicting ghost text...</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 font-mono tabular-nums shrink-0">
          <Cpu className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            {tokenCount.toLocaleString()}
          </span>
          <span>tokens</span>
        </div>
      </div>
    </div>
  );
};
