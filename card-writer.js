// card-writer.js
// Self-contained card tag writer. Rewrites a character's embedded tags
// (data.tags in the PNG metadata) via SillyTavern's built-in merge-attributes
// API. No companion server plugin required.
//
// Pattern mirrors SillyTavern-CharacterLibrary's writeCardFields: hydrate the
// character first (so we never send `undefined` heavy fields, which would erase
// existing card content), then POST a full payload with the new tags set in
// both `tags` (root mirror) and `data.tags` (the real V2/V3 field).

const { getRequestHeaders } = SillyTavern.getContext();

const GET_ENDPOINT = '/api/characters/get';
const MERGE_ENDPOINT = '/api/characters/merge-attributes';

// Heavy fields that ST may lazy-strip from list objects. We pull these back from
// the full fetch before building the write payload.
const HEAVY_FIELDS = [
    'name', 'description', 'first_mes', 'personality', 'scenario', 'mes_example',
    'system_prompt', 'post_history_instructions', 'creator_notes', 'creator',
    'character_version', 'alternate_greetings', 'character_book', 'extensions',
];

/**
 * Fetch the full, hydrated card data for an avatar.
 * @param {string} avatar
 * @returns {Promise<object|null>}
 */
export async function fetchFullCard(avatar) {
    const res = await fetch(GET_ENDPOINT, {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ avatar_url: avatar }),
    });
    if (!res.ok) return null;
    return res.json();
}

/**
 * Rewrite a single card's tags.
 * @param {string} avatar
 * @param {string[]} newTags
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
export async function writeCardTags(avatar, newTags) {
    let full;
    try {
        full = await fetchFullCard(avatar);
    } catch (e) {
        return { ok: false, error: `fetch failed: ${e.message}` };
    }
    if (!full) return { ok: false, error: 'could not load card' };

    const data = full.data || {};
    const updatedData = { ...data, tags: newTags };

    // Build a full payload from existing fields so the merge can't drop content.
    const payload = {
        avatar,
        ...(full.spec && { spec: full.spec }),
        ...(full.spec_version && { spec_version: full.spec_version }),
        create_date: full.create_date,
        tags: newTags,
        data: updatedData,
    };
    for (const field of HEAVY_FIELDS) {
        const value = data[field] !== undefined ? data[field] : full[field];
        if (value !== undefined) payload[field] = value;
    }

    try {
        const res = await fetch(MERGE_ENDPOINT, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(payload),
        });
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}
