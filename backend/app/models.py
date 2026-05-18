from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Boolean, ForeignKey, Text, CheckConstraint, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String)
    password_hash = Column(String)
    role = Column(String, default="cashier")
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True, index=True)
    pin_hash = Column(String, nullable=True)
    phone_number = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True, index=True)
    profile_photo = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    failed_login_count = Column(Integer, default=0)
    account_locked_until = Column(DateTime, nullable=True, index=True)
    last_login_at = Column(DateTime, nullable=True, index=True)
    last_password_change_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False, index=True)
    deleted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)

    assigned_role = relationship("Role", foreign_keys=[role_id])


class Role(Base):
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)  # owner/admin/manager/cashier/technician
    display_name = Column(String, nullable=False)
    level = Column(Integer, default=1, index=True)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=True, index=True)
    is_protected = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Permission(Base):
    __tablename__ = "permissions"
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, unique=True, index=True)  # e.g. inventory.view
    module = Column(String, index=True)  # e.g. inventory
    action = Column(String, index=True)  # e.g. view
    label = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (
        UniqueConstraint("module", "action", name="uq_permissions_module_action"),
    )


class RolePermission(Base):
    __tablename__ = "role_permissions"
    id = Column(Integer, primary_key=True, index=True)
    role_id = Column(Integer, ForeignKey("roles.id"), index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id"), index=True)
    allowed = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    role = relationship("Role")
    permission = relationship("Permission")

    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permission"),
    )


