import { useParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import { Badge, Button, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { ShoppingBag, Wrench, Phone, Mail, MapPin, Calendar, AlertTriangle } from "lucide-react";
import { useMemo } from "react";

export default function CustomerDetail() {
  const { id } = useParams();
  const { data: customer, loading: cLoading } = useFetch(`/customers/${id}`);
  const { data: sales, loading: sLoading } = useFetch(`/pos/sales`);
  const { data: repairs, loading: rLoading } = useFetch(`/repairs`);

  const customerSales = useMemo(() => 
    (sales || []).filter(s => s.customer_id === Number(id)), 
  [sales, id]);

  const customerRepairs = useMemo(() => 
    (repairs || []).filter(r => r.customer_id === Number(id)), 
  [repairs, id]);

  const stats = useMemo(() => {
    const totalSpent = customerSales.reduce((sum, s) => sum + s.total, 0);
    const pendingPayments = customerRepairs.filter(r => r.status !== "Delivered" && r.status !== "Cancelled")
                                           .reduce((sum, r) => sum + (r.estimated_cost - r.advance_payment), 0);
    return {
      totalSpent,
      pendingPayments,
      salesCount: customerSales.length,
      repairsCount: customerRepairs.length,
    };
  }, [customerSales, customerRepairs]);

  if (cLoading) return <div className="p-8">Loading customer...</div>;
  if (!customer) return <div className="p-8">Customer not found</div>;

  return (
    <div className="space-y-6">
      <PageTitle title={customer.name} subtitle={`Customer since ${new Date(customer.created_at).toLocaleDateString()}`} />
      
      <div className="grid grid-cols-12 gap-4">
        {/* Profile Card */}
        <SectionCard title="Contact Information" className="col-span-4">
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-sky-500/10 flex items-center justify-center text-sky-400">
                <Phone size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Phone</p>
                <p className="text-sm font-medium">{customer.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400">
                <Mail size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Email</p>
                <p className="text-sm font-medium">{customer.email || "N/A"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <MapPin size={18} />
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase">Address</p>
                <p className="text-sm font-medium">{customer.address || "No address saved"}</p>
              </div>
            </div>
          </div>
        </SectionCard>

        {/* Stats */}
        <div className="col-span-8 grid grid-cols-4 gap-4">
          <KpiCard tone="sky" title="Total Spent" value={`LKR ${stats.totalSpent.toLocaleString()}`} icon={<ShoppingBag size={18} />} />
          <KpiCard tone="rose" title="Pending" value={`LKR ${stats.pendingPayments.toLocaleString()}`} hint="Unpaid repairs" icon={<AlertTriangle size={18} />} />
          <KpiCard tone="indigo" title="Total Visits" value={String(stats.salesCount)} hint="Sales invoices" icon={<Calendar size={18} />} />
          <KpiCard tone="amber" title="Repairs" value={String(stats.repairsCount)} hint="Device services" icon={<Wrench size={18} />} />
        </div>

        {/* History Tabs/Lists */}
        <SectionCard title="Purchase History" className="col-span-12">
          <Table className="table-base">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Date</th>
                <th>Items</th>
                <th className="text-right">Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customerSales.map(s => (
                <tr key={s.id}>
                  <td className="font-bold text-sky-400">{s.invoice_no}</td>
                  <td className="text-slate-400 text-xs">{new Date(s.created_at).toLocaleDateString()}</td>
                  <td className="text-xs">
                    {s.lines?.length || 0} items
                  </td>
                  <td className="text-right font-semibold">LKR {s.total.toLocaleString()}</td>
                  <td>
                    <Badge tone={s.is_return ? "red" : "green"}>{s.is_return ? "Return" : "Paid"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {customerSales.length === 0 && <p className="text-center py-10 text-slate-500 italic">No purchase history found</p>}
        </SectionCard>

        <SectionCard title="Repair History" className="col-span-12">
          <Table className="table-base">
            <thead>
              <tr>
                <th>Ticket</th>
                <th>Device</th>
                <th>Issue</th>
                <th>Date</th>
                <th>Status</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {customerRepairs.map(r => (
                <tr key={r.id}>
                  <td className="font-bold text-amber-400">{r.ticket_no}</td>
                  <td>{r.device_model}</td>
                  <td className="text-xs max-w-xs truncate">{r.issue}</td>
                  <td className="text-slate-400 text-xs">{new Date(r.created_at).toLocaleDateString()}</td>
                  <td>
                    <Badge tone={r.status === "Delivered" ? "green" : "amber"}>{r.status}</Badge>
                  </td>
                  <td className="text-right font-semibold">LKR {r.estimated_cost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          {customerRepairs.length === 0 && <p className="text-center py-10 text-slate-500 italic">No repair history found</p>}
        </SectionCard>
      </div>
    </div>
  );
}
