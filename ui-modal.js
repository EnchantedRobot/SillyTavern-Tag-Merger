// ui-modal.js
// Builds the Tag Merger modal, renders the editable review table, and
// orchestrates the scan -> review -> apply flow. Self-contained: no external
// popup imports.
//
// The review table is a live model the user can edit: variants can be dropped
// from a group, moved to another group, or spun out as their own tag. Dropped
// tags collect in an "excluded" strip and can be moved back or made into a new
// group. Card counts recompute as variants move.

import { analyze, applyRowsToTags, getCardTags, pickCanonical, FUZZY_THRESHOLD_DEFAULT } from './tag-analysis.js';
import { writeCardTags } from './card-writer.js';
import { EXT_KEY, getExtSettings } from './index.js';

const MODULE = '[Tag Merger]';

function getThreshold() {
    return getExtSettings().fuzzyThreshold ?? FUZZY_THRESHOLD_DEFAULT;
}

function saveDeletedTags() {
    const settings = getExtSettings();
    settings.deletedTags = state.deleted.map(v => v.tag);
    SillyTavern.getContext().saveSettingsDebounced?.();
}

// A single-variant tag is "ignored" (auto-categorised, shown in blue) when it is
// clean (starts with a capital letter), needs no rename, and appears on >= this
// many cards. Tags below the threshold stay in Excluded instead.
const IGNORED_MIN_CARDS = 10;

// Live state for the open modal.
let state = null;       // { groups, excluded, ignored, deleted }
let overlayEl = null;
let characterList = [];
let groupSeq = 0;
let excludedFilter = '';
let ignoredFilter = '';
let excludedSelectionMode = false;
let excludedSelected = new Set(); // Set of variant objects
let groupSort = 'cardCount'; // 'cardCount' | 'alpha'
let activeThreshold = FUZZY_THRESHOLD_DEFAULT;

function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function closeModal() {
    closeChipMenu();
    overlayEl?.remove();
    overlayEl = null;
    state = null;
}

/** Union of card avatars across a group's variants. */
function cardCount(group) {
    const set = new Set();
    for (const v of group.variants) for (const a of v.avatars) set.add(a);
    return set.size;
}

/** Does a group represent a real change (some variant differs from canonical)? */
function groupChanges(group) {
    return group.variants.some(v => v.tag !== group.canonical);
}

/**
 * A single-variant tag qualifies for the Ignored bin when it is already in its
 * canonical form (no rename needed), starts with a capital letter, and appears
 * on enough cards to be considered a real "established" tag.
 */
function isIgnoredTag(variant, canonical) {
    return variant.tag === canonical &&
           /^[A-Z]/.test(variant.tag) &&
           variant.count >= IGNORED_MIN_CARDS;
}

/**
 * Open the Tag Merger modal for the given characters.
 * @param {object[]} characters
 * @param {number} [threshold]  fuzzy threshold; defaults to stored/default value
 */
