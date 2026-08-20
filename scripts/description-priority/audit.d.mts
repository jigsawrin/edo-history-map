/* eslint-disable @typescript-eslint/no-explicit-any */
export function auditDescriptionPriorityPrivateLeakage(root: string): string[];
export function summarizeDescriptionPriorityCatalog(catalog: any): {
  candidateCount: number;
  tierDistribution: Readonly<Record<string, number>>;
  categoryDistribution: Readonly<Record<string, number>>;
  canonicalOutputSha256: string;
};
export function auditDescriptionPriorityRepository(root?: string): {
  errors: string[];
  catalog: any | null;
  summary: ReturnType<typeof summarizeDescriptionPriorityCatalog> | null;
};
