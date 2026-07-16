import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_INPUT_LENGTH,
  normalizeSearchText,
  sanitizeSearchInput,
} from "../src/place-search/normalize";

describe("地点検索の正規化", () => {
  it.each([
    ["ＡＢＣ１２３", "abc123"],
    ["  江戸　 地名  ", "江戸 地名"],
    ["カタカナ", "かたかな"],
    ["ガッコウ", "がっこう"],
    ["スーパー", "すーぱー"],
    ["ABC", "abc"],
  ])("NFKC・空白・英字・かなを正規化する: %s", (input, expected) => {
    expect(normalizeSearchText(input)).toBe(expected);
  });

  it("制御文字を除去する", () => {
    expect(normalizeSearchText("池\u0000田\u007f屋")).toBe("池田屋");
    expect(sanitizeSearchInput("池\u0000田屋")).toBe("池田屋");
  });

  it("入力を100文字へ制限する", () => {
    expect(sanitizeSearchInput("あ".repeat(101))).toHaveLength(
      MAX_SEARCH_INPUT_LENGTH,
    );
    expect(normalizeSearchText("あ".repeat(101))).toHaveLength(100);
  });

  it("表示用の元文字列を変更しない", () => {
    const display = "　池田屋・ＳＨＩＮＳＥＮＧＵＭＩ　";
    normalizeSearchText(display);
    expect(display).toBe("　池田屋・ＳＨＩＮＳＥＮＧＵＭＩ　");
  });

  it("記号・HTML風文字・正規表現メタ文字を通常文字として扱う", () => {
    expect(normalizeSearchText("<b>.*[池田屋]</b>")).toBe(
      "<b>.*[池田屋]</b>",
    );
  });
});
