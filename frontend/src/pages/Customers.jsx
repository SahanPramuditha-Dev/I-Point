import { useMemo, useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import { useFetch } from "../hooks/useFetch";
import api from "../lib/api";
import { Badge, KpiCard } from "../components/UI";
import {
  Checkbox,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Table as MuiTable,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  Tooltip,
} from "@mui/material";
import {
  Mail,
  Users,
  Search,
  Plus,
  ExternalLink,
  X,
  DollarSign,
  Shield,
  FileText,
  UserCheck,
  MoreVertical,
  Edit2,
  Trash2,
  AlertTriangle,
  Filter,
} from "lucide-react";
import { useFeedback } from "../components/FeedbackProvider";

const CUSTOMER_COLUMNS = [
  { key: "name", label: "Customer Name", sortable: true },
  { key: "phone", label: "Phone", sortable: true },
  { key: "email", label: "Email", sortable: false },
  { key: "address", label: "Address", sortable: false },
  { key: "total_spent", label: "Total Spent", sortable: true },
  { key: "outstanding_balance", label: "Outstanding Balance", sortable: true },
  { key: "repairs_count", label: "Repairs", sortable: true },
  { key: "last_visit", label: "Last Visit", sortable: true },
  { key: "warranty_items", label: "Active Warranties", sortable: false },
];

const DEFAULT_VISIBLE_COLUMNS = CUSTOMER_COLUMNS.reduce((acc, col) => {
  acc[col.key] = true;
  return acc;
}, {});

const QUICK_FILTERS = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "outstanding", label: "Outstanding" },
  { key: "recent", label: "Visited 30d" },
];

