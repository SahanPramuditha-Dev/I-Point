# Inventory Phase 1 Gap Audit

Status legend:
- Done: Implemented and usable
- Partial: Implemented but missing required features
- Missing: Not implemented

## Products (`/inventory/products`)
Status: Partial

Done:
- Add/edit/delete flow
- Search and multi-filter controls
- SKU and barcode support (including generate button)
- Cost/selling/warranty/stock fields
- Supplier assignment
- Product actions: edit, view, print barcode, stock adjust, delete
- List/grid views

Gaps:
- Product image upload (currently URL field only)
- Pagination
- Export CSV/PDF
- Full keyboard workflow polish

## Categories (`/inventory/categories`)
Status: Partial

Done:
- Add/edit/delete
- Parent category support
- Category icon text field
- Internal scroll table

Gaps:
- Category filtering/search
- Product count per category
- Image upload/management
- Pagination/export

## Brands (`/inventory/brands`)
Status: Partial

Done:
- Add/edit/delete
- Brand logo URL field

Gaps:
- Brand filtering/search
- Brand-wise product count
- Internal scrolling constraints for large datasets
- Pagination/export

## Suppliers (`/inventory/suppliers`)
Status: Partial

Done:
- Add/edit/delete
- Basic contact field

Gaps:
- Supplier search/filter
- Expanded profile/contact details
- Supplier products mapping
- Purchase history/outstanding/payment tracking/notes
- Pagination/export

## Movements (`/inventory/movements`)
Status: Partial

Done:
- Movement table with internal scrolling
- Shows type, quantity, reference, note, time

Gaps:
- Product/user/date filters
- Dedicated stock in/out/adjustment filters
- Export CSV/PDF
- Pagination

## Cross-cutting Phase 1 gaps
- Standardized pagination component
- CSV/PDF export utilities
- Shared table toolbar (search/filter/actions)
- Empty/loading/error state consistency on all pages
