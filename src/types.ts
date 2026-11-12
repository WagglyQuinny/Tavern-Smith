export type WorkspaceTab =
  | 'character'
  | 'lorebook'
  | 'themes'
  | 'themes_tags'
  | 'inspector'
  | 'json_inspector'
  | 'options';

export type RosterSortOption =
  | 'modified_desc'
  | 'name_asc'
  | 'name_desc'
  | 'tokens_desc'
  | 'tokens_asc';

export type TagCategory =
  | 'Rating'
  | 'Genre & Setting'
  | 'Personality & Archetype'
  | 'Relationship & Role'
  | 'Tone & Style'
  | 'NSFW & Kinks'
  | 'Extreme & Hentai Physics'
  | 'Genre'
  | 'Personality'
  | 'Tone'
  | 'Appearance'
  | 'Roleplay Mechanics'
  | 'Setting'
  | 'Custom'
  | 'genre'
  | 'personality'
  | 'tone'
  | 'nsfw_rating'
  | 'world_lore'
  | 'custom'
  | string;

export interface TagDefinition {
  id: string;
  name: string;
  color: string;
  category: TagCategory;
  isNsfw?: boolean;
  aiContextDescription: string;
  aiDescription?: string;
  description?: string;
}

export interface ContextTheme {
  id: string;
  name: string;
  color: string;
  aiContextPrompt: string;
  associatedTags: string[];
  isBuiltIn?: boolean;
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

export type StatTemplatePresetId =
  | 'collapsible_block'
  | 'compact_rpg_bar'
  | 'markdown_table';

export interface StatBlockConfig {
  enableDMTracker: boolean;
  injectionPosition: 'post_history_instructions' | 'system_prompt' | 'depth_0';
  stats: StatItem[];
  formatTemplate: string;
}

export type LorebookPosition =
  | 'before_char'
  | 'after_char'
  | 'an_top'
  | 'an_bottom'
  | 'at_depth';

export interface LorebookEntry {
  id: string | number;
  comment: string;
  keys: string[];
  secondary_keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  constant: boolean;
  selective: boolean;
  position: LorebookPosition;
  priority: number;
  depth: number;
  probability: number;
  tags?: string[];
}

export interface Lorebook {
  id?: string;
  name: string;
  description: string;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  tags?: string[];
  modification_date?: number;
  entries: LorebookEntry[];
  isNsfw?: boolean;
}

export interface CharacterCardData {
  id?: string;
  name: string;
  nickname?: string;
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
  avatar?: string;
  creation_date?: number;
  modification_date?: number;
  isNsfw?: boolean;
  extensions: {
    talkativeness?: string;
    fav?: boolean;
    world?: string;
    statBlock?: StatBlockConfig;
    isNsfw?: boolean;
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

export type AIPresetId =
  | 'lmstudio'
  | 'ollama'
  | 'koboldcpp'
  | 'gemini'
  | 'xai_grok'
  | 'openrouter_llama'
  | 'groq_llama'
  | 'meta_direct'
  | 'openai_compatible'
  | 'anthropic'
  | 'custom';

export type ProviderKeyId =
  | 'google'
  | 'xai'
  | 'openrouter'
  | 'groq'
  | 'meta'
  | 'openai'
  | 'anthropic'
  | 'lmstudio'
  | 'ollama'
  | 'kobold'
  | 'custom';

export type ModelCompatibilityFormat =
  | 'auto'
  | 'gemma'
  | 'deepseek_qwen_think'
  | 'llama_3_4'
  | 'mistral'
  | 'xai_grok_reasoning'
  | 'gemini_thinking'
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
  availableModels: string[];
  savedProviderKeys?: Record<string, string>;
  savedProviderModels?: Record<string, string>;
}

export interface AppSettings {
  appearance: 'dark' | 'light';
  editorMode: 'sandbox' | 'wizard';
  autoSaveEnabled: boolean;
  autoSaveIntervalSec: number;
  activeThemeId: string;
  cardSpecVersion: 'v2' | 'v3';
  activeSaveFolder: string;
  availableSaveFolders: string[];
  mainSidebarOpen?: boolean;
  hideNsfwTags?: boolean;
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

export interface SavedFileEntry {
  id: string;
  folderPath: string;
  fileName: string;
  kind: 'character' | 'lorebook' | 'meta';
  sizeBytes: number;
  updatedAt: string;
  content: string;
}

export interface SaveLogEntry {
  id: string;
  timestamp: string;
  mode: 'manual' | 'autosave' | 'sync';
  folderPath: string;
  filesWritten: string[];
  nativeSynced: boolean;
}

export interface TavernSmithMetaPayload {
  schema: 'tavernsmith_meta_v1';
  updatedAt: string;
  activeThemeId: string;
  contextThemes: ContextTheme[];
  tags: TagDefinition[];
}

export interface NameConflictRequest {
  kind: 'character' | 'lorebook';
  itemId: string;
  conflictingName: string;
  suggestedNames: string[];
  sourceAction: 'create' | 'rename' | 'save' | 'import';
}
