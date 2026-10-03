'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Snowflake,
  PackageSearch,
  FileText,
  Truck,
  Warehouse,
  ClipboardCheck,
  ArrowRight,
  TrendingUp,
  Boxes,
  DollarSign,
  BarChart3,
  Activity,
  FileSignature,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils'

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  href,
}: {
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  href?: string
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-800 font-display">
            {typeof value === 'number' ? formatNumber(value) : value}
          </p>
        </div>
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    )
  }
  return inner
}

function QuickLink({
  label,
  description,
  href,
  icon: Icon,
  color,
}: {
  label: string
  description: string
  href: string
  icon: React.ElementType
  color: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-cyan-200 transition-all group"
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-xl flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-800 group-hover:text-cyan-700 transition-colors">
          {label}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all flex-shrink-0" />
    </Link>
  )
}

export default function DashboardPage() {
  const { name, roleName, roleCode, loaded, userId, organizationId } = useSession()
  const router = useRouter()

  const isWarehouse = roleCode === 'WAREHOUSE'
  const isDirector = roleCode === 'DIRECTOR'
  const isAdmin = roleCode === 'ADMIN'
  const isSystemAdmin = roleCode === 'SYSTEM_ADMIN'
  const canSeeOps = isDirector || isAdmin || isSystemAdmin
  const canSeeFinance = isDirector || isAdmin || isSystemAdmin

  const [stats, setStats] = useState({
    activeContracts: 0,
    pendingPO: 0,
    pendingSO: 0,
    deliveryOrders: 0,
    totalItems: 0,
    availableItems: 0,
    reservedItems: 0,
    quarantineItems: 0,
    coldStorageUnits: 0,
    activeContracts2: 0,
    pendingBillings: 0,
    utilization: 0,
    totalRevenue: 0,
    totalExpense: 0,
    pendingPayment: 0,
  })
  const [loading, setLoading] = useState(true)
  const [activities, setActivities] = useState<{ id: string; type: string; label: string; time: string }[]>([])

  useEffect(() => {
    if (loaded && !userId) {
      router.replace('/login')
    }
  }, [loaded, userId, router])

  useEffect(() => {
    if (!loaded || !userId || !organizationId) return
    loadStats()
    loadActivities()
  }, [loaded, userId, organizationId])

  async function loadActivities() {
    const { data } = await supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity_kg, performed_at, products(name)')
      .eq('organization_id', organizationId)
      .order('performed_at', { ascending: false })
      .limit(6)
    setActivities(
      ((data as unknown as { id: string; movement_type: string; quantity_kg: number; performed_at: string; products: { name: string } | null }[]) || []).map((m) => ({
        id: m.id,
        type: m.movement_type,
        label: `${m.movement_type === 'IN' ? 'Masuk' : 'Keluar'} ${Number(m.quantity_kg).toLocaleString('id-ID')} kg — ${m.products?.name ?? '-'}`,
        time: new Date(m.performed_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
      }))
    )
  }

  async function loadStats() {
    setLoading(true)
    try {
      const inventoryRes = await supabase
        .from('inventory')
        .select('status, quantity_kg')
        .eq('organization_id', organizationId)

      const coldStorageRes = await supabase
        .from('cold_storages')
        .select('id, status', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      // Inventory breakdown
      let totalItems = 0, availableItems = 0, reservedItems = 0, quarantineItems = 0
      ;(inventoryRes.data || []).forEach((row) => {
        const qty = Number(row.quantity_kg) || 0
        totalItems += qty
        if (row.status === 'AVAILABLE') availableItems += qty
        else if (row.status === 'RESERVED') reservedItems += qty
        else if (row.status === 'QUARANTINE') quarantineItems += qty
      })

      const coldStorageUnits = coldStorageRes.count || 0

      // Data operasional & keuangan hanya untuk role yang berhak
      let activeContracts = 0, pendingPO = 0, pendingSO = 0, deliveryOrders = 0
      let totalRevenue = 0, totalExpense = 0, pendingPayment = 0

      if (canSeeOps) {
        const [activeContractsRes, pendingPORes, pendingSORes, deliveryOrdersRes] = await Promise.all([
          supabase.from('rental_contracts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'ACTIVE'),
          supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'PENDING_APPROVAL'),
          supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'PENDING_APPROVAL'),
          supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
        ])
        activeContracts = activeContractsRes.count || 0
        pendingPO = pendingPORes.count || 0
        pendingSO = pendingSORes.count || 0
        deliveryOrders = deliveryOrdersRes.count || 0
      }

      if (canSeeFinance) {
        const [revenueRes, expenseRes, billings] = await Promise.all([
          supabase.from('transactions').select('amount').eq('organization_id', organizationId).eq('type', 'CREDIT'),
          supabase.from('transactions').select('amount').eq('organization_id', organizationId).eq('type', 'DEBIT'),
          supabase.from('rental_billing').select('total_amount, status').eq('organization_id', organizationId).in('status', ['DRAFT', 'SENT', 'OVERDUE']),
        ])
        totalRevenue = (revenueRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)
        totalExpense = (expenseRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)
        pendingPayment = (billings.data || []).reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
      }

      const utilization = coldStorageUnits > 0 ? Math.min(100, Math.round((activeContracts / coldStorageUnits) * 100)) : 0

      setStats({
        activeContracts,
        pendingPO,
        pendingSO,
        deliveryOrders,
        totalItems,
        availableItems,
        reservedItems,
        quarantineItems,
        coldStorageUnits,
        activeContracts2: activeContracts,
        pendingBillings: pendingPayment > 0 ? 1 : 0,
        utilization,
        totalRevenue,
        totalExpense,
        pendingPayment,
      })
    } catch (e) {
      console.error('Failed to load stats:', e)
    }
    setLoading(false)
  }

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  })()

  if (!loaded || !userId) {
    return (
      <AppShell>
        <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-cyan-100 mb-3">
              <Snowflake className="w-5 h-5 text-cyan-600 animate-pulse" />
            </div>
            <p className="text-sm text-slate-500">Memeriksa sesi...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  if (loading) {
    return (
      <AppShell>
        <div className="p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-cyan-100 mb-3">
              <Snowflake className="w-5 h-5 text-cyan-600 animate-pulse" />
            </div>
            <p className="text-sm text-slate-500">Memuat data...</p>
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">
              {greeting}{loaded && name ? `, ${name.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {loaded && roleName
                ? `Login sebagai ${roleName} · ${new Date().toLocaleDateString('id-ID', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}`
                : 'Memuat...'}
            </p>
          </div>
        </div>

        {/* Stats row */}
        {isWarehouse ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Stok" value={`${formatNumber(stats.totalItems)} kg`} icon={Boxes} color="#086b76" href="/warehouse/inventory" />
            <StatCard label="Available" value={`${formatNumber(stats.availableItems)} kg`} icon={Boxes} color="#22c55e" href="/warehouse/inventory" />
            <StatCard label="Reserved" value={`${formatNumber(stats.reservedItems)} kg`} icon={Boxes} color="#f59e0b" href="/warehouse/inventory" />
            <StatCard label="Quarantine" value={`${formatNumber(stats.quarantineItems)} kg`} icon={Boxes} color="#ef4444" href="/warehouse/inventory" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Kontrak Aktif" value={stats.activeContracts} icon={FileText} color="#086b76" href="/cold-storage/contracts" />
            <StatCard label="PO Pending Approval" value={stats.pendingPO} icon={PackageSearch} color="#f59e0b" href="/operational/purchase-orders" />
            <StatCard label="SO Pending Approval" value={stats.pendingSO} icon={Truck} color="#0ea5e9" href="/operational/sales-orders" />
            <StatCard label="Delivery Orders" value={stats.deliveryOrders} icon={Warehouse} color="#22c55e" href="/operational/delivery-orders" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick links */}
          <div className="lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Navigasi Cepat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {isWarehouse ? (
                <>
                  <QuickLink label="Inventory" description="Lihat stok barang di gudang" href="/warehouse/inventory" icon={Boxes} color="#22c55e" />
                  <QuickLink label="Penerimaan Barang" description="Penerimaan barang masuk" href="/warehouse/goods-receipts" icon={Warehouse} color="#8b5cf6" />
                  <QuickLink label="Pengeluaran Barang" description="Pelepasan stok / barang keluar" href="/warehouse/goods-issues" icon={Warehouse} color="#f59e0b" />
                  <QuickLink label="Keranjang & Lokasi" description="Kelola basket & cetak label QR" href="/warehouse/baskets" icon={Boxes} color="#06b6d4" />
                  <QuickLink label="QC Inspection" description="Checklist kualitas barang masuk/keluar" href="/warehouse/qc" icon={PackageSearch} color="#ef4444" />
                  <QuickLink label="Documents" description="Dokumen & cetakan" href="/documents" icon={FileText} color="#086b76" />
                </>
              ) : (
                <>
                  <QuickLink label="Rental Inquiry" description="Kelola permintaan sewa cold storage" href="/cold-storage/inquiries" icon={PackageSearch} color="#086b76" />
                  <QuickLink label="Rates" description="Atur tarif sewa per kg/hari" href="/cold-storage/rates" icon={DollarSign} color="#f59e0b" />
                  <QuickLink label="Purchase Order" description="Kelola pesanan pembelian" href="/operational/purchase-orders" icon={PackageSearch} color="#0ea5e9" />
                  <QuickLink label="Inventory" description="Lihat stok barang di gudang" href="/warehouse/inventory" icon={Boxes} color="#22c55e" />
                  <QuickLink label="Goods Receipt" description="Penerimaan barang masuk" href="/warehouse/goods-receipts" icon={Warehouse} color="#8b5cf6" />
                  <QuickLink label="Permintaan Harga" description="Kelola penawaran harga / RFQ" href="/operational/quotations" icon={FileSignature} color="#ef4444" />
                  {canSeeFinance && (
                    <QuickLink label="Finance" description="Laporan keuangan & transaksi" href="/finance/reports" icon={BarChart3} color="#8b5cf6" />
                  )}
                  <QuickLink label="Documents" description="Dokumen & cetakan" href="/documents" icon={FileText} color="#086b76" />
                </>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Warehouse overview */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-800">Warehouse Overview</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Total Item</span>
                  <span className="text-sm font-semibold text-slate-800">{formatNumber(stats.totalItems)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Available</span>
                  <span className="text-sm font-semibold text-green-600">{formatNumber(stats.availableItems)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Reserved</span>
                  <span className="text-sm font-semibold text-amber-600">{formatNumber(stats.reservedItems)} kg</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Quarantine</span>
                  <span className="text-sm font-semibold text-red-600">{formatNumber(stats.quarantineItems)} kg</span>
                </div>
              </div>
            </div>

            {/* Finance overview — hanya role berhak */}
            {canSeeFinance && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-sm font-semibold text-slate-800">Keuangan Ringkas</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Total Pendapatan</span>
                    <span className="text-sm font-semibold text-green-600">{formatCurrency(stats.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Total Pengeluaran</span>
                    <span className="text-sm font-semibold text-red-600">{formatCurrency(stats.totalExpense)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Pending Tagihan</span>
                    <span className="text-sm font-semibold text-amber-600">{formatCurrency(stats.pendingPayment)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Saldo Bersih</span>
                    <span className={`text-sm font-semibold ${stats.totalRevenue >= stats.totalExpense ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(stats.totalRevenue - stats.totalExpense)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Cold Storage status — hanya role berhak (info kontrak/utilisasi) */}
            {canSeeOps && (
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Snowflake className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-sm font-semibold text-slate-800">Cold Storage</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Cold Storage Units</span>
                    <span className="text-sm font-semibold text-slate-800">{stats.coldStorageUnits}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Active Contracts</span>
                    <span className="text-sm font-semibold text-slate-800">{stats.activeContracts2}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Utilization</span>
                    <span className="text-sm font-semibold text-slate-800">{stats.utilization}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Activity */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800">Aktivitas Terakhir</h3>
              </div>
              {activities.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Belum ada aktivitas.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((a) => (
                    <div key={a.id} className="flex items-start gap-3">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${a.type === 'IN' ? 'bg-green-500' : a.type === 'OUT' ? 'bg-amber-500' : 'bg-slate-400'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-slate-700 truncate">{a.label}</p>
                        <p className="text-[11px] text-slate-400">{a.time}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}