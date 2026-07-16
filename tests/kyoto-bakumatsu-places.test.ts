import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KYOTO_BAKUMATSU_DATA_PATH,
  KYOTO_BAKUMATSU_DATASET_ID,
  KYOTO_BOUNDS,
  KYOTO_PLACE_CATEGORIES,
  loadKyotoBakumatsuPlaces,
  parseKyotoBakumatsuGeoJson,
} from "../src/kyoto-bakumatsu-places";
import { KYOTO_SOURCE_DEFINITIONS } from "../src/kyoto-source-registry";

interface FixtureFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: unknown[];
    [key: string]: unknown;
  };
  properties: Record<string, unknown>;
  [key: string]: unknown;
}

interface FixtureCollection {
  type: string;
  features: FixtureFeature[];
  [key: string]: unknown;
}

const FIRST_REGISTERED_SOURCE_ID = KYOTO_SOURCE_DEFINITIONS[0]?.id;
if (!FIRST_REGISTERED_SOURCE_ID) {
  throw new Error("京都出典レジストリが空です");
}

const REQUIRED_PROPERTY_KEYS = [
  "id",
  "nameJa",
  "category",
  "eraId",
  "dateDisplayJa",
  "startYear",
  "endYear",
  "summaryJa",
  "locationBasis",
  "historicalSiteStatus",
  "coordinateConfidence",
  "locationNoteJa",
  "sourceIds",
  "sourceId",
] as const;

function fixtureFeature(index: number): FixtureFeature {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [135.7 + index * 0.001, 34.95 + index * 0.001],
    },
    properties: {
      id: `kyoto-fixture-${String(index + 1).padStart(2, "0")}`,
      nameJa: `京都テスト地点${index + 1}`,
      nameEn: `Kyoto fixture ${index + 1}`,
      category: KYOTO_PLACE_CATEGORIES[index % KYOTO_PLACE_CATEGORIES.length],
      eraId: "bakumatsu",
      dateDisplayJa: "安政元年（1854年）",
      startYear: 1854,
      endYear: 1854,
      summaryJa: "京都の幕末史に関係する地点について、公的資料を照合し、現在位置と歴史上の位置の違いに注意して、本プロジェクトが中立的な説明として独自に作成したテスト用の文章です。追加の説明を含めて必要な文字数を満たします。",
      locationBasis: "official-historic-marker",
      historicalSiteStatus: "marker-only",
      coordinateConfidence: "high",
      locationNoteJa:
        "公的資料に記録された史跡表示の現在位置を示すテスト用の説明です。",
      sourceIds: [FIRST_REGISTERED_SOURCE_ID],
      sourceId: KYOTO_BAKUMATSU_DATASET_ID,
    },
  };
}

function fixtureCollection(count = 30): FixtureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, index) =>
      fixtureFeature(index),
    ),
  };
}

function parseFixture(
  mutate?: (collection: FixtureCollection) => void,
  count = 30,
) {
  const collection = fixtureCollection(count);
  mutate?.(collection);
  return () => parseKyotoBakumatsuGeoJson(JSON.stringify(collection));
}

