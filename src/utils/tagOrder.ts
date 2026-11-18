import { TagCategory, TagDefinition } from '../types';

export const CANONICAL_TAG_CATEGORY_ORDER: TagCategory[] = [
  'Setting & Vibe',
  'Rating',
  'Narrative & Meta',
  'Archetype',
  'Body',
  'Genitals',
  'Attire',
  'NSFW & Kinks',
  'Extreme & Hentai Physics',
  'Custom',
];

const ATTIRE_NAME_REGEX =
  /\b(glasses|megane|stockings?|thighhighs?|garter|lingerie|babydoll|latex|bodysuit|collar|leash|underwear|pantie|panties|bra|boxers?|briefs?|bikini|swimwear|swimsuit|sukumizu|slingkini|sweater|hoodie|crop\s*top|shorts|sundress|dress|skirt|suit|tie|formal\s*wear|attire|kimono|yukata|bunny\s*suit|leotard|fishnets?|mesh|choker|accessories|heels?|boots?|barefoot|uniform|outfit|costume|apron|corset|harness|g-string|thong|c-string|pasties|tassels?|pantyhose|tights|robe|cloak|armor|gauntlets?|gloves|blindfold|bodystocking|see-through|sheer|open-cup|crotchless|backless|plugsuit|habit|vestments?|veil)\b/i;

const ATTIRE_DESC_PREFIX_REGEX =
  /^(dressed in|lounging in|wears a|wears\b|wearing|form-fitting|strapless|high-cut|open-weave|translucent mesh|razor-thin|scandalous lace)/i;

/**
 * Migrates legacy `'Body & Attire'` tags (both built-in and previously saved custom tags)
 * cleanly into `'Body'` or `'Attire'`.
 */
export function migrateLegacyTagCategory(
  rawCategory?: string,
  tagName?: string,
  tagDesc?: string
): TagCategory {
  const cleanCat = (rawCategory || '').trim();
  if (!cleanCat) return 'Custom';

  const lower = cleanCat.toLowerCase();
  if (lower === 'body & attire' || lower === 'appearance') {
    const cleanName = (tagName || '').trim();
    const cleanDesc = (tagDesc || '').trim();
    if (
      ATTIRE_NAME_REGEX.test(cleanName) ||
      ATTIRE_DESC_PREFIX_REGEX.test(cleanDesc)
    ) {
      return 'Attire';
    }
    return 'Body';
  }

  return cleanCat as TagCategory;
}

/**
 * Maps a category name (including legacy aliases) to its canonical context priority tier:
 * Setting/Vibe -> Rating -> Narrative -> Archetype -> Body -> Genitals -> Attire -> Kinks/Extreme -> Custom
 */
export function getTagCategoryPriority(
  rawCategory?: string,
  tagName?: string,
  tagDesc?: string
): number {
  const migrated = migrateLegacyTagCategory(rawCategory, tagName, tagDesc);
  const lower = migrated.trim().toLowerCase();

  switch (lower) {
    case 'setting & vibe':
    case 'genre & setting':
    case 'setting':
    case 'genre':
    case 'world_lore':
      return 0;

    case 'rating':
    case 'nsfw_rating':
      return 1;

    case 'narrative & meta':
    case 'tone & style':
    case 'roleplay mechanics':
    case 'tone':
      return 2;

    case 'archetype':
    case 'personality & archetype':
    case 'relationship & role':
    case 'personality':
      return 3;

    case 'body':
      return 4;

    case 'genitals':
      return 5;

    case 'attire':
      return 6;

    case 'nsfw & kinks':
      return 7;

    case 'extreme & hentai physics':
      return 8;

    case 'custom':
    default:
      return 9;
  }
}

/**
 * Sorts an array of tag names in canonical macro-to-detail semantic context order:
 * Setting & Vibe -> Rating -> Narrative & Meta -> Archetype -> Body -> Genitals -> Attire -> NSFW & Kinks -> Extreme & Hentai Physics -> Custom.
 *
 * Also performs case-insensitive deduplication while preserving canonical tag casing.
 */
export function sortTagsByContextOrder(
  tagNames?: readonly string[] | null,
  tagCatalog: readonly TagDefinition[] = []
): string[] {
  if (!Array.isArray(tagNames) || tagNames.length === 0) {
    return [];
  }

  const catalogByNameLower = new Map<
    string,
    { tag: TagDefinition; index: number }
  >();
  tagCatalog.forEach((tag, index) => {
    if (!tag || typeof tag.name !== 'string') return;
    const key = tag.name.trim().toLowerCase();
    if (key && !catalogByNameLower.has(key)) {
      catalogByNameLower.set(key, { tag, index });
    }
  });

  const seenLower = new Set<string>();
  const entries: Array<{
    displayName: string;
    tier: number;
    catalogIndex: number;
  }> = [];

  for (const raw of tagNames) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;

    const lower = trimmed.toLowerCase();
    if (seenLower.has(lower)) continue;
    seenLower.add(lower);

    const baseLower = lower.includes(':')
      ? lower.split(':')[0].trim()
      : lower;
    const match =
      catalogByNameLower.get(lower) || catalogByNameLower.get(baseLower);

    if (match) {
      const desc =
        match.tag.aiContextDescription ||
        match.tag.aiDescription ||
        match.tag.description ||
        '';
      entries.push({
        displayName: lower.includes(':') ? trimmed : match.tag.name.trim(),
        tier: getTagCategoryPriority(match.tag.category, match.tag.name, desc),
        catalogIndex: match.index,
      });
    } else {
      entries.push({
        displayName: trimmed,
        tier: getTagCategoryPriority('Custom', trimmed, ''),
        catalogIndex: Number.MAX_SAFE_INTEGER,
      });
    }
  }

  entries.sort((a, b) => {
    if (a.tier !== b.tier) {
      return a.tier - b.tier;
    }
    if (a.catalogIndex !== b.catalogIndex) {
      return a.catalogIndex - b.catalogIndex;
    }
    return a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase());
  });

  return entries.map((e) => e.displayName);
}
