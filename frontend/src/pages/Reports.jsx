import { useEffect, useState } from "react";
import api from "../lib/api";
import { Badge, KpiCard } from "../components/UI";
import { BadgeDollarSign, Boxes, Download, PieChart, TrendingUp, Wrench, Search, LineChart, Receipt, BarChart, ShoppingCart, Tag, Filter } from "lucide-react";

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeTab, setActiveTab] = useState("overview"); // overview, sales, repairs, inventory
  
  const [summaryData, setSummaryData] = useState(null);
  const [salesData, setSalesData] = useState(null);
  const [repairsData, setRepairsData] = useState(null);
  const [inventoryData, setInventoryData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    const qStr = query.toString() ? `?${query.toString()}` : "";
    
    try {
       const [sumRes, salesRes, repRes, invRes] = await Promise.all([
          api.get(`/reports/summary${qStr}`),
          api.get(`/reports/sales${qStr}`),
          api.get(`/reports/repairs${qStr}`),
          api.get(`/reports/inventory`)
       ]);
       
       setSummaryData(sumRes.data);
       setSalesData(salesRes.data);
       setRepairsData(repRes.data);
       setInventoryData(invRes.data);
    } catch(e) {
       console.error("Failed to load reports", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const exportCSV = () => {
    const query = new URLSearchParams();
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    
    let endpoint = '/reports/export-sales';
    if (activeTab === 'repairs') endpoint = '/reports/export-repairs';
    if (activeTab === 'inventory') endpoint = '/reports/export-inventory';
    
    window.open(`${api.defaults.baseURL}${endpoint}?${query.toString()}`, "_blank");
  };

  const revenue = Number(summaryData?.summary?.total_revenue ?? 0);
  const cogs = Number(summaryData?.summary?.sales_revenue ?? 0) - Number(summaryData?.summary?.gross_profit ?? 0); // approx
  const profit = Number(summaryData?.summary?.gross_profit ?? 0);
  const invVal = Number(summaryData?.inventory?.total_value ?? 0);
  const marginPct = revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0";

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
             <BarChart className="text-sky-400"/> Reports & Analytics
          </h1>
          <p className="text-xs text-slate-400 mt-1">Comprehensive business intelligence and exportable ledgers</p>
        </div>
        <div className="flex items-center gap-3 bg-black/40 p-2 rounded-xl border border-white/5 shadow-inner">
           <div className="flex items-center gap-2 px-3">
             <Filter size={12} className="text-slate-500" />
             <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="bg-transparent text-xs font-bold text-slate-300 outline-none border-none p-1 cursor-pointer [color-scheme:dark]" />
             <span className="text-slate-500 font-bold px-1 text-[10px]">TO</span>
             <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="bg-transparent text-xs font-bold text-slate-300 outline-none border-none p-1 cursor-pointer [color-scheme:dark]" />
           </div>
           <button onClick={load} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center gap-2 shadow-lg shadow-indigo-900/20">
             <Search size={14}/> Apply Range
           </button>
           <div className="w-[1px] h-6 bg-white/10 mx-1"></div>
           <button onClick={exportCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-colors border border-emerald-500/20 shadow-lg shadow-emerald-900/20">
             <Download size={14} /> 
             {activeTab === 'inventory' ? 'Export CSV' : 'Export Range CSV'}
           </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 font-medium">Generating Analytics...</div>
      ) : (
        <>
          {/* TABS */}
          <div className="flex gap-2 shrink-0 bg-slate-900/60 p-1.5 rounded-2xl border border-white/5 w-fit">
            <button onClick={()=>setActiveTab("overview")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab==='overview'?'bg-indigo-500 text-white shadow-lg':'text-slate-400 hover:text-white'}`}>Overview</button>
            <button onClick={()=>setActiveTab("sales")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab==='sales'?'bg-sky-500 text-white shadow-lg':'text-slate-400 hover:text-white'}`}>Sales Ledger</button>
            <button onClick={()=>setActiveTab("repairs")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab==='repairs'?'bg-amber-500 text-white shadow-lg':'text-slate-400 hover:text-white'}`}>Repair History</button>
            <button onClick={()=>setActiveTab("inventory")} className={`px-5 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab==='inventory'?'bg-emerald-500 text-white shadow-lg':'text-slate-400 hover:text-white'}`}>Inventory Value</button>
          </div>

          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
             
             {/* OVERVIEW TAB */}
             {activeTab === 'overview' && (
               <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                 {/* KPI STRIP */}
                 <div className="grid grid-cols-4 gap-4">
                   <KpiCard tone="sky" title="Sales Revenue" value={`LKR ${revenue.toLocaleString()}`} icon={<BadgeDollarSign size={18} />} />
                   <KpiCard tone="violet" title="Cost of Goods (COGS)" value={`LKR ${cogs.toLocaleString()}`} icon={<Boxes size={18} />} />
                   <KpiCard tone="green" title="Gross Profit" value={`LKR ${profit.toLocaleString()}`} hint={`${marginPct}% profit margin`} icon={<TrendingUp size={18} />} />
                   <KpiCard tone="amber" title="Inventory Value" value={`LKR ${invVal.toLocaleString()}`} icon={<PieChart size={18} />} />
                 </div>

                 <div className="grid grid-cols-12 gap-6">
                   <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
                     <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col">
                        <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-6">
                           <LineChart size={16} className="text-emerald-400"/> Operational Velocity
                        </h2>
                        <div className="space-y-4">
                           <div className="flex justify-between items-center p-4 rounded-2xl border border-white/5 bg-black/20">
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Invoice Volume</p>
                                <p className="text-2xl font-black text-white mt-1">{summaryData?.audit?.sales_count ?? 0}</p>
                              </div>
                              <div className="w-12 h-12 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20"><Receipt size={20}/></div>
                           </div>
                           <div className="flex justify-between items-center p-4 rounded-2xl border border-white/5 bg-black/20">
                              <div>
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Repair Ticketing Volume</p>
                                <p className="text-2xl font-black text-white mt-1">{summaryData?.inventory?.total_repairs ?? 0}</p>
                              </div>
                              <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20"><Wrench size={20}/></div>
                           </div>
                        </div>
                     </div>
                   </div>

                   <div className="col-span-12 lg:col-span-8 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                     <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center">
                       <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2"><Receipt size={14}/> Recent Transactions</h3>
                     </div>
                     <div className="flex-1 overflow-y-auto custom-scrollbar">
                       <table className="table">
                         <thead>
                           <tr>
                             <th>Invoice Ref</th>
                             <th>Tender Type</th>
                             <th>Date & Time</th>
                             <th className="text-right">Invoice Value</th>
                           </tr>
                         </thead>
                         <tbody>
                           {(summaryData?.recent_sales || []).map((s) => (
                             <tr key={s.id}>
                               <td className="font-black text-indigo-400">{s.invoice_no}</td>
                               <td><Badge tone={s.payment_method === 'Cash' ? 'green' : 'sky'}>{s.payment_method}</Badge></td>
                               <td className="text-xs font-medium text-slate-400">{new Date(s.created_at).toLocaleString()}</td>
                               <td className="text-right font-black text-white">LKR {Number(s.total).toLocaleString()}</td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </div>
                 </div>
               </div>
             )}

             {/* SALES TAB */}
             {activeTab === 'sales' && (
               <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                 <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
                   <h3 className="text-xs font-black uppercase tracking-widest text-sky-400 flex items-center gap-2"><ShoppingCart size={14}/> Detailed Sales Ledger</h3>
                   <Badge tone="sky">{(salesData || []).length} Records</Badge>
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <table className="table">
                     <thead>
                       <tr>
                         <th>Invoice Ref</th>
                         <th>Date</th>
                         <th>Customer ID</th>
                         <th>Method</th>
                         <th className="text-center">Status</th>
                         <th className="text-right">Total</th>
                       </tr>
                     </thead>
                     <tbody>
                       {(salesData || []).map(s => (
                         <tr key={s.id} className={s.is_voided ? 'opacity-50' : ''}>
                           <td className="font-black text-sky-400">{s.invoice_no}</td>
                           <td className="text-xs font-medium text-slate-400">{new Date(s.created_at).toLocaleString()}</td>
                           <td className="text-slate-300 font-bold">{s.customer_id ? `CUST-${s.customer_id}` : 'Walk-in'}</td>
                           <td><Badge tone="slate">{s.payment_method}</Badge></td>
                           <td className="text-center">
                             {s.is_voided ? <Badge tone="amber">Voided</Badge> : s.is_return ? <Badge tone="red">Refund</Badge> : <Badge tone="green">Cleared</Badge>}
                           </td>
                           <td className="text-right font-black text-white">LKR {s.total.toLocaleString()}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             )}

             {/* REPAIRS TAB */}
             {activeTab === 'repairs' && (
               <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                 <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
                   <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2"><Wrench size={14}/> Repair Job History</h3>
                   <Badge tone="amber">{(repairsData || []).length} Tickets</Badge>
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <table className="table">
                     <thead>
                       <tr>
                         <th>Ticket ID</th>
                         <th>Device</th>
                         <th>Intake Date</th>
                         <th>Delivery Date</th>
                         <th className="text-center">Status</th>
                         <th className="text-right">Cost</th>
                       </tr>
                     </thead>
                     <tbody>
                       {(repairsData || []).map(r => (
                         <tr key={r.id}>
                           <td className="font-black text-amber-400">#{r.ticket_no}</td>
                           <td>
                              <div className="font-bold text-slate-200">{r.device}</div>
                              <div className="text-[10px] text-slate-500 truncate max-w-[200px]">{r.issue}</div>
                           </td>
                           <td className="text-xs font-medium text-slate-400">{new Date(r.created_at).toLocaleDateString()}</td>
                           <td className="text-xs font-medium text-slate-400">{r.delivered_at ? new Date(r.delivered_at).toLocaleDateString() : '—'}</td>
                           <td className="text-center">
                             <Badge tone={r.status === 'Delivered' ? 'green' : r.status === 'Cancelled' ? 'red' : 'amber'}>{r.status}</Badge>
                           </td>
                           <td className="text-right">
                             <div className="font-black text-white">LKR {r.estimated_cost.toLocaleString()}</div>
                             {r.advance_payment > 0 && <div className="text-[10px] text-emerald-400 font-bold">Paid: {r.advance_payment}</div>}
                           </td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             )}

             {/* INVENTORY TAB */}
             {activeTab === 'inventory' && (
               <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl flex flex-col overflow-hidden shadow-2xl">
                 <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
                   <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2"><Tag size={14}/> Inventory Valuation</h3>
                   <Badge tone="emerald">{(inventoryData || []).length} SKUs</Badge>
                 </div>
                 <div className="flex-1 overflow-y-auto custom-scrollbar">
                   <table className="table">
                     <thead>
                       <tr>
                         <th>Product Name</th>
                         <th className="text-center">Stock Qty</th>
                         <th className="text-right">Unit Cost</th>
                         <th className="text-right">Retail Price</th>
                         <th className="text-right">Asset Value (COGS)</th>
                         <th className="text-right">Potential Revenue</th>
                       </tr>
                     </thead>
                     <tbody>
                       {(inventoryData || []).map(i => (
                         <tr key={i.id}>
                           <td className="font-bold text-slate-200">{i.name}</td>
                           <td className="text-center font-black text-slate-400">{i.quantity}</td>
                           <td className="text-right text-xs font-medium text-slate-400">LKR {i.cost_price.toLocaleString()}</td>
                           <td className="text-right text-xs font-medium text-sky-300">LKR {i.sale_price.toLocaleString()}</td>
                           <td className="text-right font-black text-amber-400">LKR {i.total_value.toLocaleString()}</td>
                           <td className="text-right font-black text-emerald-400">LKR {i.potential_revenue.toLocaleString()}</td>
                         </tr>
                       ))}
                     </tbody>
                   </table>
                 </div>
               </div>
             )}

          </div>
        </>
      )}
    </div>
  );
}
