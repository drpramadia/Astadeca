'use client'

import AppShell from '@/components/app-shell'
import LogoutButton from '@/components/logout-button'
import Link from 'next/link'
import {
  PackageSearch,
  FileText,
  DollarSign,
  ArrowRight,
} from 'lucide-react'

function ModuleCard({
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
      className="flex items-center gap-4 p-5 bg-white rounded-xl border border-slate-200 hover:shadow-md hover:border-cyan-200 transition-all group"
    >
      <div
        className="flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0"
        style={{ backgroundColor: `${color}15` }}
      >
        <Icon className="w-6 h-6" style={{ color }} />
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

export default function RentalPage() {
  return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 font-display">Rental Cold Storage</h1>
            <p className="mt-1 text-sm text-slate-500">
              {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <LogoutButton />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ModuleCard
            label="Rental Inquiry"
            description="Kelola permintaan sewa cold storage"
            href="/cold-storage/inquiries"
            icon={PackageSearch}
            color="#086b76"
          />
          <ModuleCard
            label="Kontrak"
            description="Daftar dan buat kontrak sewa"
            href="/cold-storage/contracts"
            icon={FileText}
            color="#0ea5e9"
          />
          <ModuleCard
            label="Rates"
            description="Atur tarif sewa per kg/hari"
            href="/cold-storage/rates"
            icon={DollarSign}
            color="#f59e0b"
          />
          <ModuleCard
            label="Billing"
            description="Tagihan dan invoice rental"
            href="/cold-storage/billing"
            icon={DollarSign}
            color="#22c55e"
          />
        </div>
      </div>
    </AppShell>
  )
}
