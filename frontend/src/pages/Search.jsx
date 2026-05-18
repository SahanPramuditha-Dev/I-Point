import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api from "../lib/api";
import { SectionCard, Badge, Button } from "../components/UI";
import {
  Search as SearchIcon,
  User,
  Wrench,
  ShoppingBag,
  Box,
  ArrowRight,
  History,
  Zap,
  Trash2,
  Filter,
  Pin,
  PinOff,
  X,
  Phone,
  Pencil,
  Plus,
  Keyboard,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const RECENT_KEY = "recent_searches";
const PINNED_KEY = "pinned_searches";

const filters = [
  { id: "all", label: "All", icon: null },
  { id: "customers", label: "Customers", icon: <User size={13} /> },
  { id: "repairs", label: "Repairs", icon: <Wrench size={13} /> },
  { id: "inventory", label: "Inventory", icon: <Box size={13} /> },
  { id: "sales", label: "Sales", icon: <ShoppingBag size={13} /> },
];

function normalize(v) {
  return String(v || "").toLowerCase().trim();
}

function scoreText(target, query) {
  const t = normalize(target);
  const q = normalize(query);
  if (!q || !t) return 0;
  if (t === q) return 120;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 60;
  return 0;
}

function scoreItem(type, item, query) {
  if (!query) return 0;
  if (type === "customers") {
    return Math.max(scoreText(item.name, query), scoreText(item.phone, query), scoreText(item.email, query));
  }
  if (type === "repairs") {
    let s = Math.max(scoreText(item.ticket_no, query), scoreText(item.device_model, query));
    if (item.status === "Pending" || item.status === "Diagnosing") s += 8;
    return s;
  }
  if (type === "inventory") {
    let s = Math.max(scoreText(item.name, query), scoreText(item.sku, query));
    if ((item.quantity || 0) <= 3) s += 6;
    return s;
  }
  if (type === "sales") {
    return Math.max(scoreText(item.invoice_no, query), scoreText(item.id, query));
  }
  return 0;
}

function Highlight({ text, query }) {
  const raw = String(text || "");
  const q = normalize(query);
  if (!q) return raw;
  const lower = raw.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return raw;
  const before = raw.slice(0, idx);
  const match = raw.slice(idx, idx + q.length);
  const after = raw.slice(idx + q.length);
  return (
    <>
      {before}
      <mark className="rounded bg-indigo-500/25 px-0.5 text-inherit">{match}</mark>
      {after}
    </>
  );
}

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [recent, setRecent] = useState(() => JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"));
  const [pinned, setPinned] = useState(() => JSON.parse(localStorage.getItem(PINNED_KEY) || "[]"));
  const [activeIndex, setActiveIndex] = useState(0);

  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get("/search/suggestions")
      .then((res) => setSuggestions(res.data || []))
      .catch(() => setSuggestions([]));
  }, []);

  const rememberQuery = useCallback((val) => {
    if (val.length <= 2) return;
    setRecent((prev) => {
      const updated = [val, ...prev.filter((i) => i !== val)].slice(0, 8);
      localStorage.setItem(RECENT_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleSearch = useCallback(
    async (val) => {
      if (val.length < 2) {
        setResults(null);
        return;
      }
      setLoading(true);
      try {
        const { data } = await api.get(`/search/global?q=${encodeURIComponent(val)}`);
        setResults(data);
        rememberQuery(val);
      } catch {
        setResults({ customers: [], repairs: [], inventory: [], sales: [] });
      } finally {
        setLoading(false);
      }
    },
    [rememberQuery]
  );

  const onInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) handleSearch(val);
    else setResults(null);
  };

  const clearRecent = () => {
    setRecent([]);
    localStorage.removeItem(RECENT_KEY);
  };

  const togglePin = (val) => {
    setPinned((prev) => {
      const exists = prev.includes(val);
      const updated = exists ? prev.filter((x) => x !== val) : [val, ...prev].slice(0, 8);
      localStorage.setItem(PINNED_KEY, JSON.stringify(updated));
      return updated;
    });
  };

  const filteredRepairs = useMemo(() => {
    const rows = results?.repairs || [];
    return rows.filter((r) => {
      if (statusFilter === "all") return true;
      if (statusFilter === "pending") return r.status === "Pending" || r.status === "Diagnosing";
      if (statusFilter === "completed") return r.status === "Completed" || r.status === "Delivered";
      return true;
    });
  }, [results, statusFilter]);

  const filteredInventory = useMemo(() => {
    const rows = results?.inventory || [];
    return rows.filter((i) => {
      if (stockFilter === "all") return true;
      if (stockFilter === "low") return (i.quantity || 0) <= 3;
      return true;
    });
  }, [results, stockFilter]);

  const groupedResults = useMemo(() => {
    const base = {
      customers: results?.customers || [],
      repairs: filteredRepairs,
      inventory: filteredInventory,
      sales: results?.sales || [],
    };

    const sorted = {};
    Object.entries(base).forEach(([type, rows]) => {
      sorted[type] = [...rows].sort((a, b) => scoreItem(type, b, query) - scoreItem(type, a, query));
    });
    return sorted;
  }, [results, filteredRepairs, filteredInventory, query]);

  const counts = useMemo(() => {
    return {
      customers: groupedResults.customers.length,
      repairs: groupedResults.repairs.length,
      inventory: groupedResults.inventory.length,
      sales: groupedResults.sales.length,
    };
  }, [groupedResults]);

  const flatResults = useMemo(() => {
    const out = [];
    const pushType = (type, rows) => rows.forEach((item) => out.push({ type, item }));
    if (activeFilter === "all") {
      pushType("customers", groupedResults.customers);
      pushType("repairs", groupedResults.repairs);
      pushType("inventory", groupedResults.inventory);
      pushType("sales", groupedResults.sales);
    } else {
      pushType(activeFilter, groupedResults[activeFilter] || []);
    }
    return out;
  }, [activeFilter, groupedResults]);

  useEffect(() => {
    setActiveIndex(0);
  }, [flatResults.length, activeFilter, query]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        if (query) {
          setQuery("");
          setResults(null);
          inputRef.current?.focus();
        }
      }
      if (!flatResults.length) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((v) => (v + 1) % flatResults.length);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((v) => (v - 1 + flatResults.length) % flatResults.length);
      }
      if (e.key === "Enter") {
        const sel = flatResults[activeIndex];
        if (!sel) return;
        if (sel.type === "customers") navigate(`/customers/${sel.item.id}`);
        if (sel.type === "repairs") navigate(`/repairs?id=${sel.item.id}`);
        if (sel.type === "inventory") navigate(`/inventory?q=${sel.item.sku}`);
        if (sel.type === "sales") navigate(`/pos/history?id=${sel.item.id}`);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activeIndex, flatResults, navigate, query]);

  const selected = flatResults[activeIndex] || null;

  const showResults = query.length >= 2;

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-4 animate-in fade-in">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">
              Search <span className="text-indigo-500">Hub</span>
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Fast global lookup for customers, repairs, inventory, and invoices.</p>
          </div>
          <Badge tone="indigo" className="px-3 py-1 text-[10px] font-black uppercase tracking-widest">
            <Keyboard size={11} /> Ctrl/Cmd + K
          </Badge>
        </div>

        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            ref={inputRef}
            autoFocus
            type="text"
            placeholder="Search by customer, ticket, IMEI, SKU, invoice..."
            className="h-14 w-full rounded-2xl border border-slate-200 bg-white/90 pl-12 pr-28 text-base font-semibold text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500/50 dark:border-white/10 dark:bg-[#0f172a]/70 dark:text-white"
            value={query}
            onChange={onInputChange}
          />
          <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-2">
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setResults(null);
                  inputRef.current?.focus();
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                title="Clear"
              >
                <X size={16} />
              </button>
            )}
            {loading && <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />}
          </div>
        </div>
      </div>

      {!showResults && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><Zap size={13} className="text-amber-500" />Suggestions</span>
            {suggestions.map((s) => (
              <button key={s} onClick={() => { setQuery(s); handleSearch(s); }} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                {s}
              </button>
            ))}
          </div>

          {!!pinned.length && (
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><Pin size={13} className="text-indigo-500" />Pinned</span>
              {pinned.map((p) => (
                <button key={p} onClick={() => { setQuery(p); handleSearch(p); }} className="rounded-xl border border-indigo-300/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300">
                  {p}
                </button>
              ))}
            </div>
          )}

          {!!recent.length && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><History size={13} className="text-sky-500" />Recent</span>
              {recent.map((r) => (
                <div key={r} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1 dark:border-white/10 dark:bg-white/5">
                  <button onClick={() => { setQuery(r); handleSearch(r); }} className="text-xs font-semibold text-slate-600 dark:text-slate-300">{r}</button>
                  <button onClick={() => togglePin(r)} className="p-1 text-slate-400 hover:text-indigo-500" title="Pin query">
                    <Pin size={11} />
                  </button>
                </div>
              ))}
              <button onClick={clearRecent} className="rounded-lg p-1.5 text-slate-400 hover:text-rose-500"><Trash2 size={13} /></button>
            </div>
          )}
        </div>
      )}

      {showResults && (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500"><Filter size={13} className="text-indigo-500" />Filters</span>
              {filters.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${activeFilter === f.id ? "bg-indigo-500 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-indigo-300 dark:bg-white/5 dark:text-slate-300 dark:border-white/10"}`}
                >
                  {f.icon}
                  {f.label}
                  <span className="rounded-full bg-black/10 px-1.5 text-[10px] dark:bg-white/10">
                    {f.id === "all" ? counts.customers + counts.repairs + counts.inventory + counts.sales : counts[f.id] || 0}
                  </span>
                </button>
              ))}
              <button
                onClick={() => {
                  setStatusFilter("all");
                  setStockFilter("all");
                }}
                className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 dark:border-white/10 dark:text-slate-400"
              >
                Clear filters
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {(activeFilter === "all" || activeFilter === "repairs") && (
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
                  {[
                    { id: "all", label: "Repairs: All" },
                    { id: "pending", label: "Pending" },
                    { id: "completed", label: "Completed" },
                  ].map((s) => (
                    <button key={s.id} onClick={() => setStatusFilter(s.id)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${statusFilter === s.id ? "bg-sky-500 text-white" : "text-slate-500"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {(activeFilter === "all" || activeFilter === "inventory") && (
                <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-white/10 dark:bg-white/5">
                  {[
                    { id: "all", label: "Stock: All" },
                    { id: "low", label: "Low (<=3)" },
                  ].map((s) => (
                    <button key={s.id} onClick={() => setStockFilter(s.id)} className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${stockFilter === s.id ? "bg-emerald-500 text-white" : "text-slate-500"}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </div>
          )}

          {!loading && (
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 xl:col-span-8 space-y-4">
                {(activeFilter === "all" || activeFilter === "customers") && counts.customers > 0 && (
                  <SectionCard title={`Customers (${counts.customers})`}>
                    <div className="space-y-2">
                      {groupedResults.customers.map((c) => {
                        const idx = flatResults.findIndex((f) => f.type === "customers" && f.item.id === c.id);
                        return (
                          <div key={c.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${idx === activeIndex ? "border-indigo-400 bg-indigo-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                            <button onClick={() => navigate(`/customers/${c.id}`)} className="text-left">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100"><Highlight text={c.name} query={query} /></p>
                              <p className="text-xs text-slate-500"><Highlight text={c.phone} query={query} /></p>
                              {c.email && <p className="text-xs text-slate-500"><Highlight text={c.email} query={query} /></p>}
                            </button>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/customers/${c.id}`)}>Open</Button>
                              <Button size="sm" variant="ghost"><Phone size={13} /></Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}

                {(activeFilter === "all" || activeFilter === "repairs") && counts.repairs > 0 && (
                  <SectionCard title={`Repairs (${counts.repairs})`}>
                    <div className="space-y-2">
                      {groupedResults.repairs.map((r) => {
                        const idx = flatResults.findIndex((f) => f.type === "repairs" && f.item.id === r.id);
                        return (
                          <div key={r.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${idx === activeIndex ? "border-sky-400 bg-sky-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                            <button onClick={() => navigate(`/repairs?id=${r.id}`)} className="text-left">
                              <p className="text-xs font-black text-sky-500"><Highlight text={r.ticket_no} query={query} /></p>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100"><Highlight text={r.device_model} query={query} /></p>
                            </button>
                            <div className="flex items-center gap-2">
                              <Badge tone={r.status === "Completed" ? "green" : "amber"}>{r.status}</Badge>
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/repairs?id=${r.id}`)}>Open</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}

                {(activeFilter === "all" || activeFilter === "inventory") && counts.inventory > 0 && (
                  <SectionCard title={`Inventory (${counts.inventory})`}>
                    <div className="space-y-2">
                      {groupedResults.inventory.map((i) => {
                        const idx = flatResults.findIndex((f) => f.type === "inventory" && f.item.id === i.id);
                        return (
                          <div key={i.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${idx === activeIndex ? "border-emerald-400 bg-emerald-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                            <button onClick={() => navigate(`/inventory?q=${i.sku}`)} className="text-left">
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-100"><Highlight text={i.name} query={query} /></p>
                              <p className="text-[11px] font-mono text-slate-500"><Highlight text={i.sku} query={query} /></p>
                            </button>
                            <div className="flex items-center gap-2">
                              <Badge tone={(i.quantity || 0) <= 3 ? "red" : "green"}>Qty {i.quantity}</Badge>
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/inventory?q=${i.sku}`)}>Open</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}

                {(activeFilter === "all" || activeFilter === "sales") && counts.sales > 0 && (
                  <SectionCard title={`Sales (${counts.sales})`}>
                    <div className="space-y-2">
                      {groupedResults.sales.map((s) => {
                        const idx = flatResults.findIndex((f) => f.type === "sales" && f.item.id === s.id);
                        return (
                          <div key={s.id} className={`flex items-center justify-between rounded-xl border px-3 py-2 ${idx === activeIndex ? "border-indigo-400 bg-indigo-500/10" : "border-white/10 bg-white/[0.02]"}`}>
                            <button onClick={() => navigate(`/pos/history?id=${s.id}`)} className="text-left">
                              <p className="text-sm font-black text-indigo-500"><Highlight text={s.invoice_no} query={query} /></p>
                              <p className="text-xs text-slate-500">{new Date(s.created_at).toLocaleDateString()}</p>
                            </button>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-black text-slate-800 dark:text-slate-100">LKR {Number(s.total || 0).toLocaleString()}</p>
                              <Button size="sm" variant="ghost" onClick={() => navigate(`/pos/history?id=${s.id}`)}>Open</Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                )}

                {!loading && results && flatResults.length === 0 && (
                  <SectionCard title="No matches found" subtitle={`No results for "${query}"`}>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => navigate("/customers")}> <Plus size={13} /> Create Customer</Button>
                      <Button size="sm" variant="secondary" onClick={() => navigate("/repairs")}> <Plus size={13} /> Create Repair</Button>
                      <Button size="sm" variant="ghost" onClick={() => setQuery(query.slice(0, -1))}>Try shorter term</Button>
                    </div>
                  </SectionCard>
                )}
              </div>

              <div className="col-span-12 xl:col-span-4">
                <SectionCard title="Quick Preview" subtitle="Selected result details">
                  {!selected && <p className="text-sm text-slate-500">Use arrow keys to navigate results.</p>}
                  {selected && (
                    <div className="space-y-2 text-sm">
                      <Badge tone="indigo" className="text-[10px] uppercase">{selected.type}</Badge>
                      {selected.type === "customers" && (
                        <>
                          <p className="font-bold text-slate-800 dark:text-slate-100">{selected.item.name}</p>
                          <p className="text-slate-500">Phone: {selected.item.phone}</p>
                          {selected.item.email && <p className="text-slate-500">Email: {selected.item.email}</p>}
                          <div className="flex gap-2 pt-2">
                            <Button size="sm" onClick={() => navigate(`/customers/${selected.item.id}`)}>Open</Button>
                            <Button size="sm" variant="ghost"><Pencil size={13} /> Edit</Button>
                          </div>
                        </>
                      )}
                      {selected.type === "repairs" && (
                        <>
                          <p className="font-bold text-slate-800 dark:text-slate-100">{selected.item.ticket_no}</p>
                          <p className="text-slate-500">Device: {selected.item.device_model}</p>
                          <Badge tone={selected.item.status === "Completed" ? "green" : "amber"}>{selected.item.status}</Badge>
                          <div className="pt-2">
                            <Button size="sm" onClick={() => navigate(`/repairs?id=${selected.item.id}`)}>Open Ticket</Button>
                          </div>
                        </>
                      )}
                      {selected.type === "inventory" && (
                        <>
                          <p className="font-bold text-slate-800 dark:text-slate-100">{selected.item.name}</p>
                          <p className="text-slate-500">SKU: {selected.item.sku}</p>
                          <Badge tone={(selected.item.quantity || 0) <= 3 ? "red" : "green"}>Qty {selected.item.quantity}</Badge>
                          <div className="pt-2">
                            <Button size="sm" onClick={() => navigate(`/inventory?q=${selected.item.sku}`)}>Open Item</Button>
                          </div>
                        </>
                      )}
                      {selected.type === "sales" && (
                        <>
                          <p className="font-bold text-slate-800 dark:text-slate-100">{selected.item.invoice_no}</p>
                          <p className="text-slate-500">Date: {new Date(selected.item.created_at).toLocaleString()}</p>
                          <p className="font-black text-emerald-600 dark:text-emerald-300">LKR {Number(selected.item.total || 0).toLocaleString()}</p>
                          <div className="pt-2">
                            <Button size="sm" onClick={() => navigate(`/pos/history?id=${selected.item.id}`)}>Open Invoice</Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </SectionCard>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
