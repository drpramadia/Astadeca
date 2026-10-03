'use client'

import AppShell from '@/components/app-shell'
import { AccessDenied } from '@/components/access-denied'
import { useSession } from '@/hooks/use-session'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Search, BarChart3, TrendingUp, Loader2, X, Calendar } from 'lucide-react'

type Transaction = {
  id: string
  transaction_date: string
  description: string
  amount: number
  type: string
  reference_type: string | null
  reference_id: string | null
  created_at: string
}

type MonthlySummary = {
  month: string
  debit: number
  credit: number
}

export default function FinanceReportsPage() {
  const { organizationId, loaded, roleCode } = useSession()
  const canAccess = roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN'
  const [data, setData] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')

  useEffect(() => {
    if (!loaded) return
    fetchData()
  }, [loaded])

  async function fetchData() {
    setLoading(true)
    let q = supabase
      .from('transactions')
      .select('*')
      .eq('organization_id', organizationId)
      .order('transaction_date', { ascending: false })
      .limit(2000)
    if (dateFilter) {
      const start = `${dateFilter}-01T00:00:00`
      const endParts = dateFilter.split('-')
      const lastDay = new Date(parseInt(endParts[0]), parseInt(endParts[1]) - 1 + 1, 0).getDate()
      const end = `${dateFilter.slice(0, 8).replace(/-\d{2}$/, '')}-${String(lastDay).padStart(2, '0')}T23:59:59`
      q = q.gte('transaction_date', start).lte('transaction_date', end)
    }
    const { data: rows } = await q
    setData((rows as Transaction[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (!loading) fetchData() }, [dateFilter])

  const monthlySummary: MonthlySummary[] = (() => {
    const map = new Map<string, MonthlySummary>()
    data.forEach((t) => {
      const month = new Date(t.transaction_date).toISOString().slice(0, 7)
      if (!map.has(month)) map.set(month, { month, debit: 0, credit: 0 })
      const s = map.get(month)!
      if (t.type === 'DEBIT') s.debit += Number(t.amount)
      else s.credit += Number(t.amount)
    })
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month))
  })()

  const totalDebit = data.filter((t) => t.type === 'DEBIT').reduce((sum, t) => sum + Number(t.amount), 0)
  const totalCredit = data.filter((t) => t.type === 'CREDIT').reduce((sum, t) => sum + Number(t.amount), 0)
  const balance = totalCredit - totalDebit

    const maxAmount = Math.max(...monthlySummary.map((m) => Math.max(m.credit, m.debit)), 1)

    if (loaded && !canAccess) return <AccessDenied message="Laporan keuangan hanya untuk Admin, Director, atau System Administrator." />

    return (
    <AppShell>
      <div className="p-6 lg:p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button onClick={() => history.back()} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-slate-800 font-display">Laporan Keuangan</h1>
            </div>
            <p className="text-sm text-slate-500">
              Saldo: <span className={balance >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(balance)}</span>
              {' '} | Debit: {formatCurrency(totalDebit)} | Kredit: {formatCurrency(totalCredit)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="month"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <button
              onClick={() => {
                const today = new Date()
                const firstDay = new Date(today.getFullYear(), today.getMonth() - 6, 1)
                const period = `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, '0')}`
                setDateFilter(period)
              }}
              className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
            >
              6 Bulan
            </button>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg border border-slate-200"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Chart */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-600 mb-4">Ringkasan Bulanan</h2>
              <div className="space-y-4">
                {monthlySummary.slice(0, 12).map((month) => (
                  <div key={month.month}>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="w-12 text-xs text-slate-500">{month.month}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="bg-green-500 rounded h-6 transition-all"
                            style={{ width: `${(month.credit / maxAmount) * 100}%` }}
                          />
                          <span className="text-xs font-mono text-green-700">{formatCurrency(month.credit)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div
                            className="bg-red-500 rounded h-6 transition-all"
                            style={{ width: `${(month.debit / maxAmount) * 100}%` }}
                          />
                          <span className="text-xs font-mono text-red-700">{formatCurrency(month.debit)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-400 text-right">
                      {formatCurrency(month.credit - month.debit)}
                    </div>
                  </div>
                ))}
                {monthlySummary.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-8">Belum ada data transaksi</p>
                )}
              </div>
            </div>

            {/* Recent transactions */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
              <h2 className="text-sm font-semibold text-slate-600 p-4 border-b">Transaksi Terbaru</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Tanggal</th>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Deskripsi</th>
                    <th className="text-center px-4 py-2 font-semibold text-slate-600">Tipe</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slice(0, 20).map((row) => (
                    <tr key={row.id} className="border-b border-slate-100">
                      <td className="px-4 py-2 text-slate-600 text-xs">{formatDate(row.transaction_date)}</td>
                      <td className="px-4 py-2 text-slate-700">{row.description}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          row.type === 'CREDIT' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {row.type === 'CREDIT' ? 'Kredit' : 'Debit'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        <span className={row.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'}>
                          {formatCurrency(row.amount)}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-slate-400">
                        Belum ada transaksi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
