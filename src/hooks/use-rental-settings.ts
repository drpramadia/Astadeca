'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type RentalSettings = {
  tariff_per_kg_per_day: number
  billing_period_days: number
  minimum_days: number
  spot_mode: string
  excess_policy: string
  require_paid_before_release: boolean
  require_approval_release: boolean
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  tariff_per_kg_per_day: 100,
  billing_period_days: 14,
  minimum_days: 1,
  spot_mode: 'UPFRONT',
  excess_policy: 'CARRY_OVER',
  require_paid_before_release: true,
  require_approval_release: true,
}

/** Baca pengaturan global rental dari organization_settings. */
export function useRentalSettings(organizationId: string | null) {
  const [settings, setSettings] = useState<RentalSettings>(DEFAULT_RENTAL_SETTINGS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!organizationId) return
    let cancelled = false
    supabase
      .from('organization_settings')
      .select('key, value')
      .eq('organization_id', organizationId)
      .then(({ data }) => {
        if (cancelled) return
        const map: Record<string, string> = {}
        ;(data || []).forEach((s: { key: string; value: string | null }) => { map[s.key] = s.value ?? '' })
        setSettings({
          tariff_per_kg_per_day: map['rental.tariff_per_kg_per_day'] ? Number(map['rental.tariff_per_kg_per_day']) : DEFAULT_RENTAL_SETTINGS.tariff_per_kg_per_day,
          billing_period_days: map['rental.billing_period_days'] ? Number(map['rental.billing_period_days']) : DEFAULT_RENTAL_SETTINGS.billing_period_days,
          minimum_days: map['rental.minimum_days'] ? Number(map['rental.minimum_days']) : DEFAULT_RENTAL_SETTINGS.minimum_days,
          spot_mode: map['rental.spot_mode'] || DEFAULT_RENTAL_SETTINGS.spot_mode,
          excess_policy: map['rental.excess_policy'] || DEFAULT_RENTAL_SETTINGS.excess_policy,
          require_paid_before_release: map['rental.require_paid_before_release'] !== 'false',
          require_approval_release: map['rental.require_approval_release'] !== 'false',
        })
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [organizationId])

  return { settings, loaded }
}
