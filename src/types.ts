export type LorebookPosition = 'before_char' | 'after_char' | 'an_top' | 'an_bottom' | 'at_depth';

export interface LorebookEntry {
  id: number | string;
  comment?: string;
  keys: string[];
  secondary_keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  constant: boolean;
  selective: boolean;
  position: LorebookPosition;
  priority?: number;
  depth?: number;
  probability?: number;
  tags: string[];
}

export interface Lorebook {
  id?: string;
  name: string;
  description: string;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  entries: LorebookEntry[];
  tags?: string[];
  modification_date?: number;
  extensions?: Record<string, unknown>;
}

export type StatItemType = 'number' | 'bar' | 'text' | 'list';

export interface StatItem {
  id: string;
  label: string;
  type: StatItemType;
  defaultValue: string;
  min?: number;
  max?: number;
  unit?: string;
  changeRules: string;
}

export type StatTemplatePresetId = 'compact_rpg_bar' | 'markdown_table' | 'collapsible_block';

export interface StatBlockConfig {
  enableDMTracker: boolean;
  stats: StatItem[];
  formatTemplate: string;
  injectionPosition: 'system_prompt' | 'post_history_instructions' | 'author_note';
}

export interface CharacterCardAsset {
  type: 'icon' | 'background' | 'emotion' | 'user_icon';
  uri: string;
  name: string;
  ext: string;
}

/**
 * Unified SillyTavern Character Card V2 & V3 Data Structure
 */
export interface CharacterCardData {
  id?: string;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  character_book?: Lorebook;
  // V3 Extended Fields
  avatar?: string;
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings?: string[];
  creation_date?: number;
  modification_date?: number;
  assets?: CharacterCardAsset[];
  extensions: {
    talkativeness?: string;
    fav?: boolean;
    world?: string;
    depth_prompt?: {
      prompt: string;
      depth: number;
      role: 'system' | 'user' | 'assistant';
    };
    statBlock?: StatBlockConfig;
    [key: string]: unknown;
  };
}

export interface SillyTavernV2Wrapper {
  spec: 'chara_card_v2';
  spec_version: '2.0';
  data: CharacterCardData;
}

export interface SillyTavernV3Wrapper {
  spec: 'chara_card_v3';
  spec_version: '3.0';
  data: CharacterCardData;
}

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
  category: 'genre' | 'archetype' | 'tone' | 'mechanic' | 'world' | 'custom';
  aiContextDescription: string;
}

export interface ContextTheme {
  id: string;
  name: string;
  color: string;
  aiContextPrompt: string;
  associatedTags: string[];
  isBuiltIn?: boolean;
}

export type AIPresetId =
  | 'lmstudio'
  | 'ollama'
  | 'koboldcpp'
  | 'gemini'
  | 'xai_grok'
  | 'openrouter_llama'
  | 'groq_llama'
  | 'meta_direct'
  | 'openai_compatible';

export type ModelCompatibilityFormat =
  | 'auto'
  | 'llama_3_4'
  | 'deepseek_qwen_think'
  | 'gemini_thinking'
  | 'xai_grok_reasoning'
  | 'mistral'
  | 'claude_chatml'
  | 'kobold_raw';

export interface AIBackendConfig {
  preset: AIPresetId;
  url: string;
  apiKey: string;
  modelName: string;
  compatibilityFormat: ModelCompatibilityFormat;
  temperature: number;
  maxTokens: number;
  ghostTextEnabled: boolean;
  debounceMs: number;
  availableModels?: string[];
}

export type AppearanceMode = 'dark' | 'light';
export type EditorMode = 'sandbox' | 'wizard';
export type WorkspaceTab = 'character' | 'lorebook' | 'themes_tags' | 'json_inspector' | 'options';

export type RosterSortOption =
  | 'modified_desc'
  | 'name_asc'
  | 'name_desc'
  | 'tokens_desc'
  | 'tokens_asc';

export interface SavedFileEntry {
  id: string;
  folderPath: string;
  fileName: string;
  kind: 'character' | 'lorebook';
  sizeBytes: number;
  updatedAt: string;
  content: string;
}

export interface SaveLogEntry {
  id: string;
  timestamp: string;
  mode: 'manual' | 'autosave';
  folderPath: string;
  filesWritten: string[];
  nativeSynced: boolean;
}

export interface AppSettings {
  appearance: AppearanceMode;
  editorMode: EditorMode;
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
  activeThemeId: string;
  cardSpecVersion: 'v2' | 'v3';
  activeSaveFolder: string;
  availableSaveFolders: string[];
  mainSidebarOpen?: boolean;
}

export interface TokenBreakdown {
  name: number;
  description: number;
  personality: number;
  scenario: number;
  first_mes: number;
  mes_example: number;
  system_prompt: number;
  post_history_instructions: number;
  alternate_greetings: number;
  creator_notes: number;
  stat_block: number;
  lorebook_constant: number;
  lorebook_Triggered: number;
  permanentTokens: number;
  temporaryTokens: number;
  totalCardTokens: number;
}
