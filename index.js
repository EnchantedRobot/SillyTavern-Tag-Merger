// index.js
// Character Tag Merger — entry point.
// Injects a launcher button into the Extensions settings panel that opens the
// tag-mapping editor. This is an occasional-use utility, so it deliberately
// does NOT add a top-bar icon.

import { openModal } from './ui-modal.js';
import { DEFAULT_MAX_TAG_LENGTH } from './tag-analysis.js';

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
    return true;
}

if (!injectPanel()) {
    const observer = new MutationObserver(() => {
        if (injectPanel()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
