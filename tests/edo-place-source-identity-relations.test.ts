import { createHash } from "node:crypto";
/* eslint-disable @typescript-eslint/no-explicit-any -- mutation tests exercise untyped JSON schema failures */
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDO_SOURCE_CSV_HEADER,
  EDO_SOURCE_IDENTITY_CATALOG_BYTE_LENGTH,
  EDO_SOURCE_IDENTITY_CATALOG_SHA256,
  auditEdoPlaceSourceIdentityRepository,
  auditEdoPlaceSourceIdentityLeakage,
  generateEdoPlaceSourceIdentityCatalog,
  parseEdoSourceIdentityCsv,
  summarizeEdoPlaceSourceIdentityRelations,
  validateEdoPlaceSourceIdentityCatalog,
// @ts-expect-error The production validator is an ESM JavaScript module.
} from "../scripts/edo-place-source-identity-relations.mjs";
import { calculateEdoSourceFeatureSha256 } from "../scripts/edo-place-curation-candidates.mjs";

const ROOT = join(__dirname, "..");
const source = JSON.parse(
  readFileSync(join(ROOT, "public/data/edo-places.geojson"), "utf8"),
);
const committed = JSON.parse(
  readFileSync(
    join(ROOT, "data-curation/edo-place-source-identity-relations.json"),
    "utf8",
  ),
);
const committedBytes = readFileSync(
  join(ROOT, "data-curation/edo-place-source-identity-relations.json"),
);
const clone = <T>(value: T): T => structuredClone(value);

function expectCommittedCatalogIntegrity(): void {
  expect(committedBytes).toHaveLength(EDO_SOURCE_IDENTITY_CATALOG_BYTE_LENGTH);
  expect(createHash("sha256").update(committedBytes).digest("hex")).toBe(
    EDO_SOURCE_IDENTITY_CATALOG_SHA256,
  );
  expect(repositoryAuditForCatalog(committedBytes)).toEqual([]);
}

function repositoryAuditForCatalog(catalogBytes: Buffer): string[] {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "edo-source-identity-integrity-"));
  try {
    mkdirSync(join(temporaryRoot, "public/data"), { recursive: true });
    mkdirSync(join(temporaryRoot, "data-curation"), { recursive: true });
    mkdirSync(join(temporaryRoot, "src"), { recursive: true });
    writeFileSync(
      join(temporaryRoot, "public/data/edo-places.geojson"),
      readFileSync(join(ROOT, "public/data/edo-places.geojson")),
    );
    writeFileSync(
      join(temporaryRoot, "data-curation/edo-place-source-identity-relations.json"),
      catalogBytes,
    );
    return auditEdoPlaceSourceIdentityRepository(temporaryRoot).errors;
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function expectStructurallyValidMutationRejectedByRepositoryAudit(): void {
  const mutated = clone(committed);
  const [first, second] = mutated.groups.slice(0, 2);
  [first.codhPreferredId, second.codhPreferredId] = [
    second.codhPreferredId,
    first.codhPreferredId,
  ];
  for (const item of [first, second]) {
    for (const member of item.members.slice(1)) {
      member.declaredPreferredId = item.codhPreferredId;
    }
  }
  expect(validateEdoPlaceSourceIdentityCatalog(mutated, source)).toBe(mutated);

  expect(
    repositoryAuditForCatalog(
      Buffer.from(`${JSON.stringify(mutated, null, 2)}\n`, "utf8"),
    ),
  ).toContain("Edo source identity catalog SHA-256 changed");
}

function invalid(mutate: (value: any) => void): void {
  const value = clone(committed);
  mutate(value);
  expect(() => validateEdoPlaceSourceIdentityCatalog(value, source)).toThrow();
}

function group(preferredEntryId: string): any {
  return committed.groups.find(
    (item: any) => item.preferredEntryId === preferredEntryId,
  );
}

function synthetic(): {
  bytes: Buffer;
  geojson: any;
  options: any;
} {
  const rows = [
    ["1-001", "甲", "", "", "地名", "35.500000", "139.500000", "図一", "", "https://codh.rois.ac.jp/edo-maps/owariya/01/1850/1-001.html.ja", "", ""],
    ["2-001", "甲別記", "", "", "施設", "35.500000", "139.500000", "図二", "", "https://codh.rois.ac.jp/edo-maps/owariya/02/1850/2-001.html.ja", "Ab12Cd", "1-001"],
    ["3-001", "自己", "", "", "寺社", "35.600000", "139.600000", "図三", "", "https://codh.rois.ac.jp/edo-maps/owariya/03/1850/3-001.html.ja", "Ef34Gh", "3-001"],
  ];
  const csv = [EDO_SOURCE_CSV_HEADER, ...rows]
    .map((row) => row.map((field: string) => JSON.stringify(field)).join(","))
    .join("\n") + "\n";
  const bytes = Buffer.from(csv);
  const geojson = {
    type: "FeatureCollection",
    features: rows.map((row) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [Number(row[6]), Number(row[5])],
      },
      properties: {
        id: row[0],
        name: row[1],
        category: row[4],
        sheet: row[7],
        source: row[9],
      },
    })),
  };
  const options = {
    csvSha256: createHash("sha256").update(bytes).digest("hex"),
    csvByteLength: bytes.length,
    featureCount: 3,
    sourceDataSha256: "1".repeat(64),
    anomalyIds: ["3-001"],
    expected: {
      groups: 1,
      members: 2,
      preferred: 1,
      nonpreferred: 1,
      sizeDistribution: { 2: 1 },
      nameDifferentGroups: 1,
      categoryDifferentGroups: 1,
      sameSheetMemberGroups: 0,
      anomalies: 1,
    },
  };
  return { bytes, geojson, options };
}

