import projectionJson from "../scripts/historical-place-description-public-projection.json";

const DATASET_ID = "codh-edo-maps-places";
const SOURCE_DATA_SHA256 = "7ad162a348c45379c5fcd894bd185935d473aae1ad494d03c9a850ad3d994dd4";
const SOURCE_FEATURE_COUNT = 8788;
const SHA256 = /^[0-9a-f]{64}$/u;

export interface HistoricalDescriptionSourceIdentity {
  readonly datasetId: typeof DATASET_ID;
  readonly sourceIndex: number;
  readonly entryId: string;
  readonly sourceFeatureSha256: string;
}

export interface PublicHistoricalDescriptionSource {
  readonly sourceId: string;
  readonly title: string;
  readonly provider: string;
  readonly sourceUrl: string;
  readonly attribution: {
    readonly requiredText: string;
    readonly licenseNotice: string;
    readonly modificationNotice: string;
  };
}

export interface PublicHistoricalDescription {
  readonly descriptionId: string;
  readonly sourceIdentity: HistoricalDescriptionSourceIdentity;
  readonly locale: "ja";
  readonly compositionMode: "editorial-summary";
  readonly text: string;
  readonly canonicalContentSha256: string;
  readonly epistemicSegments: readonly {
    readonly epistemicStatus: "historical-fact" | "inference" | "tradition";
    readonly text: string;
  }[];
  readonly sources: readonly PublicHistoricalDescriptionSource[];
  readonly translations: readonly unknown[];
}

interface PublicProjection {
  readonly schemaVersion: 1;
  readonly projectionStatus: "non-runtime-foundation";
  readonly sourceDataSha256: string;
  readonly sourceFeatureCount: number;
  readonly approvedDescriptionCount: number;
  readonly descriptions: readonly PublicHistoricalDescription[];
}

function identityKey(identity: HistoricalDescriptionSourceIdentity): string {
  return [identity.datasetId, identity.sourceIndex, identity.entryId, identity.sourceFeatureSha256]
    .join("\u0000");
}

function validateProjection(value: unknown): PublicProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Historical description public projection is invalid");
  }
  const projection = value as PublicProjection;
  if (
    projection.schemaVersion !== 1 ||
    projection.projectionStatus !== "non-runtime-foundation" ||
    projection.sourceDataSha256 !== SOURCE_DATA_SHA256 ||
    projection.sourceFeatureCount !== SOURCE_FEATURE_COUNT ||
    !Array.isArray(projection.descriptions) ||
    projection.approvedDescriptionCount !== projection.descriptions.length
  ) {
    throw new Error("Historical description public projection is stale or invalid");
  }
  const keys = new Set<string>();
  for (const description of projection.descriptions) {
    const identity = description?.sourceIdentity;
    if (
      !identity || identity.datasetId !== DATASET_ID ||
      !Number.isInteger(identity.sourceIndex) || identity.sourceIndex < 0 ||
      identity.sourceIndex >= SOURCE_FEATURE_COUNT ||
      typeof identity.entryId !== "string" || identity.entryId.length === 0 ||
      !SHA256.test(identity.sourceFeatureSha256) ||
      description.locale !== "ja" ||
      description.compositionMode !== "editorial-summary" ||
      typeof description.text !== "string" || description.text.length === 0 ||
      !SHA256.test(description.canonicalContentSha256) ||
      !Array.isArray(description.sources) || description.sources.length === 0
    ) {
      throw new Error("Historical description public entry is invalid");
    }
    const key = identityKey(identity);
    if (keys.has(key)) throw new Error("Historical description public identity is duplicated");
    keys.add(key);
    for (const source of description.sources) {
      let url: URL;
      try {
        url = new URL(source.sourceUrl);
      } catch {
        throw new Error("Historical description public source URL is invalid");
      }
      if (
        url.protocol !== "https:" || url.origin !== "https://www.ndl.go.jp" ||
        !url.pathname.startsWith("/landmarks/") ||
        typeof source.attribution?.requiredText !== "string" ||
        typeof source.attribution?.licenseNotice !== "string" ||
        typeof source.attribution?.modificationNotice !== "string"
      ) {
        throw new Error("Historical description public source is invalid");
      }
    }
  }
  return projection;
}

export function createHistoricalDescriptionResolver(value: unknown): {
  readonly resolve: (identity: HistoricalDescriptionSourceIdentity) => PublicHistoricalDescription | null;
  readonly identityForEdoSource: (sourceIndex: number, entryId: string) => HistoricalDescriptionSourceIdentity | null;
} {
  const projection = validateProjection(value);
  const byIdentity = new Map(
    projection.descriptions.map((description) => [identityKey(description.sourceIdentity), description]),
  );
  const identitiesBySource = new Map(
    projection.descriptions.map((description) => [
      `${description.sourceIdentity.sourceIndex}\u0000${description.sourceIdentity.entryId}`,
      description.sourceIdentity,
    ]),
  );
  return Object.freeze({
    resolve(identity) {
      return byIdentity.get(identityKey(identity)) ?? null;
    },
    identityForEdoSource(sourceIndex, entryId) {
      return identitiesBySource.get(`${sourceIndex}\u0000${entryId}`) ?? null;
    },
  });
}

const resolver = createHistoricalDescriptionResolver(projectionJson);

export function resolveHistoricalDescription(
  identity: HistoricalDescriptionSourceIdentity,
): PublicHistoricalDescription | null {
  return resolver.resolve(identity);
}

export function resolveEdoHistoricalDescription(
  sourceIndex: number,
  entryId: string,
): PublicHistoricalDescription | null {
  const identity = resolver.identityForEdoSource(sourceIndex, entryId);
  return identity ? resolver.resolve(identity) : null;
}
