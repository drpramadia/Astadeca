'use client'

import { useEffect, useState } from 'react'

export type ThemeMode = 'light' | 'dark' | 'auto'

const STORAGE_KEY = 'astadeca.theme'

/** Tentukan tema efektif. Mode 'auto' mengikuti jam: gelap 18:00–06:00. */
export function resolveTheme(mode: ThemeMode, date = new Date()): 'light' | 'dark' {
  if (mode === 'auto') {
    const h = date.getHours()
    return h >= 18 || h < 6 ? 'dark' : 'light'
  }
  return mode
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  const effective = resolveTheme(mode)
  document.documentElement.classList.toggle('dark', effective === 'dark')
  document.documentElement.dataset.theme = effective
}

/** Hook tema global. Menyimpan mode (light/dark/auto) dan menerapkannya. */
export function useTheme() {
  const [mode, setMode] = useState<ThemeMode>('auto')
  const [effective, setEffective] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const saved = (typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null) as ThemeMode | null
    const initial: ThemeMode = saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
    setMode(initial)
    const eff = resolveTheme(initial)
    setEffective(eff)
    applyTheme(initial)
  }, [])

  // Mode auto: perbarui saat jam berganti (cek tiap menit)
  useEffect(() => {
    if (mode !== 'auto') return
    const t = window.setInterval(() => {
      const eff = resolveTheme('auto')
      setEffective(eff)
      applyTheme('auto')
    }, 60000)
    return () => window.clearInterval(t)
  }, [mode])

  function change(next: ThemeMode) {
    setMode(next)
    const eff = resolveTheme(next)
    setEffective(eff)
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, next)
    applyTheme(next)
  }

  return { mode, effective, setMode: change }
}
