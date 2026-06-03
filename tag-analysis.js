// tag-analysis.js
// Pure tag-analysis logic — no DOM, no SillyTavern globals.
// Safe to import in a browser or run under Node for offline testing.

// Minimum normalized-key length before fuzzy matching is allowed. Short tags
// like "elf"/"elk" are too easy to merge wrongly, so we never fuzzy-merge them.
const FUZZY_MIN_LEN = 4;
// Default similarity threshold (0..1) for the fuzzy pass. Configurable from the
// extensions panel; stored in localStorage as 'ctm-fuzzy-threshold'.
// 0.80 is a reasonable aggressive default — users can dismiss bad groups easily.
export const FUZZY_THRESHOLD_DEFAULT = 0.80;

/**
 * Collapse case / punctuation / whitespace so trivially-different tags share a key.
 * "#Female", "female", "fe-male", "FE MALE" -> "female".
 * @param {string} tag
 * @returns {string}
 */
export function normalizeKey(tag) {
    return String(tag)
        .toLowerCase()
        .replace(/^#+/, '')
        .replace(/[\s\-_]+/g, '')
        .trim();
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
export function scanTags(characters) {
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
 * Group exact-normalized variants together.
 * @param {Map<string, {count:number, avatars:Set<string>}>} tagStats
 * @returns {Array<{key:string, variants:Array<{tag:string,count:number,avatars:Set<string>}>}>}
 */
export function groupExact(tagStats) {
    const groups = new Map();
    for (const [tag, entry] of tagStats) {
        const key = normalizeKey(tag);
        if (!key) continue;
        let group = groups.get(key);
        if (!group) {
            group = { key, variants: [] };
            groups.set(key, group);
        }
        group.variants.push({ tag, count: entry.count, avatars: entry.avatars });
    }
    return [...groups.values()];
}

/** Levenshtein edit distance between two strings. */
function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 0; i < a.length; i++) {
        const curr = [i + 1];
        for (let j = 0; j < b.length; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            curr[j + 1] = Math.min(prev[j + 1] + 1, curr[j] + 1, prev[j] + cost);
        }
        prev = curr;
    }
    return prev[b.length];
}

/** Similarity ratio in [0,1] derived from edit distance. */
function similarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1;
    return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Second pass: merge exact groups whose normalized keys are very similar.
 * Conservative — guarded by FUZZY_MIN_LEN and FUZZY_THRESHOLD. Merged-via-fuzzy
 * groups are flagged so the UI can default them to opt-in.
 * @param {Array<{key:string, variants:Array}>} exactGroups
 * @param {number} [threshold]  similarity cutoff; defaults to FUZZY_THRESHOLD_DEFAULT
 * @returns {Array<{keys:string[], variants:Array, fuzzy:boolean}>}
 */
export function fuzzyMergeGroups(exactGroups, threshold = FUZZY_THRESHOLD_DEFAULT) {
    // Sort by total usage desc so larger groups act as the "anchor" key.
    const sorted = [...exactGroups].sort((a, b) =>
        b.variants.reduce((s, v) => s + v.count, 0) - a.variants.reduce((s, v) => s + v.count, 0));

    const merged = []; // { keys, variants, fuzzy }
    for (const group of sorted) {
        let target = null;
        if (group.key.length >= FUZZY_MIN_LEN) {
            for (const m of merged) {
                const matches = m.keys.some(k =>
                    k.length >= FUZZY_MIN_LEN && similarity(k, group.key) >= threshold);
                if (matches) { target = m; break; }
            }
        }
        if (target) {
            target.keys.push(group.key);
            target.variants.push(...group.variants);
            target.fuzzy = true;
        } else {
            merged.push({ keys: [group.key], variants: [...group.variants], fuzzy: false });
        }
    }
    return merged;
}

/**
 * Pick the canonical display tag for a group of variants.
 *
 * Priority:
 *   1. Variants that start directly with a capital letter (no # prefix) — most
 *      frequent wins, returned verbatim. Covers "Arranged Marriage", "AnyPOV", etc.
 *   2. Variants that start with # followed by a capital letter — most frequent
 *      wins, the leading # is stripped, rest returned verbatim.
 *   3. Fallback: no clean-capital variant exists — pick most frequent overall,
 *      strip any #, collapse separators, Title Case.
 *
 * @param {Array<{tag:string,count:number}>} variants
 * @returns {string}
 */
export function pickCanonical(variants) {
    const byFreq = (a, b) => b.count - a.count || a.tag.localeCompare(b.tag);

    // 1. Starts with a capital letter (no # prefix).
    const cleanCaps = variants.filter(v => /^[A-Z]/.test(v.tag));
    if (cleanCaps.length > 0) {
        return [...cleanCaps].sort(byFreq)[0].tag;
    }

    // 2. Starts with # then a capital letter.
    const hashCaps = variants.filter(v => /^#+[A-Z]/.test(v.tag));
    if (hashCaps.length > 0) {
        return [...hashCaps].sort(byFreq)[0].tag.replace(/^#+/, '');
    }

    // 3. Nothing clean — synthesise from the most-frequent variant.
    const top = [...variants].sort(byFreq)[0];
    const stripped = top.tag.replace(/^#+/, '');
    const isAllLower = stripped === stripped.toLowerCase();
    const isAllUpper = stripped === stripped.toUpperCase();
    // Mixed-case without a hash is already intentional styling — keep it.
    if (!isAllLower && !isAllUpper) return stripped;

    return stripped
        .replace(/[_\-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w)
        .join(' ');
}

/**
 * Full analysis: characters -> review rows.
 * A row is emitted whenever applying it would change at least one tag string
 * (a multi-variant merge, or a single messy tag that needs cleaning/renaming).
 * Variants retain their `avatars` (card list) so the UI can recompute card
 * counts after the user moves variants between groups.
 * @param {object[]} characters
 * @param {number} [fuzzyThreshold]  passed through to fuzzyMergeGroups
 * @returns {Array<{canonical:string, variants:Array<{tag:string,count:number,avatars:string[]}>, cardCount:number, fuzzy:boolean}>}
 */
export function analyze(characters, fuzzyThreshold) {
    const stats = scanTags(characters);
    const exact = groupExact(stats);
    const groups = fuzzyMergeGroups(exact, fuzzyThreshold);

    const rows = [];
    for (const group of groups) {
        const canonical = pickCanonical(group.variants);
        // Union of affected cards across all variants in the group.
        const affected = new Set();
        for (const v of group.variants) for (const a of v.avatars) affected.add(a);

        // Skip multi-variant groups where nothing actually changes (degenerate — can't
        // occur since variant tag strings are unique, but kept for safety).
        // Single-variant rows always pass through so they appear in the Excluded bin
        // and can be queued for deletion even when no rename is needed (e.g. "SFW").
        const changes = group.variants.some(v => v.tag !== canonical);
        if (!changes && group.variants.length > 1) continue;

        rows.push({
            canonical,
            variants: group.variants
                .map(v => ({ tag: v.tag, count: v.count, avatars: [...v.avatars] }))
                .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
            cardCount: affected.size,
            fuzzy: group.fuzzy,
        });
    }
    // Biggest impact first.
    rows.sort((a, b) => b.cardCount - a.cardCount || a.canonical.localeCompare(b.canonical));
    return rows;
}

/**
 * Apply approved rows to one card's tag list.
 * Removes any matched variant (case-insensitive) and adds the canonical,
 * preserving unrelated tags and their order; dedupes case-insensitively.
 * @param {string[]} currentTags
 * @param {Array<{canonical:string, variants:Array<{tag:string}>}>} approvedRows
 * @returns {string[]|null} new tag array, or null if nothing changed
 */
export function applyRowsToTags(currentTags, approvedRows) {
    // Map lowercased variant -> canonical for every approved row.
    const variantToCanonical = new Map();
    for (const row of approvedRows) {
        for (const v of row.variants) variantToCanonical.set(v.tag.toLowerCase(), row.canonical);
    }

    const result = [];
    const seenLower = new Set();
    let changed = false;

    const push = (tag) => {
        const lower = tag.toLowerCase();
        if (seenLower.has(lower)) { changed = true; return; } // dropped a dupe
        seenLower.add(lower);
        result.push(tag);
    };

    for (const tag of currentTags) {
        const canonical = variantToCanonical.get(tag.toLowerCase());
        if (canonical === undefined) {
            push(tag);
        } else {
            if (canonical !== tag) changed = true;
            push(canonical);
        }
    }
    return changed ? result : null;
}
