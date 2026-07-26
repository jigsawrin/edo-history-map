import { describe, it, expect, vi, afterEach } from "vitest";
import { loadPlaces } from "../src/places";
import { LIMITS } from "../src/config";
import { ValidationError } from "../src/validate";

function mockFetch(response: Partial<Response> | Error): void {
  if (response instanceof Error) {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(response));
  } else {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        text: () => Promise.resolve("{}"),
        ...response,
      }),
    );
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const validBody = JSON.stringify({
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [139.75, 35.68] },
      properties: {
        id: "1-001",
        name: "桜田御門",
        category: "施設",
        sheet: "御江戸大名小路絵図",
        source: "",
      },
    },
  ],
});

describe("loadPlaces", () => {
  it("正常なデータを読み込める", async () => {
    mockFetch({ text: () => Promise.resolve(validBody) });
    const places = await loadPlaces("/");
    expect(places).toHaveLength(1);
  });

  it("ネットワークエラー時に内部情報を含まない安全なエラーを投げる", async () => {
    expect.assertions(4);
    const original = new Error("ECONNREFUSED 127.0.0.1:443 C:\\secret\\path");
    mockFetch(original);
    try {
      await loadPlaces("/");
    } catch (e) {
      expect(e).not.toBe(original);
      expect(e).toMatchObject({
        message: "歴史データを取得できませんでした",
        cause: original,
      });
      expect(String(e)).not.toContain("C:\\");
      expect(String(e)).not.toContain("127.0.0.1");
    }
  });

  it("ValidationErrorは包まず同一インスタンスを再throwする", async () => {
    const original = new ValidationError("検証エラー");
    mockFetch({ text: () => Promise.reject(original) });
    await expect(loadPlaces("/")).rejects.toBe(original);
  });

  it("HTTP エラー(404等)を安全に処理する", async () => {
    mockFetch({ ok: false, status: 404 });
    await expect(loadPlaces("/")).rejects.toThrow(
      "歴史データを取得できませんでした",
    );
  });

  it("Content-Length がサイズ上限を超える場合は本文を読まずに拒否する", async () => {
    const text = vi.fn();
    mockFetch({
      headers: new Headers({
        "content-length": String(LIMITS.maxBytes + 1),
      }),
      text,
    });
    await expect(loadPlaces("/")).rejects.toThrow("上限");
    expect(text).not.toHaveBeenCalled();
  });

  it("不正な GeoJSON を拒否する", async () => {
    mockFetch({ text: () => Promise.resolve('{"type":"hack"}') });
    await expect(loadPlaces("/")).rejects.toThrow();
  });

  it("fetch を credentials: omit で呼ぶ(Cookie を送らない)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers(),
      text: () => Promise.resolve(validBody),
    });
    vi.stubGlobal("fetch", fetchMock);
    await loadPlaces("/");
    expect(fetchMock.mock.calls[0]?.[1]?.credentials).toBe("omit");
  });
});
