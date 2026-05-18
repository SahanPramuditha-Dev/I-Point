import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Select, Table } from "../components/UI";
import { Checkbox, Chip, IconButton, Menu, MenuItem, Table as MuiTable, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, Tooltip } from "@mui/material";
import { CheckCircle2, ClipboardList, Loader2, Wrench, LayoutGrid, List, Search, Plus, Filter, Clock, MoreVertical, Bell, AlertTriangle, UserCheck, Phone, CheckCheck } from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";
import RepairKanban from "../components/RepairKanban";

function statusTone(status) {
  if (status === "Delivered") return "green";
  if (status === "Completed") return "sky";
  if (status === "Repairing" || status === "Waiting for parts") return "amber";
  if (status === "Diagnosing") return "indigo";
  return "slate";
}

const REPAIR_COLUMNS = [
  { key: "ticket_no", label: "Ticket #", sortable: true },
  { key: "customer_name", label: "Customer", sortable: true },
  { key: "customer_phone", label: "Phone", sortable: true },
  { key: "device_model", label: "Device", sortable: true },
  { key: "issue", label: "Issue", sortable: false },
  { key: "priority", label: "Priority", sortable: true },
  { key: "sla", label: "SLA", sortable: false },
  { key: "technician", label: "Technician", sortable: true },
  { key: "estimated_cost", label: "Est. Cost", sortable: true },
  { key: "advance_payment", label: "Advance", sortable: false },
  { key: "balance", label: "Balance", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "created_at", label: "Date", sortable: true },
  { key: "parts", label: "Parts", sortable: false },
];

const DEFAULT_VISIBLE_COLUMNS = REPAIR_COLUMNS.reduce((acc, col) => {
  acc[col.key] = true;
  return acc;
}, {});

