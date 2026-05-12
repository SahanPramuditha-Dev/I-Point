import { useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { Badge, KpiCard } from "../components/UI";
import { Barcode, Layers, Printer, Tag, X, Search, CheckCircle2, PackageSearch } from "lucide-react";

export default function Barcodes() {
  const { data, loading } = useFetch("/inventory");
  const [query, setQuery] = useState("");
  const [printList, setPrintList] = useState([]);

  const filtered = useMemo(
    () =>
      (data || []).filter(
        (i) =>
          !query ||
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          (i.barcode || i.sku || "").toLowerCase().includes(query.toLowerCase())
      ),
    [data, query]
  );

  const totalLabels = useMemo(() => printList.reduce((acc, p) => acc + p.count, 0), [printList]);

  const addToPrint = (item) => {
    const existing = printList.find((p) => p.id === item.id);
    if (existing) {
      setPrintList(printList.map((p) => (p.id === item.id ? { ...p, count: p.count + 1 } : p)));
    } else {
      setPrintList([...printList, { ...item, count: 1 }]);
    }
  };

  const remove = (id) => setPrintList(printList.filter((p) => p.id !== id));
  const updateCount = (id, count) => setPrintList(printList.map((p) => (p.id === id ? { ...p, count: Math.max(1, count) } : p)));

  const generatePDF = () => {
    let labelsHtml = "";
    printList.forEach((item) => {
      for (let i = 0; i < item.count; i++) {
        labelsHtml += `
          <div class="label">
            <div class="store">i Store</div>
            <div class="name">${item.name}</div>
            <div class="barcode">${item.barcode || item.sku}</div>
            <div class="price">LKR ${item.sale_price.toLocaleString()}</div>
          </div>
        `;
      }
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Bulk Labels</title>
          <style>
            @page { margin: 10mm; }
            body { font-family: sans-serif; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
            .label { border: 1px solid #eee; padding: 5mm; text-align: center; width: 45mm; height: 25mm; display: flex; flex-direction: column; justify-content: center; }
            .store { font-size: 8px; font-weight: bold; }
            .name { font-size: 10px; margin: 2px 0; overflow: hidden; white-space: nowrap; }
            .barcode { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; margin: 2px 0; }
            .price { font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print()">${labelsHtml}</body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading catalog for labels...</div>;

  const inv = data || [];

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
             <Barcode className="text-sky-400"/> Barcode Generator
          </h1>
          <p className="text-xs text-slate-400 mt-1">Select products and generate printable sticker labels for your store</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 shrink-0">
        <KpiCard tone="sky" title="Inventory Catalog" value={String(inv.length)} icon={<Tag size={18} />} />
        <KpiCard tone="violet" title="Products in Queue" value={String(printList.length)} icon={<Layers size={18} />} />
        <KpiCard tone="green" title="Total Labels to Print" value={String(totalLabels)} icon={<Printer size={18} />} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 pr-2">
         <div className="grid grid-cols-12 gap-6 h-full">
            
            {/* LEFT PANEL: PRODUCT SEARCH */}
            <div className="col-span-12 lg:col-span-7 flex flex-col bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
               <div className="p-5 border-b border-white/5 bg-black/20 shrink-0">
                 <div className="relative">
                   <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-sky-500" />
                   <input 
                     placeholder="Search product name, SKU, or scan barcode..." 
                     className="w-full bg-black/40 border border-sky-500/30 rounded-xl py-3 pl-12 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-all font-medium"
                     value={query} 
                     onChange={(e) => setQuery(e.target.value)} 
                   />
                 </div>
               </div>
               
               <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <table className="w-full text-left border-collapse">
                   <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                     <tr>
                       <th className="px-6 py-4 font-bold">Product</th>
                       <th className="px-6 py-4 font-bold">Identifiers</th>
                       <th className="px-6 py-4 font-bold">Price</th>
                       <th className="px-6 py-4 font-bold text-right">Action</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-white/5">
                     {filtered.map((i) => {
                       const inQueue = printList.find(p => p.id === i.id);
                       return (
                         <tr key={i.id} className="hover:bg-white/[0.02] transition-colors group">
                           <td className="px-6 py-4 font-bold text-sm text-slate-200">
                             {i.name}
                             {inQueue && <span className="ml-2 inline-flex text-[9px] bg-sky-500/20 text-sky-400 px-2 py-0.5 rounded-full uppercase font-black tracking-widest">Added</span>}
                           </td>
                           <td className="px-6 py-4">
                             <span className="font-mono text-xs font-bold text-slate-400">{i.barcode || i.sku}</span>
                           </td>
                           <td className="px-6 py-4 font-black text-sky-300">
                             LKR {Number(i.sale_price).toLocaleString()}
                           </td>
                           <td className="px-6 py-4 text-right">
                             <button onClick={() => addToPrint(i)} className="text-[10px] font-black uppercase tracking-widest bg-white/5 text-slate-300 hover:bg-sky-500 hover:text-white px-4 py-2 rounded-lg transition-all ml-auto">
                               + Select
                             </button>
                           </td>
                         </tr>
                       );
                     })}
                     {filtered.length === 0 && (
                       <tr><td colSpan={4} className="text-center py-20 text-slate-500"><PackageSearch size={32} className="mx-auto mb-3 opacity-30"/><p className="font-bold">No products match your search.</p></td></tr>
                     )}
                   </tbody>
                 </table>
               </div>
            </div>

            {/* RIGHT PANEL: PRINT QUEUE */}
            <div className="col-span-12 lg:col-span-5 flex flex-col bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
               <div className="p-5 border-b border-white/5 bg-white/[0.02] flex justify-between items-center shrink-0">
                  <h2 className="text-xs font-black uppercase tracking-widest text-sky-400 flex items-center gap-2">
                     <Layers size={14}/> Print Manifest
                  </h2>
                  <Badge tone="sky" className="px-3 py-1 font-black">{totalLabels} Labels</Badge>
               </div>

               <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                 {printList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500">
                      <Barcode size={48} className="opacity-20 mb-4"/>
                      <p className="font-bold">Manifest is empty</p>
                      <p className="text-xs mt-1 text-center max-w-[200px]">Select products from the catalog to build your barcode print sheet.</p>
                    </div>
                 ) : (
                    <div className="space-y-3">
                      {printList.map((p) => (
                        <div key={p.id} className="flex flex-col gap-3 bg-black/20 p-4 rounded-2xl border border-white/5 hover:border-white/10 transition-colors">
                          <div className="flex justify-between items-start gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white truncate">{p.name}</p>
                              <p className="text-[10px] font-mono text-slate-500 tracking-widest uppercase mt-0.5">{p.sku}</p>
                            </div>
                            <button onClick={() => remove(p.id)} className="text-rose-500/50 hover:text-rose-400 transition-colors p-1" title="Remove">
                              <X size={16} />
                            </button>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="text-[9px] font-black uppercase tracking-widest text-slate-500">Label Quantity</label>
                            <input
                              type="number"
                              className="w-20 bg-black/40 border border-white/10 rounded-lg p-2 text-center text-sm font-black text-sky-400 outline-none focus:border-sky-500"
                              min={1}
                              value={p.count}
                              onChange={(e) => updateCount(p.id, parseInt(e.target.value, 10) || 1)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                 )}
               </div>

               <div className="p-6 bg-black/40 border-t border-white/5 shrink-0 flex flex-col gap-4">
                  <div className="flex justify-between items-center px-2">
                     <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Total Print Volume</span>
                     <span className="text-xl font-black text-white">{totalLabels} Stickers</span>
                  </div>
                  <button 
                    onClick={generatePDF} 
                    disabled={printList.length === 0}
                    className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-xl transition-all flex items-center justify-center gap-3 ${
                      printList.length === 0 
                        ? 'bg-white/5 text-slate-600 cursor-not-allowed' 
                        : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-900/50'
                    }`}
                  >
                    <Printer size={18}/> Generate Print Sheet
                  </button>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
