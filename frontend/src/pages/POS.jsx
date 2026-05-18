import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import api from "../lib/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Input, Select } from "../components/UI";
import { Barcode, ShoppingBasket, Search, Printer, Trash2, Plus, Minus, User, Wrench, Clock, CornerUpLeft, X, RefreshCw, Save, FolderOpen, Mail, MessageCircle, CreditCard, Banknote, Wallet, Info, ImageOff, AlertCircle, Check, Zap } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

const CATEGORIES = ["All", "Smartphones", "Used Phones", "Chargers", "Earphones", "Power Banks", "Cases & Covers", "Tempered Glass", "Spare Parts", "Repair Services"];

const defaultProfile = {
  format: "A4",
  store_name: "i Store",
  store_address: "",
  store_phone: "",
  footer_note: "Thank you. Visit again.",
  show_logo: false,
  margin_mm: 10,
  accent_color: "#0ea5e9"
};

export default function POS() {
  const { toast } = useFeedback();
  const barcodeRef = useRef(null);
  const productSearchRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const [profile, setProfile] = useState(defaultProfile);

  const inventoryFetch = useFetch('/inventory');
  const suppliersFetch = useFetch('/inventory/suppliers');
  const customersFetch = useFetch('/customers');
  const salesFetch = useFetch('/pos/sales');
  const repairsFetch = useFetch('/repairs'); // To link tickets

  const [mode, setMode] = useState("sale"); // "sale" or "repair"
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [selectedCartIndex, setSelectedCartIndex] = useState(0);
  
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerId, setCustomerId] = useState("");
  
  const [discountMode, setDiscountMode] = useState("amount"); 
  const [discountValue, setDiscountValue] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  
  const [paid, setPaid] = useState(true);
  const [cashReceived, setCashReceived] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [repairTicketNo, setRepairTicketNo] = useState("");
  const [suspendedCarts, setSuspendedCarts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("pos_suspended_carts") || "[]");
    } catch {
      return [];
    }
  });
  const [showSuspendPicker, setShowSuspendPicker] = useState(false);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "", email: "", address: "" });
  const [productDetail, setProductDetail] = useState(null);

  const subtotal = useMemo(() => cart.reduce((s, c) => s + c.quantity * c.price, 0), [cart]);
  
  const discountAmount = useMemo(() => {
    const val = Number(discountValue || 0);
    if (!subtotal) return 0;
    if (discountMode === "percent") return Math.max(0, Math.min(subtotal, (subtotal * val) / 100));
    return Math.max(0, Math.min(subtotal, val));
  }, [discountMode, discountValue, subtotal]);

  const grandTotal = useMemo(() => {
    const t = subtotal - discountAmount + Number(taxAmount || 0);
    return Math.max(0, t);
  }, [discountAmount, subtotal, taxAmount]);

  const change = useMemo(() => {
    if (!paid || paymentMethod !== "Cash") return 0;
    return Math.max(0, Number(cashReceived || 0) - grandTotal);
  }, [cashReceived, grandTotal, paid, paymentMethod]);

  const [lastSale, setLastSale] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [showDraftSaveModal, setShowDraftSaveModal] = useState(false);
  const [pendingSync, setPendingSync] = useState(false);
  const autoSaveTimerRef = useRef(null);
  const searchDebounceRef = useRef(null);
  
  const netRemaining = useMemo(() => {
    if (paymentMethod !== "Mixed") return grandTotal;
    return Math.max(0, grandTotal - Number(cashReceived || 0) - Number(cardAmount || 0));
  }, [paymentMethod, grandTotal, cashReceived, cardAmount]);

  // Validation helpers
  const maxDiscountAllowed = useMemo(() => subtotal * 0.35, [subtotal]); // Max 35% discount
  const minSellingPrice = useMemo(() => {
    return cart.map(c => {
      const inv = (inventoryFetch.data || []).find(x => x.id === c.item_id);
      if (!inv || c.is_labor) return null;
      return { item_id: c.item_id, cost: inv.cost_price || 0 };
    }).filter(Boolean);
  }, [cart, inventoryFetch.data]);

  const hasNegativeMargin = useMemo(() => {
    return minSellingPrice.some(item => {
      const cartItem = cart.find(c => c.item_id === item.item_id);
      return cartItem && cartItem.price < item.cost;
    });
  }, [cart, minSellingPrice]);

  const cashierSummary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const todaysSales = (salesFetch.data || []).filter((s) => String(s.created_at).slice(0, 10) === today && !s.is_return && !s.is_voided);
    const total = todaysSales.reduce((sum, s) => sum + Number(s.total || 0), 0);
    return { count: todaysSales.length, total };
  }, [salesFetch.data]);

  // Return Modal State
  const [returnModalSale, setReturnModalSale] = useState(null);
  const [returnLines, setReturnLines] = useState([]);
  const [returnNote, setReturnNote] = useState("");
  const [isReturning, setIsReturning] = useState(false);

  useEffect(() => {
    api
      .get('/pos/print-profile')
      .then((res) => setProfile({ ...defaultProfile, ...(res.data || {}) }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "F2") { e.preventDefault(); checkout(); }
      if (e.key === "F4") { e.preventDefault(); setCashReceived(grandTotal); setTimeout(() => document.querySelector('button[title="Settle Payment"]')?.focus(), 100); }
      if (e.key === "Escape") { clearCart(); }
      if (e.key === "/") { e.preventDefault(); productSearchRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); barcodeRef.current?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); checkout(); }
      if ((e.ctrlKey || e.metaKey) && e.key === "Backspace") { 
        e.preventDefault(); 
        if (selectedCartIndex >= 0 && cart[selectedCartIndex]) {
          removeItem(cart[selectedCartIndex].item_id);
        }
      }
      if (cart.length && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedCartIndex((i) => Math.min(i + 1, cart.length - 1));
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedCartIndex((i) => Math.max(i - 1, 0));
        }
        const activeItem = cart[selectedCartIndex];
        if (activeItem && (e.key === "+" || e.key === "=")) {
          e.preventDefault();
          stepQty(activeItem.item_id, 1);
        }
        if (activeItem && e.key === "-") {
          e.preventDefault();
          stepQty(activeItem.item_id, -1);
        }
        if (activeItem && e.key === "Delete") {
          e.preventDefault();
          removeItem(activeItem.item_id);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, selectedCartIndex, paymentMethod, customerId, mode, discountAmount, taxAmount, paid, grandTotal, lastSale]);

  useEffect(() => {
    localStorage.setItem("pos_suspended_carts", JSON.stringify(suspendedCarts));
  }, [suspendedCarts]);

  // Auto-save draft every 3 seconds
  useEffect(() => {
    if (!cart.length) return;
    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const draft = {
        token: `DRAFT-${new Date().toLocaleTimeString()}`,
        created_at: new Date().toISOString(),
        customerId,
        paymentMethod,
        mode,
        discountMode,
        discountValue,
        taxAmount,
        cashReceived,
        cardAmount,
        repairTicketNo,
        cart,
        label: draftLabel || "Auto-saved Draft",
      };
      localStorage.setItem("pos_current_draft", JSON.stringify(draft));
      setPendingSync(false);
    }, 2000);
    setPendingSync(true);
    return () => clearTimeout(autoSaveTimerRef.current);
  }, [cart, customerId, paymentMethod, mode, discountMode, discountValue, taxAmount, cashReceived, cardAmount, repairTicketNo, draftLabel]);

  const tryAddByCode = (e) => {
    if (e && e.key !== "Enter") return;
    const code = (scanCode || "").trim();
    if (!code) return;
    const inv = (inventoryFetch.data || []);
    const hit = inv.find(i => String(i.barcode || "").trim() === code) || inv.find(i => String(i.sku || "").trim().toLowerCase() === code.toLowerCase());
    if (hit) {
      addItem(hit);
      setScanCode("");
      barcodeRef.current?.focus(); // Auto-focus recovery
    } else {
      toast("Item not found", "error");
      barcodeRef.current?.focus();
    }
  };

  const addItem = (i) => {
    if (i.quantity <= 0 && !i.is_labor) return toast("Item out of stock", "warning");
    let added = false;
    setCart((prev) => {
      const existing = prev.find((p) => p.item_id === i.id && !p.is_labor);
      if (existing) {
        if (!i.is_labor && existing.quantity >= i.quantity) { toast("Cannot exceed stock", "warning"); return prev; }
        added = true;
        return prev.map((p) => p.item_id === i.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      added = true;
      return [...prev, { item_id: i.id || Date.now(), name: i.name, quantity: 1, price: i.sale_price || 0, warranty_days: 0, is_labor: i.is_labor }];
    });
    if (added) toast(`Added ${i.name}`, "success");
  };

  const addLaborCharge = () => {
    addItem({ id: `labor-${Date.now()}`, name: "Repair Labor Charge", sale_price: 1500, quantity: 999, is_labor: true });
  };

  const removeItem = (id) => {
    setCart(prev => prev.filter(i => i.item_id !== id));
    if (selectedCartIndex > 0) setSelectedCartIndex(selectedCartIndex - 1);
  };
  
  const updateItem = (id, field, value) => {
    setCart(prev => prev.map(i => i.item_id === id ? { ...i, [field]: value } : i));
  };

  const updateDiscountValue = (val) => {
    const numVal = Number(val || 0);
    if (discountMode === "percent" && numVal > 35) {
      toast("Max discount: 35%", "warning");
      setDiscountValue(35);
      return;
    }
    if (discountMode === "amount" && numVal > maxDiscountAllowed) {
      toast(`Max discount: LKR ${Math.round(maxDiscountAllowed)}`, "warning");
      setDiscountValue(maxDiscountAllowed);
      return;
    }
    setDiscountValue(numVal);
  };

  const stepQty = (itemId, delta) => {
    const item = cart.find(i => i.item_id === itemId);
    if (!item) return;
    if (item.is_labor) {
      updateItem(itemId, 'quantity', Math.max(1, item.quantity + delta));
      return;
    }
    const inv = (inventoryFetch.data || []).find(x => x.id === itemId);
    const max = inv?.quantity ?? Infinity;
    const next = Math.max(1, Math.min(max, item.quantity + delta));
    updateItem(itemId, 'quantity', next);
  };

  const clearCart = () => {
    setCart([]);
    setDiscountValue(0);
    setTaxAmount(0);
    setPaid(true);
    setCashReceived("");
    setCardAmount("");
    setRepairTicketNo("");
  };

  const suspendCurrentCart = () => {
    if (!cart.length) return toast("Cart is empty", "warning");
    const token = `SUSP-${Date.now().toString().slice(-5)}`;
    setSuspendedCarts((prev) => [
      {
        token,
        created_at: new Date().toISOString(),
        customerId,
        paymentMethod,
        mode,
        discountMode,
        discountValue,
        taxAmount,
        cashReceived,
        cardAmount,
        repairTicketNo,
        cart,
      },
      ...prev,
    ]);
    clearCart();
    toast(`Cart suspended as ${token}`, "success");
  };

  const resumeSuspendedCart = (token) => {
    const found = suspendedCarts.find((c) => c.token === token);
    if (!found) return;
    setCart(found.cart || []);
    setCustomerId(found.customerId || "");
    setPaymentMethod(found.paymentMethod || "Cash");
    setMode(found.mode || "sale");
    setDiscountMode(found.discountMode || "amount");
    setDiscountValue(found.discountValue || 0);
    setTaxAmount(found.taxAmount || 0);
    setCashReceived(found.cashReceived || "");
    setCardAmount(found.cardAmount || "");
    setRepairTicketNo(found.repairTicketNo || "");
    setSuspendedCarts((prev) => prev.filter((c) => c.token !== token));
    setShowSuspendPicker(false);
    toast(`Resumed ${token}`, "success");
  };

  const loadRepairTicketToCart = () => {
    const code = (repairTicketNo || "").trim().toLowerCase();
    if (!code) return toast("Enter repair ticket no", "warning");
    const hit = (repairsFetch.data || []).find((r) => String(r.ticket_no || "").toLowerCase() === code);
    if (!hit) return toast("Repair ticket not found", "error");
    const laborAmount = Number(hit.estimated_cost || 0) - Number(hit.advance_payment || 0);
    if (laborAmount > 0) {
      addItem({
        id: `labor-${hit.id}-${Date.now()}`,
        name: `Repair ${hit.ticket_no} - ${hit.device_model}`,
        sale_price: laborAmount,
        quantity: 999,
        is_labor: true,
      });
    }
    toast(`Loaded ${hit.ticket_no} to cart`, "success");
  };

  const createCustomerQuick = async () => {
    if (!newCustomer.name || !newCustomer.phone) return toast("Name and phone required", "warning");
    try {
      const { data } = await api.post("/customers", newCustomer);
      customersFetch.setData([data, ...(customersFetch.data || [])]);
      setCustomerId(String(data.id));
      setShowNewCustomerModal(false);
      setNewCustomer({ name: "", phone: "", email: "", address: "" });
      toast("Customer created", "success");
    } catch {
      toast("Failed to create customer", "error");
    }
  };

  const checkout = async () => {
    if (cart.length === 0) return toast("Cart is empty", "warning");
    
    // Validation guards
    if (hasNegativeMargin) {
      toast("Cannot checkout: negative margin detected. Review prices.", "error");
      return;
    }
    
    if (paymentMethod === "Mixed") {
      const totalTendered = Number(cashReceived || 0) + Number(cardAmount || 0);
      if (totalTendered < grandTotal * 0.95) {
        toast("Underpayment: tender less than subtotal", "error");
        return;
      }
      if (totalTendered > grandTotal * 1.05) {
        toast("Overpayment detected. Adjust amounts.", "warning");
      }
    }
    
    if (paymentMethod === "Cash" && Number(cashReceived || 0) < grandTotal) {
      toast("Insufficient cash received", "error");
      return;
    }

    try {
      const payload = {
        lines: cart.map(c => ({ item_id: String(c.item_id).startsWith('labor') ? null : c.item_id, item_name: c.name, quantity: c.quantity, price: c.price, warranty_days: c.warranty_days })),
        payment_method: paymentMethod,
        cash_amount: paymentMethod === "Mixed" ? Number(cashReceived || 0) : undefined,
        card_amount: paymentMethod === "Mixed" ? Number(cardAmount || 0) : undefined,
        paid,
        customer_id: customerId ? Number(customerId) : null,
        discount_amount: Number(discountAmount || 0),
        tax_amount: Number(taxAmount || 0),
        note: mode === "repair" ? `Repair Ticket: ${repairTicketNo}` : ""
      };
      const { data: r } = await api.post('/pos/checkout', payload);
      setLastSale(r);
      toast("Sale completed successfully", "success");
      clearCart();
      localStorage.removeItem("pos_current_draft");
      const refreshed = await api.get('/pos/sales');
      salesFetch.setData(refreshed.data);
      inventoryFetch.refresh();
    } catch (err) {
      toast(err.response?.data?.detail || "Checkout failed", "error");
    }
  };

  const openReturnModal = async (saleId) => {
    try {
      const { data } = await api.get(`/pos/sales/${saleId}`);
      if (data.is_voided) return toast("Cannot return a voided sale", "warning");
      setReturnModalSale(data);
      setReturnLines(data.lines.map(l => ({ ...l, return_qty: 0 })));
      setReturnNote("");
    } catch (e) {
      toast("Failed to load sale details", "error");
    }
  };

  const submitReturn = async () => {
    const linesToReturn = returnLines.filter(l => l.return_qty > 0).map(l => ({
      item_id: l.item_id,
      quantity: l.return_qty,
      price: l.price
    }));
    if (linesToReturn.length === 0) return toast("No items selected to return", "warning");
    
    setIsReturning(true);
    try {
      await api.post('/pos/return', {
        sale_id: returnModalSale.id,
        lines: linesToReturn,
        note: returnNote
      });
      toast("Return processed successfully", "success");
      setReturnModalSale(null);
      salesFetch.refresh();
      inventoryFetch.refresh();
    } catch (e) {
      toast(e.response?.data?.detail || "Return failed", "error");
    } finally {
      setIsReturning(false);
    }
  };

  const printReceipt = () => {
    if (!lastSale) return toast("No recent sale to print", "warning");
    const pageSize = profile.format === "A4" ? "A4" : profile.format === "80MM" ? "80mm auto" : "58mm auto";
    const bodyWidth = profile.format === "A4" ? "100%" : profile.format === "80MM" ? "72mm" : "50mm";
    const logoDisplay = profile.show_logo && profile.logo_url ? "block" : "none";
    
    let linesHtml = "";
    lastSale.lines.forEach(l => {
      const wText = l.warranty_days ? "<br><span class='warranty'>Warranty: " + l.warranty_days + " Days</span>" : "";
      const qty = Number(l.quantity ?? l.qty ?? 0);
      const unitPrice = Number(l.price ?? l.unit_price ?? 0);
      linesHtml += "<div class='item-row'><div class='item-details'><span class='item-name'>" + l.item_name + "</span>" + wText + "</div><div class='item-qty'>" + qty + "</div><div class='item-total'>" + (qty * unitPrice).toFixed(2) + "</div></div>";
    });
    const warrantyRows = Array.isArray(lastSale.warranty_records) ? lastSale.warranty_records : [];
    const warrantyHtml = warrantyRows.length
      ? "<div class='warranty-block'><div class='warranty-title'>Warranty Coverage</div>" +
        warrantyRows.map((w) => {
          const startDate = w.start_date ? new Date(w.start_date).toLocaleDateString() : "-";
          const endDate = w.end_date ? new Date(w.end_date).toLocaleDateString() : "-";
          return "<div class='warranty-row'><span class='warranty-item'>" + (w.item_name || "-") + "</span><span class='warranty-meta'>" + (w.warranty_days || 0) + "d | " + startDate + " to " + endDate + "</span></div>";
        }).join("") +
        "</div>"
      : "";

    const logoHtml = profile.logo_url ? "<img src='" + profile.logo_url + "' class='logo' />" : "";

    const receiptHtml = `
<html><head><title>${lastSale.invoice_no}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap');
  @page { size: ${pageSize}; margin: ${profile.margin_mm}mm; }
  body { font-family: 'Space Mono', monospace; color: #000; font-size: 11px; margin: 0; padding: 0; }
  .wrap { width: ${bodyWidth}; margin: 0 auto; background: #fff; padding: 10px 5px; box-sizing: border-box; }
  .head { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 15px; margin-bottom: 15px; }
  .logo { max-width: 120px; max-height: 50px; display: ${logoDisplay}; margin: 0 auto 10px; }
  h2 { font-size: 18px; font-weight: 900; margin: 0 0 5px 0; text-transform: uppercase; letter-spacing: 1px; color: #000; }
  .contact { font-size: 10px; color: #333; margin: 2px 0; }
  .meta-info { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 5px; font-weight: 700; color: #000; }
  .table-header { display: flex; font-weight: 900; font-size: 10px; text-transform: uppercase; border-bottom: 1px solid #000; border-top: 1px solid #000; padding: 5px 0; margin-bottom: 10px; }
  .col-1 { flex: 1; text-align: left; }
  .col-2 { width: 30px; text-align: center; }
  .col-3 { width: 60px; text-align: right; }
  .item-row { display: flex; margin-bottom: 8px; align-items: flex-start; }
  .item-details { flex: 1; text-align: left; line-height: 1.2; }
  .item-name { font-weight: 700; font-size: 11px; }
  .warranty { font-size: 9px; color: #555; }
  .item-qty { width: 30px; text-align: center; font-weight: 700; font-size: 11px; }
  .item-total { width: 60px; text-align: right; font-weight: 700; font-size: 11px; }
  .totals-area { border-top: 2px dashed #000; margin-top: 10px; padding-top: 10px; }
  .total-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px; font-weight: 700; }
  .grand-total { display: flex; justify-content: space-between; margin-top: 8px; padding-top: 8px; border-top: 2px solid #000; font-size: 14px; font-weight: 900; }
  .warranty-block { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #000; }
  .warranty-title { font-size: 10px; font-weight: 900; text-transform: uppercase; margin-bottom: 6px; letter-spacing: .06em; }
  .warranty-row { margin-bottom: 4px; }
  .warranty-item { display: block; font-size: 10px; font-weight: 700; }
  .warranty-meta { display: block; font-size: 9px; color: #444; }
  .footer { text-align: center; margin-top: 25px; font-size: 10px; color: #000; font-weight: 700; border-top: 1px dashed #000; padding-top: 15px; }
</style>
</head><body>
<div class="wrap">
  <div class="head">
    ${logoHtml}
    <h2>${profile.store_name}</h2>
    <p class="contact">${profile.store_address}</p>
    <p class="contact">${profile.store_phone}</p>
  </div>
  <div class="meta-info"><span>Date:</span><span>${new Date().toLocaleString()}</span></div>
  <div class="meta-info"><span>Invoice No:</span><span>${lastSale.invoice_no}</span></div>
  <div class="meta-info"><span>Payment:</span><span>${lastSale.payment_method.toUpperCase()}</span></div>
  <div class="table-header">
    <div class="col-1">Item</div>
    <div class="col-2">Qty</div>
    <div class="col-3">Amount</div>
  </div>
  ${linesHtml}
  <div class="totals-area">
    <div class="total-row"><span>Subtotal</span><span>${lastSale.subtotal.toFixed(2)}</span></div>
    <div class="total-row"><span>Discount</span><span>${lastSale.discount_amount.toFixed(2)}</span></div>
    <div class="grand-total"><span>TOTAL LKR</span><span>${lastSale.total.toFixed(2)}</span></div>
  </div>
  ${warrantyHtml}
  <div class="footer">
    ${profile.footer_note}<br><br>
    POWERED BY I STORE
  </div>
</div>
<script>window.print();</script>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(receiptHtml); w.document.close(); }
  };

  const sendReceiptWhatsApp = () => {
    if (!lastSale) return toast("No recent sale", "warning");
    toast("WhatsApp send prepared (integrate customer phone mapping)", "info");
  };

  const sendReceiptEmail = () => {
    if (!lastSale) return toast("No recent sale", "warning");
    toast("Email send prepared (connect SMTP/mail API)", "info");
  };

  const getSupplierName = (item) => {
    const supplier = (suppliersFetch.data || []).find((s) => s.id === item?.supplier_id);
    return supplier?.name || "Direct / Unassigned";
  };

  const openProductDetail = (item) => {
    if (!item) return;
    setProductDetail({ ...item });
  };

  const startLongPress = (item) => {
    longPressTriggeredRef.current = false;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      longPressTriggeredRef.current = true;
      openProductDetail(item);
    }, 550);
  };

  const cancelLongPress = () => {
    clearTimeout(longPressTimerRef.current);
  };

  const filteredInventory = useMemo(() => {
    let items = inventoryFetch.data || [];
    if (activeCategory !== "All") items = items.filter(i => i.category === activeCategory);
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      const scored = items.map(i => {
        let score = 0;
        
        // Exact SKU/barcode match = highest priority
        if (String(i.sku || "").toLowerCase() === query) score = 1000;
        if (String(i.barcode || "").toLowerCase() === query) score = 1000;
        
        // Prefix match
        else if (i.name.toLowerCase().startsWith(query)) score = 100;
        else if (String(i.sku || "").toLowerCase().startsWith(query)) score = 100;
        
        // Contains match
        else if (i.name.toLowerCase().includes(query)) score = 50;
        else if (String(i.sku || "").toLowerCase().includes(query)) score = 50;
        else if (String(i.barcode || "").toLowerCase().includes(query)) score = 10;
        
        return { item: i, score };
      }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      
      items = scored.map(x => x.item);
    }
    
    return items;
  }, [inventoryFetch.data, activeCategory, searchQuery]);

  return (
    <div className="h-[calc(100vh-170px)] min-h-[620px] flex flex-col gap-3 text-slate-200 overflow-hidden">
      
      {/* TOP COMPACT STATUS BAR */}
      <div className="flex justify-between items-center bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-xl p-2 shrink-0 shadow-sm">
        <div className="flex bg-black/40 p-1 rounded-lg border border-white/5">
          <button 
            className={`px-6 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${mode === "sale" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
            onClick={() => setMode("sale")}
          >
            Product Sale
          </button>
          <button 
            className={`px-6 py-1.5 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${mode === "repair" ? "bg-indigo-600 text-white shadow-md" : "text-slate-400 hover:text-white"}`}
            onClick={() => setMode("repair")}
          >
            Repair Billing
          </button>
        </div>
        
        <div className="flex gap-8 px-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Subtotal</span>
            <span className="text-sm font-black">LKR {Math.round(subtotal).toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Discount</span>
            <span className="text-sm font-black text-rose-400">LKR {Math.round(discountAmount).toLocaleString()}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">Grand Total</span>
            <span className="text-lg font-black text-indigo-400 leading-none mt-0.5">LKR {Math.round(grandTotal).toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* 3-PANEL WORKSPACE */}
      <div className="flex flex-1 min-h-0 gap-3 overflow-hidden">
        
        {/* LEFT PANEL: PRODUCT EXPLORER (30%) */}
        <div className="w-[30%] flex flex-col bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-lg min-h-0">
          <div className="p-3 border-b border-white/5 bg-slate-900/50 space-y-2 shrink-0">
            <div className="relative">
              <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                ref={barcodeRef}
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                placeholder="Scan Barcode (Enter)"
                value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                onKeyDown={tryAddByCode}
              />
            </div>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
                ref={productSearchRef}
                className="w-full bg-black/20 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                placeholder="Search products..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Category Pills */}
            <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 pt-1">
              {CATEGORIES.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold transition-colors border ${activeCategory === cat ? "bg-indigo-500 border-indigo-400 text-white" : "bg-black/20 border-white/5 text-slate-400 hover:text-white"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 grid grid-cols-2 gap-2 content-start">
            {filteredInventory.map(i => {
              const margin = i.sale_price - i.cost_price;
              const marginPercent = i.cost_price > 0 ? ((margin / i.cost_price) * 100).toFixed(0) : 0;
              return (
              <div 
                key={i.id} 
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  addItem(i);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    addItem(i);
                  }
                }}
                onMouseDown={() => startLongPress(i)}
                onMouseUp={cancelLongPress}
                onMouseLeave={cancelLongPress}
                onTouchStart={() => startLongPress(i)}
                onTouchEnd={cancelLongPress}
                onContextMenu={(e) => {
                  e.preventDefault();
                  openProductDetail(i);
                }}
                role="button"
                tabIndex={0}
                className="cursor-pointer bg-black/20 border border-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all p-3 rounded-xl flex flex-col text-left group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-200 line-clamp-2 leading-tight group-hover:text-white">{i.name}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openProductDetail(i);
                    }}
                    className="shrink-0 p-1 rounded-md border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                    title="View details"
                  >
                    <Info size={12} />
                  </button>
                </div>
                <div className="text-[10px] text-slate-500 mt-1">{i.sku || 'No SKU'}</div>
                <div className="mt-auto pt-3 flex flex-col gap-1.5 w-full">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-black text-indigo-400">Rs. {i.sale_price.toLocaleString()}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${i.quantity > 5 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                      {i.quantity} in stock
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-slate-500">Margin:</span>
                    <span className={margin < 0 ? "text-rose-400 font-bold" : "text-emerald-400 font-bold"}>
                      {marginPercent}% (Rs. {Math.round(margin).toLocaleString()})
                    </span>
                  </div>
                </div>
              </div>
            );
            })}
            {filteredInventory.length === 0 && <div className="col-span-2 text-center py-10 text-slate-500 text-sm">No products found</div>}
          </div>
        </div>

        {/* CENTER PANEL: BILLING WORKSPACE (50%) */}
        <div className="w-[50%] flex flex-col bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-lg relative min-h-0">
          
          {mode === "repair" && (
            <div className="p-3 bg-indigo-900/20 border-b border-indigo-500/20 flex gap-3 items-center shrink-0">
               <Wrench size={16} className="text-indigo-400" />
               <input 
                 className="bg-black/40 border border-indigo-500/30 rounded-lg px-3 py-1.5 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-400 flex-1"
                 placeholder="Link Repair Ticket No. (e.g. R-1001)"
                 value={repairTicketNo}
                 onChange={e => setRepairTicketNo(e.target.value)}
               />
               <button onClick={addLaborCharge} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors shadow-lg">
                 + Add Labor
               </button>
               <button onClick={loadRepairTicketToCart} className="bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors border border-white/10">
                 Pull Ticket
               </button>
            </div>
          )}

          {/* Cart Table Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
             {hasNegativeMargin && (
               <div className="sticky top-0 z-20 bg-rose-500/20 border-b-2 border-rose-500/50 p-2 flex items-center gap-2 text-rose-400 text-xs font-bold">
                 <AlertCircle size={14} /> Negative margin detected on one or more items
               </div>
             )}
             <table className="w-full text-left border-collapse">
               <thead className="sticky top-0 bg-slate-950/80 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                 <tr>
                   <th className="p-3 font-bold">Item Name</th>
                   <th className="p-3 font-bold text-center w-24">Qty</th>
                   <th className="p-3 font-bold text-right w-24">Price</th>
                   <th className="p-3 font-bold text-right w-28">Total</th>
                   <th className="p-3 w-10"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {cart.map((c, idx) => {
                   const inv = (inventoryFetch.data || []).find(x => x.id === c.item_id);
                   const margin = inv ? (c.price - inv.cost_price) : 0;
                   const isNegativeMargin = !c.is_labor && margin < 0;
                   return (
                   <tr key={`${c.item_id}-${idx}`} onClick={() => setSelectedCartIndex(idx)} className={`hover:bg-white/5 transition-colors group ${selectedCartIndex === idx ? "bg-indigo-500/10 border-l-2 border-indigo-500" : ""} ${isNegativeMargin ? "bg-rose-500/5" : ""}`}>
                     <td className="p-3">
                       <div className="font-semibold text-sm text-slate-200 flex items-center gap-2">
                         {c.name}
                         {isNegativeMargin && <AlertCircle size={14} className="text-rose-400" />}
                       </div>
                       {!c.is_labor && (
                         <div className="flex items-center gap-2 mt-1">
                           <span className="text-[10px] text-slate-500">Warranty:</span>
                           <input 
                             type="number" 
                             className="bg-black/30 border border-white/10 rounded px-1.5 py-0.5 text-[10px] w-12 text-center outline-none focus:border-indigo-400"
                             value={c.warranty_days}
                             onChange={(e) => updateItem(c.item_id, 'warranty_days', Number(e.target.value))}
                             title="Warranty in days"
                           />
                           <span className="text-[10px] text-slate-500">days</span>
                         </div>
                       )}
                     </td>
                     <td className="p-3">
                       <div className="flex items-center justify-center bg-black/40 border border-white/10 rounded-lg overflow-hidden">
                         <button onClick={() => stepQty(c.item_id, -1)} className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/10"><Minus size={12}/></button>
                         <input 
                           type="number" 
                           className="w-8 bg-transparent text-center text-sm font-bold outline-none no-spinners" 
                           value={c.quantity}
                           onChange={(e) => updateItem(c.item_id, 'quantity', Math.max(1, Number(e.target.value)))}
                         />
                         <button onClick={() => stepQty(c.item_id, 1)} className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-white/10"><Plus size={12}/></button>
                       </div>
                     </td>
                     <td className="p-3">
                       <input 
                         type="number" 
                         className={`w-full bg-transparent text-right text-sm font-semibold outline-none focus:bg-white/5 border border-transparent focus:border-white/10 rounded px-1 ${isNegativeMargin ? "text-rose-400" : ""}`}
                         value={c.price}
                         onChange={(e) => updateItem(c.item_id, 'price', Math.max(0, Number(e.target.value)))}
                       />
                     </td>
                     <td className="p-3 text-right font-black text-indigo-300">
                       {(c.price * c.quantity).toLocaleString()}
                     </td>
                     <td className="p-3 text-right">
                       <button onClick={() => removeItem(c.item_id)} className="text-rose-500/50 hover:text-rose-400 transition-colors p-1 rounded hover:bg-rose-500/10">
                         <Trash2 size={16} />
                       </button>
                     </td>
                   </tr>
                 );
                 })}
               </tbody>
             </table>
             {cart.length === 0 && (
               <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50 pb-10">
                 <ShoppingBasket size={48} className="mb-4" />
                 <p className="text-sm font-medium">Cart is empty</p>
                 <p className="text-xs">Scan or click products to add</p>
               </div>
             )}
          </div>

          {/* Sticky Checkout Area */}
          <div className="shrink-0 bg-slate-950 border-t border-white/10 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
              
              <div className="space-y-3 min-w-0">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-500 shrink-0" />
                  <select 
                    className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    value={customerId} 
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Walk-in Customer</option>
                    {(customersFetch.data || []).map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}
                  </select>
                  <button onClick={() => setShowNewCustomerModal(true)} className="px-2.5 py-2 rounded-lg bg-white/10 border border-white/10 text-[11px] font-bold hover:bg-white/20 whitespace-nowrap shrink-0">+New</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {["Cash", "Card", "Bank Transfer", "Mixed"].map(m => (
                    <button 
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${paymentMethod === m ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-black/20 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"}`}
                    >
                      {m === "Bank Transfer" ? "Bank" : m}
                    </button>
                  ))}
                </div>
                {paymentMethod === "Cash" && (
                  <div className="flex gap-2">
                    {[grandTotal, grandTotal + 500, grandTotal + 1000].map((amt, i) => (
                      <button key={i} onClick={() => setCashReceived(Math.round(amt))} className="flex-1 rounded-md border border-white/10 bg-white/5 py-1 text-[10px] font-bold text-slate-300 hover:bg-white/10">
                        {i === 0 ? "Exact" : `+${i * 500}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 min-w-0">
                <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5">
                   <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                      Discount 
                      <button onClick={() => setDiscountMode(m => m === "amount" ? "percent" : "amount")} className="text-indigo-400 bg-indigo-400/10 px-1 rounded text-[10px] font-bold">{discountMode === "amount" ? "LKR" : "%"}</button>
                   </div>
                   <input type="number" className="w-24 bg-transparent text-right text-sm font-bold outline-none" placeholder="0" value={discountValue} onChange={e => updateDiscountValue(e.target.value)} />
                </div>
                {paymentMethod === "Cash" && (
                  <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5 focus-within:border-emerald-500/50">
                     <span className="text-xs text-slate-400 font-medium">Cash Given</span>
                     <input type="number" className="w-28 bg-transparent text-right text-sm font-bold text-emerald-400 outline-none" placeholder="0" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
                  </div>
                )}
                {paymentMethod === "Mixed" && (
                  <>
                    <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><Banknote size={12}/> Cash</span>
                      <input type="number" className="w-28 bg-transparent text-right text-sm font-bold text-emerald-400 outline-none" placeholder="0" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
                    </div>
                    <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5">
                      <span className="text-xs text-slate-400 font-medium flex items-center gap-1"><CreditCard size={12}/> Card</span>
                      <input type="number" className="w-28 bg-transparent text-right text-sm font-bold text-sky-400 outline-none" placeholder="0" value={cardAmount} onChange={e => setCardAmount(e.target.value)} />
                    </div>
                    <div className={`text-right text-xs font-bold ${netRemaining <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
                      Remaining: LKR {Math.round(Math.max(0, netRemaining)).toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-2.5">
              <button onClick={clearCart} className="p-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors shrink-0" title="Clear Cart (ESC)">
                <Trash2 size={20} />
              </button>
              <button onClick={printReceipt} disabled={!lastSale} className={`p-3 rounded-xl transition-colors shrink-0 ${lastSale ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`} title="Print Last Receipt (F4)">
                <Printer size={20} />
              </button>
              <button onClick={suspendCurrentCart} className="p-3 rounded-xl transition-colors shrink-0 bg-white/5 text-slate-300 hover:bg-white/10 relative" title="Suspend Cart">
                <Save size={20} />
                {pendingSync && <span className="absolute top-1 right-1 w-2 h-2 bg-amber-400 rounded-full animate-pulse" title="Auto-saving..." />}
              </button>
              <button onClick={() => setShowSuspendPicker(true)} className="p-3 rounded-xl transition-colors shrink-0 bg-white/5 text-slate-300 hover:bg-white/10" title="Resume Cart">
                <FolderOpen size={20} />
              </button>
              <button 
                onClick={checkout} 
                disabled={hasNegativeMargin}
                className={`flex-1 font-black text-lg uppercase tracking-widest rounded-xl shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${hasNegativeMargin ? "bg-slate-600/50 text-slate-400 cursor-not-allowed opacity-50" : "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-indigo-900/50"}`}
                title={hasNegativeMargin ? "Fix negative margins before checkout" : "Complete Sale (F2)"}
              >
                Complete Sale <span className="text-xs bg-black/20 px-2 py-1 rounded ml-2 font-medium normal-case tracking-normal opacity-80">(F2)</span>
              </button>
            </div>
            {paymentMethod === "Cash" && cashReceived && change >= 0 && (
              <div className="text-center mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-xs text-emerald-300/70 font-medium mb-1">CHANGE TO RETURN</div>
                <div className="text-lg font-black text-emerald-400">LKR {change.toLocaleString()}</div>
              </div>
            )}
            <div className="text-center mt-2 text-[9px] text-slate-500/70 space-y-1">
              <div>F2: Checkout | F4: Set exact amount | Ctrl+Backspace: Remove line | /: Search</div>
              <div>↑↓: Select line | ±: Adjust qty | Delete: Remove | Esc: Clear cart</div>
            </div>
          </div>
        </div>

        {/* RIGHT PANEL: QUICK ACTIONS (20%) */}
        <div className="w-[20%] flex flex-col gap-3 overflow-y-auto custom-scrollbar min-h-0">
          
          <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 shadow-lg shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Wrench size={12}/> Repair Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <a href="/repairs" className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors">New Repair Ticket</a>
              <button onClick={() => setMode("repair")} className="bg-white/5 hover:bg-indigo-500/20 border border-white/5 hover:border-indigo-500/30 text-indigo-300 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors">Process Repair Payment</button>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 shadow-lg shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><User size={12}/> Customer Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <a href="/customers" className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors">Add New Customer</a>
              <button onClick={() => setShowNewCustomerModal(true)} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors">Quick Create Customer</button>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 shadow-lg shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Printer size={12}/> Receipt Actions</h3>
            <div className="grid grid-cols-1 gap-2">
              <button onClick={printReceipt} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors">Print Receipt</button>
              <button onClick={sendReceiptWhatsApp} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors flex items-center justify-center gap-1"><MessageCircle size={12}/> WhatsApp</button>
              <button onClick={sendReceiptEmail} className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-lg p-2.5 text-xs font-semibold text-center transition-colors flex items-center justify-center gap-1"><Mail size={12}/> Email</button>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 shadow-lg shrink-0">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Wallet size={12}/> Shift Snapshot</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs"><span className="text-slate-500">Today's Sales</span><span className="font-bold text-slate-200">{cashierSummary.count}</span></div>
              <div className="flex justify-between text-xs"><span className="text-slate-500">Today's Revenue</span><span className="font-bold text-emerald-300">LKR {Math.round(cashierSummary.total).toLocaleString()}</span></div>
            </div>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 shadow-lg flex-1 min-h-[200px] flex flex-col">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 flex items-center gap-2"><Clock size={12}/> Recent Sales</h3>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {(salesFetch.data || []).slice(0,10).map((s) => (
                <div key={s.id} className="bg-black/20 border border-white/5 rounded-lg p-2.5 hover:bg-white/5 transition-colors cursor-default">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold text-slate-300">{s.invoice_no}</span>
                    <span className="text-xs font-black text-emerald-400">{s.total.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500">{new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${s.payment_method === 'Cash' ? 'bg-green-500/10 text-green-400' : 'bg-sky-500/10 text-sky-400'}`}>
                      {s.payment_method}
                    </span>
                  </div>
                  {!s.is_voided && !s.is_return && (
                    <button onClick={(e) => { e.stopPropagation(); openReturnModal(s.id); }} className="mt-2 w-full flex items-center justify-center gap-1 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 text-[10px] font-bold transition-colors">
                      <CornerUpLeft size={10} /> Process Return
                    </button>
                  )}
                  {s.is_return && <div className="mt-2 text-center text-[9px] font-bold text-rose-500 uppercase">Refunded</div>}
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* RETURN MODAL */}
      {productDetail && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setProductDetail(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-indigo-400/40 bg-slate-900 shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Product Details</h2>
              <button onClick={() => setProductDetail(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 grid grid-cols-[120px_1fr] gap-4">
              <div className="h-[120px] rounded-xl border border-white/10 bg-black/30 grid place-items-center overflow-hidden">
                {productDetail.image_url ? (
                  <img src={productDetail.image_url} alt={productDetail.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-slate-500">
                    <ImageOff size={26} />
                    <span className="text-[10px] mt-1">No Image</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-base font-bold text-white leading-tight">{productDetail.name || "Unnamed Product"}</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <MetaItem label="Category" value={productDetail.category || "-"} />
                  <MetaItem label="Supplier" value={getSupplierName(productDetail)} />
                  <MetaItem label="SKU" value={productDetail.sku || "-"} mono />
                  <MetaItem label="Barcode" value={productDetail.barcode || "-"} mono />
                  <MetaItem label="Stock" value={String(productDetail.quantity ?? 0)} />
                  <MetaItem label="Serial Tracking" value={productDetail.has_serials ? "Enabled" : "Disabled"} />
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-slate-500">Cost Price</p>
                    <p className="text-sm font-bold text-slate-200">Rs. {Number(productDetail.cost_price || 0).toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-indigo-300/80">Selling Price</p>
                    <p className="text-sm font-black text-indigo-300">Rs. {Number(productDetail.sale_price || 0).toLocaleString()}</p>
                  </div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${(productDetail.sale_price - productDetail.cost_price) < 0 ? "border-rose-500/30 bg-rose-500/10" : "border-emerald-500/30 bg-emerald-500/10"}`}>
                  <p className="text-[10px] uppercase tracking-wider text-slate-300">Margin</p>
                  <p className={`text-base font-black ${(productDetail.sale_price - productDetail.cost_price) < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                    Rs. {(productDetail.sale_price - productDetail.cost_price).toLocaleString()} ({productDetail.cost_price > 0 ? (((productDetail.sale_price - productDetail.cost_price) / productDetail.cost_price) * 100).toFixed(1) : 0}%)
                  </p>
                </div>
              </div>
            </div>
            <div className="px-4 pb-1 text-[11px] text-slate-500">Tip: long-press card, right-click, or tap info icon to open this panel.</div>
            <div className="p-4 border-t border-white/10 bg-black/20 flex gap-2">
              <button
                onClick={() => {
                  addItem(productDetail);
                  setProductDetail(null);
                }}
                className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5"
              >
                Add To Cart
              </button>
              <button onClick={() => setProductDetail(null)} className="px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 font-bold py-2.5">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {returnModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><RefreshCw size={18} className="text-rose-400"/> RMA / Sales Return</h2>
              <button onClick={() => setReturnModalSale(null)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-sm text-slate-400 mb-4">Original Invoice: <span className="text-white font-bold">{returnModalSale.invoice_no}</span></p>
              
              <div className="space-y-3">
                {returnLines.map((line, idx) => (
                  <div key={idx} className="bg-black/30 border border-white/5 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="text-sm font-bold text-slate-200">{line.name}</p>
                      <p className="text-xs text-slate-500">Max returnable: {line.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2 bg-black/50 rounded-lg p-1">
                      <button 
                        onClick={() => setReturnLines(prev => prev.map((l, i) => i === idx ? {...l, return_qty: Math.max(0, l.return_qty - 1)} : l))}
                        className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded"
                      >
                        <Minus size={14}/>
                      </button>
                      <span className="w-6 text-center font-bold text-sm text-rose-400">{line.return_qty}</span>
                      <button 
                        onClick={() => setReturnLines(prev => prev.map((l, i) => i === idx ? {...l, return_qty: Math.min(l.quantity, l.return_qty + 1)} : l))}
                        className="p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded"
                      >
                        <Plus size={14}/>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 block">Return Reason / Note</label>
                <input 
                  type="text" 
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-rose-500" 
                  placeholder="e.g. Customer changed mind, defective..."
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                />
              </div>

              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-center">
                <p className="text-xs text-rose-300 font-bold uppercase">Total Refund Amount</p>
                <p className="text-2xl font-black text-rose-400">
                  LKR {returnLines.reduce((acc, l) => acc + (l.return_qty * l.price), 0).toLocaleString()}
                </p>
              </div>

            </div>
            <div className="p-4 border-t border-white/10 bg-black/20 flex gap-3">
              <button onClick={() => setReturnModalSale(null)} className="flex-1 py-2.5 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={submitReturn} disabled={isReturning} className="flex-1 py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-900/50 transition-all disabled:opacity-50">
                {isReturning ? "Processing..." : "Issue Refund"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuspendPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-lg font-bold text-white">Suspended Carts</h2>
              <button onClick={() => setShowSuspendPicker(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-3 space-y-2">
              {!suspendedCarts.length && <p className="text-sm text-slate-500 text-center py-8">No suspended carts</p>}
              {suspendedCarts.map((s) => (
                <button key={s.token} onClick={() => resumeSuspendedCart(s.token)} className="w-full text-left rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:bg-white/[0.06]">
                  <div className="flex justify-between text-sm font-bold text-slate-200">
                    <span>{s.token}</span>
                    <span>{s.cart.length} items</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{new Date(s.created_at).toLocaleString()}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h2 className="text-lg font-bold text-white">Quick Add Customer</h2>
              <button onClick={() => setShowNewCustomerModal(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-4 space-y-3">
              <input className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white" placeholder="Name" value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
              <input className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white" placeholder="Phone" value={newCustomer.phone} onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })} />
              <input className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white" placeholder="Email (optional)" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
              <input className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-sm text-white" placeholder="Address (optional)" value={newCustomer.address} onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })} />
            </div>
            <div className="p-4 border-t border-white/10 bg-black/20">
              <button onClick={createCustomerQuick} className="w-full py-2.5 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-all">Create & Attach</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function MetaItem({ label, value, mono = false }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-0.5 text-xs text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
