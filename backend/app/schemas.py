from datetime import datetime, date
from pydantic import BaseModel

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime | None = None
    session_id: str | None = None

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    is_active: bool = True
    last_login_at: datetime | None = None
    class Config:
        from_attributes = True

class EmployeeIn(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "employee"
    is_active: bool = True
    phone_number: str | None = None
    email: str | None = None
    pin: str | None = None
    profile_photo: str | None = None
    notes: str | None = None

class EmployeeUpdateIn(BaseModel):
    full_name: str | None = None
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None
    phone_number: str | None = None
    email: str | None = None
    pin: str | None = None
    profile_photo: str | None = None
    notes: str | None = None

class CustomerIn(BaseModel):
    name: str
    phone: str
    email: str | None = None
    address: str | None = None
    notes: str | None = None
    birthday: date | None = None

class CustomerOut(CustomerIn):
    id: int
    class Config:
        from_attributes = True

class SupplierIn(BaseModel):
    name: str
    contact: str = ""
    email: str | None = None
    address: str | None = None
    notes: str | None = None
    payment_terms_days: int = 0
    opening_balance: float = 0

class InventoryIn(BaseModel):
    name: str
    category: str
    brand: str | None = None
    model: str | None = None
    storage: str | None = None
    color: str | None = None
    condition: str | None = None
    product_type: str | None = None
    location: str | None = None
    image_url: str | None = None
    warranty_days: int = 0
    sku: str
    barcode: str | None = None
    quantity: int
    cost_price: float
    sale_price: float
    has_serials: bool = False
    supplier_id: int | None = None

class InventoryOut(InventoryIn):
    id: int
    class Config:
        from_attributes = True

class RepairIn(BaseModel):
    customer_id: int
    device_model: str
    imei: str
    condition_notes: str | None = None
    issue: str
    accessories: str | None = None
    status: str = "Pending"
    priority: str = "Normal"
    warranty_status: str = "None"
    technician: str
    estimated_cost: float = 0
    advance_payment: float = 0
    notes: str = ""
    estimated_completion: datetime | None = None

class RepairOut(RepairIn):
    id: int
    ticket_no: str
    created_at: datetime
    delivered_at: datetime | None = None
    class Config:
        from_attributes = True

class SaleLine(BaseModel):
    item_id: int | None = None
    quantity: int
    price: float
    warranty_days: int = 0
    serial_number: str | None = None

class SaleIn(BaseModel):
    customer_id: int | None = None
    payment_method: str = "Cash"
    cash_amount: float = 0
    card_amount: float = 0
    paid: bool = True
    discount_amount: float = 0
    tax_amount: float = 0
    lines: list[SaleLine]

class SaleReturnIn(BaseModel):
    sale_id: int
    lines: list[SaleLine]
    note: str = ""

class StockAdjustIn(BaseModel):
    item_id: int
    quantity_change: int
    note: str = ""

class CategoryIn(BaseModel):
    name: str
    icon_url: str | None = None
    parent_id: int | None = None
    is_active: bool = True

class BrandIn(BaseModel):
    name: str
    logo_url: str | None = None
    is_active: bool = True

class GrnLineIn(BaseModel):
    item_id: int
    quantity: int
    damaged_qty: int = 0
    unit_cost: float = 0

class GrnIn(BaseModel):
    supplier_id: int
    po_id: int | None = None
    invoice_no: str | None = None
    note: str | None = None
    lines: list[GrnLineIn]

class PriceAdjustmentIn(BaseModel):
    item_id: int | None = None
    item_ids: list[int] | None = None
    mode: str = "absolute"  # absolute | percentage
    target: str = "both"  # both | sale | cost
    percent_change: float | None = None
    new_cost_price: float | None = None
    new_sale_price: float | None = None
    reason: str = ""

class DiscountIn(BaseModel):
    item_id: int
    discount_type: str = "percent"
    value: float = 0
    start_date: datetime | None = None
    end_date: datetime | None = None
    is_active: bool = True
    note: str | None = None

class StockTakeLineIn(BaseModel):
    item_id: int
    physical_qty: int

class StockTakeIn(BaseModel):
    name: str
    note: str | None = None

class RepairPartConsumeIn(BaseModel):
    item_id: int
    quantity: int = 1

class PrintProfileIn(BaseModel):
    format: str = "A4"
    store_name: str = "i Store"
    store_address: str = ""
    store_phone: str = ""
    store_email: str = ""
    store_website: str = ""
    tax_number: str = ""
    business_reg_no: str = ""
    footer_note: str = "Thank you. Visit again."
    
    show_logo: bool = True
    logo_data: str = ""
    logo_size: int = 80
    accent_color: str = "#0ea5e9"
    font_family: str = "Inter"
    
    # Section Toggles
    show_shop_email: bool = True
    show_shop_phone: bool = True
    show_shop_website: bool = True
    show_tax_no: bool = False
    show_reg_no: bool = False
    
    show_customer_address: bool = True
    show_customer_phone: bool = True
    show_customer_email: bool = False
    
    show_invoice_date: bool = True
    show_invoice_time: bool = True
    show_cashier_name: bool = True
    show_technician_name: bool = True
    
    # Repair Specific
    show_device_imei: bool = True
    show_device_serial: bool = False
    show_device_color: bool = True
    show_device_condition: bool = True
    show_device_accessories: bool = True
    show_password_field: bool = False
    
    # Table Columns
    show_sku_column: bool = False
    show_warranty_column: bool = True
    show_discount_column: bool = True
    show_tax_column: bool = True
    
    # Summary & Terms
    show_advance_payment: bool = True
    show_remaining_balance: bool = True
    show_bank_details: bool = True
    show_return_policy: bool = True
    show_warranty_terms: bool = True
    show_signatures: bool = True
    show_qr_code: bool = True
    
    # Text Content
    slogan: str = "Your No.01 Mobile Partner"
    bank_details: str = "1000526309 - Commercial bank"
    repair_terms: str = "1. Minimum diagnostic fee applies.\n2. Not responsible for data loss."
    return_policy: str = "1. Items can be returned within 7 days with original receipt.\n2. No cash refunds."
    warranty_terms: str = "Warranty covers hardware defects only."
    
    # Layout
    margin_mm: int = 10
    label_width: int = 50
    label_height: int = 25
    show_curves: bool = True
    show_table_borders: bool = True
    show_slogan: bool = True

class PrintProfileOut(PrintProfileIn):
    pass

class UiPreferencesIn(BaseModel):
    theme: str = "dark"
    compact_mode: bool = False

class PurchaseOrderItemIn(BaseModel):
    item_id: int
    quantity: int
    unit_cost: float

class PurchaseOrderIn(BaseModel):
    supplier_id: int
    note: str | None = None
    items: list[PurchaseOrderItemIn]


class PurchaseReconcileLineIn(BaseModel):
    item_id: int
    received_qty: int
    damaged_qty: int = 0
    unit_cost: float | None = None


class PurchaseReconcileIn(BaseModel):
    invoice_no: str | None = None
    note: str | None = None
    lines: list[PurchaseReconcileLineIn]


class SupplierPaymentIn(BaseModel):
    amount: float
    note: str | None = None


class SupplierNoteIn(BaseModel):
    note: str


class ExpenseIn(BaseModel):
    category: str
    amount: float
    description: str | None = None
    payment_method: str = "Cash"
    supplier_id: int | None = None
    vendor_name: str | None = None
    reference_no: str | None = None
    expense_date: datetime | None = None
    is_recurring: bool = False
    recurring_cycle: str | None = None
    receipt_attachment: str | None = None
    notes: str | None = None


class ExpenseUpdateIn(BaseModel):
    category: str | None = None
    amount: float | None = None
    description: str | None = None
    payment_method: str | None = None
    supplier_id: int | None = None
    vendor_name: str | None = None
    reference_no: str | None = None
    expense_date: datetime | None = None
    is_recurring: bool | None = None
    recurring_cycle: str | None = None
    receipt_attachment: str | None = None
    notes: str | None = None
    status: str | None = None


class ExpenseDecisionIn(BaseModel):
    action: str  # approve | reject | paid | cancel | pending
    note: str | None = None


class WarrantyRuleIn(BaseModel):
    rule_name: str
    scope_type: str
    scope_value: str = "*"
    warranty_days: int = 0
    description: str | None = None
    is_active: bool = True


class WarrantyConditionIn(BaseModel):
    condition_code: str
    title: str
    description: str | None = None
    is_covered: bool = False
    is_active: bool = True
    sort_order: int = 0


class WarrantyRecordIn(BaseModel):
    invoice_id: int | None = None
    repair_ticket_id: int | None = None
    sale_item_id: int | None = None
    item_id: int | None = None
    customer_id: int | None = None
    customer_name: str
    customer_phone: str | None = None
    product_or_service_name: str
    product_category: str | None = None
    brand: str | None = None
    supplier_name: str | None = None
    device_brand_model: str | None = None
    imei_or_serial: str | None = None
    serial_number: str | None = None
    warranty_type: str
    start_date: datetime
    warranty_days: int = 0
    end_date: datetime | None = None
    status: str = "Active"
    quantity_covered: int = 1
    conditions_json: str | None = None
    notes: str | None = None


class WarrantyClaimIn(BaseModel):
    warranty_id: int
    customer_complaint: str
    technician_inspection_note: str | None = None
    claim_status: str = "Pending Inspection"
    claim_decision: str | None = None
    replacement_item: str | None = None
    repair_action: str | None = None


class WarrantyClaimUpdateIn(BaseModel):
    technician_inspection_note: str | None = None
    claim_status: str | None = None
    claim_decision: str | None = None
    replacement_item: str | None = None
    repair_action: str | None = None


class ReturnRecordCreateIn(BaseModel):
    original_invoice_id: int
    original_sale_item_id: int
    quantity: int = 1
    return_type: str = "Product Return"
    return_reason: str
    item_condition: str = "Reusable"
    inspection_note: str | None = None


class ReturnRecordProcessIn(BaseModel):
    decision_status: str
    return_reason: str | None = None
    item_condition: str | None = None
    inspection_note: str | None = None
    refund_amount: float | None = None
    refund_method: str | None = None
    replacement_item_id: int | None = None
    replacement_quantity: int | None = None
    process_note: str | None = None


class CashReconciliationIn(BaseModel):
    recon_date: str | None = None
    cashier_id: int | None = None
    shift: str = "Full Day"
    opening_float: float = 0
    closing_float: float = 0
    counted_cash_total: float = 0
    denominations: dict[str, int] | None = None
    notes: str | None = None


class CashReconciliationResolveIn(BaseModel):
    resolution_notes: str
    status: str = "Resolved"


class FinancialDailyClosingGenerateIn(BaseModel):
    report_date: str | None = None
    counted_cash: float | None = None
    notes: str | None = None


class FinancialDailyClosingVerifyIn(BaseModel):
    notes: str | None = None


class FinancialTransactionReviewIn(BaseModel):
    status: str = "Verified"
    notes: str | None = None
    flagged_reason: str | None = None


class FinancialFlagCreateIn(BaseModel):
    severity: str = "Medium"
    module: str
    flag_type: str
    description: str
    assigned_to_user_id: int | None = None
    transaction_type: str | None = None
    transaction_id: int | None = None
    reference_code: str | None = None
    amount: float = 0


class FinancialFlagResolveIn(BaseModel):
    resolution_notes: str
    status: str = "Resolved"


class FinancialFlagBulkResolveIn(BaseModel):
    flag_ids: list[int]
    resolution_notes: str


class LabelTemplateIn(BaseModel):
    name: str
    label_scope: str
    width_mm: int = 50
    height_mm: int = 30
    canvas: dict | None = None
    is_default: bool = False
    is_active: bool = True


class LabelTemplateDuplicateIn(BaseModel):
    name: str


class LabelQueueItemIn(BaseModel):
    label_type: str
    entity_type: str
    entity_id: int | None = None
    entity_ref: str | None = None
    item_name: str
    qty: int = 1
    template_id: int | None = None
    template_name: str | None = None
    barcode_format: str | None = None
    printer_name: str | None = None
    paper_type: str | None = None
    print_quality: str | None = None
    orientation: str | None = None
    priority: int = 100
    metadata: dict | None = None
    status: str = "Waiting"
    is_reprint: bool = False
    reprint_reason: str | None = None


class LabelQueueBatchIn(BaseModel):
    items: list[LabelQueueItemIn]


class LabelQueueStatusUpdateIn(BaseModel):
    status: str
    priority: int | None = None
    error_message: str | None = None


class LabelQueueReorderIn(BaseModel):
    ordered_job_ids: list[int]


class LabelPrintNowIn(BaseModel):
    mark_completed: bool = True


class LabelScanIn(BaseModel):
    value: str
    scan_mode: str = "scanner"


class LabelAssetIn(BaseModel):
    asset_name: str
    asset_type: str
    department: str | None = None
    location: str | None = None
    purchase_date: datetime | None = None
    warranty_expiry_date: datetime | None = None
    assigned_to: str | None = None
    maintenance_due_date: datetime | None = None
    barcode_value: str | None = None
    qr_value: str | None = None
    status: str = "Active"


class LabelReprintIn(BaseModel):
    qty: int = 1
    printer_name: str | None = None
    reason: str | None = None
