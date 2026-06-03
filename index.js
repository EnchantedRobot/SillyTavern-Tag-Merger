// index.js
// Character Tag Merger — entry point.
// Injects a launcher button into the Extensions settings panel that opens the
// tag-optimizer modal. This is an occasional-use utility, so it deliberately
// does NOT add a top-bar icon.

import { openModal } from './ui-modal.js';
import { FUZZY_THRESHOLD_DEFAULT } from './tag-analysis.js';

const PANEL_ID = 'ctm-panel';
export const EXT_KEY = 'CharacterTagMerger';

/**
 * Return the extension's persisted settings object, initialising defaults on
 * first access. Safe to call at any point after ST has loaded.
 */
export function getExtSettings() {
    const { extensionSettings, saveSettingsDebounced } = SillyTavern.getContext();
    if (!extensionSettings[EXT_KEY]) {
        extensionSettings[EXT_KEY] = {};
        saveSettingsDebounced?.();
    }
    const s = extensionSettings[EXT_KEY];
    if (!Array.isArray(s.deletedTags)) s.deletedTags = [];
    if (typeof s.fuzzyThreshold !== 'number') {
        // Migrate from localStorage if the user had the previous version.
        const legacy = parseFloat(localStorage.getItem('ctm-fuzzy-threshold'));
        s.fuzzyThreshold = isNaN(legacy) ? FUZZY_THRESHOLD_DEFAULT : legacy;
        localStorage.removeItem('ctm-fuzzy-threshold');
        saveSettingsDebounced?.();
    }
    return s;
}

function buildPanel() {
    const threshold = getExtSettings().fuzzyThreshold;
    const div = document.createElement('div');
    div.id = PANEL_ID;
    div.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>Character Tag Merger</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <p class="ctm-panel-desc">Scan every character's tags, group messy duplicates (case, <code>#</code> prefixes, near-matches), and merge them into clean canonical tags.</p>
                <div class="ctm-threshold-row">
                    <label class="ctm-threshold-label">Fuzzy threshold: <b id="ctm-threshold-val">${threshold.toFixed(2)}</b></label>
                    <input type="range" id="ctm-threshold" class="ctm-threshold-range"
                           min="0.70" max="0.95" step="0.01" value="${threshold}">
                    <div class="ctm-threshold-hint">Lower → more grouping. Higher → fewer, safer merges.</div>
                </div>
                <div id="ctm-open" class="menu_button" style="width:100%; text-align:center;">
                    <i class="fa-solid fa-tags"></i>&nbsp;&nbsp;Optimize Character Tags
                </div>
            </div>
        </div>
    `;
    div.querySelector('#ctm-threshold').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        div.querySelector('#ctm-threshold-val').textContent = val.toFixed(2);
        const { saveSettingsDebounced } = SillyTavern.getContext();
        getExtSettings().fuzzyThreshold = val;
        saveSettingsDebounced?.();
    });
    return div;
}

function openTagMerger() {
    try {
        const ctx = SillyTavern.getContext();
        const characters = ctx.characters || [];
        if (characters.length === 0) {
            toastr.info('No characters loaded.', 'Tag Merger');
            return;
        }
        openModal(characters, getExtSettings().fuzzyThreshold);
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
