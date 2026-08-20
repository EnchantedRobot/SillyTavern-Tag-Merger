// index.js
// Character Tag Merger — entry point.
// Injects a launcher button into the Extensions settings panel that opens the
// tag-mapping editor. This is an occasional-use utility, so it deliberately
// does NOT add a top-bar icon.

import { openModal } from './ui-modal.js';
import { norm, standardizeTag, DEFAULT_MAX_TAG_LENGTH } from './tag-analysis.js';

const PANEL_ID = 'ctm-panel';
export const EXT_KEY = 'CharacterTagMerger';

/**
 * Return the extension's persisted settings, initialising defaults on first
 * access. The mapping ({ canonical: [variant…] }) is the source of truth.
 */
export function getExtSettings() {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    if (!extensionSettings[EXT_KEY]) {
        extensionSettings[EXT_KEY] = {};
        saveSettingsDebounced?.();
    }
    const s = extensionSettings[EXT_KEY];
    if (typeof s.mapping !== 'object' || s.mapping === null) s.mapping = {};
    if (!Array.isArray(s.removedTags)) s.removedTags = [];
    if (typeof s.autoDeleteEnabled !== 'boolean') s.autoDeleteEnabled = true;
    if (!Number.isFinite(s.autoDeleteMaxLength) || s.autoDeleteMaxLength < 1) s.autoDeleteMaxLength = DEFAULT_MAX_TAG_LENGTH;
    // Drop obsolete v1 keys if upgrading from the fuzzy-era extension.
    if ('fuzzyThreshold' in s || 'deletedTags' in s) {
        delete s.fuzzyThreshold;
        delete s.deletedTags;
        saveSettingsDebounced?.();
    }
    return s;
}

/** Persist the working dictionary (mapping + removed tags) back to settings. */
export function saveDictionary(mapping, removedTags) {
    const s = getExtSettings();
    s.mapping = mapping;
    s.removedTags = removedTags;
    SillyTavern.getContext().saveSettingsDebounced?.();
}

/** Persist the auto-delete-long-tags toggle and its length cutoff. */
export function saveAutoDeleteSettings(enabled, maxLength) {
    const s = getExtSettings();
    s.autoDeleteEnabled = !!enabled;
    if (Number.isFinite(maxLength) && maxLength >= 1) s.autoDeleteMaxLength = maxLength;
    SillyTavern.getContext().saveSettingsDebounced?.();
}

/**
 * Dictionary-only maintenance. Doesn't need any characters loaded and doesn't
 * open the mapping editor — it just tidies the persisted settings directly,
 * so it lives here next to the launcher rather than in the modal.
 *
 * 1. Merge canonicals that are case/whitespace duplicates of each other
 *    (norm(canonical) collisions, e.g. a stray "female" entry next to
 *    "Female"). Not just cosmetic clutter: the dictionary's match lookup is
 *    keyed by norm(canonical), so two canonicals sharing that key silently
 *    fight over which one receives future matches — most likely created by
 *    "New canonical from this tag" on two differently-cased chips at
 *    different times. This is almost certainly what you'd spot as
 *    near-duplicate capitalization sitting in settings.json.
 * 2. Clean the surviving canonicals' spelling via standardizeTag(). Safe to
 *    do *after* step 1 specifically because norm() lowercases: title-casing
 *    can't change a canonical's norm() key, so this can't create a new
 *    collision that step 1 didn't already catch.
 * 3. Drop any removedTags entry whose normalized length already exceeds
 *    DEFAULT_MAX_TAG_LENGTH. Those get swept into the Removed bucket
 *    automatically by the length check in buildBuckets/applyRowsToTags
 *    regardless of whether they're explicitly listed, so keeping them here
 *    too is redundant — this just prunes settings.json back down.
 *
 * Only ever touches the persisted dictionary — never opens a card file.
 */
/**
 * Dictionary-only maintenance. Doesn't need any characters loaded and doesn't
 * open the mapping editor — it just tidies the persisted settings directly.
 *
 * Canonicals (the object keys) are NEVER renamed or merged here — that's
 * yours to curate deliberately, and an automatic merge would mean silently
 * discarding one of two spellings you chose on purpose. If you spot
 * near-duplicate canonicals (e.g. "female" next to "Female"), this reports
 * them so you can merge by hand in the mapping editor — drag one canonical's
 * variants onto the other, then delete the now-empty leftover with the
 * row's ✕ — but it will never do that merge for you.
 *
 * What this DOES change:
 *   1. Cleans and dedupes each canonical's own variant list in place (trims
 *      spaces, strips emoji, fixes simple case via standardizeTag() — same
 *      as the checkbox in the mapping editor's Apply flow). This only
 *      touches the array *under* a canonical, never the canonical's name.
 *      Case-different variants that clean to the same spelling collapse
 *      into one entry, same as any other exact duplicate.
 *   2. Drops any removedTags entry whose normalized length already exceeds
 *      DEFAULT_MAX_TAG_LENGTH, since those get swept into Removed
 *      automatically regardless of whether they're listed explicitly.
 */
