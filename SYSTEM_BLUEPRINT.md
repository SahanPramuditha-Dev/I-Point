# i Store - Complete System Blueprint

## System Overview

i Store is a desktop-based mobile phone repair and retail management system designed for Sri Lankan mobile phone shops.

Technology Stack:

* React Frontend
* Python FastAPI Backend
* SQLite Local Database
* Electron Desktop Application
* Firebase Storage for cloud backup only

Architecture Type:

* Offline-first
* SQLite-first
* Low Firebase dependency
* Desktop workstation software

Firebase must NOT be used as the primary operational database.

SQLite is the primary live database.

Firebase should only be used for:

* Cloud backups
* Backup metadata
* Disaster recovery

---

# 1. Authentication & Access Control

## Features

* Username/password login
* Password hashing
* PIN login
* Remember me
* Session timeout
* Failed login protection
* Account lockout
* Role-based access control
* Permission matrix
* Active session monitoring
* Audit logging

## Roles

* Owner
* Admin
* Manager
* Cashier
* Technician

## Permission Types

* View
* Create
* Edit
* Delete
* Approve
* Refund
* Void
* Export
* Print
* Manage Settings

## Workflows

### Login Workflow

User login
?
Credential validation
?
Permission loading
?
Dashboard access

### Session Security Workflow

Failed login attempts
?
Account lock
?
Admin unlock/reset

---

# 2. Dashboard

## Features

* Daily sales summary
* Repair income summary
* Pending repairs
* Outstanding balances
* Inventory alerts
* Low stock warnings
* Recent transactions
* Recent repair tickets
* Technician performance
* Revenue charts
* Quick action shortcuts

## Logic

* Use SQLite aggregation
* No Firebase reads
* Cached operational summaries

## Workflow

Load dashboard
?
Query SQLite summaries
?
Display operational business status

---

# 3. POS / Billing Module

## Features

* Product sale mode
* Repair billing mode
* Barcode scanning
* Product search
* Product categories
* Cart management
* Quantity controls
* Discounts
* Service charges
* Cash/card/bank transfer
* Partial payments
* Advance payments
* Outstanding balances
* Thermal receipt printing
* A4 invoice printing
* Walk-in customer mode
* Customer selection
* Keyboard shortcuts

## Product Categories

* Smartphones
* Used Phones
* Accessories
* Spare Parts
* Repair Services

## Logic

* Product sale deducts stock
* Repair billing links repair ticket
* Spare parts deduct inventory
* Invoices are immutable after completion
* Voids/refunds logged in audit trail

## Workflows

### Product Sale Workflow

Search product
?
Add to cart
?
Select customer/payment
?
Complete sale
?
Deduct stock
?
Generate invoice

### Repair Billing Workflow

Select repair ticket
?
Add labor + parts
?
Generate bill
?
Take payment
?
Generate invoice

---

# 4. Repair Management Module

## Features

* Create repair ticket
* Device details
* IMEI tracking
* Customer details
* Accessories received
* Technician assignment
* Estimated completion date
* Repair notes
* Internal notes
* Repair Kanban board
* Repair timeline
* Repair status workflow
* Repair search
* Repair filters
* Overdue repair detection

## Repair Statuses

* Pending
* Diagnosing
* Waiting for Approval
* Waiting for Parts
* Repairing
* Quality Checking
* Completed
* Delivered
* Cancelled

## Logic

* Status changes logged
* Repair parts deduct stock
* Completed repairs can generate invoice
* Delivered repairs create warranty
* Overdue repairs highlighted

## Workflow

Create repair ticket
?
Diagnose issue
?
Approve estimate
?
Repair device
?
Quality check
?
Bill customer
?
Deliver device
?
Warranty begins

---

# 5. Inventory Module

## Subpages

### 5.1 Inventory Overview

* Inventory value
* Low stock alerts
* Out-of-stock items
* Recent stock movement
* Fast-moving items

### 5.2 Products

* Add/edit/delete products
* Product images
* SKU
* Barcode
* Cost price
* Selling price
* Warranty period
* Supplier linkage
* Product status

### 5.3 Categories

