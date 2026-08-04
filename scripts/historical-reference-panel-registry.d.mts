export interface HistoricalReferencePanelAuditResult {
  readonly errors: readonly string[];
  readonly registry: { readonly entries: readonly unknown[] } | null;
}
export const FILE: string;
export function auditHistoricalReferencePanelRegistry(root: string): HistoricalReferencePanelAuditResult;
