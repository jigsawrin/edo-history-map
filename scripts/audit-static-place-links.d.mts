export interface StaticPlaceAuditResult {
  readonly htmlFileCount: number;
  readonly edoCount: number;
  readonly kyotoCount: number;
  readonly shigaCount: number;
  readonly manifestSha256: string;
}

export function auditStaticPlaceLinks(
  root?: string,
  dist?: string,
): StaticPlaceAuditResult;
