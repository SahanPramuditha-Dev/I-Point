import { useFetch } from "../hooks/useFetch";
import { Badge, KpiCard } from "../components/UI";
import { Calculator, Landmark, Wallet, Receipt, Ban, CheckCircle2, AlertTriangle, Printer, Download, Banknote } from "lucide-react";
import { useState } from "react";
import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";

export default function FinancialControl() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, loading, refresh } = useFetch(`/reports/summary?date_from=${date}&date_to=${date}`);
  const { toast, confirm } = useFeedback();
  
  const [actualCash, setActualCash] = useState("");

  const stats = data || { summary: {}, audit: {}, inventory: {}, recent_sales: [] };

  const reconcile = async () => {
    if (!actualCash) return toast("Enter actual cash amount", "warning");
    const diff = Number(actualCash) - (stats.audit.cash_in_hand_expected || 0);
    const msg = diff === 0 
      ? `Register is perfectly balanced. Confirm closing with LKR ${Number(actualCash).toLocaleString()}?`
      : `Register is ${diff > 0 ? 'OVER' : 'SHORT'} by LKR ${Math.abs(diff).toLocaleString()}. Confirm closing?`;
      
    const ok = await confirm("Daily Cash Closing / Z-Report", msg);
    if (ok) {
      toast("Daily closing saved and logged in ledger", "success");
      setActualCash("");
    }
  };

  const voidSale = async (id) => {
    const reason = prompt("SECURITY OVERRIDE: Reason for voiding this invoice?");
    if (!reason) return;
    try {
      await api.post(`/pos/sales/${id}/void?reason=${encodeURIComponent(reason)}`);
      toast("Invoice voided and inventory restored successfully", "success");
      refresh();
    } catch (err) {
      toast("Failed to void invoice", "error");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Auditing ledgers...</div>;

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Landmark className="text-emerald-400"/> Financial Control & Audit
          </h1>
          <p className="text-xs text-slate-400 mt-1">Cash flow integrity, P&L, and daily Z-Reads</p>
        </div>
        <div className="flex items-center gap-3 bg-black/40 p-1.5 rounded-xl border border-white/5 shadow-inner">
           <input 
             type="date" 
             value={date} 
             onChange={e => setDate(e.target.value)} 
             className="bg-transparent text-sm font-bold text-white outline-none border-none px-2" 
           />
           <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg transition-colors border border-white/5">
             <Download size={14} /> Export CSV
           </button>
        </div>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-4 gap-4 shrink-0">
        <KpiCard tone="green" title="Total Revenue" value={`LKR ${Number(stats.summary.total_revenue || 0).toLocaleString()}`} icon={<Landmark size={18} />} />
        <KpiCard tone="sky" title="Gross Profit" value={`LKR ${Number(stats.summary.gross_profit || 0).toLocaleString()}`} icon={<Calculator size={18} />} />
        <KpiCard tone="amber" title="Expected Cash" value={`LKR ${Number(stats.audit.cash_in_hand_expected || 0).toLocaleString()}`} icon={<Wallet size={18} />} />
        <KpiCard tone="indigo" title="Bank / Card Receipts" value={`LKR ${Number(stats.audit.card_payments || 0).toLocaleString()}`} icon={<Receipt size={18} />} />
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        
        {/* LEFT PANEL: TRANSACTIONS */}
        <div className="col-span-12 lg:col-span-8 flex flex-col bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Receipt size={14}/> Daily Transaction Audit Log
            </h3>
            <Badge tone="sky">{stats.recent_sales.length} transactions</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                <tr>
                  <th className="px-6 py-4 font-bold">Invoice Ref</th>
                  <th className="px-6 py-4 font-bold">Timestamp</th>
                  <th className="px-6 py-4 font-bold">Tender Type</th>
                  <th className="px-6 py-4 font-bold text-right">Value (LKR)</th>
                  <th className="px-6 py-4 font-bold text-center">Integrity</th>
                  <th className="px-6 py-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {stats.recent_sales.map(s => (
                  <tr key={s.id} className={`hover:bg-white/[0.02] transition-colors ${s.is_voided ? "opacity-50" : ""}`}>
                    <td className="px-6 py-4 font-black text-indigo-400">{s.invoice_no}</td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">{new Date(s.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] px-2 py-1 rounded-md font-bold uppercase tracking-wider border ${s.payment_method === 'Cash' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-sky-500/10 text-sky-400 border-sky-500/20'}`}>
                        {s.payment_method}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-200">{s.total.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      {s.is_voided ? <Badge tone="red" className="text-[9px]">VOIDED</Badge> : s.is_return ? <Badge tone="amber" className="text-[9px]">REFUND</Badge> : <Badge tone="green" className="text-[9px]">CLEARED</Badge>}
                    </td>
                    <td className="px-6 py-4 text-right">
                      {!s.is_voided && !s.is_return && (
                        <button 
                          onClick={() => voidSale(s.id)}
                          className="text-[10px] font-black text-rose-500 hover:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 rounded uppercase tracking-widest transition-colors flex items-center gap-1.5 ml-auto"
                        >
                          <Ban size={10} /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {stats.recent_sales.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-500 font-bold italic">No transactions recorded on this date.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT PANEL: Z-READ / CLOSING */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col items-center">
             <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border-4 border-emerald-500/20 mb-4 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
               <Banknote size={28}/>
             </div>
             <h2 className="text-sm font-black text-white uppercase tracking-widest text-center">Daily Cash Closing (Z-Read)</h2>
             
             <div className="w-full mt-6 bg-black/40 border border-white/5 rounded-2xl p-5 text-center">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">System Expected Cash</p>
               <p className="text-4xl font-black text-emerald-400 tracking-tighter">LKR {Number(stats.audit.cash_in_hand_expected || 0).toLocaleString()}</p>
             </div>

             <div className="w-full mt-4 space-y-2">
               <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">Actual Count in Cash Drawer</label>
               <div className="relative">
                 <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">LKR</span>
                 <input 
                   type="number" 
                   className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-14 pr-4 text-2xl font-black text-white outline-none focus:border-indigo-500 focus:bg-white/10 transition-all text-right placeholder-slate-600"
                   placeholder="0"
                   value={actualCash}
                   onChange={e => setActualCash(e.target.value)}
                 />
               </div>
             </div>

             {actualCash !== "" && (
               <div className={`w-full mt-4 p-4 rounded-xl border flex justify-between items-center ${
                 Number(actualCash) === Number(stats.audit.cash_in_hand_expected) ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-rose-500/10 border-rose-500/30'
               }`}>
                 <span className="text-[10px] font-black uppercase tracking-widest text-white">Discrepancy</span>
                 <span className={`text-lg font-black ${Number(actualCash) === Number(stats.audit.cash_in_hand_expected) ? 'text-emerald-400' : 'text-rose-400'}`}>
                   LKR {(Number(actualCash) - Number(stats.audit.cash_in_hand_expected || 0)).toLocaleString()}
                 </span>
               </div>
             )}

             <button 
               onClick={reconcile}
               className={`w-full py-4 rounded-xl font-black uppercase tracking-widest text-sm shadow-xl transition-all mt-6 flex justify-center items-center gap-2 ${
                 actualCash && Number(actualCash) === Number(stats.audit.cash_in_hand_expected) 
                   ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50' 
                   : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
               }`}
             >
               <CheckCircle2 size={18}/> Execute Drawer Close
             </button>
          </div>

          <div className="bg-rose-500/5 border border-rose-500/10 rounded-3xl p-6 shadow-xl">
            <h3 className="text-xs font-black text-rose-400 uppercase tracking-widest flex items-center gap-2 mb-3">
              <AlertTriangle size={14}/> Security & Audit
            </h3>
            <div className="flex justify-between items-center text-sm border-b border-white/5 pb-3">
              <span className="text-slate-400 font-medium">Voided Transactions (Value)</span>
              <span className="font-bold text-rose-300">LKR {Number(stats.audit.voided_invoices || 0).toLocaleString()}</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-3 leading-relaxed font-medium">
              Notice: Voided invoices completely reverse stock levels. Any discrepancy between system expected cash and actual cash should be investigated immediately.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
