import { useFetch } from "../hooks/useFetch";
import { Badge } from "../components/UI";
import { History, Undo2, Info, AlertTriangle, CheckCircle2, ShieldCheck, Database, RefreshCcw } from "lucide-react";
import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";

export default function ActivityLog() {
  const { data, loading } = useFetch('/notifications'); 
  const { toast } = useFeedback();

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading system audit trail...</div>;

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
             <History className="text-slate-400"/> System Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">Trace all automated notifications, stock alerts, and critical system events</p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-6 min-h-0">
        
        {/* LEFT PANEL: ACTIVITY LOGS */}
        <div className="col-span-12 lg:col-span-8 flex flex-col bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <History size={14}/> Recent Activity & Notifications
            </h3>
            <Badge tone="sky">{(data || []).length} logs found</Badge>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
            {(data || []).map((n) => (
              <div key={n.id} className="flex gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 hover:bg-white/[0.04] transition-all group">
                <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center border ${
                  n.type === 'Low Stock' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                  n.type === 'Overdue Repair' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                  'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                }`}>
                  {n.type === 'Low Stock' ? <AlertTriangle size={20} /> : <Info size={20} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-4">
                    <h4 className="font-bold text-slate-200 text-sm truncate">{n.title}</h4>
                    <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest shrink-0 bg-black/40 px-2 py-1 rounded-md">
                       {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mt-2 leading-relaxed">{n.message}</p>
                  <div className="flex items-center gap-3 mt-4">
                    <Badge tone={n.type === 'Low Stock' ? 'amber' : 'indigo'} className="text-[9px] uppercase tracking-wider">{n.type}</Badge>
                    {n.entity_id && (
                      <button className="text-[10px] font-bold text-sky-400 hover:text-sky-300 transition-colors uppercase tracking-widest flex items-center gap-1">
                        View Record →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {(data || []).length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                <History size={32} className="opacity-30 mb-4"/>
                <p className="font-bold">No activity logs found</p>
                <p className="text-xs mt-1">The system hasn't recorded any notifications yet.</p>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: SYSTEM HEALTH */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-emerald-500/5 backdrop-blur-md border border-emerald-500/20 rounded-3xl p-6 shadow-[0_0_40px_rgba(16,185,129,0.05)]">
             <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2 mb-6">
                <ShieldCheck size={16}/> System Health Status
             </h2>
             
             <div className="space-y-4">
               <div className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5">
                 <div className="flex items-center gap-3 text-slate-300 font-bold text-sm">
                   <Database size={16} className="text-emerald-400"/>
                   Database Integrity
                 </div>
                 <Badge tone="green" className="text-[9px]">Verified</Badge>
               </div>
               
               <div className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5">
                 <div className="flex items-center gap-3 text-slate-300 font-bold text-sm">
                   <CheckCircle2 size={16} className="text-emerald-400"/>
                   API Connection
                 </div>
                 <Badge tone="green" className="text-[9px]">Online</Badge>
               </div>

               <div className="flex items-center justify-between p-4 rounded-2xl bg-black/20 border border-white/5">
                 <div className="flex items-center gap-3 text-slate-300 font-bold text-sm">
                   <RefreshCcw size={16} className="text-emerald-400"/>
                   Background Sync
                 </div>
                 <span className="text-xs text-emerald-400 font-black">Active</span>
               </div>
             </div>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Audit Compliance</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium mb-6">
              All critical system events, inventory modifications, and user authentications are immutably recorded. Reversals must be approved by an Administrator within 24 hours.
            </p>
            <button className="w-full py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors uppercase text-[10px] tracking-widest">
              Export Audit Logs
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
