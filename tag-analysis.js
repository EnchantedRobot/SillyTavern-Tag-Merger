// tag-analysis.js
// Pure tag logic — no DOM, no SillyTavern globals. Safe to import in a browser
// or run under Node.
//
// The live extension is mapping-driven: a persistent `{ canonical: [variant…] }`
// dictionary is the source of truth. This module turns the cards + that mapping
// into display buckets and applies the mapping to a card's tag list. The base
// dictionary lives in tag-dictionary.json (category → canonical → aliases)
// and is flattened to { canonical: [alias…] } on load.

/**
 * Default cutoff (in normalized characters) above which a tag is considered
 * "too long" by buildBuckets/applyRowsToTags when no explicit maxTagLength is
 * passed in. Some card authors dump a full sentence into the tag list instead
 * of a keyword — this catches that without anyone having to name the offender.
 */
export const DEFAULT_MAX_TAG_LENGTH = 40;

/**
 * Normalize a tag to its match key: trim, strip leading '#', trim again,
 * collapse internal whitespace, lowercase. Applied to both the dictionary aliases
 * on load and to card tags at match time (so "#Female", "  female ", "FEMALE"
 * all resolve to the same entry).
 * @param {string} t
 * @returns {string}
 */
export function norm(t) {
    return String(t)
        .trim()
        .replace(/^#+/, '')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
}

/**
 * Read the embedded card tags off a SillyTavern character object.
 * Prefers data.tags (the real V2/V3 field) and falls back to the root mirror.
 * @param {object} char
 * @returns {string[]}
 */
export function getCardTags(char) {
    const tags = char?.data?.tags ?? char?.tags ?? [];
    return Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim() !== '') : [];
}

/**
 * Scan all characters and tally tag usage.
 * Tags are deduplicated per-card (case-insensitively) so a card that lists
 * "Female" twice only counts once.
 * @param {object[]} characters
 * @returns {Map<string, {count: number, avatars: Set<string>}>} keyed by the exact tag string
 */
function scanTags(characters) {
    const stats = new Map();
    for (const char of characters ?? []) {
        const avatar = char?.avatar ?? '';
        const seen = new Set(); // lowercase tags already counted for this card
        for (const tag of getCardTags(char)) {
            const lower = tag.toLowerCase();
            if (seen.has(lower)) continue;
            seen.add(lower);
            let entry = stats.get(tag);
            if (!entry) {
                entry = { count: 0, avatars: new Set() };
                stats.set(tag, entry);
            }
            entry.count++;
            if (avatar) entry.avatars.add(avatar);
        }
    }
    return stats;
}

/**
 * Pick a clean display tag for a freshly-created group (e.g. "New group from
 * this tag"). Not used for the persisted mapping's existing keys.
 *
 * Priority:
 *   1. A variant that starts with a capital letter (no #) — most frequent wins,
 *      returned verbatim ("Arranged Marriage", "AnyPOV").
 *   2. A variant that starts with # then a capital — leading # stripped.
 *   3. Otherwise synthesise from the most-frequent variant: strip #, collapse
 *      separators, Title Case (unless it's already intentional mixed-case).
 * @param {Array<{tag:string,count:number}>} variants
 * @returns {string}
 */
