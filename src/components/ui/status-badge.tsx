import React from 'react'
import { getBadgeTone } from '@/lib/utils'

interface StatusBadgeProps {
  status: string
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getBadgeTone(status)}`}>
      {label ?? status}
    </span>
  )
}
