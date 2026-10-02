import { formatNumber } from '@/lib/utils'

export interface CsvColumn<T> {
  key: keyof T
  label: string
  render?: (row: T) => string
}

export function exportToCsv<T extends Record<string, any>>(
  filename: string,
  columns: { key: string; label: string; render?: (row: T) => string }[],
  rows: T[],
): void {
  const header = columns.map((c) => c.label).join(',')
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const val = c.render ? c.render(row) : String(row[c.key] ?? '')
        return csvEscape(val)
      })
      .join(',')
  )
  const csv = [header, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function csvEscape(value: string): string {
  const v = value.replace(/\r?\n/g, ' ').replace(/"/g, '""')
  return v.includes(',') || v.includes('"') ? `"${v}"` : v
}

export function parseCsv(text: string): string[][] {
  const result: string[][] = []
  let current: string[] = []
  let inQuotes = false
  let currentField = ''

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (next === '"') {
          currentField += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else if (char === '"') {
      inQuotes = true
    } else if (char === ',') {
      current.push(currentField)
      currentField = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && next === '\n') i++
      current.push(currentField)
      result.push(current)
      current = []
      currentField = ''
    } else {
      currentField += char
    }
  }

  if (currentField || current.length > 0) {
    current.push(currentField)
    result.push(current)
  }

  return result.filter((row) => row.length > 0)
}

export { formatNumber }
