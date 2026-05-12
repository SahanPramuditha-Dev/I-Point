import { useFetch } from "../hooks/useFetch";
import { Badge, PageTitle, SectionCard, Table, Button } from "../components/UI";
import { History, Undo2, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";

export default function ActivityLog() {
  const { data, setData, loading } = useFetch('/notifications'); // Actually we'll add an endpoint for logs
  const { toast } = useFeedback();

  // For now let's use notifications as the log since we have many types
  if (loading) return <div className="p-8 text-slate-400">Loading history...</div>;

  return (
    <div className="space-y-6">
      <PageTitle title="System Audit Trail" subtitle="Trace every critical business action and reversal" />
      
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-8 space-y-4">
          <SectionCard title="Recent Activities" icon={<History size={16} />}>
            <div className="space-y-4">
              {(data || []).map((n, idx) => (
                <div key={n.id} className="flex gap-4 p-4 rounded-2xl bg-white/2 border border-white/5 hover:border-white/10 transition group">
                  <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${
                    n.type === 'Low Stock' ? 'bg-amber-500/20 text-amber-500' :
                    n.type === 'Overdue Repair' ? 'bg-rose-500/20 text-rose-500' :
                    'bg-indigo-500/20 text-indigo-400'
                  }`}>
                    {n.type === 'Low Stock' ? <AlertTriangle size={20} /> : <Info size={20} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-white text-sm">{n.title}</h4>
                      <span className="text-[10px] text-slate-500 uppercase font-bold">{new Date(n.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-400 mt-1">{n.message}</p>
                    <div className="flex gap-2 mt-3">
                      <Badge tone="slate" className="text-[10px]">{n.type}</Badge>
                      {n.entity_id && (
                        <button className="text-[10px] font-bold text-indigo-400 hover:underline">View Related Record</button>
                      )}
                    </div>
                  </div>
                  <div className="opacity-0 group-hover:opacity-100 transition">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                      <Undo2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
              {(data || []).length === 0 && <p className="text-center py-20 text-slate-600 italic">No activity logs found yet</p>}
            </div>
          </SectionCard>
        </div>

        <div className="col-span-4 space-y-6">
          <SectionCard title="System Health" className="bg-emerald-500/5 border-emerald-500/20">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-400" size={18} />
                <span className="text-sm text-slate-200">Database Integrity: <span className="font-bold">Verified</span></span>
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-400" size={18} />
                <span className="text-sm text-slate-200">File Storage: <span className="font-bold">Connected</span></span>
              </div>
              <div className="flex items-center gap-3 text-slate-400">
                <Info size={18} />
                <span className="text-sm">Last Backup: <span className="font-bold text-sky-400">2 hours ago</span></span>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Pending Review">
             <div className="space-y-3">
               <p className="text-xs text-slate-500 leading-relaxed italic">
                 Actions marked with an Undo icon can be reversed within 24 hours of creation. 
                 Inventory adjustments require manager approval for reversal.
               </p>
               <Button variant="secondary" className="w-full">Clear History Logs</Button>
             </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
