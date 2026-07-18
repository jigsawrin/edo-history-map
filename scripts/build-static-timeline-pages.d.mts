export interface StaticTimelineGeneration {
  readonly entries: readonly {
    readonly id: string;
    readonly order: number;
    readonly track: "shiga-sengoku" | "kyoto-bakumatsu";
    readonly type: string;
    readonly titleJa: string;
    readonly relatedThemeIds: readonly string[];
    readonly relatedPlaces: readonly Readonly<Record<string, unknown>>[];
  }[];
  readonly files: ReadonlyMap<string, string>;
  readonly manifest: {
    readonly timeline: {
      readonly entryCount: number;
      readonly htmlPageCount: number;
      readonly placeRelationCount: number;
      readonly themeRelationCount: number;
      readonly relatedThemeCount: number;
      readonly placeBacklinkCount: number;
      readonly themeBacklinkCount: number;
      readonly htmlSha256: string;
      readonly inputCurationSha256: string;
    };
    readonly [key: string]: unknown;
  };
  readonly placeUpdates: Readonly<Record<string, string>>;
  readonly themeUpdates: ReadonlyMap<string, string>;
}

export const TIMELINE_SCHEMA_VERSION: number;
export function sha256(value: string | Uint8Array): string;
export function escapeHtml(value: unknown): string;
export function validateTimelineData(raw: unknown, context: Readonly<Record<string, unknown>>): readonly unknown[];
export function generateStaticTimelineFiles(options: Readonly<Record<string, unknown>>): StaticTimelineGeneration;
export function buildStaticTimelinePages(root?: string): StaticTimelineGeneration;
