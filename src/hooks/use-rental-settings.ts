'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'

export type RentalSettings = {
  tariff_per_kg_per_day: number
  billing_period_days: number
  minimum_days: number
  expiry_alert_days: number
  spot_mode: string
  excess_policy: string
  minimum_1_ton: boolean
}

export const DEFAULT_RENTAL_SETTINGS: RentalSettings = {
  tariff_per_kg_per_day: 100,
  billing_period_days: 7,
  minimum_days: 1,
  expiry_alert_days: 3,
  spot_mode: 'UPFRONT',
  excess_policy: 'CARRY_OVER',
  minimum_1_ton: true,
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
          expiry_alert_days: map['rental.expiry_alert_days'] ? Number(map['rental.expiry_alert_days']) : DEFAULT_RENTAL_SETTINGS.expiry_alert_days,
          spot_mode: map['rental.spot_mode'] || DEFAULT_RENTAL_SETTINGS.spot_mode,
          excess_policy: map['rental.excess_policy'] || DEFAULT_RENTAL_SETTINGS.excess_policy,
          minimum_1_ton: map['rental.minimum_1_ton'] !== 'false',
        })
        setLoaded(true)
      })
    return () => { cancelled = true }
  }, [organizationId])

  return { settings, loaded }
}