* Smartphones
* Accessories
* Spare Parts
* Repair Services
* Used Phones

### 5.4 Brands

* Apple
* Samsung
* Xiaomi
* Oppo
* Vivo
* Realme

### 5.5 Variants

* Color variants
* Storage variants
* Condition variants
* Variant stock
* Variant pricing

### 5.6 Serials / IMEI

* IMEI tracking
* Serial tracking
* Warranty linkage
* Device history

### 5.7 Stock Movements

* Stock IN
* Stock OUT
* Repair deductions
* Manual adjustments
* Sales deductions

### 5.8 GRN

* Goods received note
* Supplier linkage
* Damaged stock tracking
* Automatic stock increase

### 5.9 Stock Take

* Physical stock count
* Variance detection
* Stock correction

### 5.10 Price Adjustment

* Bulk price updates
* Margin calculation
* Price history

### 5.11 Discount Offers

* Product discounts
* Promotion periods
* Fixed/percentage discounts

### 5.12 Inventory Reports

* Inventory valuation
* Dead stock
* Fast-moving items
* Repair part usage

## Logic

* All stock changes logged
* Negative stock blocked unless enabled
* Repair part usage deducts stock automatically
* GRN increases stock
* Stock adjustment requires reason

---

# 6. Customers Module

## Features

* Customer profiles
* Phone numbers
* Purchase history
* Repair history
* Outstanding balances
* Warranty records
* Customer notes

## Logic

* Sales link to customer
* Repairs link to customer
* Outstanding balance calculated automatically

---

# 7. Suppliers Module

## Features

* Supplier profiles
* Contact details
* Purchase history
* Product sourcing
* Outstanding supplier balances
* Supplier notes

## Logic

* Suppliers linked to purchase orders and GRNs

---

# 8. Purchase Orders Module

## Features

* Create purchase orders
* Supplier selection
* Product quantities
* Purchase totals
* Pending/received status

## Workflow

Create PO
?
Order products
?
Receive stock through GRN
?
Inventory increases

---

# 9. Expenses Module

## Features

* Rent expenses
* Salary expenses
* Utility expenses
* Tools/equipment
* Miscellaneous expenses
* Expense reports

## Logic

* Expenses reduce net profit
* Approval required above threshold if enabled

---

# 10. Warranty Module

## Features

* Product warranty
* Repair warranty
* Warranty lookup
* Warranty claims
* Claim approval/rejection
* Warranty replacement
* Warranty expiry alerts

## Logic

* Product sale auto-creates warranty
* Delivered repair auto-creates repair warranty
* Claims must link to invoice/repair ticket

## Workflow

Search invoice/IMEI
?
Validate warranty
?
Inspect item
?
Approve/reject claim
?
Repair/replace/close claim

---

# 11. Returns & Refunds Module

## Features

* Product returns
* Exchanges
* Refunds
* Warranty replacements
* Return receipts
* Item inspection
* Return reasons

## Logic

* Returns linked to original invoice
* Prevent duplicate returns
* Good items increase stock
* Damaged items move to damaged stock
* Refunds logged in audit trail

## Workflow

Search invoice
?
Inspect item
?
Approve/reject return
?
Refund/exchange
?
Update inventory

---

# 12. Reports & Analytics Module

## Subpages

### 12.1 Reports Overview

* Business summary
* Revenue overview
* Pending repairs
* Outstanding balances
* Inventory alerts
* Recent transactions

### 12.2 Sales Reports

* Sales totals
* Product revenue
* Repair revenue
* Payment methods
* Product performance
* Cashier performance

### 12.3 Repair Reports

* Repair status analysis
* Technician performance
* Common issues
* Repair turnaround time
* Repair profitability

### 12.4 Inventory Reports

* Inventory value
* Low stock
* Dead stock
* Fast-moving products
* Spare part usage

### 12.5 Profit & Loss

* Revenue
* Cost of goods
* Expenses
* Gross profit
* Net profit

### 12.6 Outstanding Payments

* Pending invoices
* Partial payments
* Customer balances

## Logic

* Reports generated from SQLite
* Local aggregation only
* Export PDF/CSV locally

---

