import { useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { Badge, Button, Input, KpiCard, PageTitle, SectionCard, Table } from "../components/UI";
import { Barcode, Layers, Printer, Tag, X } from "lucide-react";

export default function Barcodes() {
  const { data, loading } = useFetch("/inventory");
  const [query, setQuery] = useState("");
  const [printList, setPrintList] = useState([]);

  const filtered = useMemo(
    () =>
      (data || []).filter(
        (i) =>
          !query ||
          i.name.toLowerCase().includes(query.toLowerCase()) ||
          (i.barcode || i.sku || "").toLowerCase().includes(query.toLowerCase())
      ),
    [data, query]
  );

  const totalLabels = useMemo(() => printList.reduce((acc, p) => acc + p.count, 0), [printList]);

  const addToPrint = (item) => {
    const existing = printList.find((p) => p.id === item.id);
    if (existing) {
      setPrintList(printList.map((p) => (p.id === item.id ? { ...p, count: p.count + 1 } : p)));
    } else {
      setPrintList([...printList, { ...item, count: 1 }]);
    }
  };

  const remove = (id) => setPrintList(printList.filter((p) => p.id !== id));
  const updateCount = (id, count) =>
    setPrintList(printList.map((p) => (p.id === id ? { ...p, count: Math.max(1, count) } : p)));

  const generatePDF = () => {
    let labelsHtml = "";
    printList.forEach((item) => {
      for (let i = 0; i < item.count; i++) {
        labelsHtml += `
          <div class="label">
            <div class="store">i Store</div>
            <div class="name">${item.name}</div>
            <div class="barcode">${item.barcode || item.sku}</div>
            <div class="price">LKR ${item.sale_price.toLocaleString()}</div>
          </div>
        `;
      }
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Bulk Labels</title>
          <style>
            @page { margin: 10mm; }
            body { font-family: sans-serif; display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
            .label { border: 1px solid #eee; padding: 5mm; text-align: center; width: 45mm; height: 25mm; display: flex; flex-direction: column; justify-content: center; }
            .store { font-size: 8px; font-weight: bold; }
            .name { font-size: 10px; margin: 2px 0; overflow: hidden; white-space: nowrap; }
            .barcode { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; margin: 2px 0; }
            .price { font-size: 12px; font-weight: bold; }
          </style>
        </head>
        <body onload="window.print()">${labelsHtml}</body>
      </html>
    `);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 rounded-2xl border border-white/10 bg-white/5">
        Loading inventory…
      </div>
    );
  }

  const inv = data || [];

  return (
    <div className="space-y-4">
      <PageTitle title="Labels & barcodes" subtitle="Pick products and print bulk label sheets" />

      <div className="grid grid-cols-12 gap-3">
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="sky"
          title="Catalog"
          value={String(inv.length)}
          hint="Inventory SKUs"
          icon={<Tag size={18} />}
        />
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="violet"
          title="In queue"
          value={String(printList.length)}
          hint="Unique products"
          icon={<Layers size={18} />}
        />
        <KpiCard
          className="col-span-12 sm:col-span-6 xl:col-span-4"
          tone="green"
          title="Labels to print"
          value={String(totalLabels)}
          hint="Sum of copies"
          icon={<Barcode size={18} />}
        />
      </div>

      <div className="grid grid-cols-12 gap-4">
        <SectionCard title="Search products" className="col-span-12 lg:col-span-7">
          <Input placeholder="Search name, SKU, barcode…" className="mb-4" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="max-h-[500px] overflow-auto">
            <Table className="table-base">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Code</th>
                  <th>Price</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((i) => (
                  <tr key={i.id}>
                    <td className="font-medium text-white">{i.name}</td>
                    <td className="font-mono text-xs text-slate-400">{i.barcode || i.sku}</td>
                    <td className="text-sky-200 font-semibold">LKR {Number(i.sale_price).toLocaleString()}</td>
                    <td className="text-right">
                      <Button size="sm" variant="secondary" onClick={() => addToPrint(i)}>
                        + Add
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </SectionCard>

        <SectionCard title="Print queue" className="col-span-12 lg:col-span-5" right={<Badge tone="sky">{totalLabels} labels</Badge>}>
          {printList.length === 0 ? (
            <div className="py-20 text-center text-slate-500 text-sm rounded-xl border border-dashed border-white/10 bg-white/5">
              Select products on the left to build your sheet.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-h-[400px] overflow-auto pr-1 space-y-2">
                {printList.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 bg-white/5 p-3 rounded-xl border border-white/10"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-500 font-mono">{p.sku}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Input
                        type="number"
                        className="w-16 text-center text-sm"
                        min={1}
                        value={p.count}
                        onChange={(e) => updateCount(p.id, parseInt(e.target.value, 10) || 1)}
                      />
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        className="btn btn-ghost btn-sm px-2 py-2 text-rose-200 border-rose-500/20"
                        title="Remove"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <p className="text-xs text-slate-400">
                  Ready to print <span className="text-white font-bold">{totalLabels}</span> labels.
                </p>
                <Button onClick={generatePDF} className="inline-flex items-center gap-2">
                  <Printer size={16} />
                  Print labels
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
