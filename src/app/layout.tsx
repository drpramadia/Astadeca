import type { Metadata } from 'next'
import { DM_Sans, Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/hooks/use-session'

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap',
})

const pjsDisplay = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-dm-display',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Astadeca Baswara Persada — ERP',
  description: 'Sistem ERP untuk Cold Storage & Operasional',
  icons: {
    icon: '/logo/astadeca.png',
    shortcut: '/logo/astadeca.png',
    apple: '/logo/astadeca.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id" className={`${dmSans.variable} ${pjsDisplay.variable}`}>
      <head>
        {/* Terapkan tema sebelum render untuk mencegah kedipan */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('astadeca.theme')||'auto';var e=m;if(m==='auto'){var h=new Date().getHours();e=(h>=18||h<6)?'dark':'light';}if(e==='dark')document.documentElement.classList.add('dark');document.documentElement.dataset.theme=e;}catch(_){}})();`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  )
}