# 13. Notifications Module

## Features

* Low stock alerts
* Overdue repairs
* Pending balances
* Warranty expiry alerts
* Backup failures
* In-app notifications

## Logic

* Local notifications
* Optional WhatsApp alerts only

---

# 14. Audit Trail Module

## Features

* Login/logout logs
* Failed login logs
* Invoice voids
* Refund logs
* Stock adjustments
* Permission changes
* Repair status changes
* Backup/restore logs

## Logic

* Audit logs read-only
* Only Owner/Admin access full logs
* Sensitive actions always logged

---

# 15. Backup & Restore Module

## Features

* Manual backup
* Automatic backup
* Backup history
* Restore backup
* Backup verification
* Firebase Storage uploads
* Local backup storage

## Logic

* SQLite database compressed/encrypted
* Upload backup file to Firebase Storage
* Store lightweight metadata in Firestore
* App fully operational offline

## Workflow

SQLite DB active
?
Scheduled backup
?
Compress/encrypt database
?
Upload to Firebase Storage
?
Store metadata only

---

# 16. Settings Module

## Settings Tabs

### 16.1 Store Profile

* Shop name
* Address
* Phone number
* Logo
* Business hours

### 16.2 Access Control

* User accounts
* Roles
* Permissions
* Sessions
* Security rules

### 16.3 Business Ops

* POS rules
* Discount rules
* Inventory rules
* Repair rules
* Device brands
* Expense categories

### 16.4 Financial Settings

* Currency
* Tax rates
* Payment methods
* Rounding rules

### 16.5 Invoice Design

* Invoice templates
* Receipt layouts
* Job card design
* Thermal/A4 settings

### 16.6 Notifications

* Notification rules
* WhatsApp templates
* Alert thresholds

### 16.7 System & Backup

* Theme settings
* Printer configuration
* Barcode scanner configuration
* System info
* Backup settings

---

# 17. RBAC & Security System

## Features

* Role-based access control
* Permission matrix
* User permission overrides
* Route protection
* Backend permission validation
* Session management
* Audit logging

## Security Logic

* Backend permission checks mandatory
* Owner role protected
* Password hashing using bcrypt/argon2
* Secure local session handling
* Audit trail for all sensitive actions

---

# 18. Firebase Backup Architecture

## Main Goal

Minimize Firebase costs.

## Firebase Usage

### Firebase Storage

* Store compressed SQLite backups
* Backup retention cleanup

### Firestore

Store only backup metadata:

* backup ID
* backup date
* file size
* checksum
* app version
* device name

## Rules

* No real-time listeners
* No syncing live POS data
* No inventory syncing
* No repair syncing
* No report syncing
* Firebase is backup layer only

---

# 19. System-Wide Logic

## Core Principles

* Offline-first
* SQLite-first
* Local operational queries
* Minimal Firebase dependency
* Fast local performance
* Safe upgrades
* Backup before migration

## Database Stack

* SQLite
* SQLAlchemy ORM
* Alembic migrations

## Update Strategy

* Database migrations
* Automatic backup before update
* No data loss during upgrades

---

# 20. Build Priority Roadmap

## Phase 1 - Core Operations

1. Authentication & RBAC
2. Dashboard
3. POS/Billing
4. Repair Management
5. Inventory
6. Customers

## Phase 2 - Business Control

7. Suppliers
8. Purchase Orders
9. GRN
10. Expenses
11. Reports
12. Audit Trail

## Phase 3 - Professional Features

13. Warranty
14. Returns & Refunds
15. Backup & Restore
16. Notifications
17. Advanced Settings

## Phase 4 - Optimization & Polish

18. UI optimization
19. Performance optimization
20. Installer/update safety
21. Backup optimization
22. Operational workflow polishing

---

# Final Goal

The final i Store system should behave like a professional offline-first desktop POS and repair-shop management application used in real Sri Lankan mobile phone retail and repair businesses.

The system should prioritize:

* Operational efficiency
* Fast cashier workflow
* Repair workflow management
* Inventory control
* Security
* Data integrity
* Low cloud cost
* Offline reliability
* Professional enterprise-grade UX