export function openModal(characters, threshold) {
    closeModal();
    characterList = characters;
    activeThreshold = threshold ?? getThreshold();
    groupSeq = 0;
    excludedFilter = '';
    ignoredFilter = '';
    excludedSelectionMode = false;
    excludedSelected = new Set();
    groupSort = 'cardCount';

    const rows = analyze(characters, activeThreshold);
    // Only real merges (2+ variants collapsing into one canonical) start as
    // active rows. A single-variant row is a 1->1 rename — likely a leftover
    // that isn't actually a duplicate of anything — so it defaults to the
    // "Excluded" bin, where the user can pull it into a group if it belongs.
    const savedDeleted = new Set((getExtSettings().deletedTags ?? []).map(t => t.toLowerCase()));

    const groups = [];
    const excluded = [];
    const ignored = [];
    const deleted = [];
    for (const r of rows) {
        if (r.variants.length > 1) {
            groups.push({
                id: `g${groupSeq++}`,
                canonical: r.canonical,
                fuzzy: r.fuzzy,
                checked: !r.fuzzy, // exact merges on by default; fuzzy opt-in
                variants: r.variants,
            });
        } else {
            const v = r.variants[0];
            if (savedDeleted.has(v.tag.toLowerCase())) {
                deleted.push(v);
            } else if (isIgnoredTag(v, r.canonical)) {
                ignored.push(v);
            } else {
                excluded.push(v);
            }
        }
    }
    state = { groups, excluded, ignored, deleted };

    overlayEl = el(`
        <div id="ctm-overlay" class="ctm-overlay">
            <div class="ctm-modal">
                <div class="ctm-header">
                    <h3><i class="fa-solid fa-tags"></i> Optimize Character Tags</h3>
                    <div class="ctm-close menu_button" title="Close"><i class="fa-solid fa-xmark"></i></div>
                </div>
                <div class="ctm-body"></div>
                <div class="ctm-footer"></div>
            </div>
        </div>
    `);
    overlayEl.querySelector('.ctm-close').addEventListener('click', closeModal);
    overlayEl.addEventListener('click', (e) => {
        if (e.target === overlayEl) closeModal();
        else if (!e.target.closest('.ctm-chip-menu') && !e.target.closest('.ctm-chip')) closeChipMenu();
    });

    // Footer is built once; body is re-rendered on edits.
    const footer = overlayEl.querySelector('.ctm-footer');
    const applyBtn = el(`<div id="ctm-apply" class="menu_button"><i class="fa-solid fa-wand-magic-sparkles"></i>&nbsp;&nbsp;Apply Selected</div>`);
    applyBtn.addEventListener('click', onApply);
    footer.appendChild(applyBtn);
    const rescanBtn = el(`<div class="menu_button ctm-rescan-btn" title="Re-run the scan with the current fuzzy threshold from the Extensions panel"><i class="fa-solid fa-rotate"></i>&nbsp;&nbsp;Re-scan</div>`);
    rescanBtn.addEventListener('click', () => openModal(characterList, getThreshold()));
    footer.appendChild(rescanBtn);
    const closeBtn = el(`<div class="menu_button"><i class="fa-solid fa-xmark"></i>&nbsp;&nbsp;Close</div>`);
    closeBtn.addEventListener('click', closeModal);
    footer.appendChild(closeBtn);

    document.body.appendChild(overlayEl);
    renderBody();
}

/** Read DOM-only edits (canonical text, checkboxes) back into the model. */
function syncFromDom() {
    if (!overlayEl) return;
    for (const group of state.groups) {
        const tr = overlayEl.querySelector(`.ctm-row[data-id="${group.id}"]`);
        if (!tr) continue;
        const input = tr.querySelector('.ctm-canonical');
        if (input) group.canonical = input.value.trim() || group.canonical;
        const check = tr.querySelector('.ctm-check');
        if (check) group.checked = check.checked;
    }
}

function renderBody() {
    const body = overlayEl.querySelector('.ctm-body');
    body.innerHTML = '';

    if (state.groups.length === 0 && state.excluded.length === 0 && state.ignored.length === 0 && state.deleted.length === 0) {
        body.appendChild(el(`<p class="ctm-empty">No messy or duplicate tags found — your tags are already clean. 🎉</p>`));
        return;
    }

    body.appendChild(buildSummary());
    if (state.groups.length > 0) body.appendChild(buildTable());
    body.appendChild(buildExcluded());
    body.appendChild(buildIgnored());
    body.appendChild(buildDeleted());
    body.appendChild(buildProgress());
}

