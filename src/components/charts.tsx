'use client'

import { useMemo } from 'react'

export type BarSeries = { name: string; color: string; values: number[] }
export type BarChartProps = {
  labels: string[]
  series: BarSeries[]
  height?: number
  valueFormat?: (n: number) => string
}

/**
 * Bar chart SVG (tanpa dependency). Mendukung beberapa seri per label.
 */
export function BarChart({ labels, series, height = 220, valueFormat }: BarChartProps) {
  const fmt = valueFormat ?? ((n: number) => n.toLocaleString('id-ID'))
  const max = Math.max(1, ...series.flatMap((s) => s.values))
  const padding = { top: 12, right: 8, bottom: 28, left: 8 }
  const groupW = 100 / Math.max(1, labels.length)
  const seriesW = groupW / Math.max(1, series.length)

  return (
    <div className="w-full">
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
        {/* gridlines */}
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <line key={g} x1={0} x2={100} y1={height - padding.bottom - (height - padding.top - padding.bottom) * g} y2={height - padding.bottom - (height - padding.top - padding.bottom) * g} stroke="currentColor" strokeWidth={0.2} className="text-slate-200" />
        ))}
        {labels.map((_, gi) => (
          <g key={gi}>
            {series.map((s, si) => {
              const v = s.values[gi] ?? 0
              const plotH = height - padding.top - padding.bottom
              const barH = (v / max) * plotH
              const x = gi * groupW + si * seriesW + seriesW * 0.15
              const w = seriesW * 0.7
              const y = height - padding.bottom - barH
              return <rect key={si} x={x} y={y} width={w} height={Math.max(0, barH)} rx={0.6} fill={s.color}><title>{`${labels[gi]} · ${s.name}: ${fmt(v)}`}</title></rect>
            })}
          </g>
        ))}
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-slate-400">
        {labels.map((l, i) => <span key={i} className="flex-1 text-center truncate">{l}</span>)}
      </div>
      <div className="flex flex-wrap items-center gap-4 mt-3">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} /> {s.name}
          </span>
        ))}
      </div>
    </div>
  )
}

export type DonutProps = {
  segments: { label: string; value: number; color: string }[]
  size?: number
  centerLabel?: string
  centerValue?: string
}

/** Donut / gauge sederhana berbasis SVG. */
export function DonutChart({ segments, size = 160, centerLabel, centerValue }: DonutProps) {
  const total = useMemo(() => segments.reduce((s, x) => s + x.value, 0), [segments])
  const radius = 54
  const circ = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 140 140" width={size} height={size} role="img">
        <g transform="rotate(-90 70 70)">
          <circle cx={70} cy={70} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={14} className="text-slate-200" />
          {total > 0 && segments.map((s, i) => {
            const frac = s.value / total
            const dash = frac * circ
            const el = (
              <circle key={i} cx={70} cy={70} r={radius} fill="none" stroke={s.color} strokeWidth={14}
                strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset}>
                <title>{`${s.label}: ${s.value.toLocaleString('id-ID')}`}</title>
              </circle>
            )
            offset += dash
            return el
          })}
        </g>
        {(centerValue || centerLabel) && (
          <text x={70} y={68} textAnchor="middle" className="fill-slate-800" style={{ fontSize: 20, fontWeight: 700 }}>{centerValue}</text>
        )}
        {centerLabel && <text x={70} y={84} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 9 }}>{centerLabel}</text>}
      </svg>
      <div className="space-y-2">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-slate-500">{s.label}</span>
            <span className="font-medium text-slate-700 ml-auto pl-3">{s.value.toLocaleString('id-ID')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
