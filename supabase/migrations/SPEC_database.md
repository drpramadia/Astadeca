# ERP Astadeca — Database Schema Migration

## Users & Auth
- auth.users (Supabase managed)
- public.profiles (id FK → auth.users, full_name, phone, username TEXT UNIQUE)
- public.organizations (id, name, created_at)
- public.roles (id, name, code UNIQUE — DIRECTOR, ADMIN, WAREHOUSE)
- public.organization_memberships (id, user_id → profiles.id, organization_id → organizations.id, role_id → roles.id, is_active BOOLEAN DEFAULT true)

## Cold Storage Rental
- cold_storages (id, organization_id, name, code, capacity_kg, temperature_min_c, temperature_max_c, status)
- cold_storage_zones (id, cold_storage_id, name, code)
- cold_storage_baskets (id, zone_id, code, capacity_kg, status)
- rental_customers (id, organization_id, name, email, phone, address)
- rental_inquiries (id, organization_id, customer_id, cold_storage_id, requested_kg, start_date, end_date, status, created_by)
- rental_rates (id, organization_id, cold_storage_id, price_per_kg_per_day, minimum_days, minimum_kg, status DEFAULT 'ACTIVE')
- rental_contracts (id, organization_id, customer_id, cold_storage_id, contract_number, start_date, end_date, price_per_kg_per_day, total_estimated_kg, status, approval_request_id)
- rental_contract_allocations (id, contract_id, basket_id, allocated_kg)
- rental_receivings (id, organization_id, contract_id, received_kg, received_at, received_by, notes)
- rental_releases (id, organization_id, contract_id, released_kg, released_at, released_by, delivery_order_id, notes)
- rental_billing (id, organization_id, contract_id, invoice_number, period_start, period_end, total_amount, status, created_by)
- rental_billing_lines (id, billing_id, description, quantity_kg, price_per_kg, subtotal)

## Operasional / Inventory
- suppliers (id, organization_id, name, email, phone, address)
- customers (id, organization_id, name, email, phone, address, type — BUYER/SELLER/BOTH)
- products (id, organization_id, name, sku UNIQUE per org, category_id, unit_id, is_active)
- product_categories (id, organization_id, name, code)
- units (id, name, abbreviation)
- inventory (id, organization_id, product_id, batch_number, quantity_kg, quantity_units, status — AVAILABLE/QUARANTINE/RESERVED/USED, cold_storage_id, basket_id, expiry_date, received_at)
- purchase_orders (id, organization_id, supplier_id, po_number, status, total_amount, notes, approval_request_id, created_by)
- purchase_order_lines (id, po_id, product_id, quantity_kg, price_per_kg, subtotal)
- goods_receipts (id, organization_id, po_id, gr_number, received_at, received_by, notes)
- goods_receipt_lines (id, gr_id, product_id, batch_number, quantity_kg, quantity_received, condition — GOOD/DAMAGED/REJECTED)
- sales_orders (id, organization_id, customer_id, so_number, status, total_amount, notes, approval_request_id, created_by)
- sales_order_lines (id, so_id, product_id, quantity_kg, price_per_kg, subtotal)

## Warehouse & QC
- qc_inspections (id, organization_id, gr_id, inspector_user_id, status, notes, inspected_at)
- qc_inspection_lines (id, inspection_id, gr_line_id, condition, notes)
- inventory_movements (id, organization_id, movement_type — IN/OUT/TRANSFER/ADJUST, product_id, batch_number, quantity_kg, from_location, to_location, reference_type, reference_id, performed_by, performed_at, notes)

## Delivery / Surat Jalan
- delivery_requests (id, organization_id, requested_by_user_id, status — PENDING/APPROVED/REJECTED, notes, created_at)
- delivery_orders (id, organization_id, do_number, delivery_request_id, customer_id, driver_name, vehicle_number, status — DRAFT/PRINTED/RELEASED/CANCELLED, notes, created_by, printed_at)
- delivery_order_lines (id, do_id, product_id, batch_number, quantity_kg, so_line_id)

## Keuangan
- accounts (id, organization_id, name, code, type — ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE, parent_id)
- transactions (id, organization_id, transaction_date, description, amount, type — DEBIT/CREDIT, account_id, reference_type, reference_id, created_by)
- approval_requests (id, organization_id, request_type, reference_id, status — PENDING/APPROVED/REJECTED, requested_by, decided_by, decided_at, comment)

## Documents & Settings
- documents (id, organization_id, doc_type, doc_number, reference_type, reference_id, file_url, created_by, created_at)
- organization_settings (id, organization_id, key, value)

## Sequences
- contract_number (format: KONTRAK/YYYY/MM/NNNN)
- invoice_number (format: INV/YYYY/MM/NNNN)
- gr_number (format: GR/YYYY/MM/NNNN)
- do_number (format: DO/YYYY/MM/NNNN)
- po_number (format: PO/YYYY/MM/NNNN)
- so_number (format: SO/YYYY/MM/NNNN)