function cleanupDictionary() {
    const s = getExtSettings();
    let canonicalsTouched = 0;
    let variantsRemoved = 0; // collapsed into an existing entry after cleaning
    const dupeReport = [];

    // 1) Clean + dedupe each canonical's own variant list. Never touches the
    // canonical's name (the object key) or any other canonical's data.
    for (const canonical of Object.keys(s.mapping)) {
        const variants = s.mapping[canonical] ?? [];
        const seen = new Set();
        const cleaned = [];
        for (const v of variants) {
            const clean = standardizeTag(v);
            if (seen.has(clean)) continue; // same spelling after cleaning — drop the dupe
            seen.add(clean);
            cleaned.push(clean);
        }
        const changed = cleaned.length !== variants.length || cleaned.some((v, i) => v !== variants[i]);
        if (changed) {
            canonicalsTouched++;
            variantsRemoved += variants.length - cleaned.length;
            s.mapping[canonical] = cleaned;
        }
    }

    // Report-only: flag canonicals that normalize to the same key. Never
    // merged — see the note above.
    const byKey = new Map();
    for (const canonical of Object.keys(s.mapping)) {
        const key = norm(canonical);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(canonical);
    }
    for (const names of byKey.values()) {
        if (names.length > 1) dupeReport.push(names.map(n => `"${n}"`).join(' / '));
    }

    // 2) Prune removedTags entries already covered by the length auto-removal.
    const before = s.removedTags.length;
    s.removedTags = s.removedTags.filter(t => norm(t).length <= DEFAULT_MAX_TAG_LENGTH);
    const removedTagsPruned = before - s.removedTags.length;

    if (canonicalsTouched === 0 && removedTagsPruned === 0 && dupeReport.length === 0) {
        toastr.info('Nothing to clean up — dictionary is already tidy.', 'Tag Merger');
        return;
    }

    SillyTavern.getContext().saveSettingsDebounced?.();

    if (dupeReport.length > 0) console.log('[Tag Merger] possible duplicate canonicals (not merged — review and merge by hand):', dupeReport);

    const parts = [];
    if (canonicalsTouched > 0) {
        parts.push(`cleaned variant spelling on ${canonicalsTouched} canonical${canonicalsTouched === 1 ? '' : 's'}${variantsRemoved > 0 ? ` (${variantsRemoved} became duplicate${variantsRemoved === 1 ? '' : 's'} and were dropped)` : ''}`);
    }
    if (removedTagsPruned > 0) parts.push(`pruned ${removedTagsPruned} oversized removed-tag entr${removedTagsPruned === 1 ? 'y' : 'ies'} already covered by length removal`);
    let msg = parts.length > 0 ? `Dictionary Cleanup: ${parts.join(', ')}.` : 'Dictionary Cleanup: no changes to variants or removed tags.';
    if (dupeReport.length > 0) msg += ` Found ${dupeReport.length} possible duplicate canonical${dupeReport.length === 1 ? '' : 's'} — see console (not auto-merged).`;
    toastr.success(msg, 'Tag Merger');
}

const BASE_FILE = 'tag-dictionary.json';

/** Fetch the shipped base dictionary (used to seed empty settings). */
export async function loadBaseDictionary() {
    try {
        const res = await fetch(new URL(`./${BASE_FILE}`, import.meta.url));
        if (!res.ok) return null;
        const json = await res.json();
        const flat = {};
        const canonicalCategories = {};
        const categoryOrder = Object.keys(json?.mapping ?? {});
        for (const [cat, canonicals] of Object.entries(json?.mapping ?? {})) {
            for (const [canonical, aliases] of Object.entries(canonicals)) {
                flat[canonical] = Array.isArray(aliases) ? aliases : [];
                canonicalCategories[canonical] = cat;
            }
        }
        return {
            mapping: flat,
            removedTags: Array.isArray(json?.removedTags) ? json.removedTags : [],
            canonicalCategories,
            categoryOrder,
        };
    } catch (e) {
        console.error(`[Tag Merger] failed to load ${BASE_FILE}`, e);
        return null;
    }
}

