import { useEffect, useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { Cloud, Database, HardDrive, RotateCcw } from "lucide-react";
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
    await api.post("/backup/create");
    const list = await api.get("/backup");
    setData(list.data);
    toast("Backup created", "success");
  };

  const restore = async (f) => {
    const ok = await confirm("Restore Backup", "This will overwrite the current database. Continue?");
    if (!ok) return;
    try {
      await api.post(`/backup/restore/${f}`);
      toast("Database restored successfully. Restart app if needed.", "success");
    } catch {
      toast("Restore failed", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 rounded-2xl border border-white/10 bg-white/5">
        Loading backups...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle title="Data backups" subtitle="Offline snapshots and optional cloud sync" />
        <Button onClick={create} className="h-11 px-6 shrink-0 inline-flex items-center gap-2">
          <HardDrive size={16} /> Create backup
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="sky" title="Snapshots" value={String(stats.total)} hint="On this machine" icon={<Database size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="amber" title="Automatic" value={String(stats.auto)} hint="Scheduled / on load" icon={<RotateCcw size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="violet" title="Manual" value={String(stats.manual)} hint="User triggered" icon={<HardDrive size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="green" title="Last backup" value={lastAt ? new Date(lastAt).toLocaleDateString() : "Never"} hint={lastAt ? new Date(lastAt).toLocaleTimeString() : "Run one today"} icon={<Cloud size={18} />} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Backup status" className="col-span-12 lg:col-span-4">
          <div className="space-y-3 mt-1">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Last attempt</p>
              <p className="text-lg font-bold text-sky-300">{lastAt ? new Date(lastAt).toLocaleString() : "Never"}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
              Auto-backup runs about every <span className="text-white font-semibold">24 hours</span> when the app loads.
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Available snapshots" className="col-span-12 lg:col-span-8">
          <div className="max-h-[520px] overflow-auto pr-1">
            {files.length === 0 && <p className="text-center py-16 text-slate-500 italic">No backups found.</p>}
            {files.length > 0 && (
              <Table className="table-base">
                <thead>
                  <tr>
                    <th>Filename</th>
                    <th>Type</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f}>
                      <td className="font-mono text-xs text-slate-200">{f}</td>
                      <td><Badge tone={String(f).startsWith("auto_") ? "amber" : "sky"}>{String(f).startsWith("auto_") ? "Automatic" : "Manual"}</Badge></td>
                      <td className="text-right"><Button size="sm" variant="secondary" className="px-3" onClick={() => restore(f)}>Restore</Button></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
