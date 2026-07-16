export const MAX_SEARCH_INPUT_LENGTH = 100;

// U+0000-U+001F and U+007F are not retained in search input or indexes.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;
const WHITESPACE = /\s+/gu;
const KATAKANA = /[\u30a1-\u30f6]/gu;

/** Display strings are never passed through this function for rendering. */
export function normalizeSearchText(value: string): string {
  return value
    .slice(0, MAX_SEARCH_INPUT_LENGTH)
    .replace(CONTROL_CHARACTERS, "")
    .normalize("NFKC")
    .replace(KATAKANA, (character) =>
      String.fromCharCode(character.charCodeAt(0) - 0x60),
    )
    .trim()
    .replace(WHITESPACE, " ")
    .toLowerCase();
}

export function sanitizeSearchInput(value: string): string {
  return value
    .slice(0, MAX_SEARCH_INPUT_LENGTH)
    .replace(CONTROL_CHARACTERS, "");
}
