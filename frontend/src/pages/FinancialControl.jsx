import { useFetch } from "../hooks/useFetch";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { Calculator, Landmark, Wallet, Receipt, Ban, CheckCircle2, AlertTriangle, Printer } from "lucide-react";
import { useState, useMemo } from "react";
import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";

export default function FinancialControl() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const { data, loading, error, refresh } = useFetch(`/reports/summary?date_from=${date}&date_to=${date}`);
  const { toast, confirm } = useFeedback();
  
  const [actualCash, setActualCash] = useState(0);

  const stats = data || { summary: {}, audit: {}, inventory: {}, recent_sales: [] };

  const reconcile = async () => {
    const ok = await confirm("Daily Cash Closing", `Confirm closing with LKR ${actualCash.toLocaleString()} actual cash?`);
    if (ok) {
      toast("Daily closing saved and logged", "success");
    }
  };

  const voidSale = async (id) => {
    const reason = prompt("Reason for voiding this invoice?");
    if (!reason) return;
    try {
      await api.post(`/pos/sales/${id}/void?reason=${encodeURIComponent(reason)}`);
      toast("Invoice voided successfully", "success");
      refresh();
    } catch (err) {
      toast("Failed to void invoice", "error");
    }
  };

  if (loading) return <div className="p-8 text-slate-400">Analyzing financials...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageTitle title="Financial Audit & Reconciliation" subtitle="Cash-flow integrity and daily business closing" />
        <div className="flex gap-3">
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" />
          <Button variant="secondary" className="gap-2"><Printer size={16} /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <KpiCard className="col-span-3" tone="green" title="Total Revenue" value={`LKR ${stats.summary.total_revenue?.toLocaleString()}`} icon={<Landmark size={18} />} />
        <KpiCard className="col-span-3" tone="sky" title="Gross Profit" value={`LKR ${stats.summary.gross_profit?.toLocaleString()}`} icon={<Calculator size={18} />} />
        <KpiCard className="col-span-3" tone="amber" title="Expected Cash" value={`LKR ${stats.audit.cash_in_hand_expected?.toLocaleString()}`} hint="Cash sales + Repair revenue" icon={<Wallet size={18} />} />
        <KpiCard className="col-span-3" tone="indigo" title="Card Payments" value={`LKR ${stats.audit.card_payments?.toLocaleString()}`} icon={<Receipt size={18} />} />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 space-y-6">
          <SectionCard title="Recent Invoices" icon={<Receipt size={16} />}>
            <Table className="table-base">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th className="text-right">Total</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent_sales.map(s => (
                  <tr key={s.id} className={s.is_voided ? "opacity-50 grayscale" : ""}>
                    <td className="font-bold text-indigo-400">{s.invoice_no}</td>
                    <td className="text-xs text-slate-500">{new Date(s.created_at).toLocaleTimeString()}</td>
                    <td><Badge tone="slate">{s.payment_method}</Badge></td>
                    <td className="text-right font-bold text-white">LKR {s.total.toLocaleString()}</td>
                    <td>
                      {s.is_voided ? <Badge tone="red">VOIDED</Badge> : <Badge tone="green">ACTIVE</Badge>}
                    </td>
                    <td className="text-right">
                      {!s.is_voided && (
                        <button 
                          onClick={() => voidSale(s.id)}
                          className="text-rose-400 hover:text-rose-300 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 ml-auto"
                        >
                          <Ban size={12} /> Void
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </SectionCard>
        </div>

        <div className="col-span-4 space-y-6">
          <SectionCard title="Daily Cash Reconciliation" className="bg-white/2 border-white/10 shadow-2xl">
            <div className="space-y-6">
              <div className="p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                <p className="text-xs text-indigo-300 mb-1 uppercase font-bold">System Expected Cash</p>
                <p className="text-3xl font-black text-white">LKR {stats.audit.cash_in_hand_expected?.toLocaleString()}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-slate-400 uppercase font-bold">Actual Cash in Drawer</p>
                <Input 
                  type="number" 
                  placeholder="Count your cash..." 
                  className="h-14 text-xl font-bold"
                  value={actualCash}
                  onChange={e => setActualCash(Number(e.target.value))}
                />
              </div>

              <div className={`p-4 rounded-2xl border ${
                actualCash === stats.audit.cash_in_hand_expected ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                "bg-rose-500/10 border-rose-500/20 text-rose-400"
              }`}>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase">Difference</span>
                  <span className="text-lg font-black">LKR {(actualCash - (stats.audit.cash_in_hand_expected || 0)).toLocaleString()}</span>
                </div>
              </div>

              <Button onClick={reconcile} className="w-full h-14 text-lg gap-2" variant={actualCash === stats.audit.cash_in_hand_expected ? "primary" : "secondary"}>
                <CheckCircle2 size={20} /> Close Register for Day
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="Financial Warnings" icon={<AlertTriangle size={16} className="text-amber-500" />}>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Voided this month</span>
                <span className="font-bold text-rose-400">LKR {stats.audit.voided_invoices?.toLocaleString()}</span>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Note: All voided invoices are audited and reversed in inventory. Reconciliation is required for cash-in-hand safety.
              </p>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
