import { useEffect, useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, KpiCard } from "../components/UI";
import { FileText, MoonStar, Palette, Printer, Users, Settings as SettingsIcon, ShieldAlert, KeyRound, MonitorSmartphone, BriefcaseBusiness, MessageCircleHeart, UploadCloud, Save } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

const defaultProfile = {
  format: "A4",
  store_name: "i Store",
  store_address: "",
  store_phone: "",
  footer_note: "Thank you. Visit again.",
  show_logo: false,
  logo_data: "",
  margin_mm: 10,
  accent_color: "#0ea5e9",
  repair_terms: "1. Minimum diagnostic fee applies.\n2. Not responsible for data loss.",
  label_width: 50,
  label_height: 25,
  slogan: "Your No.01 IT Partner",
  bank_details: "1000526309 - Commercial bank",
  show_curves: true,
  show_slogan: true,
  show_bank_details: true,
  show_table_borders: true,
  show_tax_column: true,
  return_policy: "1. Items can be returned within 7 days with original receipt.\n2. No cash refunds.",
  show_return_policy: true,
};

const defaultUi = { theme: "dark", compact_mode: false };
const defaultBusiness = { currency: "LKR", tax_rate: 0, date_format: "DD/MM/YYYY" };
const defaultIntegrations = { whatsapp_api_key: "", whatsapp_phone_number_id: "", enable_sms_alerts: false };

