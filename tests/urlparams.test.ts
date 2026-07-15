import { describe, it, expect } from "vitest";
import { readAllowedParams } from "../src/urlparams";

describe("readAllowedParams (許可リスト方式)", () => {
  it("許可されたキーと値のみ返す", () => {
    expect(readAllowedParams("?era=edo-late&base=std")).toEqual({
      era: "edo-late",
      base: "std",
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
});