## Key RPCs
- login_with_username(p_username, p_password) → {success, email}
- get_my_permissions() → TABLE(permission_code)
- has_org_permission(org_id, permission_code) → BOOLEAN
- approve_po(p_po_id, p_performed_by) — creates approval_request + updates status
- approve_so(p_so_id, p_performed_by)
- approve_contract(p_contract_id, p_performed_by)
- create_rental_contract(...) — creates contract + approval_request
- generate_number(p_prefix) — auto number
- receive_inventory(...) — creates movement IN
- release_inventory(...) — creates movement OUT
- apply_qc_inspection(...) — updates GR + inventory status

## Aturan Sewa Cold Storage (per migrasi 022)
- Barang dapat dikeluarkan kapan saja: TIDAK ada gate "harus lunas" dan
  TIDAK ada approval Director untuk pengeluaran barang (RENTAL_RELEASE).
- Penagihan otomatis mengikuti perjanjian kontrak:
  `calculate_rental_billing` menghitung dari barang aktual di gudang ×
  `price_per_kg_per_day`, dengan MINIMUM 1 TON. Bila saldo barang < 1.000 kg,
  kg ditagih = 1.000 kg. Diatur per kontrak via kolom `minimum_1_ton`
  (default true). Periode tagih dari `organization_settings.rental.billing_period_days`
  (default 7 = mingguan).
- Input perjanjian penagihan dilakukan saat membuat kontrak (form kontrak):
  tarif per kg/hari + opsi minimum 1 ton.

## Snapshot Harian & Rincian Penagihan (per migrasi 024)
- `rental_daily_usage` menyimpan snapshot per hari per kontrak:
  `usage_date`, `actual_kg` (stok riil), `billed_kg` (kg ditagih, min 1 ton bila
  diaktifkan), `rate`, `subtotal`. Dibangun ulang via
  `rebuild_rental_daily_usage(contract_id)` — dipicu otomatis setiap barang
  masuk/keluar (trigger `refresh_daily_usage_on_receiving`/`_on_release`).
- `calculate_rental_billing` mengakumulasi snapshot periode dan membuat
  SATU BARIS INVOICE PER HARI (hari berisi stok; hari kosong tidak menagih).
- Alur: barang masuk/keluar dicatat per hari -> snapshot harian -> saat
  penagihan, snapshot dijumlahkan menjadi total invoice.

## Penerbitan Invoice Manual (per migrasi 025)
- Invoice TIDAK terbit otomatis saat barang masuk/keluar. Trigger
  `trg_receiving_billing` & `trg_release_billing` dihapus.
- Admin/Director menerbitkan invoice lewat tombol "Terbitkan Invoice"
  di halaman Billing (memanggil `calculate_rental_billing` sesuai periode
  tagih berjalan, default 7 hari/mingguan).
- Snapshot harian (`refresh_daily_usage_*`) tetap berjalan otomatis agar
  kg per hari tetap tercatat.

## Sinkronisasi Penjualan/Pembelian -> Keuangan (per migrasi 028)
- `sync_po_finance(id)` / `sync_so_finance(id)` menghitung ulang total dari
  lines, menulis `total_amount` pada header, dan membuat/menyesuaikan transaksi
  (DEBIT untuk PO, CREDIT untuk SO) saat status APPROVED — idempoten (tidak dobel).
- Trigger dipasang pada header (insert/update status/total) DAN pada lines
  (insert/update/delete) sehingga total & transaksi selalu konsisten, termasuk
  saat dokumen dibuat langsung APPROVED (lines menyusul) atau lines diubah.
- Backfill dijalankan sekali untuk menyelaraskan data lama.

## Monitoring & Notifikasi Penagihan (per migrasi 026)
- `notify_rental_billing_due(org_id)` mengirim notifikasi ke ADMIN/DIRECTOR/
  SYSTEM_ADMIN untuk invoice SENT (pengingat) & OVERDUE (jatuh tempo).
  Route notifikasi `RENTAL_BILLING` -> halaman detail invoice.
- `mark_overdue_rental_billing(org_id)` menandai invoice SENT yang lewat
  periode menjadi OVERDUE.
- Dashboard memanggil keduanya saat dimuat (role finance) sebagai monitoring.
- Dashboard: panel "Penagihan" menampilkan jumlah invoice belum lunas,
  jatuh tempo, dan nilai tagihan; chart kapasitas memakai stok tersimpan vs
  total kapasitas (bukan jumlah kontrak).

## Permissions
ADMIN: rental.*, inventory.*, purchase.*, sales.*, finance.*, admin.*, documents.*, reports.*
WAREHOUSE: inventory.view, inventory.receive, inventory.issue, qc.*
DIRECTOR: same as ADMIN + approval.approve