export default function Customers() {
  const { toast, confirm } = useFeedback();
  const { data: customers, setData: setCustomers, loading: customersLoading } = useFetch("/customers");
  const { data: sales, loading: salesLoading } = useFetch("/pos/sales");
  const { data: repairs, loading: repairsLoading } = useFetch("/repairs");

  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editCustomerId, setEditCustomerId] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", notes: "" });
  const [selectedRows, setSelectedRows] = useState([]);
  const [tableSortBy, setTableSortBy] = useState("name");
  const [tableSortDir, setTableSortDir] = useState("asc");
  const [tablePage, setTablePage] = useState(0);
  const [tableRowsPerPage, setTableRowsPerPage] = useState(25);
  const [visibleColumns, setVisibleColumns] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [columnsMenuAnchor, setColumnsMenuAnchor] = useState(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState(null);
  const [rowMenuCustomer, setRowMenuCustomer] = useState(null);
  const [showWalkInModal, setShowWalkInModal] = useState(false);
  const [walkInForm, setWalkInForm] = useState({ name: "", phone: "" });

  const salesByCustomerId = useMemo(() => {
    const map = new Map();
    for (const sale of sales || []) {
      if (sale.is_voided || !sale.customer_id) continue;
      const list = map.get(sale.customer_id) || [];
      list.push(sale);
      map.set(sale.customer_id, list);
    }
    return map;
  }, [sales]);

  const repairsByCustomerId = useMemo(() => {
    const map = new Map();
    for (const repair of repairs || []) {
      if (!repair.customer_id) continue;
      const list = map.get(repair.customer_id) || [];
      list.push(repair);
      map.set(repair.customer_id, list);
    }
    return map;
  }, [repairs]);

  const enhancedCustomers = useMemo(() => {
    if (!customers) return [];

    return customers.map((customer) => {
      const customerSales = salesByCustomerId.get(customer.id) || [];
      const customerRepairs = repairsByCustomerId.get(customer.id) || [];

      const totalSpent = customerSales.reduce((sum, s) => sum + (s.total || 0), 0);
      const outstandingBalance = customerRepairs
        .filter((r) => !["Delivered", "Cancelled"].includes(r.status))
        .reduce((sum, r) => sum + Math.max(0, (r.estimated_cost || 0) - (r.advance_payment || 0)), 0);

      const lastVisitTimestamp = Math.max(
        0,
        ...customerSales.map((s) => new Date(s.created_at).getTime()),
        ...customerRepairs.map((r) => new Date(r.created_at).getTime())
      );
      const lastVisit = lastVisitTimestamp > 0 ? new Date(lastVisitTimestamp) : null;

      const activeWarranties = customerSales.filter((s) => {
        const saleDate = new Date(s.created_at);
        const now = new Date();
        return (now - saleDate) / (1000 * 60 * 60 * 24) < 365;
      }).length;

      return {
        ...customer,
        total_spent: totalSpent,
        outstanding_balance: outstandingBalance,
        repairs_count: customerRepairs.length,
        last_visit: lastVisit,
        warranty_items: activeWarranties,
        sales_count: customerSales.length,
      };
    });
  }, [customers, salesByCustomerId, repairsByCustomerId]);

  const filteredCustomers = useMemo(() => {
    const now = Date.now();
    const query = searchQuery.trim().toLowerCase();

    let filtered = enhancedCustomers.filter((c) => {
      if (query) {
        const matchesText =
          c.name.toLowerCase().includes(query) ||
          c.phone.includes(query) ||
          (c.email || "").toLowerCase().includes(query) ||
          (c.address || "").toLowerCase().includes(query);
        if (!matchesText) return false;
      }

      if (quickFilter === "vip" && c.total_spent <= 100000) return false;
      if (quickFilter === "outstanding" && c.outstanding_balance <= 0) return false;
      if (quickFilter === "recent") {
        if (!c.last_visit) return false;
        const ageDays = (now - c.last_visit.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > 30) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      let aVal = a[tableSortBy];
      let bVal = b[tableSortBy];

      if (tableSortBy === "last_visit") {
        aVal = aVal ? aVal.getTime() : 0;
        bVal = bVal ? bVal.getTime() : 0;
      }

      if (typeof aVal === "string") {
        aVal = aVal.toLowerCase();
        bVal = (bVal || "").toLowerCase();
      }

      if (aVal < bVal) return tableSortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return tableSortDir === "asc" ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [enhancedCustomers, searchQuery, quickFilter, tableSortBy, tableSortDir]);

  const pagedCustomers = useMemo(() => {
    const start = tablePage * tableRowsPerPage;
    return filteredCustomers.slice(start, start + tableRowsPerPage);
  }, [filteredCustomers, tablePage, tableRowsPerPage]);

  useEffect(() => {
    setTablePage(0);
  }, [searchQuery, quickFilter, tableSortBy, tableSortDir]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filteredCustomers.length / tableRowsPerPage) - 1);
    if (tablePage > maxPage) setTablePage(maxPage);
  }, [filteredCustomers.length, tableRowsPerPage, tablePage]);

  useEffect(() => {
    setSelectedRows((prev) => prev.filter((id) => filteredCustomers.some((c) => c.id === id)));
  }, [filteredCustomers]);

  const handleSort = (column) => {
    if (tableSortBy === column) {
      setTableSortDir(tableSortDir === "asc" ? "desc" : "asc");
    } else {
      setTableSortBy(column);
      setTableSortDir("asc");
    }
  };

  const openRowMenu = (event, customer) => {
    setRowMenuAnchor(event.currentTarget);
    setRowMenuCustomer(customer);
  };

  const openEditModal = (customer) => {
    setEditCustomerId(customer.id);
    setForm({
      name: customer.name || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      notes: customer.notes || "",
    });
    setShowEditModal(true);
  };

  const add = async () => {
    if (!form.name.trim() || !form.phone.trim()) return toast("Name and Phone are required", "warning");
    try {
      const r = await api.post("/customers", {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      setCustomers([r.data, ...(customers || [])]);
      setForm({ name: "", phone: "", email: "", address: "", notes: "" });
      setShowAddModal(false);
      toast("Customer profile created", "success");
    } catch {
      toast("Failed to create customer", "error");
    }
  };

  const saveEdit = async () => {
    if (!form.name.trim() || !form.phone.trim()) return toast("Name and Phone are required", "warning");
    try {
      const r = await api.put(`/customers/${editCustomerId}`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      });
      setCustomers((customers || []).map((c) => (c.id === editCustomerId ? r.data : c)));
      setShowEditModal(false);
      setEditCustomerId(null);
      setForm({ name: "", phone: "", email: "", address: "", notes: "" });
      toast("Customer profile updated", "success");
    } catch {
      toast("Failed to update customer", "error");
    }
  };

  const addWalkIn = async () => {
    if (!walkInForm.name.trim() || !walkInForm.phone.trim()) return toast("Name and Phone are required", "warning");
    try {
      const r = await api.post("/customers", { name: walkInForm.name.trim(), phone: walkInForm.phone.trim(), address: "Walk-in Customer" });
      setCustomers([r.data, ...(customers || [])]);
      setWalkInForm({ name: "", phone: "" });
      setShowWalkInModal(false);
      toast("Walk-in customer added", "success");
    } catch {
      toast("Failed to add walk-in customer", "error");
    }
  };

  const deleteCustomer = async (customer) => {
    const ok = await confirm("Delete Customer", `Are you sure you want to delete ${customer.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      await api.delete(`/customers/${customer.id}`);
      setCustomers((customers || []).filter((c) => c.id !== customer.id));
      setSelectedRows((prev) => prev.filter((id) => id !== customer.id));
      toast("Customer deleted", "success");
    } catch {
      toast("Failed to delete customer", "error");
    }
  };

  const deleteSelected = async () => {
    if (selectedRows.length === 0) return;
    const ok = await confirm("Delete Selected Customers", `Delete ${selectedRows.length} selected customer(s)? This cannot be undone.`);
    if (!ok) return;

    try {
      await Promise.all(selectedRows.map((id) => api.delete(`/customers/${id}`)));
      setCustomers((customers || []).filter((c) => !selectedRows.includes(c.id)));
      setSelectedRows([]);
      toast("Selected customers deleted", "success");
    } catch {
      toast("Failed to delete one or more customers", "error");
    }
  };

  const stats = useMemo(() => {
    const total = enhancedCustomers.length;
    const withEmail = enhancedCustomers.filter((c) => c.email).length;
    const withOutstanding = enhancedCustomers.filter((c) => c.outstanding_balance > 0).length;
    const totalOutstanding = enhancedCustomers.reduce((sum, c) => sum + c.outstanding_balance, 0);
    const vipCustomers = enhancedCustomers.filter((c) => c.total_spent > 100000).length;

    return { total, withEmail, withOutstanding, totalOutstanding, vipCustomers };
  }, [enhancedCustomers]);

  if (customersLoading || salesLoading || repairsLoading) {
    return <div className="flex items-center justify-center h-64 text-slate-400">Loading Customer Data...</div>;
  }

  return (
    <div className="flex flex-col h-full gap-4 pb-4">
      <div className="flex flex-wrap justify-between items-end gap-3 shrink-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white">Customer Management</h1>
          <p className="text-xs text-slate-400 mt-1">Manage customer profiles, history, and relationships</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowWalkInModal(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-900/20 transition-all flex items-center gap-2"
          >
            <UserCheck size={14} /> Walk-in Customer
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Add Customer
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3 shrink-0">
        <KpiCard tone="sky" title="Total Customers" value={String(stats.total)} icon={<Users size={18} />} />
        <KpiCard tone="indigo" title="Email Contacts" value={String(stats.withEmail)} icon={<Mail size={18} />} />
        <KpiCard tone="amber" title="VIP Customers" value={String(stats.vipCustomers)} icon={<Shield size={18} />} />
        <KpiCard tone="green" title="With Outstanding" value={String(stats.withOutstanding)} icon={<DollarSign size={18} />} />
        <KpiCard tone="red" title="Total Outstanding" value={`Rs. ${stats.totalOutstanding.toLocaleString()}`} icon={<AlertTriangle size={18} />} />
      </div>

      <div className="flex-1 bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-white/5 bg-black/20 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">Customer Directory</div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="relative w-72 sm:w-80">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                placeholder="Search by name, phone, email, or address..."
                className="w-full bg-black/40 border border-white/10 rounded-lg py-2 pl-9 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-1 bg-black/30 border border-white/10 rounded-lg px-2 py-1">
              <Filter size={12} className="text-slate-500" />
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={`px-2 py-1 rounded text-[10px] font-bold ${
                    quickFilter === f.key ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <IconButton size="small" onClick={(e) => setColumnsMenuAnchor(e.currentTarget)} sx={{ color: "#94a3b8" }}>
              <FileText size={14} />
            </IconButton>
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div className="px-4 py-2 border-b border-white/10 bg-rose-950/30 flex items-center justify-between">
            <span className="text-xs text-slate-300 font-bold">{selectedRows.length} selected</span>
            <button
              onClick={deleteSelected}
              className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30"
            >
              Delete Selected
            </button>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <TableContainer sx={{ height: "100%", overflow: "auto" }} className="custom-scrollbar">
            <MuiTable stickyHeader size="small" sx={{ minWidth: 1200 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ bgcolor: "rgba(15,23,42,0.95)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <Checkbox
                      checked={selectedRows.length > 0 && selectedRows.length === filteredCustomers.length}
                      indeterminate={selectedRows.length > 0 && selectedRows.length < filteredCustomers.length}
                      onChange={(e) => setSelectedRows(e.target.checked ? filteredCustomers.map((c) => c.id) : [])}
                      sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" } }}
                    />
                  </TableCell>
                  {CUSTOMER_COLUMNS.filter((col) => visibleColumns[col.key]).map(({ key, label, sortable }) => (
                    <TableCell
                      key={key}
                      sx={{
                        bgcolor: "rgba(15,23,42,0.95)",
                        color: "#94a3b8",
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        fontSize: "11px",
                        textTransform: "uppercase",
                        letterSpacing: "0.10em",
                        fontWeight: 700,
                      }}
                    >
                      {!sortable ? (
                        label
                      ) : (
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
                  <TableCell
                    align="right"
                    sx={{
                      bgcolor: "rgba(15,23,42,0.95)",
                      color: "#94a3b8",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      fontSize: "11px",
                      textTransform: "uppercase",
                      letterSpacing: "0.10em",
                      fontWeight: 700,
                    }}
                  >
                    Actions
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedCustomers.map((c) => (
                  <TableRow key={c.id} hover sx={{ "& td": { borderBottom: "1px solid rgba(255,255,255,0.05)", color: "#cbd5e1", py: 1.15 } }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedRows.includes(c.id)}
                        onChange={(e) =>
                          setSelectedRows(e.target.checked ? [...selectedRows, c.id] : selectedRows.filter((id) => id !== c.id))
                        }
                        sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" } }}
                      />
                    </TableCell>
                    {visibleColumns.name && (
                      <TableCell sx={{ fontWeight: 700, color: "#e2e8f0" }}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-black text-sm uppercase border border-indigo-500/20">
                            {c.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold">{c.name}</div>
                            {c.total_spent > 100000 && (
                              <Badge tone="amber" className="text-[9px] mt-1">
                                VIP
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                    )}
                    {visibleColumns.phone && <TableCell sx={{ color: "#94a3b8" }}>{c.phone}</TableCell>}
                    {visibleColumns.email && <TableCell sx={{ color: "#94a3b8" }}>{c.email || "-"}</TableCell>}
                    {visibleColumns.address && (
                      <TableCell sx={{ maxWidth: 150, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {c.address || "-"}
                      </TableCell>
                    )}
                    {visibleColumns.total_spent && <TableCell sx={{ color: "#10b981", fontWeight: 700 }}>Rs. {c.total_spent.toLocaleString()}</TableCell>}
                    {visibleColumns.outstanding_balance && (
                      <TableCell sx={{ color: c.outstanding_balance > 0 ? "#ef4444" : "#10b981", fontWeight: 700 }}>
                        Rs. {c.outstanding_balance.toLocaleString()}
                      </TableCell>
                    )}
                    {visibleColumns.repairs_count && <TableCell sx={{ color: "#e2e8f0", fontWeight: 600 }}>{c.repairs_count}</TableCell>}
                    {visibleColumns.last_visit && <TableCell sx={{ color: "#94a3b8" }}>{c.last_visit ? c.last_visit.toLocaleDateString() : "Never"}</TableCell>}
                    {visibleColumns.warranty_items && (
                      <TableCell>
                        {c.warranty_items > 0 ? (
                          <Chip size="small" label={`${c.warranty_items} active`} sx={{ bgcolor: "rgba(16,185,129,0.18)", color: "#86efac" }} />
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell align="right">
                      <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                        <NavLink
                          to={`/customers/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-white/5 text-slate-300 text-xs font-bold hover:bg-indigo-500/20 hover:text-indigo-300 transition-colors"
                        >
                          Profile <ExternalLink size={12} />
                        </NavLink>
                        <Tooltip title="Actions">
                          <IconButton size="small" onClick={(e) => openRowMenu(e, c)} sx={{ color: "#94a3b8" }}>
                            <MoreVertical size={14} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {pagedCustomers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={CUSTOMER_COLUMNS.filter((c) => visibleColumns[c.key]).length + 2} sx={{ textAlign: "center", color: "#64748b", py: 8 }}>
                      {searchQuery || quickFilter !== "all" ? "No customers match the current search/filter." : "No customers yet. Add your first customer profile."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </MuiTable>
          </TableContainer>
        </div>

        <TablePagination
          component="div"
          rowsPerPageOptions={[10, 25, 50, 100]}
          count={filteredCustomers.length}
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
          {CUSTOMER_COLUMNS.map((col) => (
            <MenuItem key={col.key} onClick={() => setVisibleColumns({ ...visibleColumns, [col.key]: !visibleColumns[col.key] })}>
              <Checkbox checked={visibleColumns[col.key]} sx={{ color: "#94a3b8", "&.Mui-checked": { color: "#818cf8" } }} />
              {col.label}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          anchorEl={rowMenuAnchor}
          open={Boolean(rowMenuAnchor)}
          onClose={() => setRowMenuAnchor(null)}
          PaperProps={{ sx: { bgcolor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" } }}
        >
          <MenuItem
            onClick={() => {
              if (rowMenuCustomer) openEditModal(rowMenuCustomer);
              setRowMenuAnchor(null);
            }}
          >
            <Edit2 size={14} className="mr-2" /> Edit Customer
          </MenuItem>
          <MenuItem
            onClick={() => {
              if (rowMenuCustomer) deleteCustomer(rowMenuCustomer);
              setRowMenuAnchor(null);
            }}
            sx={{ color: "#ef4444" }}
          >
            <Trash2 size={14} className="mr-2" /> Delete Customer
          </MenuItem>
        </Menu>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Users size={20} className="text-indigo-400" /> New Customer Profile
              </h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Full Name</label>
                <input
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="e.g. Kasun Perera"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Phone Number</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="07XXXXXXXX"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="kasun@example.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Physical Address</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  placeholder="City / Area"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Notes</label>
                <textarea
                  className="w-full min-h-[80px] bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Customer notes, preferences, reminders..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button onClick={() => setShowAddModal(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={add} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 transition-all">
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Edit2 size={20} className="text-indigo-400" /> Edit Customer
              </h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-5">
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Full Name</label>
                <input
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Phone Number</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Email Address</label>
                <input
                  type="email"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Physical Address</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Notes</label>
                <textarea
                  className="w-full min-h-[80px] bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button onClick={() => setShowEditModal(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={saveEdit} className="flex-1 py-3 rounded-xl font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-900/50 transition-all">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {showWalkInModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-[#0f172a] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95">
            <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <UserCheck size={20} className="text-amber-400" /> Quick Walk-in Customer
              </h2>
              <button onClick={() => setShowWalkInModal(false)} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 grid grid-cols-1 gap-5">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Customer Name</label>
                <input
                  autoFocus
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="Enter customer name"
                  value={walkInForm.name}
                  onChange={(e) => setWalkInForm({ ...walkInForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Phone Number</label>
                <input
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-amber-500"
                  placeholder="07XXXXXXXX"
                  value={walkInForm.phone}
                  onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.02] flex gap-3">
              <button onClick={() => setShowWalkInModal(false)} className="flex-1 py-3 rounded-xl font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors">
                Cancel
              </button>
              <button onClick={addWalkIn} className="flex-1 py-3 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-900/50 transition-all">
                Add Walk-in
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