function response(
  overrides: Partial<{
    status: number;
    headers: Headers;
    text: () => Promise<string>;
  }> = {},
) {
  return {
    status: 200,
    headers: new Headers({
      "content-type": "application/geo+json; charset=utf-8",
    }),
    text: () => Promise.resolve(JSON.stringify(fixtureCollection())),
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("京都・幕末地点GeoJSON検証", () => {
  it.each([30, 50])("許容境界の%d件をPointとして読み込む", (count) => {
    const places = parseFixture(undefined, count)();
    expect(places).toHaveLength(count);
    expect(places[0]).toMatchObject({
      id: "kyoto-fixture-01",
      nameJa: "京都テスト地点1",
      nameEn: "Kyoto fixture 1",
      eraId: "bakumatsu",
      sourceIds: [FIRST_REGISTERED_SOURCE_ID],
      sourceId: KYOTO_BAKUMATSU_DATASET_ID,
    });
    expect(Object.isFrozen(places)).toBe(true);
    expect(Object.isFrozen(places[0])).toBe(true);
  });

  it.each([29, 51])("許容範囲外の%d件を拒否する", (count) => {
    expect(parseFixture(undefined, count)).toThrow("30〜50件");
  });

  it("Point以外と不正なFeature構造を拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.geometry.type = "LineString";
      }),
    ).toThrow("Point");
    expect(
      parseFixture((collection) => {
        collection.features[0]!.type = "NotAFeature";
      }),
    ).toThrow("Point Feature");
  });

  it.each(REQUIRED_PROPERTY_KEYS)("必須プロパティ %s の欠落を拒否する", (key) => {
    expect(
      parseFixture((collection) => {
        delete collection.features[0]!.properties[key];
      }),
    ).toThrow("必須プロパティ");
  });

  it("各階層の未許可プロパティを拒否する", () => {
    const mutations: Array<(collection: FixtureCollection) => void> = [
      (collection) => {
        collection["unexpected"] = true;
      },
      (collection) => {
        collection.features[0]!["unexpected"] = true;
      },
      (collection) => {
        collection.features[0]!.geometry["unexpected"] = true;
      },
      (collection) => {
        collection.features[0]!.properties["unexpected"] = true;
      },
    ];
    for (const mutate of mutations) {
      expect(parseFixture(mutate)).toThrow("未許可プロパティ");
    }
  });

  it("固定sourceIdと固定eraId以外を拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["sourceId"] = "other-dataset";
      }),
    ).toThrow("sourceId が固定値");
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["eraId"] = "edo-late";
      }),
    ).toThrow("eraId が固定値");
  });

  it("sourceIdsは1件以上の実在IDだけを重複なしで許可する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["sourceIds"] = [];
      }),
    ).toThrow("sourceIds が不正");
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["sourceIds"] = [
          "not-registered-source",
        ];
      }),
    ).toThrow("未登録のsourceId");
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["sourceIds"] = [
          FIRST_REGISTERED_SOURCE_ID,
          FIRST_REGISTERED_SOURCE_ID,
        ];
      }),
    ).toThrow("重複");
  });

  it("low confidenceを拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["coordinateConfidence"] = "low";
      }),
    ).toThrow("許可リスト外");
  });

  it.each([
    ["nameJa", "<img src=x onerror=alert(1)>", "HTML"],
    ["summaryJa", "説明[外部](https://example.com)".repeat(10), "Markdownリンク"],
    ["locationNoteJa", "位置の説明に\u0000制御文字を混入します。", "制御文字"],
    ["summaryJa", "長".repeat(221), "長文"],
  ])("%sの%sを拒否する", (field, value) => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties[field] = value;
      }),
    ).toThrow();
  });

  it("許可リスト外カテゴリを拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["category"] = "tourism";
      }),
    ).toThrow("category が許可リスト外");
  });

  it.each([
    [1852, 1854],
    [1854, 1869],
    [1860, 1859],
    [1854.5, 1855],
  ])("不正な年代 %s〜%s を拒否する", (startYear, endYear) => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties["startYear"] = startYear;
        collection.features[0]!.properties["endYear"] = endYear;
      }),
    ).toThrow("年代範囲");
  });

  it.each([
    [KYOTO_BOUNDS.minLon - 0.001, 35],
    [KYOTO_BOUNDS.maxLon + 0.001, 35],
    [135.7, KYOTO_BOUNDS.minLat - 0.001],
    [135.7, KYOTO_BOUNDS.maxLat + 0.001],
  ])("京都bounds外座標 %s,%s を拒否する", (longitude, latitude) => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.geometry.coordinates = [longitude, latitude];
      }),
    ).toThrow("bounds外");
  });

  it("重複IDと小数6桁で同一になる重複座標を拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[1]!.properties["id"] =
          collection.features[0]!.properties["id"];
      }),
    ).toThrow("地点IDが重複");
    expect(
      parseFixture((collection) => {
        const [longitude, latitude] =
          collection.features[0]!.geometry.coordinates;
        collection.features[1]!.geometry.coordinates = [
          Number(longitude) + 0.0000001,
          Number(latitude) + 0.0000001,
        ];
      }),
    ).toThrow("地点座標が重複");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "有限数ではない座標 %s を拒否する",
    (value) => {
      const collection = fixtureCollection();
      collection.features[0]!.geometry.coordinates[0] = value;
      const parse = vi.spyOn(JSON, "parse").mockReturnValue(collection);
      try {
        expect(() => parseKyotoBakumatsuGeoJson("valid-json-placeholder")).toThrow(
          "有限数",
        );
      } finally {
        parse.mockRestore();
      }
    },
  );

  it("nullの座標・propertiesを拒否する", () => {
    expect(
      parseFixture((collection) => {
        collection.features[0]!.geometry.coordinates[0] = null;
      }),
    ).toThrow("有限数");
    expect(
      parseFixture((collection) => {
        collection.features[0]!.properties = null as unknown as Record<
          string,
          unknown
        >;
      }),
    ).toThrow("properties が不正");
  });

  it.each(["__proto__", "prototype", "constructor"])(
    "prototype pollution用キー %s を拒否しObject.prototypeを変更しない",
    (key) => {
      const collection = fixtureCollection();
      Object.defineProperty(collection.features[0]!.properties, key, {
        value: { polluted: true },
        enumerable: true,
        configurable: true,
      });
      expect(() =>
        parseKyotoBakumatsuGeoJson(JSON.stringify(collection)),
      ).toThrow();
      expect(Reflect.get(Object.prototype, "polluted")).toBeUndefined();
    },
  );
});

describe("京都・幕末地点fetch契約", () => {
  it("HTTP 200かつ許可Content-Typeだけを読みcredentials omit・redirect errorで取得する", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response());
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadKyotoBakumatsuPlaces("/base/")).resolves.toHaveLength(30);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `/base/${KYOTO_BAKUMATSU_DATA_PATH}`,
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
    });
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([204, 302, 404])("HTTP %dを拒否する", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ status })));
    await expect(loadKyotoBakumatsuPlaces("/")).rejects.toThrow("応答が不正");
  });

  it.each([
    null,
    "text/html",
    "application/geo+json; charset=shift_jis",
  ])("不正Content-Type %s を拒否する", async (contentType) => {
    const headers = new Headers();
    if (contentType !== null) headers.set("content-type", contentType);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ headers })),
    );
    await expect(loadKyotoBakumatsuPlaces("/")).rejects.toThrow("応答が不正");
  });
});