describe("江戸 source identity relation catalog", () => {
  it("committed catalogのbyte lengthとSHA-256を固定する", () => {
    expectCommittedCatalogIntegrity();
  });

  it("構造上有効でもsource relationが異なるcatalogをrepository auditで拒否する", () => {
    expectStructurallyValidMutationRejectedByRepositoryAudit();
  });

  it("committed catalogが合格する", () => {
    expect(validateEdoPlaceSourceIdentityCatalog(committed, source)).toBe(committed);
  });

  it("固定summaryを維持する", () => {
    expect(summarizeEdoPlaceSourceIdentityRelations(committed)).toEqual({
      groups: 825,
      members: 1693,
      preferred: 825,
      nonpreferred: 868,
      sizeDistribution: { 2: 784, 3: 39, 4: 2 },
      nameDifferentGroups: 205,
      categoryDifferentGroups: 12,
      sameSheetMemberGroups: 2,
      anomalies: 2,
    });
  });

  for (const [preferred, ids] of [
    ["1-001", ["1-001", "7-104"]],
    ["1-112", ["1-112", "2-006", "3-261"]],
    ["1-113", ["1-113", "3-155"]],
    ["1-118", ["1-118", "6-065"]],
    ["6-046", ["6-046", "10-001"]],
    ["6-049", ["6-049", "10-002"]],
  ] as const) {
    it(`${ids.join("/")} の公式preferredを保持する`, () => {
      const item = group(preferred);
      expect(item.members[0].target.entryId).toBe(preferred);
      expect(item.members.map((member: any) => member.target.entryId).sort()).toEqual(
        [...ids].sort(),
      );
    });
  }

  it("CSV由来の名称差を保持する", () => {
    expect(group("1-113").members.map((m: any) => m.target.name)).toEqual([
      "常盤橋御門",
      "常磐橋御門",
    ]);
    expect(group("1-118").members.map((m: any) => m.target.name)).toEqual([
      "一橋御門",
      "一ツ橋御門",
    ]);
  });

  it("自己参照2件をgroup化せず保持する", () => {
    expect(committed.sourceAnomalies.map((item: any) => item.target.entryId)).toEqual([
      "20-358",
      "20-369",
    ]);
    expect(
      committed.groups.flatMap((item: any) =>
        item.members.map((member: any) => member.target.entryId),
      ),
    ).not.toContain("20-358");
  });

  it("妙典寺と妙伝寺をgroup化しない", () => {
    expect(
      committed.groups.some((item: any) => {
        const ids = item.members.map((member: any) => member.target.entryId);
        return ids.includes("12-182") && ids.includes("24-133");
      }),
    ).toBe(false);
  });

  it("既存fingerprint関数と一致する", () => {
    const target = group("1-001").members[0].target;
    expect(target.sourceFeatureSha256).toBe(
      calculateEdoSourceFeatureSha256(source.features[target.sourceIndex]),
    );
  });

  it("小規模fixtureからbyte-identicalに生成する", () => {
    const fixture = synthetic();
    const first = generateEdoPlaceSourceIdentityCatalog(
      fixture.bytes,
      fixture.geojson,
      fixture.options,
    );
    const second = generateEdoPlaceSourceIdentityCatalog(
      fixture.bytes,
      fixture.geojson,
      fixture.options,
    );
    expect(JSON.stringify(first, null, 2)).toBe(JSON.stringify(second, null, 2));
  });

  it("CSV parserはquoted fieldを処理する", () => {
    const fixture = synthetic();
    expect(parseEdoSourceIdentityCsv(fixture.bytes.toString("utf8"))).toHaveLength(3);
  });

  for (const [name, mutate] of [
    ["unknown top key", (v: any) => { v.extra = true; }],
    ["wrong schema", (v: any) => { v.schemaVersion = 2; }],
    ["wrong status", (v: any) => { v.catalogStatus = "active"; }],
    ["wrong source SHA", (v: any) => { v.sourceDataSha256 = "0".repeat(64); }],
    ["wrong CSV SHA", (v: any) => { v.sourceCsv.sha256 = "0".repeat(64); }],
    ["wrong CSV byte length", (v: any) => { v.sourceCsv.byteLength++; }],
    ["duplicate group ID", (v: any) => { v.groups[1].groupId = v.groups[0].groupId; }],
    ["duplicate preferred entry", (v: any) => { v.groups[1].preferredEntryId = v.groups[0].preferredEntryId; v.groups[1].groupId = v.groups[0].groupId; }],
    ["duplicate codh preferred ID", (v: any) => { v.groups[1].codhPreferredId = v.groups[0].codhPreferredId; }],
    ["duplicate member", (v: any) => { v.groups[0].members.push(clone(v.groups[0].members[1])); }],
    ["preferred 0", (v: any) => { v.groups[0].members[0].role = "nonpreferred"; }],
    ["preferred 2", (v: any) => { v.groups[0].members[1].role = "preferred"; }],
    ["preferred not first", (v: any) => { v.groups[0].members.reverse(); }],
    ["nonpreferred 0", (v: any) => { v.groups[0].members = [v.groups[0].members[0]]; }],
    ["declared preferred mismatch", (v: any) => { v.groups[0].members[1].declaredPreferredEntryId = "9-999"; }],
    ["target sourceIndex mismatch", (v: any) => { v.groups[0].members[0].target.sourceIndex++; }],
    ["target entry ID mismatch", (v: any) => { v.groups[0].members[0].target.entryId = "9-999"; }],
    ["snapshot mismatch", (v: any) => { v.groups[0].members[0].target.name = "差分"; }],
    ["fingerprint mismatch", (v: any) => { v.groups[0].members[0].target.sourceFeatureSha256 = "0".repeat(64); }],
    ["coordinate mismatch", (v: any) => { v.groups[0].members[1].target.longitude += 0.1; }],
    ["source URL mismatch", (v: any) => { v.groups[0].members[0].target.sourceUrl = "https://example.com/"; }],
    ["anomaly missing", (v: any) => { v.sourceAnomalies.pop(); }],
    ["anomaly extra", (v: any) => { v.sourceAnomalies.push(clone(v.sourceAnomalies[0])); }],
    ["anomaly target mismatch", (v: any) => { v.sourceAnomalies[0].target.name = "差分"; }],
    ["anomaly preferred ID mismatch", (v: any) => { v.sourceAnomalies[0].declaredPreferredId = "Ab12Cd"; }],
    ["self-reference in group", (v: any) => { v.groups[0].members.push({ role: "nonpreferred", declaredPreferredId: v.groups[0].codhPreferredId, declaredPreferredEntryId: v.groups[0].preferredEntryId, target: clone(v.sourceAnomalies[0].target) }); }],
    ["prohibited coordinate pair", (v: any) => {
      const targets = ["12-182", "24-133"].map((id) => {
        const index = source.features.findIndex((f: any) => f.properties.id === id);
        const f = source.features[index];
        return { sourceIndex: index, entryId: id, sourceFeatureSha256: calculateEdoSourceFeatureSha256(f), name: f.properties.name, category: f.properties.category, sheet: f.properties.sheet, sourceUrl: f.properties.source, longitude: f.geometry.coordinates[0], latitude: f.geometry.coordinates[1] };
      });
      v.groups[0].preferredEntryId = "12-182"; v.groups[0].groupId = "codh-preferred-entry-12-182";
      v.groups[0].members[0].target = targets[0]; v.groups[0].members[1].target = targets[1];
      v.groups[0].members[1].declaredPreferredEntryId = "12-182";
    }],
    ["unsafe text", (v: any) => { v.groups[0].members[0].target.name = "<script>"; }],
  ] as const) {
    it(`negative: ${name}`, () => invalid(mutate));
  }

  it("wrong CSV SHAを拒否する", () => {
    const fixture = synthetic();
    expect(() =>
      generateEdoPlaceSourceIdentityCatalog(fixture.bytes, fixture.geojson, {
        ...fixture.options,
        csvSha256: "0".repeat(64),
      }),
    ).toThrow(/SHA-256/);
  });

  it("wrong CSV byte lengthを拒否する", () => {
    const fixture = synthetic();
    expect(() =>
      generateEdoPlaceSourceIdentityCatalog(fixture.bytes, fixture.geojson, {
        ...fixture.options,
        csvByteLength: fixture.bytes.length + 1,
      }),
    ).toThrow(/byte length/);
  });

  it("wrong headerを拒否する", () => {
    const fixture = synthetic();
    expect(() =>
      parseEdoSourceIdentityCsv(
        fixture.bytes.toString("utf8").replace("entry_id", "wrong"),
      ),
    ).toThrow(/header/);
  });

  for (const [name, mutate, pattern] of [
    ["duplicate CSV ID", (text: string) => text.replace('"2-001"', '"1-001"'), /duplicate CSV/],
    ["missing GeoJSON entry", (_: string, geo: any) => { geo.features.pop(); }, /counts differ/],
    ["extra GeoJSON entry", (_: string, geo: any) => { geo.features.push(clone(geo.features[0])); geo.features.at(-1).properties.id = "9-999"; }, /counts differ/],
    ["dangling preferred", (text: string) => text.replace('"1-001"\n', '"9-999"\n'), /dangling/],
    ["preferred chain", (text: string) => text.replace(',"",""\n"2-001"', ',"Ij56Kl","2-001"\n"2-001"'), /chain/],
  ] as const) {
    it(`negative build: ${name}`, () => {
      const fixture = synthetic();
      const geo = clone(fixture.geojson);
      let text = fixture.bytes.toString("utf8");
      const result = mutate(text, geo);
      if (typeof result === "string") text = result;
      const bytes = Buffer.from(text);
      expect(() =>
        generateEdoPlaceSourceIdentityCatalog(bytes, geo, {
          ...fixture.options,
          csvSha256: createHash("sha256").update(bytes).digest("hex"),
          csvByteLength: bytes.length,
          featureCount: fixture.options.featureCount,
        }),
      ).toThrow(pattern);
    });
  }

  it("public/dist leakageを実際のleakage auditで拒否する", () => {
    const root = join(__dirname, "fixtures", "edo-source-identity-leakage");
    expect(auditEdoPlaceSourceIdentityLeakage(root)).not.toEqual([]);
  });
});
