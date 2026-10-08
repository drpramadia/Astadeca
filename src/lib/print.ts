/**
 * Print helpers — semua dokumen di ERP ini dicetak lewat browser (window.print)
 * dengan layout khusus print (.print-area). Ini menghasilkan hard copy langsung
 * dan soft copy via "Save as PDF" tanpa dependency tambahan.
 */

export type PrintCompany = {
  name: string
  address?: string | null
  phone?: string | null
  logo?: string | null
}

export const DEFAULT_COMPANY: PrintCompany = {
  name: 'Astadeca Baswara Persada',
  address: 'Jl. Martanegara No.3, Lkr. Sel., Kec. Lengkong, Kota Bandung, Jawa Barat 40263',
  phone: null,
  logo: '/logo/astadeca.png',
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

  // Tandai seluruh ancestor sampai <body> agar CSS print bisa menampilkan
  // kembali jalur menuju elemen cetak (mengatasi blank saat cetak karena
  // parent-nya ikut disembunyikan).
  const ancestors: HTMLElement[] = []
  let node: HTMLElement | null = el.parentElement
  while (node && node !== document.body) {
    node.classList.add('print-target-ancestor')
    ancestors.push(node)
    node = node.parentElement
  }

  // Sembunyikan semua SAUDARA di sepanjang jalur agar hanya dokumen yang
  // tercetak (sidebar, header, tombol, dan konten web lain tidak ikut).
  const hiddenSiblings: HTMLElement[] = []
  let child: HTMLElement = el
  node = el.parentElement
  while (node && node !== document.body) {
    Array.from(node.children).forEach((c) => {
      if (c !== child && c instanceof HTMLElement) {
        c.classList.add('print-hide')
        hiddenSiblings.push(c)
      }
    })
    child = node
    node = node.parentElement
  }

  let timer: number | undefined
  const cleanup = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timer = undefined
    }
    document.body.classList.remove('printing')
    el.classList.remove('print-target')
    ancestors.forEach((a) => a.classList.remove('print-target-ancestor'))
    hiddenSiblings.forEach((s) => s.classList.remove('print-hide'))
    document.title = previousTitle
    window.removeEventListener('afterprint', cleanup)
  }

  window.addEventListener('afterprint', cleanup)
  // Fallback bila afterprint tidak dipanggil (beberapa browser)
  timer = window.setTimeout(cleanup, 2000)
  window.print()
}