function buildSummary() {
    const fuzzy = state.groups.filter(g => g.fuzzy).length;
    const node = el(`
        <div class="ctm-summary">
            <b>${state.groups.length}</b> merge group${state.groups.length === 1 ? '' : 's'}.
            ${fuzzy ? `<span class="ctm-fuzzy-note">${fuzzy} fuzzy match${fuzzy === 1 ? '' : 'es'} (highlighted, off by default — review before applying).</span>` : ''}
            <div class="ctm-bulk">
                <span class="ctm-link" id="ctm-select-all">Select all</span> ·
                <span class="ctm-link" id="ctm-select-none">Deselect all</span>
                <span class="ctm-hint">· Click a tag to move it; ✕ removes it from the group. Single tags sit below, left unchanged — click one to merge it in.</span>
                <span class="ctm-sort-controls">
                    Sort:
                    <span class="ctm-link ctm-sort${groupSort === 'cardCount' ? ' ctm-sort-active' : ''}" data-sort="cardCount">By cards</span> ·
                    <span class="ctm-link ctm-sort${groupSort === 'alpha' ? ' ctm-sort-active' : ''}" data-sort="alpha">A–Z</span>
                </span>
            </div>
        </div>
    `);
    node.querySelector('#ctm-select-all').addEventListener('click', () => { syncFromDom(); state.groups.forEach(g => g.checked = true); renderBody(); });
    node.querySelector('#ctm-select-none').addEventListener('click', () => { syncFromDom(); state.groups.forEach(g => g.checked = false); renderBody(); });
    node.querySelectorAll('.ctm-sort').forEach(btn => {
        btn.addEventListener('click', () => { syncFromDom(); groupSort = btn.dataset.sort; renderBody(); });
    });
    return node;
}

function buildTable() {
    const wrap = el(`<div class="ctm-table-wrap"><table class="ctm-table">
        <thead><tr><th class="ctm-col-check"></th><th>Canonical tag</th><th>Merged variants</th><th class="ctm-col-count">Cards</th><th class="ctm-col-dismiss"></th></tr></thead>
        <tbody></tbody></table></div>`);
    const tbody = wrap.querySelector('tbody');

    const ordered = [...state.groups].sort(groupSort === 'alpha'
        ? (a, b) => a.canonical.localeCompare(b.canonical)
        : (a, b) => cardCount(b) - cardCount(a) || a.canonical.localeCompare(b.canonical));

    for (const group of ordered) {
        const tr = el(`
            <tr class="ctm-row${group.fuzzy ? ' ctm-row-fuzzy' : ''}" data-id="${group.id}">
                <td class="ctm-col-check"><input type="checkbox" class="ctm-check" ${group.checked ? 'checked' : ''}></td>
                <td><input type="text" class="ctm-canonical text_pole" value="${escapeHtml(group.canonical)}">${group.fuzzy ? '<span class="ctm-fuzzy-badge" title="Fuzzy match — verify these belong together">fuzzy</span>' : ''}</td>
                <td class="ctm-variants"></td>
                <td class="ctm-col-count">${cardCount(group)}</td>
                <td class="ctm-col-dismiss"><span class="ctm-row-dismiss" title="Dismiss group — send all variants to Excluded">✕</span></td>
            </tr>
        `);
        const cell = tr.querySelector('.ctm-variants');
        for (const v of group.variants) cell.appendChild(buildChip(v, group));
        tr.querySelector('.ctm-check').addEventListener('change', (e) => { group.checked = e.target.checked; });
        tr.querySelector('.ctm-canonical').addEventListener('change', (e) => { group.canonical = e.target.value.trim() || group.canonical; });
        tr.querySelector('.ctm-row-dismiss').addEventListener('click', () => {
            syncFromDom();
            state.groups = state.groups.filter(g => g !== group);
            for (const v of group.variants) state.excluded.push(v);
            renderBody();
        });
        tbody.appendChild(tr);
    }
    return wrap;
}

/** A variant chip. `group` is null when the chip lives in the excluded strip. */
function buildChip(variant, group) {
    const isCanonical = group && variant.tag.toLowerCase() === group.canonical.toLowerCase();
    const chip = el(`
        <span class="ctm-chip${isCanonical ? ' ctm-chip-canonical' : ''}" title="Click to move">
            <span class="ctm-chip-label">${escapeHtml(variant.tag)}</span>
            <span class="ctm-chip-count">${variant.count}</span>
            <span class="ctm-chip-x" title="Remove from group">✕</span>
        </span>
    `);
    const openMenu = (e) => { e.stopPropagation(); openChipMenu(chip, variant, group); };
    chip.querySelector('.ctm-chip-label').addEventListener('click', openMenu);
    chip.querySelector('.ctm-chip-count').addEventListener('click', openMenu);
    chip.querySelector('.ctm-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        moveVariant(variant, group, 'excluded');
    });
    return chip;
}