/**
 * Return the user's dictionary, seeding it from the shipped base the first time
 * the extension is used. Always loads category metadata from the base file.
 */
async function ensureDictionary() {
    const s = getExtSettings();
    const base = await loadBaseDictionary();
    if (Object.keys(s.mapping).length === 0 && s.removedTags.length === 0) {
        if (base) {
            s.mapping = base.mapping;
            s.removedTags = base.removedTags;
            SillyTavern.getContext().saveSettingsDebounced?.();
        }
    }
    return {
        mapping: s.mapping,
        removedTags: s.removedTags,
        canonicalCategories: base?.canonicalCategories ?? {},
        categoryOrder: base?.categoryOrder ?? [],
        baseMapping: base?.mapping ?? {},
        baseRemovedTags: base?.removedTags ?? [],
        maxTagLength: s.autoDeleteEnabled ? s.autoDeleteMaxLength : 0,
    };
}

function buildPanel() {
    const s = getExtSettings();
    const div = document.createElement('div');
    div.id = PANEL_ID;
    div.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Character Tag Merger</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="ctm-panel-desc">Maintain a dictionary that maps messy tag variants (case, <code>#</code> prefixes, near-duplicates) onto clean canonical tags, then apply it to every character.</p>
                <div id="ctm-open" class="menu_button" style="width:100%; text-align:center;">
                    <i class="fa-solid fa-tags"></i>&nbsp;&nbsp;Edit Tag Mapping
                </div>
                <p class="ctm-panel-desc" style="margin-top:4px;">Flagged tags land in the Removed bucket of the mapping editor — nothing is deleted from a card until you hit Apply there.</p>
                <label class="ctm-autodelete-toggle" style="display:flex;align-items:center;gap:6px;margin:10px 0 0 0;font-size:0.9em;"
                       title="Some card authors dump a full sentence into the tag list instead of a keyword. When this is on, any tag longer than the limit below is flagged for removal automatically — no need to name the offender yourself.">
                    <input type="checkbox" id="ctm-autodelete-enabled"${s.autoDeleteEnabled ? ' checked' : ''}>
                    Auto-flag tags longer than
                    <input type="number" id="ctm-autodelete-maxlength" class="text_pole" min="1" step="1" style="width:4em;" value="${s.autoDeleteMaxLength}">
                    characters
                </label>
                <div id="ctm-cleanup" class="menu_button" style="width:100%; text-align:center; margin-top:4px;"
                     title="Cleans and dedupes each canonical's variant list, and prunes Removed entries already covered by the length cutoff. Never renames or merges canonicals, and never touches any card.">
                    <i class="fa-solid fa-broom"></i>&nbsp;&nbsp;Dictionary Cleanup
                </div>
            </div>
        </div>
    `;
    return div;
}

async function openTagMerger() {
    try {
        const ctx = SillyTavern.getContext();
        const characters = ctx.characters || [];
        if (characters.length === 0) {
            toastr.info('No characters loaded.', 'Tag Merger');
            return;
        }
        const { mapping, removedTags, canonicalCategories, categoryOrder, baseMapping, baseRemovedTags, maxTagLength } = await ensureDictionary();
        openModal(characters, mapping, removedTags, canonicalCategories, categoryOrder, baseMapping, baseRemovedTags, maxTagLength);
    } catch (e) {
        console.error('[Tag Merger]', e);
        toastr.error('Failed to open Tag Merger. See console.', 'Tag Merger');
    }
}

function injectPanel() {
    if (document.getElementById(PANEL_ID)) return true;
    const container = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!container) return false;
    const panel = buildPanel();
    container.appendChild(panel);
    panel.querySelector('#ctm-open').addEventListener('click', openTagMerger);
    const enabledEl = panel.querySelector('#ctm-autodelete-enabled');
    const maxLengthEl = panel.querySelector('#ctm-autodelete-maxlength');
    enabledEl.addEventListener('change', () => saveAutoDeleteSettings(enabledEl.checked, Number(maxLengthEl.value)));
    maxLengthEl.addEventListener('change', () => {
        const n = Math.max(1, Math.round(Number(maxLengthEl.value)) || DEFAULT_MAX_TAG_LENGTH);
        maxLengthEl.value = n;
        saveAutoDeleteSettings(enabledEl.checked, n);
    });
    panel.querySelector('#ctm-cleanup').addEventListener('click', cleanupDictionary);
    return true;
}

if (!injectPanel()) {
    const observer = new MutationObserver(() => {
        if (injectPanel()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
