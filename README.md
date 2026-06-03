# SillyTavern Character Tag Merger

A SillyTavern UI extension that cleans up messy character tags across your whole
library. Character cards imported from many sources accumulate inconsistent tags —
mixed case (`Female` / `female`), `#`-prefixes (`#fantasy`), separators
(`Demi-Human` / `demihuman`), and typos/near-duplicates (`#assasin` / `Assassin`).
This extension finds them, groups them, and merges each group into one clean tag.

It edits the **tags embedded in the character card files** (`data.tags`) directly,
using SillyTavern's built-in API — no companion server plugin required.

## How it works

1. Open **Extensions** settings → **Character Tag Merger** → **Optimize Character Tags**.
2. The extension scans every character's embedded tags and groups variants:
   - **Exact normalization** — collapses case, `#` prefixes, and `- _` / spaces
     (e.g. `#Female`, `female`, `FE-MALE` → one group). These are safe and **checked
     by default**.
   - **Fuzzy matching** — a conservative second pass catches typos and plurals
     (e.g. `#assasin` ↔ `Assassin`, `roomate` ↔ `roommate`). Fuzzy rows are
     **highlighted and off by default** — review them before applying.
3. Each group gets a **canonical** tag, chosen from the most-used variant and cleaned
   for display (`#female` → `Female`). Already-styled tags like `AnyPOV` or
   `Demi-Human` are preserved as-is. The canonical is **editable** per row.
4. Review the table, toggle which changes to apply, edit canonicals as needed.
5. **Apply** — for every card holding any variant, the variants are removed and the
   canonical is added. A confirmation warns that this rewrites the card files.

## Installation

Use SillyTavern's built-in extension installer with this repo URL, or clone into:

```
SillyTavern/data/{your-user}/extensions/SillyTavern-Tag-Merger/
```

Reload SillyTavern. The panel appears under **Extensions** settings.

## Notes & caveats

- **No undo.** Applying rewrites the PNG card metadata on disk. Back up your
  characters first if unsure.
- Edits the card-embedded `data.tags`, **not** SillyTavern's in-app tag assignments
  (`tag_map`). For managing in-app tag colors/folders, see other tag managers.
- Rejecting a *fuzzy* row skips the whole group, including any safe exact-merges
  bundled into it. Reviewing fuzzy rows individually is recommended.

## Files

| File | Purpose |
|------|---------|
| `index.js` | Entry point; injects the Extensions-settings launcher button. |
| `ui-modal.js` | Builds the review modal, table, progress bar; orchestrates apply. |
| `tag-analysis.js` | Pure logic: normalize, group, fuzzy-merge, pick canonical. |
| `card-writer.js` | Hydrate + `merge-attributes` write for one card. |
| `style.css` | Modal/table styling (theme-aware). |
