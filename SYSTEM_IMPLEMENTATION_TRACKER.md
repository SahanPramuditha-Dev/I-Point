# i Store Implementation Tracker

Last updated: 2026-05-18

This tracker turns the full canonical `SYSTEM_BLUEPRINT.md` into an execution plan.

## Status Legend

- `Done`: built and integrated
- `Partial`: implemented but needs hardening/coverage/workflow completion
- `Planned`: not implemented yet

## Module Status Snapshot

1. Auth & RBAC: `Partial`
2. Dashboard: `Partial`
3. POS / Billing: `Partial`
4. Repair Management: `Partial`
5. Inventory: `Partial` (major coverage exists; further hardening needed)
6. Customers: `Partial`
7. Suppliers: `Partial`
8. Purchase Orders: `Partial`
9. Expenses: `Planned/Partial` (needs formal module-level validation)
10. Warranty: `Partial`
11. Returns & Refunds: `Partial`
12. Reports & Analytics: `Partial`
13. Notifications: `Partial`
14. Audit Trail: `Partial`
15. Backup & Restore: `Partial`
16. Settings: `Partial`
17. Security system hardening: `Partial`
18. Firebase backup-only constraints: `Partial` (must keep enforcing)
19. System-wide migration safety: `Partial`
20. Roadmap execution: `In Progress`

## Recently Completed (This Iteration)

- Supplier account/ledger workflow
- PO <-> GRN reconciliation workflow
- Stock-take session detail + close flow
- Serial/IMEI detail workflow
- Startup/auth migration stability fixes
- Category icon mapping fix (`icon` / `icon_url`)
- Category/brand real product count aggregation
- Stock movement user attribution
- Stock-take status filter consistency
- Price adjustments: bulk + percentage + margin visibility
- Inventory analytics: dead stock / supplier purchase / repair-part usage
- Audit report IP/device enrichment from security telemetry
- Customer birthday model + reporting integration

## Next Execution Slice (Recommended)

1. Expenses module completion + reporting linkage (P&L integration)
2. Warranty/returns policy rule engine hardening
3. End-to-end reporting QA (all report tabs + export consistency)
4. Security hardening pass:
   - permission edge-case tests
   - lockout/session telemetry verification
   - audit trail completeness checks
5. Backup/restore drill:
   - backup integrity verification
   - restore rehearsal + checksum validation

## Acceptance Criteria for Blueprint Compliance

- SQLite is the only live operational DB for all workflows.
- Firebase reads are not on critical operational paths.
- All sensitive actions are permission-gated in backend routes.
- All stock mutations are traceable and attributable.
- POS, repairs, inventory, and reports run fully offline.
- Backup/restore can recover to a verified operational state.
