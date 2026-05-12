import { useMemo, useState } from "react";
import api from "../lib/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, KpiCard } from "../components/UI";
import { AlertTriangle, Boxes, Package, Truck, Search, Plus, Printer, Edit2, ShieldCheck, X } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function Inventory() {
  const { toast } = useFeedback();
  const { data, loading, error, setData } = useFetch('/inventory');
  const suppliersFetch = useFetch('/inventory/suppliers');
  const suppliers = suppliersFetch.data || [];
  
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [adjustModal, setAdjustModal] = useState(null); // { item: Item }
  const [serialModal, setSerialModal] = useState(null); // { item: Item }

  // Forms state
  const [form, setForm] = useState({ name:'', category:'Phones', sku:'', quantity:1, cost_price:0, sale_price:0, barcode:'', supplier_id:'', has_serials: false });
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '' });
  const [adjustForm, setAdjustForm] = useState({ qty: 0, note: "" });
  const [serialForm, setSerialForm] = useState("");

  const add = async () => {
    try {
      const payload = { ...form, supplier_id: form.supplier_id ? Number(form.supplier_id) : null };
      const r = await api.post('/inventory', payload);
      setData([...(data||[]), r.data]);
      setShowAddModal(false);
      setForm({ name:'', category:'Phones', sku:'', quantity:1, cost_price:0, sale_price:0, barcode:'', supplier_id:'', has_serials: false });
      toast("Product added successfully", "success");
    } catch (e) {
      toast("Failed to add product", "error");
    }
  };

  const addSupplier = async () => {
    try {
      const r = await api.post('/inventory/suppliers', supplierForm);
      suppliersFetch.setData([...(suppliersFetch.data || []), r.data]);
      setShowSupplierModal(false);
      setSupplierForm({ name: '', contact: '' });
      toast("Supplier added successfully", "success");
    } catch(e) {
      toast("Failed to add supplier", "error");
    }
  };

  const adjustStock = async () => {
    if (!adjustModal || !adjustForm.note) return toast("Note is required", "warning");
    try {
      await api.post('/inventory/adjust', { item_id: adjustModal.id, quantity_change: Number(adjustForm.qty), note: adjustForm.note });
      toast("Stock adjusted successfully", "success");
      const r = await api.get('/inventory');
      setData(r.data);
      setAdjustModal(null);
      setAdjustForm({ qty: 0, note: "" });
    } catch (e) {
      toast("Adjustment failed", "error");
    }
  };

  const manageSerials = async () => {
    if (!serialModal || !serialForm) return;
    try {
      await api.post(`/inventory/${serialModal.id}/serials?serial_number=${encodeURIComponent(serialForm)}`);
      toast("Serial number added and stock incremented", "success");
      const r = await api.get('/inventory');
      setData(r.data);
      setSerialForm("");
    } catch (e) {
      toast(e.response?.data?.detail || "Failed to add serial", "error");
    }
  };

  const printLabel = (i) => {
    const labelHtml = `<html><head><title>Label - ${i.name}</title><style>@page { size: 50mm 30mm; margin: 0; } body { font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30mm; width: 50mm; text-align: center; color: #000; } .store { font-size: 8px; font-weight: bold; margin-bottom: 2px; } .name { font-size: 10px; margin-bottom: 4px; overflow: hidden; white-space: nowrap; width: 90%; } .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 24px; margin: 2px 0; } .price { font-size: 12px; font-weight: bold; }</style></head><body><div class="store">i Store</div><div class="name">${i.name}</div><div class="barcode">${i.barcode || i.sku}</div><div class="price">LKR ${i.sale_price.toLocaleString()}</div><script>window.print();</script></body></html>`;
    const w = window.open("", "_blank", "width=300,height=200");
    if (w) { w.document.write(labelHtml); w.document.close(); }
  };

  const filtered = useMemo(() => {
    return (data || []).filter((i) => {
      const matchQ = !barcodeQuery || (i.barcode || "").toLowerCase().includes(barcodeQuery.toLowerCase()) || i.sku.toLowerCase().includes(barcodeQuery.toLowerCase()) || i.name.toLowerCase().includes(barcodeQuery.toLowerCase());
      const matchT = activeTab === "All" || i.category === activeTab;
      return matchQ && matchT;
    });
  }, [data, barcodeQuery, activeTab]);

  const invStats = useMemo(() => {
    const rows = data || [];
    const low = rows.filter((i) => Number(i.quantity) <= 3).length;
    const totalQty = rows.reduce((s, i) => s + Number(i.quantity || 0), 0);
    return { count: rows.length, low, totalQty, suppliers: suppliers.length };
  }, [data, suppliers.length]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading Inventory System...</div>;
  if (error) return <div className="p-4 bg-red-500/10 text-red-400 rounded border border-red-500/20">{error}</div>;

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Stock / Inventory</h1>
          <p className="text-xs text-slate-400 mt-1">Manage products, parts, and suppliers</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowSupplierModal(true)} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/5 transition-all flex items-center gap-2">
            <Truck size={14}/> Suppliers
          </button>
          <button onClick={() => setShowAddModal(true)} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
            <Plus size={14}/> Add New Item
          </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-4 gap-3 shrink-0">
        <KpiCard tone="sky" title="Total SKUs" value={String(invStats.count)} icon={<Package size={18} />} />
        <KpiCard tone="amber" title="Low Stock Alerts" value={String(invStats.low)} icon={<AlertTriangle size={18} />} />
        <KpiCard tone="green" title="Total Units" value={String(invStats.totalQty)} icon={<Boxes size={18} />} />
        <KpiCard tone="violet" title="Active Suppliers" value={String(invStats.suppliers)} icon={<Truck size={18} />} />
      </div>

      {/* MAIN DATA TABLE PANEL */}
      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        {/* Table Toolbar */}
        <div className="p-4 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
          <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
            {["All", "Phones", "Accessories", "Spare Parts"].map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveTab(cat)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold tracking-wide transition-all ${activeTab === cat ? "bg-white/10 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"}`}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="relative w-72">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              placeholder="Search SKU, Barcode, Name..." 
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              value={barcodeQuery} 
              onChange={e => setBarcodeQuery(e.target.value)} 
            />
          </div>
        </div>

        {/* Table Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-bold">Product Item</th>
                <th className="px-6 py-4 font-bold">Category</th>
                <th className="px-6 py-4 font-bold">Identifiers</th>
                <th className="px-6 py-4 font-bold text-center">In Stock</th>
                <th className="px-6 py-4 font-bold text-right">Pricing (LKR)</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map(i => (
                <tr key={i.id} className="hover:bg-white/[0.02] transition-colors group">
                  <td className="px-6 py-3">
                    <div className="font-bold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors">{i.name}</div>
                    {i.has_serials && <div className="text-[10px] text-emerald-500 font-bold flex items-center gap-1 mt-1"><ShieldCheck size={10}/> Serialized</div>}
                  </td>
                  <td className="px-6 py-3">
                    <Badge tone={i.category === 'Phones' ? 'sky' : i.category === 'Spare Parts' ? 'amber' : 'violet'} className="text-[10px] px-2 py-0.5">
                      {i.category}
                    </Badge>
                  </td>
                  <td className="px-6 py-3">
                    <div className="font-mono text-xs text-slate-400 font-bold">{i.sku}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">{i.barcode || "No Barcode"}</div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    <span className={`inline-flex items-center justify-center min-w-[32px] h-6 px-2 rounded-md text-xs font-black ${i.quantity <= 3 ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-white/5 text-slate-300"}`}>
                      {i.quantity}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="font-black text-sm text-slate-200">{i.sale_price.toLocaleString()}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Cost: {Number(i.cost_price || 0).toLocaleString()}</div>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {i.has_serials && (
                         <button onClick={() => setSerialModal(i)} className="p-1.5 bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 rounded border border-sky-500/20 transition-colors" title="Manage Serials">
                           <ShieldCheck size={14}/>
                         </button>
                      )}
                      <button onClick={() => setAdjustModal(i)} className="p-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 rounded border border-amber-500/20 transition-colors" title="Adjust Stock">
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={() => printLabel(i)} className="p-1.5 bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white rounded border border-white/5 transition-colors" title="Print Barcode Label">
                        <Printer size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                     <div className="inline-flex flex-col items-center justify-center text-slate-500">
                       <Package size={32} className="mb-3 opacity-50"/>
                       <p className="text-sm font-bold">No items found</p>
                       <p className="text-xs mt-1">Try adjusting your search or filters.</p>
                     </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD ITEM MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2"><Package size={20} className="text-indigo-400"/> New Product Listing</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-5 max-h-[70vh] overflow-y-auto">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Product Name</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. iPhone 15 Pro Max Battery" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Category</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  <option>Phones</option><option>Accessories</option><option>Spare Parts</option><option>Tools</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Supplier</label>
                <select className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}>
                  <option value="">No Supplier (Direct)</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">SKU (Unique Code)</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" placeholder="PH-1234" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Barcode (Optional)</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono" placeholder="Scan barcode" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Cost Price (LKR)</label>
                <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" value={form.cost_price} onChange={e=>setForm({...form,cost_price:Number(e.target.value)})}/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Retail Price (LKR)</label>
                <input type="number" className="w-full bg-black/40 border border-indigo-500/30 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" value={form.sale_price} onChange={e=>setForm({...form,sale_price:Number(e.target.value)})}/>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Initial Quantity</label>
                <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/>
              </div>
              <div className="flex items-center pt-5 pl-2">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input type="checkbox" className="w-5 h-5 rounded border-white/10 bg-black text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-900" checked={form.has_serials} onChange={e=>setForm({...form,has_serials:e.target.checked})}/>
                  <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">Track Serial Numbers / IMEIs</span>
                </label>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={add} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 transition-all">Save to Inventory</button>
            </div>
          </div>
        </div>
      )}

      {/* SUPPLIER MODAL */}
      {showSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
             <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2"><Truck size={20} className="text-violet-400"/> Suppliers</h2>
              <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Company / Supplier Name</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-violet-500" value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})}/>
               </div>
               <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Contact Details</label>
                  <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-violet-500" value={supplierForm.contact} onChange={e=>setSupplierForm({...supplierForm,contact:e.target.value})}/>
               </div>
               <button onClick={addSupplier} className="w-full py-3 rounded-xl font-bold text-white bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50 transition-all mt-4">Add Supplier</button>
               
               <div className="mt-6 pt-6 border-t border-white/5">
                 <h3 className="text-xs font-bold text-slate-400 mb-3">Existing Suppliers</h3>
                 <div className="max-h-40 overflow-y-auto space-y-2 custom-scrollbar">
                   {suppliers.map(s => (
                     <div key={s.id} className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center">
                       <span className="text-sm font-bold text-slate-200">{s.name}</span>
                       <span className="text-xs text-slate-500">{s.contact}</span>
                     </div>
                   ))}
                 </div>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST MODAL */}
      {adjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
             <div className="p-6 border-b border-white/5">
               <h2 className="text-xl font-black text-white flex items-center gap-2">Adjust Stock</h2>
               <p className="text-xs text-slate-400 mt-1">{adjustModal.name}</p>
             </div>
             <div className="p-6 space-y-4">
               <div>
                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Quantity Change</label>
                 <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-lg text-center font-black text-white focus:outline-none focus:border-amber-500" placeholder="e.g. 5 or -5" value={adjustForm.qty} onChange={e=>setAdjustForm({...adjustForm,qty:e.target.value})}/>
                 <p className="text-[10px] text-slate-500 mt-1 text-center">Use negative numbers to deduct stock.</p>
               </div>
               <div>
                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Reason / Note</label>
                 <input type="text" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500" placeholder="e.g. Damaged, Found in warehouse" value={adjustForm.note} onChange={e=>setAdjustForm({...adjustForm,note:e.target.value})}/>
               </div>
             </div>
             <div className="p-6 pt-0 flex gap-3">
               <button onClick={() => setAdjustModal(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
               <button onClick={adjustStock} className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/50 transition-all">Confirm</button>
             </div>
           </div>
        </div>
      )}

      {/* SERIAL MODAL */}
      {serialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
           <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95">
             <div className="p-6 border-b border-white/5">
               <h2 className="text-xl font-black text-white flex items-center gap-2"><ShieldCheck size={20} className="text-sky-400"/> Add Serial / IMEI</h2>
               <p className="text-xs text-slate-400 mt-1">{serialModal.name}</p>
             </div>
             <div className="p-6 space-y-4">
               <div>
                 <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Serial Number</label>
                 <input type="text" autoFocus className="w-full bg-black/40 border border-sky-500/30 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-sky-500 font-mono" placeholder="Scan or type SN..." value={serialForm} onChange={e=>setSerialForm(e.target.value)}/>
                 <p className="text-[10px] text-slate-500 mt-2">Adding a serial number will automatically increase the stock quantity by 1.</p>
               </div>
             </div>
             <div className="p-6 pt-0 flex gap-3">
               <button onClick={() => setSerialModal(null)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
               <button onClick={manageSerials} className="flex-1 py-3 rounded-xl font-bold text-white bg-sky-600 hover:bg-sky-500 shadow-lg shadow-sky-900/50 transition-all">Save Serial</button>
             </div>
           </div>
        </div>
      )}

    </div>
  );
}
