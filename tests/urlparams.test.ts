import { describe, it, expect } from "vitest";
import { readAllowedParams } from "../src/urlparams";

describe("readAllowedParams (許可リスト方式)", () => {
  it("許可されたキーと値のみ返す", () => {
    expect(readAllowedParams("?region=edo&era=edo-late&base=std")).toEqual({
      era: "edo-late",
      base: "std",
      region: "edo",
    });
  });

  it("許可リスト外の値を無視する", () => {
    expect(readAllowedParams("?era=hacked")).toEqual({});
  });

  it("許可リスト外のキーを無視する", () => {
    expect(readAllowedParams("?redirect=https://evil.example")).toEqual({});
  });

  it("スクリプト断片を含むパラメータを無視する(値が返らない)", () => {
    const result = readAllowedParams(
      "?era=%3Cscript%3Ealert(1)%3C/script%3E&base=javascript:alert(1)",
    );
    expect(result).toEqual({});
  });

  it("巨大なクエリ文字列でも安全に処理する", () => {
    const big = "?junk=" + "a".repeat(100000) + "&era=edo-late";
    expect(readAllowedParams(big)).toEqual({ era: "edo-late" });
  });

  it("空文字列を処理できる", () => {
    expect(readAllowedParams("")).toEqual({});
  });

  it.each([
    ["?era=edo-late", { era: "edo-late" }],
    ["?era=modern", { era: "modern" }],
    ["?era=none", { era: "none" }],
    ["?base=pale", { base: "pale" }],
    ["?base=std", { base: "std" }],
    ["?region=edo", { region: "edo" }],
    ["?region=kyoto", { region: "kyoto" }],
    ["?era=bakumatsu", { era: "bakumatsu" }],
  ])("既存URLとregion URL %s を維持する", (search, expected) => {
    expect(readAllowedParams(search)).toEqual(expected);
  });

  it.each([
    [
      "?region=kyoto&era=bakumatsu",
      { era: "bakumatsu", region: "kyoto" },
    ],
    ["?region=kyoto&era=modern", { era: "modern", region: "kyoto" }],
    ["?region=edo&era=edo-late", { era: "edo-late", region: "edo" }],
    ["?region=edo&era=modern", { era: "modern", region: "edo" }],
  ])("2地域の固定URLを許可する: %s", (search, expected) => {
    expect(readAllowedParams(search)).toEqual(expected);
  });

  it.each([
    "?region=unknown",
    "?region=../edo",
    "?region=https://evil.example",
    "?region=C:%5Cdata",
  ])("不明またはパス様の地域IDを無視する: %s", (search) => {
    expect(readAllowedParams(search)).toEqual({});
  });
});
