# SillyTavern Character Tag Merger

A SillyTavern UI extension that cleans up messy character tags across your whole
library. Character cards imported from many sources accumulate inconsistent tags —
mixed case (`Female` / `female`), `#`-prefixes (`#fantasy`), separators
(`Demi-Human` / `demihuman`), and typos/near-duplicates (`#assasin` / `Assassin`).

The extension is driven by a **persistent dictionary** that maps each messy
variant onto one clean **canonical** tag. You maintain the dictionary in a simple
two-list editor and apply it to your cards whenever you like. It edits the **tags
embedded in the character card files** (`data.tags`) directly, using SillyTavern's
built-in API — no companion server plugin required.

## How it works

1. Open **Extensions** settings → **Character Tag Merger** → **Edit Tag Mapping**.
2. The editor shows three lists:
   - **Canonical tags + merged variants** — the full dictionary. Each canonical
     tag lists every variant that folds into it, with how many cards use each.
   - **Unassigned** — every tag found on a card that no canonical claims.
   - **Removed** — junk tags that get **deleted from every card** on apply.
3. Curate the dictionary:
   - Click a variant to move it to another canonical, unassign it, mark it for
     removal, or spin it out as a new canonical.
   - Click an unassigned/removed tag to assign it to a canonical, or use Select
     to bulk-move several at once.
   - Edit a canonical's name inline, delete a canonical (its variants return to
     Unassigned), or add an empty canonical.
   - **All edits save automatically** to your extension settings.
4. **Apply to Cards** — every variant is rewritten to its canonical and every
   removed tag is deleted. A confirmation warns that this rewrites the card files.

The dictionary ships with a **base mapping** (`base-mapping-v2.json`: a `mapping`
of canonical→variants plus a `removedTags` junk list) seeded from a large corpus
of cards. On first use your settings are seeded from it; the **Reset mapping**
link restores it at any time.

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
- Variant matching is **explicit and case-insensitive**: a tag is only merged if
  its exact string (ignoring case) is listed under a canonical. The dictionary
  never auto-merges on its own — it does exactly what it says.

## Regenerating the base mapping

The shipped dictionary (`base-mapping-v2.json`) is **derived**, not edited by hand.
It is built from two sources by a deterministic Python pipeline:

1. **`canonical-tags.json`** — the hand-curated taxonomy: ~350 canonical tags
   grouped into 17 organizational facets (Genre, Species, Personality,
   Relationship, NSFW Kink, Occupation, Plot/Theme, Fandom, …). Categories are
   for organization only; they are not part of the tag string. This file is the
   source of truth — to add/rename/retire a canonical, edit it here.
2. **`scripts/build-mapping.py`** — assigns every messy source tag to exactly
   **one** canonical via an alias table (one `alias()` call per canonical), or
   drops it to `removedTags`, or routes dated holiday tags to the Holiday facet.

```
# 1. Extract every tag embedded in a folder of character-card PNGs
python3 scripts/extract-tags.py ~/Downloads/characters -o card-tags.json

# 2. Map the extracted tags against the taxonomy -> base-mapping-v2.json
python3 scripts/build-mapping.py
```

`build-mapping.py` reads `card-tags.json` and writes `base-mapping-v2.json` with `mapping`
(`{ canonical: [variant…] }`), `removedTags`, `unmapped` (anything with no home —
review these), and the embedded `canonicalCategories`. It validates that no
canonical lives in two facets and that every mapping key is a defined canonical.

### Curation principles (how the alias table was built)

- **One canonical per tag.** A variant collapses into exactly one canonical.
- **Prefer a loose mapping over dropping.** Cards aren't guaranteed many tags, so
  a tag with even a minor thematic link to a canonical is mapped there rather than
  junked (e.g. `gorgon`→`Lamia`, `orphan`→`Trauma`, `guns`→`Action`).
- **Deliberate junk classes** (no canonical by design): body/appearance
  (`big breasts`, `tall`, hair/eye color), POV (`anypov`), event/jam/week names,
  author handles, model/platform meta, invented world/series names, and pure
  non-descriptors.
- **Coarse buckets** absorb noisy long tails: `Fetish` for niche kinks,
  `Working Class` for sparse job titles, `Age Defined` for age tags.

## Files

| File | Purpose |
|------|---------|
| `index.js` | Entry point; injects the launcher, loads/seeds the mapping. |
| `ui-modal.js` | Builds the two-list mapping editor; orchestrates apply. |
| `tag-analysis.js` | Pure logic: scan tags, bucket against mapping + removed, apply. |
| `card-writer.js` | Hydrate + `merge-attributes` write for one card. |
| `base-mapping-v2.json` | Shipped base dictionary (`mapping` + `removedTags`); seed for new installs. Generated, not hand-edited. |
| `canonical-tags.json` | Hand-curated taxonomy (~350 canonicals × 17 facets); source of truth for the mapping. |
| `scripts/extract-tags.py` | Read a folder of card PNGs (`chara` tEXt/zTXt chunk) → `card-tags.json` (`allTags`). Stdlib only. |
| `scripts/build-mapping.py` | Map extracted tags against the taxonomy → `base-mapping-v2.json` (one `alias()` call per canonical). |
| `scripts/verify-apply.py` | Post-apply check: recompute the expected transform from `characters_orig/` + the applied dictionary and diff against the rewritten `characters/`. Stdlib only. |
| `style.css` | Modal/table styling (theme-aware). |