function buildExcluded() {
    const wrap = el(`<div class="ctm-excluded"></div>`);

    // Header row with Select toggle
    const headerRow = el(`<div class="ctm-excluded-header-row">
        <span class="ctm-excluded-header">Excluded — left unchanged (${state.excluded.length})</span>
        ${state.excluded.length > 0 ? `<span class="ctm-link ctm-excluded-toggle">${excludedSelectionMode ? 'Cancel' : 'Select'}</span>` : ''}
    </div>`);
    headerRow.querySelector('.ctm-excluded-toggle')?.addEventListener('click', () => {
        excludedSelectionMode = !excludedSelectionMode;
        excludedSelected.clear();
        const excEl = overlayEl.querySelector('.ctm-excluded');
        if (excEl) excEl.replaceWith(buildExcluded());
    });
    wrap.appendChild(headerRow);

    if (state.excluded.length === 0) {
        wrap.appendChild(el(`<div class="ctm-excluded-empty">Removed tags appear here. Click one to move it into a group.</div>`));
        return wrap;
    }

    if (excludedSelectionMode && excludedSelected.size > 0) {
        wrap.appendChild(buildBulkActionBar());
    }

    const filter = el(`<input type="text" class="ctm-excluded-filter text_pole" placeholder="Filter ${state.excluded.length} tags…" value="${escapeHtml(excludedFilter)}">`);
    wrap.appendChild(filter);

    const sorted = [...state.excluded].sort((a, b) =>
        a.tag.toLowerCase().replace(/^#+/, '').localeCompare(b.tag.toLowerCase().replace(/^#+/, '')));
    const strip = el(`<div class="ctm-excluded-strip"></div>`);
    for (const v of sorted) {
        const chip = buildExcludedChip(v);
        chip.dataset.tag = v.tag.toLowerCase().replace(/^#+/, '');
        strip.appendChild(chip);
    }
    wrap.appendChild(strip);

    filter.addEventListener('input', (e) => {
        excludedFilter = e.target.value;
        applyExcludedFilter(strip);
    });
    applyExcludedFilter(strip);
    return wrap;
}

function buildExcludedChip(variant) {
    const isSelected = excludedSelected.has(variant);
    const chip = el(`
        <span class="ctm-chip ctm-chip-excluded${isSelected ? ' ctm-chip-selected' : ''}"
              title="${excludedSelectionMode ? 'Click to select' : 'Click to move'}">
            <span class="ctm-chip-label">${escapeHtml(variant.tag)}</span>
            <span class="ctm-chip-count">${variant.count}</span>
            <span class="ctm-chip-x" title="Mark for deletion">✕</span>
        </span>
    `);
    chip.querySelector('.ctm-chip-x').addEventListener('click', (e) => {
        e.stopPropagation();
        state.excluded = state.excluded.filter(v => v !== variant);
        state.deleted.push(variant);
        saveDeletedTags();
        const excEl = overlayEl.querySelector('.ctm-excluded');
        const delEl = overlayEl.querySelector('.ctm-deleted');
        if (excEl) excEl.replaceWith(buildExcluded());
        if (delEl) delEl.replaceWith(buildDeleted());
    });
    chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (excludedSelectionMode) {
            if (excludedSelected.has(variant)) excludedSelected.delete(variant);
            else excludedSelected.add(variant);
            const excEl = overlayEl.querySelector('.ctm-excluded');
            if (excEl) excEl.replaceWith(buildExcluded());
        } else {
            openChipMenu(chip, variant, null);
        }
    });
    return chip;
}

function buildBulkActionBar() {
    const n = excludedSelected.size;
    const bar = el(`<div class="ctm-bulk-bar">
        <span class="ctm-bulk-count">${n} selected</span>
        <div class="ctm-bulk-move-wrap">
            <input type="text" class="ctm-bulk-filter text_pole" placeholder="Move to group…">
            <div class="ctm-bulk-group-list" style="display:none;"></div>
        </div>
        <div class="menu_button ctm-bulk-newgroup">＋ New group</div>
        <div class="menu_button ctm-bulk-delete">✕ Delete</div>
        <span class="ctm-link ctm-bulk-clear">Deselect all</span>
    </div>`);

    const filterInput = bar.querySelector('.ctm-bulk-filter');
    const groupList = bar.querySelector('.ctm-bulk-group-list');

    function renderGroupList(q) {
        groupList.innerHTML = '';
        const filtered = state.groups.filter(g => !q || g.canonical.toLowerCase().includes(q));
        if (filtered.length === 0) {
            groupList.appendChild(el(`<div class="ctm-bulk-group-item ctm-chip-menu-empty">No matching groups</div>`));
            return;
        }
        for (const g of filtered) {
            const item = el(`<div class="ctm-bulk-group-item">→ ${escapeHtml(g.canonical)}</div>`);
            item.addEventListener('click', () => bulkMoveSelected(g));
            groupList.appendChild(item);
        }
    }

    filterInput.addEventListener('focus', () => { groupList.style.display = 'block'; renderGroupList(filterInput.value.trim().toLowerCase()); });
    filterInput.addEventListener('input', (e) => renderGroupList(e.target.value.trim().toLowerCase()));
    filterInput.addEventListener('keydown', (e) => e.stopPropagation());
    filterInput.addEventListener('click', (e) => e.stopPropagation());
    filterInput.addEventListener('blur', () => setTimeout(() => { groupList.style.display = 'none'; }, 150));

    bar.querySelector('.ctm-bulk-newgroup').addEventListener('click', () => bulkMoveSelected('new'));
    bar.querySelector('.ctm-bulk-delete').addEventListener('click', () => bulkMoveSelected('delete'));
    bar.querySelector('.ctm-bulk-clear').addEventListener('click', () => {
        excludedSelected.clear();
        const excEl = overlayEl.querySelector('.ctm-excluded');
        if (excEl) excEl.replaceWith(buildExcluded());
    });

    return bar;
}

function bulkMoveSelected(to) {
    syncFromDom();
    const variants = [...excludedSelected];
    excludedSelected.clear();
    state.excluded = state.excluded.filter(v => !variants.includes(v));

    if (to === 'new') {
        state.groups.push({ id: `g${groupSeq++}`, canonical: pickCanonical(variants), fuzzy: false, checked: true, variants });
    } else if (to === 'delete') {
        for (const v of variants) state.deleted.push(v);
        saveDeletedTags();
    } else {
        for (const v of variants) to.variants.push(v);
    }

    excludedSelectionMode = false;
    renderBody();
}

function applyExcludedFilter(strip) {
    const q = excludedFilter.trim().toLowerCase().replace(/^#+/, '');
    for (const chip of strip.children) {
        chip.style.display = (!q || chip.dataset.tag.includes(q)) ? '' : 'none';
    }
}

function buildDeleted() {
    const wrap = el(`<div class="ctm-deleted"></div>`);
    if (state.deleted.length === 0) return wrap;

    wrap.appendChild(el(`<div class="ctm-deleted-header">
        <span>Delete (${state.deleted.length}) — these tags will be removed from all cards</span>
    </div>`));

    const sorted = [...state.deleted].sort((a, b) =>
        a.tag.toLowerCase().replace(/^#+/, '').localeCompare(b.tag.toLowerCase().replace(/^#+/, '')));
    const strip = el(`<div class="ctm-deleted-strip"></div>`);
    for (const v of sorted) {
        const chip = el(`
            <span class="ctm-chip ctm-chip-delete-queued" title="Click ✕ to restore to excluded">
                <span class="ctm-chip-label">${escapeHtml(v.tag)}</span>
                <span class="ctm-chip-count">${v.count}</span>
                <span class="ctm-chip-x" title="Restore to excluded">↩</span>
            </span>
        `);
        chip.querySelector('.ctm-chip-x').addEventListener('click', (e) => {
            e.stopPropagation();
            state.deleted = state.deleted.filter(d => d !== v);
            state.excluded.push(v);
            saveDeletedTags();
            const delEl = overlayEl.querySelector('.ctm-deleted');
            const excEl = overlayEl.querySelector('.ctm-excluded');
            if (delEl) delEl.replaceWith(buildDeleted());
            if (excEl) excEl.replaceWith(buildExcluded());
        });
        strip.appendChild(chip);
    }
    wrap.appendChild(strip);
    return wrap;
}

// ── Ignored strip ──────────────────────────────────────────────────────────

function buildIgnored() {
    const wrap = el(`<div class="ctm-ignored"></div>`);
    if (state.ignored.length === 0) return wrap;

    wrap.appendChild(el(`<div class="ctm-ignored-header">
        <span>Ignored — clean canonical tags (${state.ignored.length})</span>
        <span class="ctm-hint" style="font-weight:normal;"> · These are already correct and unique — no action needed. Click ✕ to move one to Excluded.</span>
    </div>`));

    const filter = el(`<input type="text" class="ctm-ignored-filter text_pole" placeholder="Filter ${state.ignored.length} tags…" value="${escapeHtml(ignoredFilter)}">`);
    wrap.appendChild(filter);

    const sorted = [...state.ignored].sort((a, b) => a.tag.localeCompare(b.tag));
    const strip = el(`<div class="ctm-ignored-strip"></div>`);
    for (const v of sorted) {
        const chip = el(`
            <span class="ctm-chip ctm-chip-ignored" title="Clean canonical tag — click ✕ to move to Excluded">
                <span class="ctm-chip-label">${escapeHtml(v.tag)}</span>
                <span class="ctm-chip-count">${v.count}</span>
                <span class="ctm-chip-x" title="Move to Excluded">✕</span>
            </span>
        `);
        chip.dataset.tag = v.tag.toLowerCase();
        chip.querySelector('.ctm-chip-x').addEventListener('click', (e) => {
            e.stopPropagation();
            state.ignored = state.ignored.filter(i => i !== v);
            state.excluded.push(v);
            const ignEl = overlayEl.querySelector('.ctm-ignored');
            const excEl = overlayEl.querySelector('.ctm-excluded');
            if (ignEl) ignEl.replaceWith(buildIgnored());
            if (excEl) excEl.replaceWith(buildExcluded());
        });
        strip.appendChild(chip);
    }
    wrap.appendChild(strip);

    filter.addEventListener('input', (e) => {
        ignoredFilter = e.target.value;
        applyIgnoredFilter(strip);
    });
    applyIgnoredFilter(strip);
    return wrap;
}

function applyIgnoredFilter(strip) {
    const q = ignoredFilter.trim().toLowerCase();
    for (const chip of strip.children) {
        chip.style.display = (!q || chip.dataset.tag.includes(q)) ? '' : 'none';
    }
}

// ── Chip move menu ─────────────────────────────────────────────────────────

let chipMenuEl = null;

function closeChipMenu() {
    chipMenuEl?.remove();
    chipMenuEl = null;
}

function openChipMenu(anchor, variant, group) {
    closeChipMenu();
    syncFromDom();

    // Build the "move to group" items (filterable).
    const groupItems = state.groups
        .filter(g => g !== group)
        .map(g => ({ label: g.canonical, g }));

    // Fixed actions (always visible, not filtered).
    const fixedItems = [];
    if (group) fixedItems.push({ label: '✕ Exclude (leave unchanged)', onClick: () => moveVariant(variant, group, 'excluded') });
    fixedItems.push({ label: '＋ New group from this tag', onClick: () => moveVariant(variant, group, 'new') });

    chipMenuEl = el(`<div class="ctm-chip-menu"></div>`);

    // Filter input.
    const filterInput = el(`<input type="text" class="ctm-chip-menu-filter text_pole" placeholder="Filter groups…">`);
    chipMenuEl.appendChild(filterInput);

    // Scrollable group list.
    const list = el(`<div class="ctm-chip-menu-list"></div>`);
    chipMenuEl.appendChild(list);

    // Divider + fixed actions.
    if (fixedItems.length) {
        chipMenuEl.appendChild(el(`<div class="ctm-chip-menu-divider"></div>`));
        for (const item of fixedItems) {
            const row = el(`<div class="ctm-chip-menu-item ctm-chip-menu-item-fixed">${escapeHtml(item.label)}</div>`);
            row.addEventListener('click', (e) => { e.stopPropagation(); closeChipMenu(); item.onClick(); });
            chipMenuEl.appendChild(row);
        }
    }

    function renderList(q) {
        list.innerHTML = '';
        const filtered = q
            ? groupItems.filter(i => i.label.toLowerCase().includes(q))
            : groupItems;
        if (filtered.length === 0) {
            list.appendChild(el(`<div class="ctm-chip-menu-empty">No matching groups</div>`));
        }
        for (const item of filtered) {
            const row = el(`<div class="ctm-chip-menu-item">→ ${escapeHtml(item.label)}</div>`);
            row.addEventListener('click', (e) => { e.stopPropagation(); closeChipMenu(); moveVariant(variant, group, item.g); });
            list.appendChild(row);
        }
    }

    renderList('');
    filterInput.addEventListener('input', (e) => renderList(e.target.value.trim().toLowerCase()));
    filterInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); closeChipMenu(); }
        e.stopPropagation(); // don't let ST intercept keys
    });
    filterInput.addEventListener('click', (e) => e.stopPropagation());

    const modal = overlayEl.querySelector('.ctm-modal');
    modal.appendChild(chipMenuEl);
    filterInput.focus();

    // Position near the chip, clamped to the modal box.
    const modalRect = modal.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    chipMenuEl.style.top = `${r.bottom - modalRect.top + 4}px`;
    chipMenuEl.style.left = `${r.left - modalRect.left}px`;
    const menuRect = chipMenuEl.getBoundingClientRect();
    if (menuRect.right > modalRect.right) {
        chipMenuEl.style.left = `${Math.max(4, modalRect.width - menuRect.width - 8)}px`;
    }
    if (menuRect.bottom > modalRect.bottom) {
        chipMenuEl.style.top = `${r.top - modalRect.top - menuRect.height - 4}px`;
    }
}