export function pickCanonical(variants) {
    const byFreq = (a, b) => b.count - a.count || a.tag.localeCompare(b.tag);

    const cleanCaps = variants.filter(v => /^[A-Z]/.test(v.tag));
    if (cleanCaps.length > 0) return [...cleanCaps].sort(byFreq)[0].tag;

    const hashCaps = variants.filter(v => /^#+[A-Z]/.test(v.tag));
    if (hashCaps.length > 0) return [...hashCaps].sort(byFreq)[0].tag.replace(/^#+/, '');

    const top = [...variants].sort(byFreq)[0];
    const stripped = top.tag.replace(/^#+/, '');
    const isAllLower = stripped === stripped.toLowerCase();
    const isAllUpper = stripped === stripped.toUpperCase();
    if (!isAllLower && !isAllUpper) return stripped;

    return stripped
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
        .join(' ');
}

// Common emoji blocks (emoticons, symbols/pictographs, transport, supplemental
// symbols, dingbats, misc technical, regional-indicator flag letters) plus the
// variation-selector, ZWJ, and keycap combiners used in emoji sequences. This
// is not a complete Unicode emoji database — some rare pictographs may slip
// through — but it covers what people actually paste into tag fields.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B00}-\u{2BFF}\u{2300}-\u{23FF}\uFE0F\u200D\u20E3]/gu;

/**
 * Clean up a single tag for display: trim both ends, strip emoji, collapse
 * whitespace left behind, and title-case each word — "one two" -> "One Two",
 * "one-two" -> "One-Two", "one" -> "One" (letter runs are capitalized in
 * place, so any separator — space, hyphen, underscore — is preserved as-is).
 *
 * Title-casing only applies when the tag is entirely lowercase. Anything with
 * an uppercase letter already — all-caps (NSFW) or intentional mixed case
 * (AnyPOV, SciFi) — is left untouched. Accidental capitalization is rare
 * compared to plain-lowercase tags needing it, so this only fixes the common
 * direction rather than guessing at both.
 *
 * This is a pure per-tag transform with no cross-tag lookups. Recognizing
 * that "Female"/"female"/"#FEMALE" are the same tag is a separate, already-
 * solved problem — norm() below does that; this function only decides what
 * a single tag should look like once picked.
 * @param {string} tag
 * @returns {string}
 */
export function standardizeTag(tag) {
    let s = String(tag)
        .replace(EMOJI_RE, '')
        .trim()
        .replace(/\s+/g, ' ');

    const isAllLower = s === s.toLowerCase();
    if (isAllLower) {
        s = s.replace(/[A-Za-z][A-Za-z']*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
    }
    return s;
}

/**
 * Turn the cards + the persistent mapping into display buckets.
 *
 * Every canonical in the mapping becomes a group, even if none of its variants
 * appear on any card (the dictionary is shown in full). Declared variants that
 * aren't observed appear with count 0. Every observed tag that matches a
 * declared variant or canonical (case-insensitively) joins that group; every
 * other observed tag falls into `unassigned`.
 *
 * Tags listed in `removedTags` (junk to be deleted) form a third bucket and are
 * excluded from `unassigned`. A tag claimed by both a canonical and the removed
 * list stays with its canonical (mapping is the more specific intent).
 *
 * Tags whose normalized length exceeds `maxTagLength` (default
 * DEFAULT_MAX_TAG_LENGTH) are auto-flagged as junk and folded into the same
 * `removed` bucket as `removedTags` — for cards where an author dumped a
 * whole sentence into the tag field instead of a keyword. This is a blanket
 * length check, not a name list: nothing needs to be enumerated up front.
 * Precedence is the same "explicit beats automatic" rule used elsewhere here
 * — a tag that's already mapped to a canonical stays with its group even if
 * it's long; only otherwise-unclaimed long tags get swept into `removed`.
 * Pass `maxTagLength: 0` (or any falsy value) to disable the check entirely.
 *
 * @param {object[]} characters
 * @param {Object<string,string[]>} mapping  canonical -> variant strings
 * @param {string[]} [removedTags]  tag strings flagged as junk
 * @param {{maxTagLength?: number}} [options]  maxTagLength defaults to DEFAULT_MAX_TAG_LENGTH
 * @returns {{groups: Array<{canonical:string, variants:Array<{tag:string,count:number,avatars:string[]}>}>, unassigned: Array<{tag:string,count:number,avatars:string[]}>, removed: Array<{tag:string,count:number,avatars:string[]}>}}
 */
export function buildBuckets(characters, mapping, removedTags, options) {
    const map = mapping || {};
    const stats = scanTags(characters);
    const maxTagLength = options?.maxTagLength === undefined ? DEFAULT_MAX_TAG_LENGTH : options.maxTagLength;

    // Normalized variant/canonical -> canonical key.
    const lookup = new Map();
    for (const [canonical, variants] of Object.entries(map)) {
        lookup.set(norm(canonical), canonical);
        for (const v of variants ?? []) lookup.set(norm(v), canonical);
    }

    // Removed bucket, keyed by exact string. Seed declared junk at count 0 so the
    // full removal list shows even when none of it appears on a card.
    const removedMap = new Map();
    const removedLookup = new Set();
    for (const t of removedTags ?? []) {
        removedLookup.add(norm(t));
        if (!removedMap.has(String(t))) removedMap.set(String(t), { tag: String(t), count: 0, avatars: [] });
    }

    // canonical -> Map(exact tag string -> variant). Seed with declared variants
    // (count 0) so the full dictionary round-trips even when nothing on a card
    // uses it. Keying by the exact string keeps distinct case variants ("female"
    // and "Female") as separate chips instead of clobbering each other's counts.
    const groupMap = new Map();
    const ensure = (c) => { let g = groupMap.get(c); if (!g) { g = new Map(); groupMap.set(c, g); } return g; };
    for (const [canonical, variants] of Object.entries(map)) {
        const g = ensure(canonical);
        for (const v of variants ?? []) {
            if (!g.has(String(v))) g.set(String(v), { tag: String(v), count: 0, avatars: [] });
        }
    }

    // Auto-flagged-by-length tags, keyed by exact string. Folded into `removed`
    // below. Nothing is seeded here (unlike removedTags) since there's no
    // declared list — it's derived purely from length at scan time.
    const tooLongMap = new Map();

    const unassigned = [];
    for (const [tag, entry] of stats) {
        const variant = { tag, count: entry.count, avatars: [...entry.avatars] };
        const canonical = lookup.get(norm(tag));
        if (canonical) {
            ensure(canonical).set(tag, variant); // observed string wins over the count-0 seed
        } else if (removedLookup.has(norm(tag))) {
            removedMap.set(tag, variant); // observed string wins over the count-0 seed
        } else if (maxTagLength && norm(tag).length > maxTagLength) {
            tooLongMap.set(tag, variant);
        } else {
            unassigned.push(variant);
        }
    }

    const byCount = (a, b) => b.count - a.count || a.tag.localeCompare(b.tag);
    const groups = [...groupMap.entries()].map(([canonical, vmap]) => ({
        canonical,
        variants: [...vmap.values()].sort(byCount),
    }));
    return {
        groups,
        unassigned: unassigned.sort(byCount),
        // Explicit junk (removedTags) and auto-flagged over-length tags share
        // one bucket — the UI only has a single "to be removed" section, so
        // there's no separate tooLong list to render.
        removed: [...removedMap.values(), ...tooLongMap.values()].sort(byCount),
    };
}

/**
 * Apply approved rows to one card's tag list.
 * Renames any matched variant to its canonical, deletes any tag in `removedSet`
 * (case-insensitive), preserves unrelated tags and their order, and dedupes
 * case-insensitively.
 *
 * If `maxTagLength` is set (0/undefined disables it), any tag whose normalized
 * length exceeds it is dropped too — unless it's also the target of an approved
 * row, in which case the explicit rename wins and it's kept. This mirrors the
 * `tooLong` bucket in buildBuckets but is opt-in here, since applying is
 * destructive: pass it only once you're satisfied with what a preview showed.
 *
 * If `standardize` is truthy, any tag that survives the above unchanged —
 * i.e. not removed, not mapped to a canonical, not dropped for length — gets
 * run through standardizeTag() directly. No dictionary entry is created or
 * needed: standardizeTag() is deterministic, so two differently-cased raw
 * tags on different cards (e.g. "female" and "FEMALE") independently collapse
 * to the same clean spelling ("Female") without ever being grouped together.
 *
 * @param {string[]} currentTags
 * @param {Array<{canonical:string, variants:Array<{tag:string}>}>} approvedRows
 * @param {Set<string>} [removedSet]  normalized tags to delete entirely
 * @param {number} [maxTagLength]  normalized tags longer than this are dropped
 * @param {boolean} [standardize]  clean spelling of any tag left untouched by the above
 * @returns {string[]|null} new tag array, or null if nothing changed
 */
export function applyRowsToTags(currentTags, approvedRows, removedSet, maxTagLength, standardize) {
    // Map normalized variant -> canonical for every approved row.
    const variantToCanonical = new Map();
    for (const row of approvedRows) {
        for (const v of row.variants) variantToCanonical.set(norm(v.tag), row.canonical);
    }
    const removed = removedSet ?? new Set();

    const result = [];
    const seen = new Set();
    let changed = false;

    const push = (tag) => {
        const key = norm(tag);
        if (seen.has(key)) { changed = true; return; } // dropped a dupe
        seen.add(key);
        result.push(tag);
    };

    for (const tag of currentTags) {
        if (removed.has(norm(tag))) { changed = true; continue; } // junk — drop it

        const canonical = variantToCanonical.get(norm(tag));
        if (canonical !== undefined) {
            if (canonical !== tag) changed = true;
            push(canonical);
            continue;
        }

        if (maxTagLength && norm(tag).length > maxTagLength) {
            changed = true; continue; // too long and not rescued by an approved rename — drop it
        }

        if (standardize) {
            const clean = standardizeTag(tag);
            if (clean !== tag) { changed = true; push(clean); continue; }
        }

        push(tag);
    }
    return changed ? result : null;
}
