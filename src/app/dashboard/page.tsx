'use client'

import AppShell from '@/components/app-shell'
import { useSession } from '@/hooks/use-session'
import { useEffect } from 'react'
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
} from 'lucide-react'

// â”€â”€â”€ Stat card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
            {typeof value === 'number' ? value.toLocaleString('id-ID') : value}
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

// â”€â”€â”€ Quick link card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€â”€ Dashboard page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function DashboardPage() {
  const { name, roleName, loaded, userId } = useSession()
  const router = useRouter()

  // Redirect to login if not authenticated
  useEffect(() => {
    if (loaded && !userId) {
      router.replace('/login')
    }
  }, [loaded, userId, router])

  // Show loading while checking auth
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

  const greeting = (() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Selamat Pagi'
    if (hour < 15) return 'Selamat Siang'
    if (hour < 18) return 'Selamat Sore'
    return 'Selamat Malam'
  })()

  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">
              {greeting}{loaded && name ? `, ${name.split(' ')[0]}` : ''} ðŸ‘‹
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {loaded && roleName
                ? `Login sebagai ${roleName} Â· ${new Date().toLocaleDateString('id-ID', {
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard
            label="Kontrak Aktif"
            value={0}
            icon={FileText}
            color="#086b76"
            href="/cold-storage/contracts"
          />
          <StatCard
            label="PO Pending"
            value={0}
            icon={PackageSearch}
            color="#f59e0b"
            href="/operational/purchase-orders"
          />
          <StatCard
            label="SO Pending"
            value={0}
            icon={Truck}
            color="#0ea5e9"
            href="/operational/sales-orders"
          />
          <StatCard
            label="Delivery Orders"
            value={0}
            icon={Warehouse}
            color="#22c55e"
            href="/operational/delivery-orders"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick links */}
          <div className="lg:col-span-2">
            <h2 className="text-base font-semibold text-slate-800 mb-4">Navigasi Cepat</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <QuickLink
                label="Rental Inquiry"
                description="Kelola permintaan sewa cold storage"
                href="/cold-storage/inquiries"
                icon={PackageSearch}
                color="#086b76"
              />
              <QuickLink
                label="Rates"
                description="Atur tarif sewa per kg/hari"
                href="/cold-storage/rates"
                icon={DollarSign}
                color="#f59e0b"
              />
              <QuickLink
                label="Purchase Order"
                description="Kelola pesanan pembelian"
                href="/operational/purchase-orders"
                icon={PackageSearch}
                color="#0ea5e9"
              />
              <QuickLink
                label="Inventory"
                description="Lihat stok barang di gudang"
                href="/warehouse/inventory"
                icon={Boxes}
                color="#22c55e"
              />
              <QuickLink
                label="Goods Receipt"
                description="Penerimaan barang masuk"
                href="/warehouse/goods-receipts"
                icon={Warehouse}
                color="#8b5cf6"
              />
              <QuickLink
                label="Approval"
                description="Setujui request pending"
                href="/approval/requests"
                icon={ClipboardCheck}
                color="#ef4444"
              />
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
                  <span className="text-sm font-semibold text-slate-800">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Available</span>
                  <span className="text-sm font-semibold text-green-600">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Reserved</span>
                  <span className="text-sm font-semibold text-amber-600">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Quarantine</span>
                  <span className="text-sm font-semibold text-red-600">0</span>
                </div>
              </div>
            </div>

            {/* Cold Storage status */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Snowflake className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-semibold text-slate-800">Cold Storage</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Cold Storage Units</span>
                  <span className="text-sm font-semibold text-slate-800">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Active Contracts</span>
                  <span className="text-sm font-semibold text-slate-800">0</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-slate-500">Pending Billings</span>
                  <span className="text-sm font-semibold text-amber-600">0</span>
                </div>
              </div>
            </div>

            {/* Recent Activity placeholder */}
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-800">Aktivitas Terakhir</h3>
              </div>
              <p className="text-sm text-slate-400 text-center py-4">
                Belum ada aktivitas terakhir.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
