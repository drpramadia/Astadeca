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
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { BarChart, DonutChart } from '@/components/charts'

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
    <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-sm hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-lg hover:shadow-slate-200/60 transition-all group">
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
    capacityKg: 0,
    storedKg: 0,
    totalRevenue: 0,
    totalExpense: 0,
    pendingPayment: 0,
    unpaidInvoices: 0,
    overdueInvoices: 0,
    needIssue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [activities, setActivities] = useState<{ id: string; type: string; label: string; time: string }[]>([])

  const [rangeDays, setRangeDays] = useState(30)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError] = useState<string | null>(null)
  const [monthly, setMonthly] = useState<{ labels: string[]; revenue: number[]; expense: number[]; sales: number[]; purchase: number[] }>({ labels: [], revenue: [], expense: [], sales: [], purchase: [] })

  useEffect(() => {
    if (loaded && !userId) {
      router.replace('/login')
    }
  }, [loaded, userId, router])

  useEffect(() => {
    if (!loaded || !userId || !organizationId) return
    loadStats()
    loadActivities().catch((e) => {
      console.error('Failed to load dashboard activities:', e)
      setRefreshError(e instanceof Error ? e.message : 'Gagal memuat aktivitas.')
    })
  }, [loaded, userId, organizationId])

  useEffect(() => {
    if (!loaded || !userId || !organizationId || !canSeeFinance) return
    loadCharts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, userId, organizationId, rangeDays])

  async function loadCharts() {
    setChartLoading(true)
    setChartError(null)
    try {
      const today = new Date()
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - rangeDays + 1)
      const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      const sinceISO = dateKey(start)

      const [txRes, soRes, poRes] = await Promise.all([
        supabase.from('transactions').select('amount, type, transaction_date').eq('organization_id', organizationId).gte('transaction_date', sinceISO),
        supabase.from('sales_orders').select('total_amount, order_date').eq('organization_id', organizationId).gte('order_date', sinceISO),
        supabase.from('purchase_orders').select('total_amount, order_date').eq('organization_id', organizationId).gte('order_date', sinceISO),
      ])
      const queryError = txRes.error || soRes.error || poRes.error
      if (queryError) throw queryError

      const bucketCount = rangeDays === 365 ? 12 : 6
      const buckets = Array.from({ length: bucketCount }, (_, index) => {
        const bucketStart = new Date(start)
        bucketStart.setDate(start.getDate() + Math.floor((index * rangeDays) / bucketCount))
        return {
          start: bucketStart,
          label: bucketStart.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }),
        }
      })
      const getBucket = (value: string) => {
        const day = new Date(`${value.slice(0, 10)}T00:00:00`)
        const offset = Math.floor((day.getTime() - start.getTime()) / 86_400_000)
        const index = Math.floor((offset * bucketCount) / rangeDays)
        return index >= 0 && index < bucketCount ? index : -1
      }
      const revenue = new Array(bucketCount).fill(0)
      const expense = new Array(bucketCount).fill(0)
      const sales = new Array(bucketCount).fill(0)
      const purchase = new Array(bucketCount).fill(0)

      txRes.data.forEach((transaction) => {
        const index = getBucket(transaction.transaction_date)
        if (index < 0) return
        if (transaction.type === 'CREDIT') revenue[index] += Number(transaction.amount) || 0
        else expense[index] += Number(transaction.amount) || 0
      })
      soRes.data.forEach((order) => {
        const index = getBucket(order.order_date)
        if (index >= 0) sales[index] += Number(order.total_amount) || 0
      })
      poRes.data.forEach((order) => {
        const index = getBucket(order.order_date)
        if (index >= 0) purchase[index] += Number(order.total_amount) || 0
      })

      setMonthly({ labels: buckets.map((bucket) => bucket.label), revenue, expense, sales, purchase })
    } catch (e) {
      setMonthly({ labels: [], revenue: [], expense: [], sales: [], purchase: [] })
      setChartError(e instanceof Error ? e.message : 'Gagal memuat analitik.')
    } finally {
      setChartLoading(false)
    }
  }

  async function loadActivities() {
    const { data, error } = await supabase
      .from('inventory_movements')
      .select('id, movement_type, quantity_kg, performed_at, products(name)')
      .eq('organization_id', organizationId)
      .order('performed_at', { ascending: false })
      .limit(6)
    if (error) throw error

    let rows = ((data as unknown as { id: string; movement_type: string; quantity_kg: number; performed_at: string; products: { name: string } | null }[]) || []).map((m) => ({
      id: m.id,
      type: m.movement_type,
      label: `${m.movement_type === 'IN' ? 'Masuk' : 'Keluar'} ${Number(m.quantity_kg).toLocaleString('id-ID')} kg — ${m.products?.name ?? '-'}`,
      time: new Date(m.performed_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
    }))

    // Fallback: bila belum ada pergerakan inventory, tampilkan aktivitas sewa
    // (barang masuk/keluar cold storage) agar panel tidak kosong.
    if (rows.length === 0) {
      const [recvRes, relRes] = await Promise.all([
        supabase.from('rental_receivings').select('id, received_kg, received_at, batch_number').eq('organization_id', organizationId).order('received_at', { ascending: false }).limit(4),
        supabase.from('rental_releases').select('id, released_kg, released_at, batch_number').eq('organization_id', organizationId).order('released_at', { ascending: false }).limit(4),
      ])
      const activityError = recvRes.error || relRes.error
      if (activityError) throw activityError
      const recv = ((recvRes.data as unknown as { id: string; received_kg: number; received_at: string; batch_number: string | null }[]) || []).map((r) => ({
        id: 'recv-' + r.id,
        type: 'IN',
        label: `Masuk ${Number(r.received_kg).toLocaleString('id-ID')} kg — batch ${r.batch_number ?? '-'}`,
        time: new Date(r.received_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        _at: r.received_at,
      }))
      const rel = ((relRes.data as unknown as { id: string; released_kg: number; released_at: string; batch_number: string | null }[]) || []).map((r) => ({
        id: 'rel-' + r.id,
        type: 'OUT',
        label: `Keluar ${Number(r.released_kg).toLocaleString('id-ID')} kg — batch ${r.batch_number ?? '-'}`,
        time: new Date(r.released_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        _at: r.released_at,
      }))
      rows = [...recv, ...rel]
        .sort((a, b) => (a._at < b._at ? 1 : -1))
        .slice(0, 6)
        .map(({ _at, ...rest }) => rest)
    }

    setActivities(rows)
  }

  async function loadStats(showLoader = true) {
    if (showLoader) setLoading(true)
    try {
      const inventoryRes = await supabase
        .from('inventory')
        .select('status, quantity_kg')
        .eq('organization_id', organizationId)

      const coldStorageRes = await supabase
        .from('cold_storages')
        .select('id, capacity_kg', { count: 'exact' })
        .eq('organization_id', organizationId)
      const baseError = inventoryRes.error || coldStorageRes.error
      if (baseError) throw baseError

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
      const capacityKg = (coldStorageRes.data || []).reduce((s, r) => s + Number((r as { capacity_kg: number }).capacity_kg || 0), 0)

      // Data operasional & keuangan hanya untuk role yang berhak
      let activeContracts = 0, pendingPO = 0, pendingSO = 0, deliveryOrders = 0
      let totalRevenue = 0, totalExpense = 0, pendingPayment = 0
      let storedKg = 0, unpaidInvoices = 0, overdueInvoices = 0, needIssue = 0

      if (canSeeOps) {
        const [activeContractsRes, pendingPORes, pendingSORes, deliveryOrdersRes, totalItemsRes] = await Promise.all([
          supabase.from('rental_contracts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'ACTIVE'),
          supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'PENDING_APPROVAL'),
          supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('status', 'PENDING_APPROVAL'),
          supabase.from('delivery_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
          supabase.from('inventory').select('quantity_kg').eq('organization_id', organizationId),
        ])
        const opsError = activeContractsRes.error || pendingPORes.error || pendingSORes.error || deliveryOrdersRes.error || totalItemsRes.error
        if (opsError) throw opsError
        activeContracts = activeContractsRes.count || 0
        pendingPO = pendingPORes.count || 0
        pendingSO = pendingSORes.count || 0
        deliveryOrders = deliveryOrdersRes.count || 0
        storedKg = (totalItemsRes.data || []).reduce((s, r) => s + Number((r as { quantity_kg: number }).quantity_kg || 0), 0)
      }

      if (canSeeFinance) {
        const [revenueRes, expenseRes, billings] = await Promise.all([
          supabase.from('transactions').select('amount').eq('organization_id', organizationId).eq('type', 'CREDIT'),
          supabase.from('transactions').select('amount').eq('organization_id', organizationId).eq('type', 'DEBIT'),
          supabase.from('rental_billing').select('total_amount, status').eq('organization_id', organizationId).in('status', ['DRAFT', 'SENT', 'OVERDUE']),
        ])
        const financeError = revenueRes.error || expenseRes.error || billings.error
        if (financeError) throw financeError
        totalRevenue = (revenueRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)
        totalExpense = (expenseRes.data || []).reduce((sum, r) => sum + Number(r.amount), 0)
        const openBills = billings.data || []
        pendingPayment = openBills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0)
        unpaidInvoices = openBills.filter((b) => b.status === 'SENT').length
        overdueInvoices = openBills.filter((b) => b.status === 'OVERDUE').length
      }

      // Utilization = stok tersimpan vs total kapasitas (bukan kontrak vs unit).
      // storedKg dari inventory; fallback ke stok rental (receivings - releases).
      let effectiveStored = storedKg
      if (effectiveStored === 0) {
        const [recvRes, relRes] = await Promise.all([
          supabase.from('rental_receivings').select('received_kg').eq('organization_id', organizationId),
          supabase.from('rental_releases').select('released_kg').eq('organization_id', organizationId),
        ])
        const stockError = recvRes.error || relRes.error
        if (stockError) throw stockError
        const inKg = (recvRes.data || []).reduce((s, r) => s + Number((r as { received_kg: number }).received_kg || 0), 0)
        const outKg = (relRes.data || []).reduce((s, r) => s + Number((r as { released_kg: number }).released_kg || 0), 0)
        effectiveStored = Math.max(0, inKg - outKg)
      }

      const utilization = capacityKg > 0 ? Math.round((effectiveStored / capacityKg) * 100) : 0

      // Sinkronkan status tagihan (SENT lewat periode -> OVERDUE) & kirim
      // pengingat penagihan agar tidak terlewat (dedupe di sisi DB).
      if (canSeeFinance) {
        const overdueResult = await supabase.rpc('mark_overdue_rental_billing', { p_organization_id: organizationId })
        if (overdueResult.error) throw overdueResult.error
        const reminderResult = await supabase.rpc('notify_rental_billing_due', { p_organization_id: organizationId })
        if (reminderResult.error) throw reminderResult.error
      }

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
        pendingBillings: unpaidInvoices + overdueInvoices,
        utilization,
        capacityKg,
        storedKg: effectiveStored,
        totalRevenue,
        totalExpense,
        pendingPayment,
        unpaidInvoices,
        overdueInvoices,
        needIssue: 0,
      })
    } catch (e) {
      console.error('Failed to load stats:', e)
      setRefreshError(e instanceof Error ? e.message : 'Gagal memuat ringkasan.')
    }
    setLoading(false)
  }

  async function refreshDashboard() {
    setRefreshing(true)
    setRefreshError(null)
    try {
      await Promise.all([
        loadStats(false),
        loadActivities(),
        canSeeFinance ? loadCharts() : Promise.resolve(),
      ])
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Gagal memperbarui dashboard.')
    } finally {
      setRefreshing(false)
    }
  }

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  })()
  const hasChartData = [monthly.revenue, monthly.expense, monthly.sales, monthly.purchase]
    .some((series) => series.some((value) => value > 0))

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
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
        {/* Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#142b35] via-[#164653] to-[#087e88] px-5 py-6 text-white shadow-xl shadow-cyan-950/10 sm:px-8 sm:py-7">
          <div className="pointer-events-none absolute -right-12 -top-24 h-64 w-64 rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -right-2 -top-12 h-44 w-44 rounded-full border border-white/10" />
          <div className="relative flex flex-wrap items-center justify-between gap-5">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-100/70">Astadeca · Ringkasan Operasional</p>
              <h1 className="text-2xl font-bold font-display sm:text-3xl">
                {greeting}{loaded && name ? `, ${name.split(' ')[0]}` : ''}
              </h1>
              <p className="mt-2 text-sm text-cyan-50/75">
                {new Date().toLocaleDateString('id-ID', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {roleName ? ` · ${roleName}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshDashboard()}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 disabled:cursor-wait disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Memperbarui...' : 'Perbarui data'}
            </button>
          </div>
        </div>
        {refreshError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Gagal memuat sebagian data dashboard: {refreshError}</div>}

        {/* Stats row */}
        {isWarehouse ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Stok" value={`${formatNumber(stats.totalItems)} kg`} icon={Boxes} color="#086b76" href="/warehouse/inventory" />
            <StatCard label="Available" value={`${formatNumber(stats.availableItems)} kg`} icon={Boxes} color="#22c55e" href="/warehouse/inventory" />
            <StatCard label="Reserved" value={`${formatNumber(stats.reservedItems)} kg`} icon={Boxes} color="#f59e0b" href="/warehouse/inventory" />
            <StatCard label="Quarantine" value={`${formatNumber(stats.quarantineItems)} kg`} icon={Boxes} color="#ef4444" href="/warehouse/inventory" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Kontrak Aktif" value={stats.activeContracts} icon={FileText} color="#086b76" href="/cold-storage/contracts" />
            <StatCard label="PO Pending Approval" value={stats.pendingPO} icon={PackageSearch} color="#f59e0b" href="/operational/purchase-orders" />
            <StatCard label="SO Pending Approval" value={stats.pendingSO} icon={Truck} color="#0ea5e9" href="/operational/sales-orders" />
            <StatCard label="Delivery Orders" value={stats.deliveryOrders} icon={Warehouse} color="#22c55e" href="/operational/delivery-orders" />
          </div>
        )}

        {/* Analitik interaktif (keuangan & penjualan) */}
        {canSeeFinance && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-600" />
                  <h3 className="text-sm font-semibold text-slate-800">Pemasukan, Pengeluaran, Penjualan &amp; Pembelian</h3>
                </div>
                <select aria-label="Rentang waktu grafik" value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value={30}>30 hari</option>
                  <option value={90}>90 hari</option>
                  <option value={180}>180 hari</option>
                  <option value={365}>1 tahun</option>
                </select>
              </div>
              {chartLoading ? (
                <div className="h-56 flex items-center justify-center text-slate-400"><Snowflake className="w-5 h-5 animate-pulse" /></div>
              ) : chartError ? (
                <div role="alert" className="flex h-56 items-center justify-center rounded-xl border border-red-100 bg-red-50/50 px-4 text-center text-sm text-red-700">
                  Gagal memuat grafik: {chartError}
                </div>
              ) : !hasChartData ? (
                <div className="flex h-56 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 text-center">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Belum ada aktivitas finansial</p>
                  <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Data pemasukan, pengeluaran, penjualan, dan pembelian akan dirangkum di sini sesuai periode yang dipilih.
                  </p>
                </div>
              ) : (
                <BarChart
                  labels={monthly.labels}
                  series={[
                    { name: 'Pemasukan', color: '#22c55e', values: monthly.revenue },
                    { name: 'Pengeluaran', color: '#ef4444', values: monthly.expense },
                    { name: 'Penjualan', color: '#0ea5e9', values: monthly.sales },
                    { name: 'Pembelian', color: '#f59e0b', values: monthly.purchase },
                  ]}
                  height={190}
                  valueFormat={(n) => formatCurrency(n)}
                />
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-800">Untung / Rugi</h3>
              </div>
              <div className="text-center mb-4">
                <p className={`text-2xl font-bold ${stats.totalRevenue - stats.totalExpense >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(stats.totalRevenue - stats.totalExpense)}
                </p>
                <p className="text-xs text-slate-400 mt-1">Pemasukan − Pengeluaran</p>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Pemasukan</span><span className="font-medium text-green-600">{formatCurrency(stats.totalRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Pengeluaran</span><span className="font-medium text-red-600">{formatCurrency(stats.totalExpense)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Piutang Tagihan</span><span className="font-medium text-slate-700">{formatCurrency(stats.pendingPayment)}</span></div>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-7">
          {/* Quick links */}
            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-800 font-display">Akses cepat</h2>
                  <p className="mt-1 text-xs text-slate-500">Pintasan pekerjaan sesuai akses akun Anda</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          </section>

          {/* Overview cards fill a balanced grid rather than leaving a blank column. */}
          <section className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {/* Kapasitas cold storage */}
            <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Snowflake className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-800">Kapasitas Cold Storage</h3>
              </div>
              {stats.capacityKg > 0 ? (
                <>
                  <DonutChart
                    centerValue={`${stats.utilization}%`}
                    centerLabel="terpakai"
                    segments={[
                      { label: 'Terpakai', value: Math.min(100, stats.utilization), color: stats.utilization > 100 ? '#ef4444' : '#086b76' },
                      { label: 'Tersedia', value: Math.max(0, 100 - stats.utilization), color: '#22c55e' },
                    ]}
                  />
                  <div className="mt-3 space-y-1 text-xs text-center">
                    <p className="text-slate-500">
                      <span className="font-semibold text-slate-800">{formatNumber(stats.storedKg)} kg</span> tersimpan dari{' '}
                      <span className="font-semibold text-slate-800">{formatNumber(stats.capacityKg)} kg</span>
                    </p>
                    <p className="text-slate-400">{stats.coldStorageUnits} unit · {stats.activeContracts} kontrak aktif</p>
                    {stats.utilization > 100 && (
                      <p className="text-red-600 font-medium">Melebihi kapasitas {stats.utilization - 100}%</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400 text-center py-6">Belum ada unit cold storage dengan kapasitas.</p>
              )}
            </div>

            {/* Penagihan / Billing — monitoring agar tidak terlewat */}
            {canSeeFinance && (
              <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-cyan-600" />
                    <h3 className="text-sm font-semibold text-slate-800">Penagihan</h3>
                  </div>
                  <Link href="/cold-storage/billing" className="text-xs text-cyan-700 hover:underline">Kelola</Link>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Perlu Ditagih (belum lunas)</span>
                    <span className="text-sm font-semibold text-amber-600">{stats.unpaidInvoices + stats.overdueInvoices} invoice</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Jatuh Tempo</span>
                    <span className={`text-sm font-semibold ${stats.overdueInvoices > 0 ? 'text-red-600' : 'text-slate-800'}`}>{stats.overdueInvoices} invoice</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">Nilai Tagihan</span>
                    <span className="text-sm font-semibold text-slate-800">{formatCurrency(stats.pendingPayment)}</span>
                  </div>
                </div>
                {stats.pendingBillings > 0 ? (
                  <Link href="/cold-storage/billing" className="mt-4 flex items-center justify-center gap-2 w-full px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors">
                    <AlertTriangle className="w-3.5 h-3.5" /> Ada {stats.pendingBillings} tagihan menunggu
                  </Link>
                ) : (
                  <p className="mt-4 text-center text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg py-2">Tidak ada tagihan tertunggak</p>
                )}
              </div>
            )}

            {/* Warehouse overview */}
            <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
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
              <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
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
              <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
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
            <div className="h-full rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
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
          </section>
        </div>
      </div>
    </AppShell>
  )
}