export default function Repairs() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [priorityFilter, setPriorityFilter] = useState("All Priority");
  const [dateFilter, setDateFilter] = useState("All Dates");
  const [selectedRows, setSelectedRows] = useState([]);
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [tableSortBy, setTableSortBy] = useState("created_at");
  const [tableSortDir, setTableSortDir] = useState("desc");
  const [tablePage, setTablePage] = useState(0);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(25);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState(null);
  const [rowMenuRepair, setRowMenuRepair] = useState(null);
  const hydratedFromQuery = useRef(false);
  const searchInputRef = useRef(null);

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
      setForm({ customer_id: '', device_model: '', imei: '', issue: '', technician: defaultTechnician, estimated_cost: 0, advance_payment: 0, notes: '', priority: 'Normal' });
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
  const [savedPreset, setSavedPreset] = useState("All Tickets");

  const applyPreset = (preset) => {
    setSavedPreset(preset);
    if (preset === "Overdue") {
      setStatusFilter("All Status");
      setPriorityFilter("All Priority");
      setDateFilter("Older than 3 days");
    } else if (preset === "Ready to Deliver") {
      setStatusFilter("Completed");
      setPriorityFilter("All Priority");
      setDateFilter("All Dates");
    } else if (preset === "Awaiting Parts") {
      setStatusFilter("Waiting for parts");
      setPriorityFilter("All Priority");
      setDateFilter("All Dates");
    } else {
      setStatusFilter("All Status");
      setPriorityFilter("All Priority");
      setDateFilter("All Dates");
    }
  };

  const filtered = useMemo(() => {
    const now = Date.now();
    return (data || []).filter((r) => {
      const matchesQuery = !query || 
        (r.ticket_no || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.customer_name || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.device_model || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.imei || "").toLowerCase().includes(query.toLowerCase()) ||
        (r.customer_phone || "").toLowerCase().includes(query.toLowerCase());
      
      const matchesStatus = statusFilter === "All Status" || r.status === statusFilter;
      const matchesTech = techFilter === "All Technicians" || r.technician === techFilter;
      const matchesPriority = priorityFilter === "All Priority" || (r.priority || "Normal") === priorityFilter;
      const ageDays = Math.floor((now - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
      const matchesDate =
        dateFilter === "All Dates" ||
        (dateFilter === "Today" && ageDays === 0) ||
        (dateFilter === "Last 7 days" && ageDays <= 7) ||
        (dateFilter === "Older than 3 days" && ageDays > 3);

      return matchesQuery && matchesStatus && matchesTech && matchesPriority && matchesDate;
    });
  }, [data, query, statusFilter, techFilter, priorityFilter, dateFilter]);

  const sortedRepairs = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const valueFor = (row) => {
        if (tableSortBy === "ticket_no") return Number(row.ticket_no || 0);
        if (tableSortBy === "customer_name") return String(row.customer_name || "").toLowerCase();
        if (tableSortBy === "device_model") return String(row.device_model || "").toLowerCase();
        if (tableSortBy === "priority") return String(row.priority || "Normal").toLowerCase();
        if (tableSortBy === "status") return String(row.status || "").toLowerCase();
        if (tableSortBy === "technician") return String(row.technician || "").toLowerCase();
        if (tableSortBy === "estimated_cost") return Number(row.estimated_cost || 0);
        if (tableSortBy === "balance") return Math.max(0, Number(row.estimated_cost || 0) - Number(row.advance_payment || 0));
        if (tableSortBy === "created_at") return new Date(row.created_at || 0).getTime();
        return String(row[tableSortBy] || "").toLowerCase();
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      if (av < bv) return tableSortDir === "asc" ? -1 : 1;
      if (av > bv) return tableSortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [filtered, tableSortBy, tableSortDir]);

  useEffect(() => {
    if (hydratedFromQuery.current) return;
    hydratedFromQuery.current = true;

    const q = searchParams.get("q");
    const st = searchParams.get("status");
    const tech = searchParams.get("tech");
    const pr = searchParams.get("priority");
    const dt = searchParams.get("date");
    const preset = searchParams.get("preset");
    const sortBy = searchParams.get("sortBy");
    const sortDir = searchParams.get("sortDir");
    const page = Number(searchParams.get("page") || "1");
    const rows = Number(searchParams.get("rows") || "25");
    const viewParam = searchParams.get("view");
    const vc = searchParams.get("vc");

    if (q) setQuery(q);
    if (st) setStatusFilter(st);
    if (tech) setTechFilter(tech);
    if (pr) setPriorityFilter(pr);
    if (dt) setDateFilter(dt);
    if (preset) setSavedPreset(preset);
    if (sortBy) setTableSortBy(sortBy);
    if (sortDir === "asc" || sortDir === "desc") setTableSortDir(sortDir);
    if (!Number.isNaN(page) && page > 0) setTablePage(page - 1);
    if ([10, 25, 50, 100].includes(rows)) setTableRowsPerPage(rows);
    if (viewParam === "table" || viewParam === "kanban") setView(viewParam);
    if (vc) {
      const visible = { ...DEFAULT_VISIBLE_COLUMNS };
      Object.keys(visible).forEach((k) => { visible[k] = false; });
      vc.split(",").forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(visible, k)) visible[k] = true;
      });
      setVisibleColumns(visible);
    }
  }, [searchParams]);

  const pagedRepairs = useMemo(() => {
    const start = tablePage * tableRowsPerPage;
    return sortedRepairs.slice(start, start + tableRowsPerPage);
  }, [sortedRepairs, tablePage, tableRowsPerPage]);

  useEffect(() => {
    if (!hydratedFromQuery.current) return;
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter !== "All Status") params.set("status", statusFilter);
    if (techFilter !== "All Technicians") params.set("tech", techFilter);
    if (priorityFilter !== "All Priority") params.set("priority", priorityFilter);
    if (dateFilter !== "All Dates") params.set("date", dateFilter);
    if (savedPreset !== "All Tickets") params.set("preset", savedPreset);
    if (tableSortBy !== "created_at") params.set("sortBy", tableSortBy);
    if (tableSortDir !== "desc") params.set("sortDir", tableSortDir);
    if (tablePage > 0) params.set("page", String(tablePage + 1));
    if (tableRowsPerPage !== 25) params.set("rows", String(tableRowsPerPage));
    if (view !== "table") params.set("view", view);
    const visibleKeys = REPAIR_COLUMNS.filter((c) => visibleColumns[c.key]).map((c) => c.key);
    const allVisible = visibleKeys.length === REPAIR_COLUMNS.length;
    if (!allVisible) params.set("vc", visibleKeys.join(","));
    setSearchParams(params, { replace: true });
  }, [
    query,
    statusFilter,
    techFilter,
    priorityFilter,
    dateFilter,
    savedPreset,
    tableSortBy,
    tableSortDir,
    tablePage,
    tableRowsPerPage,
    view,
    visibleColumns,
    setSearchParams,
  ]);

  useEffect(() => {
    if (!sortedRepairs.length) {
      setActiveRowIndex(0);
      return;
    }
    if (activeRowIndex > sortedRepairs.length - 1) setActiveRowIndex(0);
  }, [sortedRepairs, activeRowIndex]);

  useEffect(() => {
    setTablePage(0);
  }, [filtered]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === "n" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        setShowCreate(true);
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key.toLowerCase() === "j" && sortedRepairs.length) {
        e.preventDefault();
        setActiveRowIndex((i) => Math.min(i + 1, sortedRepairs.length - 1));
      }
      if (e.key.toLowerCase() === "k" && sortedRepairs.length) {
        e.preventDefault();
        setActiveRowIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter" && sortedRepairs[activeRowIndex] && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        showDetails(sortedRepairs[activeRowIndex]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sortedRepairs, activeRowIndex]);

  const handleSort = (key) => {
    if (tableSortBy === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setTableSortBy(key);
    setTableSortDir(key === "created_at" ? "desc" : "asc");
  };

  const toggleColumn = (key) => {
    setVisibleColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const openRowMenu = (event, repair) => {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuRepair(repair);
  };

  const closeRowMenu = () => {
    setRowMenuAnchor(null);
    setRowMenuRepair(null);
  };

  const cycleStatus = async (repair) => {
    const order = ["Pending", "Diagnosing", "Repairing", "Waiting for parts", "Completed", "Delivered"];
    const idx = order.indexOf(repair.status);
    const next = order[(idx + 1) % order.length];
    try {
      await api.put(`/repairs/${repair.id}/status?status=${encodeURIComponent(next)}&note=${encodeURIComponent("Status updated from quick action")}`);
      setData((data || []).map((r) => (r.id === repair.id ? { ...r, status: next } : r)));
      toast(`Moved to ${next}`, "success");
    } catch {
      toast("Failed to update status", "error");
    }
  };

  const bulkStatusUpdate = async (targetStatus) => {
    if (!selectedRows.length) return toast("Select at least one ticket", "warning");
    const ok = await confirm("Bulk Update", `Update ${selectedRows.length} tickets to ${targetStatus}?`);
    if (!ok) return;
    try {
      await Promise.all(selectedRows.map((id) =>
        api.put(`/repairs/${id}/status?status=${encodeURIComponent(targetStatus)}&note=${encodeURIComponent("Bulk status update")}`)
      ));
      setData((data || []).map((r) => (selectedRows.includes(r.id) ? { ...r, status: targetStatus } : r)));
      setSelectedRows([]);
      toast(`Updated ${selectedRows.length} tickets`, "success");
    } catch {
      toast("Bulk update failed", "error");
    }
  };

  const assignTechnicianBulk = async (tech) => {
    if (!selectedRows.length) return toast("Select at least one ticket", "warning");
    setData((data || []).map((r) => (selectedRows.includes(r.id) ? { ...r, technician: tech } : r)));
    toast("Technician assignment updated locally", "info");
  };

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
    <div className="h-full min-h-0 flex flex-col gap-6 animate-in fade-in duration-700">
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

      <div className="min-h-0 flex-1 bg-[#12182a]/60 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden shadow-2xl flex flex-col">
        <div className="p-6 border-b border-white/5 space-y-4 bg-white/[0.01]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative group flex-1 min-w-[280px]">
              <Search className="absolute left-4 top-3.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" size={18} />
              <input 
                ref={searchInputRef}
                className="w-full bg-[#0f172a] border border-white/10 rounded-xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/15 transition-all" 
                placeholder="Search by ticket, customer, phone..."
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select 
                className="repair-select h-11 min-w-[160px] max-w-[180px] !w-auto bg-[#0f172a] border-white/10 text-xs"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option>All Status</option>
                {["Pending","Diagnosing","Repairing","Waiting for parts","Completed","Delivered"].map(s => <option key={s}>{s}</option>)}
              </Select>
              <Select 
                className="repair-select h-11 min-w-[160px] max-w-[180px] !w-auto bg-[#0f172a] border-white/10 text-xs"
                value={techFilter}
                onChange={e => setTechFilter(e.target.value)}
              >
                <option>All Technicians</option>
                {technicians.map(t => <option key={t.id} value={t.full_name}>{t.full_name}</option>)}
              </Select>
              <Select className="repair-select h-11 min-w-[145px] max-w-[165px] !w-auto bg-[#0f172a] border-white/10 text-xs" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
                <option>All Priority</option>
                {["Low", "Normal", "High", "Urgent"].map(p => <option key={p}>{p}</option>)}
              </Select>
              <Select className="repair-select h-11 min-w-[145px] max-w-[165px] !w-auto bg-[#0f172a] border-white/10 text-xs" value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
                {["All Dates", "Today", "Last 7 days", "Older than 3 days"].map(d => <option key={d}>{d}</option>)}
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
             <div className="flex flex-wrap items-center gap-2">
               {["All Tickets", "Overdue", "Ready to Deliver", "Awaiting Parts"].map((p) => (
                 <button key={p} onClick={() => applyPreset(p)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${savedPreset === p ? "bg-indigo-500/30 text-indigo-200 border border-indigo-400/40" : "bg-white/5 text-slate-400 border border-white/10 hover:text-white"}`}>{p}</button>
               ))}
             </div>
             <div className="flex flex-wrap items-center gap-2">
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
                  className="px-3 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-bold transition"
                >
                  Export CSV
                </button>
               <button onClick={() => bulkStatusUpdate("Repairing")} className="px-3 h-9 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 text-[11px] font-bold transition">Bulk Repairing</button>
               <button onClick={() => bulkStatusUpdate("Completed")} className="px-3 h-9 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-[11px] font-bold transition">Bulk Complete</button>
               <Select className="repair-select h-9 min-w-[180px] max-w-[220px] !w-auto bg-[#0f172a] border-white/10 text-xs" onChange={(e) => e.target.value && assignTechnicianBulk(e.target.value)}>
                  <option value="">Assign Tech (bulk)</option>
                  {technicians.map(t => <option key={t.id} value={t.full_name}>{t.full_name}</option>)}
               </Select>
               <button
                 onClick={(e) => setColumnsMenuAnchor(e.currentTarget)}
                 className="px-3 h-9 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-bold transition"
               >
                 Columns
               </button>
               <div className="h-7 w-[1px] bg-white/10 mx-1 hidden lg:block" />
               <div className="flex items-center p-1 bg-[#0f172a] rounded-xl border border-white/5">
                  <button onClick={() => setView("table")} className={`p-1.5 rounded-lg transition-all ${view === 'table' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><List size={17} /></button>
                  <button onClick={() => setView("kanban")} className={`p-1.5 rounded-lg transition-all ${view === 'kanban' ? 'bg-indigo-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}><LayoutGrid size={17} /></button>
               </div>
             </div>
          </div>
        </div>

        <div className="min-h-0 flex-1">
        {view === "kanban" ? (
          <div className="h-full overflow-auto custom-scrollbar p-8">
             <RepairKanban repairs={filtered} onStatusChange={async (id, status) => {
               try {
                 await api.put(`/repairs/${id}/status?status=${encodeURIComponent(status)}&note=${encodeURIComponent("Moved in board view")}`);
                 setData((data || []).map((r) => (r.id === id ? { ...r, status } : r)));
                 toast(`Moved to ${status}`, "success");
               } catch {
                 toast("Failed to move ticket", "error");
               }
             }} onViewDetails={showDetails} />
          </div>
        ) : (
          <div className="h-full custom-scrollbar">
            <TableContainer sx={{ height: "100%", overflow: "auto" }} className="custom-scrollbar">
            <MuiTable stickyHeader size="small" sx={{ minWidth: 1700 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ bgcolor: "rgba(15,23,42,0.95)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <Checkbox
                      checked={selectedRows.length > 0 && selectedRows.length === sortedRepairs.length}
                      indeterminate={selectedRows.length > 0 && selectedRows.length < sortedRepairs.length}
                      onChange={(e) => setSelectedRows(e.target.checked ? sortedRepairs.map((r) => r.id) : [])}
                      sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" } }}
                    />
                  </TableCell>
                  {REPAIR_COLUMNS.filter((col) => visibleColumns[col.key]).map(({ key, label, sortable }) => (
                    <TableCell
                      key={key}
                      sx={{ bgcolor: "rgba(15,23,42,0.95)", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.10em", fontWeight: 700 }}
                    >
                      {!sortable ? label : (
                        <TableSortLabel
                          active={tableSortBy === key}
                          direction={tableSortBy === key ? tableSortDir : "asc"}
                          onClick={() => handleSort(key)}
                          sx={{ color: "#94a3b8 !important", "& .MuiTableSortLabel-icon": { color: "#64748b !important" } }}
                        >
                          {label}
                        </TableSortLabel>
                      )}
                    </TableCell>
                  ))}
                  <TableCell align="right" sx={{ bgcolor: "rgba(15,23,42,0.95)", color: "#94a3b8", borderBottom: "1px solid rgba(255,255,255,0.08)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.10em", fontWeight: 700 }}>
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedRepairs.map((r, idx) => {
                  const createdDays = Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24));
                  const overdue = !["Completed", "Delivered"].includes(r.status) && createdDays > 3;
                  const balance = Math.max(0, (r.estimated_cost || 0) - (r.advance_payment || 0));
                  const rowGlobalIndex = tablePage * tableRowsPerPage + idx;
                  return (
                  <TableRow key={r.id} hover selected={rowGlobalIndex === activeRowIndex} sx={{ "& td": { borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#cbd5e1", py: 1.15 }, "&.Mui-selected": { backgroundColor: "rgba(99,102,241,0.14) !important" } }}>
                    <TableCell padding="checkbox">
                      <Checkbox checked={selectedRows.includes(r.id)} onChange={(e) => setSelectedRows(e.target.checked ? [...selectedRows, r.id] : selectedRows.filter(id => id !== r.id))} sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" } }} />
                    </TableCell>
                    {visibleColumns.ticket_no && <TableCell onClick={() => showDetails(r)} sx={{ cursor: "pointer", fontWeight: 800, color: "#818cf8" }}>#{r.ticket_no}</TableCell>}
                    {visibleColumns.customer_name && <TableCell sx={{ fontWeight: 700, color: "#e2e8f0" }}>{r.customer_name || "-"}</TableCell>}
                    {visibleColumns.customer_phone && <TableCell sx={{ color: "#94a3b8" }}>{r.customer_phone || "077-xxx-xxxx"}</TableCell>}
                    {visibleColumns.device_model && <TableCell sx={{ fontWeight: 700, color: "#c4b5fd" }}>{r.device_model}</TableCell>}
                    {visibleColumns.issue && <TableCell sx={{ maxWidth: 180, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.issue}</TableCell>}
                    {visibleColumns.priority && (
                      <TableCell>
                        <Chip size="small" label={(r.priority || "Normal").toUpperCase()} sx={{ fontWeight: 700, bgcolor: r.priority === "Urgent" ? "rgba(225,29,72,0.2)" : r.priority === "High" ? "rgba(245,158,11,0.18)" : r.priority === "Low" ? "rgba(56,189,248,0.18)" : "rgba(148,163,184,0.18)", color: "#f8fafc", border: "1px solid rgba(255,255,255,0.14)" }} />
                      </TableCell>
                    )}
                    {visibleColumns.sla && <TableCell>{overdue ? <span className="text-rose-400 text-[11px] font-black inline-flex items-center gap-1"><AlertTriangle size={12} />Overdue {createdDays}d</span> : <span className="text-emerald-400 text-[11px] font-bold">Due in {Math.max(0, 3 - createdDays)}d</span>}</TableCell>}
                    {visibleColumns.technician && <TableCell sx={{ color: "#e2e8f0", fontWeight: 600 }}>{r.technician || "-"}</TableCell>}
                    {visibleColumns.estimated_cost && <TableCell sx={{ color: "#e2e8f0", fontWeight: 700 }}>Rs. {(r.estimated_cost || 0).toLocaleString()}</TableCell>}
                    {visibleColumns.advance_payment && <TableCell sx={{ color: "#a5b4fc", fontWeight: 700 }}>Rs. {(r.advance_payment || 0).toLocaleString()}</TableCell>}
                    {visibleColumns.balance && <TableCell sx={{ color: "#fda4af", fontWeight: 800 }}>Rs. {balance.toLocaleString()}</TableCell>}
                    {visibleColumns.status && (
                      <TableCell>
                        <Chip
                          size="small"
                          onClick={() => openStatusModal(r)}
                          label={String(r.status || "").toUpperCase()}
                          sx={{ cursor: "pointer", fontWeight: 700, bgcolor: "rgba(255,255,255,0.04)", color: "#d1d5db", border: "1px solid rgba(255,255,255,0.10)" }}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.created_at && <TableCell sx={{ color: "#94a3b8", fontWeight: 700 }}>{new Date(r.created_at).toISOString().split('T')[0]}</TableCell>}
                    {visibleColumns.parts && <TableCell>{r.status === "Waiting for parts" ? <Chip size="small" label="Waiting Parts" sx={{ bgcolor: "rgba(245,158,11,0.18)", color: "#fcd34d" }} /> : <Chip size="small" label="Parts Ready" sx={{ bgcolor: "rgba(16,185,129,0.18)", color: "#86efac" }} />}</TableCell>}
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <Tooltip title="Quick Status"><IconButton size="small" onClick={() => cycleStatus(r)} sx={{ color: "#a5b4fc" }}><CheckCheck size={14} /></IconButton></Tooltip>
                        <Tooltip title="Actions"><IconButton size="small" onClick={(e) => openRowMenu(e, r)} sx={{ color: "#94a3b8" }}><MoreVertical size={14} /></IconButton></Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                )})}
                {pagedRepairs.length === 0 && (
                  <TableRow><TableCell colSpan={REPAIR_COLUMNS.filter((c) => visibleColumns[c.key]).length + 2} sx={{ textAlign: "center", color: "#64748b", py: 4 }}>No repair tickets found for current filters.</TableCell></TableRow>
                )}
              </TableBody>
            </MuiTable>
            </TableContainer>
            <TablePagination
              component="div"
              rowsPerPageOptions={[10, 25, 50, 100]}
              count={sortedRepairs.length}
              rowsPerPage={tableRowsPerPage}
              page={tablePage}
              onPageChange={(_, p) => setTablePage(p)}
              onRowsPerPageChange={(e) => {
                setTableRowsPerPage(parseInt(e.target.value, 10));
                setTablePage(0);
              }}
              sx={{
                borderTop: "1px solid rgba(255,255,255,0.08)",
                color: "#94a3b8",
                ".MuiTablePagination-selectIcon": { color: "#94a3b8" },
              }}
            />
            <Menu
              anchorEl={columnsMenuAnchor}
              open={Boolean(columnsMenuAnchor)}
              onClose={() => setColumnsMenuAnchor(null)}
              PaperProps={{ sx: { bgcolor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" } }}
            >
              {REPAIR_COLUMNS.map((col) => (
                <MenuItem key={col.key} onClick={() => toggleColumn(col.key)} sx={{ gap: 1 }}>
                  <Checkbox checked={Boolean(visibleColumns[col.key])} sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" }, p: 0.5 }} />
                  {col.label}
                </MenuItem>
              ))}
            </Menu>
            <Menu
              anchorEl={rowMenuAnchor}
              open={Boolean(rowMenuAnchor)}
              onClose={closeRowMenu}
              PaperProps={{ sx: { bgcolor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" } }}
            >
              <MenuItem onClick={() => { if (rowMenuRepair) showDetails(rowMenuRepair); closeRowMenu(); }}>View Details</MenuItem>
              <MenuItem onClick={() => { if (rowMenuRepair) openStatusModal(rowMenuRepair); closeRowMenu(); }}>Update Status</MenuItem>
              <MenuItem onClick={() => { if (rowMenuRepair) notify(rowMenuRepair); closeRowMenu(); }}>Notify Customer</MenuItem>
              <MenuItem onClick={() => { if (rowMenuRepair) printTicket(rowMenuRepair); closeRowMenu(); }}>Print Job Card</MenuItem>
            </Menu>
          </div>
        )}
        </div>
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
                <Input type="number" placeholder="0.00" value={form.estimated_cost} onChange={e => setForm({...form, estimated_cost: Number(e.target.value)})} />
              </div>
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Advance Deposit</p>
                <Input type="number" placeholder="0.00" value={form.advance_payment || ''} onChange={e => setForm({...form, advance_payment: Number(e.target.value)})} className="border-indigo-500/50 focus:border-indigo-400 bg-indigo-500/10" />
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
                  setForm({ customer_id: '', device_model: '', imei: '', issue: '', technician: defaultTechnician, estimated_cost: 0, advance_payment: 0, notes: '', priority: 'Normal' });
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
                    <div className="text-right space-y-1">
                       <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Labor Cost</p>
                       <p className="text-sm font-bold text-slate-300">LKR {selectedRepair.estimated_cost.toLocaleString()}</p>
                       
                       {selectedRepair.advance_payment > 0 && (
                         <>
                           <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest pt-2">Deposit Paid</p>
                           <p className="text-sm font-bold text-emerald-400">- LKR {selectedRepair.advance_payment.toLocaleString()}</p>
                           
                           <p className="text-[10px] font-bold text-rose-500 uppercase tracking-widest pt-2">Balance Due</p>
                           <p className="text-lg font-black text-rose-400">
                             LKR {Math.max(0, (selectedRepair.estimated_cost + parts.reduce((acc, p) => acc + (p.quantity * p.unit_cost), 0)) - selectedRepair.advance_payment).toLocaleString()}
                           </p>
                         </>
                       )}
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
