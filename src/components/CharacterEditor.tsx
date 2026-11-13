import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  User,
  Plus,
  Search,
  Trash2,
  Sliders,
  Wand2,
  Sparkles,
  Activity,
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  FileJson,
  Zap,
  Upload,
  Download,
  Image as ImageIcon,
  Crop,
  GripVertical,
  RefreshCw,
  FolderOpen,
  ShieldAlert,
} from 'lucide-react';
import { useStore, isCharacterNsfw } from '../context/StoreContext';
import {
  CharacterCardData,
  RosterSortOption,
  StatItem,
  StatItemType,
  StatTemplatePresetId,
} from '../types';
import { SmartEditor } from './SmartEditor';
import { Tooltip } from './Tooltip';
import { PortraitCropperModal } from './PortraitCropperModal';
import { isTagNsfw, TagSelector } from './TagSelector';
import {
  buildStatTemplatePreset,
  calculateCardTokenBreakdown,
  compileStatBlockPrompt,
  estimateTokens,
  renderInitialStatBlockInstance,
} from '../utils/tokenCounter';
import {
  exportCharacterAsJson,
  exportCharacterAsPng,
  extractPngTextChunks,
  readImageDimensions,
} from '../utils/cardIO';
import {
  AIServiceError,
  doesBackendSupportVision,
  generateCompletionDetailed,
} from '../services/aiService';

const WIZARD_STEPS = [
  {
    step: 1,
    title: 'Concept & Identity',
    subtitle: 'Portrait, name, tags & 1-click AI concept generator',
  },
  {
    step: 2,
    title: 'Description & Persona',
    subtitle: 'Physical traits, backstory & behavioral psychology',
  },
  {
    step: 3,
    title: 'Scenario & Greetings',
    subtitle: 'Opening scene, First Message & Alternate Greetings',
  },
  {
    step: 4,
    title: 'Examples & System',
    subtitle: '<START> dialogue calibration & UJB instructions',
  },
  {
    step: 5,
    title: 'DM StatBlock & Review',
    subtitle: 'Dynamic RPG/status tracker & 1-click compiler',
  },
];

