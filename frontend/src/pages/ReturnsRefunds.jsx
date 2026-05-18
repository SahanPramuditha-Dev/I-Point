import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  BadgeCheck,
  ClipboardList,
  ReceiptText,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import api from "../lib/api";
import { useFetch } from "../hooks/useFetch";
import { useFeedback } from "../components/FeedbackProvider";
import { Badge, Button, KpiCard, SectionCard, Table } from "../components/UI";

const STATUS_TONE = {
  "Pending Inspection": "amber",
  Approved: "indigo",
  Rejected: "red",
  Refunded: "green",
  Exchanged: "sky",
  Closed: "slate",
};

const STATUS_ORDER = [
  "Pending Inspection",
  "Approved",
  "Rejected",
  "Refunded",
  "Exchanged",
  "Closed",
];

const RETURN_TYPE_ORDER = [
  "Product Return",
  "Product Exchange",
  "Refund",
  "Warranty Replacement",
];

const CONDITION_ORDER = ["Reusable", "Damaged"];
const REFUND_METHOD_ORDER = ["Cash", "Card", "Bank Transfer"];
const CHART_COLORS = ["#f59e0b", "#6366f1", "#ef4444", "#22c55e", "#38bdf8", "#94a3b8"];

function money(value) {
  return `LKR ${Math.round(Number(value || 0)).toLocaleString("en-LK")}`;
}

function toDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString();
}

