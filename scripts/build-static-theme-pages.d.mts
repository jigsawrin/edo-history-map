export const THEME_SCHEMA_VERSION: number;
export const THEME_TYPES: readonly string[];
export const RELATION_TYPES: readonly string[];

export interface StaticThemeGeneration {
  readonly themes: readonly Record<string, unknown>[];
  readonly files: ReadonlyMap<string, string>;
  readonly manifest: Record<string, unknown>;
  readonly updatedKyotoHtml: string;
  readonly updatedShigaHtml: string;
}

export function sha256(value: string | Buffer): string;
export function escapeHtml(value: unknown): string;
export function validateHistoricalThemeData(
  themeData: unknown,
  context: Record<string, unknown>,
): readonly Record<string, unknown>[];
export function generateStaticThemeFiles(
  input: Record<string, unknown>,
): StaticThemeGeneration;
export function buildStaticThemePages(root?: string): StaticThemeGeneration;
