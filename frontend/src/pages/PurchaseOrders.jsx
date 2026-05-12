import { useState, useMemo } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, Input, PageTitle, SectionCard, Select, Table } from "../components/UI";
import { ShoppingBag, Truck, PackageCheck, History } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function PurchaseOrders() {
  const { toast, confirm } = useFeedback();
  const { data: pos, setData: setPos, loading } = useFetch('/purchase');
  const { data: suppliers } = useFetch('/settings/suppliers');
  const { data: inventory } = useFetch('/inventory');

  const [isCreating, setIsCreating] = useState(false);
  const [selectedPo, setSelectedPo] = useState(null);
  const [form, setForm] = useState({ supplier_id: "", note: "", items: [] });
  const [newItem, setNewItem] = useState({ item_id: "", quantity: 1, unit_cost: 0 });

  const addPoItem = () => {
    if (!newItem.item_id) return;
    const inv = inventory?.find(i => i.id === Number(newItem.item_id));
    setForm(f => ({
      ...f,
      items: [...f.items, { ...newItem, item_id: Number(newItem.item_id), item_name: inv?.name }]
    }));
    setNewItem({ item_id: "", quantity: 1, unit_cost: 0 });
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
    } catch (err) {
      toast("Failed to create PO", "error");
    }
  };

  const viewPo = async (poId) => {
    const { data: details } = await api.get(`/purchase/${poId}`);
    setSelectedPo(details);
  };

  const receivePo = async (poId) => {
    const ok = await confirm("Receive Purchase Order", "This will update inventory stock. Continue?");
    if (!ok) return;
    try {
      await api.post(`/purchase/${poId}/receive`);
      toast("PO received and stock updated", "success");
      const { data: updatedPos } = await api.get('/purchase');
      setPos(updatedPos);
      setSelectedPo(null);
    } catch (err) {
      toast("Failed to receive PO", "error");
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Loading orders...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <PageTitle title="Purchase Orders / GRN" subtitle="Manage supplier orders and stock intake" />
        <Button onClick={() => setIsCreating(true)}>Create New Order</Button>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Order History" className="col-span-12">
          <Table className="table-base">
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Supplier</th>
                <th>Date</th>
                <th>Total Cost</th>
                <th>Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(pos || []).map(p => (
                <tr key={p.id}>
                  <td className="font-bold text-sky-400">{p.po_number}</td>
                  <td>{p.supplier_name || "Supplier #" + p.supplier_id}</td>
                  <td className="text-slate-400 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="font-semibold text-emerald-400">LKR {p.total_cost.toLocaleString()}</td>
                  <td>
                    <Badge tone={p.status === "Received" ? "green" : p.status === "Draft" ? "slate" : "amber"}>
                      {p.status}
                    </Badge>
                  </td>
                  <td className="text-right">
                    <Button variant="ghost" className="btn-sm" onClick={() => viewPo(p.id)}>View Details</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {(pos || []).length === 0 && <p className="text-center py-12 text-slate-500 italic">No purchase orders found.</p>}
        </SectionCard>
      </div>

      {/* Create PO Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1020] border border-white/10 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <h3 className="font-bold">Create Purchase Order</h3>
              <button onClick={() => setIsCreating(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6 overflow-auto grid grid-cols-12 gap-6">
              <div className="col-span-4 space-y-4">
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 uppercase">Supplier</p>
                  <Select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})}>
                    <option value="">Select Supplier</option>
                    {(suppliers || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </div>
                <div>
                  <p className="text-[10px] text-slate-400 mb-1 uppercase">Order Note</p>
                  <Input value={form.note} onChange={e => setForm({...form, note: e.target.value})} placeholder="Internal notes..." />
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 space-y-3">
                  <p className="text-xs font-bold text-sky-300">Add Item</p>
                  <Select value={newItem.item_id} onChange={e => setNewItem({...newItem, item_id: e.target.value})}>
                    <option value="">Choose Product</option>
                    {(inventory || []).map(i => <option key={i.id} value={i.id}>{i.name} (Qty: {i.quantity})</option>)}
                  </Select>
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder="Qty" value={newItem.quantity} onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})} />
                    <Input type="number" placeholder="Cost/Unit" value={newItem.unit_cost} onChange={e => setNewItem({...newItem, unit_cost: Number(e.target.value)})} />
                  </div>
                  <Button variant="secondary" className="w-full" onClick={addPoItem}>Add to Order</Button>
                </div>
              </div>
              <div className="col-span-8 flex flex-col">
                <p className="text-[10px] text-slate-400 mb-2 uppercase">Items in Order</p>
                <div className="flex-1 border border-white/5 rounded-xl bg-white/2 overflow-auto min-h-[300px]">
                  <Table className="table-base">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th className="text-center">Qty</th>
                        <th className="text-right">Unit Cost</th>
                        <th className="text-right">Total</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((i, idx) => (
                        <tr key={idx}>
                          <td className="text-sm">{i.item_name}</td>
                          <td className="text-center">{i.quantity}</td>
                          <td className="text-right">LKR {i.unit_cost.toLocaleString()}</td>
                          <td className="text-right font-bold">LKR {(i.quantity * i.unit_cost).toLocaleString()}</td>
                          <td className="text-right">
                            <button onClick={() => removePoItem(idx)} className="text-rose-400 px-2">✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
                <div className="mt-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-400 uppercase">Estimated Total</p>
                    <p className="text-2xl font-bold text-sky-400">LKR {form.items.reduce((s, i) => s + (i.quantity * i.unit_cost), 0).toLocaleString()}</p>
                  </div>
                  <Button size="lg" className="px-10 h-12" onClick={submitPo}>Create Order</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View PO Details Modal */}
      {selectedPo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b1020] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
              <div>
                <h3 className="font-bold">{selectedPo.po_number} Details</h3>
                <p className="text-[10px] text-slate-400">{selectedPo.supplier_name} • {new Date(selectedPo.created_at).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setSelectedPo(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="p-6">
              <Table className="table-base">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="text-center">Qty</th>
                    <th className="text-right">Cost</th>
                    <th className="text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPo.items.map(i => (
                    <tr key={i.id}>
                      <td>{i.item_name}</td>
                      <td className="text-center">{i.quantity}</td>
                      <td className="text-right">{i.unit_cost.toLocaleString()}</td>
                      <td className="text-right font-semibold">{(i.quantity * i.unit_cost).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              <div className="mt-6 flex justify-between items-end">
                <div className="text-xs text-slate-400 italic">
                  Note: {selectedPo.note || "No notes"}
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs">Grand Total</p>
                  <p className="text-3xl font-bold text-emerald-400">LKR {selectedPo.total_cost.toLocaleString()}</p>
                </div>
              </div>
            </div>
            <div className="p-4 bg-white/5 border-t border-white/10 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSelectedPo(null)}>Close</Button>
              {selectedPo.status !== "Received" && (
                <Button onClick={() => receivePo(selectedPo.id)}>Receive Items (Update Stock)</Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
