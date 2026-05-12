from datetime import datetime
from pydantic import BaseModel

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserOut(BaseModel):
    id: int
    username: str
    full_name: str
    role: str
    class Config:
        from_attributes = True

class EmployeeIn(BaseModel):
    username: str
    full_name: str
    password: str
    role: str = "employee"
    is_active: bool = True

class EmployeeUpdateIn(BaseModel):
    full_name: str | None = None
    password: str | None = None
    role: str | None = None
    is_active: bool | None = None

class CustomerIn(BaseModel):
    name: str
    phone: str
    email: str | None = None
    address: str | None = None

class CustomerOut(CustomerIn):
    id: int
    class Config:
        from_attributes = True

class SupplierIn(BaseModel):
    name: str
    contact: str

class InventoryIn(BaseModel):
    name: str
    category: str
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

class RepairPartConsumeIn(BaseModel):
    item_id: int
    quantity: int = 1

class PrintProfileIn(BaseModel):
    format: str = "A4"
    store_name: str = "i Store"
    store_address: str = ""
    store_phone: str = ""
    footer_note: str = "Thank you. Visit again."
    show_logo: bool = False
    margin_mm: int = 10
    accent_color: str = "#0ea5e9"

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
