import { useEffect, useMemo, useState } from "react";
import api from "../lib/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Input, Select } from "../components/UI";
import { Barcode, Calculator, CreditCard, Percent, ShoppingBasket, Search, Printer, Trash2, Plus, Minus, User, Wrench, AlertTriangle, Clock } from "lucide-react";
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
  const [profile, setProfile] = useState(defaultProfile);

  const inventoryFetch = useFetch('/inventory');
  const customersFetch = useFetch('/customers');
  const salesFetch = useFetch('/pos/sales');
  const repairsFetch = useFetch('/repairs'); // To link tickets

  const [mode, setMode] = useState("sale"); // "sale" or "repair"
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  
  const [cart, setCart] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [customerId, setCustomerId] = useState("");
  
  const [discountMode, setDiscountMode] = useState("amount"); 
  const [discountValue, setDiscountValue] = useState(0);
  const [taxAmount, setTaxAmount] = useState(0);
  
  const [paid, setPaid] = useState(true);
  const [cashReceived, setCashReceived] = useState("");
  const [repairTicketNo, setRepairTicketNo] = useState("");

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

  useEffect(() => {
    api.get('/settings/print-profile').then((res) => setProfile({ ...defaultProfile, ...res.data })).catch(() => {});
    const handleKeyDown = (e) => {
      if (e.key === "F2") { e.preventDefault(); checkout(); }
      if (e.key === "F4") { e.preventDefault(); printReceipt(); }
      if (e.key === "Escape") { clearCart(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cart, paymentMethod, customerId, mode, discountAmount, taxAmount, paid, grandTotal, lastSale, profile]);

  const tryAddByCode = (e) => {
    if (e && e.key !== "Enter") return;
    const code = (scanCode || "").trim();
    if (!code) return;
    const inv = (inventoryFetch.data || []);
    const hit = inv.find(i => String(i.barcode || "").trim() === code) || inv.find(i => String(i.sku || "").trim().toLowerCase() === code.toLowerCase());
    if (hit) {
      addItem(hit);
      setScanCode("");
    } else {
      toast("Item not found", "error");
    }
  };

  const addItem = (i) => {
    if (i.quantity <= 0 && !i.is_labor) return toast("Item out of stock", "warning");
    setCart((prev) => {
      const existing = prev.find((p) => p.item_id === i.id && !p.is_labor);
      if (existing) {
        if (!i.is_labor && existing.quantity >= i.quantity) { toast("Cannot exceed stock", "warning"); return prev; }
        return prev.map((p) => p.item_id === i.id ? { ...p, quantity: p.quantity + 1 } : p);
      }
      return [...prev, { item_id: i.id || Date.now(), name: i.name, quantity: 1, price: i.sale_price || 0, warranty_days: 0, is_labor: i.is_labor }];
    });
  };

  const addLaborCharge = () => {
    addItem({ id: `labor-${Date.now()}`, name: "Repair Labor Charge", sale_price: 1500, quantity: 999, is_labor: true });
  };

  const removeItem = (id) => setCart(prev => prev.filter(i => i.item_id !== id));
  
  const updateItem = (id, field, value) => {
    setCart(prev => prev.map(i => i.item_id === id ? { ...i, [field]: value } : i));
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
    setRepairTicketNo("");
  };

  const checkout = async () => {
    if (cart.length === 0) return toast("Cart is empty", "warning");
    try {
      const payload = {
        lines: cart.map(c => ({ item_id: String(c.item_id).startsWith('labor') ? null : c.item_id, item_name: c.name, quantity: c.quantity, price: c.price, warranty_days: c.warranty_days })),
        payment_method: paymentMethod,
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
      const refreshed = await api.get('/pos/sales');
      salesFetch.setData(refreshed.data);
      inventoryFetch.refresh();
    } catch (err) {
      toast(err.response?.data?.detail || "Checkout failed", "error");
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
      linesHtml += "<div class='item-row'><div class='item-details'><span class='item-name'>" + l.item_name + "</span>" + wText + "</div><div class='item-qty'>" + l.quantity + "</div><div class='item-total'>" + (l.price * l.quantity).toFixed(2) + "</div></div>";
    });

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

  const filteredInventory = useMemo(() => {
    let items = inventoryFetch.data || [];
    if (activeCategory !== "All") items = items.filter(i => i.category === activeCategory);
    if (searchQuery) items = items.filter(i => i.name.toLowerCase().includes(searchQuery.toLowerCase()) || i.sku?.toLowerCase().includes(searchQuery.toLowerCase()));
    return items;
  }, [inventoryFetch.data, activeCategory, searchQuery]);

  return (
    <div className="absolute inset-4 flex flex-col gap-3 overflow-hidden text-slate-200">
      
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
      <div className="flex-1 flex gap-3 overflow-hidden">
        
        {/* LEFT PANEL: PRODUCT EXPLORER (30%) */}
        <div className="w-[30%] flex flex-col bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-lg">
          <div className="p-3 border-b border-white/5 bg-slate-900/50 space-y-2 shrink-0">
            <div className="relative">
              <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input 
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
            {filteredInventory.map(i => (
              <button 
                key={i.id} 
                onClick={() => addItem(i)}
                className="bg-black/20 border border-white/5 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all p-3 rounded-xl flex flex-col text-left group"
              >
                <div className="font-semibold text-sm text-slate-200 line-clamp-2 leading-tight group-hover:text-white">{i.name}</div>
                <div className="text-[10px] text-slate-500 mt-1">{i.sku || 'No SKU'}</div>
                <div className="mt-auto pt-3 flex justify-between items-center w-full">
                  <span className="text-xs font-black text-indigo-400">Rs. {i.sale_price.toLocaleString()}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${i.quantity > 5 ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                    {i.quantity}
                  </span>
                </div>
              </button>
            ))}
            {filteredInventory.length === 0 && <div className="col-span-2 text-center py-10 text-slate-500 text-sm">No products found</div>}
          </div>
        </div>

        {/* CENTER PANEL: BILLING WORKSPACE (50%) */}
        <div className="w-[50%] flex flex-col bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-2xl overflow-hidden shadow-lg relative">
          
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
            </div>
          )}

          {/* Cart Table Area */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
             <table className="w-full text-left border-collapse">
               <thead className="sticky top-0 bg-slate-950/80 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                 <tr>
                   <th className="p-3 font-bold">Item Name</th>
                   <th className="p-3 font-bold text-center w-24">Qty</th>
                   <th className="p-3 font-bold text-right w-24">Price</th>
                   <th className="p-3 font-bold text-right w-24">Total</th>
                   <th className="p-3 w-10"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-white/5">
                 {cart.map((c, idx) => (
                   <tr key={`${c.item_id}-${idx}`} className="hover:bg-white/5 transition-colors group">
                     <td className="p-3">
                       <div className="font-semibold text-sm text-slate-200">{c.name}</div>
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
                         className="w-full bg-transparent text-right text-sm font-semibold outline-none focus:bg-white/5 border border-transparent focus:border-white/10 rounded px-1"
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
                 ))}
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
            <div className="grid grid-cols-4 gap-4 mb-4">
              
              <div className="col-span-2 space-y-3">
                <div className="flex items-center gap-2">
                  <User size={16} className="text-slate-500" />
                  <select 
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                    value={customerId} 
                    onChange={(e) => setCustomerId(e.target.value)}
                  >
                    <option value="">Walk-in Customer</option>
                    {(customersFetch.data || []).map(c => <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  {["Cash", "Card", "Bank Transfer"].map(m => (
                    <button 
                      key={m}
                      onClick={() => setPaymentMethod(m)}
                      className={`flex-1 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider border transition-all ${paymentMethod === m ? "bg-indigo-600/20 border-indigo-500 text-indigo-300" : "bg-black/20 border-white/10 text-slate-500 hover:text-slate-300 hover:border-white/20"}`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              <div className="col-span-2 space-y-2">
                <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5">
                   <div className="text-xs text-slate-400 font-medium flex items-center gap-2">
                      Discount 
                      <button onClick={() => setDiscountMode(m => m === "amount" ? "percent" : "amount")} className="text-indigo-400 bg-indigo-400/10 px-1 rounded text-[10px] font-bold">{discountMode === "amount" ? "LKR" : "%"}</button>
                   </div>
                   <input type="number" className="w-20 bg-transparent text-right text-sm font-bold outline-none" placeholder="0" value={discountValue} onChange={e => setDiscountValue(e.target.value)} />
                </div>
                {paymentMethod === "Cash" && (
                  <div className="flex items-center justify-between bg-black/20 border border-white/5 rounded-lg px-3 py-1.5 focus-within:border-emerald-500/50">
                     <span className="text-xs text-slate-400 font-medium">Cash Given</span>
                     <input type="number" className="w-24 bg-transparent text-right text-sm font-bold text-emerald-400 outline-none" placeholder="LKR" value={cashReceived} onChange={e => setCashReceived(e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={clearCart} className="p-3 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded-xl transition-colors shrink-0" title="Clear Cart">
                <Trash2 size={20} />
              </button>
              <button onClick={printReceipt} disabled={!lastSale} className={`p-3 rounded-xl transition-colors shrink-0 ${lastSale ? 'bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`} title="Print Last Receipt (F4)">
                <Printer size={20} />
              </button>
              <button onClick={checkout} className="flex-1 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-black text-lg uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-900/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2">
                Complete Sale <span className="text-xs bg-black/20 px-2 py-1 rounded ml-2 font-medium normal-case tracking-normal opacity-80">(F2)</span>
              </button>
            </div>
            {paymentMethod === "Cash" && cashReceived && change >= 0 && (
              <div className="text-center mt-2 text-xs font-bold text-emerald-400">
                Change to return: LKR {change.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: QUICK ACTIONS (20%) */}
        <div className="w-[20%] flex flex-col gap-3 overflow-y-auto custom-scrollbar">
          
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
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
