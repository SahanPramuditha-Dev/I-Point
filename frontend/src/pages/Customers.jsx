import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, KpiCard } from "../components/UI";
import { Mail, Phone, Users, Search, Plus, MapPin, ExternalLink, X } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

export default function Customers() {
  const { toast } = useFeedback();
  const { data, setData, loading, error } = useFetch("/customers");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "" });

  const count = (data || []).length;

  const add = async () => {
    if(!form.name || !form.phone) return toast("Name and Phone are required", "warning");
    try {
      const r = await api.post("/customers", form);
      setData([r.data, ...(data || [])]);
      setForm({ name: "", phone: "", email: "", address: "" });
      setShowAddModal(false);
      toast("Customer profile created", "success");
    } catch(e) {
      toast("Failed to create customer", "error");
    }
  };

  const filtered = useMemo(() => {
    return (data || []).filter(c => 
      !searchQuery || 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.phone.includes(searchQuery) ||
      (c.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [data, searchQuery]);

  const withEmail = useMemo(() => (data || []).filter((c) => c.email && String(c.email).trim()).length, [data]);
  const withPhone = useMemo(() => (data || []).filter((c) => c.phone && String(c.phone).trim()).length, [data]);

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-400">Loading Customer Data...</div>;

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      {/* HEADER */}
      <div className="flex justify-between items-end shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Customer CRM</h1>
          <p className="text-xs text-slate-400 mt-1">Manage profiles, contact details and lifetime value</p>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2">
          <Plus size={14}/> Add Customer
        </button>
      </div>

      {/* KPI STRIP */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        <KpiCard tone="sky" title="Total Customers" value={String(count)} icon={<Users size={18} />} />
        <KpiCard tone="indigo" title="Email Marketing Reach" value={String(withEmail)} icon={<Mail size={18} />} />
        <KpiCard tone="green" title="SMS Reach" value={String(withPhone)} icon={<Phone size={18} />} />
      </div>

      {/* MAIN TABLE PANEL */}
      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-black/20 flex justify-between items-center shrink-0">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">
            Directory Listing
          </div>
          <div className="relative w-80">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input 
              placeholder="Search by name, phone or email..." 
              className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              value={searchQuery} 
              onChange={e => setSearchQuery(e.target.value)} 
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-slate-950/90 backdrop-blur z-10 text-[10px] uppercase tracking-widest text-slate-500 border-b border-white/10 shadow-sm">
              <tr>
                <th className="px-6 py-4 font-bold">Profile</th>
                <th className="px-6 py-4 font-bold">Contact Number</th>
                <th className="px-6 py-4 font-bold">Email Address</th>
                <th className="px-6 py-4 font-bold">Location</th>
                <th className="px-6 py-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-white/[0.02] transition-colors group cursor-pointer">
                  <td className="px-6 py-4">
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-sm uppercase border border-indigo-500/20">
                         {c.name.charAt(0)}
                       </div>
                       <span className="font-bold text-sm text-slate-200 group-hover:text-indigo-300 transition-colors">{c.name}</span>
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-slate-300 font-medium text-sm">
                      <Phone size={12} className="text-slate-500" />
                      {c.phone}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {c.email ? <div className="flex items-center gap-2"><Mail size={12} className="text-slate-500" /> {c.email}</div> : "—"}
                  </td>
                  <td className="px-6 py-4 text-slate-400 text-sm">
                    {c.address ? <div className="flex items-center gap-2"><MapPin size={12} className="text-slate-500" /> {c.address}</div> : "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <NavLink to={`/customers/${c.id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 text-slate-300 text-xs font-bold hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors">
                      Profile <ExternalLink size={12}/>
                    </NavLink>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    <Users size={32} className="mx-auto mb-3 opacity-30"/>
                    <p className="text-sm font-bold">No customers found</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD CUSTOMER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2"><Users size={20} className="text-indigo-400"/> New Customer Profile</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20}/></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Full Name</label>
                <input autoFocus className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="e.g. Kasun Perera" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Phone Number</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="07XXXXXXXX" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Email Address</label>
                <input type="email" className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="kasun@example.com" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Physical Address</label>
                <input className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500" placeholder="City / Area" value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">Cancel</button>
              <button onClick={add} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 transition-all">Create Profile</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
