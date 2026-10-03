'use client'

import React from 'react'
import { Printer, X } from 'lucide-react'
import { printElement, DEFAULT_COMPANY, type PrintCompany } from '@/lib/print'

export type DocumentLine = {
  name: string
  sku?: string | null
  batch?: string | null
  quantity: number | string
  unit?: string | null
  price?: number | string | null
  subtotal?: number | string | null
}

export type DocumentPrintData = {
  docType: string
  docNumber: string
  date?: string | null
  status?: string | null
  /** baris meta tambahan (label/nilai) di kiri */
  meta?: { label: string; value: string | null | undefined }[]
  /** blok pihak kedua (customer/supplier): judul + baris */
  party?: { title: string; lines: (string | null | undefined)[] }
  lines?: DocumentLine[]
  totals?: { label: string; value: string | number }[]
  notes?: string | null
  signatures?: string[]
  company?: PrintCompany
}

function fmt(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-'
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return String(value)
  return num.toLocaleString('id-ID')
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Komponen dokumen siap cetak. Render sebagai panel terkontrol (biasanya di
 * dalam Modal ukuran xl). Tombol cetak memanggil printElement('print-doc').
 */
export function DocumentPrintView({
  data,
  onClose,
}: {
  data: DocumentPrintData
  onClose?: () => void
}) {
  const company = data.company ?? DEFAULT_COMPANY
  const hasPrices = (data.lines ?? []).some((l) => l.price !== undefined && l.price !== null)

  return (
    <div>
      <div className="flex items-center justify-between mb-4 no-print">
        <p className="text-sm font-semibold text-slate-700">Pratinjau Dokumen</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => printElement('print-doc', data.docNumber)}
            className="inline-flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Printer className="w-4 h-4" /> Cetak / PDF
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-line text-ink text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
            >
              <X className="w-4 h-4" /> Tutup
            </button>
          )}
        </div>
      </div>

      <div id="print-doc" className="print-page bg-white border border-slate-200 rounded-lg p-8 text-[13px] text-ink">
        {/* Kop */}
        <div className="flex items-start justify-between border-b-2 border-ink pb-4 mb-5">
          <div>
            <h1 className="text-xl font-bold font-display tracking-tight">{company.name}</h1>
            {company.address && <p className="text-slate-600 mt-0.5">{company.address}</p>}
            {company.phone && <p className="text-slate-600">Telp: {company.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold uppercase">{data.docType}</p>
            <p className="font-mono mt-1">{data.docNumber}</p>
            <p className="text-slate-600 mt-0.5">{fmtDate(data.date)}</p>
            {data.status && <p className="text-slate-600">Status: {data.status}</p>}
          </div>
        </div>

        {/* Meta + Pihak */}
        <div className="flex justify-between gap-8 mb-5">
          <div className="space-y-1">
            {(data.meta ?? []).map((m) => (
              <div key={m.label} className="flex gap-2">
                <span className="text-slate-500 w-32">{m.label}</span>
                <span className="font-medium">: {m.value ?? '-'}</span>
              </div>
            ))}
          </div>
          {data.party && (
            <div className="space-y-1">
              <p className="font-semibold">{data.party.title}</p>
              {data.party.lines.filter(Boolean).map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          )}
        </div>

        {/* Rincian */}
        {(data.lines ?? []).length > 0 && (
          <table className="w-full border-collapse mb-5">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-3 py-2 text-left w-10">No</th>
                <th className="border border-slate-300 px-3 py-2 text-left">Nama Barang</th>
                <th className="border border-slate-300 px-3 py-2 text-left w-28">Batch</th>
                <th className="border border-slate-300 px-3 py-2 text-right w-24">Qty</th>
                {hasPrices && <th className="border border-slate-300 px-3 py-2 text-right w-28">Harga</th>}
                {hasPrices && <th className="border border-slate-300 px-3 py-2 text-right w-32">Subtotal</th>}
              </tr>
            </thead>
            <tbody>
              {(data.lines ?? []).map((l, i) => (
                <tr key={i}>
                  <td className="border border-slate-300 px-3 py-2 text-center">{i + 1}</td>
                  <td className="border border-slate-300 px-3 py-2">
                    {l.name}
                    {l.sku && <span className="text-slate-500"> ({l.sku})</span>}
                  </td>
                  <td className="border border-slate-300 px-3 py-2">{l.batch ?? '-'}</td>
                  <td className="border border-slate-300 px-3 py-2 text-right">
                    {fmt(l.quantity)} {l.unit ?? 'kg'}
                  </td>
                  {hasPrices && <td className="border border-slate-300 px-3 py-2 text-right">{fmt(l.price)}</td>}
                  {hasPrices && <td className="border border-slate-300 px-3 py-2 text-right">{fmt(l.subtotal)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Total */}
        {(data.totals ?? []).length > 0 && (
          <div className="flex justify-end mb-5">
            <table className="border-collapse">
              <tbody>
                {(data.totals ?? []).map((t) => (
                  <tr key={t.label}>
                    <td className="px-3 py-1.5 text-slate-600">{t.label}</td>
                    <td className="px-3 py-1.5 text-right font-semibold">{fmt(t.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data.notes && (
          <div className="mb-6">
            <p className="text-slate-500 mb-1">Catatan:</p>
            <p>{data.notes}</p>
          </div>
        )}

        {/* Tanda tangan */}
        <div className="grid grid-cols-2 gap-8 mt-10 pt-4">
          {(data.signatures ?? ['Dibuat Oleh', 'Disetujui']).map((s) => (
            <div key={s} className="text-center">
              <p className="mb-16">{s}</p>
              <div className="border-t border-ink pt-1">
                <p className="text-slate-500">( .......................... )</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
