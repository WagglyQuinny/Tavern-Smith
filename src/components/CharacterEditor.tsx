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
  Loader2,
  AlertTriangle,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  FileJson,
  Zap,
  Upload,
  Download,
  Image as ImageIcon,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import {
  CharacterCardData,
  RosterSortOption,
  StatItem,
  StatItemType,
  StatTemplatePresetId,
} from '../types';
import { SmartEditor } from './SmartEditor';
import { Tooltip } from './Tooltip';
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
} from '../utils/cardIO';
import { AIServiceError, generateCompletionDetailed } from '../services/aiService';

const WIZARD_STEPS = [
  {
    step: 1,
    title: 'Concept & Identity',
    subtitle: 'Name, semantic tags & 1-click AI concept generator',
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
    activeTheme,
    aiConfig,
    settings,
    updateSettings,
    tokenBreakdown,
    setActiveTab,
    importFromFiles,
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

  const abortRef = useRef<AbortController | null>(null);
  const importFileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesSelected = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    try {
      const res = await importFromFiles(files);
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
  }, [characterWithMetrics, rosterSearch, rosterTagFilter, rosterSort]);

  const toggleCharacterTag = (tagName: string) => {
    const exists = character.tags.includes(tagName);
    updateCharacterField(
      'tags',
      exists
        ? character.tags.filter((t) => t !== tagName)
        : [...character.tags, tagName]
    );
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
      : 'Create a distinct, atmospheric opening scene that showcases {{char}}\'s voice and invites {{user}} into immediate interaction.';

    const prompt = [
      `Write an engaging SillyTavern opening greeting for ${character.name || '{{char}}'} addressing {{user}}.`,
      twistDirective,
      'Format actions in *italics* and spoken dialogue in "quotes". Output ONLY the greeting text.',
    ].join('\n');

    try {
      const detailed = await generateCompletionDetailed(
        prompt,
        cardContext,
        aiConfig,
        controller.signal,
        {
          maxTokens: 450,
          temperature: aiConfig.temperature,
          activeTheme,
          allTags: tags,
          characterTags: character.tags,
        }
      );

      if (!controller.signal.aborted && detailed.content.trim()) {
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

  // Wizard Step 1: "Generate Full Character from Concept"
  const handleGenerateFullCharacterFromConcept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!conceptPrompt.trim()) return;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGeneratingConcept(true);
    setConceptError(null);

    const prompt = [
      `Generate a complete SillyTavern Character Card based on this concept: "${conceptPrompt.trim()}"`,
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
        }
      );

      if (!controller.signal.aborted && detailed.content) {
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

  // Reusable DM StatBlock Builder Panel
  const renderStatBlockBuilderPanel = () => (
    <div
      style={{
        borderColor: 'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
      }}
      className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Activity
            className="h-4 w-4"
            style={{ color: 'var(--theme-accent)' }}
          />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            Modular DM / GM Stat-Block Builder
          </h2>
          <Tooltip
            title="Dynamic RPG & Relationship Telemetry"
            content="Define custom Number, Progress Bar [████░░], Status Text, or Inventory List stats. Click '1-Click Compile' to inject tracking rules into post_history_instructions and the starting block into first_mes."
          />
        </div>

        <div className="flex items-center gap-2">
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
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Enable Tracker
            </span>
          </label>
          <span className="font-mono text-[11px] text-slate-400 tabular-nums">
            ({tokenBreakdown.stat_block} tkn)
          </span>
        </div>
      </div>

      {compiledBanner && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
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

      {/* Tracked Stats List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Tracked Attributes ({statBlock.stats.length})
          </span>
          <button
            type="button"
            onClick={handleAddStatItem}
            style={{ borderColor: 'var(--theme-accent)' }}
            className="theme-hover-outline flex items-center gap-1 rounded-md border bg-slate-50 dark:bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer"
          >
            <Plus
              className="h-3.5 w-3.5"
              style={{ color: 'var(--theme-accent)' }}
            />
            <span>Add Stat</span>
          </button>
        </div>

        <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
          {statBlock.stats.map((stat, idx) => (
            <div
              key={stat.id}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/70 p-3 space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <input
                  type="text"
                  value={stat.label}
                  onChange={(e) =>
                    handleUpdateStatItem(stat.id, { label: e.target.value })
                  }
                  placeholder="Stat Label (e.g., Affection)"
                  className="theme-focus-ring flex-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-900 dark:text-white"
                />

                <select
                  value={stat.type}
                  onChange={(e) =>
                    handleUpdateStatItem(stat.id, {
                      type: e.target.value as StatItemType,
                    })
                  }
                  className="theme-focus-ring rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <option value="bar">Bar [████░░]</option>
                  <option value="number">Number</option>
                  <option value="text">Text / Status</option>
                  <option value="list">Inventory List</option>
                </select>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => handleMoveStatItem(idx, -1)}
                    title="Move stat up"
                    className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === statBlock.stats.length - 1}
                    onClick={() => handleMoveStatItem(idx, 1)}
                    title="Move stat down"
                    className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteStatItem(stat.id)}
                    title="Delete stat"
                    className="p-1 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <label className="block text-[10px] text-slate-500 mb-0.5">
                    Default Value
                  </label>
                  <input
                    type="text"
                    value={stat.defaultValue}
                    onChange={(e) =>
                      handleUpdateStatItem(stat.id, {
                        defaultValue: e.target.value,
                      })
                    }
                    className="theme-focus-ring font-mono w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                  />
                </div>

                {(stat.type === 'bar' || stat.type === 'number') && (
                  <>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
                        Min / Max
                      </label>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={stat.min ?? 0}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              min: Number(e.target.value),
                            })
                          }
                          className="font-mono w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs text-slate-900 dark:text-white tabular-nums"
                        />
                        <input
                          type="number"
                          value={stat.max ?? 100}
                          onChange={(e) =>
                            handleUpdateStatItem(stat.id, {
                              max: Number(e.target.value),
                            })
                          }
                          className="font-mono w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-1.5 py-1 text-xs text-slate-900 dark:text-white tabular-nums"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500 mb-0.5">
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
                        className="font-mono w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-0.5">
                  AI Change / Progression Rule
                </label>
                <input
                  type="text"
                  value={stat.changeRules}
                  onChange={(e) =>
                    handleUpdateStatItem(stat.id, {
                      changeRules: e.target.value,
                    })
                  }
                  placeholder="When and how should the AI modify this stat?"
                  className="theme-focus-ring w-full rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-700 dark:text-slate-200"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Format Template Presets & Editor */}
      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Markdown Format Template
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleApplyStatTemplatePreset('compact_rpg_bar')}
              className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Compact RPG Bar
            </button>
            <button
              type="button"
              onClick={() => handleApplyStatTemplatePreset('markdown_table')}
              className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Table
            </button>
            <button
              type="button"
              onClick={() =>
                handleApplyStatTemplatePreset('collapsible_block')
              }
              className="rounded border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
            >
              Collapsible
            </button>
          </div>
        </div>

        <textarea
          rows={4}
          value={statBlock.formatTemplate}
          onChange={(e) =>
            setStatBlock((prev) => ({
              ...prev,
              formatTemplate: e.target.value,
            }))
          }
          className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 text-xs text-slate-800 dark:text-slate-200"
        />

        {/* Live Rendered Stat Block Preview */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Live Initial Output Preview</span>
            <span className="font-mono tabular-nums">
              {estimateTokens(liveRenderedStatPreview)} tkn
            </span>
          </div>
          <pre className="font-mono text-[11px] text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 rounded-lg p-2.5 overflow-x-auto border border-slate-200 dark:border-slate-800 whitespace-pre-wrap">
            {liveRenderedStatPreview || 'No template configured'}
          </pre>
        </div>

        {/* 1-Click Compiler CTA */}
        <button
          type="button"
          onClick={handleCompileStatBlockToCard}
          style={{ borderColor: 'var(--theme-accent)' }}
          className="theme-hover-outline w-full flex items-center justify-center gap-2 rounded-lg border bg-slate-900 dark:bg-white px-3.5 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
        >
          <Zap
            className="h-3.5 w-3.5"
            style={{ color: 'var(--theme-accent)' }}
          />
          <span>
            1-Click Compile to post_history_instructions &amp; first_mes
          </span>
        </button>
      </div>
    </div>
  );

  // Reusable Greetings Carousel Section
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
          <Tooltip content="SillyTavern lets users swipe through multiple opening greetings. Greeting #1 is stored in first_mes; additional greetings are stored in alternate_greetings[]." />
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

          {/* Greeting Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto max-w-xs sm:max-w-md">
            {Array.from({ length: totalGreetingsCount }).map((_, idx) => {
              const isSelected = idx === activeGreetingIdx;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveGreetingIdx(idx)}
                  style={
                    isSelected
                      ? {
                          borderColor: 'var(--theme-accent)',
                          backgroundColor:
                            'color-mix(in srgb, var(--theme-accent) 14%, transparent)',
                        }
                      : undefined
                  }
                  className={`rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    isSelected
                      ? 'text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {idx === 0 ? '1 · first_mes' : `${idx + 1} · Alt #${idx}`}
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
      />
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
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

          {/* + New Character & Import Card Buttons */}
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
            accept=".png,.json,image/png,application/json"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFilesSelected(e.target.files);
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
              handleFilesSelected(e.dataTransfer.files);
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
            Drop SillyTavern <strong>.PNG</strong> or <strong>.JSON</strong> card here
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
                {tags.map((t) => (
                  <option key={t.id} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Character Cards List */}
          <div className="space-y-2 max-h-[62vh] overflow-y-auto pr-0.5">
            {filteredAndSortedRoster.map(({ char, totalTokens }) => {
              const isSelected = char.id === activeCharacterId;
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
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveCharacterId(char.id!)}
                      className="flex-1 text-left min-w-0 cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {char.name || 'Untitled Character'}
                      </div>
                      {char.nickname && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {char.nickname}
                        </div>
                      )}
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

                  <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                    <span className="font-mono tabular-nums">
                      {totalTokens.toLocaleString()} tkn
                    </span>
                    <span className="truncate max-w-32">
                      {(char.tags || []).slice(0, 2).join(' · ') || 'No tags'}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredAndSortedRoster.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                No characters match your filter.
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                {character.name || 'Untitled Character'}
              </h1>
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
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => updateSettings({ editorMode: 'sandbox' })}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                  settings.editorMode === 'sandbox'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sliders className="h-3.5 w-3.5" />
                <span>Full Sandbox</span>
              </button>
              <button
                type="button"
                onClick={() => updateSettings({ editorMode: 'wizard' })}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                  settings.editorMode === 'wizard'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Wand2 className="h-3.5 w-3.5" />
                <span>5-Step Wizard</span>
              </button>
            </div>

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
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
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

            {/* Step 1: Concept & Core Identity + "Generate Full Character from Concept" */}
            {wizardStep === 1 && (
              <div className="space-y-6">
                <form
                  onSubmit={handleGenerateFullCharacterFromConcept}
                  style={{ borderColor: 'var(--theme-accent)' }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-3"
                >
                  <div className="flex items-center justify-between">
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
                    Describe a character idea in 1–3 sentences and let the AI draft the Name, Description, Personality, Scenario, First Message, and Example Dialogue automatically.
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
                      disabled={isGeneratingConcept || !conceptPrompt.trim()}
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
                </form>

                {/* Core Identity Fields */}
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Character Identity &amp; Semantic Tags
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                      Attach Semantic Tags (Injected into AI System Prompt)
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => {
                        const active = character.tags.includes(tag.name);
                        return (
                          <button
                            key={tag.id}
                            type="button"
                            onClick={() => toggleCharacterTag(tag.name)}
                            style={
                              active
                                ? {
                                    borderColor: tag.color,
                                    backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                                  }
                                : undefined
                            }
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium cursor-pointer ${
                              active
                                ? 'text-slate-900 dark:text-white'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500'
                            }`}
                          >
                            {tag.name}
                          </button>
                        );
                      })}
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
                />
                <SmartEditor
                  label="Personality Summary"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="Behavioral patterns, speech register, temperament, and core motivations."
                  rows={5}
                  isPermanentTokenField={true}
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
                />
                <SmartEditor
                  label="System Prompt Override"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Card-specific narrative instructions overriding SillyTavern main prompt."
                  rows={4}
                  isPermanentTokenField={true}
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
                />
                <SmartEditor
                  label="Creator Notes"
                  fieldKey="creator_notes"
                  value={character.creator_notes}
                  onChange={(val) => updateCharacterField('creator_notes', val)}
                  tooltip="Usage notes for players (not sent to the AI prompt)."
                  rows={3}
                  isPermanentTokenField={false}
                />
              </div>
            )}

            {/* Step 5: DM StatBlock & Final Review */}
            {wizardStep === 5 && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-7">{renderStatBlockBuilderPanel()}</div>
                <div
                  style={{
                    borderColor:
                      'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
                  }}
                  className="lg:col-span-5 rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
                >
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Card Readiness Summary
                  </h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Permanent Tokens</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.permanentTokens} tkn
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Greeting + Examples</span>
                      <span className="font-mono font-semibold">
                        {tokenBreakdown.temporaryTokens} tkn
                      </span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500">Alternate Greetings</span>
                      <span className="font-mono font-semibold">
                        {character.alternate_greetings.length}
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Total Card Footprint</span>
                      <span className="font-mono font-bold">
                        {tokenBreakdown.totalCardTokens} tkn
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => updateSettings({ editorMode: 'sandbox' })}
                      style={{ borderColor: 'var(--theme-accent)' }}
                      className="theme-hover-outline w-full rounded-lg border bg-slate-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-slate-900 cursor-pointer"
                    >
                      Open in Full Sandbox Workbench
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('json_inspector')}
                      className="theme-hover-outline w-full rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
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
            {/* Identity & Semantic Tags Card */}
            <div
              style={{
                borderColor:
                  'color-mix(in srgb, var(--theme-accent) 35%, transparent)',
              }}
              className="rounded-xl border bg-white dark:bg-slate-900 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Character Identity, Bound Lorebook &amp; Semantic Tags
                  </h2>
                  <Tooltip content="Core V2/V3 metadata fields and semantic tags injected into AI Assist requests." />
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                      updateCharacterField('character_version', e.target.value)
                    }
                    className="theme-focus-ring font-mono w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-white tabular-nums"
                  />
                </div>
              </div>

              {/* Assigned Semantic Tags */}
              <div className="space-y-1.5 pt-1">
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                  <span>Assigned Semantic Character Tags</span>
                  <Tooltip content="Click tags from your Global Tag Library to bind their AI Context Directives to every AI Assist and Ghost Text completion." />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => {
                    const active = character.tags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleCharacterTag(tag.name)}
                        style={
                          active
                            ? {
                                borderColor: tag.color,
                                backgroundColor: `color-mix(in srgb, ${tag.color} 15%, transparent)`,
                              }
                            : undefined
                        }
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'text-slate-900 dark:text-white'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Split Grid: 8 Cols SmartEditors + 4 Cols DM StatBlock Builder */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 xl:col-span-8 space-y-5">
                <SmartEditor
                  label="Description"
                  fieldKey="description"
                  value={character.description}
                  onChange={(val) => updateCharacterField('description', val)}
                  tooltip="Physical appearance, core backstory, attire, and essential traits of {{char}}. Sent in permanent context."
                  rows={6}
                  isPermanentTokenField={true}
                />

                <SmartEditor
                  label="Personality Summary"
                  fieldKey="personality"
                  value={character.personality}
                  onChange={(val) => updateCharacterField('personality', val)}
                  tooltip="Concise behavioral patterns, temperament, speech register, and psychological drives."
                  rows={4}
                  isPermanentTokenField={true}
                />

                <SmartEditor
                  label="Scenario & Setting"
                  fieldKey="scenario"
                  value={character.scenario}
                  onChange={(val) => updateCharacterField('scenario', val)}
                  tooltip="Immediate setting, atmosphere, and inciting situation framing the interaction between {{char}} and {{user}}."
                  rows={4}
                  isPermanentTokenField={true}
                />

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
                />

                <SmartEditor
                  label="System Prompt Override"
                  fieldKey="system_prompt"
                  value={character.system_prompt}
                  onChange={(val) => updateCharacterField('system_prompt', val)}
                  tooltip="Card-specific narrative instructions overriding or supplementing SillyTavern main prompt."
                  rows={3}
                  isPermanentTokenField={true}
                />

                <SmartEditor
                  label="Post-History Instructions (UJB / Jailbreak)"
                  fieldKey="post_history_instructions"
                  value={character.post_history_instructions}
                  onChange={(val) =>
                    updateCharacterField('post_history_instructions', val)
                  }
                  tooltip="High-priority instructions injected at the bottom of chat history right before the AI generates its reply. Also holds compiled DM StatBlock rules."
                  rows={5}
                  isPermanentTokenField={true}
                />

                <SmartEditor
                  label="Creator Notes"
                  fieldKey="creator_notes"
                  value={character.creator_notes}
                  onChange={(val) => updateCharacterField('creator_notes', val)}
                  tooltip="Author notes, recommended settings, and context for users (does not consume prompt tokens)."
                  rows={3}
                  isPermanentTokenField={false}
                />
              </div>

              {/* Right Column: Modular DM/GM Stat Block Builder */}
              <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-16">
                {renderStatBlockBuilderPanel()}
              </div>
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
              from your library and local storage? This action cannot be undone.
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
