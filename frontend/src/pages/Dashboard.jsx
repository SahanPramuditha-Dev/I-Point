import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useFetch } from "../hooks/useFetch";
import { ErrorState, KpiCard, Loading, SectionCard, Table, Badge, Button } from "../components/UI";
import { BadgeDollarSign, Wrench, CheckCircle2, Boxes, Users, Receipt, ArrowRight, Activity, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

function greet(name = "there") {
  const h = new Date().getHours();
  const t = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${t}, ${name}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, error } = useFetch('/dashboard');
  if (loading) return <Loading/>;
  if (error) return <ErrorState text={error}/>;

  const kpis = [
    { title: "Today's Revenue", value: `LKR ${(data?.daily_revenue || 0).toLocaleString()}`, hint: "Sales + Repairs", tone: "sky", icon: <BadgeDollarSign size={18} /> },
    { title: "Pending Repairs", value: String(data?.repair_stats?.total - data?.repair_stats?.completed), hint: "Needs attention", tone: "amber", icon: <Wrench size={18} /> },
    { title: "Completed Today", value: String(data?.repair_stats?.completed), hint: "Ready for delivery", tone: "green", icon: <CheckCircle2 size={18} /> },
    { title: "Low Stock", value: String(data?.low_stock_count), hint: "Items to reorder", tone: "red", icon: <Boxes size={18} /> },
    { title: "Total Customers", value: String(data?.customers_count), hint: "Active base", tone: "indigo", icon: <Users size={18} /> },
    { title: "Recent Sales", value: String(data?.recent_transactions?.length), hint: "Last 24h", tone: "violet", icon: <Receipt size={18} /> },
  ];

  const revData = data?.charts?.revenue_overview || [];
  const salesData = data?.charts?.sales_breakdown || [];
  const repairs = data?.recent_repairs || [];
  const feed = data?.activity_feed || [];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">{greet(localStorage.getItem("username") || "Ashan")}</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Here’s what’s happening in iStore today — {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <KpiCard key={k.title} {...k} className="xl:col-span-1" />
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Revenue Overview" subtitle="Last 7 months performance" className="col-span-8 h-[420px] flex flex-col">
          <div className="flex-1 mt-4 min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={revData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.05)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} width={65} tickFormatter={(v) => v >= 1000000 ? `Rs.${(v/1000000).toFixed(1)}M` : `Rs.${(v/1000).toFixed(0)}k`} />
              <Tooltip 
                cursor={{fill: 'rgba(99,102,241,0.05)'}}
                contentStyle={{ backgroundColor: '#0f172a', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#f8fafc', fontSize: '12px' }}
                formatter={(val) => [`LKR ${val.toLocaleString()}`, "Revenue"]}
                labelStyle={{ color: '#94a3b8', marginBottom: '4px' }}
              />
              <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={32}>
                {revData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === revData.length - 1 ? '#38bdf8' : '#6366f1'} opacity={index === revData.length - 1 ? 1 : 0.6} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Sales Breakdown" subtitle="By category" className="col-span-4 h-[420px] flex flex-col">
          <div className="flex-1 min-h-[180px] mt-2 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={salesData} innerRadius="65%" outerRadius="95%" paddingAngle={8} dataKey="value" stroke="none">
                {salesData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#6366f1', '#22c55e', '#f59e0b'][index % 3]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-4 space-y-3 shrink-0 pb-2">
            {salesData.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.2)]" style={{backgroundColor: ['#6366f1', '#22c55e', '#f59e0b'][i % 3]}}></div>
                  <span className="text-slate-500 dark:text-slate-400 font-medium">{s.name}</span>
                </div>
                <span className="font-bold text-slate-800 dark:text-slate-200">{Math.round((s.value / (salesData.reduce((acc, curr) => acc + curr.value, 0) || 1)) * 100)}%</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard 
          title="Recent Repair Tickets" 
          className="col-span-8 overflow-hidden"
          right={<Button variant="ghost" size="sm" onClick={() => navigate('/repairs')}>View All <ArrowRight size={14} className="ml-1" /></Button>}
        >
          <div className="w-full overflow-x-auto">
            <Table className="table-base w-full whitespace-nowrap">
              <thead>
              <tr>
                <th>#</th>
                <th>Customer</th>
                <th>Device</th>
                <th>Status</th>
                <th>Tech</th>
              </tr>
            </thead>
            <tbody>
              {repairs.map(r => (
                <tr key={r.id} className="group cursor-pointer" onClick={() => navigate(`/repairs?id=${r.id}`)}>
                  <td className="text-indigo-500 dark:text-indigo-400 font-mono text-xs">#R-{r.id.toString().padStart(4, '0')}</td>
                  <td className="font-bold text-slate-700 dark:text-slate-200">{r.customer}</td>
                  <td className="text-slate-500 dark:text-slate-400 text-xs">{r.device}</td>
                  <td><Badge tone={r.status === 'Completed' ? 'green' : r.status === 'Pending' ? 'amber' : 'sky'}>{r.status}</Badge></td>
                  <td className="text-slate-500 dark:text-slate-400 text-xs font-medium">{r.tech}</td>
                </tr>
              ))}
            </tbody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Recent Activity" className="col-span-4" right={<Badge tone="sky" className="text-[9px] px-2 py-0.5 animate-pulse">Live feed</Badge>}>
          <div className="space-y-5 mt-2">
            {feed.map((l, i) => (
              <div key={l.id} className="flex gap-4 group relative">
                {i !== feed.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-slate-200 dark:bg-slate-800 group-hover:bg-indigo-500/30 transition-colors" />}
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-black/5 dark:border-white/5 shadow-sm grid place-items-center shrink-0 z-10 group-hover:border-indigo-500/50 transition-colors">
                  {l.module === 'REPAIR' ? <Wrench size={13} className="text-sky-500" /> : 
                   l.module === 'POS' ? <Receipt size={13} className="text-emerald-500" /> :
                   l.module === 'INVENTORY' ? <Boxes size={13} className="text-amber-500" /> :
                   <Activity size={13} className="text-indigo-500" />}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                   <div className="flex justify-between items-start gap-2">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 leading-snug">
                        {l.action}
                      </p>
                   </div>
                   {l.details && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">{l.details}</p>}
                   <div className="flex items-center gap-2 mt-1.5 text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                      <Clock size={10} className="shrink-0" />
                      <span>{new Date(l.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      <span className="opacity-30">•</span>
                      <span>{l.module}</span>
                   </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
