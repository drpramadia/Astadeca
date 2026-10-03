'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** Render QR code sebagai <img> dari data URL. */
export function QrCode({ value, size = 120, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string>('')

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setSrc(url) })
      .catch(() => { if (!cancelled) setSrc('') })
    return () => { cancelled = true }
  }, [value, size])

  if (!src) {
    return <div style={{ width: size, height: size }} className={`bg-slate-100 rounded ${className ?? ''}`} />
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={`QR ${value}`} className={className} />
}
