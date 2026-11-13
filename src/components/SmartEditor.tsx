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
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  AIServiceError,
  buildFullSystemPromptForRequest,
  COMPATIBILITY_FORMAT_LABELS,
  compressImageForVision,
  doesBackendSupportVision,
  generateCompletion,
  generateCompletionDetailed,
  resolveEffectiveFormat,
} from '../services/aiService';
import { readImageFileAsDataUrl } from '../utils/cardIO';
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
  enablePortraitVision?: boolean;
  usePortraitVisionContext?: boolean;
  onTogglePortraitVisionContext?: (enabled: boolean) => void;
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
  enablePortraitVision = true,
  usePortraitVisionContext,
  onTogglePortraitVisionContext,
}) => {
  const { character, activeTheme, tags, aiConfig } = useStore();

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const tempRefImageInputRef = useRef<HTMLInputElement | null>(null);

  // Non-AI Macro Autocomplete state
  const [macroMenuOpen, setMacroMenuOpen] = useState(false);
  const [macroQuery, setMacroQuery] = useState('');
  const [macroTriggerIndex, setMacroTriggerIndex] = useState<number | null>(null);
  const [selectedMacroIdx, setSelectedMacroIdx] = useState(0);

  // Predictive AI Ghost Text state (100% text-only — NEVER sends vision images)
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

  // On-Demand Multimodal Vision Context state (NEVER used by Ghost-Text)
  const [localUsePortraitVision, setLocalUsePortraitVision] = useState<boolean>(
    Boolean(usePortraitVisionContext)
  );
  const [tempReferenceImageUrl, setTempReferenceImageUrl] = useState<string | null>(
    null
  );
  const [tempReferenceImageName, setTempReferenceImageName] = useState<string>('');
  const [isDraggingRefImage, setIsDraggingRefImage] = useState(false);
  const [visionFallbackToast, setVisionFallbackToast] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (typeof usePortraitVisionContext === 'boolean') {
      setLocalUsePortraitVision(usePortraitVisionContext);
    }
  }, [usePortraitVisionContext]);

  const isPortraitVisionEnabled =
    typeof usePortraitVisionContext === 'boolean'
      ? usePortraitVisionContext
      : localUsePortraitVision;

  const handleTogglePortraitVision = () => {
    const next = !isPortraitVisionEnabled;
    setLocalUsePortraitVision(next);
    onTogglePortraitVisionContext?.(next);
  };

  const visionSupported = useMemo(
    () => doesBackendSupportVision(aiConfig),
    [aiConfig]
  );

  const hasCharacterPortrait = Boolean(
    enablePortraitVision && character.avatar && character.avatar.startsWith('data:image/')
  );

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

  const handleLoadTempReferenceFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setAiError({
        message: 'Please select or drop a valid image file (PNG, JPEG, WebP).',
      });
      return;
    }
    try {
      const rawDataUrl = await readImageFileAsDataUrl(file);
      const compressed = await compressImageForVision(rawDataUrl, 512);
      setTempReferenceImageUrl(compressed);
      setTempReferenceImageName(file.name);
      setAiError(null);
    } catch (err) {
      setAiError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to compress reference image for vision.',
      });
    }
  };

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
  // CRITICAL RULE: NEVER send images during background inline Ghost-Text autocomplete requests!
  // Ghost-Text remains 100% text-only for instant typing performance and zero VRAM bloat.
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
            // Notice: `imageDataUrl` is strictly OMITTED here so Ghost-Text is 100% text-only
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

  // 1-Click "✨ Describe Appearance from Portrait" action for the Description field
  const handleDescribeAppearanceFromPortrait = async () => {
    if (!character.avatar) return;
    if (generateAbortControllerRef.current) {
      generateAbortControllerRef.current.abort();
    }
    cancelPendingGhostRequest();
    setGhostText('');
    setAiError(null);
    setVisionFallbackToast(null);

    const controller = new AbortController();
    generateAbortControllerRef.current = controller;
    setIsGeneratingField(true);

    const promptText = [
      `Inspect the attached Character Portrait image carefully and write a vivid, high-craft SillyTavern physical appearance & attire description for "${character.name || '{{char}}'}".`,
      `Include facial features, eye/hair details, physique/build, clothing/armor/accessories, posture, and visual aura.`,
      value.trim()
        ? `\nExisting Description Draft (integrate or enrich with visual details from the portrait):\n${value}`
        : '',
      `\nOutput ONLY the raw Markdown description content using {{char}} where appropriate, without conversational filler.`,
    ]
      .filter(Boolean)
      .join('\n');

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
          imageDataUrl: character.avatar,
          onVisionFallback: (warning) => setVisionFallbackToast(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackToast(detailed.visionFallbackWarning);
        }
        if (detailed.reasoning) {
          setLastReasoning(detailed.reasoning);
        }
        if (value.trim()) {
          const separator = value.endsWith('\n') ? '\n' : '\n\n';
          onChange(`${value}${separator}${detailed.content.trim()}`);
        } else {
          onChange(detailed.content.trim());
        }
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
            err instanceof Error
              ? err.message
              : 'Portrait vision description failed.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingField(false);
      }
    }
  };

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
    setVisionFallbackToast(null);

    const controller = new AbortController();
    generateAbortControllerRef.current = controller;
    setIsGeneratingField(true);

    // Resolve active visual context image (Temporary Reference Image takes precedence, otherwise Portrait if toggled on)
    const activeVisionImageUrl = visionSupported
      ? tempReferenceImageUrl ||
        (hasCharacterPortrait && isPortraitVisionEnabled
          ? character.avatar
          : undefined)
      : undefined;

    const visionContextDirective = activeVisionImageUrl
      ? tempReferenceImageUrl
        ? 'An optional Reference Image is attached (~260 tokens). Inspect the visual details in the attached image (setting, attire, item, or appearance) and weave them naturally into the generated field.'
        : 'The Character Portrait image is attached (~260 tokens). Ensure all visual, attire, and physical details match the attached portrait.'
      : '';

    const userDirective = customInstruction.trim()
      ? `Custom Instruction from Creator: "${customInstruction.trim()}"`
      : 'Write vivid, high-craft SillyTavern roleplay content tailored to the active Context Theme and semantic tags.';

    const promptText =
      targetMode === 'append' && value.trim()
        ? [
            `Continue and append a new paragraph or section to the "${label}" (${fieldKey}) field for "${character.name || '{{char}}'}".`,
            userDirective,
            visionContextDirective,
            `\nExisting "${label}" Content (do NOT repeat this; write only the new continuation to append):\n${value}`,
          ]
            .filter(Boolean)
            .join('\n')
        : [
            `Write or refine the "${label}" (${fieldKey}) field for the SillyTavern character card "${character.name || '{{char}}'}".`,
            userDirective,
            visionContextDirective,
            value.trim()
              ? `\nCurrent "${label}" Draft (improve, expand, or rewrite according to the instructions):\n${value}`
              : `\nThe "${label}" field is currently empty. Generate a complete, compelling entry.`,
            `\nOutput ONLY the raw content for the "${label}" field without conversational filler or markdown code fences.`,
          ]
            .filter(Boolean)
            .join('\n');

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
          imageDataUrl: activeVisionImageUrl,
          onVisionFallback: (warning) => setVisionFallbackToast(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackToast(detailed.visionFallbackWarning);
        }
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

        {/* Right Header Controls: 1-Click Describe Appearance from Portrait (on Description field) + Macro Quick-Insert + AI Assist */}
        <div className="flex flex-wrap items-center gap-2">
          {visionSupported &&
            hasCharacterPortrait &&
            fieldKey === 'description' && (
              <button
                type="button"
                disabled={isGeneratingField}
                onClick={handleDescribeAppearanceFromPortrait}
                style={{
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 55%, transparent)',
                }}
                title="Inspect the Character Portrait (~260 tokens) and generate or append physical appearance & attire details"
                className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isGeneratingField ? (
                  <Loader2
                    className="h-3 w-3 animate-spin"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                ) : (
                  <Sparkles
                    className="h-3 w-3"
                    style={{ color: 'var(--theme-accent)' }}
                  />
                )}
                <span>✨ Describe Appearance from Portrait</span>
              </button>
            )}

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
            {visionSupported &&
              (tempReferenceImageUrl ||
                (hasCharacterPortrait && isPortraitVisionEnabled)) && (
                <span
                  title="Visual Context Active (~260 tokens)"
                  className="ml-0.5 rounded bg-emerald-500/15 px-1 py-0.2 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300"
                >
                  👁️
                </span>
              )}
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

          {/* On-Demand Multimodal Vision Context Bar (Only shown when Vision is supported by active model) */}
          {visionSupported && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 dark:border-slate-800/90 bg-white/80 dark:bg-slate-900/80 px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-2">
                {hasCharacterPortrait && (
                  <button
                    type="button"
                    onClick={handleTogglePortraitVision}
                    style={
                      isPortraitVisionEnabled
                        ? {
                            borderColor: 'var(--theme-accent)',
                            backgroundColor:
                              'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                          }
                        : undefined
                    }
                    className={`theme-hover-outline inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                      isPortraitVisionEnabled
                        ? 'text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <span>👁️ Use Portrait as Visual Context (~260 tok)</span>
                    {isPortraitVisionEnabled && (
                      <Check
                        className="h-3 w-3 shrink-0"
                        style={{ color: 'var(--theme-accent)' }}
                      />
                    )}
                  </button>
                )}

                {hasCharacterPortrait && fieldKey === 'description' && (
                  <button
                    type="button"
                    disabled={isGeneratingField}
                    onClick={handleDescribeAppearanceFromPortrait}
                    style={{ borderColor: 'var(--theme-accent)' }}
                    className="theme-hover-outline inline-flex items-center gap-1 rounded-md border bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-[11px] font-semibold text-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Sparkles
                      className="h-3 w-3"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span>✨ Describe Appearance from Portrait</span>
                  </button>
                )}
              </div>

              {/* Temporary Reference Image Slot (Never saved into final JSON/PNG card) */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingRefImage(true);
                }}
                onDragLeave={() => setIsDraggingRefImage(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingRefImage(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) {
                    handleLoadTempReferenceFile(droppedFile);
                  }
                }}
                style={
                  isDraggingRefImage || tempReferenceImageUrl
                    ? { borderColor: 'var(--theme-accent)' }
                    : undefined
                }
                className={`flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1 text-[11px] transition-colors ${
                  isDraggingRefImage
                    ? 'bg-amber-500/10'
                    : 'border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/60'
                }`}
              >
                <input
                  ref={tempRefImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleLoadTempReferenceFile(f);
                    }
                    e.target.value = '';
                  }}
                />

                {tempReferenceImageUrl ? (
                  <div className="flex items-center gap-2">
                    <img
                      src={tempReferenceImageUrl}
                      alt="Temporary Reference"
                      className="h-6 w-6 rounded object-cover border border-slate-300 dark:border-slate-700 shrink-0"
                    />
                    <div className="flex flex-col leading-tight">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                        {tempReferenceImageName || 'Reference Image'}
                      </span>
                      <span className="font-mono text-[9px] text-emerald-600 dark:text-emerald-400">
                        Temp Ref · ~260 tok JPEG (Not saved to card)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setTempReferenceImageUrl(null);
                        setTempReferenceImageName('');
                      }}
                      title="Remove temporary reference image"
                      className="rounded p-0.5 text-slate-400 hover:text-rose-500 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => tempRefImageInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                    title="Drop or select a temporary reference image (location, outfit, item, or character) for this AI Assist call. Never saved into card JSON."
                  >
                    <ImageIcon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span>Drop or Select Temp Reference Image (~260 tok)</span>
                    <Upload className="h-3 w-3 opacity-70" />
                  </button>
                )}
              </div>
            </div>
          )}

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

      {/* Helpful Vision Fallback Toast (when local GGUF lacks mmproj vision projector) */}
      {visionFallbackToast && (
        <div className="flex items-start justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Vision Adapter Notice: </span>
              <span>{visionFallbackToast}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVisionFallbackToast(null)}
            className="text-amber-700 dark:text-amber-300 hover:opacity-75 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
