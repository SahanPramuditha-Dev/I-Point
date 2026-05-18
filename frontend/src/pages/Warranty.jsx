import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Clock4,
  FileSearch,
  Filter,
  Layers3,
  PackageCheck,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Wrench,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";
import { Badge, Button, KpiCard, SectionCard, Table } from "../components/UI";

const STATUS_TONES = {
  Active: "green",
  Expired: "red",
  Claimed: "amber",
  Rejected: "red",
  Replaced: "indigo",
};

const CLAIM_STATUS_TONES = {
  "Pending Inspection": "amber",
  Approved: "green",
  Rejected: "red",
  Repaired: "sky",
  Replaced: "indigo",
  Closed: "slate",
};

const CLAIM_STATUS_FLOW = [
  "Pending Inspection",
  "Approved",
  "Rejected",
  "Repaired",
  "Replaced",
  "Closed",
];

const WARRANTY_STATUS_FLOW = ["Active", "Expired", "Claimed", "Rejected", "Replaced"];

const CHART_COLORS = ["#22c55e", "#f59e0b", "#ef4444", "#6366f1", "#06b6d4", "#a855f7"];

function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function toHumanDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

function dayDiff(from, to = new Date()) {
  const start = new Date(from);
  if (Number.isNaN(start.getTime())) return 0;
  const end = new Date(to);
  return Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
}