export const CharacterEditor: React.FC = () => {
  const {
    characters,
    activeCharacterId,
    setActiveCharacterId,
    createNewCharacter,
    deleteCharacter,
    character,
    setCharacter,
    updateCharacterField,
    lorebooks,
    lorebook,
    statBlock,
    setStatBlock,
    tags,
    ensureTagRegistered,
    activeTheme,
    aiConfig,
    settings,
    updateSettings,
    tokenBreakdown,
    setActiveTab,
    importFromFiles,
    checkAndTriggerNameConflict,
  } = useStore();

  // Roster Sidebar UI State
  const [rosterOpen, setRosterOpen] = useState(true);
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTagFilter, setRosterTagFilter] = useState<string>('all');
  const [rosterSort, setRosterSort] = useState<RosterSortOption>('modified_desc');
  const [deleteTargetCharacter, setDeleteTargetCharacter] =
    useState<CharacterCardData | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importStatusBanner, setImportStatusBanner] = useState<string | null>(
    null
  );
  const [newCustomTagInput, setNewCustomTagInput] = useState('');

  // Interactive 2:3 Portrait Cropper Modal State
  const [cropperState, setCropperState] = useState<{
    sourceUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    reason: 'aspect_mismatch' | 'manual_adjust';
  } | null>(null);
  const portraitInputRef = useRef<HTMLInputElement | null>(null);

  // Drag-and-Drop Reordering State (StatBlock items & Alternate Greetings)
  const [draggedStatIdx, setDraggedStatIdx] = useState<number | null>(null);
  const [dragOverStatIdx, setDragOverStatIdx] = useState<number | null>(null);
  const [draggedAltGreetingIdx, setDraggedAltGreetingIdx] = useState<
    number | null
  >(null);
  const [dragOverAltGreetingIdx, setDragOverAltGreetingIdx] = useState<
    number | null
  >(null);

  // Full-Width Expandable DM/GM Stat-Block Builder Section State
  const [statBlockExpanded, setStatBlockExpanded] = useState<boolean>(true);
  const [generatingStatRuleId, setGeneratingStatRuleId] = useState<string | null>(
    null
  );

  // Wizard Step State (1..5)
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [conceptPrompt, setConceptPrompt] = useState<string>('');
  const [isGeneratingConcept, setIsGeneratingConcept] = useState<boolean>(false);
  const [conceptError, setConceptError] = useState<{
    message: string;
    corsHint?: string;
  } | null>(null);

  // Greetings Carousel State: 0 = first_mes, 1..N = alternate_greetings[idx - 1]
  const [activeGreetingIdx, setActiveGreetingIdx] = useState<number>(0);
  const [altGreetingTwist, setAltGreetingTwist] = useState<string>('');
  const [isGeneratingGreeting, setIsGeneratingGreeting] = useState<boolean>(false);

  // StatBlock Compiler Notification State
  const [compiledBanner, setCompiledBanner] = useState<string | null>(null);

  // Multimodal Vision Context State (Character Portrait ~260 tok)
  const [usePortraitAsVisionContext, setUsePortraitAsVisionContext] =
    useState<boolean>(true);
  const [isDescribingPortrait, setIsDescribingPortrait] =
    useState<boolean>(false);
  const [visionFallbackBanner, setVisionFallbackBanner] = useState<
    string | null
  >(null);

  const visionSupported = useMemo(
    () => doesBackendSupportVision(aiConfig),
    [aiConfig]
  );
  const hasPortraitImage = Boolean(
    character.avatar && character.avatar.startsWith('data:image/')
  );

  const abortRef = useRef<AbortController | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  // Portrait Upload & 2:3 Aspect-Ratio Check Handler
  const handlePortraitImageSelected = async (file: File) => {
    try {
      const info = await readImageDimensions(file);
      if (!info.isTwoThreeAspect) {
        // Image does not match SillyTavern 2:3 aspect ratio -> automatically open Interactive Cropper Modal
        setCropperState({
          sourceUrl: info.dataUrl,
          naturalWidth: info.width,
          naturalHeight: info.height,
          reason: 'aspect_mismatch',
        });
      } else {
        updateCharacterField('avatar', info.dataUrl);
        setImportStatusBanner(
          `Applied 2:3 portrait (${info.width}×${info.height} px) to ${character.name}.`
        );
        window.setTimeout(() => setImportStatusBanner(null), 3500);
      }
    } catch (err: unknown) {
      setConceptError({
        message:
          err instanceof Error
            ? err.message
            : 'Could not load selected portrait image.',
      });
    }
  };

  const handleOpenManualCropper = async () => {
    if (!character.avatar) {
      portraitInputRef.current?.click();
      return;
    }
    try {
      const info = await readImageDimensions(character.avatar);
      setCropperState({
        sourceUrl: info.dataUrl,
        naturalWidth: info.width,
        naturalHeight: info.height,
        reason: 'manual_adjust',
      });
    } catch {
      setCropperState({
        sourceUrl: character.avatar,
        naturalWidth: 512,
        naturalHeight: 768,
        reason: 'manual_adjust',
      });
    }
  };

  // Unified File Drop / Selection Handler (supports ST V2/V3 .png cards, .json cards/lorebooks, AND plain portrait images)
  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);

    // Check if single image file is a plain portrait image without SillyTavern tEXt chunks
    if (list.length === 1) {
      const single = list[0];
      const lower = single.name.toLowerCase();
      const isNonPngImage =
        lower.endsWith('.jpg') ||
        lower.endsWith('.jpeg') ||
        lower.endsWith('.webp') ||
        single.type === 'image/jpeg' ||
        single.type === 'image/webp';

      if (isNonPngImage) {
        await handlePortraitImageSelected(single);
        return;
      }

      if (lower.endsWith('.png') || single.type === 'image/png') {
        try {
          const buf = await single.arrayBuffer();
          const chunks = extractPngTextChunks(buf);
          if (!chunks['ccv3'] && !chunks['chara']) {
            // Plain PNG without ST metadata -> treat as character portrait upload with 2:3 aspect check!
            await handlePortraitImageSelected(single);
            return;
          }
        } catch {
          // Fall through to standard card importer
        }
      }
    }

    try {
      const res = await importFromFiles(list);
      setImportStatusBanner(res.summary);
      window.setTimeout(() => setImportStatusBanner(null), 4000);
    } catch (err: unknown) {
      setConceptError({
        message:
          err instanceof Error
            ? err.message
            : 'Failed to import card file.',
      });
    }
  };

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  // Ensure greeting index stays in bounds when switching characters
  useEffect(() => {
    const totalGreetings = 1 + (character.alternate_greetings?.length || 0);
    if (activeGreetingIdx >= totalGreetings) {
      setActiveGreetingIdx(0);
    }
  }, [character.id, character.alternate_greetings?.length, activeGreetingIdx]);

  // Compute token count for each character in the roster for sorting & display
  const characterWithMetrics = useMemo(() => {
    return characters.map((charItem) => {
      const charStatBlock = charItem.extensions?.statBlock || statBlock;
      const charLorebook = charItem.character_book || lorebook;
      const breakdown = calculateCardTokenBreakdown(
        charItem,
        charLorebook,
        charStatBlock
      );
      return {
        char: charItem,
        totalTokens: breakdown.totalCardTokens,
      };
    });
  }, [characters, lorebook, statBlock]);

  const filteredAndSortedRoster = useMemo(() => {
    const q = rosterSearch.trim().toLowerCase();
    const filtered = characterWithMetrics.filter(({ char }) => {
      if (settings.hideNsfwTags && isCharacterNsfw(char, tags)) {
        return false;
      }
      const matchesTag =
        rosterTagFilter === 'all' || (char.tags || []).includes(rosterTagFilter);
      const matchesQuery =
        !q ||
        (char.name || '').toLowerCase().includes(q) ||
        (char.nickname || '').toLowerCase().includes(q) ||
        (char.description || '').toLowerCase().includes(q) ||
        (char.tags || []).some((t) => t.toLowerCase().includes(q));
      return matchesTag && matchesQuery;
    });

    return filtered.sort((a, b) => {
      if (rosterSort === 'name_asc') {
        return (a.char.name || '').localeCompare(b.char.name || '');
      }
      if (rosterSort === 'name_desc') {
        return (b.char.name || '').localeCompare(a.char.name || '');
      }
      if (rosterSort === 'tokens_desc') {
        return b.totalTokens - a.totalTokens;
      }
      if (rosterSort === 'tokens_asc') {
        return a.totalTokens - b.totalTokens;
      }
      // Default: modified_desc
      return (b.char.modification_date || 0) - (a.char.modification_date || 0);
    });
  }, [
    characterWithMetrics,
    rosterSearch,
    rosterTagFilter,
    rosterSort,
    settings.hideNsfwTags,
    tags,
  ]);

  const toggleCharacterTag = (tagName: string) => {
    ensureTagRegistered(tagName);
    const exists = character.tags.includes(tagName);
    updateCharacterField(
      'tags',
      exists
        ? character.tags.filter((t) => t !== tagName)
        : [...character.tags, tagName]
    );
  };

  const handleAddCustomCharacterTag = (directTagName?: string) => {
    const clean = (directTagName ?? newCustomTagInput).trim();
    if (!clean) return;
    const registered = ensureTagRegistered(clean);
    const tagName = registered ? registered.name : clean;
    if (!character.tags.includes(tagName)) {
      updateCharacterField('tags', [...character.tags, tagName]);
    }
    setNewCustomTagInput('');
  };

  // Greeting Carousel Handlers
  const totalGreetingsCount = 1 + (character.alternate_greetings?.length || 0);

  const currentGreetingValue =
    activeGreetingIdx === 0
      ? character.first_mes
      : character.alternate_greetings[activeGreetingIdx - 1] || '';

  const handleUpdateGreetingValue = (newVal: string) => {
    if (activeGreetingIdx === 0) {
      updateCharacterField('first_mes', newVal);
    } else {
      const nextAlts = [...(character.alternate_greetings || [])];
      nextAlts[activeGreetingIdx - 1] = newVal;
      updateCharacterField('alternate_greetings', nextAlts);
    }
  };

  const handleAddBlankAlternateGreeting = () => {
    const nextAlts = [...(character.alternate_greetings || []), ''];
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(nextAlts.length);
  };

  const handleDuplicateCurrentGreeting = () => {
    const nextAlts = [
      ...(character.alternate_greetings || []),
      currentGreetingValue,
    ];
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(nextAlts.length);
  };

  const handleDeleteCurrentAlternateGreeting = () => {
    if (activeGreetingIdx === 0) return;
    const targetAltIndex = activeGreetingIdx - 1;
    const nextAlts = (character.alternate_greetings || []).filter(
      (_, idx) => idx !== targetAltIndex
    );
    updateCharacterField('alternate_greetings', nextAlts);
    setActiveGreetingIdx(Math.max(0, activeGreetingIdx - 1));
  };

  // Drag-and-Drop Reordering for Alternate Greetings (indices 0..N-1 in character.alternate_greetings)
  const handleDropReorderAltGreeting = (fromAltIdx: number, toAltIdx: number) => {
    if (fromAltIdx === toAltIdx) return;
    const currentAlts = [...(character.alternate_greetings || [])];
    if (
      fromAltIdx < 0 ||
      toAltIdx < 0 ||
      fromAltIdx >= currentAlts.length ||
      toAltIdx >= currentAlts.length
    ) {
      return;
    }
    const [moved] = currentAlts.splice(fromAltIdx, 1);
    currentAlts.splice(toAltIdx, 0, moved);
    updateCharacterField('alternate_greetings', currentAlts);
    setActiveGreetingIdx(toAltIdx + 1);
  };

  // 1-Click AI Alternate Greeting Generator
  const handleGenerateAIGreeting = async () => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingGreeting(true);
    setConceptError(null);

    const cardContext = [
      `Character Name: ${character.name || '{{char}}'}`,
      `Description: ${character.description}`,
      `Personality: ${character.personality}`,
      `Scenario: ${character.scenario}`,
    ].join('\n');

    const twistDirective = altGreetingTwist.trim()
      ? `Scene / Mood Twist: "${altGreetingTwist.trim()}"`
      : "Create a distinct, atmospheric opening scene that showcases {{char}}'s voice and invites {{user}} into immediate interaction.";

    const prompt = [
      `Write an engaging SillyTavern opening greeting for ${character.name || '{{char}}'} addressing {{user}}.`,
      twistDirective,
      'Format actions in *italics* and spoken dialogue in "quotes". Output ONLY the greeting text.',
    ].join('\n');

    try {
      const usePortraitNow =
        visionSupported && hasPortraitImage && usePortraitAsVisionContext;

      const detailed = await generateCompletionDetailed(
        prompt,
        `Active Context Theme: ${activeTheme.name}`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 450,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrl: usePortraitNow ? character.avatar : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const nextAlts = [
          ...(character.alternate_greetings || []),
          detailed.content.trim(),
        ];
        updateCharacterField('alternate_greetings', nextAlts);
        setActiveGreetingIdx(nextAlts.length);
        setAltGreetingTwist('');
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message: 'Failed to generate greeting. Check AI connection settings.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingGreeting(false);
      }
    }
  };

  // 1-Click "✨ Describe Appearance from Portrait" (used in Wizard Step 1 & Portrait Workbench)
  const handleDescribeAppearanceFromPortraitCard = async () => {
    if (!character.avatar) return;
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsDescribingPortrait(true);
    setConceptError(null);
    setVisionFallbackBanner(null);

    const promptText = [
      `Inspect the attached Character Portrait image carefully and write a vivid, high-craft SillyTavern physical appearance & attire description for "${character.name || '{{char}}'}".`,
      `Include facial features, eye/hair details, physique/build, clothing/armor/accessories, posture, and visual aura.`,
      character.description.trim()
        ? `\nExisting Description Draft (integrate or enrich with visual details from the portrait):\n${character.description}`
        : '',
      `\nOutput ONLY the raw Markdown description content using {{char}} where appropriate, without conversational filler.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        promptText,
        `Character Name: ${character.name || '{{char}}'}\nPersonality: ${character.personality}\nScenario: ${character.scenario}`,
        aiConfig,
        controller.signal,
        {
          maxTokens: aiConfig.maxTokens || 512,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrl: character.avatar,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const currentDesc = character.description.trim();
        const nextDesc = currentDesc
          ? `${currentDesc}\n\n${detailed.content.trim()}`
          : detailed.content.trim();
        updateCharacterField('description', nextDesc);
        setImportStatusBanner(
          `✨ Generated physical appearance description from ${character.name || 'Character'}'s portrait!`
        );
        window.setTimeout(() => setImportStatusBanner(null), 4000);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message:
            err instanceof Error
              ? err.message
              : 'Failed to describe appearance from portrait.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsDescribingPortrait(false);
      }
    }
  };

  // Wizard Step 1: "Generate Full Character from Concept"
  const handleGenerateFullCharacterFromConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    const usePortraitNow =
      visionSupported && hasPortraitImage && usePortraitAsVisionContext;
    if (!conceptPrompt.trim() && !usePortraitNow) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingConcept(true);
    setConceptError(null);
    setVisionFallbackBanner(null);

    const prompt = [
      conceptPrompt.trim()
        ? `Generate a complete SillyTavern Character Card based on this concept: "${conceptPrompt.trim()}"`
        : `Generate a complete SillyTavern Character Card inspired directly by the attached Character Portrait image.`,
      usePortraitNow
        ? `The Character Portrait image is attached (~260 tokens). Inspect the portrait carefully and ensure the character's physical appearance, attire, aura, and description accurately reflect the portrait.`
        : '',
      character.name && character.name !== 'New Character'
        ? `Preferred Character Name: ${character.name}`
        : '',
      `Return a valid JSON object with these exact keys:`,
      `{`,
      `  "name": "Character Name",`,
      `  "nickname": "Short title or moniker",`,
      `  "description": "Multi-paragraph physical appearance, attire, and backstory using {{char}}",`,
      `  "personality": "Detailed temperament, quirks, speech style, and psychological motivations",`,
      `  "scenario": "Immediate setting and inciting situation involving {{char}} and {{user}}",`,
      `  "first_mes": "Rich multi-paragraph opening greeting with *actions* and \\"dialogue\\"",`,
      `  "mes_example": "<START>\\n{{user}}: \\"...\\"\\n{{char}}: *...* \\"...\\"",`,
      `  "system_prompt": "Narrative POV and roleplay directives for {{char}}"`,
      `}`,
      `Output ONLY valid JSON without markdown codeblocks or extra commentary.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        `Active Context Theme: ${activeTheme.name}`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 1200,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
          imageDataUrl: usePortraitNow ? character.avatar : undefined,
          onVisionFallback: (warning) => setVisionFallbackBanner(warning),
        }
      );

      if (!controller.signal.aborted && detailed.content) {
        if (detailed.visionFallbackWarning) {
          setVisionFallbackBanner(detailed.visionFallbackWarning);
        }
        const jsonMatch = detailed.content.match(/\{[\s\S]*\}/);
        const rawJson = jsonMatch ? jsonMatch[0] : detailed.content;
        const parsed = JSON.parse(rawJson) as Partial<CharacterCardData>;

        setCharacter((prev) => ({
          ...prev,
          name: parsed.name || prev.name,
          nickname: parsed.nickname || prev.nickname,
          description: parsed.description || prev.description,
          personality: parsed.personality || prev.personality,
          scenario: parsed.scenario || prev.scenario,
          first_mes: parsed.first_mes || prev.first_mes,
          mes_example: parsed.mes_example || prev.mes_example,
          system_prompt: parsed.system_prompt || prev.system_prompt,
        }));
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message:
            err instanceof Error
              ? `Could not parse AI response: ${err.message}`
              : 'Failed to generate full character from concept.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsGeneratingConcept(false);
      }
    }
  };

  // Modular DM/GM StatBlock Builder Handlers
  const handleAddStatItem = () => {
    const newItem: StatItem = {
      id: `stat-${Date.now()}`,
      label: `Stat ${statBlock.stats.length + 1}`,
      type: 'bar',
      defaultValue: '50',
      min: 0,
      max: 100,
      unit: '%',
      changeRules: 'Adjusts based on scene actions and dialogue choices.',
    };
    setStatBlock((prev) => ({
      ...prev,
      enableDMTracker: true,
      stats: [...prev.stats, newItem],
    }));
  };

  const handleUpdateStatItem = (
    id: string,
    patch: Partial<StatItem>
  ) => {
    setStatBlock((prev) => ({
      ...prev,
      stats: prev.stats.map((item) =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }));
  };

  const handleMoveStatItem = (index: number, direction: -1 | 1) => {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= statBlock.stats.length) return;
    setStatBlock((prev) => {
      const next = [...prev.stats];
      const [moved] = next.splice(index, 1);
      next.splice(targetIdx, 0, moved);
      return { ...prev, stats: next };
    });
  };

  const handleDropReorderStatItem = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setStatBlock((prev) => {
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= prev.stats.length ||
        toIdx >= prev.stats.length
      ) {
        return prev;
      }
      const next = [...prev.stats];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { ...prev, stats: next };
    });
  };

  const handleDeleteStatItem = (id: string) => {
    setStatBlock((prev) => ({
      ...prev,
      stats: prev.stats.filter((s) => s.id !== id),
    }));
  };

  const handleApplyStatTemplatePreset = (preset: StatTemplatePresetId) => {
    const generatedTemplate = buildStatTemplatePreset(preset, statBlock.stats);
    setStatBlock((prev) => ({
      ...prev,
      formatTemplate: generatedTemplate,
    }));
  };

  // Per-Stat "✨ AI Assist" Progression Rule Generator
  const handleGenerateStatRuleWithAI = async (stat: StatItem) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGeneratingStatRuleId(stat.id);
    setConceptError(null);

    const rangeInfo =
      stat.type === 'bar' || stat.type === 'number'
        ? `Range: ${stat.min ?? 0} to ${stat.max ?? 100}${stat.unit || ''}, Initial Value: ${stat.defaultValue}`
        : `Type: ${stat.type}, Initial Value: ${stat.defaultValue}`;

    const prompt = [
      `Write a concise, actionable 1-sentence DM/GM progression and update rule for a tracked roleplay stat.`,
      `Character: ${character.name || '{{char}}'} (${character.personality || 'Roleplay character'})`,
      `Stat Name: "${stat.label}" (${rangeInfo})`,
      stat.changeRules.trim()
        ? `Current Draft / Hint: "${stat.changeRules.trim()}"`
        : '',
      `Specify exact triggers (e.g., +2 to +10 on trust/help, -5 to -15 on betrayal/aggression, or how status/inventory shifts) so the AI knows when and how to update this stat every turn. Output ONLY the 1-sentence rule without quotes.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        `Character Description: ${character.description}\nScenario: ${character.scenario}`,
        aiConfig,
        controller.signal,
        {
          maxTokens: 120,
          temperature: 0.65,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
        handleUpdateStatItem(stat.id, {
          changeRules: detailed.content.trim().replace(/^["']|["']$/g, ''),
        });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof AIServiceError) {
        setConceptError({
          message: err.message,
          corsHint: err.isCorsOrNetworkError ? err.corsHint : undefined,
        });
      } else {
        setConceptError({
          message: 'Failed to generate stat progression rule with AI.',
        });
      }
    } finally {
      if (!controller.signal.aborted) {
        setGeneratingStatRuleId(null);
      }
    }
  };

  // 1-Click Compiler: Compiles stat tracking instructions into `post_history_instructions` AND injects initial stat block into `first_mes`
  const handleCompileStatBlockToCard = () => {
    const enabledStatBlock = { ...statBlock, enableDMTracker: true };
    setStatBlock(enabledStatBlock);

    const compiledInstructions = compileStatBlockPrompt(enabledStatBlock);
    const initialRenderedBlock = renderInitialStatBlockInstance(enabledStatBlock);

    // Strip any previously compiled [System Directive: Dynamic DM/GM Stat Tracker] block before appending
    const cleanPostHistory = (character.post_history_instructions || '')
      .replace(/\n*\[System Directive: Dynamic DM\/GM Stat Tracker\][\s\S]*$/i, '')
      .trim();

    const updatedPostHistory = [cleanPostHistory, compiledInstructions]
      .filter(Boolean)
      .join('\n\n');

    // Append initial stat block to first_mes if not already present
    const currentFirstMes = (character.first_mes || '').trim();
    const updatedFirstMes =
      initialRenderedBlock && !currentFirstMes.includes(initialRenderedBlock.trim())
        ? `${currentFirstMes}\n\n${initialRenderedBlock.trim()}`.trim()
        : currentFirstMes;

    setCharacter((prev) => ({
      ...prev,
      post_history_instructions: updatedPostHistory,
      first_mes: updatedFirstMes,
      extensions: {
        ...prev.extensions,
        statBlock: enabledStatBlock,
      },
    }));

    setCompiledBanner(
      'Compiled DM Stat Tracker rules into post_history_instructions and injected starting Status Block into first_mes.'
    );
    window.setTimeout(() => setCompiledBanner(null), 4000);
  };

  const liveRenderedStatPreview = useMemo(
    () => renderInitialStatBlockInstance(statBlock),
    [statBlock]
  );

  // Reusable SillyTavern 2:3 Portrait Slot Component
  const renderPortraitUploaderSlot = () => {
    const initials = (character.name || 'TS')
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <div className="w-full sm:w-44 shrink-0 space-y-2">
        <div
          onClick={() => portraitInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              void handlePortraitImageSelected(e.dataTransfer.files[0]);
            }
          }}
          style={{
            borderColor: 'var(--theme-accent)',
          }}
          className="group relative aspect-[2/3] w-full overflow-hidden rounded-xl border-2 bg-slate-950 shadow-md cursor-pointer"
          title="Click or drop an image to upload Character Portrait (2:3 SillyTavern aspect ratio)"
        >
          {character.avatar ? (
            <img
              src={character.avatar}
              alt={character.name}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-slate-900 p-3 text-center">
              <div
                style={{
                  color: 'var(--theme-accent)',
                  borderColor:
                    'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
                }}
                className="flex h-14 w-14 items-center justify-center rounded-full border bg-slate-900/90 text-xl font-bold tracking-tight"
              >
                {initials}
              </div>
              <span className="mt-2.5 text-xs font-semibold text-slate-200 line-clamp-1">
                {character.name || 'Untitled'}
              </span>
              <span className="mt-1 font-mono text-[10px] text-slate-400">
                2:3 Portrait (512×768)
              </span>
              <span
                style={{ color: 'var(--theme-accent)' }}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
              >
                <Upload className="h-3 w-3" />
                <span>Upload / Drop</span>
              </span>
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/65 opacity-0 transition-opacity group-hover:opacity-100 p-2 text-center">
            <ImageIcon className="h-5 w-5 text-white" />
            <span className="text-[11px] font-semibold text-white">
              {character.avatar ? 'Replace Portrait' : 'Upload Portrait'}
            </span>
            <span className="font-mono text-[10px] text-slate-300">
              Auto-checks 2:3 ratio
            </span>
          </div>
        </div>

        {/* Portrait Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => portraitInputRef.current?.click()}
            className="theme-hover-outline flex-1 flex items-center justify-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <Upload className="h-3 w-3" style={{ color: 'var(--theme-accent)' }} />
            <span>Upload</span>
          </button>

          {character.avatar && (
            <>
              <button
                type="button"
                onClick={() => void handleOpenManualCropper()}
                title="Adjust or crop portrait to 2:3 SillyTavern resolution"
                style={{ borderColor: 'var(--theme-accent)' }}
                className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-white dark:bg-slate-900 px-2 py-1.5 text-[11px] font-semibold text-slate-900 dark:text-white cursor-pointer"
              >
                <Crop
                  className="h-3 w-3"
                  style={{ color: 'var(--theme-accent)' }}
                />
                <span>Crop 2:3</span>
              </button>

              <button
                type="button"
                onClick={() => updateCharacterField('avatar', undefined)}
                title="Remove custom portrait"
                className="rounded-lg border border-rose-200 dark:border-rose-900/40 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>

        {/* Portrait Multimodal Vision Context Controls (shown when active model supports Vision and Portrait is uploaded) */}
        {visionSupported && hasPortraitImage && (
          <div className="space-y-1.5 pt-1">
            <button
              type="button"
              onClick={() =>
                setUsePortraitAsVisionContext((prev) => !prev)
              }
              style={
                usePortraitAsVisionContext
                  ? {
                      borderColor: 'var(--theme-accent)',
                      backgroundColor:
                        'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                    }
                  : undefined
              }
              title="When enabled, AI Assist and Concept Generation inspect a compressed 512px JPEG (~260 tokens) of this portrait. Never sent during Ghost-Text autocomplete."
              className={`theme-hover-outline w-full flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors cursor-pointer ${
                usePortraitAsVisionContext
                  ? 'text-slate-900 dark:text-white'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="leading-tight">
                👁️ Use Portrait as Visual Context (~260 tok)
              </span>
              {usePortraitAsVisionContext && (
                <Check
                  className="h-3.5 w-3.5 shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
              )}
            </button>

            <button
              type="button"
              disabled={isDescribingPortrait}
              onClick={handleDescribeAppearanceFromPortraitCard}
              style={{ borderColor: 'var(--theme-accent)' }}
              title="Inspect Character Portrait (~260 tokens) and generate/append physical appearance & attire into the Description field"
              className="theme-hover-outline w-full flex items-center justify-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
            >
              {isDescribingPortrait ? (
                <Loader2
                  className="h-3 w-3 animate-spin shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
              ) : (
                <Sparkles
                  className="h-3 w-3 shrink-0"
                  style={{ color: 'var(--theme-accent)' }}
                />
              )}
              <span>✨ Describe Appearance from Portrait</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Full-Width, Spacious Expandable DM / GM Stat-Block Builder Section (2-Column Responsive Grid)
  const renderStatBlockBuilderPanel = () => (
    <section
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 45%, transparent)',
      }}
      className="w-full rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-5 shadow-2xs"
    >
      {/* Expandable Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => setStatBlockExpanded((prev) => !prev)}
            className="flex items-center gap-2 text-left cursor-pointer group"
          >
            <Activity
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--theme-accent)' }}
            />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white group-hover:underline">
              Modular DM / GM Stat-Block Builder
            </h2>
            <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              {statBlockExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3" />
                  <span>Collapse</span>
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" />
                  <span>Expand ({statBlock.stats.length} Stats)</span>
                </>
              )}
            </span>
          </button>
          <Tooltip
            title="Dynamic RPG & Relationship Telemetry"
            content="Define custom Number, Progress Bar [████░░], Status Text, or Inventory List stats. Drag and drop attributes to reorder them, or use ✨ AI Assist on any stat to generate progression rules."
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={statBlock.enableDMTracker}
              onChange={(e) =>
                setStatBlock((prev) => ({
                  ...prev,
                  enableDMTracker: e.target.checked,
                }))
              }
              style={{ accentColor: 'var(--theme-accent)' }}
              className="h-3.5 w-3.5 cursor-pointer"
            />
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              Enable Dynamic Stat Tracker
            </span>
          </label>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            ({tokenBreakdown.stat_block} tkn)
          </span>
          <button
            type="button"
            onClick={handleAddStatItem}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1 rounded-lg border bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Tracked Stat</span>
          </button>
        </div>
      </div>

      {compiledBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-800 dark:text-emerald-200">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500 shrink-0" />
            <span>{compiledBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setCompiledBanner(null)}
            className="text-emerald-600 dark:text-emerald-300 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {statBlockExpanded && (
        <div
          style={{
            gridTemplateColumns:
              'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
          }}
          className="grid gap-6 items-start"
        >
          {/* LEFT COLUMN: Spacious Attribute Manager with Drag-and-Drop Reordering */}
          <div className="space-y-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Tracked Attributes ({statBlock.stats.length})
              </span>
              <span className="text-[11px] text-slate-500">
                Drag handle to reorder · ✨ AI Assist for rules
              </span>
            </div>

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {statBlock.stats.map((stat, idx) => {
                const isGeneratingThisRule = generatingStatRuleId === stat.id;
                const isDragOver = dragOverStatIdx === idx;
                return (
                  <div
                    key={stat.id}
                    draggable
                    onDragStart={() => setDraggedStatIdx(idx)}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (draggedStatIdx !== null && draggedStatIdx !== idx) {
                        setDragOverStatIdx(idx);
                      }
                    }}
                    onDragLeave={() => {
                      if (dragOverStatIdx === idx) {
                        setDragOverStatIdx(null);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (draggedStatIdx !== null) {
                        handleDropReorderStatItem(draggedStatIdx, idx);
                      }
                      setDraggedStatIdx(null);
                      setDragOverStatIdx(null);
                    }}
                    onDragEnd={() => {
                      setDraggedStatIdx(null);
                      setDragOverStatIdx(null);
                    }}
                    style={{
                      borderColor: isDragOver
                        ? 'var(--theme-accent)'
                        : 'color-mix(in srgb, var(--theme-accent) 25%, transparent)',
                    }}
                    className={`rounded-xl border bg-slate-50/80 dark:bg-slate-950/70 p-4 space-y-3 transition-all ${
                      isDragOver ? 'ring-2 ring-amber-500/40' : ''
                    }`}
                  >
                    {/* Row 1: Drag Handle, Stat Label, Type Selector, Reorder & Delete */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        title="Drag to reorder attribute"
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 pt-4 shrink-0"
                      >
                        <GripVertical className="h-4 w-4" />
                      </div>

                      <div className="flex-1 min-w-[160px]">
                        <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-0.5">
                          Attribute Label
                        </label>
                        <input
                          type="text"
                          value={stat.label}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              label: e.target.value,
                            })
                          }
                          placeholder="Stat Label (e.g., Affection, Sanity, Gold)"
                          className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                        />
                      </div>

                      <div className="min-w-[145px]">
                        <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-500 mb-0.5">
                          Stat Type
                        </label>
                        <select
                          value={stat.type}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              type: e.target.value as StatItemType,
                            })
                          }
                          className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          <option value="bar">Bar [████░░]</option>
                          <option value="number">Number</option>
                          <option value="text">Text / Status</option>
                          <option value="list">Inventory List</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1 pt-4 shrink-0">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveStatItem(idx, -1)}
                          title="Move stat up"
                          className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === statBlock.stats.length - 1}
                          onClick={() => handleMoveStatItem(idx, 1)}
                          title="Move stat down"
                          className="rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStatItem(stat.id)}
                          title="Delete stat"
                          className="rounded border border-rose-200 dark:border-rose-900/40 bg-white dark:bg-slate-900 p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Row 2: Initial Value, Min/Max, Unit */}
                    <div
                      style={{
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',
                      }}
                      className="grid gap-2.5"
                    >
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                          Initial Value
                        </label>
                        <input
                          type="text"
                          value={stat.defaultValue}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              defaultValue: e.target.value,
                            })
                          }
                          className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                        />
                      </div>

                      {(stat.type === 'bar' || stat.type === 'number') && (
                        <>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Min Value
                            </label>
                            <input
                              type="number"
                              value={stat.min ?? 0}
                              onChange={(e) =>
                                handleUpdateStatItem(stat.id, {
                                  min: Number(e.target.value),
                                })
                              }
                              className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Max Value
                            </label>
                            <input
                              type="number"
                              value={stat.max ?? 100}
                              onChange={(e) =>
                                handleUpdateStatItem(stat.id, {
                                  max: Number(e.target.value),
                                })
                              }
                              className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-500 mb-0.5">
                              Unit (e.g. %, HP)
                            </label>
                            <input
                              type="text"
                              value={stat.unit ?? ''}
                              onChange={(e) =>
                                handleUpdateStatItem(stat.id, {
                                  unit: e.target.value,
                                })
                              }
                              className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Row 3: AI Update / Progression Rule + Per-Stat ✨ AI Assist Button */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                          AI Update &amp; Progression Rule
                        </label>
                        <button
                          type="button"
                          disabled={isGeneratingThisRule}
                          onClick={() => handleGenerateStatRuleWithAI(stat)}
                          style={{ borderColor: 'var(--theme-accent)' }}
                          className="theme-hover-outline inline-flex items-center gap-1 rounded-md border bg-white dark:bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer"
                        >
                          {isGeneratingThisRule ? (
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
                          <span>✨ AI Assist Rule</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={stat.changeRules}
                        onChange={(e) =>
                          handleUpdateStatItem(stat.id, {
                            changeRules: e.target.value,
                          })
                        }
                        placeholder="When and how should the AI modify this stat every turn?"
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200"
                      />
                    </div>
                  </div>
                );
              })}

              {statBlock.stats.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-800 p-6 text-center text-xs text-slate-400">
                  No tracked attributes configured. Click &ldquo;+ Add Tracked Stat&rdquo; above to add RPG bars, relationship meters, or inventory lists.
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Wide Template Editor & Live Output Preview */}
          <div className="space-y-4 min-w-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                  Markdown Format Template &amp; Live Preview
                </h3>
                <p className="text-[11px] text-slate-500">
                  Use placeholders like{' '}
                  <code className="font-mono text-slate-700 dark:text-slate-300">
                    {'{{stat_name}}'}
                  </code>{' '}
                  for dynamic rendering at the end of every AI response.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    handleApplyStatTemplatePreset('compact_rpg_bar')
                  }
                  className="theme-hover-outline rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Compact RPG Bar
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyStatTemplatePreset('markdown_table')
                  }
                  className="theme-hover-outline rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleApplyStatTemplatePreset('collapsible_block')
                  }
                  className="theme-hover-outline rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  Collapsible
                </button>
              </div>
            </div>

            <textarea
              rows={6}
              value={statBlock.formatTemplate}
              onChange={(e) =>
                setStatBlock((prev) => ({
                  ...prev,
                  formatTemplate: e.target.value,
                }))
              }
              className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs text-slate-800 dark:text-slate-200"
            />

            {/* Roomy Live Rendered Stat Block Preview */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400">
                <span>Live Initial Output Preview (Injected into first_mes)</span>
                <span className="font-mono tabular-nums">
                  {estimateTokens(liveRenderedStatPreview)} tkn
                </span>
              </div>
              <pre className="font-mono text-xs leading-relaxed text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 rounded-lg p-3.5 overflow-x-auto border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
                {liveRenderedStatPreview || 'No template configured'}
              </pre>
            </div>

            {/* 1-Click Compiler CTA */}
            <button
              type="button"
              onClick={handleCompileStatBlockToCard}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline w-full flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2.5 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
            >
              <Zap
                className="h-4 w-4 shrink-0"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>
                1-Click Compile to post_history_instructions &amp; first_mes
              </span>
            </button>
          </div>
        </div>
      )}
    </section>
  );

  // Reusable Greetings Carousel Section with Drag-and-Drop Alternate Greeting Reordering
  const renderGreetingsCarousel = () => (
    <div
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
      }}
      className="rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-900 dark:text-white">
            First Message &amp; Alternate Greetings Carousel ({totalGreetingsCount})
          </span>
          <Tooltip content="SillyTavern lets users swipe through multiple opening greetings. Greeting #1 is stored in first_mes; additional greetings are stored in alternate_greetings[]. Drag Alt tabs to reorder them." />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={activeGreetingIdx === 0}
            onClick={() => setActiveGreetingIdx((i) => Math.max(0, i - 1))}
            className="rounded border border-slate-200 dark:border-slate-800 p-1 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
            title="Previous Greeting"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Greeting Tabs (Alt tabs support drag-and-drop reordering) */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-xs sm:max-w-md">
            {Array.from({ length: totalGreetingsCount }).map((_, idx) => {
              const isSelected = idx === activeGreetingIdx;
              const isAlt = idx > 0;
              const altIdx = idx - 1;
              const isDragOver = isAlt && dragOverAltGreetingIdx === altIdx;

              return (
                <button
                  key={idx}
                  type="button"
                  draggable={isAlt}
                  onDragStart={() => {
                    if (isAlt) setDraggedAltGreetingIdx(altIdx);
                  }}
                  onDragOver={(e) => {
                    if (!isAlt) return;
                    e.preventDefault();
                    if (
                      draggedAltGreetingIdx !== null &&
                      draggedAltGreetingIdx !== altIdx
                    ) {
                      setDragOverAltGreetingIdx(altIdx);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverAltGreetingIdx === altIdx) {
                      setDragOverAltGreetingIdx(null);
                    }
                  }}
                  onDrop={(e) => {
                    if (!isAlt) return;
                    e.preventDefault();
                    if (draggedAltGreetingIdx !== null) {
                      handleDropReorderAltGreeting(
                        draggedAltGreetingIdx,
                        altIdx
                      );
                    }
                    setDraggedAltGreetingIdx(null);
                    setDragOverAltGreetingIdx(null);
                  }}
                  onDragEnd={() => {
                    setDraggedAltGreetingIdx(null);
                    setDragOverAltGreetingIdx(null);
                  }}
                  onClick={() => setActiveGreetingIdx(idx)}
                  title={
                    isAlt
                      ? `Alternate Greeting #${altIdx + 1} (Drag tab to reorder)`
                      : 'Primary First Message (first_mes)'
                  }
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                        }
                      : isDragOver
                        ? { borderColor: 'var(--theme-accent)' }
                        : undefined
                  }
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {isAlt && (
                    <GripVertical className="h-2.5 w-2.5 opacity-60" />
                  )}
                  <span>
                    {idx === 0 ? '1 · first_mes' : `${idx + 1} · Alt #${idx}`}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            disabled={activeGreetingIdx >= totalGreetingsCount - 1}
            onClick={() =>
              setActiveGreetingIdx((i) =>
                Math.min(totalGreetingsCount - 1, i + 1)
              )
            }
            className="rounded border border-slate-200 dark:border-slate-800 p-1 text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
            title="Next Greeting"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleAddBlankAlternateGreeting}
            className="theme-hover-outline flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer whitespace-nowrap"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>New Alt</span>
          </button>

          <button
            type="button"
            onClick={handleDuplicateCurrentGreeting}
            title="Duplicate current greeting as an Alternate Greeting"
            className="rounded-md border border-slate-200 dark:border-slate-800 p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>

          {activeGreetingIdx > 0 && (
            <button
              type="button"
              onClick={handleDeleteCurrentAlternateGreeting}
              title="Delete this Alternate Greeting"
              className="rounded-md border border-rose-200 dark:border-rose-900/50 p-1 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 1-Click AI Alternate Greeting Generator Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-2.5">
        <input
          type="text"
          value={altGreetingTwist}
          onChange={(e) => setAltGreetingTwist(e.target.value)}
          placeholder="Optional twist for new AI Alternate Greeting (e.g., 'During a tavern brawl', 'Morning after a heist')..."
          className="theme-focus-ring flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
        />
        <button
          type="button"
          disabled={isGeneratingGreeting}
          onClick={handleGenerateAIGreeting}
          style={{ borderColor: 'var(--theme-accent)' }}
          className="theme-hover-outline flex items-center justify-center gap-1.5 rounded-md border bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50 cursor-pointer whitespace-nowrap"
        >
          {isGeneratingGreeting ? (
            <Loader2
              className="h-3.5 w-3.5 animate-spin"
              style={{ color: 'var(--theme-accent)' }}
            />
          ) : (
            <MessageSquarePlus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
          )}
          <span>1-Click AI Alternate Greeting</span>
        </button>
      </div>

      <SmartEditor
        label={
          activeGreetingIdx === 0
            ? 'First Message (Primary Greeting · first_mes)'
            : `Alternate Greeting #${activeGreetingIdx} (alternate_greetings[${activeGreetingIdx - 1}])`
        }
        fieldKey={
          activeGreetingIdx === 0
            ? 'first_mes'
            : `alternate_greeting_${activeGreetingIdx}`
        }
        value={currentGreetingValue}
        onChange={handleUpdateGreetingValue}
        tooltip="Opening message sent by {{char}} when a chat starts. Use *italics* for narration and quotes for dialogue."
        rows={7}
        isPermanentTokenField={false}
        usePortraitVisionContext={usePortraitAsVisionContext}
        onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
      />
    </div>
  );

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) {
          setIsDraggingFile(false);
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          e.preventDefault();
          setIsDraggingFile(false);
          void handleFilesSelected(e.dataTransfer.files);
        }
      }}
      className="relative flex flex-col lg:flex-row gap-6 items-start min-w-0 w-full"
    >
      {/* Hidden Portrait Uploader Input */}
      <input
        ref={portraitInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            void handlePortraitImageSelected(e.target.files[0]);
          }
          e.target.value = '';
        }}
      />

      {/* Interactive 2:3 Portrait Cropper Modal */}
      {cropperState && (
        <PortraitCropperModal
          imageSrc={cropperState.sourceUrl}
          originalWidth={cropperState.naturalWidth}
          originalHeight={cropperState.naturalHeight}
          characterName={character.name}
          reason={cropperState.reason}
          onCancel={() => setCropperState(null)}
          onApplyCrop={(croppedPngDataUrl, outW, outH) => {
            updateCharacterField('avatar', croppedPngDataUrl);
            setCropperState(null);
            setImportStatusBanner(
              `Cropped and applied 2:3 SillyTavern portrait (${outW}×${outH} px) to ${character.name}.`
            );
            window.setTimeout(() => setImportStatusBanner(null), 3500);
          }}
        />
      )}

      {/* Collapsible Character Library Roster Sidebar */}
      {rosterOpen ? (
        <aside
          style={{
            borderColor:
              'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
          }}
          className="w-full lg:w-72 shrink-0 rounded-xl border bg-white dark:bg-slate-900 p-4 space-y-3.5"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <User
                className="h-4 w-4"
                style={{ color: 'var(--theme-accent)' }}
              />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
                Character Roster ({characters.length})
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setRosterOpen(false)}
              title="Collapse Character Roster"
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>

          {/* + New Character, Import Card & Rescan Save Folder Buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => createNewCharacter()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-slate-900 dark:bg-white px-2.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Card</span>
            </button>

            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center justify-center gap-1 rounded-lg border bg-white dark:bg-zinc-900 px-2.5 py-2 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer whitespace-nowrap"
            >
              <Upload
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Import PNG/JSON</span>
            </button>
          </div>

          <input
            ref={importFileInputRef}
            type="file"
            accept=".png,.json,image/png,application/json,image/jpeg,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFilesSelected(e.target.files);
              e.target.value = '';
            }}
          />

          {/* Drag & Drop Steganography PNG / JSON Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              void handleFilesSelected(e.dataTransfer.files);
            }}
            onClick={() => importFileInputRef.current?.click()}
            style={
              isDraggingFile ? { borderColor: 'var(--theme-accent)' } : undefined
            }
            className={`rounded-lg border border-dashed p-2.5 text-center text-[11px] transition-colors cursor-pointer ${
              isDraggingFile
                ? 'bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-white'
                : 'border-slate-300 dark:border-zinc-800 text-slate-500 dark:text-slate-400 hover:border-slate-400'
            }`}
          >
            Drop SillyTavern <strong>.PNG</strong>, <strong>.JSON</strong>, or Portrait Image here
          </div>

          {importStatusBanner && (
            <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-200">
              {importStatusBanner}
            </div>
          )}

          {/* Search & Sort Controls */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder="Search characters..."
                className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 pl-8 pr-2.5 py-1.5 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <select
                aria-label="Sort Characters"
                value={rosterSort}
                onChange={(e) =>
                  setRosterSort(e.target.value as RosterSortOption)
                }
                className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="modified_desc">Sort: Last Modified</option>
                <option value="name_asc">Sort: Name (A–Z)</option>
                <option value="name_desc">Sort: Name (Z–A)</option>
                <option value="tokens_desc">Sort: Tokens (High)</option>
                <option value="tokens_asc">Sort: Tokens (Low)</option>
              </select>

              <select
                aria-label="Filter Characters by Tag"
                value={rosterTagFilter}
                onChange={(e) => setRosterTagFilter(e.target.value)}
                className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                <option value="all">All Tags</option>
                {tags
                  .filter((t) => !settings.hideNsfwTags || !isTagNsfw(t))
                  .map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Character Cards List with Miniature 2:3 Portrait Thumbnails */}
          <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-0.5">
            {filteredAndSortedRoster.map(({ char, totalTokens }) => {
              const isSelected = char.id === activeCharacterId;
              const charInitials = (char.name || 'TS')
                .split(/\s+/)
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <div
                  key={char.id}
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 10%, transparent)',
                        }
                      : undefined
                  }
                  className={`group rounded-lg border p-2.5 transition-colors ${
                    isSelected
                      ? 'bg-slate-50 dark:bg-slate-800/70'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950/50 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    {/* Miniature 2:3 Portrait Avatar Thumbnail */}
                    <button
                      type="button"
                      onClick={() => setActiveCharacterId(char.id!)}
                      className="flex items-start gap-2.5 flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div
                        style={{
                          borderColor:
                            'color-mix(in srgb, var(--theme-accent) 40%, transparent)',
                        }}
                        className="h-12 w-8 shrink-0 overflow-hidden rounded border bg-slate-900 flex items-center justify-center"
                      >
                        {char.avatar ? (
                          <img
                            src={char.avatar}
                            alt={char.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span
                            style={{ color: 'var(--theme-accent)' }}
                            className="font-mono text-[10px] font-bold"
                          >
                            {charInitials}
                          </span>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {char.name || 'Untitled Character'}
                          </div>
                          {isCharacterNsfw(char, tags) && (
                            <span className="shrink-0 rounded bg-rose-500/15 border border-rose-500/30 px-1 py-0.2 font-mono text-[9px] font-bold uppercase text-rose-600 dark:text-rose-400">
                              NSFW
                            </span>
                          )}
                        </div>
                        {char.nickname && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {char.nickname}
                          </div>
                        )}
                        <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                          <span className="font-mono tabular-nums">
                            {totalTokens.toLocaleString()} tkn
                          </span>
                          <span className="truncate max-w-24">
                            {(char.tags || []).slice(0, 2).join(' · ') ||
                              'No tags'}
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeleteTargetCharacter(char)}
                      title="Permanently Delete Character"
                      className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredAndSortedRoster.length === 0 && (
              <div className="py-6 px-3 text-center text-xs text-slate-400 space-y-1.5">
                {characters.length === 0 ? (
                  <>
                    <div className="font-medium text-slate-500 dark:text-slate-300">
                      Character Roster is Empty
                    </div>
                    <div>
                      Click <strong>+ New</strong> above, start editing on the right, or drop a SillyTavern <code>.PNG</code> / <code>.JSON</code> card here.
                    </div>
                  </>
                ) : (
                  <div>No characters match your filter.</div>
                )}
              </div>
            )}
          </div>
        </aside>
      ) : (
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          style={{ borderColor: 'var(--theme-accent)' }}
          className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer shrink-0"
        >
          <PanelLeftOpen
            className="h-4 w-4"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span>Roster ({characters.length})</span>
        </button>
      )}

      {/* Main Character Workbench Area */}
      <div className="flex-1 min-w-0 w-full space-y-6">
        {/* Top Workbench Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                {character.name || 'Untitled Character'}
              </h1>
              {isCharacterNsfw(character, tags) && (
                <span
                  title="Automatically flagged NSFW because an NSFW (18+) tag is attached or manual NSFW flag is enabled."
                  className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-rose-600 dark:text-rose-300"
                >
                  <ShieldAlert className="h-3 w-3" />
                  <span>🔞 NSFW</span>
                </span>
              )}
              <button
                type="button"
                onClick={() =>
                  setCharacter((prev) => ({
                    ...prev,
                    isNsfw: !prev.isNsfw,
                    extensions: {
                      ...prev.extensions,
                      isNsfw: !prev.isNsfw,
                    },
                  }))
                }
                title="Toggle explicit manual NSFW flag on this character (characters with NSFW tags are also auto-flagged NSFW)"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-semibold cursor-pointer transition-colors ${
                  character.isNsfw
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {character.isNsfw ? 'Manual NSFW: ON' : 'Flag NSFW'}
              </button>
              <span className="text-xs text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                v{character.character_version || '1.0.0'}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Active Theme:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {activeTheme.name}
              </strong>{' '}
              · Permanent: {tokenBreakdown.permanentTokens} tkn · Initial:{' '}
              {tokenBreakdown.temporaryTokens} tkn
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() =>
                exportCharacterAsPng(character, lorebook, activeTheme.color)
              }
              style={{ borderColor: 'var(--theme-accent)' }}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
              title="Export SillyTavern PNG Card with embedded V2 chara & V3 ccv3 tEXt chunks"
            >
              <ImageIcon
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export .PNG</span>
            </button>

            <button
              type="button"
              onClick={() =>
                exportCharacterAsJson(
                  character,
                  settings.cardSpecVersion,
                  lorebook
                )
              }
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              title="Export SillyTavern JSON Card"
            >
              <Download
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Export .JSON</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('json_inspector')}
              className="theme-hover-outline flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <FileJson
                className="h-3.5 w-3.5"
                style={{ color: 'var(--theme-accent)' }}
              />
              <span>Inspector</span>
            </button>
          </div>
        </div>

        {/* Error Banner if AI Concept/Greeting generation failed */}
        {conceptError && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">{conceptError.message}</div>
                {conceptError.corsHint && (
                  <div className="text-[11px] opacity-90 mt-0.5">
                    {conceptError.corsHint}
                  </div>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConceptError(null)}
              className="text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Helpful Vision Adapter Fallback Toast (when local GGUF lacks mmproj projector) */}
        {visionFallbackBanner && (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Vision (mmproj) Notice: </span>
                <span>{visionFallbackBanner}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setVisionFallbackBanner(null)}
              className="text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* MODE A: GUIDED 5-STEP WIZARD MODE */}
        {settings.editorMode === 'wizard' ? (
          <div className="space-y-6">
            {/* Stepper Progress Header */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-4"
            >
              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 170px), 1fr))',
                }}
                className="grid gap-2"
              >
                {WIZARD_STEPS.map((item) => {
                  const isCurrent = wizardStep === item.step;
                  const isCompleted = wizardStep > item.step;
                  return (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setWizardStep(item.step)}
                      style={
                        isCurrent
                          ? {
                              borderColor: 'var(--theme-accent)',
                              backgroundColor:
                                'color-mix(in srgb, var(--theme-accent) 12%, transparent)',
                            }
                          : undefined
                      }
                      className={`rounded-lg border p-2.5 text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'text-slate-900 dark:text-white'
                          : isCompleted
                            ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-700 dark:text-slate-200'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span>
                          0{item.step}. {item.title}
                        </span>
                        {isCompleted && (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] opacity-80 truncate">
                        {item.subtitle}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 1: Concept & Core Identity + 2:3 Portrait Slot + "Generate Full Character from Concept" */}
            {wizardStep === 1 && (
              <div className="space-y-6">
                <form
                  onSubmit={handleGenerateFullCharacterFromConcept}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles
                        className="h-4 w-4"
                        style={{ color: 'var(--theme-accent)' }}
                      />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Generate Full Character from Concept
                      </h2>
                    </div>
                    <span className="text-xs text-slate-500">
                      Uses Active Theme ({activeTheme.name}) &amp; Selected Tags
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Describe a character idea in 1–3 sentences (or upload a portrait below with Vision enabled) and let the AI draft the Name, Description, Personality, Scenario, First Message, and Example Dialogue automatically.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={conceptPrompt}
                      onChange={(e) => setConceptPrompt(e.target.value)}
                      placeholder="e.g., An exiled clockwork alchemist running a midnight apothecary in a flooded gothic city..."
                      className="theme-focus-ring flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3.5 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      disabled={
                        isGeneratingConcept ||
                        (!conceptPrompt.trim() &&
                          !(
                            visionSupported &&
                            hasPortraitImage &&
                            usePortraitAsVisionContext
                          ))
                      }
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                    >
                      {isGeneratingConcept ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Drafting Full Card...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-3.5 w-3.5" />
                          <span>Generate Full Character</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Wizard Step 1 Vision Context Controls when Portrait is Uploaded */}
                  {visionSupported && hasPortraitImage && (
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() =>
                          setUsePortraitAsVisionContext((prev) => !prev)
                        }
                        style={
                          usePortraitAsVisionContext
                            ? {
                                borderColor: 'var(--theme-accent)',
                                backgroundColor:
                                  'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                              }
                            : undefined
                        }
                        className={`theme-hover-outline inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                          usePortraitAsVisionContext
                            ? 'text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <span>👁️ Use Portrait as Visual Context (~260 tok)</span>
                        {usePortraitAsVisionContext && (
                          <Check
                            className="h-3.5 w-3.5 shrink-0"
                            style={{ color: 'var(--theme-accent)' }}
                          />
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isDescribingPortrait}
                        onClick={handleDescribeAppearanceFromPortraitCard}
                        style={{ borderColor: 'var(--theme-accent)' }}
                        className="theme-hover-outline inline-flex items-center gap-1.5 rounded-md border bg-slate-50 dark:bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-800 dark:text-slate-200 disabled:opacity-50 cursor-pointer"
                      >
                        {isDescribingPortrait ? (
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
                        <span>✨ Describe Appearance from Portrait</span>
                      </button>
                    </div>
                  )}
                </form>

                {/* Core Identity Fields + Portrait Slot */}
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Character Portrait, Identity &amp; Semantic Tags
                  </h3>

                  <div className="flex flex-col sm:flex-row gap-6 items-start">
                    {renderPortraitUploaderSlot()}

                    <div className="flex-1 min-w-0 w-full space-y-4">
                      <div
                        style={{
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
                        }}
                        className="grid gap-4"
                      >
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Character Name
                          </label>
                          <input
                            type="text"
                            value={character.name}
                            onChange={(e) =>
                              updateCharacterField('name', e.target.value)
                            }
                            onBlur={(e) => {
                              if (character.id) {
                                checkAndTriggerNameConflict(
                                  'character',
                                  character.id,
                                  e.target.value,
                                  'rename'
                                );
                              }
                            }}
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Nickname / Moniker (V3)
                          </label>
                          <input
                            type="text"
                            value={character.nickname || ''}
                            onChange={(e) =>
                              updateCharacterField('nickname', e.target.value)
                            }
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Creator
                          </label>
                          <input
                            type="text"
                            value={character.creator}
                            onChange={(e) =>
                              updateCharacterField('creator', e.target.value)
                            }
                            className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            Version
                          </label>
                          <input
                            type="text"
                            value={character.character_version}
                            onChange={(e) =>
                              updateCharacterField(
                                'character_version',
                                e.target.value
                              )
                            }
                            className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                          />
                        </div>
                      </div>

                      <TagSelector
                        tags={tags}
                        selectedTagNames={character.tags}
                        onToggleTag={toggleCharacterTag}
                        onAddCustomTag={(tagName) => handleAddCustomCharacterTag(tagName)}
                        label="Attach Semantic Tags (Injected into AI System Prompt)"
                        tooltip="Click tags from your 64+ built-in SFW & NSFW Tag Library to bind their AI Context Directives to concept generation and completions."
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Description & Personality */}
            {wizardStep === 2 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Description"
                  fieldKey="description"
                  value={character.description}
                  onChange={(val) => updateCharacterField('description', val)}
                  tooltip="Physical appearance, attire, backstory, and essential traits of {{char}}."
                  rows={7}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
                <SmartEditor
                  label="Personality Summary"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="Behavioral patterns, speech register, temperament, and core motivations."
                  rows={5}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
              </div>
            )}

            {/* Step 3: Scenario & Greetings Carousel */}
            {wizardStep === 3 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Scenario & Setting"
                  fieldKey="scenario"
                  value={character.scenario}
                  onChange={(val) => updateCharacterField('scenario', val)}
                  tooltip="Immediate setting and inciting situation framing the interaction."
                  rows={4}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
                {renderGreetingsCarousel()}
              </div>
            )}

            {/* Step 4: Example Dialogue & System Prompts */}
            {wizardStep === 4 && (
              <div className="space-y-5">
                <SmartEditor
                  label="Example Dialogue (<START>)"
                  fieldKey="mes_example"
                  value={character.mes_example}
                  onChange={(val) => updateCharacterField('mes_example', val)}
                  tooltip="Sample exchanges formatted with <START>, {{user}}, and {{char}}."
                  rows={6}
                  isPermanentTokenField={false}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
                <SmartEditor
                  label="System Prompt Override"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Card-specific narrative instructions overriding SillyTavern main prompt."
                  rows={4}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
                <SmartEditor
                  label="Post-History Instructions (UJB)"
                  fieldKey="post_history_instructions"
                  value={character.post_history_instructions}
                  onChange={(val) =>
                    updateCharacterField('post_history_instructions', val)
                  }
                  tooltip="High-priority instructions injected right before the AI generates its reply."
                  rows={4}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
                <SmartEditor
                  label="Creator Notes"
                  fieldKey="creator_notes"
                  value={character.creator_notes}
                  onChange={(val) => updateCharacterField('creator_notes', val)}
                  tooltip="Usage notes for players (not sent to the AI prompt)."
                  rows={3}
                  isPermanentTokenField={false}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
              </div>
            )}

            {/* Step 5: Full-Width DM StatBlock & Final Review */}
            {wizardStep === 5 && (
              <div className="space-y-6">
                {renderStatBlockBuilderPanel()}

                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Card Readiness Summary
                  </h3>
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 200px), 1fr))',
                    }}
                    className="grid gap-3 text-xs"
                  >
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Permanent Tokens</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.permanentTokens} tkn
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Greeting + Examples</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.temporaryTokens} tkn
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Alternate Greetings</span>
                      <span className="font-mono font-semibold">
                        {character.alternate_greetings.length}
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 flex justify-between items-center">
                      <span className="text-slate-500">Total Card Footprint</span>
                      <span className="font-mono font-bold">
                        {tokenBreakdown.totalCardTokens} tkn
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => updateSettings({ editorMode: 'sandbox' })}
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      Open in Full Sandbox Workbench
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('json_inspector')}
                      className="theme-hover-outline rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Inspect SillyTavern JSON Payload
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Bottom Navigation Bar */}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
              <button
                type="button"
                disabled={wizardStep === 1}
                onClick={() => setWizardStep((s) => Math.max(1, s - 1))}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Previous Step</span>
              </button>
              <span className="font-mono text-xs text-slate-500">
                Step {wizardStep} of 5
              </span>
              {wizardStep < 5 ? (
                <button
                  type="button"
                  onClick={() => setWizardStep((s) => Math.min(5, s + 1))}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <span>Next Step</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => updateSettings({ editorMode: 'sandbox' })}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="theme-hover-outline flex items-center gap-1.5 rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                >
                  <Check className="h-4 w-4" />
                  <span>Finish Wizard</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* MODE B: FULL SANDBOX WORKBENCH */
          <div className="space-y-6">
            {/* Identity, 2:3 Portrait Uploader & Semantic Tags Card */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Character Portrait (2:3), Identity &amp; Semantic Tags
                  </h2>
                  <Tooltip content="Upload or drop a Character Portrait (automatically checks SillyTavern's 2:3 aspect ratio and opens the interactive cropper if needed), edit V2/V3 metadata, and assign semantic AI tags." />
                </div>

                {/* Bound Lorebook Selector */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-500">Bound World Book:</span>
                  <select
                    value={character.character_book?.id || lorebook.id || ''}
                    onChange={(e) => {
                      const found = lorebooks.find(
                        (l) => l.id === e.target.value
                      );
                      if (found) {
                        updateCharacterField('character_book', found);
                      }
                    }}
                    className="theme-focus-ring rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {lorebooks.map((lb) => (
                      <option key={lb.id} value={lb.id}>
                        {lb.name} ({lb.entries.length} entries)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-6 items-start">
                {/* Left: Prominent 2:3 Character Portrait Uploader & Cropper Slot */}
                {renderPortraitUploaderSlot()}

                {/* Right: Metadata Grid & Semantic Tags */}
                <div className="flex-1 min-w-0 w-full space-y-4">
                  <div
                    style={{
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(min(100%, 190px), 1fr))',
                    }}
                    className="grid gap-4"
                  >
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Character Name</span>
                        <Tooltip content="Replaces {{char}} macro across all prompts and greetings." />
                      </label>
                      <input
                        type="text"
                        value={character.name}
                        onChange={(e) =>
                          updateCharacterField('name', e.target.value)
                        }
                        onBlur={(e) => {
                          if (character.id) {
                            checkAndTriggerNameConflict(
                              'character',
                              character.id,
                              e.target.value,
                              'rename'
                            );
                          }
                        }}
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Nickname / Moniker (V3)</span>
                        <Tooltip content="Optional V3 display moniker or title." />
                      </label>
                      <input
                        type="text"
                        value={character.nickname || ''}
                        onChange={(e) =>
                          updateCharacterField('nickname', e.target.value)
                        }
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Creator Attribution</span>
                        <Tooltip content="Card author name embedded in V2/V3 metadata." />
                      </label>
                      <input
                        type="text"
                        value={character.creator}
                        onChange={(e) =>
                          updateCharacterField('creator', e.target.value)
                        }
                        className="theme-focus-ring w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <span>Character Version</span>
                        <Tooltip content="Semantic version string for tracking card revisions." />
                      </label>
                      <input
                        type="text"
                        value={character.character_version}
                        onChange={(e) =>
                          updateCharacterField(
                            'character_version',
                            e.target.value
                          )
                        }
                        className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                      />
                    </div>
                  </div>

                  {/* Assigned Semantic Tags */}
                  <div className="pt-1">
                    <TagSelector
                      tags={tags}
                      selectedTagNames={character.tags}
                      onToggleTag={toggleCharacterTag}
                      onAddCustomTag={(tagName) => handleAddCustomCharacterTag(tagName)}
                      label="Assigned Semantic Character Tags"
                      tooltip="Click tags from your Global Tag Library to bind their AI Context Directives to every AI Assist and Ghost Text completion."
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Full-Width Modular DM / GM Stat-Block Builder Section */}
            {renderStatBlockBuilderPanel()}

            {/* Full-Width Character Definition Editors */}
            <div className="space-y-5">
              <SmartEditor
                label="Description"
                fieldKey="description"
                value={character.description}
                onChange={(val) => updateCharacterField('description', val)}
                tooltip="Physical appearance, core backstory, attire, and essential traits of {{char}}. Sent in permanent context."
                rows={6}
                isPermanentTokenField={true}
                usePortraitVisionContext={usePortraitAsVisionContext}
                onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
              />

              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                }}
                className="grid gap-5 items-start"
              >
                <SmartEditor
                  label="Personality Summary"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="Concise behavioral patterns, temperament, speech register, and psychological drives."
                  rows={5}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />

                <SmartEditor
                  label="Scenario & Setting"
                  fieldKey="scenario"
                  value={character.scenario}
                  onChange={(val) => updateCharacterField('scenario', val)}
                  tooltip="Immediate setting, atmosphere, and inciting situation framing the interaction between {{char}} and {{user}}."
                  rows={5}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
              </div>

              {/* First Message & Alternate Greetings Carousel */}
              {renderGreetingsCarousel()}

              <SmartEditor
                label="Example Dialogue (<START>)"
                fieldKey="mes_example"
                value={character.mes_example}
                onChange={(val) => updateCharacterField('mes_example', val)}
                tooltip="Sample exchanges formatted with <START>, {{user}}, and {{char}} to calibrate voice and formatting."
                rows={5}
                isPermanentTokenField={false}
                usePortraitVisionContext={usePortraitAsVisionContext}
                onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
              />

              <div
                style={{
                  gridTemplateColumns:
                    'repeat(auto-fit, minmax(min(100%, 380px), 1fr))',
                }}
                className="grid gap-5 items-start"
              >
                <SmartEditor
                  label="System Prompt Override"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Card-specific narrative instructions overriding or supplementing SillyTavern main prompt."
                  rows={4}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />

                <SmartEditor
                  label="Post-History Instructions (UJB / Jailbreak)"
                  fieldKey="post_history_instructions"
                  value={character.post_history_instructions}
                  onChange={(val) =>
                    updateCharacterField('post_history_instructions', val)
                  }
                  tooltip="High-priority instructions injected at the bottom of chat history right before the AI generates its reply. Also holds compiled DM StatBlock rules."
                  rows={4}
                  isPermanentTokenField={true}
                  usePortraitVisionContext={usePortraitAsVisionContext}
                  onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
                />
              </div>

              <SmartEditor
                label="Creator Notes"
                fieldKey="creator_notes"
                value={character.creator_notes}
                onChange={(val) => updateCharacterField('creator_notes', val)}
                tooltip="Author notes, recommended settings, and context for users (does not consume prompt tokens)."
                rows={3}
                isPermanentTokenField={false}
                usePortraitVisionContext={usePortraitAsVisionContext}
                onTogglePortraitVisionContext={setUsePortraitAsVisionContext}
              />
            </div>
          </div>
        )}
      </div>

      {/* Permanent Delete Confirmation Modal */}
      {deleteTargetCharacter && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div
            style={{ borderColor: 'var(--theme-accent)' }}
            className="w-full max-w-md rounded-xl border bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Permanently Delete Character?
              </h3>
              <button
                type="button"
                onClick={() => setDeleteTargetCharacter(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Are you sure you want to permanently delete{' '}
              <strong className="text-slate-900 dark:text-white">
                {deleteTargetCharacter.name || 'Untitled Character'}
              </strong>{' '}
              from your roster and local storage? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetCharacter(null)}
                className="rounded-lg border border-slate-200 dark:border-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteTargetCharacter.id) {
                    deleteCharacter(deleteTargetCharacter.id);
                  }
                  setDeleteTargetCharacter(null);
                }}
                className="rounded-lg bg-rose-600 hover:bg-rose-700 px-3.5 py-1.5 text-xs font-semibold text-white cursor-pointer"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
