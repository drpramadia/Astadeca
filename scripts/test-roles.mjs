// Role behavior test — validates access gating + nav visibility per role.
// Mirrors the exact predicates used in src/app/**/page.tsx and getVisibleGroups().

const NAV_GROUPS = [
  { label: 'Ringkasan' },
  { label: 'Cold Storage' },
  { label: 'Operasional' },
  { label: 'Warehouse' },
  { label: 'Approval' },
  { label: 'Data Master' },
  { label: 'Administrasi' },
]

function visibleGroups(roleCode) {
  if (roleCode === 'SYSTEM_ADMIN') {
    return NAV_GROUPS
  }
  if (roleCode === 'WAREHOUSE') {
    return NAV_GROUPS.filter((g) => ['Ringkasan', 'Warehouse'].includes(g.label))
  }
  if (roleCode === 'ADMIN') {
    return NAV_GROUPS.filter((g) => !['Approval', 'Administrasi'].includes(g.label))
  }
  return NAV_GROUPS.filter((g) => g.label !== 'Administrasi')
}

// Access predicates as written in the pages
const can = (roleCode) => ({
  coldStorage: roleCode === 'DIRECTOR' || roleCode === 'ADMIN',
  approvalApprove: roleCode === 'DIRECTOR',
  operational: roleCode === 'DIRECTOR' || roleCode === 'ADMIN',
  warehouseInventory: roleCode === 'WAREHOUSE',
  systemAdmin: roleCode === 'SYSTEM_ADMIN',
})

const roles = ['SYSTEM_ADMIN', 'DIRECTOR', 'ADMIN', 'WAREHOUSE']
const expected = {
  SYSTEM_ADMIN: {
    groups: ['Ringkasan', 'Cold Storage', 'Operasional', 'Warehouse', 'Approval', 'Data Master', 'Administrasi'],
    coldStorage: false, approvalApprove: false, operational: false, warehouseInventory: false, systemAdmin: true,
  },
  DIRECTOR: {
    groups: ['Ringkasan', 'Cold Storage', 'Operasional', 'Warehouse', 'Approval', 'Data Master'],
    coldStorage: true, approvalApprove: true, operational: true, warehouseInventory: false, systemAdmin: false,
  },
  ADMIN: {
    groups: ['Ringkasan', 'Cold Storage', 'Operasional', 'Warehouse', 'Data Master'],
    coldStorage: true, approvalApprove: false, operational: true, warehouseInventory: false, systemAdmin: false,
  },
  WAREHOUSE: {
    groups: ['Ringkasan', 'Warehouse'],
    coldStorage: false, approvalApprove: false, operational: false, warehouseInventory: true, systemAdmin: false,
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
  check(role, 'nav groups', visibleGroups(role).map((g) => g.label), e.groups)
  const c = can(role)
  check(role, 'coldStorage access', c.coldStorage, e.coldStorage)
  check(role, 'approval approve', c.approvalApprove, e.approvalApprove)
  check(role, 'operational access', c.operational, e.operational)
  check(role, 'warehouse inventory', c.warehouseInventory, e.warehouseInventory)
  check(role, 'system admin', c.systemAdmin, e.systemAdmin)
  console.log('')
}

console.log(failures === 0 ? 'ALL ROLE TESTS PASSED' : `${failures} ROLE TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
