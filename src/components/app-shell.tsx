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
} from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import LogoutButton from '@/components/logout-button'

// ─── Types ───────────────────────────────────────────────────────────────────

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
}

type NavGroup = {
  label: string
  icon: React.ElementType
  items: NavItem[]
}

// ─── Navigation Config ───────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Ringkasan',
    icon: LayoutDashboard,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Cold Storage',
    icon: Snowflake,
    items: [
      { label: 'Rental Inquiry', href: '/cold-storage/inquiries', icon: PackageSearch },
      { label: 'Kontrak', href: '/cold-storage/contracts', icon: FileText },
      { label: 'Rates', href: '/cold-storage/rates', icon: DollarSign },
      { label: 'Billing', href: '/cold-storage/billing', icon: DollarSign },
    ],
  },
  {
    label: 'Operasional',
    icon: Truck,
    items: [
      { label: 'Purchase Order', href: '/operational/purchase-orders', icon: ShoppingCart },
      { label: 'Sales Order', href: '/operational/sales-orders', icon: FileText },
      { label: 'Delivery Orders', href: '/operational/delivery-orders', icon: Truck },
    ],
  },
  {
    label: 'Warehouse',
    icon: Warehouse,
    items: [
      { label: 'Penerimaan Barang', href: '/warehouse/goods-receipts', icon: ArrowDownToLine },
      { label: 'Pengeluaran Barang', href: '/warehouse/goods-issues', icon: ArrowUpFromLine },
      { label: 'Inventory', href: '/warehouse/inventory', icon: Boxes },
      { label: 'QC Inspection', href: '/warehouse/qc', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Approval',
    icon: ClipboardCheck,
    items: [
      { label: 'Persetujuan', href: '/approval/requests', icon: ClipboardCheck },
    ],
  },
  {
    label: 'Data Master',
    icon: Users,
    items: [
      { label: 'Data Master', href: '/master-data', icon: Users },
    ],
  },
  {
    label: 'Administrasi',
    icon: ShieldCheck,
    items: [
      { label: 'Pengguna', href: '/settings/users', icon: Users },
      { label: 'Role & Hak Akses', href: '/settings/roles', icon: ShieldCheck },
    ],
  },
]

// ─── Role → visible groups ───────────────────────────────────────────────────

function getVisibleGroups(roleCode: string | null): NavGroup[] {
  if (roleCode === 'SYSTEM_ADMIN') {
    return NAV_GROUPS
  }
  if (roleCode === 'WAREHOUSE') {
    return NAV_GROUPS.filter((g) =>
      ['Ringkasan', 'Warehouse'].includes(g.label)
    )
  }
  if (roleCode === 'ADMIN') {
    return NAV_GROUPS.filter((g) => !['Approval', 'Administrasi'].includes(g.label))
  }
  // DIRECTOR or unknown: everything except platform administration
  return NAV_GROUPS.filter((g) => g.label !== 'Administrasi')
}

// ─── Sidebar nav item ─────────────────────────────────────────────────────────

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

// ─── Collapsible group ───────────────────────────────────────────────────────

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

// ─── App Shell ───────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { name, roleName, roleCode, loaded, userId } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (loaded && !userId) {
      router.replace('/login')
    }
  }, [loaded, userId, router])

  const visibleGroups = getVisibleGroups(roleCode)
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    // Auto-open groups that contain the active route
    const initial = new Set<string>()
    visibleGroups.forEach((g) => {
      if (g.items.some((item) => pathname.startsWith(item.href))) {
        initial.add(g.label)
      }
    })
    // Always open first group if nothing is active
    if (initial.size === 0 && visibleGroups.length > 0) {
      initial.add(visibleGroups[0].label)
    }
    return initial
  })

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

  function getRoleBadgeClass(role: string | null) {
    switch (role?.toUpperCase()) {
      case 'DIRECTOR':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'ADMIN':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      case 'WAREHOUSE':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      default:
        return 'bg-white/10 text-white/60 border-white/20'
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#f8fafc' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 flex flex-col
          transition-transform duration-300 ease-in-out
          lg:relative lg:translate-x-0 lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${collapsed ? 'lg:w-[68px]' : 'w-[286px]'}
        `}
        style={{ backgroundColor: '#1a2a32' }}
      >
        {/* Brand header */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 flex-shrink-0">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0 bg-white/95 p-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/astadeca.png" alt="Astadeca Baswara Persada" className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
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
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto hidden lg:flex items-center justify-center w-7 h-7 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
            aria-label={collapsed ? 'Buka sidebar' : 'Tutup sidebar'}
          >
            <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* User info */}
        {loaded && (
          <div className="px-4 py-4 border-b border-white/10 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold text-white bg-cyan-500/30 border border-cyan-500/30">
                {(name ?? 'U')
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase()}
              </div>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{name ?? 'User'}</p>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${getRoleBadgeClass(
                      roleName
                    )}`}
                  >
                    {roleName ?? 'Guest'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleGroups.map((group) => (
            <NavGroupRow
              key={group.label}
              group={group}
              isOpen={openGroups.has(group.label)}
              onToggle={() => toggleGroup(group.label)}
              activeItem={pathname}
            />
          ))}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar (mobile) */}
        <header className="flex items-center h-14 px-4 border-b border-slate-200 bg-white flex-shrink-0 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Buka menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="ml-3 flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/astadeca.png" alt="Astadeca Baswara Persada" className="w-6 h-6 object-contain" />
            <span className="font-bold text-slate-800 font-display text-sm">Astadeca Baswara Persada</span>
          </div>
        </header>

        {/* Top bar (desktop) */}
        <header className="hidden lg:flex items-center justify-end h-16 px-8 border-b border-slate-200 bg-white flex-shrink-0">
          <div className="flex items-center gap-3">
            {loaded && (
              <div className="text-right leading-tight">
                <p className="text-sm font-medium text-slate-700">{name ?? 'User'}</p>
                <p className="text-xs text-slate-400">{roleName ?? 'Guest'}</p>
              </div>
            )}
            <LogoutButton />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
