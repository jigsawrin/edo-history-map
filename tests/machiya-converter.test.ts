import { describe, expect, it } from "vitest";
import {
  convertMachiyaShapefile,
  sanitizeSourceText,
} from "../scripts/convert-machiya-areas.mjs";

type Position = [number, number];
type Ring = Position[];

const PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

const OUTER: Ring = [
  [139.7, 35.68],
  [139.7, 35.69],
  [139.71, 35.69],
  [139.71, 35.68],
  [139.7, 35.68],
];
const SECOND_OUTER: Ring = [
  [139.72, 35.7],
  [139.72, 35.71],
  [139.73, 35.71],
  [139.73, 35.7],
  [139.72, 35.7],
];
const HOLE: Ring = [
  [139.702, 35.682],
  [139.706, 35.682],
  [139.706, 35.686],
  [139.702, 35.686],
  [139.702, 35.682],
];

function makeShp(records: Ring[][]): Buffer {
  const recordBuffers = records.map((rings, index) => {
    const points = rings.flat();
    const body = Buffer.alloc(44 + rings.length * 4 + points.length * 16);
    body.writeInt32LE(5, 0);
    const lons = points.map(([lon]) => lon);
    const lats = points.map(([, lat]) => lat);
    body.writeDoubleLE(Math.min(...lons), 4);
    body.writeDoubleLE(Math.min(...lats), 12);
    body.writeDoubleLE(Math.max(...lons), 20);
    body.writeDoubleLE(Math.max(...lats), 28);
    body.writeInt32LE(rings.length, 36);
    body.writeInt32LE(points.length, 40);
    let pointIndex = 0;
    rings.forEach((ring, ringIndex) => {
      body.writeInt32LE(pointIndex, 44 + ringIndex * 4);
      pointIndex += ring.length;
    });
    const pointsOffset = 44 + rings.length * 4;
    points.forEach(([lon, lat], pointOffset) => {
      body.writeDoubleLE(lon, pointsOffset + pointOffset * 16);
      body.writeDoubleLE(lat, pointsOffset + pointOffset * 16 + 8);
    });
    const record = Buffer.alloc(8 + body.length);
    record.writeInt32BE(index + 1, 0);
    record.writeInt32BE(body.length / 2, 4);
    body.copy(record, 8);
    return record;
  });
  const allPoints = records.flat(2) as Position[];
  const shp = Buffer.alloc(100 + recordBuffers.reduce((sum, record) => sum + record.length, 0));
  shp.writeInt32BE(9994, 0);
  shp.writeInt32BE(shp.length / 2, 24);
  shp.writeInt32LE(1000, 28);
  shp.writeInt32LE(5, 32);
  shp.writeDoubleLE(Math.min(...allPoints.map(([lon]) => lon)), 36);
  shp.writeDoubleLE(Math.min(...allPoints.map(([, lat]) => lat)), 44);
  shp.writeDoubleLE(Math.max(...allPoints.map(([lon]) => lon)), 52);
  shp.writeDoubleLE(Math.max(...allPoints.map(([, lat]) => lat)), 60);
  let offset = 100;
  for (const record of recordBuffers) {
    record.copy(shp, offset);
    offset += record.length;
  }
  return shp;
}

function makeDbf(rows: Array<{ fid: string; map: string }>): Buffer {
  const fields = [
    { name: "fid", type: "N", length: 10 },
    { name: "map", type: "C", length: 100 },
  ];
  const headerLength = 32 + fields.length * 32 + 1;
  const recordLength = 1 + fields.reduce((sum, field) => sum + field.length, 0);
  const dbf = Buffer.alloc(headerLength + rows.length * recordLength + 1, 0x20);
  dbf[0] = 0x03;
  dbf.writeUInt32LE(rows.length, 4);
  dbf.writeUInt16LE(headerLength, 8);
  dbf.writeUInt16LE(recordLength, 10);
  fields.forEach((field, index) => {
    const offset = 32 + index * 32;
    dbf.fill(0, offset, offset + 11);
    dbf.write(field.name, offset, "ascii");
    dbf[offset + 11] = field.type.charCodeAt(0);
    dbf[offset + 16] = field.length;
  });
  dbf[headerLength - 1] = 0x0d;
  rows.forEach((row, rowIndex) => {
    let offset = headerLength + rowIndex * recordLength;
    dbf[offset] = 0x20;
    offset++;
    Buffer.from(row.fid.padStart(10), "utf8").copy(dbf, offset, 0, 10);
    offset += 10;
    Buffer.from(row.map, "utf8").copy(dbf, offset, 0, 100);
  });
  dbf[dbf.length - 1] = 0x1a;
  return dbf;
}

