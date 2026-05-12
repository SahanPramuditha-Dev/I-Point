import { useState } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge } from "../components/UI";
import { ShoppingBag, Truck, PackageCheck, History, Plus, X, List, Calendar } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function PurchaseOrders() {
  const { toast, confirm } = useFeedback();
  const { data: pos, setData: setPos, loading } = useFetch('/purchase');
  const { data: suppliers } = useFetch('/inventory/suppliers');
  const { data: inventory } = useFetch('/inventory');

  const [isCreating, setIsCreating] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [form, setForm] = useState({ supplier_id: "", note: "", items: [] });
  const [newItem, setNewItem] = useState({ item_id: "", quantity: 1, unit_cost: "" });

  const addPoItem = () => {
    if (!newItem.item_id) return;
    const inv = inventory?.find(i => i.id === Number(newItem.item_id));
    setForm(f => ({
      ...f,
      items: [...f.items, { ...newItem, item_id: Number(newItem.item_id), item_name: inv?.name }]
    }));
    setNewItem({ item_id: "", quantity: 1, unit_cost: "" });
  };

  const removePoItem = (idx) => {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  };

  const submitPo = async () => {
    if (!form.supplier_id || form.items.length === 0) return toast("Please select supplier and add items", "warning");
    try {
      const { data: newPo } = await api.post('/purchase', {
        supplier_id: Number(form.supplier_id),
        note: form.note,
        items: form.items.map(i => ({ item_id: i.item_id, quantity: i.quantity, unit_cost: i.unit_cost }))
      });
      setPos([newPo, ...(pos || [])]);
      setIsCreating(false);
      setForm({ supplier_id: "", note: "", items: [] });
      toast("Purchase order drafted successfully", "success");
    } catch (err) {
      toast("Failed to create PO", "error");
    }
  };

  const viewPo = async (poId) => {
    try {
      const { data: details } = await api.get(`/purchase/${poId}`);
      setSelectedPo(details);
    } catch (err) {
      toast("Failed to load PO details", "error");
    }
  };

  const receivePo = async (poId) => {
    const ok = await confirm("Receive Goods (GRN)", "This will finalize the PO and add items to your main inventory. Continue?");
    if (!ok) return;
    try {
      await api.post(`/purchase/${poId}/receive`);
      toast("Goods Received Note processed! Stock updated.", "success");
      const { data: updatedPos } = await api.get('/purchase');
      setPos(updatedPos);
      setSelectedPo(null);
    } catch (err) {
      toast("Failed to receive PO", "error");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading Purchase Orders...</div>;

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Purchase Orders & GRN</h1>
          <p className="text-xs text-slate-400 mt-1">Manage supplier orders, tracking and goods intake</p>
        </div>
        <button onClick={() => setIsCreating(true)} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
          <Plus size={14}/> Draft Purchase Order
        </button>
      </div>

      {/* MAIN TABLE PANEL */}
      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-black/20 shrink-0">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <History size={14}/> Order History & Intake Pipeline
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-bold">PO Tracker Number</th>
                <th className="px-6 py-4 font-bold">Supplier Info</th>
                <th className="px-6 py-4 font-bold">Created On</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-right">Invoice Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(pos || []).map(p => (
                <tr key={p.id} onClick={() => viewPo(p.id)} className="hover:bg-white/[0.02] transition-colors cursor-pointer group">
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-black text-sm uppercase border border-indigo-500/20">
                         <PackageCheck size={14} />
                       </div>
                       <span className="font-black text-sm text-indigo-300 group-hover:text-indigo-200 transition-colors">{p.po_number}</span>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-300 font-bold text-sm">
                      <Truck size={14} className="text-slate-500" />
                      {p.supplier_name || `Supplier #${p.supplier_id}`}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5 text-slate-400 text-sm font-medium">
                      <Calendar size={14} className="text-slate-500" />
                      {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Badge tone={p.status === "Received" ? "green" : p.status === "Draft" ? "slate" : "amber"} className="text-[10px] px-2 py-0.5 uppercase tracking-widest">
                      {p.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="font-black text-sm text-slate-200">LKR {p.total_cost.toLocaleString()}</div>
                    <div className="text-[10px] text-indigo-400 mt-1 font-bold tracking-wide group-hover:underline">View GRN →</div>
                  </td>
                </tr>
              ))}
              {(pos || []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <ShoppingBag size={32} className="mx-auto mb-3 opacity-30"/>
                    <p className="text-sm font-bold">No purchase orders found</p>
                    <p className="text-xs mt-1">Draft a new order to restock your inventory.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE PO MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2"><Truck size={20} className="text-indigo-400"/> Draft Purchase Order</h2>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            
            <div className="flex-1 overflow-hidden grid grid-cols-12 gap-0">
              
              {/* Left Sidebar - Add Items */}
              <div className="col-span-4 border-r border-white/5 bg-black/20 p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Select Supplier</label>
                  <select 
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" 
                    value={form.supplier_id} 
                    onChange={e => setForm({...form, supplier_id: e.target.value})}
                  >
                    <option value="">-- Choose Supplier --</option>
                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Internal Note / Ref</label>
                  <textarea 
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none min-h-[80px]" 
                    value={form.note} 
                    onChange={e => setForm({...form, note: e.target.value})} 
                    placeholder="e.g. Order for December stock..." 
                  />
                </div>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/10 flex flex-col gap-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-2"><List size={14}/> Add Item to PO</h3>
                  
                  <select 
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" 
                    value={newItem.item_id} 
                    onChange={e => setNewItem({...newItem, item_id: e.target.value})}
                  >
                    <option value="">Select Inventory Item</option>
                    {(inventory || []).map(i => <option key={i.id} value={i.id}>{i.name} ({i.quantity} in stock)</option>)}
                  </select>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                       <label className="text-[9px] text-slate-500 uppercase font-bold ml-1">Order Qty</label>
                       <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-center font-bold text-white outline-none" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})} />
                    </div>
                    <div>
                       <label className="text-[9px] text-slate-500 uppercase font-bold ml-1">Unit Cost (LKR)</label>
                       <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl p-2 text-center font-bold text-white outline-none" placeholder="0" value={newItem.unit_cost} onChange={e => setNewItem({...newItem, unit_cost: e.target.value})} />
                    </div>
                  </div>
                  
                  <button onClick={addPoItem} className="w-full py-2.5 mt-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors">
                    Add to Manifest
                  </button>
                </div>
              </div>

              {/* Right Sidebar - PO Manifest */}
              <div className="col-span-8 p-6 flex flex-col bg-[#0f172a]">
                 <div className="flex justify-between items-end mb-4 shrink-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">PO Manifest</p>
                 </div>
                 
                 <div className="flex-1 bg-black/20 border border-white/5 rounded-2xl overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-900 backdrop-blur text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                        <tr>
                          <th className="px-4 py-3 font-bold">Product</th>
                          <th className="px-4 py-3 font-bold text-center">Qty</th>
                          <th className="px-4 py-3 font-bold text-right">Unit Cost</th>
                          <th className="px-4 py-3 font-bold text-right">Line Total</th>
                          <th className="px-4 py-3"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {form.items.map((i, idx) => (
                          <tr key={idx} className="hover:bg-white/5 transition-colors">
                            <td className="px-4 py-3 font-bold text-sm text-slate-200">{i.item_name}</td>
                            <td className="px-4 py-3 text-center text-sm font-black text-slate-400">{i.quantity}</td>
                            <td className="px-4 py-3 text-right text-sm text-slate-400">LKR {Number(i.unit_cost).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-sm font-black text-white">LKR {(i.quantity * Number(i.unit_cost)).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right">
                              <button onClick={() => removePoItem(idx)} className="p-1 text-rose-500/50 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 rounded transition-colors">
                                <X size={14}/>
                              </button>
                            </td>
                          </tr>
                        ))}
                        {form.items.length === 0 && (
                           <tr><td colSpan={5} className="text-center py-16 text-slate-500 italic text-sm">No items added to manifest yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                 </div>

                 <div className="mt-6 flex justify-between items-center shrink-0 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl">
                    <div>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total Invoice Estimate</p>
                      <p className="text-3xl font-black text-white mt-1">LKR {form.items.reduce((s, i) => s + (i.quantity * Number(i.unit_cost)), 0).toLocaleString()}</p>
                    </div>
                    <button onClick={submitPo} className="px-8 py-4 rounded-xl font-black text-white uppercase tracking-widest text-sm bg-indigo-600 hover:bg-indigo-500 shadow-xl shadow-indigo-900/50 transition-all">
                      Confirm Draft Order
                    </button>
                 </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* VIEW PO MODAL (GRN Processing) */}
      {selectedPo && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div>
                <h3 className="text-xl font-black text-white tracking-tight flex items-center gap-3">
                  <span className="text-indigo-500">{selectedPo.po_number}</span>
                  Purchase Order
                </h3>
                <p className="text-[10px] text-slate-400 mt-1 uppercase font-bold tracking-widest">{selectedPo.supplier_name} • {new Date(selectedPo.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSelectedPo(null)} className="text-slate-400 hover:text-white transition-colors"><X size={24}/></button>
            </div>
            
            <div className="p-0 overflow-y-auto max-h-[60vh]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-black/40 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-4 font-bold">Product Item</th>
                    <th className="px-6 py-4 font-bold text-center">Ordered Qty</th>
                    <th className="px-6 py-4 font-bold text-right">Unit Cost</th>
                    <th className="px-6 py-4 font-bold text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {selectedPo.items.map(i => (
                    <tr key={i.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 font-bold text-sm text-slate-200">{i.item_name}</td>
                      <td className="px-6 py-4 text-center font-black text-slate-400">{i.quantity}</td>
                      <td className="px-6 py-4 text-right text-sm text-slate-400">LKR {i.unit_cost.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right font-black text-white">LKR {(i.quantity * i.unit_cost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-500 italic max-w-[200px] truncate">Note: {selectedPo.note || "No notes attached"}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Grand Total</p>
                <p className="text-3xl font-black text-emerald-400">LKR {selectedPo.total_cost.toLocaleString()}</p>
              </div>
            </div>

            <div className="p-6 border-t border-white/5 bg-black/20 flex justify-end gap-3">
              <button onClick={() => setSelectedPo(null)} className="px-6 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Close</button>
              {selectedPo.status !== "Received" && (
                <button onClick={() => receivePo(selectedPo.id)} className="px-8 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-900/50 transition-all flex items-center gap-2">
                  <PackageCheck size={18}/> Execute GRN (Receive Goods)
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
