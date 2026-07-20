/**
 * 금액 포맷 유틸리티
 * - fmtKRW : 원화 금액  →  0,000.00 (소수 2자리)
 * - fmtUSD : 달러 금액  →  0,000.00 (소수 2자리)
 * - fmtAmt : 통화 기호 없이 숫자만  →  0,000.00
 */

/** 원화 금액: ₩1,234,567.00 */
export function fmtKRW(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return '₩0.00';
  return '₩' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 달러 금액: $1,234.00 */
export function fmtUSD(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return '$0.00';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 기호 없이 숫자만: 1,234,567.00 */
export function fmtAmt(value: number | string | null | undefined, decimals = 2): string {
  const n = Number(value ?? 0);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
