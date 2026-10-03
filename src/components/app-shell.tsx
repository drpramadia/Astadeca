'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Snowflake,
  Warehouse,
  PackageSearch,
  Truck,
  ClipboardCheck,
  Users,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Menu,
  X,
  ShoppingCart,
  FileText,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ChevronLeft,
  BarChart3,
  FolderOpen,
  CreditCard,
  FileSignature,
  Database,
  Settings,
} from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import NotificationBell from '@/components/notification-bell'
import UserMenu from '@/components/user-menu'
import { GlobalSearch } from '@/components/global-search'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
}

type NavGroup = {
  label: string
  icon: React.ElementType
  items: NavItem[]
  badge?: string
}

const DASHBOARD_ITEM: NavItem = {
  label: 'Dashboard',
  href: '/dashboard',
  icon: LayoutDashboard,
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Cold Storage',
    icon: Snowflake,
    badge: '2 unit',
    items: [
      { label: 'Rental Inquiry', href: '/cold-storage/inquiries', icon: PackageSearch },
      { label: 'Kontrak', href: '/cold-storage/contracts', icon: FileText },
      { label: 'Titipan Harian', href: '/cold-storage/spot', icon: PackageSearch },
      { label: 'Rates', href: '/cold-storage/rates', icon: DollarSign },
      { label: 'Billing', href: '/cold-storage/billing', icon: DollarSign },
    ],
  },
  {
    label: 'Penjualan & Pembelian',
    icon: Truck,
    items: [
      { label: 'Permintaan Harga', href: '/operational/quotations', icon: FileSignature },
      { label: 'Purchase Order', href: '/operational/purchase-orders', icon: ShoppingCart },
      { label: 'Sales Order', href: '/operational/sales-orders', icon: FileText },
      { label: 'Surat Jalan', href: '/operational/delivery-orders', icon: Truck },
    ],
  },
  {
    label: 'Warehouse',
    icon: Warehouse,
    items: [
      { label: 'Penerimaan Barang', href: '/warehouse/goods-receipts', icon: ArrowDownToLine },
      { label: 'Pengeluaran Barang', href: '/warehouse/goods-issues', icon: ArrowUpFromLine },
      { label: 'Inventory', href: '/warehouse/inventory', icon: Boxes },
      { label: 'Keranjang & Lokasi', href: '/warehouse/baskets', icon: Boxes },
      { label: 'QC Inspection', href: '/warehouse/qc', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Keuangan',
    icon: BarChart3,
    items: [
      { label: 'Transaksi', href: '/finance/transactions', icon: DollarSign },
      { label: 'Laporan', href: '/finance/reports', icon: BarChart3 },
      { label: 'Payments', href: '/finance/payments', icon: CreditCard },
    ],
  },
  {
    label: 'Data Master',
    icon: Database,
    items: [
      { label: 'Produk', href: '/master/products', icon: Boxes },
      { label: 'Customer', href: '/master/customers', icon: Users },
      { label: 'Supplier', href: '/master/suppliers', icon: Truck },
    ],
  },
  {
    label: 'Dokumen',
    icon: FolderOpen,
    items: [
      { label: 'Dokumen & Cetakan', href: '/documents', icon: FileText },
    ],
  },
  {
    label: 'Administrasi',
    icon: ShieldCheck,
    items: [
      { label: 'Pengguna', href: '/settings/users', icon: Users },
      { label: 'Role & Hak Akses', href: '/settings/roles', icon: ShieldCheck },
      { label: 'Pengaturan Global', href: '/settings/global', icon: Settings },
    ],
  },
]

function getVisibleGroups(roleCode: string | null): (NavGroup | NavItem)[] {
  const visibleGroups = NAV_GROUPS.filter((g) => {
    if (roleCode === 'SYSTEM_ADMIN') return true
    if (roleCode === 'WAREHOUSE') {
      return ['Cold Storage', 'Warehouse', 'Dokumen'].includes(g.label)
    }
    if (roleCode === 'ADMIN') {
      return !['Administrasi'].includes(g.label)
    }
    // DIRECTOR or unknown
    return g.label !== 'Administrasi'
  })

  // Dashboard is always first, as a top-level item (not in a group)
  return [DASHBOARD_ITEM, ...visibleGroups]
}
function NavLink({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? 'text-white bg-cyan-500/20 border-l-2 border-cyan-400 pl-[14px]'
          : 'text-white/50 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span>{item.label}</span>
    </Link>
  )
}

function NavGroupRow({
  group,
  isOpen,
  onToggle,
  activeItem,
}: {
  group: NavGroup
  isOpen: boolean
  onToggle: () => void
  activeItem: string | null
}) {
  const Icon = group.icon
  const hasActive = group.items.some((item) => item.href === activeItem)

  return (
    <div>
      <button
        onClick={onToggle}
        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
          hasActive
            ? 'text-cyan-400 bg-cyan-500/10'
            : 'text-white/60 hover:text-white hover:bg-white/5'
        }`}
      >
        <Icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        {group.badge && (
          <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold">
            {group.badge}
          </span>
        )}
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5" />
        )}
      </button>

      {isOpen && (
        <div className="mt-1 ml-4 space-y-0.5 border-l border-white/10 pl-3">
          {group.items.map((item) => (
            <NavLink key={item.href} item={item} isActive={activeItem === item.href} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { roleCode, loaded, userId } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const expanded = hovered

  useEffect(() => {
    if (loaded && !userId) {
      router.replace('/login')
    }
  }, [loaded, userId, router])

  const visibleNav = getVisibleGroups(roleCode)

  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('astadeca.nav.open') : null
      if (saved) JSON.parse(saved).forEach((label: string) => initial.add(label))
    } catch {
      /* ignore corrupt storage */
    }
    visibleNav.forEach((item) => {
      if ('items' in item) {
        if (item.items.some((i) => pathname.startsWith(i.href))) {
          initial.add(item.label)
        }
      }
    })
    if (initial.size === 0 && visibleNav.length > 0) {
      const firstGroup = visibleNav.find((g) => 'items' in g)
      if (firstGroup) initial.add(firstGroup.label)
    }
    return initial
  })

  // Persist which nav groups are open
  useEffect(() => {
    try {
      window.localStorage.setItem('astadeca.nav.open', JSON.stringify(Array.from(openGroups)))
    } catch {
      /* ignore */
    }
  }, [openGroups])

  // Keep the group containing the active route open when navigating
  useEffect(() => {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      visibleNav.forEach((item) => {
        if ('items' in item && item.items.some((i) => pathname.startsWith(i.href))) {
          next.add(item.label)
        }
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  function toggleGroup(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev)
      if (next.has(label)) {
        next.delete(label)
      } else {
        next.add(label)
      }
      return next
    })
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f8fafc' }}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col
          transition-all duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${expanded ? 'w-[286px]' : 'w-[68px]'}
        `}
        style={{ backgroundColor: '#1a2a32' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/astadeca.png" alt="Astadeca Baswara Persada" className="w-full h-full object-contain" />
          </div>
          {expanded && (
            <div className="overflow-hidden">
              <p className="text-white font-bold text-sm leading-tight truncate font-display">
                Astadeca Baswara Persada
              </p>
              <p className="text-white/40 text-xs leading-tight truncate">
                Cold Storage ERP
              </p>
            </div>
          )}
          <button
            onClick={() => setHovered(!hovered)}
            className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={expanded ? 'Tutup sidebar' : 'Buka sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${expanded ? 'rotate-0' : 'rotate-180'}`} />
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleNav.map((item) => {
            if ('items' in item) {
              return (
                <NavGroupRow
                  key={item.label}
                  group={item}
                  isOpen={openGroups.has(item.label)}
                  onToggle={() => toggleGroup(item.label)}
                  activeItem={pathname}
                />
              )
            }
            return <NavLink key={item.href} item={item} isActive={pathname === item.href} />
          })}
        </nav>

        {/* Mobile close button */}
        <div className="flex-shrink-0 px-4 pb-4 lg:hidden">
          <button
            onClick={() => setSidebarOpen(false)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
            <span className="text-sm">Tutup</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex items-center justify-between h-14 px-4 border-b border-slate-200 bg-white flex-shrink-0 lg:hidden">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              aria-label="Buka menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/astadeca.png" alt="Astadeca Baswara Persada" className="w-6 h-6 object-contain" />
            <span className="font-bold text-slate-800 font-display text-sm">Astadeca Baswara Persada</span>
          </div>
          <div className="flex items-center gap-1">
            <GlobalSearch />
            <NotificationBell />
            <UserMenu />
          </div>
        </header>

        {/* Top bar (desktop) */}
        <header className="hidden lg:flex items-center gap-2 h-16 px-8 border-b border-slate-200 bg-white flex-shrink-0">
          <GlobalSearch />
          <NotificationBell />
          <div className="w-px h-8 bg-slate-200 mx-1" />
          <UserMenu />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
