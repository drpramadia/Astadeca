/**
 * Pemetaan notifikasi -> tujuan navigasi saat diklik.
 * Aturannya: notifikasi dokumen membuka dokumen/approval terkait,
 * bukan sekadar daftar notifikasi.
 */
export function notificationHref(
  referenceType: string | null,
  referenceId: string | null,
  opts: { canApprove?: boolean } = {}
): string {
  if (!referenceType) return '/notifications'

  switch (referenceType) {
    // Persetujuan: buka halaman detail approval (isi dokumen + approve/reject)
    case 'APPROVAL':
      return referenceId && opts.canApprove ? `/approval/requests/${referenceId}` : '/approval/requests'

    // Surat jalan terbit -> halaman surat jalan (bisa cetak)
    case 'DELIVERY_ORDER':
      return '/operational/delivery-orders'

    // Permintaan keluar barang (warehouse) -> halaman surat jalan (tab permintaan)
    case 'DELIVERY_REQUEST':
      return '/operational/delivery-orders'

    // Dokumen transaksi lain -> halaman detail terkait
    case 'PURCHASE_ORDER':
      return referenceId ? `/operational/purchase-orders/${referenceId}` : '/operational/purchase-orders'
    case 'SALES_ORDER':
      return referenceId ? `/operational/sales-orders/${referenceId}` : '/operational/sales-orders'
    case 'CONTRACT':
      return referenceId ? `/cold-storage/contracts/${referenceId}` : '/cold-storage/contracts'
    case 'RENTAL_INQUIRY':
      return '/cold-storage/inquiries'
    case 'RENTAL_RELEASE':
      return opts.canApprove && referenceId ? `/approval/requests/${referenceId}` : '/cold-storage/contracts'
    case 'RENTAL_BILLING':
      return '/cold-storage/billing'

    default:
      return '/notifications'
  }
}