/**
 * Move a variant between groups / excluded / a new group.
 * @param {object} variant  the {tag,count,avatars} object
 * @param {object|null} fromGroup  source group, or null if from excluded
 * @param {object|'excluded'|'new'} to  destination
 */
function moveVariant(variant, fromGroup, to) {
    syncFromDom();

    // Remove from source.
    if (fromGroup) {
        fromGroup.variants = fromGroup.variants.filter(v => v !== variant);
    } else {
        state.excluded = state.excluded.filter(v => v !== variant);
    }

    // Add to destination.
    if (to === 'excluded') {
        if (!state.excluded.includes(variant)) state.excluded.push(variant);
    } else if (to === 'new') {
        state.groups.push({ id: `g${groupSeq++}`, canonical: pickCanonical([variant]), fuzzy: false, checked: true, variants: [variant] });
    } else {
        to.variants.push(variant);
    }

    // Drop now-empty source groups.
    if (fromGroup && fromGroup.variants.length === 0) {
        state.groups = state.groups.filter(g => g !== fromGroup);
    }

    closeChipMenu();
    renderBody();
}

// ── Progress ────────────────────────────────────────────────────────────────

function buildProgress() {
    return el(`
        <div id="ctm-progress" class="ctm-progress" style="display:none;">
            <div class="ctm-progress-row">
                <span id="ctm-progress-label">Applying...</span>
                <span id="ctm-progress-pct">0%</span>
            </div>
            <div class="ctm-progress-track"><div id="ctm-progress-bar" class="ctm-progress-bar"></div></div>
        </div>
    `);
}