function MiniTable({ columns, rows, emptyLabel = "No data found." }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <Table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.label}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {!rows.length && (
            <tr>
              <td colSpan={columns.length} className="py-6 text-slate-400">
                {emptyLabel}
              </td>
            </tr>
          )}
          {rows.map((row, index) => (
            <tr key={row.id || row.warranty_id || row.claim_id || index}>
              {columns.map((col) => (
                <td key={`${col.label}-${row.id || row.warranty_id || row.claim_id || index}`}>
                  {typeof col.value === "function" ? col.value(row, index) : row[col.value]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function Warranty() {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState([]);
  const [claims, setClaims] = useState([]);
  const [rules, setRules] = useState([]);
  const [conditions, setConditions] = useState([]);
  const [reports, setReports] = useState(null);
  const [lookupRows, setLookupRows] = useState([]);
  const [activeTab, setActiveTab] = useState("records");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedWarranty, setSelectedWarranty] = useState(null);
  const [selectedWarrantyStatus, setSelectedWarrantyStatus] = useState("Active");
  const [selectedWarrantyNote, setSelectedWarrantyNote] = useState("");

  const [filters, setFilters] = useState({
    q: "",
    status: "all",
    warranty_type: "all",
    category: "all",
    brand: "all",
    supplier: "all",
    date_from: "",
    date_to: "",
  });
  const [lookupQuery, setLookupQuery] = useState("");
  const [filterOptions, setFilterOptions] = useState({
    categories: [],
    brands: [],
    suppliers: [],
    customers: [],
    inventory_items: [],
    repairs: [],
    invoices: [],
  });

  const [claimForm, setClaimForm] = useState({
    warranty_id: "",
    customer_complaint: "",
    technician_inspection_note: "",
    claim_status: "Pending Inspection",
    claim_decision: "",
    replacement_item: "",
    repair_action: "",
  });

  const [ruleForm, setRuleForm] = useState({
    rule_name: "",
    scope_type: "product_category",
    scope_value: "*",
    warranty_days: 30,
    description: "",
    is_active: true,
  });

  const [conditionForm, setConditionForm] = useState({
    condition_code: "",
    title: "",
    description: "",
    is_covered: false,
    is_active: true,
    sort_order: 0,
  });

  const buildParams = useCallback((values) => {
    const params = new URLSearchParams();
    Object.entries(values || {}).forEach(([key, value]) => {
      if (value === null || value === undefined) return;
      if (value === "") return;
      if (String(value).toLowerCase() === "all") return;
      params.set(key, String(value));
    });
    return params.toString();
  }, []);

  const loadCore = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildParams(filters);
      const [dashRes, recordsRes, claimsRes] = await Promise.all([
        api.get(`/warranty/dashboard${query ? `?${query}` : ""}`),
        api.get(`/warranty/records${query ? `?${query}` : ""}`),
        api.get(`/warranty/claims${query ? `?${query}` : ""}`),
      ]);
      setDashboard(dashRes.data || null);
      setRecords(Array.isArray(recordsRes.data) ? recordsRes.data : []);
      setClaims(Array.isArray(claimsRes.data) ? claimsRes.data : []);
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to load warranty data", "error");
    } finally {
      setLoading(false);
    }
  }, [buildParams, filters, toast]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [rulesRes, conditionsRes, filtersRes, reportsRes] = await Promise.all([
        api.get("/warranty/rules"),
        api.get("/warranty/conditions"),
        api.get("/warranty/filters"),
        api.get("/warranty/reports"),
      ]);
      setRules(Array.isArray(rulesRes.data) ? rulesRes.data : []);
      setConditions(Array.isArray(conditionsRes.data) ? conditionsRes.data : []);
      setFilterOptions(filtersRes.data || {});
      setReports(reportsRes.data || null);
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to load warranty reference data", "error");
    }
  }, [toast]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadCore(), loadReferenceData()]);
  }, [loadCore, loadReferenceData]);

  const performLookup = useCallback(async () => {
    const trimmed = lookupQuery.trim();
    if (!trimmed) {
      setLookupRows([]);
      return;
    }
    try {
      const res = await api.get(`/warranty/lookup?q=${encodeURIComponent(trimmed)}`);
      setLookupRows(Array.isArray(res.data) ? res.data : []);
      if (!res.data?.length) {
        toast("No matching warranty records found", "warning");
      }
    } catch (error) {
      toast(error.response?.data?.detail || "Lookup failed", "error");
    }
  }, [lookupQuery, toast]);

  const openWarrantyDrawer = useCallback(
    async (record) => {
      if (!record?.id) return;
      setDrawerOpen(true);
      setBusy(true);
      try {
        const res = await api.get(`/warranty/records/${record.id}`);
        const payload = res.data || null;
        setSelectedWarranty(payload);
        setSelectedWarrantyStatus(payload?.status || "Active");
        setSelectedWarrantyNote(payload?.notes || "");
        setClaimForm((prev) => ({
          ...prev,
          warranty_id: String(payload?.id || ""),
        }));
      } catch (error) {
        toast(error.response?.data?.detail || "Failed to load warranty details", "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const updateSelectedWarrantyStatus = useCallback(async () => {
    if (!selectedWarranty?.id) return;
    setBusy(true);
    try {
      await api.put(
        `/warranty/records/${selectedWarranty.id}/status?status=${encodeURIComponent(
          selectedWarrantyStatus,
        )}&notes=${encodeURIComponent(selectedWarrantyNote || "")}`,
      );
      toast("Warranty status updated", "success");
      await loadCore();
      const refreshed = await api.get(`/warranty/records/${selectedWarranty.id}`);
      setSelectedWarranty(refreshed.data || null);
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to update warranty status", "error");
    } finally {
      setBusy(false);
    }
  }, [loadCore, selectedWarranty, selectedWarrantyNote, selectedWarrantyStatus, toast]);

  const submitClaim = useCallback(async () => {
    if (!claimForm.warranty_id || !claimForm.customer_complaint.trim()) {
      toast("Warranty and complaint are required", "warning");
      return;
    }
    setBusy(true);
    try {
      await api.post("/warranty/claims", {
        ...claimForm,
        warranty_id: Number(claimForm.warranty_id),
      });
      toast("Warranty claim created", "success");
      setClaimForm({
        warranty_id: claimForm.warranty_id,
        customer_complaint: "",
        technician_inspection_note: "",
        claim_status: "Pending Inspection",
        claim_decision: "",
        replacement_item: "",
        repair_action: "",
      });
      await loadCore();
      if (selectedWarranty?.id) {
        const refreshed = await api.get(`/warranty/records/${selectedWarranty.id}`);
        setSelectedWarranty(refreshed.data || null);
      }
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to create claim", "error");
    } finally {
      setBusy(false);
    }
  }, [claimForm, loadCore, selectedWarranty?.id, toast]);

  const updateClaimStatus = useCallback(
    async (claimId, nextStatus) => {
      setBusy(true);
      try {
        await api.put(`/warranty/claims/${claimId}`, {
          claim_status: nextStatus,
        });
        toast(`Claim moved to ${nextStatus}`, "success");
        await loadCore();
        if (selectedWarranty?.id) {
          const refreshed = await api.get(`/warranty/records/${selectedWarranty.id}`);
          setSelectedWarranty(refreshed.data || null);
        }
      } catch (error) {
        toast(error.response?.data?.detail || "Failed to update claim status", "error");
      } finally {
        setBusy(false);
      }
    },
    [loadCore, selectedWarranty?.id, toast],
  );

  const submitRule = useCallback(async () => {
    if (!ruleForm.rule_name.trim() || !ruleForm.scope_type.trim()) {
      toast("Rule name and scope are required", "warning");
      return;
    }
    setBusy(true);
    try {
      await api.post("/warranty/rules", {
        ...ruleForm,
        warranty_days: Number(ruleForm.warranty_days || 0),
      });
      toast("Warranty rule added", "success");
      setRuleForm({
        rule_name: "",
        scope_type: "product_category",
        scope_value: "*",
        warranty_days: 30,
        description: "",
        is_active: true,
      });
      await loadReferenceData();
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to add rule", "error");
    } finally {
      setBusy(false);
    }
  }, [loadReferenceData, ruleForm, toast]);

  const toggleRuleActive = useCallback(
    async (rule) => {
      setBusy(true);
      try {
        await api.put(`/warranty/rules/${rule.id}`, {
          ...rule,
          is_active: !rule.is_active,
        });
        toast("Rule updated", "success");
        await loadReferenceData();
      } catch (error) {
        toast(error.response?.data?.detail || "Failed to update rule", "error");
      } finally {
        setBusy(false);
      }
    },
    [loadReferenceData, toast],
  );

  const submitCondition = useCallback(async () => {
    if (!conditionForm.condition_code.trim() || !conditionForm.title.trim()) {
      toast("Condition code and title are required", "warning");
      return;
    }
    setBusy(true);
    try {
      await api.post("/warranty/conditions", {
        ...conditionForm,
        sort_order: Number(conditionForm.sort_order || 0),
      });
      toast("Warranty condition added", "success");
      setConditionForm({
        condition_code: "",
        title: "",
        description: "",
        is_covered: false,
        is_active: true,
        sort_order: 0,
      });
      await loadReferenceData();
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to add condition", "error");
    } finally {
      setBusy(false);
    }
  }, [conditionForm, loadReferenceData, toast]);

  const toggleConditionActive = useCallback(
    async (condition) => {
      setBusy(true);
      try {
        await api.put(`/warranty/conditions/${condition.id}`, {
          ...condition,
          is_active: !condition.is_active,
        });
        toast("Condition updated", "success");
        await loadReferenceData();
      } catch (error) {
        toast(error.response?.data?.detail || "Failed to update condition", "error");
      } finally {
        setBusy(false);
      }
    },
    [loadReferenceData, toast],
  );

  const recordsByStatusChart = useMemo(() => {
    const map = {};
    records.forEach((row) => {
      const status = row.status || "Unknown";
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [records]);

  const claimsByStatusChart = useMemo(() => {
    const map = {};
    claims.forEach((row) => {
      const status = row.claim_status || "Unknown";
      map[status] = (map[status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [claims]);

  const warrantyExpiringSoonRows = useMemo(() => {
    const now = new Date();
    return records
      .filter((row) => row.status === "Active")
      .map((row) => ({
        ...row,
        daysLeft: dayDiff(now, new Date(row.end_date || now)),
      }))
      .filter((row) => row.daysLeft <= 30)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 20);
  }, [records]);

  const subReportRows = useMemo(() => {
    if (!reports) return [];
    if (activeTab === "reports-active") return reports.active_warranties || [];
    if (activeTab === "reports-expired") return reports.expired_warranties || [];
    if (activeTab === "reports-rejected") return reports.rejected_claims || [];
    if (activeTab === "reports-replaced") return reports.replacement_history || [];
    return [];
  }, [activeTab, reports]);

  const lookupQuickCards = lookupRows.slice(0, 8);

  const kpi = dashboard?.kpis || {
    active_warranties: 0,
    expired_warranties: 0,
    pending_claims: 0,
    approved_claims: 0,
    rejected_claims: 0,
    expiring_soon: 0,
    total_warranties: 0,
    total_claims: 0,
  };

  const topTabs = [
    { key: "records", label: "Warranty Records" },
    { key: "claims", label: "Claims Desk" },
    { key: "rules", label: "Warranty Rules" },
    { key: "conditions", label: "Coverage Conditions" },
    { key: "reports", label: "Reports" },
  ];

  const reportTabs = [
    { key: "reports-active", label: "Active Warranties" },
    { key: "reports-expired", label: "Expired Warranties" },
    { key: "reports-rejected", label: "Rejected Claims" },
    { key: "reports-replaced", label: "Replacement History" },
  ];

  const warrantySelectorOptions = useMemo(
    () =>
      records.map((row) => ({
        id: row.id,
        label: `${row.warranty_id} - ${row.product_or_service_name} (${row.customer_name})`,
      })),
    [records],
  );

  if (loading && !dashboard) {
    return <div className="h-full min-h-0 grid place-items-center text-slate-400">Loading warranty module...</div>;
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar pr-1">
      <div className="space-y-3 pb-3">
        <section className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Warranty Management</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Unified product and repair warranty control center with lookup, claims, rules, and reports.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={refreshAll} disabled={busy}>
                Refresh
              </Button>
            </div>
          </div>
        </section>

        <SectionCard
          title="Fast Counter Lookup"
          subtitle="Search by invoice, customer phone, IMEI, serial, or warranty ID"
        >
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
            <div className="xl:col-span-9 relative">
              <FileSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="field !py-2 !pl-9 !pr-3 !text-xs"
                placeholder="Example: INV-00125, 0771234567, 3560..., WTY-0001234"
                value={lookupQuery}
                onChange={(event) => setLookupQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    performLookup();
                  }
                }}
              />
            </div>
            <Button size="sm" className="xl:col-span-1" onClick={performLookup} disabled={busy}>
              Lookup
            </Button>
            <Button size="sm" variant="secondary" className="xl:col-span-2" onClick={() => setLookupRows([])}>
              Clear Results
            </Button>
          </div>

          {!!lookupQuickCards.length && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
              {lookupQuickCards.map((row) => (
                <button
                  key={row.id}
                  className="text-left rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3 hover:bg-indigo-500/20 transition"
                  onClick={() => openWarrantyDrawer(row)}
                >
                  <div className="text-[10px] font-black tracking-widest text-indigo-200">{row.warranty_id}</div>
                  <div className="text-xs font-bold text-white truncate">{row.product_or_service_name}</div>
                  <div className="text-[11px] text-slate-300 mt-1 truncate">{row.customer_name}</div>
                  <div className="mt-1">
                    <Badge tone={STATUS_TONES[row.status] || "slate"}>{row.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard title="Active Warranties" value={kpi.active_warranties.toLocaleString()} icon={<ShieldCheck size={18} />} tone="green" />
          <KpiCard title="Expired Warranties" value={kpi.expired_warranties.toLocaleString()} icon={<ShieldX size={18} />} tone="red" />
          <KpiCard title="Pending Claims" value={kpi.pending_claims.toLocaleString()} icon={<Clock4 size={18} />} tone="amber" />
          <KpiCard title="Approved Claims" value={kpi.approved_claims.toLocaleString()} icon={<BadgeCheck size={18} />} tone="indigo" />
          <KpiCard title="Rejected Claims" value={kpi.rejected_claims.toLocaleString()} icon={<XCircle size={18} />} tone="red" />
          <KpiCard title="Warranty Expiring Soon" value={kpi.expiring_soon.toLocaleString()} icon={<AlertTriangle size={18} />} tone="amber" />
          <KpiCard title="Total Warranties" value={kpi.total_warranties.toLocaleString()} icon={<Layers3 size={18} />} />
          <KpiCard title="Total Claims" value={kpi.total_claims.toLocaleString()} icon={<Wrench size={18} />} tone="violet" />
        </div>

        <SectionCard title="Filters" subtitle="Search-first compact workflow">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-2">
            <input
              className="field !py-2 !px-3 !text-xs"
              placeholder="Search warranty records..."
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            />
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.status}
              onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            >
              <option value="all">Status: All</option>
              {WARRANTY_STATUS_FLOW.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.warranty_type}
              onChange={(event) => setFilters((prev) => ({ ...prev, warranty_type: event.target.value }))}
            >
              <option value="all">Type: All</option>
              <option value="Product">Product</option>
              <option value="Spare Part">Spare Part</option>
              <option value="Repair Service">Repair Service</option>
            </select>
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
            >
              <option value="all">Category: All</option>
              {(filterOptions.categories || []).map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.brand}
              onChange={(event) => setFilters((prev) => ({ ...prev, brand: event.target.value }))}
            >
              <option value="all">Brand: All</option>
              {(filterOptions.brands || []).map((row) => (
                <option key={row} value={row}>
                  {row}
                </option>
              ))}
            </select>
            <input
              type="date"
              className="field !py-2 !px-3 !text-xs"
              value={filters.date_from}
              onChange={(event) => setFilters((prev) => ({ ...prev, date_from: event.target.value }))}
            />
            <input
              type="date"
              className="field !py-2 !px-3 !text-xs"
              value={filters.date_to}
              onChange={(event) => setFilters((prev) => ({ ...prev, date_to: event.target.value }))}
            />
          </div>
        </SectionCard>

        <SectionCard title="Warranty Workspace">
          <div className="flex flex-wrap gap-2 mb-3">
            {topTabs.map((tab) => (
              <button
                key={tab.key}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                  activeTab === tab.key
                    ? "bg-indigo-500/25 border border-indigo-500/40 text-indigo-100"
                    : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "records" && (
            <div className="space-y-3">
              <MiniTable
                columns={[
                  { label: "Warranty ID", value: "warranty_id" },
                  { label: "Invoice", value: (row) => row.invoice_no || "-" },
                  { label: "Repair Ticket", value: (row) => row.repair_ticket_no || "-" },
                  { label: "Customer", value: "customer_name" },
                  { label: "Phone", value: "customer_phone" },
                  { label: "Product / Service", value: "product_or_service_name" },
                  { label: "Brand / Model", value: (row) => row.device_brand_model || "-" },
                  { label: "Serial / IMEI", value: (row) => row.imei_or_serial || "-" },
                  { label: "Type", value: "warranty_type" },
                  { label: "Start", value: (row) => toHumanDate(row.start_date) },
                  { label: "End", value: (row) => toHumanDate(row.end_date) },
                  {
                    label: "Status",
                    value: (row) => (
                      <Badge tone={STATUS_TONES[row.status] || "slate"}>
                        {row.status}
                      </Badge>
                    ),
                  },
                  {
                    label: "Action",
                    value: (row) => (
                      <Button size="sm" variant="ghost" onClick={() => openWarrantyDrawer(row)}>
                        View
                      </Button>
                    ),
                  },
                ]}
                rows={records}
                emptyLabel="No warranty records found for the current filters."
              />

              <SectionCard title="Warranty Expiring Soon">
                <MiniTable
                  columns={[
                    { label: "Warranty ID", value: "warranty_id" },
                    { label: "Customer", value: "customer_name" },
                    { label: "Product", value: "product_or_service_name" },
                    { label: "End Date", value: (row) => toHumanDate(row.end_date) },
                    { label: "Days Left", value: (row) => Math.max(0, dayDiff(new Date(), new Date(row.end_date))) },
                    {
                      label: "Status",
                      value: (row) => <Badge tone={STATUS_TONES[row.status] || "slate"}>{row.status}</Badge>,
                    },
                  ]}
                  rows={warrantyExpiringSoonRows}
                  emptyLabel="No expiring warranties in the next 30 days."
                />
              </SectionCard>
            </div>
          )}

          {activeTab === "claims" && (
            <div className="space-y-3">
              <SectionCard title="Create Warranty Claim" subtitle="Staff inspection intake and decision workflow">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                  <select
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    value={claimForm.warranty_id}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, warranty_id: event.target.value }))}
                  >
                    <option value="">Select Warranty</option>
                    {warrantySelectorOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="field !py-2 !px-3 !text-xs"
                    value={claimForm.claim_status}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, claim_status: event.target.value }))}
                  >
                    {CLAIM_STATUS_FLOW.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Decision (repair / replace / reject)"
                    value={claimForm.claim_decision}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, claim_decision: event.target.value }))}
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    placeholder="Customer complaint"
                    value={claimForm.customer_complaint}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, customer_complaint: event.target.value }))}
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    placeholder="Technician inspection note"
                    value={claimForm.technician_inspection_note}
                    onChange={(event) =>
                      setClaimForm((prev) => ({
                        ...prev,
                        technician_inspection_note: event.target.value,
                      }))
                    }
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Replacement item"
                    value={claimForm.replacement_item}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, replacement_item: event.target.value }))}
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Repair action"
                    value={claimForm.repair_action}
                    onChange={(event) => setClaimForm((prev) => ({ ...prev, repair_action: event.target.value }))}
                  />
                </div>
                <div className="mt-3">
                  <Button size="sm" onClick={submitClaim} disabled={busy}>
                    Save Claim
                  </Button>
                </div>
              </SectionCard>

              <MiniTable
                columns={[
                  { label: "Claim ID", value: "claim_id" },
                  { label: "Warranty", value: "warranty_code" },
                  { label: "Customer", value: "customer_name" },
                  { label: "Product / Service", value: "product_or_service_name" },
                  { label: "Complaint", value: "customer_complaint" },
                  { label: "Inspection Note", value: (row) => row.technician_inspection_note || "-" },
                  {
                    label: "Claim Status",
                    value: (row) => (
                      <Badge tone={CLAIM_STATUS_TONES[row.claim_status] || "slate"}>
                        {row.claim_status}
                      </Badge>
                    ),
                  },
                  { label: "Decision", value: (row) => row.claim_decision || "-" },
                  { label: "Replacement", value: (row) => row.replacement_item || "-" },
                  { label: "Repair Action", value: (row) => row.repair_action || "-" },
                  {
                    label: "Move",
                    value: (row) => (
                      <select
                        className="field !py-1 !px-2 !text-xs min-w-[140px]"
                        value={row.claim_status}
                        onChange={(event) => updateClaimStatus(row.id, event.target.value)}
                      >
                        {CLAIM_STATUS_FLOW.map((status) => (
                          <option key={`${row.id}-${status}`} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                ]}
                rows={claims}
                emptyLabel="No warranty claims found."
              />
            </div>
          )}

          {activeTab === "rules" && (
            <div className="space-y-3">
              <SectionCard title="Add Warranty Rule">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
                  <input
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    placeholder="Rule name"
                    value={ruleForm.rule_name}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_name: event.target.value }))}
                  />
                  <select
                    className="field !py-2 !px-3 !text-xs"
                    value={ruleForm.scope_type}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, scope_type: event.target.value }))}
                  >
                    <option value="product_category">Product Category</option>
                    <option value="repair_service">Repair Service</option>
                    <option value="spare_part">Spare Part</option>
                    <option value="product">Product</option>
                  </select>
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Scope value (or *)"
                    value={ruleForm.scope_value}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, scope_value: event.target.value }))}
                  />
                  <input
                    type="number"
                    min="0"
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Warranty days"
                    value={ruleForm.warranty_days}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, warranty_days: Number(event.target.value || 0) }))}
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Description"
                    value={ruleForm.description}
                    onChange={(event) => setRuleForm((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </div>
                <div className="mt-3">
                  <Button size="sm" onClick={submitRule} disabled={busy}>
                    Add Rule
                  </Button>
                </div>
              </SectionCard>

              <MiniTable
                columns={[
                  { label: "Rule Name", value: "rule_name" },
                  { label: "Scope Type", value: "scope_type" },
                  { label: "Scope Value", value: "scope_value" },
                  { label: "Warranty Days", value: (row) => Number(row.warranty_days || 0).toLocaleString() },
                  { label: "Description", value: (row) => row.description || "-" },
                  {
                    label: "Active",
                    value: (row) => (
                      <Badge tone={row.is_active ? "green" : "red"}>{row.is_active ? "Active" : "Disabled"}</Badge>
                    ),
                  },
                  {
                    label: "Action",
                    value: (row) => (
                      <Button size="sm" variant="ghost" onClick={() => toggleRuleActive(row)}>
                        {row.is_active ? "Disable" : "Enable"}
                      </Button>
                    ),
                  },
                ]}
                rows={rules}
                emptyLabel="No warranty rules found."
              />
            </div>
          )}

          {activeTab === "conditions" && (
            <div className="space-y-3">
              <SectionCard title="Add Warranty Condition">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2">
                  <input
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Condition code"
                    value={conditionForm.condition_code}
                    onChange={(event) =>
                      setConditionForm((prev) => ({
                        ...prev,
                        condition_code: event.target.value.toUpperCase().replace(/\s+/g, "_"),
                      }))
                    }
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    placeholder="Condition title"
                    value={conditionForm.title}
                    onChange={(event) => setConditionForm((prev) => ({ ...prev, title: event.target.value }))}
                  />
                  <input
                    className="field !py-2 !px-3 !text-xs xl:col-span-2"
                    placeholder="Description"
                    value={conditionForm.description}
                    onChange={(event) =>
                      setConditionForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    className="field !py-2 !px-3 !text-xs"
                    placeholder="Sort order"
                    value={conditionForm.sort_order}
                    onChange={(event) =>
                      setConditionForm((prev) => ({
                        ...prev,
                        sort_order: Number(event.target.value || 0),
                      }))
                    }
                  />
                  <select
                    className="field !py-2 !px-3 !text-xs"
                    value={conditionForm.is_covered ? "covered" : "not-covered"}
                    onChange={(event) =>
                      setConditionForm((prev) => ({
                        ...prev,
                        is_covered: event.target.value === "covered",
                      }))
                    }
                  >
                    <option value="not-covered">Not Covered</option>
                    <option value="covered">Covered</option>
                  </select>
                  <select
                    className="field !py-2 !px-3 !text-xs"
                    value={conditionForm.is_active ? "active" : "inactive"}
                    onChange={(event) =>
                      setConditionForm((prev) => ({
                        ...prev,
                        is_active: event.target.value === "active",
                      }))
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="mt-3">
                  <Button size="sm" onClick={submitCondition} disabled={busy}>
                    Add Condition
                  </Button>
                </div>
              </SectionCard>

              <MiniTable
                columns={[
                  { label: "Code", value: "condition_code" },
                  { label: "Title", value: "title" },
                  { label: "Description", value: (row) => row.description || "-" },
                  {
                    label: "Coverage",
                    value: (row) => (
                      <Badge tone={row.is_covered ? "green" : "amber"}>
                        {row.is_covered ? "Covered" : "Not Covered"}
                      </Badge>
                    ),
                  },
                  {
                    label: "Status",
                    value: (row) => (
                      <Badge tone={row.is_active ? "green" : "red"}>
                        {row.is_active ? "Active" : "Disabled"}
                      </Badge>
                    ),
                  },
                  {
                    label: "Action",
                    value: (row) => (
                      <Button size="sm" variant="ghost" onClick={() => toggleConditionActive(row)}>
                        {row.is_active ? "Disable" : "Enable"}
                      </Button>
                    ),
                  },
                ]}
                rows={conditions}
                emptyLabel="No warranty conditions found."
              />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <SectionCard title="Warranty Status Distribution">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={recordsByStatusChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} stroke="none">
                          {recordsByStatusChart.map((entry, index) => (
                            <Cell key={`${entry.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                <SectionCard title="Claim Status Distribution">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={claimsByStatusChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
                        <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#6366f1" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>

                <SectionCard title="Claim Trend (Monthly)" className="xl:col-span-2">
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={reports?.claim_trend || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
                        <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                        <Tooltip />
                        <Line type="monotone" dataKey="total_claims" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                        <Line type="monotone" dataKey="approved" stroke="#38bdf8" strokeWidth={2.2} dot={false} />
                        <Line type="monotone" dataKey="rejected" stroke="#ef4444" strokeWidth={2.2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </SectionCard>
              </div>

              <SectionCard title="Sub Reports">
                <div className="flex flex-wrap gap-2 mb-3">
                  {reportTabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                        activeTab === tab.key
                          ? "bg-indigo-500/25 border border-indigo-500/40 text-indigo-100"
                          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
                      }`}
                      onClick={() => setActiveTab(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400">
                  Includes Active Warranties, Expired Warranties, Claims Summary, Rejected Claims, and Replacement History.
                </p>
              </SectionCard>
            </div>
          )}

          {activeTab.startsWith("reports-") && (
            <SectionCard title="Report Table">
              <MiniTable
                columns={[
                  { label: "Warranty / Claim ID", value: (row) => row.warranty_id || row.claim_id || "-" },
                  { label: "Customer", value: (row) => row.customer_name || "-" },
                  { label: "Phone", value: (row) => row.customer_phone || "-" },
                  { label: "Product / Service", value: (row) => row.product_or_service_name || "-" },
                  { label: "Status", value: (row) => row.status || row.claim_status || "-" },
                  { label: "Start Date", value: (row) => toHumanDate(row.start_date || row.created_at) },
                  { label: "End Date", value: (row) => toHumanDate(row.end_date || row.updated_at) },
                ]}
                rows={subReportRows}
                emptyLabel="No rows in this report section."
              />
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => setActiveTab("reports")}>
                  Back To Report Dashboard
                </Button>
              </div>
            </SectionCard>
          )}
        </SectionCard>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-[120] flex">
          <button className="flex-1 bg-black/55 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="w-full max-w-xl h-full border-l border-white/10 bg-slate-950 shadow-2xl overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-white/10 sticky top-0 bg-slate-950/95 backdrop-blur-sm z-10">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] tracking-widest uppercase text-slate-400">Warranty Details</p>
                  <h3 className="text-lg font-black text-white">
                    {selectedWarranty?.warranty_id || "Loading..."}
                  </h3>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setDrawerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              {busy && !selectedWarranty && <div className="text-sm text-slate-400">Loading warranty details...</div>}
              {selectedWarranty && (
                <>
                  <SectionCard title="Primary Record">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <InfoRow label="Customer" value={selectedWarranty.customer_name} />
                      <InfoRow label="Phone" value={selectedWarranty.customer_phone || "-"} />
                      <InfoRow label="Invoice" value={selectedWarranty.invoice_no || "-"} />
                      <InfoRow label="Repair Ticket" value={selectedWarranty.repair_ticket_no || "-"} />
                      <InfoRow label="Product / Service" value={selectedWarranty.product_or_service_name || "-"} />
                      <InfoRow label="Type" value={selectedWarranty.warranty_type || "-"} />
                      <InfoRow label="Brand / Model" value={selectedWarranty.device_brand_model || "-"} />
                      <InfoRow label="Serial / IMEI" value={selectedWarranty.imei_or_serial || "-"} />
                      <InfoRow label="Start Date" value={toHumanDate(selectedWarranty.start_date)} />
                      <InfoRow label="End Date" value={toHumanDate(selectedWarranty.end_date)} />
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        className="field !py-2 !px-3 !text-xs"
                        value={selectedWarrantyStatus}
                        onChange={(event) => setSelectedWarrantyStatus(event.target.value)}
                      >
                        {WARRANTY_STATUS_FLOW.map((status) => (
                          <option key={status} value={status}>
                            {status}
                          </option>
                        ))}
                      </select>
                      <input
                        className="field !py-2 !px-3 !text-xs md:col-span-2"
                        placeholder="Status note"
                        value={selectedWarrantyNote}
                        onChange={(event) => setSelectedWarrantyNote(event.target.value)}
                      />
                      <Button size="sm" onClick={updateSelectedWarrantyStatus} disabled={busy}>
                        Update Status
                      </Button>
                    </div>
                  </SectionCard>

                  <SectionCard title="Coverage Conditions">
                    <MiniTable
                      columns={[
                        { label: "Code", value: (row) => row.code || "-" },
                        { label: "Title", value: (row) => row.title || "-" },
                        { label: "Coverage", value: (row) => (row.is_covered ? "Covered" : "Not Covered") },
                      ]}
                      rows={selectedWarranty.conditions || []}
                      emptyLabel="No condition metadata available."
                    />
                  </SectionCard>

                  <SectionCard title="Claim Timeline">
                    <MiniTable
                      columns={[
                        { label: "Claim ID", value: "claim_id" },
                        { label: "Status", value: (row) => <Badge tone={CLAIM_STATUS_TONES[row.claim_status] || "slate"}>{row.claim_status}</Badge> },
                        { label: "Complaint", value: "customer_complaint" },
                        { label: "Decision", value: (row) => row.claim_decision || "-" },
                        { label: "Updated", value: (row) => toHumanDate(row.updated_at) },
                      ]}
                      rows={selectedWarranty.claims || []}
                      emptyLabel="No claims for this warranty yet."
                    />
                  </SectionCard>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 text-xs text-slate-200">{value}</p>
    </div>
  );
}
