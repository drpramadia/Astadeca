'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase/client'
import { useSession } from '@/hooks/use-session'
import {
  Search,
  FileText,
  Users,
  Boxes,
  Truck,
  ShoppingCart,
  ClipboardCheck,
  Package,
  Loader2,
  Command,
} from 'lucide-react'

type Result = {
  id: string
  label: string
  sublabel?: string
  href: string
  group: string
  icon: React.ElementType
}

type RoleCode = 'SYSTEM_ADMIN' | 'DIRECTOR' | 'ADMIN' | 'WAREHOUSE' | null

/**
 * Global search di header (Opsi A: client-side).
 * Mengambil sejumlah baris terakhir dari entitas utama lalu memfilter di browser.
 * Hasil dibatasi sesuai role. Shortcut: Ctrl/Cmd + K.
 */
export function GlobalSearch() {
  const { roleCode, loaded, organizationId } = useSession()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<Result[]>([])
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const role = roleCode as RoleCode
  const canSeeOps = role === 'ADMIN' || role === 'DIRECTOR' || role === 'SYSTEM_ADMIN'
  const canSeeFinance = role === 'ADMIN' || role === 'DIRECTOR' || role === 'SYSTEM_ADMIN'

  // Shortcut Ctrl/Cmd + K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tutup bila klik di luar
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  // Muat data referensi sekali saat pertama dibuka
  useEffect(() => {
    if (open && items.length === 0 && !loading) loadData()
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function loadData() {
    setLoading(true)
    const out: Result[] = []

    const tasks: Promise<void>[] = []

    // Menu utama (selalu)
    const menu: Result[] = [
      { id: 'm-dash', label: 'Dashboard', href: '/dashboard', group: 'Menu', icon: FileText },
      { id: 'm-cs', label: 'Kontrak Rental', href: '/cold-storage/contracts', group: 'Menu', icon: FileText },
      { id: 'm-spot', label: 'Titipan Harian', href: '/cold-storage/spot', group: 'Menu', icon: Package },
      { id: 'm-bill', label: 'Billing', href: '/cold-storage/billing', group: 'Menu', icon: FileText },
      { id: 'm-inv', label: 'Inventory', href: '/warehouse/inventory', group: 'Menu', icon: Boxes },
      { id: 'm-basket', label: 'Keranjang & Lokasi', href: '/warehouse/baskets', group: 'Menu', icon: Package },
      { id: 'm-gr', label: 'Penerimaan Barang', href: '/warehouse/goods-receipts', group: 'Menu', icon: Package },
      { id: 'm-qc', label: 'QC Inspection', href: '/warehouse/qc', group: 'Menu', icon: ClipboardCheck },
      { id: 'm-docs', label: 'Dokumen', href: '/documents', group: 'Menu', icon: FileText },
    ]

    if (canSeeOps) {
      menu.push(
        { id: 'm-po', label: 'Purchase Order', href: '/operational/purchase-orders', group: 'Menu', icon: ShoppingCart },
        { id: 'm-so', label: 'Sales Order', href: '/operational/sales-orders', group: 'Menu', icon: FileText },
        { id: 'm-do', label: 'Surat Jalan', href: '/operational/delivery-orders', group: 'Menu', icon: Truck },
      )
    }
    if (canSeeFinance) {
      menu.push(
        { id: 'm-trx', label: 'Transaksi', href: '/finance/transactions', group: 'Menu', icon: FileText },
        { id: 'm-pay', label: 'Payments', href: '/finance/payments', group: 'Menu', icon: FileText },
      )
    }
    out.push(...menu)

    tasks.push(
      (async () => {
        const { data } = await supabase
          .from('rental_contracts')
          .select('id, contract_number, rental_customers(name)')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50)
        for (const r of (data as unknown as { id: string; contract_number: string; rental_customers: { name: string } | null }[]) || []) {
          out.push({ id: `rc-${r.id}`, label: r.contract_number, sublabel: r.rental_customers?.name ?? '', href: `/cold-storage/contracts/${r.id}`, group: 'Kontrak', icon: FileText })
        }
      })(),
      (async () => {
        const { data } = await supabase
          .from('rental_billing')
          .select('id, invoice_number, total_amount')
          .eq('organization_id', organizationId)
          .order('created_at', { ascending: false })
          .limit(50)
        for (const r of (data as unknown as { id: string; invoice_number: string; total_amount: number }[]) || []) {
          out.push({ id: `inv-${r.id}`, label: r.invoice_number, sublabel: `Rp ${Number(r.total_amount).toLocaleString('id-ID')}`, href: '/cold-storage/billing', group: 'Invoice', icon: FileText })
        }
      })(),
      (async () => {
        const { data } = await supabase
          .from('rental_customers')
          .select('id, name, phone')
          .eq('organization_id', organizationId)
          .order('name')
          .limit(50)
        for (const r of (data as { id: string; name: string; phone: string | null }[]) || []) {
          out.push({ id: `cust-${r.id}`, label: r.name, sublabel: r.phone ?? '', href: '/master/customers', group: 'Penyewa', icon: Users })
        }
      })(),
      (async () => {
        const { data } = await supabase
          .from('products')
          .select('id, name, sku')
          .eq('organization_id', organizationId)
          .order('name')
          .limit(100)
        for (const r of (data as { id: string; name: string; sku: string }[]) || []) {
          out.push({ id: `prod-${r.id}`, label: r.name, sublabel: r.sku, href: '/master/products', group: 'Produk', icon: Boxes })
        }
      })(),
      (async () => {
        const { data } = await supabase
          .from('cold_storage_baskets')
          .select('id, code, capacity_kg, cold_storage_zones(cold_storages(code))')
          .limit(100)
        for (const r of (data as unknown as { id: string; code: string; capacity_kg: number; cold_storage_zones: { cold_storages: { code: string } | null } | null }[]) || []) {
          out.push({ id: `basket-${r.id}`, label: r.code, sublabel: `${r.cold_storage_zones?.cold_storages?.code ?? ''} · ${r.capacity_kg} kg`, href: '/warehouse/inventory', group: 'Basket', icon: Package })
        }
      })(),
    )

    if (canSeeOps) {
      tasks.push(
        (async () => {
          const { data } = await supabase
            .from('purchase_orders')
            .select('id, po_number, status')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(50)
          for (const r of (data as { id: string; po_number: string; status: string }[]) || []) {
            out.push({ id: `po-${r.id}`, label: r.po_number, sublabel: r.status, href: '/operational/purchase-orders', group: 'Purchase Order', icon: ShoppingCart })
          }
        })(),
        (async () => {
          const { data } = await supabase
            .from('sales_orders')
            .select('id, so_number, status')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(50)
          for (const r of (data as { id: string; so_number: string; status: string }[]) || []) {
            out.push({ id: `so-${r.id}`, label: r.so_number, sublabel: r.status, href: '/operational/sales-orders', group: 'Sales Order', icon: FileText })
          }
        })(),
        (async () => {
          const { data } = await supabase
            .from('delivery_orders')
            .select('id, do_number, status')
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false })
            .limit(50)
          for (const r of (data as { id: string; do_number: string; status: string }[]) || []) {
            out.push({ id: `do-${r.id}`, label: r.do_number, sublabel: r.status, href: '/operational/delivery-orders', group: 'Surat Jalan', icon: Truck })
          }
        })(),
        (async () => {
          const { data } = await supabase
            .from('goods_receipts')
            .select('id, gr_number')
            .eq('organization_id', organizationId)
            .order('received_at', { ascending: false })
            .limit(50)
          for (const r of (data as { id: string; gr_number: string }[]) || []) {
            out.push({ id: `gr-${r.id}`, label: r.gr_number, href: '/warehouse/goods-receipts', group: 'Penerimaan', icon: Package })
          }
        })(),
      )
    }

    await Promise.all(tasks)
    setItems(out)
    setLoading(false)
  }

  const results = useMemo(() => {
    if (!query.trim()) {
      // Tampilkan menu + beberapa data terbaru sebagai saran
      return items.slice(0, 12)
    }
    const q = query.toLowerCase()
    return items
      .filter(
        (i) =>
          i.label.toLowerCase().includes(q) ||
          i.sublabel?.toLowerCase().includes(q) ||
          i.group.toLowerCase().includes(q)
      )
      .slice(0, 30)
  }, [query, items])

  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>()
    for (const r of results) {
      if (!map.has(r.group)) map.set(r.group, [])
      map.get(r.group)!.push(r)
    }
    return Array.from(map.entries())
  }, [results])

  const flat = useMemo(() => grouped.flatMap(([, arr]) => arr), [grouped])

  useEffect(() => { setActive(0) }, [query, open])

  function go(r: Result) {
    setOpen(false)
    setQuery('')
    router.push(r.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]) }
  }

  if (!loaded) return null

  return (
    <>
      {/* Tombol pembuka (desktop) */}
      <button
        onClick={() => setOpen(true)}
        className="hidden lg:flex items-center gap-2 w-80 xl:w-96 px-3 py-2 mr-auto rounded-lg border border-slate-200 bg-slate-50 text-slate-400 hover:bg-white hover:border-slate-300 transition-colors"
      >
        <Search className="w-4 h-4" />
        <span className="text-sm flex-1 text-left">Cari kontrak, invoice, barang, basket...</span>
        <kbd className="flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] text-slate-500">
          <Command className="w-2.5 h-2.5" />K
        </kbd>
      </button>

      {/* Tombol pembuka (mobile) */}
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors lg:hidden"
        aria-label="Cari"
      >
        <Search className="w-5 h-5" />
      </button>

      {/* Overlay pencarian */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[10vh]">
          <div ref={boxRef} className="w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 border-b border-slate-200">
              <Search className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Cari kontrak, invoice, barang, basket, PO, surat jalan..."
                className="flex-1 py-4 text-sm focus:outline-none"
              />
              {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
              {loading ? (
                <div className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
              ) : flat.length === 0 ? (
                <div className="py-12 text-center text-slate-400">
                  <p className="text-sm">Tidak ada hasil untuk "{query}"</p>
                </div>
              ) : (
                grouped.map(([group, arr]) => (
                  <div key={group}>
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{group}</p>
                    {arr.map((r) => {
                      const idx = flat.indexOf(r)
                      const Icon = r.icon
                      return (
                        <button
                          key={r.id}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(r)}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === active ? 'bg-cyan-50' : 'hover:bg-slate-50'}`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${idx === active ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-500'}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-800 truncate">{r.label}</span>
                            {r.sublabel && <span className="block text-xs text-slate-500 truncate">{r.sublabel}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center gap-4 px-4 py-2 border-t border-slate-200 text-[11px] text-slate-400">
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">↑↓</kbd> navigasi</span>
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">Enter</kbd> buka</span>
              <span className="flex items-center gap-1"><kbd className="border border-slate-200 rounded px-1">Esc</kbd> tutup</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