function setRunning(running) {
    overlayEl.querySelectorAll('.menu_button, .ctm-check, .ctm-canonical, .ctm-link, .ctm-chip').forEach(elm => {
        elm.style.pointerEvents = running ? 'none' : '';
        elm.style.opacity = running ? '0.5' : '';
    });
}

function updateProgress(current, total) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    overlayEl.querySelector('#ctm-progress-bar').style.width = `${pct}%`;
    overlayEl.querySelector('#ctm-progress-pct').textContent = `${pct}%`;
    overlayEl.querySelector('#ctm-progress-label').textContent = `Updating cards... ${current} / ${total}`;
}

// ── Apply ─────────────────────────────────────────────────────────────────

/** Approved rows = checked groups that actually change something. */
function collectApprovedRows() {
    syncFromDom();
    return state.groups
        .filter(g => g.checked && g.canonical && groupChanges(g))
        .map(g => ({ canonical: g.canonical, variants: g.variants }));
}

async function onApply() {
    closeChipMenu();
    const approved = collectApprovedRows();
    const deletedTags = new Set(state.deleted.map(v => v.tag.toLowerCase()));

    if (approved.length === 0 && deletedTags.size === 0) {
        toastr.warning('No changes selected.', 'Tag Merger');
        return;
    }

    // Build the per-card change set up front so we know the true work size.
    const changeSet = [];
    for (const char of characterList) {
        const current = getCardTags(char);
        if (current.length === 0) continue;
        // Apply merges first, then strip deleted tags.
        let next = approved.length > 0 ? applyRowsToTags(current, approved) ?? current : current;
        if (deletedTags.size > 0) {
            const filtered = next.filter(t => !deletedTags.has(t.toLowerCase()));
            if (filtered.length !== next.length) next = filtered;
            else if (next === current) continue; // nothing changed at all
        }
        if (next !== current) changeSet.push({ avatar: char.avatar, name: char.name, newTags: next });
    }

    if (changeSet.length === 0) {
        toastr.info('Nothing to change on any card.', 'Tag Merger');
        return;
    }

    const confirmed = await confirmApply(approved.length, deletedTags.size, changeSet.length);
    if (!confirmed) return;

    setRunning(true);
    overlayEl.querySelector('#ctm-progress').style.display = 'block';

    let done = 0;
    let ok = 0;
    const errors = [];
    for (const change of changeSet) {
        const res = await writeCardTags(change.avatar, change.newTags);
        if (res.ok) ok++; else errors.push(`${change.name || change.avatar}: ${res.error}`);
        updateProgress(++done, changeSet.length);
    }

    if (errors.length === 0) {
        toastr.success(`Updated tags on ${ok} card${ok === 1 ? '' : 's'}.`, 'Tag Merger');
    } else {
        console.error(MODULE, 'errors:', errors);
        toastr.warning(`Updated ${ok}, failed ${errors.length}. See console for details.`, 'Tag Merger');
    }

    try {
        const ctx = SillyTavern.getContext();
        await ctx.getCharacters?.();
        ctx.printCharactersDebounced?.();
    } catch (e) {
        console.warn(MODULE, 'refresh failed', e);
    }

    closeModal();
}

