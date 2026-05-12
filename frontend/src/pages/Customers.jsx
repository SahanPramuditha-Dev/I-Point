import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { Mail, Phone, Users } from "lucide-react";

export default function Customers() {
  const { data, setData } = useFetch("/customers");
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });
  const count = (data || []).length;

  const add = async () => {
    const r = await api.post("/customers", form);
    setData([...(data || []), r.data]);
    setForm({ name: "", phone: "", email: "", address: "" });
  };

  const withEmail = useMemo(
    () => (data || []).filter((c) => c.email && String(c.email).trim()).length,
    [data]
  );
  const withPhone = useMemo(
    () => (data || []).filter((c) => c.phone && String(c.phone).trim()).length,
    [data]
  );

  return (
    <div className="space-y-4">
      <PageTitle title="Customers" subtitle="Manage profiles and view service history" />

      <div className="grid grid-cols-12 gap-3">
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="sky"
          title="Directory"
          value={String(count)}
          hint="Total customers"
          icon={<Users size={18} />}
        />
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="indigo"
          title="With email"
          value={String(withEmail)}
          hint="Marketing-ready"
          icon={<Mail size={18} />}
        />
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="green"
          title="With phone"
          value={String(withPhone)}
          hint="Callable contacts"
          icon={<Phone size={18} />}
        />
      </div>

      <SectionCard title="Add customer">
        <div className="grid grid-cols-12 gap-3">
          <div className="col-span-12 md:col-span-3">
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Name</p>
            <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Phone</p>
            <Input placeholder="07x…" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="col-span-12 md:col-span-3">
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Email</p>
            <Input type="email" placeholder="email@…" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="col-span-12 md:col-span-2">
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Address</p>
            <Input placeholder="City / area" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="col-span-12 md:col-span-1 flex items-end">
            <Button className="w-full h-[42px]" onClick={add}>
              Add
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Customer directory" right={<Badge tone="sky">{count} total</Badge>} className="overflow-auto">
        <Table className="table-base min-w-[560px]">
          <thead>
            <tr>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((c) => (
              <tr key={c.id}>
                <td className="font-medium text-white">{c.name}</td>
                <td className="text-slate-300">
                  <span className="inline-flex items-center gap-1">
                    <Phone size={12} className="text-slate-500 shrink-0" />
                    {c.phone || "—"}
                  </span>
                </td>
                <td className="text-slate-400">{c.email || "—"}</td>
                <td className="text-right">
                  <NavLink to={`/customers/${c.id}`} className="btn btn-secondary btn-sm px-3 py-1">
                    View Profile
                  </NavLink>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </SectionCard>

    </div>
  );
}
