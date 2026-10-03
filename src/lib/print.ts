/**
 * Print helpers — semua dokumen di ERP ini dicetak lewat browser (window.print)
 * dengan layout khusus print (.print-area). Ini menghasilkan hard copy langsung
 * dan soft copy via "Save as PDF" tanpa dependency tambahan.
 */

export type PrintCompany = {
  name: string
  address?: string | null
  phone?: string | null
}

export const DEFAULT_COMPANY: PrintCompany = {
  name: 'Astadeca Baswara Persada',
  address: 'Cold Storage & Operasional',
  phone: null,
}

/**
 * Cetak elemen berdasarkan id. Menyembunyikan seluruh UI lain lewat class
 * `printing` pada <body>, lalu memanggil window.print().
 */
export function printElement(elementId: string, documentTitle?: string): void {
  if (typeof window === 'undefined') return

  const el = document.getElementById(elementId)
  if (!el) {
    window.print()
    return
  }

  const previousTitle = document.title
  if (documentTitle) document.title = documentTitle

  document.body.classList.add('printing')
  el.classList.add('print-target')

  const cleanup = () => {
    document.body.classList.remove('printing')
    el.classList.remove('print-target')
    document.title = previousTitle
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  // Fallback bila afterprint tidak dipanggil (beberapa browser)
  window.setTimeout(cleanup, 2000)
  window.print()
}
