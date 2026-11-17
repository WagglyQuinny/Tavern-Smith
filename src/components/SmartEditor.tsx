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
  Image as ImageIcon,
  Upload,
} from 'lucide-react';
import {
  DEFAULT_SMART_EDITOR_FIELD_DRAFT,
  useStore,
} from '../context/StoreContext';
import {
  AIServiceError,
  buildFullSystemPromptForRequest,
  COMPATIBILITY_FORMAT_LABELS,
  compressImageForVision,
  doesBackendSupportVision,
  generateCompletion,
  generateCompletionDetailed,
  resolveEffectiveFormat,
  resolveEffectiveMaxTokens,
} from '../services/aiService';
import { readImageFileAsDataUrl } from '../utils/cardIO';
import { estimateTokens } from '../utils/tokenCounter';
import { ContextReferenceImage } from '../types';
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
  draftScopeId?: string;
  value: string;
  onChange: (newValue: string) => void;
  placeholder?: string;
  tooltip?: string;
  rows?: number;
  isPermanentTokenField?: boolean;
  extraContextSummary?: string;
  additionalTags?: string[];
  enablePortraitVision?: boolean;
  extraContextImages?: ContextReferenceImage[];
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
  draftScopeId,
  value,
  onChange,
  placeholder = 'Write markdown or type {{ for SillyTavern macros...',
  tooltip,
  rows = 5,
  isPermanentTokenField = true,
  extraContextSummary,
  additionalTags = [],
  enablePortraitVision = true,
  extraContextImages = [],
}) => {
  const {
    character,
    activeTheme,
    tags,
    aiConfig,
    workspaceDraftCache,
    updateSmartEditorDraft,
  } = useStore();

  const resolvedScopeKey = `${draftScopeId || `char:${character.id || 'active'}`}:${fieldKey}`;
  const fieldDraft =
    workspaceDraftCache.smartEditorDrafts[resolvedScopeKey] ||
    DEFAULT_SMART_EDITOR_FIELD_DRAFT;

  const ghostText = fieldDraft.ghostText;
  const showGenerateBar = fieldDraft.showGenerateBar;
  const customInstruction = fieldDraft.customInstruction;
  const tempReferenceImageUrl = fieldDraft.tempReferenceImageUrl ?? null;
  const tempReferenceImageName = fieldDraft.tempReferenceImageName ?? '';

  const setGhostText = useCallback(
    (next: string) =>
      updateSmartEditorDraft(resolvedScopeKey, { ghostText: next }),
    [resolvedScopeKey, updateSmartEditorDraft]
  );
  const setShowGenerateBar = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolvedNext =
        typeof next === 'function' ? next(fieldDraft.showGenerateBar) : next;
      updateSmartEditorDraft(resolvedScopeKey, {
        showGenerateBar: resolvedNext,
      });
    },
    [resolvedScopeKey, fieldDraft.showGenerateBar, updateSmartEditorDraft]
  );
  const setCustomInstruction = useCallback(
    (next: string) =>
      updateSmartEditorDraft(resolvedScopeKey, { customInstruction: next }),
    [resolvedScopeKey, updateSmartEditorDraft]
  );
  const setTempReferenceImageUrl = useCallback(
    (next: string | null) =>
      updateSmartEditorDraft(resolvedScopeKey, { tempReferenceImageUrl: next }),
    [resolvedScopeKey, updateSmartEditorDraft]
  );
  const setTempReferenceImageName = useCallback(
    (next: string) =>
      updateSmartEditorDraft(resolvedScopeKey, { tempReferenceImageName: next }),
    [resolvedScopeKey, updateSmartEditorDraft]
  );

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const tempRefImageInputRef = useRef<HTMLInputElement | null>(null);

  // Non-AI Macro Autocomplete state
  const [macroMenuOpen, setMacroMenuOpen] = useState(false);
  const [macroQuery, setMacroQuery] = useState('');
  const [macroTriggerIndex, setMacroTriggerIndex] = useState<number | null>(null);
  const [selectedMacroIdx, setSelectedMacroIdx] = useState(0);

  // Predictive AI Ghost Text transient request state
  const [ghostError, setGhostError] = useState<string | null>(null);
  const [isFetchingGhost, setIsFetchingGhost] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  // "AI Assist" transient drawer state
  const [isGeneratingField, setIsGeneratingField] = useState(false);
  const [showPreviewContext, setShowPreviewContext] = useState(false);
  const [lastReasoning, setLastReasoning] = useState<string>('');
  const [showReasoningAccordion, setShowReasoningAccordion] = useState(false);
  const [aiError, setAiError] = useState<{
    message: string;
    corsHint?: string;
  } | null>(null);

  // On-Demand Multimodal Vision Context state (NEVER used by Ghost-Text)
  const [isDraggingRefImage, setIsDraggingRefImage] = useState(false);
  const [visionFallbackToast, setVisionFallbackToast] = useState<string | null>(
    null
  );

  const visionSupported = useMemo(
    () => doesBackendSupportVision(aiConfig),
    [aiConfig]
  );

  const hasCharacterPortrait = Boolean(
    enablePortraitVision && character.avatar && character.avatar.startsWith('data:image/')
  );

  const extraContextUrls = useMemo(
    () => extraContextImages.map((img) => img.dataUrl).filter(Boolean),
    [extraContextImages]
  );

  const providedImageUrls = useMemo(
    () =>
      Array.from(
        new Set(
          [
            ...(hasCharacterPortrait && character.avatar ? [character.avatar] : []),
            ...extraContextUrls,
            ...(tempReferenceImageUrl ? [tempReferenceImageUrl] : []),
          ].filter(Boolean)
        )
      ),
    [hasCharacterPortrait, character.avatar, extraContextUrls, tempReferenceImageUrl]
  );

  // Images are automatically added to context ONLY when the selected model supports images
  const activeVisionImageUrls = useMemo(
    () => (visionSupported ? providedImageUrls : []),
    [visionSupported, providedImageUrls]
  );

  // Timers and AbortControllers for strict memory & race-condition hygiene
  const ghostDebounceTimerRef = useRef<number | null>(null);
  const blurMacroTimerRef = useRef<number | null>(null);
  const ghostAbortControllerRef = useRef<AbortController | null>(null);
  const generateAbortControllerRef = useRef<AbortController | null>(null);

  const tokenCount = useMemo(() => estimateTokens(value), [value]);

  const combinedActiveTagNames = useMemo(() => {
    if (
      fieldKey.startsWith('lorebook_') ||
      fieldKey === 'theme_ai_context_prompt'
    ) {
      return Array.from(new Set(additionalTags));
    }
    return Array.from(new Set([...(character.tags || []), ...additionalTags]));
  }, [fieldKey, character.tags, additionalTags]);

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
      if (blurMacroTimerRef.current !== null) {
        window.clearTimeout(blurMacroTimerRef.current);
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
  }, [ghostText, value, onChange, setGhostText]);

  // Build complete snapshot of existing Character & Lorebook fields for system context
  const cardContextSnapshot = useMemo(() => {
    if (fieldKey.startsWith('lorebook_') && extraContextSummary) {
      return [
        extraContextSummary,
        character.name && character.name !== 'New Character'
          ? `Active Character Reference: ${character.name}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      `Character Name: ${character.name || '{{char}}'}`,
      character.nickname ? `Nickname: ${character.nickname}` : '',
      character.description && fieldKey !== 'description'
        ? `Description: ${character.description.slice(0, 600)}`
        : '',
      character.personality && fieldKey !== 'personality'
        ? `Personality: ${character.personality.slice(0, 500)}`
        : '',
      character.scenario && fieldKey !== 'scenario'
        ? `Scenario: ${character.scenario.slice(0, 500)}`
        : '',
      character.first_mes && fieldKey !== 'first_mes'
        ? `First Message / Greeting: ${character.first_mes.slice(0, 400)}`
        : '',
      character.mes_example && fieldKey !== 'mes_example'
        ? `Example Dialogue: ${character.mes_example.slice(0, 350)}`
        : '',
      character.system_prompt && fieldKey !== 'system_prompt'
        ? `System Prompt: ${character.system_prompt.slice(0, 300)}`
        : '',
      character.post_history_instructions &&
      fieldKey !== 'post_history_instructions'
        ? `Post-History Instructions: ${character.post_history_instructions.slice(0, 300)}`
        : '',
      character.creator_notes && fieldKey !== 'creator_notes'
        ? `Creator Notes: ${character.creator_notes.slice(0, 250)}`
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
    character.first_mes,
    character.mes_example,
    character.system_prompt,
    character.post_history_instructions,
    character.creator_notes,
    fieldKey,
    extraContextSummary,
  ]);

  const previewSentContextText = useMemo(() => {
    const baseSystemPrompt = buildFullSystemPromptForRequest(
      cardContextSnapshot,
      {
        activeTheme,
        allTags: tags,
        characterTags: combinedActiveTagNames,
      }
    );
    const notes: string[] = [];
    if (value.trim()) {
      notes.push(`[Current "${label}" Draft Included: ${value.trim().length} chars]`);
    }
    if (customInstruction.trim()) {
      notes.push(`[User Prompt Instruction: "${customInstruction.trim()}"]`);
    }
    if (activeVisionImageUrls.length > 0) {
      notes.push(
        `[Visual Context Attached: ${activeVisionImageUrls.length} image(s)]`
      );
    } else if (!visionSupported && providedImageUrls.length > 0) {
      notes.push(
        `[Visual Context Skipped: selected model does not support images]`
      );
    }
    return notes.length > 0
      ? `${baseSystemPrompt}\n\n${notes.join('\n')}`
      : baseSystemPrompt;
  }, [
    cardContextSnapshot,
    activeTheme,
    tags,
    combinedActiveTagNames,
    value,
    label,
    customInstruction,
    activeVisionImageUrls.length,
    visionSupported,
    providedImageUrls.length,
  ]);

  // Keep latest ambient context in a ref so background auto-save or tag re-renders
  // never cancel an active paused-typing AI suggestion request.
  const suggestionContextRef = useRef({
    aiConfig,
    activeTheme,
    tags,
    cardContextSnapshot,
    combinedActiveTagNames,
    label,
  });
  suggestionContextRef.current = {
    aiConfig,
    activeTheme,
    tags,
    cardContextSnapshot,
    combinedActiveTagNames,
    label,
  };

  // Trigger debounced 1-shot AI Suggestion when user pauses typing
  // CRITICAL RULE: NEVER send images during background autocomplete requests!
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
      const ctx = suggestionContextRef.current;
      const controller = new AbortController();
      ghostAbortControllerRef.current = controller;
      setIsFetchingGhost(true);
      setGhostError(null);

      const continuationPrompt = [
        `Continue the following "${ctx.label}" text naturally with 1 to 2 concise sentences.`,
        `Output ONLY the direct continuation text with no quotes, no markdown code fences, no preamble, and without repeating the existing text.`,
        `\nExisting "${ctx.label}" text:\n${value.slice(-1200)}`,
      ].join('\n');

      try {
        const completion = await generateCompletion(
          continuationPrompt,
          ctx.cardContextSnapshot,
          ctx.aiConfig,
          controller.signal,
          {
            isGhostText: true,
            maxTokens: Math.max(8192, ctx.aiConfig.maxTokens || 8192),
            temperature: ctx.aiConfig.temperature,
            activeTheme: ctx.activeTheme,
            allTags: ctx.tags,
            characterTags: ctx.combinedActiveTagNames,
            // Notice: `imageDataUrl` is strictly OMITTED here so Ghost-Text is 100% text-only
          }
        );

        if (!controller.signal.aborted) {
          const cleaned = completion
            .replace(/^```[\w-]*\s*\n?/i, '')
            .replace(/\n?```\s*$/i, '')
            .replace(/^["'`]+|["'`]+$/g, '')
            .trim();

          if (cleaned) {
            setGhostText(cleaned);
            setGhostError(null);
            setAiError(null);
          } else {
            setGhostText('');
            setGhostError('Model returned an empty suggestion.');
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        const msg =
          err instanceof Error && err.message
            ? err.message
            : 'Could not reach AI endpoint for suggestion.';
        setGhostText('');
        setGhostError(msg);
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
    aiConfig.ghostTextEnabled,
    aiConfig.debounceMs,
    aiConfig.preset,
    aiConfig.modelName,
    aiConfig.url,
    macroMenuOpen,
    isGeneratingField,
    cancelPendingGhostRequest,
    resolvedScopeKey,
    setGhostText,
  ]);

  // Handle per-field "AI Generate" action (automatically includes all provided images when selected model supports vision)
  const handleGenerateField = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

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

    const visionContextDirective =
      activeVisionImageUrls.length > 0
        ? `Visual Reference Context: ${activeVisionImageUrls.length} image(s) attached (~260 tokens each). Inspect the attached visual details carefully (appearance, attire, expression, setting, objects, or mood) and incorporate them naturally into the generated "${label}" field.`
        : '';

    const userDirective = customInstruction.trim()
      ? `Custom Instruction from Creator: "${customInstruction.trim()}"`
      : 'Write vivid, high-craft SillyTavern content tailored to the active Context Theme, semantic tags, and all provided text/visual context.';

    const targetLabel = fieldKey.startsWith('lorebook_')
      ? label
      : fieldKey === 'theme_ai_context_prompt'
        ? `Context Theme Style Prompt`
        : `"${label}" (${fieldKey}) field for "${character.name || '{{char}}'}"`;

    const promptText = [
      `Write or refine ${targetLabel}.`,
      userDirective,
      visionContextDirective,
      value.trim()
        ? `\nCurrent "${label}" Draft (improve, expand, or update according to the instructions and context):\n${value}`
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
          maxTokens: resolveEffectiveMaxTokens(aiConfig, aiConfig.maxTokens),
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: combinedActiveTagNames,
          imageDataUrls:
            activeVisionImageUrls.length > 0
              ? activeVisionImageUrls
              : undefined,
          onVisionFallback: (warning) => setVisionFallbackToast(warning),
        }
      );

      if (!controller.signal.aborted) {
        if (detailed.content.trim()) {
          if (detailed.visionFallbackWarning) {
            setVisionFallbackToast(detailed.visionFallbackWarning);
          }
          if (detailed.reasoning) {
            setLastReasoning(detailed.reasoning);
          }
          onChange(detailed.content.trim());
          setCustomInstruction('');
        } else {
          setAiError({
            message: 'Model returned an empty response for this field.',
          });
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

    if ((ghostText || ghostError) && e.key === 'Escape') {
      e.preventDefault();
      setGhostText('');
      setGhostError(null);
      return;
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value;
    if (ghostText) {
      setGhostText('');
    }
    if (ghostError) {
      setGhostError(null);
    }
    onChange(nextValue);
    evaluateMacroTrigger(nextValue, e.target.selectionStart ?? nextValue.length);
  };

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

        {/* Right Header Controls: Macro Quick-Insert + AI Assist Drawer Toggle */}
        <div className="flex flex-wrap items-center gap-2">
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
            title="Insert a SillyTavern {{macro}} (or just type {{ while writing)"
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
            {activeVisionImageUrls.length > 0 && (
              <span
                title={`Auto-including ${activeVisionImageUrls.length} image(s) in AI context`}
                className="ml-0.5 rounded bg-emerald-500/15 px-1 py-0.2 font-mono text-[9px] font-bold text-emerald-700 dark:text-emerald-300"
              >
                👁️ {activeVisionImageUrls.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Expandable Per-Field "AI Generate" Drawer */}
      {showGenerateBar && (
        <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/95 dark:bg-slate-950/95 px-3.5 py-3 space-y-2.5">
          <form
            onSubmit={handleGenerateField}
            className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
          >
            <input
              type="text"
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder={`Tell the AI what to write or change for ${label} (e.g., "Make her more sarcastic", "Add more detail")...`}
              className="theme-focus-ring flex-1 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
            />
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="submit"
                disabled={isGeneratingField}
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center gap-1.5 rounded-md border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isGeneratingField ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>AI Generate</span>
              </button>

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
                  title="Close AI drawer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {/* Automatic Vision Context Status & Per-Field Image Attachment */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200/90 dark:border-slate-800/90 bg-white/80 dark:bg-slate-900/80 px-2.5 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {visionSupported ? (
                activeVisionImageUrls.length > 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                    👁️ Auto-including {activeVisionImageUrls.length} image
                    {activeVisionImageUrls.length > 1 ? 's' : ''} in AI context
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    Attached images are automatically included in AI context
                  </span>
                )
              ) : (
                <span className="font-mono text-[10px] text-amber-600 dark:text-amber-400">
                  Selected model doesn&apos;t support images (text-only context)
                </span>
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
                        Temp Image · Not saved to card
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
                    title="Drop or pick a temporary reference image for this AI request. It is never saved into your card."
                  >
                    <ImageIcon
                      className="h-3.5 w-3.5 shrink-0"
                      style={{ color: 'var(--theme-accent)' }}
                    />
                    <span>Attach Reference Image (Temp)</span>
                    <Upload className="h-3 w-3 opacity-70" />
                  </button>
                )}
              </div>
            </div>

          {/* AI Assist Sub-bar: Format indicator + Preview Prompt toggle + Thinking Notes toggle */}
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
                  <span>{combinedActiveTagNames.length} tags included</span>
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
                  <span>AI Thinking</span>
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
                  {showPreviewContext ? 'Hide Prompt' : 'Preview Prompt'}
                </span>
              </button>
            </div>
          </div>

          {/* Collapsible Preview Prompt Panel */}
          {showPreviewContext && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Full Prompt Context Sent to AI
              </div>
              <pre className="font-mono text-[11px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-40 overflow-y-auto">
                {previewSentContextText}
              </pre>
            </div>
          )}

          {/* Collapsible Extracted AI Thinking (<think> / reasoning_content) Accordion */}
          {lastReasoning && showReasoningAccordion && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 space-y-1">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>AI Thinking Notes (Hidden from Output)</span>
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
              <span>Insert Macro</span>
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

        {/* Backdrop Layer: Renders visible text + zero-padding {{macro}} highlights */}
        <div
          ref={backdropRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words p-3.5 font-mono text-xs leading-relaxed text-slate-900 dark:text-slate-100 select-none"
        >
          {renderHighlightedBackdrop(value)}
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
            if (blurMacroTimerRef.current !== null) {
              window.clearTimeout(blurMacroTimerRef.current);
            }
            blurMacroTimerRef.current = window.setTimeout(
              () => setMacroMenuOpen(false),
              150
            );
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

      {/* Bottom AI Suggestion Pill / Bar */}
      {ghostText && (
        <div
          style={{
            borderColor: 'color-mix(in srgb, var(--theme-accent) 42%, transparent)',
            backgroundColor:
              'color-mix(in srgb, var(--theme-accent) 9%, transparent)',
          }}
          className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 border-t px-3.5 py-2.5 text-xs"
        >
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              acceptGhostText();
            }}
            className="flex flex-1 min-w-0 w-full items-start gap-2 text-left cursor-pointer group"
            title="Click or press Tab to insert this AI suggestion"
          >
            <Sparkles
              className="h-3.5 w-3.5 shrink-0 mt-0.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <div className="min-w-0 flex-1 max-h-52 overflow-y-auto pr-1 leading-relaxed break-words">
              <span className="font-semibold text-slate-900 dark:text-white mr-1.5">
                AI Suggestion:
              </span>
              <span className="italic text-slate-700 dark:text-slate-200 group-hover:underline whitespace-pre-wrap break-words">
                &ldquo;{ghostText}&rdquo;
              </span>
            </div>
          </button>
          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start">
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                acceptGhostText();
              }}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2.5 py-1 font-mono text-[11px] font-semibold text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
            >
              <Check className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
              <span>Click or Press Tab to Insert</span>
            </button>
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setGhostText('');
              }}
              title="Dismiss AI suggestion (Esc)"
              aria-label="Dismiss AI suggestion"
              className="rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {!ghostText && ghostError && (
        <div className="flex items-start justify-between gap-2.5 border-t border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap break-words leading-relaxed">
              <strong>Suggestion failed:</strong> {ghostError}
            </span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setGhostError(null);
            }}
            title="Dismiss error"
            aria-label="Dismiss suggestion error"
            className="rounded p-0.5 text-amber-700 dark:text-amber-300 hover:opacity-75 cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
            <span>Type {'{{'} to insert SillyTavern macros</span>
          )}

          {isFetchingGhost && (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <span>·</span>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Writing suggestion...</span>
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
