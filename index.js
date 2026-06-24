// index.js
// Character Tag Merger — entry point.
// Injects a launcher button into the Extensions settings panel that opens the
// tag-mapping editor. This is an occasional-use utility, so it deliberately
// does NOT add a top-bar icon.

import { openModal } from './ui-modal.js';

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

const BASE_FILE = 'base-mapping-v2.json';

/** Fetch the shipped base dictionary (used to seed empty settings). */
export async function loadBaseDictionary() {
    try {
        const res = await fetch(new URL(`./${BASE_FILE}`, import.meta.url));
        if (!res.ok) return null;
        const json = await res.json();
        return {
            mapping: (json && typeof json.mapping === 'object' && json.mapping) || {},
            removedTags: Array.isArray(json?.removedTags) ? json.removedTags : [],
        };
    } catch (e) {
        console.error(`[Tag Merger] failed to load ${BASE_FILE}`, e);
        return null;
    }
}

/**
 * Return the user's dictionary, seeding it from the shipped base the first time
 * the extension is used.
 */
async function ensureDictionary() {
    const s = getExtSettings();
    if (Object.keys(s.mapping).length === 0 && s.removedTags.length === 0) {
        const base = await loadBaseDictionary();
        if (base) {
            s.mapping = base.mapping;
            s.removedTags = base.removedTags;
            SillyTavern.getContext().saveSettingsDebounced?.();
        }
    }
    return { mapping: s.mapping, removedTags: s.removedTags };
}

function buildPanel() {
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
                <div id="ctm-reset" class="ctm-reset-link" title="Discard your edits and reload the shipped base dictionary">Reset mapping to the shipped default</div>
            </div>
        </div>
    `;
    div.querySelector('#ctm-reset').addEventListener('click', async () => {
        const base = await loadBaseDictionary();
        if (!base || Object.keys(base.mapping).length === 0) {
            toastr.error('Could not load the base dictionary.', 'Tag Merger');
            return;
        }
        saveDictionary(base.mapping, base.removedTags);
        toastr.success('Mapping reset to the shipped default.', 'Tag Merger');
    });
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
        const { mapping, removedTags } = await ensureDictionary();
        openModal(characters, mapping, removedTags);
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
    return true;
}

if (!injectPanel()) {
    const observer = new MutationObserver(() => {
        if (injectPanel()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}
