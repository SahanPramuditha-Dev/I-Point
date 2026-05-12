import { useEffect, useState } from "react";
import api from "../lib/api";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { BadgeDollarSign, Boxes, Download, PieChart, TrendingUp, Wrench } from "lucide-react";

export default function Reports() {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    const res = await api.get(`/reports/summary${query.toString() ? `?${query.toString()}` : ""}`);
    setData(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const exportCSV = () => {
    const query = new URLSearchParams();
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    window.open(`${api.defaults.baseURL}/reports/export-sales?${query.toString()}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 rounded-2xl border border-white/10 bg-white/5">
        Loading reports…
      </div>
    );
  }

  const revenue = Number(data?.sales_revenue ?? 0);
  const cogs = Number(data?.cogs ?? 0);
  const profit = Number(data?.gross_profit ?? 0);
  const invVal = Number(data?.inventory_value ?? 0);
  const marginPct =
    revenue > 0 ? ((profit / revenue) * 100).toFixed(1) : "0";

  const kpis = [
    {
      title: "Total revenue",
      value: `LKR ${revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "Sales in selected range",
      tone: "sky",
      icon: <BadgeDollarSign size={18} />,
    },
    {
      title: "Cost of goods",
      value: `LKR ${cogs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "COGS",
      tone: "violet",
      icon: <Boxes size={18} />,
    },
    {
      title: "Gross profit",
      value: `LKR ${profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: `${marginPct}% margin`,
      tone: "green",
      icon: <TrendingUp size={18} />,
    },
    {
      title: "Inventory value",
      value: `LKR ${invVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      hint: "Stock on hand",
      tone: "amber",
      icon: <PieChart size={18} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageTitle title="Reports & Analytics" subtitle="Filter and review business performance" />
        <Button variant="secondary" onClick={exportCSV} className="shrink-0 inline-flex items-center gap-2">
          <Download size={16} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-12 gap-3">
        {kpis.map((k) => (
          <KpiCard
            key={k.title}
            className="col-span-12 sm:col-span-6 xl:col-span-3"
            title={k.title}
            value={k.value}
            hint={k.hint}
            tone={k.tone}
            icon={k.icon}
          />
        ))}
      </div>

      <SectionCard title="Date range" right={<Button size="sm" onClick={load}>Apply</Button>}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">From</p>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">To</p>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Key metrics" className="col-span-12 lg:col-span-4">
          <div className="space-y-3 mt-1">
            <div className="flex justify-between items-center rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <span className="text-slate-400 text-sm">Total sales</span>
              <span className="font-bold text-white">{data?.sales_count ?? 0}</span>
            </div>
            <div className="flex justify-between items-center rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <span className="text-slate-400 text-sm flex items-center gap-2">
                <Wrench size={14} className="text-sky-300" /> Repairs
              </span>
              <span className="font-bold text-white">{data?.repairs_total ?? 0}</span>
            </div>
            <div className="flex justify-between items-center rounded-xl border border-white/10 bg-white/5 px-3 py-3">
              <span className="text-slate-400 text-sm">Profit margin</span>
              <span className="font-bold text-emerald-300">{marginPct}%</span>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Recent transactions"
          className="col-span-12 lg:col-span-8"
          right={<Badge tone="sky">{(data?.recent_sales || []).length} rows</Badge>}
        >
          <div className="overflow-x-auto -mx-1">
            <Table className="table-base min-w-[520px]">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Total</th>
                  <th>Method</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {(data?.recent_sales || []).map((s) => (
                  <tr key={s.sale_id}>
                    <td className="font-mono text-xs text-sky-200 font-semibold">
                      INV-{String(s.sale_id).padStart(5, "0")}
                    </td>
                    <td className="font-semibold text-white">LKR {Number(s.total).toFixed(2)}</td>
                    <td>
                      <Badge tone={s.payment_method === "Cash" ? "green" : "indigo"}>{s.payment_method}</Badge>
                    </td>
                    <td className="text-slate-400 text-sm">{new Date(s.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
