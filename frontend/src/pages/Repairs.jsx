import { useMemo, useState, useEffect } from "react";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Select, Table } from "../components/UI";
import { CheckCircle2, ClipboardList, Loader2, Wrench, LayoutGrid, List, Search, Plus, Filter, Clock, MoreVertical, Bell } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";
import RepairKanban from "../components/RepairKanban";

function statusTone(status) {
  if (status === "Delivered") return "green";
  if (status === "Completed") return "sky";
  if (status === "Repairing" || status === "Waiting for parts") return "amber";
  if (status === "Diagnosing") return "indigo";
  return "slate";
}

export default function Repairs() {
  const { toast, confirm } = useFeedback();
  const { data, loading, error, setData } = useFetch('/repairs');
  const customersFetch = useFetch('/customers');
  const customers = customersFetch.data || [];
  const [query, setQuery] = useState("");
  const [view, setView] = useState("table"); // table | kanban
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ 
    customer_id: '', 
    device_model: '', 
    imei: '', 
    issue: '', 
    technician: 'Ashan Perera', 
    estimated_cost: 0, 
    notes: '',
    priority: 'Normal'
  });
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', email: '', address: '' });
  const [selectedRepair, setSelectedRepair] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [parts, setParts] = useState([]);
  const inventoryFetch = useFetch('/inventory');
  const inventory = inventoryFetch.data || [];
  const [selectedPart, setSelectedPart] = useState({ item_id: '', quantity: 1 });

  const showDetails = async (repair) => {
    try {
      const [{ data: tl }, { data: pt }] = await Promise.all([
        api.get(`/repairs/${repair.id}/timeline`),
        api.get(`/repairs/${repair.id}/parts`)
      ]);
      setTimeline(tl);
      setParts(pt);
      setSelectedRepair(repair);
    } catch (err) {
      console.error("Failed to fetch repair details", err);
      toast("Could not load full repair details", "error");
      // Fallback: show the modal with just the repair data we already have
      setTimeline([]);
      setParts([]);
      setSelectedRepair(repair);
    }
  };

  const addPart = async () => {
    if (!selectedPart.item_id) return toast("Select a part first", "warning");
    try {
      await api.post(`/repairs/${selectedRepair.id}/consume-part`, selectedPart);
      const { data: updatedParts } = await api.get(`/repairs/${selectedRepair.id}/parts`);
      setParts(updatedParts);
      setSelectedPart({ item_id: '', quantity: 1 });
      toast("Part consumed from inventory", "success");
    } catch (err) {
      toast("Failed to add part (check stock)", "error");
    }
  };

  const printTicket = async (ticket) => {
    console.log("🖨️ Print request received:", ticket);
    if (!ticket || !ticket.id) {
      console.error("❌ Missing ticket ID in:", ticket);
      return toast("Error: Ticket ID is missing. Refresh and try again.", "error");
    }

    try {
      toast("🔄 Generating Job Card PDF...", "info");
      console.log(`📡 Fetching PDF for ticket #${ticket.id}...`);

      const response = await api.get(`/repairs/${ticket.id}/job-card-pdf`, {
        responseType: 'blob',
        timeout: 30000
      });
      
      console.log(`✅ PDF received (${response.data.size} bytes)`);

      // Create and open the PDF
      const url = URL.createObjectURL(response.data);
      const pdfWindow = window.open(url, "_blank");
      
      if (!pdfWindow) {
        toast("⚠️ Pop-up blocked. Please allow popups and try again.", "warning");
        return;
      }

      toast("✅ Job Card opened in new tab", "success");

      // Cleanup after a delay
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error("❌ Print Error:", err);
      let errorMsg = "Failed to generate Job Card";
      
      if (err.response) {
        if (err.response.data instanceof Blob) {
          try {
            const text = await err.response.data.text();
            const parsed = JSON.parse(text);
            errorMsg = parsed.detail || `Server error: ${err.response.status}`;
          } catch (e) {
            errorMsg = `Server error: ${err.response.status}`;
          }
        } else {
          errorMsg = err.response.data?.detail || `Error ${err.response.status}`;
        }
      } else if (err.request) {
        errorMsg = "Backend server not responding. Is it running?";
      } else if (err.code === 'ECONNABORTED') {
        errorMsg = "Request timeout. Backend is slow.";
      }
      
      toast(errorMsg, "error");
    }
  };

  const submit = async () => {
    if (!form.device_model || !form.imei || !form.technician) {
      return toast("Device model, IMEI and technician are required", "warning");
    }

    try {
      let customerId = null;
      if (form.customer_id === "new") {
        if (!newCustomer.name || !newCustomer.phone) {
          return toast("Please provide the new customer's name and phone number", "warning");
        }
        const { data: customer } = await api.post('/customers', newCustomer);
        customersFetch.setData([...(customersFetch.data || []), customer]);
        customerId = customer.id;
      } else if (form.customer_id) {
        customerId = Number(form.customer_id);
      }

      const payload = {
        ...form,
        customer_id: customerId,
      };

      const { data: newTicket } = await api.post('/repairs', payload);
      
      // Reset form immediately
      setForm({ customer_id: '', device_model: '', imei: '', issue: '', technician: defaultTechnician, estimated_cost: 0, notes: '', priority: 'Normal' });
      setNewCustomer({ name: '', phone: '', email: '', address: '' });
      
      // Update data
      setData([newTicket, ...(data || [])]);
      
      // Close modal
      setShowCreate(false);
      
      toast("✅ Repair ticket created successfully", "success");
      
      // Wait a moment for modal to close, then ask about printing
      setTimeout(async () => {
        const ok = await confirm("Print Job Card?", `Would you like to print the Job Card for ticket #${newTicket.ticket_no}?`);
        if (ok) {
          console.log("User confirmed printing");
          printTicket(newTicket);
        }
      }, 500);
    } catch (err) {
      console.error("Submit error:", err);
      toast("Failed to create ticket", "error");
    }
  };

  const [statusUpdateRepair, setStatusUpdateRepair] = useState(null);
  const [statusForm, setStatusForm] = useState({ status: "", note: "", notify: true });

  const openStatusModal = (repair) => {
    setStatusUpdateRepair(repair);
    setStatusForm({ status: repair.status, note: "", notify: true });
  };

  const executeStatusUpdate = async () => {
    try {
      const { data: res } = await api.put(`/repairs/${statusUpdateRepair.id}/status?status=${encodeURIComponent(statusForm.status)}&note=${encodeURIComponent(statusForm.note)}`);
      
      setData(data.map(r => r.id === statusUpdateRepair.id ? { ...r, status: statusForm.status, delivered_at: statusForm.status === "Delivered" ? new Date().toISOString() : r.delivered_at } : r));
      
      if (statusForm.notify && res.whatsapp_url) {
        window.open(res.whatsapp_url, "_blank");
      }
      
      setStatusUpdateRepair(null);
      toast(`Status updated to ${statusForm.status}`, "success");
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const notify = async (r) => {
    const { data: res } = await api.put(`/repairs/${r.id}/status?status=${encodeURIComponent(r.status)}`);
    if (res.whatsapp_url) {
      window.open(res.whatsapp_url, "_blank");
      toast("Notification prepared in WhatsApp", "info");
    } else {
      toast("No customer phone available", "warning");
    }
  };

  const techniciansFetch = useFetch('/auth/staff');
  const technicians = techniciansFetch.data || [];
  const defaultTechnician = technicians.find(t => t.full_name === "Ashan Perera")?.full_name || technicians[0]?.full_name || "Ashan Perera";
  
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [techFilter, setTechFilter] = useState("All Technicians");

  const filtered = useMemo(() => {
    return (data || []).filter((r) => {
      const matchesQuery = !query || 
        (r.ticket_no || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.customer_name || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.device_model || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.imei || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.customer_phone || "").toLowerCase().includes(query.toLowerCase());
      
      const matchesStatus = statusFilter === "All Status" || r.status === statusFilter;
      const matchesTech = techFilter === "All Technicians" || r.technician === techFilter;

      return matchesQuery && matchesStatus && matchesTech;
    });
  }, [data, query, statusFilter, techFilter]);

  const stats = useMemo(() => {
    const rows = data || [];
    return {
      open: rows.filter(r => !["Delivered", "Completed"].includes(r.status)).length,
      active: rows.filter(r => ["Repairing", "Diagnosing"].includes(r.status)).length,
      ready: rows.filter(r => r.status === "Completed").length,
      total: rows.length
    };
  }, [data]);

  if (loading) return <div className="animate-pulse p-8"><div className="h-10 w-64 bg-white/5 rounded-lg mb-8" /><div className="grid grid-cols-4 gap-4 mb-8">{[1,2,3,4].map(i => <div key={i} className="h-32 bg-white/5 rounded-2xl" />)}</div></div>;
  if (error) return <div className="text-rose-400 p-8 flex items-center gap-3 bg-rose-500/10 rounded-2xl border border-rose-500/20"><MoreVertical className="rotate-90" /> {error}</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <PageTitle title="Repair Management" subtitle="Enterprise lifecycle tracking from intake to handover" />
        <div className="flex items-center gap-3">
          <div className="flex items-center p-1 bg-white/5 rounded-xl border border-white/5">
            <button onClick={() => setView("table")} className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><List size={18} /></button>
            <button onClick={() => setView("kanban")} className={`p-2 rounded-lg transition-all ${view === 'kanban' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><LayoutGrid size={18} /></button>
          </div>
          <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-6"><Plus size={18} /> New Ticket</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <KpiCard className="col-span-3" tone="sky" title="Active Queue" value={String(stats.open)} hint="Tickets in house" icon={<ClipboardList size={20} />} />
        <KpiCard className="col-span-3" tone="amber" title="In Workbench" value={String(stats.active)} hint="Technicians working" icon={<Loader2 size={20} />} />
        <KpiCard className="col-span-3" tone="green" title="Ready" value={String(stats.ready)} hint="Waiting for delivery" icon={<CheckCircle2 size={20} />} />
        <KpiCard className="col-span-3" tone="slate" title="Total History" value={String(stats.total)} hint="Lifetime records" icon={<Wrench size={20} />} />
      </div>

      <div className="bg-[#12182a]/60 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/[0.01]">
          <div className="flex flex-col md:flex-row items-center gap-4 flex-1">
            <div className="relative w-full max-w-md group">
              <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
              <input 
                className="w-full bg-[#0f172a] border border-white/10 rounded-2xl pl-12 pr-4 py-3.5 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all" 
                placeholder="Search by ticket, customer, phone..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Select 
                className="h-11 bg-[#0f172a] border-white/10 text-xs min-w-[140px]"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option>All Status</option>
                {["Pending","Diagnosing","Repairing","Waiting for parts","Completed","Delivered"].map(s => <option key={s}>{s}</option>)}
              </Select>
              <Select 
                className="h-11 bg-[#0f172a] border-white/10 text-xs min-w-[140px]"
                value={techFilter}
                onChange={e => setTechFilter(e.target.value)}
              >
                <option>All Technicians</option>
                {technicians.map(t => <option key={t.id} value={t.full_name}>{t.full_name}</option>)}
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
                onClick={() => {
                  const csv = [
                    ["Ticket", "Customer", "Phone", "Device", "Issue", "Technician", "Cost", "Status", "Date"].join(","),
                    ...filtered.map(r => [r.ticket_no, r.customer_name, r.customer_phone, r.device_model, r.issue, r.technician, r.estimated_cost, r.status, r.created_at].join(","))
                  ].join("\n");
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `repairs_export_${new Date().toISOString().split('T')[0]}.csv`;
                  a.click();
                }}
                className="px-5 h-11 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition flex items-center gap-2"
              >
                Export CSV
             </button>
             <div className="h-8 w-[1px] bg-white/10 mx-2" />
             <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-white/5">
                <button onClick={() => setView("table")} className={`p-2 rounded-lg transition-all ${view === 'table' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><List size={18} /></button>
                <button onClick={() => setView("kanban")} className={`p-2 rounded-lg transition-all ${view === 'kanban' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><LayoutGrid size={18} /></button>
             </div>
          </div>
        </div>

        {view === "kanban" ? (
          <div className="p-8">
             <RepairKanban repairs={filtered} onStatusChange={(id, status) => {}} onViewDetails={showDetails} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="table-clean border-none">
              <thead className="bg-white/[0.02]">
                <tr className="text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
                  <th className="pl-8 py-6">Ticket #</th>
                  <th>Customer</th>
                  <th>Phone</th>
                  <th>Device</th>
                  <th>Issue</th>
                  <th>Technician</th>
                  <th>Est. Cost</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="pr-8 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.03]">
                {filtered.map(r => (
                  <tr key={r.id} className="group hover:bg-indigo-500/[0.03] transition-all duration-300">
                    <td className="pl-8 py-5 font-black text-indigo-400 text-sm tracking-tighter cursor-pointer hover:underline" onClick={() => showDetails(r)}>#{r.ticket_no}</td>
                    <td className="font-bold text-slate-200 text-sm">{r.customer_name || "-"}</td>
                    <td className="text-slate-500 text-sm font-medium">{r.customer_phone || "077-xxx-xxxx"}</td>
                    <td className="text-indigo-200 text-sm font-bold">{r.device_model}</td>
                    <td className="text-slate-400 text-xs max-w-[150px] truncate">{r.issue}</td>
                    <td className="text-slate-200 text-sm font-medium">{r.technician || "-"}</td>
                    <td className="text-slate-200 font-bold text-sm">Rs. {r.estimated_cost?.toLocaleString()}</td>
                    <td>
                      <button 
                        onClick={() => openStatusModal(r)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5 w-fit hover:border-indigo-500/50 transition-all group"
                      >
                         <div className={`w-1.5 h-1.5 rounded-full ${
                           r.status === 'Completed' ? 'bg-emerald-500' : 
                           r.status === 'Repairing' || r.status === 'Diagnosing' ? 'bg-indigo-500' : 'bg-amber-500'
                         }`} />
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 group-hover:text-indigo-300">{r.status}</span>
                      </button>
                    </td>
                    <td className="text-slate-500 text-[11px] font-bold">{new Date(r.created_at).toISOString().split('T')[0]}</td>
                    <td className="pr-8 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => showDetails(r)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold transition">View</button>
                        <button onClick={() => printTicket(r)} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-indigo-500/20 text-white text-[11px] font-bold transition" title="Print Job Card">🖨️ Print</button>
                        <button onClick={() => openStatusModal(r)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 transition">
                           <MoreVertical size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      {/* Status Update Modal */}
      {statusUpdateRepair && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 border-b border-white/5 bg-white/[0.02]">
                 <h2 className="text-xl font-black text-white tracking-tight">Update Status</h2>
                 <p className="text-xs text-slate-500 mt-1">Ticket #{statusUpdateRepair.ticket_no} • {statusUpdateRepair.device_model}</p>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">New Status</p>
                   <Select 
                     value={statusForm.status} 
                     onChange={e => setStatusForm({...statusForm, status: e.target.value})}
                     className="h-12"
                   >
                     {["Pending","Diagnosing","Repairing","Waiting for parts","Completed","Delivered"].map(s => <option key={s}>{s}</option>)}
                   </Select>
                 </div>
                 <div className="space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Progress Note</p>
                   <textarea 
                      className="w-full bg-[#0f172a] border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 min-h-[100px] resize-none"
                      placeholder="What's happening with this repair?"
                      value={statusForm.note}
                      onChange={e => setStatusForm({...statusForm, note: e.target.value})}
                   />
                 </div>
                 <label className="flex items-center gap-3 cursor-pointer group">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded-lg border-white/10 bg-white/5 text-indigo-500 focus:ring-indigo-500/20"
                      checked={statusForm.notify}
                      onChange={e => setStatusForm({...statusForm, notify: e.target.checked})}
                    />
                    <span className="text-sm font-bold text-slate-300 group-hover:text-white transition">Notify Customer via WhatsApp</span>
                 </label>
              </div>
              <div className="p-8 bg-white/[0.02] border-t border-white/5 flex gap-3">
                 <Button variant="secondary" onClick={() => setStatusUpdateRepair(null)} className="flex-1">Cancel</Button>
                 <Button onClick={executeStatusUpdate} className="flex-1 bg-indigo-500 shadow-lg shadow-indigo-500/20">Update Repair</Button>
              </div>
           </div>
        </div>
      )}

      {/* Creation Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[80] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-white/5 bg-white/[0.02] flex justify-between items-center flex-shrink-0">
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Create Repair Ticket</h2>
                <p className="text-xs text-slate-500 mt-1">Register a new device for service</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white transition">×</button>
            </div>
            
            <div className="p-8 grid grid-cols-2 gap-6 overflow-y-auto flex-1">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer</p>
                <Select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})}>
                  <option value="">Walk-in / No customer</option>
                  <option value="new">+ Add new customer</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.phone})</option>)}
                </Select>
              </div>
              {form.customer_id === 'new' && (
                <div className="col-span-2 grid grid-cols-2 gap-4 p-4 rounded-3xl bg-white/5 border border-white/10">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Customer Name</p>
                    <Input placeholder="Customer name" value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Phone</p>
                    <Input placeholder="Phone number" value={newCustomer.phone} onChange={e => setNewCustomer({...newCustomer, phone: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Email</p>
                    <Input placeholder="Email (optional)" value={newCustomer.email} onChange={e => setNewCustomer({...newCustomer, email: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Address</p>
                    <Input placeholder="Address (optional)" value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} />
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Device Model</p>
                <Input placeholder="e.g. iPhone 15 Pro" value={form.device_model} onChange={e => setForm({...form, device_model: e.target.value})} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">IMEI / Serial</p>
                <Input placeholder="15-digit IMEI or SN" value={form.imei} onChange={e => setForm({...form, imei: e.target.value})} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Technician</p>
                <Select value={form.technician} onChange={e => setForm({...form, technician: e.target.value})}>
                  <option value="Ashan Perera">Ashan Perera (Manager)</option>
                  {technicians.filter(t => t.full_name !== "Ashan Perera").map(t => (
                    <option key={t.id} value={t.full_name}>{t.full_name}</option>
                  ))}
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Issue / Fault Description</p>
                <textarea 
                  className="w-full bg-[#0f172a] border border-white/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:border-indigo-500/50 min-h-[80px]"
                  placeholder="Describe the problem..."
                  value={form.issue}
                  onChange={e => setForm({...form, issue: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estimated Labor Cost</p>
                <Input type="number" placeholder="0.00" value={form.estimated_cost} onChange={e => setForm({...form, estimated_cost: e.target.value})} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Priority</p>
                <Select value={form.priority} onChange={e => setForm({...form, priority: e.target.value})}>
                  {["Low", "Normal", "High", "Urgent"].map(p => <option key={p} value={p}>{p}</option>)}
                </Select>
              </div>
            </div>

            <div className="p-8 bg-white/[0.02] border-t border-white/5 flex gap-3 flex-shrink-0">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowCreate(false);
                  setForm({ customer_id: '', device_model: '', imei: '', issue: '', technician: defaultTechnician, estimated_cost: 0, notes: '', priority: 'Normal' });
                  setNewCustomer({ name: '', phone: '', email: '', address: '' });
                }}
                className="flex-1"
              >Discard</Button>
              <Button onClick={submit} className="flex-1 bg-indigo-500 shadow-lg shadow-indigo-500/20">Create Ticket</Button>
            </div>
          </div>
        </div>
      )}

      {/* Details & Parts Modal */}
      {selectedRepair && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-[#0f172a] border border-white/10 rounded-[32px] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <div>
                <h3 className="font-black text-white text-2xl tracking-tight flex items-center gap-3">
                  <span className="text-indigo-500">#{selectedRepair.ticket_no}</span> 
                  {selectedRepair.device_model}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Repair Case Management</p>
              </div>
              <button onClick={() => setSelectedRepair(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white transition">×</button>
            </div>
            
            <div className="flex-1 overflow-auto grid grid-cols-12 gap-0">
               {/* Timeline Section */}
               <div className="col-span-4 border-r border-white/5 p-8 bg-black/20">
                  <h4 className="text-[11px] font-black uppercase tracking-[.2em] text-slate-500 mb-8 flex items-center gap-2">
                    <Clock size={14} className="text-indigo-500" />
                    Audit Trail
                  </h4>
                  <div className="relative border-l-2 border-indigo-500/20 ml-2 space-y-8">
                    {(timeline || []).map((event, idx) => (
                      <div key={idx} className="relative pl-6">
                        <div className="absolute left-[-9px] top-0 w-4 h-4 rounded-full bg-indigo-500 border-4 border-[#0f172a]"></div>
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-black text-slate-300 uppercase">{event.status}</span>
                          <span className="text-[9px] text-slate-600 font-bold">{new Date(event.created_at).toLocaleDateString()}</span>
                        </div>
                        {event.note && <p className="text-[11px] text-slate-500 leading-relaxed">{event.note}</p>}
                      </div>
                    ))}
                  </div>
               </div>

               {/* Parts & Billing Section */}
               <div className="col-span-8 p-8 space-y-8">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase tracking-[.2em] text-slate-500 flex items-center gap-2">
                      <Wrench size={14} className="text-sky-500" />
                      Parts Usage & Inventory
                    </h4>
                    
                    <div className="flex gap-2">
                      <Select 
                        className="flex-1 h-11"
                        value={selectedPart.item_id}
                        onChange={e => setSelectedPart({...selectedPart, item_id: e.target.value})}
                      >
                        <option value="">Select Part from Inventory...</option>
                        {inventory.map(i => (
                          <option key={i.id} value={i.id}>{i.name} ({i.quantity} in stock) - LKR {i.sale_price}</option>
                        ))}
                      </Select>
                      <Input 
                        type="number" 
                        className="w-20 h-11 text-center" 
                        value={selectedPart.quantity}
                        onChange={e => setSelectedPart({...selectedPart, quantity: Number(e.target.value)})}
                      />
                      <Button onClick={addPart} className="px-6 h-11"><Plus size={18} /></Button>
                    </div>

                    <div className="bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
                      <Table className="table-sm">
                        <thead>
                          <tr>
                            <th>Part Name</th>
                            <th className="text-center">Qty</th>
                            <th className="text-right">Unit Price</th>
                            <th className="text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parts.map((p, idx) => (
                            <tr key={idx}>
                              <td className="font-medium text-slate-300">{p.item_name}</td>
                              <td className="text-center text-slate-400">{p.quantity}</td>
                              <td className="text-right text-slate-400">{p.unit_cost?.toLocaleString()}</td>
                              <td className="text-right font-bold text-white">{(p.quantity * p.unit_cost).toLocaleString()}</td>
                            </tr>
                          ))}
                          {parts.length === 0 && (
                            <tr><td colSpan={4} className="text-center py-8 text-slate-600 italic">No parts added yet</td></tr>
                          )}
                        </tbody>
                      </Table>
                    </div>
                  </div>

                  <div className="bg-indigo-500/5 rounded-3xl p-6 border border-indigo-500/10 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Total Bill Estimate</p>
                      <p className="text-3xl font-black text-white mt-1 tracking-tighter">
                        LKR {(selectedRepair.estimated_cost + parts.reduce((acc, p) => acc + (p.quantity * p.unit_cost), 0)).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Labor Cost</p>
                       <p className="text-lg font-bold text-slate-300">LKR {selectedRepair.estimated_cost.toLocaleString()}</p>
                    </div>
                  </div>
               </div>
            </div>

            <div className="p-8 bg-white/[0.02] border-t border-white/5 flex justify-between items-center">
               <div className="flex items-center gap-4">
                 <Badge tone={statusTone(selectedRepair.status)} className="px-4 py-1.5 rounded-xl text-[10px] font-black tracking-[.2em]">{selectedRepair.status.toUpperCase()}</Badge>
                 <span className="text-xs text-slate-500 font-bold">Technician: <span className="text-slate-300">{selectedRepair.technician}</span></span>
               </div>
               <div className="flex gap-3">
                  <Button variant="secondary" onClick={() => setSelectedRepair(null)} className="px-8 h-11">Close Details</Button>
                  <Button 
                    onClick={() => printTicket(selectedRepair)}
                    className="px-8 h-11 bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20"
                  >
                    Print Job Card
                  </Button>
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

