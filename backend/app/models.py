from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, Text, CheckConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    full_name = Column(String)
    password_hash = Column(String)
    role = Column(String, default="employee")
    is_active = Column(Boolean, default=True)

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    phone = Column(String, index=True)
    email = Column(String, nullable=True)
    address = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    name = Column(String)
    contact = Column(String)

class InventoryItem(Base):
    __tablename__ = "inventory_items"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_inventory_items_quantity_non_negative"),
    )
    id = Column(Integer, primary_key=True)
    name = Column(String, index=True)
    category = Column(String, index=True)
    sku = Column(String, unique=True)
    barcode = Column(String, nullable=True)
    quantity = Column(Integer, default=0)
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

class StockMovement(Base):
    __tablename__ = "stock_movements"
    id = Column(Integer, primary_key=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id"), index=True)
    movement_type = Column(String)  # IN, OUT, ADJUSTMENT, SALE, RETURN, REPAIR_CONSUME
    quantity = Column(Integer)
    reference_type = Column(String, nullable=True)
    reference_id = Column(Integer, nullable=True)
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)
    item = relationship("InventoryItem")

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

class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"
    id = Column(Integer, primary_key=True)
    po_id = Column(Integer, ForeignKey("purchase_orders.id"))
    item_id = Column(Integer, ForeignKey("inventory_items.id"))
    quantity = Column(Integer)
    unit_cost = Column(Float)
    po = relationship("PurchaseOrder", back_populates="items")
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
