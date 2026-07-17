export const STATIC_EDO_PER_PAGE: number;
export const STATIC_GENERATOR_VERSION: number;
export const EXPECTED_DATA_SHA256: Readonly<Record<string, string>>;

export function sha256(value: string | Uint8Array): string;
export function escapeHtml(value: unknown): string;
export function validateExternalSourceUrl(
  value: unknown,
  allowedOrigins: ReadonlySet<string>,
): string;
export function parseStaticEdoPlaces(raw: string): readonly Readonly<{
  key: string;
  anchor: string;
  entryId: string;
  name: string;
  category: string;
  sheet: string;
  sourceUrl: string;
  sourceIndex: number;
}>[];
export function parseStaticKyotoPlaces(
  raw: string,
  sourceRegistry: ReadonlyMap<string, unknown>,
  presentation: Record<string, unknown>,
): readonly Readonly<Record<string, unknown>>[];

export interface StaticPlaceGeneration {
  readonly files: ReadonlyMap<string, string>;
  readonly manifest: {
    readonly schemaVersion: number;
    readonly generatorVersion: number;
    readonly inputGeoJsonSha256: Readonly<Record<string, string>>;
    readonly edo: {
      readonly placeCount: number;
      readonly pageCount: number;
      readonly perPage: number;
      readonly finalPageCount: number;
    };
    readonly kyoto: { readonly placeCount: number; readonly pageCount: number };
    readonly files: Readonly<Record<string, string>>;
  };
  readonly edoPlaces: readonly Readonly<Record<string, unknown>>[];
  readonly kyotoPlaces: readonly Readonly<Record<string, unknown>>[];
}

export function generateStaticPlaceFiles(options: {
  edoRaw: string;
  kyotoRaw: string;
  sourceData: unknown;
  presentation: Record<string, unknown>;
  css: string;
  inputSha256: Readonly<Record<string, string>>;
}): StaticPlaceGeneration;
export function buildStaticPlacePages(
  root?: string,
  outputRoot?: string,
): StaticPlaceGeneration;