export default function Settings() {
  const { toast, confirm } = useFeedback();
  const { data, loading, error, setData } = useFetch("/settings/employees");
  const [profile, setProfile] = useState(defaultProfile);
  const [uiPrefs, setUiPrefs] = useState(defaultUi);
  const [businessPrefs, setBusinessPrefs] = useState(defaultBusiness);
  const [integrations, setIntegrations] = useState(defaultIntegrations);
  const [employeeForm, setEmployeeForm] = useState({ username: "", full_name: "", password: "", role: "employee" });
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [editForm, setEditForm] = useState({ username: "", full_name: "", password: "", role: "employee" });
  const [activeTab, setActiveTab] = useState("staffing");
  const [previewType, setPreviewType] = useState("sale"); // sale, repair, label
  const [subSection, setSubSection] = useState("brand");

  const Toggle = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 cursor-pointer group">
      <div 
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-all relative ${checked ? 'bg-sky-600' : 'bg-slate-700'}`}
      >
        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${checked ? 'left-6' : 'left-1'}`} />
      </div>
      {label && <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest group-hover:text-slate-300 transition-colors">{label}</span>}
    </label>
  );

  useEffect(() => {
    api.get("/settings/print-profile").then((res) => setProfile({ ...defaultProfile, ...res.data }));
    api.get("/settings/ui-preferences").then((res) => setUiPrefs({ ...defaultUi, ...res.data }));
    api.get("/settings/business-preferences").then((res) => setBusinessPrefs({ ...defaultBusiness, ...res.data }));
    api.get("/settings/integrations").then((res) => setIntegrations({ ...defaultIntegrations, ...res.data }));
  }, []);

  const saveProfile = async () => {
    await api.put("/settings/print-profile", profile);
    toast("Print profile updated successfully", "success");
  };

  const saveUiPrefs = async () => {
    await api.put("/settings/ui-preferences", uiPrefs);
    localStorage.setItem("theme", uiPrefs.theme);
    document.documentElement.classList.toggle("dark", uiPrefs.theme === "dark");
    toast("UI Preferences saved", "success");
  };

  const saveBusinessPrefs = async () => {
    await api.put("/settings/business-preferences", businessPrefs);
    toast("Business Preferences saved", "success");
  };

  const saveIntegrations = async () => {
    await api.put("/settings/integrations", integrations);
    toast("API Integrations saved successfully", "success");
  };

  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast("Logo file must be smaller than 2MB", "warning");
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      setProfile(prev => ({ ...prev, logo_data: ev.target.result }));
    };
    reader.readAsDataURL(file);
  };

  const createEmployee = async () => {
    if (!employeeForm.username || !employeeForm.full_name || !employeeForm.password) {
      toast("Username, full name, and password are required", "warning");
      return;
    }
    try {
      const { data: row } = await api.post("/settings/employees", employeeForm);
      setData([...(data || []), row]);
      setEmployeeForm({ username: "", full_name: "", password: "", role: "employee" });
      toast("Employee account created", "success");
    } catch(e) {
      toast("Failed to create employee", "error");
    }
  };

  const toggleEmployee = async (employee) => {
    const { data: row } = await api.put(`/settings/employees/${employee.id}`, {
      is_active: !employee.is_active,
    });
    setData((data || []).map((e) => (e.id === employee.id ? row : e)));
    toast(`Account ${row.is_active ? 'enabled' : 'disabled'}`, "info");
  };

  const openEdit = (employee) => {
    setEditingEmployee(employee);
    setEditForm({
      username: employee.username,
      full_name: employee.full_name,
      password: "", // empty so it won't update unless typed
      role: employee.role,
    });
  };

  const saveEditEmployee = async () => {
    if (!editForm.full_name) return toast("Full name is required", "warning");
    const payload = { 
      full_name: editForm.full_name, 
      role: editForm.role 
    };
    if (editForm.password) payload.password = editForm.password;
    
    try {
      const { data: row } = await api.put(`/settings/employees/${editingEmployee.id}`, payload);
      setData((data || []).map(e => e.id === editingEmployee.id ? row : e));
      setEditingEmployee(null);
      toast("Employee account updated", "success");
    } catch(e) {
      toast("Failed to update employee", "error");
    }
  };

  const deleteEmployee = async (employee) => {
    const ok = await confirm("Delete Employee", `Are you sure you want to permanently delete ${employee.full_name}?`);
    if (!ok) return;
    await api.delete(`/settings/employees/${employee.id}`);
    setData((data || []).filter((e) => e.id !== employee.id));
    toast("Employee deleted", "success");
  };

  const employees = data || [];
  const staffCount = useMemo(() => employees.length, [employees]);
  const activeCount = useMemo(() => employees.filter((e) => e.is_active).length, [employees]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading system settings...</div>;
  if (error) return <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200">{error}</div>;

  return (
    <div className="flex flex-col h-full gap-6 pb-4">
      {/* HEADER SECTION */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
             <SettingsIcon className="text-slate-400"/> System Configuration
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage users, store details, and terminal preferences</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 shrink-0">
        <KpiCard tone="indigo" title="Total Staff" value={String(staffCount)} icon={<Users size={18} />} />
        <KpiCard tone="green" title="Active Logins" value={String(activeCount)} icon={<ShieldAlert size={18} />} />
        <KpiCard tone="sky" title="Receipt Format" value={profile.format} icon={<FileText size={18} />} />
        <KpiCard tone="violet" title="Terminal Theme" value={uiPrefs.theme} icon={<MoonStar size={18} />} />
      </div>

      <div className="flex items-center gap-2 border-b border-white/5 pb-2 shrink-0 overflow-x-auto custom-scrollbar">
        {[
          { id: "staffing", label: "Access Control", icon: Users },
          { id: "operations", label: "Business Operations", icon: BriefcaseBusiness },
          { id: "pos", label: "POS & Print", icon: Printer },
          { id: "system", label: "System & APIs", icon: SettingsIcon },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)} 
            className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            <tab.icon size={14} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 pr-2 pb-8">
        <div className="flex flex-col gap-6 max-w-4xl">
          
          {activeTab === "staffing" && (
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col">
              <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-6">
                <KeyRound size={16} className="text-indigo-400"/> Access Control
              </h2>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <input className="field" placeholder="Username" value={employeeForm.username} onChange={(e) => setEmployeeForm({ ...employeeForm, username: e.target.value })} />
                <input className="field" placeholder="Full name" value={employeeForm.full_name} onChange={(e) => setEmployeeForm({ ...employeeForm, full_name: e.target.value })} />
                <input className="field" type="password" placeholder="Password" value={employeeForm.password} onChange={(e) => setEmployeeForm({ ...employeeForm, password: e.target.value })} />
                <select className="field" value={employeeForm.role} onChange={(e) => setEmployeeForm({ ...employeeForm, role: e.target.value })}>
                  <option value="employee">Cashier / Staff</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <button className="w-full py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 transition-all mb-6" onClick={createEmployee}>Provision Account</button>
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3">Active Directory</h3>
              <div className="space-y-2 flex-1 overflow-y-auto custom-scrollbar max-h-[350px]">
                {employees.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors">
                    <div>
                      <p className="font-black text-slate-200 text-sm flex items-center gap-2">
                        {e.full_name} {e.role === 'admin' && <Badge tone="amber" className="text-[8px] px-1.5 py-0">ADMIN</Badge>}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">@{e.username}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button onClick={() => toggleEmployee(e)} className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${e.is_active ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-slate-500/30 text-slate-400 bg-slate-500/10'}`}>
                        {e.is_active ? "Enabled" : "Disabled"}
                      </button>
                      <div className="flex gap-3 mt-1">
                        <button onClick={() => openEdit(e)} className="text-[10px] font-bold text-sky-400 hover:text-sky-300 transition-colors">Edit</button>
                        <button onClick={() => deleteEmployee(e)} className="text-[10px] font-bold text-rose-500 hover:text-rose-400 transition-colors">Revoke</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "operations" && (
            <div className="bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-3xl p-6 shadow-2xl">
              <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2 mb-6">
                <BriefcaseBusiness size={16} className="text-emerald-400"/> Business Operations
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Base Currency Symbol</label>
                  <input className="field" value={businessPrefs.currency} onChange={(e) => setBusinessPrefs({ ...businessPrefs, currency: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Global Tax Rate (%)</label>
                  <input type="number" step="0.1" className="field" value={businessPrefs.tax_rate} onChange={(e) => setBusinessPrefs({ ...businessPrefs, tax_rate: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Date Format</label>
                  <select className="field" value={businessPrefs.date_format} onChange={(e) => setBusinessPrefs({ ...businessPrefs, date_format: e.target.value })}>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={saveBusinessPrefs} className="px-6 py-2.5 rounded-xl font-bold text-emerald-300 border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                  Update Operations
                </button>
              </div>
            </div>
          )}

          {activeTab === "pos" && (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 animate-in fade-in duration-500">
              {/* SETTINGS PANEL (Invoice Builder) */}
              <div className="xl:col-span-6 2xl:col-span-5 flex flex-col h-[780px] bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                {/* Panel Header */}
                <div className="p-6 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-white flex items-center gap-2">
                      <Palette size={18} className="text-sky-400"/> Invoice Designer
                    </h2>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter mt-1">Real-time template architect</p>
                  </div>
                  <button onClick={saveProfile} className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-sky-900/40 transition-all flex items-center gap-2">
                    <Save size={14} /> Deploy
                  </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Section Selector Sidebar */}
                  <div className="w-16 border-r border-white/5 flex flex-col items-center py-6 gap-6 bg-black/20">
                    {[
                      { id: 'brand', icon: Palette, label: 'Brand' },
                      { id: 'contact', icon: BriefcaseBusiness, label: 'Legal' },
                      { id: 'header', icon: FileText, label: 'Header' },
                      { id: 'device', icon: MonitorSmartphone, label: 'Device' },
                      { id: 'table', icon: Printer, label: 'Table' },
                      { id: 'footer', icon: MessageCircleHeart, label: 'Policy' },
                    ].map(s => (
                      <button 
                        key={s.id}
                        onClick={() => setSubSection(s.id)}
                        className={`p-3 rounded-2xl transition-all relative group ${subSection === s.id ? 'bg-sky-600 text-white shadow-lg shadow-sky-900/40 scale-110' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
                      >
                        <s.icon size={20} />
                        <span className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-[8px] font-black uppercase rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Settings Content Area */}
                  <div className="flex-1 p-8 overflow-y-auto custom-scrollbar bg-black/10">
                    
                    {/* 1. BRANDING SECTION */}
                    {subSection === 'brand' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Shop Branding</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Identity and visual style</p>
                        </div>
                        
                        <div className="space-y-5">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shop Name</label>
                            <input className="field focus:border-sky-500 transition-colors" value={profile.store_name} onChange={(e) => setProfile({ ...profile, store_name: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business Slogan</label>
                            <input className="field focus:border-sky-500 transition-colors" value={profile.slogan} onChange={(e) => setProfile({ ...profile, slogan: e.target.value })} />
                            <Toggle label="Visible on Invoice" checked={profile.show_slogan} onChange={(c) => setProfile({...profile, show_slogan: c})} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Accent Color</label>
                              <div className="flex gap-2">
                                <input type="color" className="w-10 h-10 bg-black/40 border border-white/10 rounded-xl p-1 cursor-pointer" value={profile.accent_color} onChange={(e) => setProfile({ ...profile, accent_color: e.target.value })} />
                                <input className="field text-[10px] font-mono h-10" value={profile.accent_color} onChange={(e) => setProfile({...profile, accent_color: e.target.value})} />
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Typography</label>
                              <select className="field h-10" value={profile.font_family} onChange={(e) => setProfile({ ...profile, font_family: e.target.value })}>
                                <option value="Inter">Inter (Classic)</option>
                                <option value="Outfit">Outfit (Premium)</option>
                                <option value="Roboto Mono">Code Mono</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-3 pt-4 bg-white/[0.03] p-4 rounded-3xl border border-white/5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Brand Logo</label>
                            <div className="flex items-center gap-6">
                              <div className="w-20 h-20 bg-black/60 border border-white/10 rounded-2xl flex items-center justify-center overflow-hidden shadow-inner">
                                {profile.logo_data ? <img src={profile.logo_data} className="w-full h-full object-contain" /> : <Printer size={24} className="text-white/10" />}
                              </div>
                              <div className="flex flex-col gap-2">
                                <label className="cursor-pointer px-4 py-2 bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 rounded-xl text-[10px] font-black text-sky-400 transition-all uppercase tracking-widest text-center">
                                  Upload New
                                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                                </label>
                                <Toggle label="Show Logo" checked={profile.show_logo} onChange={(c) => setProfile({...profile, show_logo: c})} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 2. CONTACT SECTION */}
                    {subSection === 'contact' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Contact & Legal</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Business details and registration</p>
                        </div>
                        <div className="space-y-5">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Shop Address</label>
                            <textarea className="field min-h-[80px]" value={profile.store_address} onChange={(e) => setProfile({ ...profile, store_address: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Phone</label>
                              <input className="field" value={profile.store_phone} onChange={(e) => setProfile({ ...profile, store_phone: e.target.value })} />
                              <Toggle label="Visible" checked={profile.show_shop_phone} onChange={(c) => setProfile({...profile, show_shop_phone: c})} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email</label>
                              <input className="field" value={profile.store_email} onChange={(e) => setProfile({ ...profile, store_email: e.target.value })} />
                              <Toggle label="Visible" checked={profile.show_shop_email} onChange={(c) => setProfile({...profile, show_shop_email: c})} />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/5">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tax/VAT Number</label>
                              <input className="field" value={profile.tax_number} onChange={(e) => setProfile({ ...profile, tax_number: e.target.value })} />
                              <Toggle label="Show VAT" checked={profile.show_tax_no} onChange={(c) => setProfile({...profile, show_tax_no: c})} />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Business Reg No</label>
                              <input className="field" value={profile.business_reg_no} onChange={(e) => setProfile({ ...profile, business_reg_no: e.target.value })} />
                              <Toggle label="Show BR" checked={profile.show_reg_no} onChange={(c) => setProfile({...profile, show_reg_no: c})} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 3. HEADER SECTION */}
                    {subSection === 'header' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Document Header</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Metadata and layout features</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            { id: 'show_invoice_date', label: 'Show Document Date', icon: FileText },
                            { id: 'show_invoice_time', label: 'Show Time of Issuance', icon: FileText },
                            { id: 'show_cashier_name', label: 'Display Cashier Name', icon: Users },
                            { id: 'show_technician_name', label: 'Display Technician Name', icon: ShieldAlert },
                            { id: 'show_qr_code', label: 'Generate Document QR', icon: ShieldAlert },
                            { id: 'show_curves', label: 'Premium Header Curves', icon: Palette },
                          ].map(el => (
                            <div key={el.id} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                              <div className="flex items-center gap-3">
                                <el.icon size={16} className="text-slate-500" />
                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{el.label}</span>
                              </div>
                              <Toggle checked={profile[el.id]} onChange={(c) => setProfile({ ...profile, [el.id]: c })} />
                            </div>
                          ))}
                        </div>
                        <div className="pt-4">
                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Print Margin (mm)</label>
                          <input type="number" className="field w-24" value={profile.margin_mm} onChange={(e) => setProfile({ ...profile, margin_mm: Number(e.target.value) })} />
                        </div>
                      </div>
                    )}

                    {/* 4. DEVICE SECTION */}
                    {subSection === 'device' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Device & Client</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Repair specific device tracking</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            { id: 'show_customer_address', label: 'Client Physical Address' },
                            { id: 'show_customer_phone', label: 'Client Contact Number' },
                            { id: 'show_device_imei', label: 'Device IMEI Tracking' },
                            { id: 'show_device_color', label: 'Device Physical Color' },
                            { id: 'show_device_condition', label: 'Pre-repair Condition' },
                            { id: 'show_device_accessories', label: 'Included Accessories' },
                          ].map(el => (
                            <div key={el.id} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{el.label}</span>
                              <Toggle checked={profile[el.id]} onChange={(c) => setProfile({ ...profile, [el.id]: c })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 5. TABLE SECTION */}
                    {subSection === 'table' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Line Items Table</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Column management and borders</p>
                        </div>
                        <div className="grid grid-cols-1 gap-3">
                          {[
                            { id: 'show_sku_column', label: 'Product SKU Column' },
                            { id: 'show_warranty_column', label: 'Warranty Period Column' },
                            { id: 'show_discount_column', label: 'Discount Amount Column' },
                            { id: 'show_tax_column', label: 'Tax/VAT Detail Column' },
                            { id: 'show_table_borders', label: 'Enable Grid Border Lines' },
                          ].map(el => (
                            <div key={el.id} className="flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border border-white/5">
                              <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">{el.label}</span>
                              <Toggle checked={profile[el.id]} onChange={(c) => setProfile({ ...profile, [el.id]: c })} />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 6. POLICY SECTION */}
                    {subSection === 'footer' && (
                      <div className="space-y-8 animate-in slide-in-from-right-4">
                        <div className="space-y-1">
                          <h3 className="text-xs font-black text-white uppercase tracking-widest">Policies & Payment</h3>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">Terms, conditions and summary</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-6">
                          {[
                            { id: 'show_advance_payment', label: 'Advance Paid' },
                            { id: 'show_remaining_balance', label: 'Due Balance' },
                            { id: 'show_bank_details', label: 'Bank Details' },
                            { id: 'show_return_policy', label: 'Return Policy' },
                            { id: 'show_warranty_terms', label: 'Terms & Cond.' },
                            { id: 'show_signatures', label: 'Signature Fields' },
                          ].map(el => (
                            <div key={el.id} className="flex items-center justify-between p-3 bg-white/[0.03] rounded-2xl border border-white/5">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{el.label}</span>
                              <Toggle checked={profile[el.id]} onChange={(c) => setProfile({ ...profile, [el.id]: c })} />
                            </div>
                          ))}
                        </div>
                        <div className="space-y-5">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Settlement Info (Bank)</label>
                            <textarea className="field min-h-[60px]" value={profile.bank_details} onChange={(e) => setProfile({ ...profile, bank_details: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Return & Exchange Policy</label>
                            <textarea className="field min-h-[80px]" value={profile.return_policy} onChange={(e) => setProfile({ ...profile, return_policy: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Warranty Coverage Terms</label>
                            <textarea className="field min-h-[60px]" value={profile.warranty_terms} onChange={(e) => setProfile({ ...profile, warranty_terms: e.target.value })} />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Footer Note</label>
                            <input className="field" value={profile.footer_note} onChange={(e) => setProfile({ ...profile, footer_note: e.target.value })} />
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              </div>

              {/* LIVE BUILDER PREVIEW */}
              <div className="xl:col-span-6 2xl:col-span-7 flex flex-col gap-6">
                <div className="bg-slate-900/20 backdrop-blur-sm border border-white/5 rounded-[2.5rem] p-8 flex flex-col items-center justify-start h-[780px] overflow-y-auto custom-scrollbar relative shadow-inner">
                  {/* PREVIEW TOOLBAR */}
                  <div className="flex justify-between items-center w-full mb-10 z-10 shrink-0">
                    <div className="flex gap-2 bg-black/40 p-1.5 rounded-3xl border border-white/5 backdrop-blur-md">
                      <button onClick={() => setPreviewType('sale')} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${previewType === 'sale' ? 'bg-sky-600 text-white shadow-xl shadow-sky-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Sales Bill</button>
                      <button onClick={() => setPreviewType('repair')} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${previewType === 'repair' ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Job Card</button>
                      <button onClick={() => setPreviewType('label')} className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all ${previewType === 'label' ? 'bg-emerald-600 text-white shadow-xl shadow-emerald-900/40' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>Labels</button>
                    </div>

                    <div className="flex gap-4 items-center">
                      <select className="bg-black/50 border border-white/5 rounded-2xl px-5 py-2.5 text-[10px] font-black text-white outline-none focus:border-sky-500 transition-all cursor-pointer" value={profile.format} onChange={(e) => setProfile({...profile, format: e.target.value})}>
                        <option value="A4">A4 Office Standard</option>
                        <option value="80MM">Thermal 80mm Roll</option>
                        <option value="58MM">Thermal 58mm Roll</option>
                      </select>
                    </div>
                  </div>
                  
                  {previewType === 'label' ? (
                    <div className="animate-in zoom-in-95 duration-300">
                      <div className="bg-white text-black shadow-2xl relative overflow-hidden flex flex-col items-center justify-center border border-slate-300" style={{ width: `${profile.label_width * 4}px`, height: `${profile.label_height * 4}px`, fontFamily: profile.font_family }}>
                         <p className="text-[10px] font-black text-center leading-none mb-1">{profile.store_name}</p>
                         <div className="w-[85%] h-[45%] bg-slate-800 flex items-center justify-center text-white text-[8px] tracking-[0.2em]">|||||||||||||||||</div>
                         <p className="text-[9px] font-black text-center leading-none mt-1">Rs 1,500.00</p>
                      </div>
                    </div>
                  ) : (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full flex justify-center">
                      <div 
                        className="bg-white text-black shadow-2xl relative overflow-hidden transition-all duration-300 flex flex-col origin-top"
                        style={{ 
                          width: profile.format === 'A4' ? '100%' : profile.format === '80MM' ? '300px' : '220px',
                          maxWidth: profile.format === 'A4' ? '600px' : '300px',
                          minHeight: profile.format === 'A4' ? '400px' : 'auto',
                          aspectRatio: profile.format === 'A4' ? '1 / 1.414' : 'auto',
                          fontFamily: profile.font_family 
                        }}
                      >
                         {/* A4 DYNAMIC BUILDER PREVIEW */}
                         {profile.format === 'A4' ? (
                           <div className="flex flex-col h-full relative" style={{ padding: `${profile.margin_mm}mm` }}>
                             {/* Header Background */}
                             {profile.show_curves && (
                               <div className="absolute top-0 right-0 w-[50%] h-[120px] opacity-[0.07] pointer-events-none" style={{ background: `linear-gradient(225deg, ${profile.accent_color} 0%, transparent 70%)`, borderRadius: '0 0 0 100%' }} />
                             )}

                             {/* SHOP INFO SECTION */}
                             <div className="flex justify-between items-start z-10 mb-6">
                               <div className="flex flex-col gap-1">
                                 {profile.show_logo && profile.logo_data && (
                                   <img src={profile.logo_data} alt="Logo" className="h-12 w-fit object-contain mb-2" />
                                 )}
                                 <h1 className="text-base font-black tracking-tight" style={{ color: profile.accent_color }}>{profile.store_name}</h1>
                                 {profile.show_slogan && <p className="text-[9px] font-bold text-slate-500 -mt-1 uppercase tracking-tighter">{profile.slogan}</p>}
                               </div>
                               <div className="flex flex-col items-end text-right">
                                 <p className="text-[8px] text-slate-500 max-w-[150px] leading-tight mb-1">{profile.store_address}</p>
                                 {profile.show_shop_phone && <p className="text-[8px] font-bold">{profile.store_phone}</p>}
                                 {profile.show_shop_email && <p className="text-[8px]">{profile.store_email}</p>}
                                 {profile.show_shop_website && <p className="text-[8px] italic">{profile.store_website}</p>}
                                 <div className="mt-1">
                                   {profile.show_tax_no && <p className="text-[7px] text-slate-400">VAT: {profile.tax_number}</p>}
                                   {profile.show_reg_no && <p className="text-[7px] text-slate-400">REG: {profile.business_reg_no}</p>}
                                 </div>
                               </div>
                             </div>

                             {/* DOCUMENT METADATA */}
                             <div className="flex justify-between items-end mb-6 z-10">
                               <div>
                                 <h2 className="text-lg font-black tracking-widest text-slate-300 mb-2 uppercase">{previewType === 'repair' ? 'JOB CARD' : 'TAX INVOICE'}</h2>
                                 <div className="text-[8px] space-y-0.5">
                                   <p><span className="font-bold">INVOICE NO:</span> #INV-887261</p>
                                   {previewType === 'repair' && <p><span className="font-bold">REPAIR ID:</span> #JOB-2291</p>}
                                   {profile.show_invoice_date && <p><span className="font-bold">DATE:</span> 04/11/2026</p>}
                                   {profile.show_invoice_time && <p><span className="font-bold">TIME:</span> 10:30 AM</p>}
                                 </div>
                               </div>
                               <div className="text-right">
                                 {profile.show_qr_code && (
                                   <div className="w-12 h-12 bg-slate-100 flex items-center justify-center text-[6px] border border-slate-200">QR CODE</div>
                                 )}
                               </div>
                             </div>

                             {/* CUSTOMER SECTION */}
                             <div className="grid grid-cols-2 gap-8 mb-6 z-10 border-t border-b border-slate-100 py-3">
                               <div>
                                 <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Bill To</p>
                                 <p className="text-[9px] font-bold">Johnathan Doe</p>
                                 {profile.show_customer_phone && <p className="text-[8px]">+94 71 882 9901</p>}
                                 {profile.show_customer_address && <p className="text-[8px] text-slate-500">12/A, Park Avenue, Nugegoda</p>}
                               </div>
                               <div className="text-right">
                                 {previewType === 'repair' && (
                                   <>
                                     <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Device Details</p>
                                     <p className="text-[9px] font-bold">iPhone 14 Pro Max</p>
                                     <div className="text-[8px] space-y-0.5 mt-1">
                                       {profile.show_device_imei && <p><span className="font-bold">IMEI:</span> 356672188277212</p>}
                                       {profile.show_device_color && <p><span className="font-bold">COLOR:</span> Space Black</p>}
                                       {profile.show_device_condition && <p><span className="font-bold">CONDITION:</span> Scratches on screen</p>}
                                       {profile.show_device_accessories && <p><span className="font-bold">ACC:</span> Original Box, Cable</p>}
                                     </div>
                                   </>
                                 )}
                               </div>
                             </div>

                             {/* MAIN TABLE */}
                             <div className="flex-1 z-10">
                               <table className={`w-full text-[8px] border-collapse ${profile.show_table_borders ? 'border border-slate-200' : ''}`}>
                                 <thead>
                                   <tr className="text-white" style={{ backgroundColor: profile.accent_color }}>
                                     <th className="p-2 text-left">DESCRIPTION</th>
                                     {profile.show_sku_column && <th className="p-2 text-center">SKU</th>}
                                     <th className="p-2 text-center">QTY</th>
                                     <th className="p-2 text-right">UNIT PRICE</th>
                                     {profile.show_discount_column && <th className="p-2 text-right">DISC</th>}
                                     {profile.show_tax_column && <th className="p-2 text-right">TAX</th>}
                                     {profile.show_warranty_column && <th className="p-2 text-center">WARRANTY</th>}
                                     <th className="p-2 text-right">TOTAL</th>
                                   </tr>
                                 </thead>
                                 <tbody>
                                   <tr className="border-b border-slate-100">
                                     <td className="p-2 font-bold">Display Assembly Replacement<br/><span className="text-[7px] font-normal text-slate-400">Genuine OLED Original Quality</span></td>
                                     {profile.show_sku_column && <td className="p-2 text-center">P-8821</td>}
                                     <td className="p-2 text-center">1.00</td>
                                     <td className="p-2 text-right">45,000.00</td>
                                     {profile.show_discount_column && <td className="p-2 text-right">5,000.00</td>}
                                     {profile.show_tax_column && <td className="p-2 text-right">0.00</td>}
                                     {profile.show_warranty_column && <td className="p-2 text-center">90 Days</td>}
                                     <td className="p-2 text-right font-black">40,000.00</td>
                                   </tr>
                                 </tbody>
                               </table>

                               <div className="flex justify-between items-start mt-6">
                                 {/* FOOTER LEFT */}
                                 <div className="max-w-[60%] space-y-4">
                                   {profile.show_bank_details && (
                                     <div>
                                       <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Info</p>
                                       <p className="text-[8px] text-slate-600 whitespace-pre-wrap">{profile.bank_details}</p>
                                     </div>
                                   )}
                                   {profile.show_return_policy && (
                                     <div>
                                       <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Return Policy</p>
                                       <p className="text-[8px] text-slate-600 whitespace-pre-wrap leading-tight">{profile.return_policy}</p>
                                     </div>
                                   )}
                                   {profile.show_warranty_terms && (
                                     <div>
                                       <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mb-1">Warranty Terms</p>
                                       <p className="text-[8px] text-slate-600 whitespace-pre-wrap leading-tight">{profile.warranty_terms}</p>
                                     </div>
                                   )}
                                 </div>
                                 {/* FOOTER RIGHT (SUMMARY) */}
                                 <div className="w-40 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                   <div className="space-y-1 text-[8px]">
                                     <div className="flex justify-between"><span>Subtotal</span><span className="font-bold">45,000.00</span></div>
                                     <div className="flex justify-between text-rose-500"><span>Discount</span><span className="font-bold">-5,000.00</span></div>
                                     {profile.show_tax_column && <div className="flex justify-between"><span>Tax (VAT)</span><span className="font-bold">0.00</span></div>}
                                     <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-200" style={{ color: profile.accent_color }}>
                                       <span>TOTAL</span>
                                       <span>40,000.00</span>
                                     </div>
                                     {profile.show_advance_payment && <div className="flex justify-between text-emerald-600"><span>Advance</span><span className="font-bold">10,000.00</span></div>}
                                     {profile.show_remaining_balance && <div className="flex justify-between font-black text-slate-900 pt-1 border-t border-slate-200"><span>BALANCE</span><span>30,000.00</span></div>}
                                   </div>
                                 </div>
                               </div>
                             </div>

                             {/* SIGNATURES */}
                             {profile.show_signatures && (
                               <div className="flex justify-between mt-12 mb-6 z-10 px-4">
                                 <div className="flex flex-col items-center">
                                   <div className="w-24 border-b border-slate-300" />
                                   <p className="text-[7px] font-bold mt-1 uppercase text-slate-400">Customer Signature</p>
                                 </div>
                                 <div className="flex flex-col items-center">
                                   <div className="w-24 border-b border-slate-300" />
                                   <p className="text-[7px] font-bold mt-1 uppercase text-slate-400">Authorized Signatory</p>
                                 </div>
                               </div>
                             )}

                             {/* FOOTER NOTE */}
                             <div className="mt-auto text-center pt-4 z-10">
                               <p className="text-[8px] font-black italic text-slate-400">{profile.footer_note}</p>
                               <p className="text-[6px] text-slate-300 uppercase tracking-[0.3em] mt-1">Generated by i Store Industrial ERP</p>
                             </div>
                           </div>
                         ) : (
                           /* THERMAL LAYOUT PREVIEW (Dynamic) */
                           <div className="flex flex-col items-center text-center p-4 bg-white min-h-full" style={{ padding: `${profile.margin_mm}mm` }}>
                             {profile.show_logo && profile.logo_data && (
                               <img src={profile.logo_data} alt="Logo" className="h-10 w-fit object-contain mb-2" />
                             )}
                             <h1 className="text-sm font-black" style={{ color: profile.accent_color }}>{profile.store_name}</h1>
                             {profile.show_slogan && <p className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mb-1">{profile.slogan}</p>}
                             <p className="text-[7px] text-slate-600 whitespace-pre-wrap">{profile.store_address}</p>
                             {profile.show_shop_phone && <p className="text-[7px] font-bold mt-0.5">{profile.store_phone}</p>}
                             
                             <div className="w-full border-t border-dashed border-slate-300 my-2" />
                             
                             <div className="w-full text-[8px] text-left">
                               <div className="flex justify-between font-bold"><span>INV: #8872</span><span>04/11/26</span></div>
                               {profile.show_cashier_name && <p>Cashier: Sahan</p>}
                             </div>

                             <div className="w-full border-t border-slate-200 my-2" />
                             
                             <div className="w-full text-[8px] text-left">
                               <div className="flex justify-between font-black border-b border-slate-200 pb-1 mb-1 uppercase text-[7px] text-slate-400">
                                 <span>Item Description</span>
                                 <span>Price</span>
                               </div>
                               <div className="flex justify-between mb-1">
                                 <span className="max-w-[70%]">Display Assembly Replacement (OLED)</span>
                                 <span className="font-bold">40,000.00</span>
                                </div>
                                <div className="flex justify-between text-[7px] text-slate-400 mb-2 italic">
                                  <span>- Discount Applied</span>
                                  <span>-5,000.00</span>
                                </div>

                                <div className="border-t border-slate-900 pt-1 mt-2">
                                  <div className="flex justify-between font-black text-base" style={{ color: profile.accent_color }}>
                                    <span>TOTAL</span>
                                    <span>40,000.00</span>
                                  </div>
                                </div>
                                {profile.show_advance_payment && (
                                  <div className="flex justify-between text-[7px] font-bold text-emerald-600 mt-1">
                                    <span>AMOUNT PAID</span>
                                    <span>10,000.00</span>
                                  </div>
                                )}
                                {profile.show_remaining_balance && (
                                  <div className="flex justify-between text-[9px] font-black text-slate-900 mt-1 border-t border-dashed border-slate-300 pt-1">
                                    <span>BALANCE DUE</span>
                                    <span>30,000.00</span>
                                  </div>
                                )}
                             </div>

                             {profile.show_return_policy && (
                               <div className="w-full mt-6 pt-2 border-t border-dashed border-slate-200 text-left">
                                 <p className="text-[6px] font-black text-slate-400 uppercase mb-1">Return Policy</p>
                                 <p className="text-[7px] text-slate-600 leading-tight whitespace-pre-wrap">{profile.return_policy}</p>
                               </div>
                             )}

                             {profile.show_qr_code && (
                               <div className="mt-4 w-12 h-12 bg-slate-100 flex items-center justify-center text-[6px] border border-slate-200">QR</div>
                             )}

                             <div className="mt-6 text-[8px] font-black italic text-slate-400 uppercase tracking-widest">
                               {profile.footer_note}
                             </div>
                           </div>
                         )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "system" && (
            <div className="space-y-6">
              <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-2xl">
                <h2 className="text-sm font-black uppercase text-white mb-6">API Integrations</h2>
                <div className="grid grid-cols-2 gap-4">
                  <input className="field" placeholder="WhatsApp ID" value={integrations.whatsapp_phone_number_id} onChange={(e) => setIntegrations({ ...integrations, whatsapp_phone_number_id: e.target.value })} />
                  <input className="field" type="password" placeholder="WhatsApp Key" value={integrations.whatsapp_api_key} onChange={(e) => setIntegrations({ ...integrations, whatsapp_api_key: e.target.value })} />
                </div>
                <div className="mt-6 flex justify-between items-center">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={integrations.enable_sms_alerts} onChange={(e) => setIntegrations({ ...integrations, enable_sms_alerts: e.target.checked })} />
                    <span className="text-sm font-bold text-slate-300">Enable WhatsApp Alerts</span>
                  </label>
                  <button onClick={saveIntegrations} className="px-6 py-2 bg-emerald-600 text-white rounded-xl font-bold">Save Keys</button>
                </div>
              </div>
              <div className="bg-slate-900/60 border border-white/10 rounded-3xl p-6 shadow-2xl">
                <h2 className="text-sm font-black uppercase text-white mb-6">Display Options</h2>
                <div className="flex justify-between items-center">
                  <select className="field w-40" value={uiPrefs.theme} onChange={(e) => setUiPrefs({ ...uiPrefs, theme: e.target.value })}>
                    <option value="dark">Dark Theme</option>
                    <option value="light">Light Theme</option>
                  </select>
                  <button onClick={saveUiPrefs} className="px-6 py-2 bg-violet-600 text-white rounded-xl font-bold">Apply Theme</button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-sm overflow-hidden">
            <div className="p-6 border-b border-white/5 flex justify-between items-center">
              <h2 className="text-xl font-black text-white">Edit Employee</h2>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <input className="field opacity-50" disabled value={editForm.username} />
              <input className="field" placeholder="Full Name" value={editForm.full_name} onChange={e=>setEditForm({...editForm, full_name: e.target.value})}/>
              <input className="field" type="password" placeholder="New Password" value={editForm.password} onChange={e=>setEditForm({...editForm, password: e.target.value})}/>
              <select className="field" value={editForm.role} onChange={e=>setEditForm({...editForm, role: e.target.value})}>
                <option value="employee">Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="p-6 border-t border-white/5 flex gap-3">
              <button onClick={() => setEditingEmployee(null)} className="flex-1 py-2 text-slate-400 font-bold">Cancel</button>
              <button onClick={saveEditEmployee} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl font-bold">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
