import { useEffect, useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, KpiCard } from "../components/UI";
import { Cloud, Database, HardDrive, RotateCcw, Download, ShieldCheck, Server } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function Backup() {
  const { toast, confirm } = useFeedback();
  const { data, setData, loading } = useFetch("/backup");
  const [lastAt, setLastAt] = useState(null);

  useEffect(() => {
    api.get("/backup/last").then((res) => setLastAt(res.data.last_backup_at));
  }, [data]);

  const files = data || [];
  const stats = useMemo(() => {
    const auto = files.filter((f) => String(f).startsWith("auto_")).length;
    const manual = files.length - auto;
    return { total: files.length, auto, manual };
  }, [files]);

  const create = async () => {
    try {
      await api.post("/backup/create");
      const list = await api.get("/backup");
      setData(list.data);
      toast("Manual snapshot created successfully", "success");
    } catch(e) {
      toast("Backup creation failed", "error");
    }
  };

  const restore = async (f) => {
    const ok = await confirm("DANGER: Database Restore", "This will OVERWRITE the entire current database with the selected snapshot. Unsaved data will be lost. Continue?");
    if (!ok) return;
    try {
      await api.post(`/backup/restore/${f}`);
      toast("Database restored successfully. Please restart the application.", "success");
    } catch {
      toast("Database restore failed", "error");
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading backup archives...</div>;

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
             <Server className="text-emerald-400"/> Data Persistence & Backups
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage database snapshots, restorations, and cloud sync</p>
        </div>
        <button onClick={create} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
          <HardDrive size={14}/> Generate Manual Snapshot
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 shrink-0">
        <KpiCard tone="sky" title="Local Snapshots" value={String(stats.total)} icon={<Database size={18} />} />
        <KpiCard tone="amber" title="Automated Backups" value={String(stats.auto)} icon={<RotateCcw size={18} />} />
        <KpiCard tone="violet" title="Manual Archives" value={String(stats.manual)} icon={<HardDrive size={18} />} />
        <KpiCard tone="green" title="Latest Checkpoint" value={lastAt ? new Date(lastAt).toLocaleDateString() : "None"} hint={lastAt ? new Date(lastAt).toLocaleTimeString() : "Run one today"} icon={<Cloud size={18} />} />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 pr-2">
         <div className="grid grid-cols-12 gap-6">
            
            {/* LEFT PANEL: ARCHIVES LIST */}
            <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
               <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex-1 flex flex-col">
                  <div className="p-5 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
                    <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                       <Database size={14}/> Archive History
                    </h2>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/5">
                        <tr>
                          <th className="px-6 py-4 font-bold">Snapshot File ID</th>
                          <th className="px-6 py-4 font-bold">Generation Type</th>
                          <th className="px-6 py-4 font-bold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {files.map((f) => (
                          <tr key={f} className="hover:bg-white/[0.02] transition-colors group">
                            <td className="px-6 py-4">
                              <span className="font-mono text-xs font-bold text-slate-300 bg-black/40 px-3 py-1.5 rounded-lg border border-white/5 group-hover:text-indigo-300 transition-colors">
                                {f}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <Badge tone={String(f).startsWith("auto_") ? "amber" : "sky"} className="text-[10px] uppercase tracking-wider px-2 py-0.5">
                                {String(f).startsWith("auto_") ? "System Automated" : "User Triggered"}
                              </Badge>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => restore(f)} className="text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ml-auto">
                                <RotateCcw size={12}/> Execute Restore
                              </button>
                            </td>
                          </tr>
                        ))}
                        {files.length === 0 && (
                          <tr><td colSpan={3} className="text-center py-16 text-slate-500 font-bold italic">No backup archives found.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
               </div>
            </div>

            {/* RIGHT PANELS */}
            <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
               <div className="bg-emerald-500/5 border border-emerald-500/20 backdrop-blur-md rounded-3xl p-6 shadow-[0_0_40px_rgba(16,185,129,0.05)]">
                  <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                     <ShieldCheck size={16}/> Automatic Protection
                  </h3>
                  <div className="p-4 bg-black/20 border border-white/5 rounded-2xl">
                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Latest Successful Sync</p>
                     <p className="text-lg font-black text-slate-200">{lastAt ? new Date(lastAt).toLocaleString() : "No record"}</p>
                  </div>
                  <p className="text-[10px] text-emerald-500/80 font-bold leading-relaxed mt-4">
                     The system automatically generates a shadow copy of your entire database every 24 hours during initial boot to prevent data loss.
                  </p>
               </div>

               <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex-1 flex flex-col">
                  <h3 className="text-xs font-black text-sky-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                     <Download size={16}/> Export Raw Data
                  </h3>
                  <p className="text-xs text-slate-400 font-medium leading-relaxed mb-6">
                     You can download a compressed copy of the SQLite `.db` database file for off-site cold storage or external auditing.
                  </p>
                  <button className="w-full mt-auto py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center justify-center gap-2 text-xs uppercase tracking-widest">
                    <Cloud size={14}/> Download .DB File
                  </button>
               </div>
            </div>

         </div>
      </div>
    </div>
  );
}
