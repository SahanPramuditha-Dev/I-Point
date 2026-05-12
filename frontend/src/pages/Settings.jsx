import { useEffect, useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Select } from "../components/UI";
import { FileText, MoonStar, Palette, Printer, Users } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

const defaultProfile = {
  format: "A4",
  store_name: "i Store",
  store_address: "",
  store_phone: "",
  footer_note: "Thank you. Visit again.",
  show_logo: false,
  margin_mm: 10,
  accent_color: "#0ea5e9",
};

const defaultUi = { theme: "dark", compact_mode: false };

export default function Settings() {
  const { toast, confirm } = useFeedback();
  const { data, loading, error, setData } = useFetch("/settings/employees");
  const [profile, setProfile] = useState(defaultProfile);
  const [uiPrefs, setUiPrefs] = useState(defaultUi);
  const [saved, setSaved] = useState("");
  const [employeeForm, setEmployeeForm] = useState({ username: "", full_name: "", password: "", role: "employee" });

  useEffect(() => {
    api.get("/settings/print-profile").then((res) => setProfile({ ...defaultProfile, ...res.data }));
    api.get("/settings/ui-preferences").then((res) => setUiPrefs({ ...defaultUi, ...res.data }));
  }, []);

  const saveProfile = async () => {
    await api.put("/settings/print-profile", profile);
    setSaved("Print profile saved");
    setTimeout(() => setSaved(""), 1800);
  };

  const saveUiPrefs = async () => {
    await api.put("/settings/ui-preferences", uiPrefs);
    localStorage.setItem("theme", uiPrefs.theme);
    document.documentElement.classList.toggle("dark", uiPrefs.theme === "dark");
    setSaved("UI preferences saved");
    setTimeout(() => setSaved(""), 1800);
  };

  const createEmployee = async () => {
    if (!employeeForm.username || !employeeForm.full_name || !employeeForm.password) {
      toast("Username, full name, and password are required", "warning");
      return;
    }
    const { data: row } = await api.post("/settings/employees", employeeForm);
    setData([...(data || []), row]);
    setEmployeeForm({ username: "", full_name: "", password: "", role: "employee" });
  };

  const toggleEmployee = async (employee) => {
    const { data: row } = await api.put(`/settings/employees/${employee.id}`, {
      is_active: !employee.is_active,
    });
    setData((data || []).map((e) => (e.id === employee.id ? row : e)));
  };

  const deleteEmployee = async (employee) => {
    const ok = await confirm("Delete Employee", `Delete ${employee.full_name}?`);
    if (!ok) return;
    await api.delete(`/settings/employees/${employee.id}`);
    setData((data || []).filter((e) => e.id !== employee.id));
  };

  const employees = data || [];
  const staffCount = useMemo(() => employees.length, [employees]);
  const activeCount = useMemo(() => employees.filter((e) => e.is_active).length, [employees]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading settings...</div>;
  }
  if (error) {
    return <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">{error}</div>;
  }

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" subtitle="Store profile, UI preferences, and employees" />

      <div className="grid grid-cols-12 gap-3">
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="indigo" title="Team" value={String(staffCount)} hint="Employees" icon={<Users size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="green" title="Active" value={String(activeCount)} hint="Enabled accounts" icon={<Users size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="sky" title="Invoice format" value={profile.format} hint="A4 / thermal" icon={<FileText size={18} />} />
        <KpiCard className="col-span-12 sm:col-span-6 xl:col-span-3" tone="violet" title="Theme" value={uiPrefs.theme} hint="App appearance" icon={<MoonStar size={18} />} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Employee management" className="col-span-12 lg:col-span-5">
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Input placeholder="Username" value={employeeForm.username} onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })} />
            <Input placeholder="Full name" value={employeeForm.full_name} onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })} />
            <Input type="password" placeholder="Password" value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} />
            <Select value={employeeForm.role} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}>
              <option value="employee">employee</option>
              <option value="admin">admin</option>
            </Select>
          </div>
          <Button className="w-full mb-3" onClick={createEmployee}>Add Employee</Button>

          <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
            {employees.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-semibold truncate">{e.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{e.username} - {e.role}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={e.is_active ? "green" : "slate"}>{e.is_active ? "Active" : "Disabled"}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => toggleEmployee(e)}>{e.is_active ? "Disable" : "Enable"}</Button>
                  <Button size="sm" variant="danger" onClick={() => deleteEmployee(e)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Store & print profile" className="col-span-12 lg:col-span-7 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select value={profile.format} onChange={(e) => setProfile({ ...profile, format: e.target.value })}>
              <option value="A4">A4 invoice</option>
              <option value="80MM">Thermal 80mm</option>
              <option value="58MM">Thermal 58mm</option>
            </Select>
            <Input placeholder="Store name" value={profile.store_name} onChange={(e) => setProfile({ ...profile, store_name: e.target.value })} />
            <Input placeholder="Store phone" value={profile.store_phone} onChange={(e) => setProfile({ ...profile, store_phone: e.target.value })} />
            <Input placeholder="Store address" value={profile.store_address} onChange={(e) => setProfile({ ...profile, store_address: e.target.value })} />
          </div>
          <Input placeholder="Footer note" value={profile.footer_note} onChange={(e) => setProfile({ ...profile, footer_note: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Margin (mm)" value={profile.margin_mm} onChange={(e) => setProfile({ ...profile, margin_mm: Number(e.target.value) })} />
            <input type="color" className="w-full p-2 rounded-xl bg-white/10 h-11 border border-white/10" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={profile.show_logo} onChange={(e) => setProfile({ ...profile, show_logo: e.target.checked })} />
            Show logo area on invoices
          </label>
          <Button onClick={saveProfile} className="inline-flex items-center gap-2"><Printer size={16} /> Save print settings</Button>
        </SectionCard>
      </div>

      <SectionCard title="UI preferences" right={<Palette size={16} className="text-slate-400" />}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div>
            <p className="text-[10px] text-slate-400 mb-1 uppercase tracking-wider">Theme</p>
            <Select value={uiPrefs.theme} onChange={(e) => setUiPrefs({ ...uiPrefs, theme: e.target.value })}>
              <option value="dark">dark</option>
              <option value="light">light</option>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input type="checkbox" checked={uiPrefs.compact_mode} onChange={(e) => setUiPrefs({ ...uiPrefs, compact_mode: e.target.checked })} />
            Compact mode
          </label>
          <Button onClick={saveUiPrefs}>Save UI preferences</Button>
        </div>
      </SectionCard>

      {saved && <p className="text-emerald-300 text-sm font-medium">{saved}</p>}
    </div>
  );
}
