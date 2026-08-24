export type ComplianceDecision = 'UYGUN' | 'KOSULLU' | 'BLOKE';
export type ComplianceSeverity = 'required' | 'conditional' | 'warning';

export interface ComplianceCheck {
  code: string;
  label: string;
  severity: ComplianceSeverity;
  passed: boolean | null;
  legalSource?: string | null;
  expiresAt?: string | null;
  note?: string | null;
}

export interface ComplianceResult {
  decision: ComplianceDecision;
  blocking: ComplianceCheck[];
  conditional: ComplianceCheck[];
  warnings: ComplianceCheck[];
  passed: ComplianceCheck[];
  evaluatedAt: string;
}

/**
 * Central transport compliance evaluator.
 *
 * Legal thresholds are deliberately NOT hard-coded here. The caller supplies
 * checks resolved from the versioned legal-rule/tenant-parameter layer so a
 * regulation, annual DHGM specification or local UKOME/MEM rule can change
 * without rewriting the decision engine.
 *
 * null = not yet verified / evidence missing.
 * - required + false/null => BLOKE
 * - conditional + false/null => KOSULLU (unless already BLOKE)
 * - warning + false/null => warning only
 */
export function evaluateTransportCompliance(
  checks: ComplianceCheck[],
  evaluatedAt = new Date().toISOString(),
): ComplianceResult {
  const blocking: ComplianceCheck[] = [];
  const conditional: ComplianceCheck[] = [];
  const warnings: ComplianceCheck[] = [];
  const passed: ComplianceCheck[] = [];

  for (const check of checks) {
    if (check.passed === true) {
      passed.push(check);
      continue;
    }

    if (check.severity === 'required') blocking.push(check);
    else if (check.severity === 'conditional') conditional.push(check);
    else warnings.push(check);
  }

  const decision: ComplianceDecision = blocking.length
    ? 'BLOKE'
    : conditional.length
      ? 'KOSULLU'
      : 'UYGUN';

  return { decision, blocking, conditional, warnings, passed, evaluatedAt };
}

export function canStartTransportTrip(result: ComplianceResult): boolean {
  return result.decision !== 'BLOKE';
}

export function hasExpired(expiresAt: string | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const expiry = new Date(expiresAt);
  return Number.isNaN(expiry.getTime()) || expiry.getTime() < now.getTime();
}

export function daysUntilExpiry(expiresAt: string | null | undefined, now = new Date()): number | null {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - now.getTime()) / 86_400_000);
}
