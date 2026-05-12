import { useMemo, useState } from "react";
import api from "../lib/api";
import { useFetch } from "../hooks/useFetch";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Select, Table } from "../components/UI";
import { AlertTriangle, Boxes, Package, Truck } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function Inventory() {
  const { toast, confirm } = useFeedback();
  const { data, loading, error, setData } = useFetch('/inventory');
  const suppliersFetch = useFetch('/inventory/suppliers');
  const suppliers = suppliersFetch.data || [];
  const [form, setForm] = useState({ name:'', category:'Phones', sku:'', quantity:1, cost_price:0, sale_price:0, barcode:'', supplier_id:'', has_serials: false });
  const [supplierForm, setSupplierForm] = useState({ name: '', contact: '' });
  const [barcodeQuery, setBarcodeQuery] = useState("");

  const add = async () => {
    const payload = { ...form, supplier_id: form.supplier_id ? Number(form.supplier_id) : null };
    const r = await api.post('/inventory', payload);
    setData([...(data||[]), r.data]);
  };

  const addSupplier = async () => {
    const r = await api.post('/inventory/suppliers', supplierForm);
    suppliersFetch.setData([...(suppliersFetch.data || []), r.data]);
    setSupplierForm({ name: '', contact: '' });
  };

  const filtered = useMemo(() => (data || []).filter((i) =>
    !barcodeQuery || (i.barcode || "").toLowerCase().includes(barcodeQuery.toLowerCase()) || i.sku.toLowerCase().includes(barcodeQuery.toLowerCase()) || i.name.toLowerCase().includes(barcodeQuery.toLowerCase())
  ), [data, barcodeQuery]);

  const invStats = useMemo(() => {
    const rows = data || [];
    const low = rows.filter((i) => Number(i.quantity) <= 3).length;
    const totalQty = rows.reduce((s, i) => s + Number(i.quantity || 0), 0);
    return { count: rows.length, low, totalQty, suppliers: suppliers.length };
  }, [data, suppliers.length]);

  const printLabel = (i) => {
    const labelHtml = `<html><head><title>Label - ${i.name}</title><style>@page { size: 50mm 30mm; margin: 0; } body { font-family: 'Segoe UI', sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 30mm; width: 50mm; text-align: center; color: #000; } .store { font-size: 8px; font-weight: bold; margin-bottom: 2px; } .name { font-size: 10px; margin-bottom: 4px; overflow: hidden; white-space: nowrap; width: 90%; } .barcode { font-family: 'Libre Barcode 39', 'Courier New', monospace; font-size: 24px; margin: 2px 0; } .price { font-size: 12px; font-weight: bold; }</style></head><body><div class="store">i Store</div><div class="name">${i.name}</div><div class="barcode">${i.barcode || i.sku}</div><div class="price">LKR ${i.sale_price.toLocaleString()}</div><script>window.print();</script></body></html>`;
    const w = window.open("", "_blank", "width=300,height=200");
    if (w) { w.document.write(labelHtml); w.document.close(); }
  };

  const adjustStock = async (item) => {
    const qty = prompt(`Enter quantity change for ${item.name} (e.g. 5 to add, -5 to subtract):`);
    if (!qty) return;
    const note = prompt(`Reason for adjustment (e.g. Damage, Transfer to Branch B, Stock count):`);
    if (!note) return;
    try {
      await api.post('/inventory/adjust', { item_id: item.id, quantity_change: Number(qty), note });
      toast("Stock adjusted successfully", "success");
      const r = await api.get('/inventory');
      setData(r.data);
    } catch (e) {
      toast("Adjustment failed", "error");
    }
  };

  const manageSerials = async (item) => {
    const sn = prompt(`Enter serial number for ${item.name}:`);
    if (!sn) return;
    try {
      await api.post(`/inventory/${item.id}/serials?serial_number=${encodeURIComponent(sn)}`);
      toast("Serial number added and stock incremented", "success");
      const r = await api.get('/inventory');
      setData(r.data);
    } catch (e) {
      toast(e.response?.data?.detail || "Failed to add serial", "error");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading Inventory...</div>;
  if (error) return <div className="p-4 bg-red-500/10 text-red-400 rounded border border-red-500/20">{error}</div>;

  return <div className="space-y-4 pb-12">
    <PageTitle title="Inventory Management" subtitle="Phones, accessories, spare parts and stock tracking" />
    <div className="grid grid-cols-12 gap-3">
      <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="sky" title="SKUs" value={String(invStats.count)} hint="Products in catalog" icon={<Package size={18} />} />
      <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="amber" title="Low stock" value={String(invStats.low)} hint="Qty ≤ 3" icon={<AlertTriangle size={18} />} />
      <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="green" title="Units on hand" value={String(invStats.totalQty)} hint="Sum of quantities" icon={<Boxes size={18} />} />
      <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="violet" title="Suppliers" value={String(invStats.suppliers)} hint="Active supplier records" icon={<Truck size={18} />} />
    </div>
    <div className="grid grid-cols-3 gap-4">
      <SectionCard title="Add Inventory Item" className="col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[10px] text-slate-400 mb-1">Product Name</p><Input placeholder="iPhone 13 Screen, etc." value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Category</p><Select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}><option>Phones</option><option>Accessories</option><option>Spare Parts</option><option>Tools</option></Select></div>
          <div><p className="text-[10px] text-slate-400 mb-1">SKU (Unique ID)</p><Input placeholder="PH-123" value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Barcode</p><Input placeholder="Scan or type barcode" value={form.barcode} onChange={e=>setForm({...form,barcode:e.target.value})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Quantity</p><Input type="number" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Supplier</p><Select value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}><option value="">No Supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Cost Price (LKR)</p><Input type="number" value={form.cost_price} onChange={e=>setForm({...form,cost_price:Number(e.target.value)})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Sale Price (LKR)</p><Input type="number" value={form.sale_price} onChange={e=>setForm({...form,sale_price:Number(e.target.value)})}/></div>
          <div className="flex items-center gap-2 py-2">
            <input type="checkbox" checked={form.has_serials} onChange={e=>setForm({...form,has_serials:e.target.checked})}/>
            <span className="text-xs text-slate-200">Track Serial Numbers</span>
          </div>
        </div>
        <Button className="mt-4 w-full h-11" onClick={add}>Add to Stock</Button>
      </SectionCard>

      <SectionCard title="Supplier Management">
        <div className="space-y-3">
          <div><p className="text-[10px] text-slate-400 mb-1">Supplier Name</p><Input value={supplierForm.name} onChange={e=>setSupplierForm({...supplierForm,name:e.target.value})}/></div>
          <div><p className="text-[10px] text-slate-400 mb-1">Contact / Phone</p><Input value={supplierForm.contact} onChange={e=>setSupplierForm({...supplierForm,contact:e.target.value})}/></div>
          <Button variant="secondary" className="w-full" onClick={addSupplier}>Save Supplier</Button>
        </div>
      </SectionCard>
    </div>

    <SectionCard title="Stock Search & List">
      <div className="flex gap-2 mb-4">
        <Input placeholder="Scan/Search barcode, SKU, or product name..." className="max-w-md" value={barcodeQuery} onChange={(e) => setBarcodeQuery(e.target.value)} />
        <div className="text-xs text-slate-400 flex items-center">
          Showing <span className="text-slate-200 font-semibold mx-1">{filtered.length}</span> items
        </div>
      </div>
      <div className="overflow-x-auto">
        <Table className="table-base">
          <thead>
            <tr>
              <th>Product</th>
              <th>Category</th>
              <th>SKU / Barcode</th>
              <th className="text-center">Stock</th>
              <th>Price</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(i=>(
              <tr key={i.id}>
                <td className="font-medium">{i.name}</td>
                <td>
                  <Badge tone="sky">{i.category}</Badge>
                </td>
                <td className="text-slate-500 dark:text-slate-300">
                  <div className="font-mono text-xs text-slate-500 dark:text-slate-300">{i.sku}</div>
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">{i.barcode || "-"}</div>
                </td>
                <td className="text-center">
                  <Badge tone={i.quantity <= 3 ? "red" : "green"}>{i.quantity}</Badge>
                </td>
                <td>
                  <div className="font-extrabold text-indigo-500 dark:text-sky-200">LKR {i.sale_price.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-500">Cost: {Number(i.cost_price || 0).toLocaleString()}</div>
                </td>
                <td className="text-right">
                  <div className="flex justify-end gap-2 flex-wrap">
                    <Button variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => adjustStock(i)}>Adjust</Button>
                    {i.has_serials && (
                      <Button variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => manageSerials(i)}>Serials</Button>
                    )}
                    <Button variant="secondary" size="sm" className="px-2 py-1 text-xs" onClick={() => printLabel(i)}>Print</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </SectionCard>
  </div>;
}
