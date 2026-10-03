/**
 * Utilitas tanggal rental.
 */

/** Tanggal selesai dihitung otomatis dari tanggal mulai + jangka waktu (hari). */
export function computeEndDate(startDate: string, days: number): string {
  if (!startDate || !days || days <= 0) return ''
  const d = new Date(startDate)
  if (isNaN(d.getTime())) return ''
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Jumlah hari antara dua tanggal (selisih; min 1). */
export function daysBetween(startDate: string, endDate: string): number {
  if (!startDate || !endDate) return 0
  const a = new Date(startDate)
  const b = new Date(endDate)
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000)
  return diff > 0 ? diff : 1
}
