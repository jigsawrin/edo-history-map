export interface EdoMapPresentationProjectionBuild {
  schemaVersion: 1;
  sourceDataSha256: string;
  sourceFeatureCount: number;
  relationDataSha256: string;
  excludedExactNames: string[];
  aggregateGroupCount: number;
  aggregateMemberCount: number;
  markerReductionCount: number;
  presentationMarkerCount: number;
  groups: Array<{
    groupId: string;
    memberSourceIndexes: number[];
  }>;
}
export function buildEdoMapPresentationProjection(sourceText: string, relationText: string): EdoMapPresentationProjectionBuild;
export function auditEdoMapPresentationProjection(projection: EdoMapPresentationProjectionBuild): EdoMapPresentationProjectionBuild;