/** In-modal confirmation overlay (self-contained, no popup.js dependency). */
function confirmApply(rowCount, deleteCount, cardCount) {
    const parts = [];
    if (rowCount > 0) parts.push(`<b>${rowCount}</b> merge/rename${rowCount === 1 ? '' : 's'}`);
    if (deleteCount > 0) parts.push(`<b>${deleteCount}</b> tag deletion${deleteCount === 1 ? '' : 's'}`);
    return new Promise(resolve => {
        const confirm = el(`
            <div class="ctm-confirm">
                <div class="ctm-confirm-box">
                    <h4>Apply tag changes?</h4>
                    <p>This will apply ${parts.join(' and ')} across <b>${cardCount}</b> card${cardCount === 1 ? '' : 's'}.</p>
                    <p class="ctm-warn"><i class="fa-solid fa-triangle-exclamation"></i> This rewrites the character card files and <b>cannot be undone</b>. Back up your characters first if unsure.</p>
                    <div class="ctm-confirm-actions">
                        <div class="menu_button ctm-confirm-yes"><i class="fa-solid fa-check"></i>&nbsp;&nbsp;Apply</div>
                        <div class="menu_button ctm-confirm-no"><i class="fa-solid fa-xmark"></i>&nbsp;&nbsp;Cancel</div>
                    </div>
                </div>
            </div>
        `);
        confirm.querySelector('.ctm-confirm-yes').addEventListener('click', () => { confirm.remove(); resolve(true); });
        confirm.querySelector('.ctm-confirm-no').addEventListener('click', () => { confirm.remove(); resolve(false); });
        overlayEl.querySelector('.ctm-modal').appendChild(confirm);
    });
}
