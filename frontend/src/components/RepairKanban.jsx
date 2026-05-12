import { Badge } from "../components/UI";

const COLUMNS = [
  "Pending",
  "Diagnosing",
  "Waiting for Approval",
  "Waiting for Parts",
  "Repairing",
  "Quality Checking",
  "Completed",
  "Delivered"
];

export default function RepairKanban({ repairs, onStatusChange, onViewDetails }) {
  const getTasksByStatus = (status) => (repairs || []).filter(r => r.status === status);

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[600px] scrollbar-thin scrollbar-thumb-white/10">
      {COLUMNS.map(col => (
        <div key={col} className="w-80 shrink-0 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 mb-3 bg-black/5 dark:bg-white/5 rounded-lg border border-black/5 dark:border-white/5">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{col}</span>
            <Badge tone="sky" className="px-1.5 py-0.5">{getTasksByStatus(col).length}</Badge>
          </div>
          <div className="flex-1 space-y-3">
            {getTasksByStatus(col).map(r => (
              <div 
                key={r.id} 
                className="p-4 bg-white dark:bg-[#12182a] border border-black/5 dark:border-white/5 rounded-xl hover:border-indigo-500/50 transition cursor-pointer shadow-sm dark:shadow-lg group"
                onClick={() => onViewDetails(r)}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-mono text-indigo-400 font-bold">{r.ticket_no}</span>
                  <Badge tone={r.priority === "Urgent" ? "red" : r.priority === "High" ? "amber" : "slate"}>
                    {r.priority}
                  </Badge>
                </div>
                <h4 className="font-bold text-sm text-white mb-1 group-hover:text-indigo-300 transition">{r.device_model}</h4>
                <p className="text-xs text-slate-400 line-clamp-2 mb-3">{r.issue}</p>
                
                <div className="flex items-center justify-between pt-3 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-indigo-500 flex items-center justify-center text-[10px] text-white font-bold">
                      {r.technician?.slice(0, 2).toUpperCase() || "??"}
                    </div>
                    <span className="text-[10px] text-slate-500 font-medium">{r.technician || "Unassigned"}</span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-400">LKR {r.estimated_cost.toLocaleString()}</span>
                </div>
              </div>
            ))}
            {getTasksByStatus(col).length === 0 && (
              <div className="h-32 border-2 border-dashed border-white/5 rounded-xl flex items-center justify-center text-slate-600 text-xs italic">
                Empty
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