class UserPermissionOverride(Base):
    __tablename__ = "user_permission_overrides"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    permission_id = Column(Integer, ForeignKey("permissions.id"), index=True)
    effect = Column(String, default="allow", index=True)  # allow | deny
    reason = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    permission = relationship("Permission")
    created_by = relationship("User", foreign_keys=[created_by_user_id])

    __table_args__ = (
        UniqueConstraint("user_id", "permission_id", name="uq_user_permission_override"),
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    id = Column(Integer, primary_key=True, index=True)
    session_code = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    token_jti = Column(String, unique=True, index=True)
    device_name = Column(String, nullable=True)
    device_info = Column(String, nullable=True)
    ip_address = Column(String, nullable=True, index=True)
    location = Column(String, nullable=True)
    login_method = Column(String, default="password", index=True)  # password | pin
    login_time = Column(DateTime, default=datetime.utcnow, index=True)
    last_seen_at = Column(DateTime, default=datetime.utcnow, index=True)
    expires_at = Column(DateTime, nullable=True, index=True)
    is_active = Column(Boolean, default=True, index=True)
    is_current = Column(Boolean, default=False, index=True)
    is_suspicious = Column(Boolean, default=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    revoked_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    revoke_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    revoked_by = relationship("User", foreign_keys=[revoked_by_user_id])


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    login_method = Column(String, default="password", index=True)  # password | pin
    ip_address = Column(String, nullable=True, index=True)
    device_info = Column(String, nullable=True)
    attempted_at = Column(DateTime, default=datetime.utcnow, index=True)
    success = Column(Boolean, default=False, index=True)
    failure_reason = Column(String, nullable=True)

    user = relationship("User")


class SecurityAuditLog(Base):
    __tablename__ = "security_audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    action = Column(String, index=True)  # login/logout/failed_login/password_reset/etc
    target_type = Column(String, nullable=True, index=True)
    target_id = Column(Integer, nullable=True, index=True)
    target_ref = Column(String, nullable=True, index=True)
    detail = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True, index=True)
    device_info = Column(String, nullable=True)
    result = Column(String, default="success", index=True)  # success|failed|blocked
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User")


class SecuritySetting(Base):
    __tablename__ = "security_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    value = Column(Text, default="")
    updated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, index=True)

    updated_by = relationship("User")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    phone = Column(String, index=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    birthday = Column(Date, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    contact = Column(String)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    payment_terms_days = Column(Integer, default=0)
    opening_balance = Column(Float, default=0)
    ledger_entries = relationship("SupplierLedgerEntry", back_populates="supplier", cascade="all, delete-orphan")

class ProductCategory(Base):
    __tablename__ = "product_categories"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    icon_url = Column(String, nullable=True)
    parent_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    is_active = Column(Boolean, default=True)

class Brand(Base):
    __tablename__ = "brands"
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, index=True)
    logo_url = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_items_quantity_non_negative"),
    )
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    category = Column(String, index=True)
    brand = Column(String, nullable=True, index=True)
    model = Column(String, nullable=True, index=True)
    storage = Column(String, nullable=True)
    color = Column(String, nullable=True)
    condition = Column(String, nullable=True)  # New, Used, Refurbished
    product_type = Column(String, nullable=True)  # Retail, Spare Parts, Service
    location = Column(String, nullable=True)  # shelf/bin
    image_url = Column(String, nullable=True)
    warranty_days = Column(Integer, default=0)
    sku = Column(String, unique=True)
    barcode = Column(String, nullable=True)
    quantity = Column(Integer, default=0)
    damaged_quantity = Column(Integer, default=0)
    cost_price = Column(Float, default=0)
    sale_price = Column(Float, default=0)
    low_stock_threshold = Column(Integer, default=5)
    has_serials = Column(Boolean, default=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier = relationship("Supplier")

class InventorySerial(Base):
    __tablename__ = "inventory_serials"
    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    serial_number = Column(String, unique=True, index=True)
    status = Column(String, default="available") # available, sold, returned
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    item = relationship("InventoryItem")

class RepairTicket(Base):
    __tablename__ = "repair_tickets"
    id = Column(Integer, primary_key=True)
    ticket_no = Column(String, unique=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"))
    device_model = Column(String)
    imei = Column(String, index=True)
    condition_notes = Column(Text, nullable=True)
    issue = Column(Text)
    accessories = Column(Text, nullable=True)
    status = Column(String, default="Pending")
    priority = Column(String, default="Normal") # Low, Normal, High, Urgent
    warranty_status = Column(String, default="None")
    technician = Column(String)
    estimated_cost = Column(Float, default=0)
    advance_payment = Column(Float, default=0)
    notes = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    estimated_completion = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    customer = relationship("Customer")
    parts_usage = relationship("RepairPartUsage", back_populates="repair", cascade="all, delete-orphan")
    history = relationship("RepairHistory", back_populates="repair", cascade="all, delete-orphan")

class RepairHistory(Base):
    __tablename__ = "repair_history"
    id = Column(Integer, primary_key=True)
    repair_id = Column(Integer, ForeignKey("repair_tickets.id"))
    status = Column(String)
    note = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    repair = relationship("RepairTicket", back_populates="history")

class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    subtotal = Column(Float, default=0)
    discount_amount = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    total = Column(Float, default=0)
    is_return = Column(Boolean, default=False)
    original_sale_id = Column(Integer, ForeignKey("sales.id"), nullable=True)
    payment_method = Column(String, default="Cash") # Cash, Card, Bank Transfer, Multiple
    cash_amount = Column(Float, default=0)
    card_amount = Column(Float, default=0)
    paid = Column(Boolean, default=True)
    is_voided = Column(Boolean, default=False)
    void_reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    customer = relationship("Customer")

class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(Integer, primary_key=True)
    sale_id = Column(Integer, ForeignKey("sales.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"), index=True)
    quantity = Column(Integer)
    price = Column(Float)
    cost_price = Column(Float, default=0)
    warranty_days = Column(Integer, default=0)
    serial_number = Column(String, nullable=True)


class ReturnRecord(Base):
    __tablename__ = "return_records"
    id = Column(Integer, primary_key=True, index=True)
    return_code = Column(String, unique=True, index=True)
    return_type = Column(String, default="Product Return", index=True)  # Product Return | Product Exchange | Refund | Warranty Replacement
    original_sale_id = Column(Integer, ForeignKey("sales.id"), index=True)
    original_sale_item_id = Column(Integer, ForeignKey("sale_items.id"), index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    customer_name = Column(String, nullable=False)
    customer_phone = Column(String, nullable=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True, index=True)
    product_name = Column(String, nullable=False)
    sku_barcode = Column(String, nullable=True)
    serial_number = Column(String, nullable=True, index=True)
    quantity = Column(Integer, default=1)
    return_reason = Column(String, nullable=False)
    item_condition = Column(String, default="Reusable", index=True)  # Reusable | Damaged
    inspection_note = Column(Text, nullable=True)
    staff_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    refund_approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    decision_status = Column(String, default="Pending Inspection", index=True)  # Pending Inspection | Approved | Rejected | Refunded | Exchanged | Closed
    refund_amount = Column(Float, default=0)
    refund_method = Column(String, nullable=True)  # Cash | Card | Bank Transfer
    replacement_item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True, index=True)
    replacement_item_name = Column(String, nullable=True)
    replacement_quantity = Column(Integer, default=0)
    inventory_applied = Column(Boolean, default=False)
    payment_applied = Column(Boolean, default=False)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sale = relationship("Sale", foreign_keys=[original_sale_id])
    sale_item = relationship("SaleItem", foreign_keys=[original_sale_item_id])
    customer = relationship("Customer")
    item = relationship("InventoryItem", foreign_keys=[item_id])
    replacement_item = relationship("InventoryItem", foreign_keys=[replacement_item_id])
    staff_user = relationship("User", foreign_keys=[staff_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])
    refund_approved_by = relationship("User", foreign_keys=[refund_approved_by_user_id])
    damaged_logs = relationship("DamagedStockLog", back_populates="return_record", cascade="all, delete-orphan")


class DamagedStockLog(Base):
    __tablename__ = "damaged_stock_logs"
    id = Column(Integer, primary_key=True, index=True)
    return_record_id = Column(Integer, ForeignKey("return_records.id"), index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), index=True)
    quantity = Column(Integer, default=0)
    reason = Column(String, nullable=False)
    note = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    return_record = relationship("ReturnRecord", back_populates="damaged_logs")
    item = relationship("InventoryItem")
    created_by = relationship("User")


class WarrantyRule(Base):
    __tablename__ = "warranty_rules"
    id = Column(Integer, primary_key=True, index=True)
    rule_name = Column(String, nullable=False)
    scope_type = Column(String, nullable=False, index=True)  # product_category | repair_service | spare_part | product
    scope_value = Column(String, nullable=False, default="*")
    warranty_days = Column(Integer, default=0)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class WarrantyCondition(Base):
    __tablename__ = "warranty_conditions"
    id = Column(Integer, primary_key=True, index=True)
    condition_code = Column(String, unique=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    is_covered = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class WarrantyRecord(Base):
    __tablename__ = "warranty_records"
    id = Column(Integer, primary_key=True, index=True)
    warranty_code = Column(String, unique=True, index=True)
    invoice_id = Column(Integer, ForeignKey("sales.id"), nullable=True, index=True)
    repair_ticket_id = Column(Integer, ForeignKey("repair_tickets.id"), nullable=True, index=True)
    sale_item_id = Column(Integer, ForeignKey("sale_items.id"), nullable=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True, index=True)
    customer_name = Column(String, nullable=False, default="Walk-in")
    customer_phone = Column(String, nullable=True, index=True)
    product_or_service_name = Column(String, nullable=False)
    product_category = Column(String, nullable=True, index=True)
    brand = Column(String, nullable=True, index=True)
    supplier_name = Column(String, nullable=True, index=True)
    device_brand_model = Column(String, nullable=True)
    imei_or_serial = Column(String, nullable=True, index=True)
    serial_number = Column(String, nullable=True, index=True)
    warranty_type = Column(String, nullable=False, index=True)  # Product | Repair Service | Spare Part
    start_date = Column(DateTime, nullable=False, index=True)
    end_date = Column(DateTime, nullable=False, index=True)
    status = Column(String, default="Active", index=True)  # Active | Expired | Claimed | Rejected | Replaced
    quantity_covered = Column(Integer, default=1)
    warranty_days = Column(Integer, default=0)
    conditions_json = Column(Text, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    customer = relationship("Customer")
    item = relationship("InventoryItem")
    sale = relationship("Sale")
    repair_ticket = relationship("RepairTicket")
    claims = relationship("WarrantyClaim", back_populates="warranty", cascade="all, delete-orphan")


class WarrantyClaim(Base):
    __tablename__ = "warranty_claims"
    id = Column(Integer, primary_key=True, index=True)
    claim_code = Column(String, unique=True, index=True)
    warranty_id = Column(Integer, ForeignKey("warranty_records.id"), index=True)
    customer_complaint = Column(Text, nullable=False)
    technician_inspection_note = Column(Text, nullable=True)
    claim_status = Column(String, default="Pending Inspection", index=True)  # Pending Inspection | Approved | Rejected | Repaired | Replaced | Closed
    claim_decision = Column(String, nullable=True)
    replacement_item = Column(String, nullable=True)
    repair_action = Column(String, nullable=True)
    processed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    closed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    warranty = relationship("WarrantyRecord", back_populates="claims")
    processed_by = relationship("User", foreign_keys=[processed_by_id])
    approved_by = relationship("User", foreign_keys=[approved_by_id])

class StockMovement(Base):
    __tablename__ = "stock_movements"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    movement_type = Column(String)  # IN, OUT, ADJUSTMENT, SALE, RETURN, REPAIR_CONSUME
    quantity = Column(Integer)
    reference_type = Column(String, nullable=True)
    reference_id = Column(Integer, nullable=True)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    item = relationship("InventoryItem")
    user = relationship("User")

class RepairPartUsage(Base):
    __tablename__ = "repair_part_usage"
    id = Column(Integer, primary_key=True)
    repair_id = Column(Integer, ForeignKey("repair_tickets.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Integer, default=1)
    unit_cost = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    repair = relationship("RepairTicket", back_populates="parts_usage")
    item = relationship("InventoryItem")


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_expenses_amount_non_negative"),
    )

    id = Column(Integer, primary_key=True, index=True)
    expense_code = Column(String, unique=True, index=True)
    expense_date = Column(DateTime, default=datetime.utcnow, index=True)
    category = Column(String, index=True)
    description = Column(Text, nullable=True)
    amount = Column(Float, default=0)
    payment_method = Column(String, default="Cash", index=True)
    status = Column(String, default="Pending Approval", index=True)  # Pending Approval | Approved | Rejected | Paid | Cancelled
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True, index=True)
    vendor_name = Column(String, nullable=True, index=True)
    reference_no = Column(String, nullable=True, index=True)
    is_recurring = Column(Boolean, default=False, index=True)
    recurring_cycle = Column(String, nullable=True)  # Monthly | Weekly | Yearly
    receipt_attachment = Column(String, nullable=True)
    notes = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    approved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    approved_at = Column(DateTime, nullable=True, index=True)
    rejection_reason = Column(Text, nullable=True)
    paid_at = Column(DateTime, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    supplier = relationship("Supplier")
    created_by = relationship("User", foreign_keys=[created_by_user_id])
    approved_by = relationship("User", foreign_keys=[approved_by_user_id])

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"
    id = Column(Integer, primary_key=True)
    po_number = Column(String, unique=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    status = Column(String, default="Draft") # Draft, Ordered, Received, Cancelled
    total_cost = Column(Float, default=0)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    received_at = Column(DateTime, nullable=True)
    supplier = relationship("Supplier")
    items = relationship("PurchaseOrderItem", back_populates="po", cascade="all, delete-orphan")
    grns = relationship("GoodsReceivedNote", back_populates="po")

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Integer)
    unit_cost = Column(Float)
    po = relationship("PurchaseOrder", back_populates="items")
    item = relationship("InventoryItem")

class GoodsReceivedNote(Base):
    __tablename__ = "goods_received_notes"
    id = Column(Integer, primary_key=True)
    grn_no = Column(String, unique=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"))
    po_id = Column(Integer, ForeignKey("purchase_orders.id"), nullable=True, index=True)
    invoice_no = Column(String, nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    supplier = relationship("Supplier")
    po = relationship("PurchaseOrder", back_populates="grns")
    lines = relationship("GoodsReceivedNoteItem", back_populates="grn", cascade="all, delete-orphan")

class GoodsReceivedNoteItem(Base):
    __tablename__ = "goods_received_note_items"
    id = Column(Integer, primary_key=True)
    grn_id = Column(Integer, ForeignKey("goods_received_notes.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Integer, default=0)
    damaged_qty = Column(Integer, default=0)
    unit_cost = Column(Float, default=0)
    item = relationship("InventoryItem")
    grn = relationship("GoodsReceivedNote", back_populates="lines")


class SupplierLedgerEntry(Base):
    __tablename__ = "supplier_ledger_entries"
    id = Column(Integer, primary_key=True, index=True)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), index=True)
    entry_type = Column(String, default="note", index=True)  # purchase | payment | adjustment | note
    direction = Column(String, default="memo", index=True)  # debit | credit | memo
    amount = Column(Float, default=0)
    reference_type = Column(String, nullable=True, index=True)
    reference_id = Column(Integer, nullable=True, index=True)
    note = Column(Text, nullable=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    supplier = relationship("Supplier", back_populates="ledger_entries")
    created_by = relationship("User")

class PriceAdjustmentLog(Base):
    __tablename__ = "price_adjustment_logs"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    old_cost_price = Column(Float, default=0)
    old_sale_price = Column(Float, default=0)
    new_cost_price = Column(Float, default=0)
    new_sale_price = Column(Float, default=0)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    item = relationship("InventoryItem")

class ProductDiscount(Base):
    __tablename__ = "product_discounts"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    discount_type = Column(String, default="percent")  # percent | fixed
    value = Column(Float, default=0)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    note = Column(String, nullable=True)
    item = relationship("InventoryItem")

class StockTakeSession(Base):
    __tablename__ = "stock_take_sessions"
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    note = Column(Text, nullable=True)
    status = Column(String, default="Open")
    created_at = Column(DateTime, default=datetime.utcnow)
    closed_at = Column(DateTime, nullable=True)

class StockTakeLine(Base):
    __tablename__ = "stock_take_lines"
    id = Column(Integer, primary_key=True)
    session_id = Column(Integer, ForeignKey("stock_take_sessions.id"), index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    system_qty = Column(Integer, default=0)
    physical_qty = Column(Integer, default=0)
    difference = Column(Integer, default=0)
    item = relationship("InventoryItem")

class AppSetting(Base):
    __tablename__ = "app_settings"
    id = Column(Integer, primary_key=True)
    key = Column(String, unique=True, index=True)
    value = Column(Text, default="")

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String) # Create, Update, Delete, Void, Adjustment
    entity_type = Column(String) # Repair, Sale, Inventory, etc.
    entity_id = Column(Integer)
    description = Column(Text)
    old_value = Column(Text, nullable=True) # JSON string of previous state
    new_value = Column(Text, nullable=True) # JSON string of new state
    is_reversible = Column(Boolean, default=False)
    is_reversed = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    user = relationship("User")

class DailyClosing(Base):
    __tablename__ = "daily_closings"
    id = Column(Integer, primary_key=True)
    closing_date = Column(DateTime, default=datetime.utcnow, index=True)
    opening_cash = Column(Float, default=0)
    actual_cash = Column(Float, default=0)
    system_cash = Column(Float, default=0)
    system_card = Column(Float, default=0)
    difference = Column(Float, default=0)
    notes = Column(Text, nullable=True)
    closed_by_id = Column(Integer, ForeignKey("users.id"))
    closed_by = relationship("User")


class CashReconciliation(Base):
    __tablename__ = "cash_reconciliations"
    id = Column(Integer, primary_key=True, index=True)
    recon_code = Column(String, unique=True, index=True)
    recon_date = Column(DateTime, default=datetime.utcnow, index=True)
    shift = Column(String, default="Full Day")  # Full Day | Morning | Evening
    cashier_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    opening_float = Column(Float, default=0)
    system_cash_total = Column(Float, default=0)
    counted_cash_total = Column(Float, default=0)
    closing_float = Column(Float, default=0)
    cash_transactions_count = Column(Integer, default=0)
    denomination_json = Column(Text, nullable=True)
    difference = Column(Float, default=0)
    status = Column(String, default="Pending Count", index=True)  # Balanced | Minor Variance | Major Variance | Pending Count | Resolved
    notes = Column(Text, nullable=True)
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    cashier = relationship("User", foreign_keys=[cashier_id])
    verified_by = relationship("User", foreign_keys=[verified_by_user_id])


class FinancialDailyClosing(Base):
    __tablename__ = "financial_daily_closings"
    id = Column(Integer, primary_key=True, index=True)
    report_code = Column(String, unique=True, index=True)
    report_date = Column(DateTime, default=datetime.utcnow, index=True)
    generated_at = Column(DateTime, default=datetime.utcnow, index=True)
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    verification_time = Column(DateTime, nullable=True)
    status = Column(String, default="Unsigned", index=True)  # Signed | Unsigned | Flagged

    sales_cash = Column(Float, default=0)
    sales_card = Column(Float, default=0)
    sales_transfer = Column(Float, default=0)
    sales_credit = Column(Float, default=0)
    sales_total = Column(Float, default=0)

    repairs_cash = Column(Float, default=0)
    repairs_card = Column(Float, default=0)
    repairs_credit = Column(Float, default=0)
    repairs_total = Column(Float, default=0)

    total_revenue = Column(Float, default=0)
    refunds_issued = Column(Float, default=0)
    discounts_applied = Column(Float, default=0)
    voids_cancellations = Column(Float, default=0)
    net_revenue = Column(Float, default=0)
    expenses_today = Column(Float, default=0)
    net_income_today = Column(Float, default=0)

    expected_cash = Column(Float, default=0)
    counted_cash = Column(Float, default=0)
    variance = Column(Float, default=0)
    cash_status = Column(String, default="PENDING")

    total_invoices = Column(Integer, default=0)
    total_repairs_completed = Column(Integer, default=0)
    voids_count = Column(Integer, default=0)
    refunds_count = Column(Integer, default=0)
    partial_payments = Column(Integer, default=0)

    has_unresolved_flags = Column(Boolean, default=False, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    verified_by = relationship("User", foreign_keys=[verified_by_user_id])


class FinancialTransactionReview(Base):
    __tablename__ = "financial_transaction_reviews"
    id = Column(Integer, primary_key=True, index=True)
    transaction_type = Column(String, index=True)  # Sale | Repair | Expense | Refund | Payment
    transaction_id = Column(Integer, index=True)
    status = Column(String, default="Pending Review", index=True)  # Verified | Flagged | Pending Review | Resolved
    notes = Column(Text, nullable=True)
    flagged_reason = Column(String, nullable=True)
    verified_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    verified_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    verified_by = relationship("User")


class FinancialAuditFlag(Base):
    __tablename__ = "financial_audit_flags"
    id = Column(Integer, primary_key=True, index=True)
    flag_code = Column(String, unique=True, index=True)
    raised_at = Column(DateTime, default=datetime.utcnow, index=True)
    severity = Column(String, default="Medium", index=True)  # Critical | High | Medium | Low
    module = Column(String, index=True)
    flag_type = Column(String, index=True)
    description = Column(Text, nullable=False)
    raised_by_source = Column(String, default="System")  # System | User
    raised_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String, default="Open", index=True)  # Open | Pending Review | Resolved | Escalated
    resolution_notes = Column(Text, nullable=True)
    resolved_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    resolved_at = Column(DateTime, nullable=True)
    transaction_type = Column(String, nullable=True, index=True)
    transaction_id = Column(Integer, nullable=True, index=True)
    reference_code = Column(String, nullable=True, index=True)
    amount = Column(Float, default=0)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    raised_by = relationship("User", foreign_keys=[raised_by_user_id])
    assigned_to = relationship("User", foreign_keys=[assigned_to_user_id])
    resolved_by = relationship("User", foreign_keys=[resolved_by_user_id])


class LabelTemplate(Base):
    __tablename__ = "label_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    label_scope = Column(String, index=True)  # Product | Repair Job | Spare Part | Asset
    width_mm = Column(Integer, default=50)
    height_mm = Column(Integer, default=30)
    canvas_json = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False, index=True)
    is_builtin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, index=True)
    created_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    created_by = relationship("User")


class LabelPrintJob(Base):
    __tablename__ = "label_print_jobs"
    id = Column(Integer, primary_key=True, index=True)
    job_code = Column(String, unique=True, index=True)
    label_type = Column(String, index=True)  # Product | Repair Job | Spare Part | Asset
    entity_type = Column(String, index=True)  # inventory_item | repair_ticket | asset | customer
    entity_id = Column(Integer, nullable=True, index=True)
    entity_ref = Column(String, nullable=True, index=True)
    item_name = Column(String, nullable=False)
    qty = Column(Integer, default=1)
    template_id = Column(Integer, ForeignKey("label_templates.id"), nullable=True, index=True)
    template_name = Column(String, nullable=True)
    barcode_format = Column(String, nullable=True)
    printer_name = Column(String, nullable=True)
    paper_type = Column(String, nullable=True)
    print_quality = Column(String, nullable=True)
    orientation = Column(String, nullable=True)
    status = Column(String, default="Waiting", index=True)  # Waiting | Printing | Completed | Failed | Paused | Cancelled
    priority = Column(Integer, default=100, index=True)
    is_reprint = Column(Boolean, default=False, index=True)
    reprint_reason = Column(String, nullable=True)
    generated_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    completed_at = Column(DateTime, nullable=True, index=True)
    error_message = Column(Text, nullable=True)
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    generated_by = relationship("User")
    template = relationship("LabelTemplate")


class LabelAsset(Base):
    __tablename__ = "label_assets"
    id = Column(Integer, primary_key=True, index=True)
    asset_code = Column(String, unique=True, index=True)
    asset_name = Column(String, index=True)
    asset_type = Column(String, index=True)
    department = Column(String, nullable=True, index=True)
    location = Column(String, nullable=True, index=True)
    purchase_date = Column(DateTime, nullable=True)
    warranty_expiry_date = Column(DateTime, nullable=True)
    assigned_to = Column(String, nullable=True)
    maintenance_due_date = Column(DateTime, nullable=True)
    barcode_value = Column(String, unique=True, index=True)
    qr_value = Column(String, nullable=True)
    status = Column(String, default="Active", index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LabelScanLog(Base):
    __tablename__ = "label_scan_logs"
    id = Column(Integer, primary_key=True, index=True)
    barcode_value = Column(String, index=True)
    scan_mode = Column(String, default="scanner")  # scanner | manual | camera
    scanned_type = Column(String, default="Unknown", index=True)  # Product | Repair Job | Part | Customer | Asset | Unknown
    result_ref = Column(String, nullable=True, index=True)
    result_id = Column(Integer, nullable=True, index=True)
    result_summary = Column(String, nullable=True)
    scanned_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    scanned_by = relationship("User")


class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True)
    type = Column(String) # Low Stock, Overdue Repair, Payment Pending
    title = Column(String)
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    entity_type = Column(String, nullable=True)
    entity_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
