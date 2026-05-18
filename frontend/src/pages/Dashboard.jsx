import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useFetch } from "../hooks/useFetch";
import { ErrorState, KpiCard, Loading, SectionCard, Table, Badge, Button } from "../components/UI";
import { Chip, Button as MuiButton } from "@mui/material";
import {
  BadgeDollarSign,
  Wrench,
  CheckCircle2,
  Boxes,
  Users,
  Receipt,
  ArrowRight,
  Clock,
  Plus,
  Search,
  UserPlus,
  ShoppingCart,
  Server,
  Database,
  HardDriveDownload,
  WifiOff,
  BarChart3,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";

function greet(name = "there") {
  const h = new Date().getHours();
  const t = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${t}, ${name}`;
}

function pctChange(curr, prev) {
  if (!prev) return 0;
  return ((curr - prev) / prev) * 100;
}

function fmtPct(v) {
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, loading, error } = useFetch("/dashboard");
  const role = localStorage.getItem("login_role") || "admin";

  const revData = data?.charts?.revenue_overview || [];
  const salesData = data?.charts?.sales_breakdown || [];
  const repairs = data?.recent_repairs || [];
  const feed = data?.activity_feed || [];
  const tx = data?.recent_transactions || [];

  const revCurrent = revData[revData.length - 1]?.value || 0;
  const revPrev = revData[revData.length - 2]?.value || 0;
  const revTrend = pctChange(revCurrent, revPrev);

  const pendingRepairs = Math.max(0, (data?.repair_stats?.total || 0) - (data?.repair_stats?.completed || 0));
  const completionRate = data?.repair_stats?.total
    ? ((data?.repair_stats?.completed || 0) / data.repair_stats.total) * 100
    : 0;

  const totalSales = salesData.reduce((a, b) => a + (b.value || 0), 0);

  const health = [
    { label: "Database Connected", tone: "green", icon: <Database size={13} />, meta: "Live" },
    { label: "Backup Enabled", tone: "sky", icon: <HardDriveDownload size={13} />, meta: "02:00 AM" },
    { label: "Offline Ready", tone: "indigo", icon: <WifiOff size={13} />, meta: "Queue 0" },
    { label: "API Healthy", tone: "amber", icon: <Server size={13} />, meta: "<120ms" },
  ];

  const quickActions = useMemo(() => {
    const common = [
      { label: "New Repair", to: "/repairs", icon: <Wrench size={14} /> },
      { label: "New Sale", to: "/pos", icon: <ShoppingCart size={14} /> },
      { label: "Add Customer", to: "/customers", icon: <UserPlus size={14} /> },
      { label: "Search Device", to: "/search", icon: <Search size={14} /> },
    ];

    if (role === "cashier") {
      return common.filter((x) => x.to !== "/repairs");
    }

    if (role === "technician") {
      return [
        { label: "New Repair", to: "/repairs", icon: <Plus size={14} /> },
        { label: "Open Tickets", to: "/repairs", icon: <Wrench size={14} /> },
        { label: "Search Device", to: "/search", icon: <Search size={14} /> },
      ];
    }

    return common;
  }, [role]);

  const kpis = [
    {
      title: "Today's Revenue",
      value: `LKR ${(data?.daily_revenue || 0).toLocaleString()}`,
      hint: `${fmtPct(revTrend)} vs previous period`,
      tone: "sky",
      icon: <BadgeDollarSign size={18} />,
      to: "/reports",
    },
    {
      title: "Pending Repairs",
      value: String(pendingRepairs),
      hint: `${completionRate.toFixed(0)}% completion rate`,
      tone: "amber",
      icon: <Wrench size={18} />,
      to: "/repairs",
    },
    {
      title: "Completed Today",
      value: String(data?.repair_stats?.completed || 0),
      hint: "Ready for delivery",
      tone: "green",
      icon: <CheckCircle2 size={18} />,
      to: "/repairs",
    },
    {
      title: "Low Stock",
      value: String(data?.low_stock_count || 0),
      hint: "Reorder required",
      tone: "red",
      icon: <Boxes size={18} />,
      to: "/inventory",
    },
    {
      title: "Total Customers",
      value: String(data?.customers_count || 0),
      hint: "Active customer base",
      tone: "indigo",
      icon: <Users size={18} />,
      to: "/customers",
    },
    {
      title: "Recent Sales",
      value: String(tx.length),
      hint: `${totalSales.toLocaleString()} units across categories`,
      tone: "violet",
      icon: <Receipt size={18} />,
      to: "/pos",
    },
  ];

  if (loading) return <Loading />;
  if (error) return <ErrorState text={error} />;

  return (
    <div className="h-full min-h-0 overflow-y-auto pr-1 pb-4 custom-scrollbar">
      <div className="space-y-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            {greet(localStorage.getItem("username") || "Team")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Operations snapshot for {new Date().toLocaleDateString()}.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Button key={a.label} variant="secondary" size="sm" onClick={() => navigate(a.to)}>
              {a.icon} {a.label}
            </Button>
          ))}
        </div>
      </div>

      <SectionCard title="System Health" subtitle="Realtime platform status" className="p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {health.map((h) => (
            <div key={h.label} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                {h.icon}
                <span>{h.label}</span>
              </div>
              <Badge tone={h.tone} className="px-2 py-0.5 text-[9px]">{h.meta}</Badge>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpis.map((k) => (
          <button
            key={k.title}
            type="button"
            onClick={() => navigate(k.to)}
            className="rounded-2xl text-left focus:outline-none focus:ring-2 focus:ring-indigo-400/60"
            title={`Open ${k.title}`}
          >
            <KpiCard {...k} className="h-full" />
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <SectionCard title="Revenue Overview" subtitle="Last 7 periods" className="xl:col-span-7 h-[360px] flex flex-col">
          <div className="mt-4 min-h-0 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.08)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} dy={8} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  width={65}
                  tickFormatter={(v) => (v >= 1000000 ? `Rs.${(v / 1000000).toFixed(1)}M` : `Rs.${(v / 1000).toFixed(0)}k`)}
                />
                <Tooltip
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    borderRadius: "12px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#f8fafc",
                    fontSize: "12px",
                  }}
                  formatter={(val) => [`LKR ${Number(val).toLocaleString()}`, "Revenue"]}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[8, 8, 0, 0]} barSize={30}>
                  {revData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === revData.length - 1 ? "#38bdf8" : "#6366f1"} opacity={index === revData.length - 1 ? 1 : 0.65} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Sales Breakdown" subtitle="Category mix" className="xl:col-span-5 h-[360px] flex flex-col">
          <div className="relative mt-2 min-h-[180px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={salesData} innerRadius="63%" outerRadius="94%" paddingAngle={6} dataKey="value" stroke="none">
                  {salesData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={["#6366f1", "#22c55e", "#f59e0b", "#38bdf8"][index % 4]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-2">
            {salesData.map((s, i) => (
              <div key={s.name} className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ["#6366f1", "#22c55e", "#f59e0b", "#38bdf8"][i % 4] }} />
                  <span className="text-slate-500 dark:text-slate-400">{s.name}</span>
                </div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {Math.round(((s.value || 0) / (salesData.reduce((acc, curr) => acc + (curr.value || 0), 0) || 1)) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Today's Repairs"
          subtitle="Recent repair tickets"
          className="xl:col-span-6 overflow-hidden"
          right={<Button variant="ghost" size="sm" onClick={() => navigate("/repairs")}>View All <ArrowRight size={14} className="ml-1" /></Button>}
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
                {repairs.slice(0, 6).map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/repairs?id=${r.id}`)}>
                    <td className="font-mono text-xs text-indigo-500 dark:text-indigo-400">#R-{String(r.id).padStart(4, "0")}</td>
                    <td className="font-bold text-slate-700 dark:text-slate-200">{r.customer}</td>
                    <td className="text-xs text-slate-500 dark:text-slate-400">{r.device}</td>
                    <td><Badge tone={r.status === "Completed" ? "green" : r.status === "Pending" ? "amber" : "sky"}>{r.status}</Badge></td>
                    <td className="text-xs font-medium text-slate-500 dark:text-slate-400">{r.tech}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard
          title="Today's Sales"
          subtitle="Latest transactions"
          className="xl:col-span-6 overflow-hidden"
          right={<Button variant="ghost" size="sm" onClick={() => navigate("/pos")}>Open POS <ArrowRight size={14} className="ml-1" /></Button>}
        >
          <div className="w-full overflow-x-auto">
            <Table className="table-base w-full whitespace-nowrap">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Customer</th>
                  <th>Total</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {tx.slice(0, 6).map((t, idx) => (
                  <tr key={t.id || idx}>
                    <td className="font-mono text-xs text-slate-500">{t.invoice_no || `INV-${String(idx + 1).padStart(4, "0")}`}</td>
                    <td className="font-bold text-slate-700 dark:text-slate-200">{t.customer || "Walk-in"}</td>
                    <td className="font-semibold text-emerald-600 dark:text-emerald-300">LKR {(t.total || 0).toLocaleString()}</td>
                    <td><Badge tone="indigo" className="text-[9px] px-2 py-0.5">{t.payment_method || "Cash"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Recent Payments" subtitle="Settlement stream" className="xl:col-span-4">
          <div className="space-y-2">
            {tx.slice(0, 6).map((t, idx) => (
              <div key={`p-${t.id || idx}`} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div>
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.customer || "Walk-in"}</p>
                  <p className="text-[10px] text-slate-500">{t.payment_method || "Cash"}</p>
                </div>
                <p className="text-xs font-black text-emerald-500 dark:text-emerald-300">LKR {(t.total || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle="Operational timeline"
          className="xl:col-span-8"
          right={<Badge tone="sky" className="text-[9px] px-2 py-0.5 animate-pulse">Live feed</Badge>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {feed.slice(0, 8).map((l, i) => (
              <div key={l.id || i} className="flex gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/10 bg-black/20">
                  {l.module === "REPAIR" ? (
                    <Wrench size={13} className="text-sky-500" />
                  ) : l.module === "POS" ? (
                    <Receipt size={13} className="text-emerald-500" />
                  ) : l.module === "INVENTORY" ? (
                    <Boxes size={13} className="text-amber-500" />
                  ) : (
                    <BarChart3 size={13} className="text-indigo-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-snug text-slate-800 dark:text-slate-200">{l.action}</p>
                  {l.details && <p className="mt-0.5 line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400">{l.details}</p>}
                  <div className="mt-1.5 flex items-center gap-2 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    <Clock size={10} />
                    <span>{new Date(l.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="opacity-40">.</span>
                    <span>{l.module}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
    </div>
  );
}

