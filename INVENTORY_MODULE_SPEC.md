# Inventory Module Spec

## Scope
This document defines the required pages and features for the Inventory Module.

## 1. Overview Page
Purpose: Main inventory control dashboard.

Features:
- Total products
- Low stock count
- Inventory value
- Spare parts count
- Fast-moving items
- Recently added products
- Stock alerts
- Inventory charts
- Quick actions
- Recent stock activity

## 2. Products Page
Purpose: Main product catalog management.

Features:
- Add/edit/delete products
- Product search
- SKU generation
- Barcode support
- Product image upload
- Product categories
- Cost price
- Selling price
- Warranty setup
- Stock quantity
- Product status
- Supplier assignment
- Product filters
- Product actions:
- Edit
- View
- Print barcode
- Stock adjustment
- Delete

## 3. Categories Page
Purpose: Manage product categories.

Features:
- Add/edit/delete categories
- Parent/subcategories
- Category icons/images
- Category filtering
- Product count per category

Recommended categories:
- Smartphones
- Accessories
- Spare Parts
- Repair Services
- Used Phones

## 4. Brands Page
Purpose: Manage product brands.

Features:
- Add/edit/delete brands
- Brand logos
- Brand filtering
- Brand-wise product count

Example brands:
- Apple
- Samsung
- Xiaomi
- Oppo
- Vivo
- Realme

## 5. Variants Page
Purpose: Manage product variations.

Features:
- Color variants
- Storage variants
- Condition variants
- Variant stock tracking
- Variant pricing
- Variant barcode support

Examples:
- iPhone 13 - 128GB
- iPhone 13 - 256GB

## 6. Serials / IMEI Page
Purpose: Track serial numbers and IMEI records.

Features:
- IMEI registration
- Device serial tracking
- Warranty tracking
- Sold device history
- Device lookup
- IMEI search
- Duplicate IMEI prevention
- Used phone tracking

## 7. Movements Page
Purpose: Track all stock movements.

Features:
- Stock IN logs
- Stock OUT logs
- Repair-part deductions
- Sales deductions
- Manual adjustments
- Movement history
- User tracking
- Date/time logs
- Product movement filters

## 8. GRN (Goods Received Note) Page
Purpose: Manage incoming stock from suppliers.

Features:
- Create GRN
- Supplier selection
- Purchase linkage
- Received quantity tracking
- Damaged stock tracking
- Supplier invoice number
- Automatic stock increase
- GRN history
- GRN printing

## 9. Stock Take Page
Purpose: Physical inventory verification.

Features:
- Physical stock counting
- Difference calculation
- Missing stock detection
- Excess stock detection
- Variance reports
- Stock correction workflow
- Audit logs

## 10. Price Adjust Page
Purpose: Manage pricing updates.

Features:
- Cost price adjustments
- Selling price adjustments
- Bulk price changes
- Percentage adjustments
- Price history
- Profit margin display

## 11. Discount Offers Page
Purpose: Manage product discounts and promotions.

Features:
- Product discounts
- Percentage discounts
- Fixed discounts
- Promotion periods
- Offer scheduling
- Discount history
- Active offer tracking

## 12. Reports Page
Purpose: Inventory analytics and reporting.

Features:
- Inventory valuation
- Low stock reports
- Fast-moving products
- Dead stock reports
- Supplier purchase reports
- Stock movement reports
- Repair-part usage reports
- Product performance reports
- Export reports

## 13. Suppliers Page
Purpose: Manage suppliers and purchasing relationships.

Features:
- Supplier profiles
- Contact details
- Supplier products
- Purchase history
- Outstanding balances
- Supplier notes
- Payment tracking
- Supplier search/filter

## Common Features Across All Pages
Search system:
- Product search
- SKU search
- Barcode search
- Category filters
- Supplier filters

Table features:
- Sorting
- Pagination
- Export CSV/PDF
- Compact desktop tables
- Internal scrolling only

UI features:
- Dark premium theme
- Compact operational layout
- Keyboard-friendly workflow
- Glassmorphism cards
- Status badges
- Quick action buttons

## Delivery Phases
### Phase 1 (Core Ops)
- Products
- Categories
- Brands
- Suppliers
- Movements

### Phase 2 (Stock Control)
- GRN
- Stock Take
- Serials/IMEI
- Variants

### Phase 3 (Commercial + Insights)
- Price Adjust
- Discount Offers
- Reports
- Overview refinements and charts

## Acceptance Baseline
- Every page has search/filter/sort and internal table scroll.
- Every mutation (add/edit/delete/adjust) writes audit logs.
- Every page supports empty/loading/error states.
- All money values use consistent currency formatting.
