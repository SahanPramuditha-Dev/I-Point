import { useMemo, useState } from "react";
import api from "../../lib/api";
import { useFetch } from "../../hooks/useFetch";
import { downloadCsv, downloadPdf, paginateRows } from "../../lib/tableUtils";
import { AppCard, StickyTable } from "../../components/MuiPrimitives";

const emptyLine = { item_id: "", quantity: 1, damaged_qty: 0, unit_cost: 0 };

export default function InventoryGrn() {
  const { data: suppliers } = useFetch("/inventory/suppliers");
  const { data: items } = useFetch("/inventory");
  const { data: purchaseOrders } = useFetch("/purchase");
  const { data: rows, setData } = useFetch("/inventory/grn");

  const [form, setForm] = useState({ supplier_id: "", po_id: "", invoice_no: "", note: "", lines: [{ ...emptyLine }] });
  const [historyQuery, setHistoryQuery] = useState("");
  const [page, setPage] = useState(1);
  const availablePos = useMemo(
    () =>
      (purchaseOrders || []).filter(
        (po) => String(po.status || "").toLowerCase() !== "received" && (!form.supplier_id || Number(po.supplier_id) === Number(form.supplier_id))
      ),
    [purchaseOrders, form.supplier_id]
  );

  const historyFiltered = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    if (!q) return rows || [];
    return (rows || []).filter((r) =>
      [r.grn_no, r.supplier_name, r.po_number, r.invoice_no, r.note].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [rows, historyQuery]);
  const { pageRows, totalPages } = paginateRows(historyFiltered, page, 12);
  const canSubmit = useMemo(() => Number(form.supplier_id) > 0 && form.lines.some((l) => Number(l.item_id) > 0 && Number(l.quantity) > 0), [form]);

  const setLine = (index, patch) => {
    const lines = [...form.lines];
    lines[index] = { ...lines[index], ...patch };
    setForm({ ...form, lines });
  };
  const addLine = () => setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  const removeLine = (index) => setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });

  const linkPo = async (poIdValue) => {
    if (!poIdValue) {
      setForm({ ...form, po_id: "", lines: form.lines.length ? form.lines : [{ ...emptyLine }] });
      return;
    }
    let poDetail = availablePos.find((po) => Number(po.id) === Number(poIdValue));
    if (!poDetail || !Array.isArray(poDetail.items)) {
      const res = await api.get(`/purchase/${poIdValue}`);
      poDetail = res.data;
    }
    const poLines = (poDetail.items || []).map((line) => ({
      item_id: line.item_id,
      quantity: Number(line.quantity || 1),
      damaged_qty: 0,
      unit_cost: Number(line.unit_cost || 0),
    }));
    setForm({
      ...form,
      supplier_id: poDetail?.supplier_id ? String(poDetail.supplier_id) : form.supplier_id,
      po_id: String(poIdValue),
      lines: poLines.length ? poLines : [{ ...emptyLine }],
    });
  };

  const submit = async () => {
    if (!canSubmit) return;
    const payload = {
      supplier_id: Number(form.supplier_id),
      po_id: form.po_id ? Number(form.po_id) : null,
      invoice_no: form.invoice_no || null,
      note: form.note || null,
      lines: form.lines
        .filter((l) => Number(l.item_id) > 0 && Number(l.quantity) > 0)
        .map((l) => ({
          item_id: Number(l.item_id),
          quantity: Number(l.quantity),
          damaged_qty: Number(l.damaged_qty || 0),
          unit_cost: Number(l.unit_cost || 0),
        })),
    };
    const res = await api.post("/inventory/grn", payload);
    const now = new Date().toISOString();
    const linkedPo = (purchaseOrders || []).find((po) => Number(po.id) === Number(payload.po_id || 0));
    setData([{ id: res.data.grn_id, grn_no: res.data.grn_no, supplier_id: payload.supplier_id, supplier_name: (suppliers || []).find((s) => s.id === payload.supplier_id)?.name || "", po_id: payload.po_id, po_number: linkedPo?.po_number || null, invoice_no: payload.invoice_no, note: payload.note, created_at: now }, ...(rows || [])]);
    setForm({ supplier_id: "", po_id: "", invoice_no: "", note: "", lines: [{ ...emptyLine }] });
  };

  return (
    <div className="space-y-3">
      <AppCard title="Create GRN">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <select className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" value={form.supplier_id} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
            <option value="">Select supplier</option>
            {(suppliers || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select
            className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100"
            value={form.po_id}
            onChange={(e) => linkPo(e.target.value)}
          >
            <option value="">Link PO (optional)</option>
            {availablePos.map((po) => <option key={po.id} value={po.id}>{po.po_number} ({po.status})</option>)}
          </select>
          <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" placeholder="Supplier invoice number" value={form.invoice_no} onChange={(e) => setForm({ ...form, invoice_no: e.target.value })} />
          <input className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" placeholder="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        </div>

        <div className="mt-3 space-y-2">
          {form.lines.map((line, index) => (
            <div key={index} className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-black/20 p-2 md:grid-cols-12">
              <select className="md:col-span-5 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" value={line.item_id} onChange={(e) => setLine(index, { item_id: e.target.value })}>
                <option value="">Select product</option>
                {(items || []).map((i) => <option key={i.id} value={i.id}>{i.name} ({i.sku})</option>)}
              </select>
              <input type="number" min="1" className="md:col-span-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" placeholder="Qty" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} />
              <input type="number" min="0" className="md:col-span-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" placeholder="Damaged" value={line.damaged_qty} onChange={(e) => setLine(index, { damaged_qty: e.target.value })} />
              <input type="number" min="0" className="md:col-span-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-slate-100" placeholder="Unit cost" value={line.unit_cost} onChange={(e) => setLine(index, { unit_cost: e.target.value })} />
              <button onClick={() => removeLine(index)} className="md:col-span-1 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-2 text-xs font-bold text-rose-300">X</button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={addLine} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-slate-200">+ Add Line</button>
          <button disabled={!canSubmit} onClick={submit} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">Post GRN</button>
        </div>
      </AppCard>

      <AppCard
        title="Recent GRN Entries"
        actions={(
          <div className="flex items-center gap-2">
            <input value={historyQuery} onChange={(e) => { setHistoryQuery(e.target.value); setPage(1); }} placeholder="Search GRN history..." className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs text-slate-100" />
            <button onClick={() => downloadCsv("inventory-grn-history.csv", [
              { label: "GRN", value: "grn_no" },
              { label: "Supplier", value: "supplier_name" },
              { label: "PO", value: "po_number" },
              { label: "Invoice", value: "invoice_no" },
              { label: "Note", value: "note" },
              { label: "Created At", value: "created_at" },
            ], historyFiltered)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200">
              Export CSV
            </button>
            <button onClick={async () => downloadPdf("inventory-grn-history", "Inventory GRN History Report", [
              { label: "GRN", value: "grn_no" },
              { label: "Supplier", value: "supplier_name" },
              { label: "PO", value: "po_number" },
              { label: "Invoice", value: "invoice_no" },
              { label: "Note", value: "note" },
              { label: "Created At", value: "created_at" },
            ], historyFiltered)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-200">
              Export PDF
            </button>
          </div>
        )}
      >
        <StickyTable
          maxHeight={420}
          rows={pageRows}
          columns={[
            { key: "grn_no", label: "GRN", render: (r) => <span className="text-indigo-300">{r.grn_no}</span> },
            { key: "supplier_name", label: "Supplier", render: (r) => <span className="text-slate-200">{r.supplier_name}</span> },
            { key: "po_number", label: "PO", render: (r) => <span className="text-slate-400">{r.po_number || "-"}</span> },
            { key: "invoice_no", label: "Invoice", render: (r) => <span className="text-slate-400">{r.invoice_no || "-"}</span> },
            { key: "note", label: "Note", render: (r) => <span className="text-slate-400">{r.note || "-"}</span> },
            { key: "created_at", label: "Date", render: (r) => <span className="text-slate-500">{r.created_at ? new Date(r.created_at).toLocaleString() : "-"}</span> },
          ]}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
          <span>{historyFiltered.length} entries</span>
          <div className="inline-flex items-center gap-1">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Prev</button>
            <span>{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded border border-white/10 px-2 py-1 disabled:opacity-40">Next</button>
          </div>
        </div>
      </AppCard>
    </div>
  );
}