function convert(records: Ring[][], rows?: Array<{ fid: string; map: string }>) {
  return convertMachiyaShapefile({
    shp: makeShp(records),
    dbf: makeDbf(
      rows ?? records.map((_, index) => ({ fid: String(index + 1), map: `自作fixture-${index + 1}` })),
    ),
    prj: PRJ,
    cpg: "UTF-8",
  });
}

describe("町家領域Shapefile変換", () => {
  it("小さな自作fixtureからPolygonとMultiPolygonを属性限定で生成する", () => {
    const result = convert([[OUTER], [OUTER, HOLE, SECOND_OUTER]]);
    expect(result.collection.features).toHaveLength(2);
    expect(result.collection.features[0]?.geometry.type).toBe("Polygon");
    expect(result.collection.features[1]?.geometry.type).toBe("MultiPolygon");
    expect(result.collection.features[0]?.properties).toEqual({
      id: "machiya-01",
      sourceSheetId: "1",
      sourceSheetName: "自作fixture-1",
      category: "machiya-area",
      eraId: "edo-late",
      positionConfidence: "estimated",
      sourceId: "codh-edo-machiya-areas",
    });
    const firstCoordinate = (
      result.collection.features[0]?.geometry.coordinates as number[][][]
    )[0]?.[0];
    expect(firstCoordinate).toEqual([139.7, 35.68]);
  });

  it("同じ入力から同じGeoJSONとSHA-256を生成する", () => {
    const first = convert([[OUTER], [SECOND_OUTER]]);
    const second = convert([[OUTER], [SECOND_OUTER]]);
    expect(first.text).toBe(second.text);
    expect(first.stats.outputSha256).toBe(second.stats.outputSha256);
  });

  it("制御文字を除去し文字列長を制限する", () => {
    expect(sanitizeSourceText("町\u0000家\u007f領域")).toBe("町家領域");
    expect(sanitizeSourceText("x".repeat(200))).toHaveLength(100);
  });

  it("対象bounds外Featureを警告付きで除外する", () => {
    const outside = OUTER.map(([lon, lat]) => [lon - 1, lat] as Position);
    const result = convert([[OUTER], [outside]]);
    expect(result.collection.features).toHaveLength(1);
    expect(result.stats.excluded).toBe(1);
    expect(result.stats.warnings.join(" ")).toContain("bounds外");
  });

  it("不正座標、Point型、空geometryを拒否する", () => {
    const badCoordinate = OUTER.map((point) => [...point] as Position);
    badCoordinate[1] = [200, 35.69];
    expect(() => convert([[badCoordinate]])).toThrow("世界座標範囲外");

    const pointShp = makeShp([[OUTER]]);
    pointShp.writeInt32LE(1, 32);
    expect(() =>
      convertMachiyaShapefile({
        shp: pointShp,
        dbf: makeDbf([{ fid: "1", map: "fixture" }]),
        prj: PRJ,
        cpg: "UTF-8",
      }),
    ).toThrow("Polygon以外");

    const emptyShp = makeShp([[OUTER]]);
    emptyShp.writeInt32LE(0, 100 + 8 + 36);
    expect(() =>
      convertMachiyaShapefile({
        shp: emptyShp,
        dbf: makeDbf([{ fid: "1", map: "fixture" }]),
        prj: PRJ,
        cpg: "UTF-8",
      }),
    ).toThrow("part数");
  });

  it("閉じていないringと未確認CRSを拒否する", () => {
    const open = OUTER.slice(0, -1);
    open.push([139.701, 35.681]);
    expect(() => convert([[open]])).toThrow("ringが閉じていません");
    expect(() =>
      convertMachiyaShapefile({
        shp: makeShp([[OUTER]]),
        dbf: makeDbf([{ fid: "1", map: "fixture" }]),
        prj: 'GEOGCS["UNKNOWN"]',
        cpg: "UTF-8",
      }),
    ).toThrow("座標参照系");
  });
});
