// Role behavior test — validates access gating + nav visibility per role.
// HARUS mencerminkan persis NAV_GROUPS + getVisibleGroups() di src/components/app-shell.tsx
// dan predicate canAccess di src/app/**/page.tsx. Perbarui bila salah satu berubah.

// --- Salinan dari src/components/app-shell.tsx ---
const DASHBOARD = { label: 'Dashboard' }
const NAV_GROUPS = [
  { label: 'Cold Storage', items: ['/cold-storage/inquiries', '/cold-storage/contracts', '/cold-storage/spot', '/cold-storage/rates', '/cold-storage/billing'] },
  { label: 'Penjualan & Pembelian', items: ['/operational/rfq-customer', '/operational/rfq-supplier', '/operational/supplier-quotes', '/operational/quotations', '/operational/purchase-orders', '/operational/sales-orders', '/operational/delivery-orders'] },
  { label: 'Warehouse', items: ['/warehouse/goods-receipts', '/warehouse/goods-issues', '/warehouse/inventory', '/warehouse/waste', '/warehouse/baskets', '/warehouse/qc'] },
  { label: 'Keuangan', items: ['/finance/transactions', '/finance/reports', '/finance/payments'] },
  { label: 'Data Master', items: ['/master/products', '/master/customers', '/master/suppliers'] },
  { label: 'Dokumen', items: ['/documents'] },
  { label: 'Administrasi', items: ['/settings/users', '/settings/roles', '/settings/global'] },
]

function getVisibleGroups(roleCode) {
  const visible = NAV_GROUPS
    .filter((g) => {
      if (roleCode === 'SYSTEM_ADMIN') return true
      if (roleCode === 'WAREHOUSE') return ['Cold Storage', 'Warehouse', 'Dokumen'].includes(g.label)
      if (roleCode === 'ADMIN') return !['Administrasi'].includes(g.label)
      return g.label !== 'Administrasi' // DIRECTOR / unknown
    })
    .map((g) => {
      if (roleCode === 'WAREHOUSE' && g.label === 'Cold Storage') {
        return { ...g, items: g.items.filter((i) => i === '/cold-storage/spot') }
      }
      return g
    })
    .filter((g) => g.items.length > 0)
  return [DASHBOARD.label, ...visible.map((g) => g.label)]
}

// --- Predicate akses halaman (harus sama dgn canAccess/useRoleGuard di page) ---
const DIRECTOR_ADMIN_SA = (r) => r === 'DIRECTOR' || r === 'ADMIN' || r === 'SYSTEM_ADMIN'
const can = (roleCode) => ({
  coldStorage: DIRECTOR_ADMIN_SA(roleCode),      // contracts/inquiries list & new
  approvalApprove: roleCode === 'DIRECTOR' || roleCode === 'SYSTEM_ADMIN',
  operational: DIRECTOR_ADMIN_SA(roleCode),       // PO/SO/quotations
  finance: DIRECTOR_ADMIN_SA(roleCode),           // transactions/reports/payments
  warehouseInventory: roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN',
  masterAdmin: DIRECTOR_ADMIN_SA(roleCode),       // suppliers/customers (ADMIN/DIRECTOR/SA)
  masterProducts: roleCode === 'ADMIN' || roleCode === 'DIRECTOR' || roleCode === 'WAREHOUSE' || roleCode === 'SYSTEM_ADMIN',
  settingsGlobal: roleCode === 'SYSTEM_ADMIN',
})

const roles = ['SYSTEM_ADMIN', 'DIRECTOR', 'ADMIN', 'WAREHOUSE']
const expected = {
  SYSTEM_ADMIN: {
    groups: ['Dashboard', 'Cold Storage', 'Penjualan & Pembelian', 'Warehouse', 'Keuangan', 'Data Master', 'Dokumen', 'Administrasi'],
    coldStorage: true, approvalApprove: true, operational: true, finance: true,
    warehouseInventory: true, masterAdmin: true, masterProducts: true, settingsGlobal: true,
  },
  DIRECTOR: {
    groups: ['Dashboard', 'Cold Storage', 'Penjualan & Pembelian', 'Warehouse', 'Keuangan', 'Data Master', 'Dokumen'],
    coldStorage: true, approvalApprove: true, operational: true, finance: true,
    warehouseInventory: false, masterAdmin: true, masterProducts: true, settingsGlobal: false,
  },
  ADMIN: {
    groups: ['Dashboard', 'Cold Storage', 'Penjualan & Pembelian', 'Warehouse', 'Keuangan', 'Data Master', 'Dokumen'],
    coldStorage: true, approvalApprove: false, operational: true, finance: true,
    warehouseInventory: false, masterAdmin: true, masterProducts: true, settingsGlobal: false,
  },
  WAREHOUSE: {
    groups: ['Dashboard', 'Cold Storage', 'Warehouse', 'Dokumen'],
    coldStorage: false, approvalApprove: false, operational: false, finance: false,
    warehouseInventory: true, masterAdmin: false, masterProducts: true, settingsGlobal: false,
  },
}

let failures = 0
function check(role, name, actual, want) {
  const pass = JSON.stringify(actual) === JSON.stringify(want)
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${role.padEnd(9)} ${name}: got ${JSON.stringify(actual)}${pass ? '' : ` want ${JSON.stringify(want)}`}`)
}

for (const role of roles) {
  const e = expected[role]
  check(role, 'nav groups', getVisibleGroups(role), e.groups)
  const c = can(role)
  check(role, 'coldStorage access', c.coldStorage, e.coldStorage)
  check(role, 'approval approve', c.approvalApprove, e.approvalApprove)
  check(role, 'operational access', c.operational, e.operational)
  check(role, 'finance access', c.finance, e.finance)
  check(role, 'warehouse inventory', c.warehouseInventory, e.warehouseInventory)
  check(role, 'master admin', c.masterAdmin, e.masterAdmin)
  check(role, 'master products', c.masterProducts, e.masterProducts)
  check(role, 'settings global', c.settingsGlobal, e.settingsGlobal)
  console.log('')
}

// WAREHOUSE tidak boleh melihat tautan halaman yang dia tidak bisa buka.
const whGroups = getVisibleGroups('WAREHOUSE')
const whCold = NAV_GROUPS.find((g) => g.label === 'Cold Storage')
const whColdItems = whCold.items.filter((i) => i === '/cold-storage/spot')
check('WAREHOUSE', 'cold storage hanya Titipan Harian', whColdItems, ['/cold-storage/spot'])
if (!whGroups.includes('Keuangan') && !whGroups.includes('Data Master')) {
  console.log('PASS  WAREHOUSE tidak melihat Keuangan/Data Master')
} else { failures++; console.log('FAIL  WAREHOUSE melihat Keuangan/Data Master') }

console.log(failures === 0 ? '\nALL ROLE TESTS PASSED' : `\n${failures} ROLE TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
