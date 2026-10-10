/**
 * Format a number with thousands separator
 */
export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '0'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return '0'
  return num.toLocaleString('id-ID')
}

/**
 * Format a weight value in kg
 */
export function formatKg(value: number | string | null | undefined): string {
  return `${formatNumber(value)} kg`
}

/**
 * Format a date string to Indonesian locale
 */
export function formatDate(
  value: string | Date | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!value) return '-'
  const date = typeof value === 'string' ? new Date(value) : value
  if (isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  })
}

/**
 * Format a currency value in IDR
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = 'IDR'
): string {
  if (value === null || value === undefined) return `${currency} 0`
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return `${currency} 0`
  return `${currency} ${formatNumber(num)}`
}

/**
 * Parse angka dari input form. Mengembalikan fallback bila kosong/non-numerik.
 * Dipakai supaya NaN tidak pernah masuk ke DB.
 */
export function parseNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value !== 'string') return fallback
  const n = parseFloat(value.trim())
  return Number.isFinite(n) ? n : fallback
}

/**
 * Parse angka wajib > 0. null bila tidak valid.
 */
export function parsePositive(value: unknown): number | null {
  const n = parseNum(value, NaN)
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Get Tailwind CSS tone class based on status keyword
 */
export function getBadgeTone(status: string): string {
  const s = (status ?? '').toLowerCase().replace(/_/g, ' ')
  if (['active', 'available', 'approved', 'converted', 'good', 'released', 'printed'].includes(s))
    return 'bg-success/10 text-success'
  if (['pending', 'pending approval', 'draft', 'quarantine', 'reserved'].includes(s))
    return 'bg-warning/10 text-warning'
  if (['rejected', 'cancelled', 'canceled', 'damaged', 'danger'].includes(s))
    return 'bg-danger/10 text-danger'
  if (['inactive', 'used', 'expired'].includes(s))
    return 'bg-slate-100 text-slate-500'
  return 'bg-primary/10 text-primary'
}
