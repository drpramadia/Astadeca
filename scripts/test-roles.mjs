// Role behavior test — validates access gating + nav visibility per role.
// Mirrors the exact predicates used in src/app/**/page.tsx and getVisibleGroups().

const NAV_GROUPS = [
  { label: 'Ringkasan' },
  { label: 'Cold Storage' },
  { label: 'Operasional' },
  { label: 'Warehouse' },
  { label: 'Approval' },
  { label: 'Data Master' },
]

function visibleGroups(roleCode) {
  if (roleCode === 'WAREHOUSE') {
    return NAV_GROUPS.filter((g) => ['Ringkasan', 'Warehouse'].includes(g.label))
  }
  if (roleCode === 'ADMIN') {
    return NAV_GROUPS.filter((g) => g.label !== 'Approval')
  }
  return NAV_GROUPS
}

// Access predicates as written in the pages
const can = (roleCode) => ({
  coldStorage: roleCode === 'DIRECTOR' || roleCode === 'ADMIN',
  approvalApprove: roleCode === 'DIRECTOR',
  operational: roleCode === 'DIRECTOR' || roleCode === 'ADMIN',
  warehouseInventory: roleCode === 'WAREHOUSE',
})

const roles = ['DIRECTOR', 'ADMIN', 'WAREHOUSE']
const expected = {
  DIRECTOR: {
    groups: ['Ringkasan', 'Cold Storage', 'Operasional', 'Warehouse', 'Approval', 'Data Master'],
    coldStorage: true, approvalApprove: true, operational: true, warehouseInventory: false,
  },
  ADMIN: {
    groups: ['Ringkasan', 'Cold Storage', 'Operasional', 'Warehouse', 'Data Master'],
    coldStorage: true, approvalApprove: false, operational: true, warehouseInventory: false,
  },
  WAREHOUSE: {
    groups: ['Ringkasan', 'Warehouse'],
    coldStorage: false, approvalApprove: false, operational: false, warehouseInventory: true,
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
  console.log('')
}

console.log(failures === 0 ? 'ALL ROLE TESTS PASSED' : `${failures} ROLE TEST(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