function MiniTable({ columns, rows, emptyLabel = "No records found." }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/20">
      <Table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
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
            <tr key={row.id || row.return_id || index}>
              {columns.map((column) => (
                <td key={`${column.label}-${row.id || row.return_id || index}`}>
                  {typeof column.value === "function" ? column.value(row, index) : row[column.value]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

export default function ReturnsRefunds() {
  const { toast } = useFeedback();
  const inventoryFetch = useFetch("/inventory");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [records, setRecords] = useState([]);
  const [reports, setReports] = useState(null);
  const [meta, setMeta] = useState({
    statuses: STATUS_ORDER,
    return_types: RETURN_TYPE_ORDER,
    return_reasons: [],
    refund_methods: REFUND_METHOD_ORDER,
  });

  const [filters, setFilters] = useState({
    q: "",
    decision_status: "all",
    return_type: "all",
    date_from: "",
    date_to: "",
  });
  const [activeReportTab, setActiveReportTab] = useState("summary");
  const [invoiceLookup, setInvoiceLookup] = useState("");
  const [lookupInvoiceData, setLookupInvoiceData] = useState(null);
  const [lookupDrawerOpen, setLookupDrawerOpen] = useState(false);
  const [inspectionModalOpen, setInspectionModalOpen] = useState(false);
  const [processModalOpen, setProcessModalOpen] = useState(false);
  const [selectedInvoiceLine, setSelectedInvoiceLine] = useState(null);
  const [selectedReturnRecord, setSelectedReturnRecord] = useState(null);

  const [inspectionForm, setInspectionForm] = useState({
    quantity: 1,
    return_type: "Product Return",
    return_reason: "Defective item",
    item_condition: "Reusable",
    inspection_note: "",
  });

  const [processForm, setProcessForm] = useState({
    decision_status: "Approved",
    return_reason: "",
    item_condition: "",
    inspection_note: "",
    refund_amount: "",
    refund_method: "Cash",
    replacement_item_id: "",
    replacement_quantity: 1,
    process_note: "",
  });

  const buildQuery = useCallback((values) => {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      if (String(value).toLowerCase() === "all") return;
      params.set(key, String(value));
    });
    return params.toString();
  }, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const query = buildQuery(filters);
      const [dashboardRes, recordsRes, reportsRes, metaRes] = await Promise.all([
        api.get(`/returns/dashboard${query ? `?${query}` : ""}`),
        api.get(`/returns/records${query ? `?${query}` : ""}`),
        api.get(`/returns/reports${query ? `?${query}` : ""}`),
        api.get("/returns/meta"),
      ]);
      setDashboard(dashboardRes.data || null);
      setRecords(Array.isArray(recordsRes.data) ? recordsRes.data : []);
      setReports(reportsRes.data || null);
      setMeta(metaRes.data || meta);
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to load returns module", "error");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, filters, meta, toast]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const statusChartRows = useMemo(() => {
    const rows = dashboard?.status_distribution || [];
    return rows.map((row) => ({ name: row.status, value: row.count }));
  }, [dashboard]);

  const reasonChartRows = useMemo(() => {
    const rows = dashboard?.reason_distribution || [];
    return rows.map((row) => ({ name: row.reason, value: row.count }));
  }, [dashboard]);

  const refreshRecordsAndDashboard = useCallback(async () => {
    const query = buildQuery(filters);
    const [dashboardRes, recordsRes, reportsRes] = await Promise.all([
      api.get(`/returns/dashboard${query ? `?${query}` : ""}`),
      api.get(`/returns/records${query ? `?${query}` : ""}`),
      api.get(`/returns/reports${query ? `?${query}` : ""}`),
    ]);
    setDashboard(dashboardRes.data || null);
    setRecords(Array.isArray(recordsRes.data) ? recordsRes.data : []);
    setReports(reportsRes.data || null);
  }, [buildQuery, filters]);

  const searchInvoice = useCallback(async () => {
    const query = invoiceLookup.trim();
    if (!query) {
      toast("Enter invoice ID or invoice number", "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await api.get(`/returns/invoice-lookup/${encodeURIComponent(query)}`);
      setLookupInvoiceData(res.data || null);
      setLookupDrawerOpen(true);
    } catch (error) {
      toast(error.response?.data?.detail || "Invoice lookup failed", "error");
    } finally {
      setBusy(false);
    }
  }, [invoiceLookup, toast]);

  const openInspectionModal = useCallback((line) => {
    setSelectedInvoiceLine(line);
    setInspectionForm({
      quantity: Math.max(1, Math.min(1, Number(line.returnable_qty || 1))),
      return_type: "Product Return",
      return_reason: "Defective item",
      item_condition: "Reusable",
      inspection_note: "",
    });
    setInspectionModalOpen(true);
  }, []);

  const submitInspection = useCallback(async () => {
    if (!lookupInvoiceData || !selectedInvoiceLine) return;
    setBusy(true);
    try {
      const qty = Number(inspectionForm.quantity || 0);
      if (qty <= 0) {
        toast("Quantity must be at least 1", "warning");
        setBusy(false);
        return;
      }
      if (qty > Number(selectedInvoiceLine.returnable_qty || 0)) {
        toast("Quantity exceeds returnable quantity", "warning");
        setBusy(false);
        return;
      }

      const res = await api.post("/returns/records", {
        original_invoice_id: lookupInvoiceData.invoice_id,
        original_sale_item_id: selectedInvoiceLine.sale_item_id,
        quantity: qty,
        return_type: inspectionForm.return_type,
        return_reason: inspectionForm.return_reason,
        item_condition: inspectionForm.item_condition,
        inspection_note: inspectionForm.inspection_note,
      });

      toast("Return record created with pending inspection", "success");
      setInspectionModalOpen(false);
      const invoiceRes = await api.get(`/returns/invoice-lookup/${lookupInvoiceData.invoice_id}`);
      setLookupInvoiceData(invoiceRes.data || null);
      await refreshRecordsAndDashboard();
      setSelectedReturnRecord(res.data || null);
      if (res.data) {
        setProcessForm({
          decision_status: "Approved",
          return_reason: res.data.return_reason || "",
          item_condition: res.data.item_condition || "",
          inspection_note: res.data.inspection_note || "",
          refund_amount: "",
          refund_method: "Cash",
          replacement_item_id: "",
          replacement_quantity: res.data.quantity || 1,
          process_note: "",
        });
      }
      setProcessModalOpen(Boolean(res.data));
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to create return record", "error");
    } finally {
      setBusy(false);
    }
  }, [inspectionForm, lookupInvoiceData, refreshRecordsAndDashboard, selectedInvoiceLine, toast]);

  const openProcessModal = useCallback(
    async (record) => {
      setBusy(true);
      try {
        const res = await api.get(`/returns/records/${record.id}`);
        const row = res.data || record;
        setSelectedReturnRecord(row);
        setProcessForm({
          decision_status: row.decision_status === "Pending Inspection" ? "Approved" : row.decision_status,
          return_reason: row.return_reason || "",
          item_condition: row.item_condition || "",
          inspection_note: row.inspection_note || "",
          refund_amount: row.refund_amount ? String(row.refund_amount) : "",
          refund_method: row.refund_method || "Cash",
          replacement_item_id: row.replacement_item_id ? String(row.replacement_item_id) : "",
          replacement_quantity: row.replacement_quantity || row.quantity || 1,
          process_note: "",
        });
        setProcessModalOpen(true);
      } catch (error) {
        toast(error.response?.data?.detail || "Failed to load return record", "error");
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  const submitProcess = useCallback(async () => {
    if (!selectedReturnRecord) return;
    setBusy(true);
    try {
      await api.put(`/returns/records/${selectedReturnRecord.id}/process`, {
        decision_status: processForm.decision_status,
        return_reason: processForm.return_reason || undefined,
        item_condition: processForm.item_condition || undefined,
        inspection_note: processForm.inspection_note || undefined,
        refund_amount:
          processForm.refund_amount === "" ? undefined : Number(processForm.refund_amount),
        refund_method: processForm.refund_method || undefined,
        replacement_item_id: processForm.replacement_item_id
          ? Number(processForm.replacement_item_id)
          : undefined,
        replacement_quantity: processForm.replacement_quantity
          ? Number(processForm.replacement_quantity)
          : undefined,
        process_note: processForm.process_note || undefined,
      });
      toast("Return record processed", "success");
      setProcessModalOpen(false);
      await refreshRecordsAndDashboard();
      if (lookupInvoiceData?.invoice_id) {
        const invoiceRes = await api.get(`/returns/invoice-lookup/${lookupInvoiceData.invoice_id}`);
        setLookupInvoiceData(invoiceRes.data || null);
      }
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to process return", "error");
    } finally {
      setBusy(false);
    }
  }, [lookupInvoiceData?.invoice_id, processForm, refreshRecordsAndDashboard, selectedReturnRecord, toast]);

  const printReturnReceipt = useCallback(async (record) => {
    try {
      const res = await api.get(`/returns/records/${record.id}/receipt`);
      const payload = res.data || {};
      const html = `
      <html>
      <head>
        <title>Return Receipt ${payload.return_id || ""}</title>
        <style>
          body { font-family: "Segoe UI", sans-serif; color: #111; margin: 20px; }
          .wrap { border: 1px solid #ccc; border-radius: 8px; padding: 16px; max-width: 680px; }
          h2 { margin: 0 0 10px; }
          .meta { font-size: 12px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; font-size: 13px; margin: 4px 0; }
          .total { margin-top: 12px; border-top: 1px solid #ddd; padding-top: 10px; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <h2>i Store - Return / Refund Receipt</h2>
          <div class="meta">Return ID: ${payload.return_id || "-"} | Invoice: ${payload.invoice_id || "-"}</div>
          <div class="row"><span>Customer</span><span>${payload.customer_name || "-"}</span></div>
          <div class="row"><span>Phone</span><span>${payload.customer_phone || "-"}</span></div>
          <div class="row"><span>Product</span><span>${payload.product_name || "-"}</span></div>
          <div class="row"><span>SKU/Barcode</span><span>${payload.sku_barcode || "-"}</span></div>
          <div class="row"><span>Qty</span><span>${payload.quantity || 0}</span></div>
          <div class="row"><span>Reason</span><span>${payload.return_reason || "-"}</span></div>
          <div class="row"><span>Condition</span><span>${payload.item_condition || "-"}</span></div>
          <div class="row"><span>Status</span><span>${payload.status || "-"}</span></div>
          <div class="row"><span>Refund Method</span><span>${payload.refund_method || "-"}</span></div>
          <div class="row total"><span>Refund Amount</span><span>${money(payload.refund_amount)}</span></div>
          <div class="meta" style="margin-top:12px;">Generated: ${new Date().toLocaleString()}</div>
        </div>
        <script>window.print()</script>
      </body>
      </html>
      `;
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
      }
    } catch (error) {
      toast(error.response?.data?.detail || "Failed to generate return receipt", "error");
    }
  }, [toast]);

  const dashboardKpi = dashboard?.kpis || {
    total_returns: 0,
    pending_returns: 0,
    approved_returns: 0,
    rejected_returns: 0,
    refund_total: 0,
    exchange_count: 0,
  };

  const replacementInventoryRows = useMemo(
    () => (inventoryFetch.data || []).filter((row) => Number(row.quantity || 0) > 0),
    [inventoryFetch.data],
  );

  const reportRows = useMemo(() => {
    if (!reports) return [];
    if (activeReportTab === "summary") return reports.return_summary_report || [];
    if (activeReportTab === "refunds") return reports.refund_report || [];
    if (activeReportTab === "exchanges") return reports.exchange_report || [];
    if (activeReportTab === "damaged") return reports.damaged_stock_report || [];
    if (activeReportTab === "warranty") return reports.warranty_replacement_report || [];
    return [];
  }, [activeReportTab, reports]);

  if (loading && !dashboard) {
    return <div className="h-full min-h-0 grid place-items-center text-slate-400">Loading returns module...</div>;
  }

  return (
    <div className="h-full min-h-0 overflow-auto custom-scrollbar pr-1">
      <div className="space-y-3 pb-3">
        <section className="panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black text-white">Returns &amp; Refunds Module</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Product returns, exchanges, refunds, and warranty replacement control center.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={loadPage} disabled={busy}>
              Refresh
            </Button>
          </div>
        </section>

        <SectionCard title="Fast Invoice Lookup" subtitle="Search invoice then inspect and process returned items">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-2">
            <input
              className="field !py-2 !px-3 !text-xs xl:col-span-10"
              placeholder="Invoice ID or Invoice No (e.g. 125 or INV-00125)"
              value={invoiceLookup}
              onChange={(event) => setInvoiceLookup(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchInvoice();
                }
              }}
            />
            <Button size="sm" className="xl:col-span-2" onClick={searchInvoice} disabled={busy}>
              Lookup Invoice
            </Button>
          </div>
        </SectionCard>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-3">
          <KpiCard title="Total Returns" value={dashboardKpi.total_returns.toLocaleString()} icon={<RotateCcw size={18} />} />
          <KpiCard title="Pending Returns" value={dashboardKpi.pending_returns.toLocaleString()} icon={<ClipboardList size={18} />} tone="amber" />
          <KpiCard title="Approved Returns" value={dashboardKpi.approved_returns.toLocaleString()} icon={<BadgeCheck size={18} />} tone="indigo" />
          <KpiCard title="Rejected Returns" value={dashboardKpi.rejected_returns.toLocaleString()} icon={<XCircle size={18} />} tone="red" />
          <KpiCard title="Refund Amount" value={money(dashboardKpi.refund_total)} icon={<ReceiptText size={18} />} tone="green" />
          <KpiCard title="Exchange Count" value={dashboardKpi.exchange_count.toLocaleString()} icon={<ArrowLeftRight size={18} />} tone="sky" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          <SectionCard title="Return Status Distribution">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusChartRows}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,.2)" />
                  <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                    {statusChartRows.map((row, index) => (
                      <Cell key={`${row.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
          <SectionCard title="Return Reason Distribution">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reasonChartRows} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} stroke="none">
                    {reasonChartRows.map((row, index) => (
                      <Cell key={`${row.name}-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Return Records" subtitle="Compact cashier-friendly return records table">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2 mb-3">
            <input
              className="field !py-2 !px-3 !text-xs xl:col-span-2"
              placeholder="Search returns..."
              value={filters.q}
              onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value }))}
            />
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.decision_status}
              onChange={(event) => setFilters((prev) => ({ ...prev, decision_status: event.target.value }))}
            >
              <option value="all">Status: All</option>
              {(meta.statuses || STATUS_ORDER).map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <select
              className="field !py-2 !px-3 !text-xs"
              value={filters.return_type}
              onChange={(event) => setFilters((prev) => ({ ...prev, return_type: event.target.value }))}
            >
              <option value="all">Type: All</option>
              {(meta.return_types || RETURN_TYPE_ORDER).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" onClick={loadPage}>
              Apply Filters
            </Button>
          </div>
          <MiniTable
            columns={[
              { label: "Return ID", value: "return_id" },
              { label: "Invoice", value: "invoice_no" },
              { label: "Customer", value: "customer_name" },
              { label: "Phone", value: "customer_phone" },
              { label: "Product", value: "product_name" },
              { label: "SKU / Barcode", value: "sku_barcode" },
              { label: "Reason", value: "return_reason" },
              { label: "Date", value: (row) => toDate(row.created_at) },
              { label: "Condition", value: "item_condition" },
              { label: "Staff", value: (row) => row.staff_member || "-" },
              {
                label: "Status",
                value: (row) => <Badge tone={STATUS_TONE[row.decision_status] || "slate"}>{row.decision_status}</Badge>,
              },
              { label: "Refund", value: (row) => money(row.refund_amount) },
              {
                label: "Actions",
                value: (row) => (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="ghost" onClick={() => openProcessModal(row)}>
                      Process
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => printReturnReceipt(row)}>
                      Receipt
                    </Button>
                  </div>
                ),
              },
            ]}
            rows={records}
            emptyLabel="No return records found."
          />
        </SectionCard>

        <SectionCard title="Reports">
          <div className="flex flex-wrap gap-2 mb-3">
            <ReportTabButton active={activeReportTab === "summary"} onClick={() => setActiveReportTab("summary")} label="Return Summary" />
            <ReportTabButton active={activeReportTab === "refunds"} onClick={() => setActiveReportTab("refunds")} label="Refund Report" />
            <ReportTabButton active={activeReportTab === "exchanges"} onClick={() => setActiveReportTab("exchanges")} label="Exchange Report" />
            <ReportTabButton active={activeReportTab === "damaged"} onClick={() => setActiveReportTab("damaged")} label="Damaged Stock Report" />
            <ReportTabButton active={activeReportTab === "warranty"} onClick={() => setActiveReportTab("warranty")} label="Warranty Replacement Report" />
          </div>
          {activeReportTab === "summary" && (
            <MiniTable
              columns={[
                { label: "Status", value: "status" },
                { label: "Count", value: (row) => Number(row.count || 0).toLocaleString() },
              ]}
              rows={reportRows}
              emptyLabel="No summary rows."
            />
          )}
          {activeReportTab !== "summary" && (
            <MiniTable
              columns={[
                { label: "Return ID", value: (row) => row.return_id || "-" },
                { label: "Invoice", value: (row) => row.invoice_no || "-" },
                { label: "Customer", value: (row) => row.customer_name || "-" },
                { label: "Product", value: (row) => row.product_name || row.product_name || "-" },
                { label: "Reason", value: (row) => row.return_reason || row.reason || "-" },
                { label: "Quantity", value: (row) => Number(row.quantity || 0).toLocaleString() },
                { label: "Status", value: (row) => row.decision_status || "-" },
                { label: "Refund", value: (row) => money(row.refund_amount || 0) },
                { label: "Date", value: (row) => toDate(row.created_at || row.created_at) },
              ]}
              rows={reportRows}
              emptyLabel="No rows in selected report."
            />
          )}
        </SectionCard>
      </div>

      {lookupDrawerOpen && (
        <div className="fixed inset-0 z-[120] flex">
          <button className="flex-1 bg-black/55 backdrop-blur-sm" onClick={() => setLookupDrawerOpen(false)} />
          <aside className="w-full max-w-2xl h-full border-l border-white/10 bg-slate-950 shadow-2xl overflow-y-auto custom-scrollbar">
            <div className="p-4 border-b border-white/10 sticky top-0 bg-slate-950/95 backdrop-blur-sm z-10">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] tracking-widest uppercase text-slate-400">Invoice Lookup</p>
                  <h3 className="text-lg font-black text-white">{lookupInvoiceData?.invoice_no || "-"}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {lookupInvoiceData?.customer_name || "Walk-in"} • {lookupInvoiceData?.customer_phone || "-"}
                  </p>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setLookupDrawerOpen(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="p-4 space-y-3">
              <SectionCard title="Sold Items">
                <MiniTable
                  columns={[
                    { label: "Product", value: "product_name" },
                    { label: "SKU", value: (row) => row.sku || "-" },
                    { label: "Barcode", value: (row) => row.barcode || "-" },
                    { label: "Unit Price", value: (row) => money(row.unit_price) },
                    { label: "Sold Qty", value: (row) => Number(row.sold_qty || 0).toLocaleString() },
                    { label: "Returned Qty", value: (row) => Number(row.already_returned_qty || 0).toLocaleString() },
                    { label: "Returnable", value: (row) => Number(row.returnable_qty || 0).toLocaleString() },
                    {
                      label: "Inspect",
                      value: (row) => (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openInspectionModal(row)}
                          disabled={Number(row.returnable_qty || 0) <= 0}
                        >
                          Inspect
                        </Button>
                      ),
                    },
                  ]}
                  rows={lookupInvoiceData?.items || []}
                  emptyLabel="No line items found."
                />
              </SectionCard>

              <SectionCard title="Return History (Invoice)">
                <MiniTable
                  columns={[
                    { label: "Return ID", value: "return_id" },
                    { label: "Type", value: "return_type" },
                    { label: "Product", value: "product_name" },
                    { label: "Qty", value: (row) => Number(row.quantity || 0).toLocaleString() },
                    { label: "Status", value: (row) => <Badge tone={STATUS_TONE[row.decision_status] || "slate"}>{row.decision_status}</Badge> },
                    { label: "Refund", value: (row) => money(row.refund_amount) },
                    {
                      label: "Action",
                      value: (row) => (
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openProcessModal(row)}>
                            Process
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => printReturnReceipt(row)}>
                            Receipt
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                  rows={lookupInvoiceData?.return_records || []}
                  emptyLabel="No return history for this invoice."
                />
              </SectionCard>
            </div>
          </aside>
        </div>
      )}

      {inspectionModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <h3 className="text-lg font-black text-white">Product Inspection</h3>
              <Button size="sm" variant="secondary" onClick={() => setInspectionModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-slate-300">
                <div className="font-bold text-white">{selectedInvoiceLine?.product_name || "-"}</div>
                <div className="mt-1">Returnable Quantity: {selectedInvoiceLine?.returnable_qty || 0}</div>
                <div>Unit Price: {money(selectedInvoiceLine?.unit_price || 0)}</div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  max={selectedInvoiceLine?.returnable_qty || 1}
                  className="field !py-2 !px-3 !text-xs"
                  placeholder="Quantity"
                  value={inspectionForm.quantity}
                  onChange={(event) =>
                    setInspectionForm((prev) => ({ ...prev, quantity: Number(event.target.value || 1) }))
                  }
                />
                <select
                  className="field !py-2 !px-3 !text-xs"
                  value={inspectionForm.return_type}
                  onChange={(event) =>
                    setInspectionForm((prev) => ({ ...prev, return_type: event.target.value }))
                  }
                >
                  {(meta.return_types || RETURN_TYPE_ORDER).map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <select
                  className="field !py-2 !px-3 !text-xs"
                  value={inspectionForm.return_reason}
                  onChange={(event) =>
                    setInspectionForm((prev) => ({ ...prev, return_reason: event.target.value }))
                  }
                >
                  {(meta.return_reasons || []).map((reason) => (
                    <option key={reason} value={reason}>
                      {reason}
                    </option>
                  ))}
                </select>
                <select
                  className="field !py-2 !px-3 !text-xs"
                  value={inspectionForm.item_condition}
                  onChange={(event) =>
                    setInspectionForm((prev) => ({ ...prev, item_condition: event.target.value }))
                  }
                >
                  {CONDITION_ORDER.map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>
                <input
                  className="field !py-2 !px-3 !text-xs md:col-span-2"
                  placeholder="Inspection note"
                  value={inspectionForm.inspection_note}
                  onChange={(event) =>
                    setInspectionForm((prev) => ({ ...prev, inspection_note: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button size="sm" onClick={submitInspection} disabled={busy}>
                  Save Pending Return
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {processModalOpen && selectedReturnRecord && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-900 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 bg-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white">Process Return</h3>
                <p className="text-xs text-slate-400">{selectedReturnRecord.return_id} • {selectedReturnRecord.product_name}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setProcessModalOpen(false)}>
                Close
              </Button>
            </div>
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <select
                  className="field !py-2 !px-3 !text-xs"
                  value={processForm.decision_status}
                  onChange={(event) =>
                    setProcessForm((prev) => ({ ...prev, decision_status: event.target.value }))
                  }
                >
                  {(meta.statuses || STATUS_ORDER).map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <select
                  className="field !py-2 !px-3 !text-xs"
                  value={processForm.item_condition || selectedReturnRecord.item_condition || "Reusable"}
                  onChange={(event) =>
                    setProcessForm((prev) => ({ ...prev, item_condition: event.target.value }))
                  }
                >
                  {CONDITION_ORDER.map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>

                {(processForm.decision_status === "Refunded" || processForm.decision_status === "Closed") && (
                  <>
                    <input
                      type="number"
                      min="0"
                      className="field !py-2 !px-3 !text-xs"
                      placeholder="Refund amount"
                      value={processForm.refund_amount}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, refund_amount: event.target.value }))
                      }
                    />
                    <select
                      className="field !py-2 !px-3 !text-xs"
                      value={processForm.refund_method}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, refund_method: event.target.value }))
                      }
                    >
                      {(meta.refund_methods || REFUND_METHOD_ORDER).map((method) => (
                        <option key={method} value={method}>
                          {method}
                        </option>
                      ))}
                    </select>
                  </>
                )}

                {processForm.decision_status === "Exchanged" && (
                  <>
                    <select
                      className="field !py-2 !px-3 !text-xs md:col-span-2"
                      value={processForm.replacement_item_id}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, replacement_item_id: event.target.value }))
                      }
                    >
                      <option value="">Select replacement item</option>
                      {replacementInventoryRows.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.quantity} in stock)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="1"
                      className="field !py-2 !px-3 !text-xs"
                      placeholder="Replacement quantity"
                      value={processForm.replacement_quantity}
                      onChange={(event) =>
                        setProcessForm((prev) => ({ ...prev, replacement_quantity: Number(event.target.value || 1) }))
                      }
                    />
                  </>
                )}

                <input
                  className="field !py-2 !px-3 !text-xs md:col-span-2"
                  placeholder="Inspection note"
                  value={processForm.inspection_note}
                  onChange={(event) =>
                    setProcessForm((prev) => ({ ...prev, inspection_note: event.target.value }))
                  }
                />
                <input
                  className="field !py-2 !px-3 !text-xs md:col-span-2"
                  placeholder="Process note"
                  value={processForm.process_note}
                  onChange={(event) =>
                    setProcessForm((prev) => ({ ...prev, process_note: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="secondary" onClick={() => setProcessModalOpen(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={submitProcess} disabled={busy}>
                  Save Decision
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTabButton({ active, onClick, label }) {
  return (
    <button
      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "bg-indigo-500/25 border border-indigo-500/40 text-indigo-100"
          : "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
