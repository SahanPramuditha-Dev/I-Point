import { useState, useEffect, useCallback } from "react";
import api from "../lib/api";
import { Input, SectionCard, Badge, Button } from "../components/UI";
import { Search as SearchIcon, User, Wrench, ShoppingBag, Box, ArrowRight, History, Zap, Trash2, Filter } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Search() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(() => JSON.parse(localStorage.getItem("recent_searches") || "[]"));
  const [suggestions, setSuggestions] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | pending | completed
  const [stockFilter, setStockFilter] = useState("all"); // all | low
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/search/suggestions')
      .then(res => setSuggestions(res.data))
      .catch(err => console.error("Failed to load suggestions", err));
  }, []);

  const handleSearch = useCallback(async (val) => {
    if (val.length < 2) {
      setResults(null);
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.get(`/search/global?q=${val}`);
      setResults(data);
      // Add to recent if not already there
      if (val.length > 3) {
        setRecent(prev => {
          const updated = [val, ...prev.filter(i => i !== val)].slice(0, 5);
          localStorage.setItem("recent_searches", JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error("Search failed", err);
      setResults({ customers: [], repairs: [], inventory: [], sales: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  const onInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    if (val.length >= 2) {
      handleSearch(val);
    } else {
      setResults(null);
    }
  };

  const filteredRepairs = results?.repairs?.filter(r => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'pending') return r.status === 'Pending' || r.status === 'Diagnosing';
    if (statusFilter === 'completed') return r.status === 'Completed' || r.status === 'Delivered';
    return true;
  }) || [];

  const filteredInventory = results?.inventory?.filter(i => {
    if (stockFilter === 'all') return true;
    if (stockFilter === 'low') return i.quantity <= 3;
    return true;
  }) || [];

  const clearRecent = () => {
    setRecent([]);
    localStorage.removeItem("recent_searches");
  };

  const filters = [
    { id: 'all', label: 'All Results' },
    { id: 'customers', label: 'Customers', icon: <User size={14}/> },
    { id: 'repairs', label: 'Repairs', icon: <Wrench size={14}/> },
    { id: 'inventory', label: 'Inventory', icon: <Box size={14}/> },
    { id: 'sales', label: 'Invoices', icon: <ShoppingBag size={14}/> },
  ];

  return (
    <div className="min-h-[80vh] flex flex-col items-center max-w-6xl mx-auto space-y-12 pb-20 pt-10 px-4 animate-in fade-in duration-1000 relative">
      {/* Premium Mesh Background Effect */}
      <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[400px] bg-indigo-500/5 blur-[120px] rounded-full pointer-events-none -z-10" />
      <div className="absolute top-40 left-1/4 w-[300px] h-[300px] bg-sky-500/5 blur-[100px] rounded-full pointer-events-none -z-10 animate-pulse" />

      <div className="text-center space-y-4 max-w-2xl">
        <h1 className="text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
          Search <span className="text-indigo-500">Hub</span>
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-lg font-medium">
          The ultimate control center for your store data.
        </p>
      </div>

      <div className="w-full max-w-3xl space-y-8">
        <div className="relative group">
          <div className="absolute inset-y-0 left-8 flex items-center pointer-events-none">
            <SearchIcon className="text-slate-400 group-focus-within:text-indigo-500 transition-all duration-300 group-focus-within:scale-110" size={28} />
          </div>
          <input 
            autoFocus
            type="text" 
            placeholder="Try 'iPhone' or 'Kamal'..."
            className="w-full h-24 bg-white/80 dark:bg-[#0f172a]/60 backdrop-blur-3xl border-2 border-slate-200 dark:border-white/10 rounded-[40px] pl-20 pr-10 text-2xl text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all shadow-2xl"
            value={query}
            onChange={onInputChange}
          />
          {loading && (
            <div className="absolute right-8 top-9">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent"></div>
            </div>
          )}
        </div>

        {/* Suggestions Bar */}
        {!results && !loading && (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex flex-wrap items-center justify-center gap-3">
               <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest mr-2">
                  <Zap size={14} className="text-amber-500" />
                  Suggestions
               </div>
               {suggestions.map(s => (
                <button key={s} onClick={() => { setQuery(s); handleSearch(s); }} className="px-5 py-2.5 rounded-2xl bg-white dark:bg-white/5 hover:bg-indigo-500/10 hover:text-indigo-500 border border-slate-200 dark:border-white/5 hover:border-indigo-500/30 text-sm font-semibold text-slate-600 dark:text-slate-400 transition-all hover:scale-105 active:scale-95 shadow-sm">
                  {s}
                </button>
               ))}
            </div>

            {recent.length > 0 && (
              <div className="flex flex-col items-center space-y-3">
                 <div className="flex items-center gap-2 text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    <History size={14} className="text-sky-500" />
                    Recent History
                 </div>
                 <div className="flex flex-wrap justify-center gap-2">
                    {recent.map(r => (
                      <button key={r} onClick={() => { setQuery(r); handleSearch(r); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100/50 dark:bg-white/[0.03] hover:bg-slate-200 dark:hover:bg-white/10 text-xs font-bold text-slate-500 dark:text-slate-400 transition group">
                         {r}
                         <ArrowRight size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                    <button onClick={clearRecent} className="p-2 text-slate-400 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                 </div>
              </div>
            )}
          </div>
        )}
      </div>

      {query.length >= 2 && (
        <div className="w-full space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
           <div className="flex flex-col items-center gap-6 relative">
             <div className="absolute inset-0 bg-indigo-500/5 blur-3xl rounded-full -z-10" />
             <div className="flex items-center gap-3 text-slate-400 font-black uppercase text-[11px] tracking-[.3em]">
                <div className="relative">
                  <Filter size={14} className="text-indigo-500" />
                  <div className="absolute inset-0 animate-ping bg-indigo-500/40 rounded-full" />
                </div>
                Smart Search Filters
             </div>
             <div className="flex items-center gap-1.5 p-1.5 bg-white dark:bg-white/5 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-2xl">
                {filters.map(f => (
                  <button 
                    key={f.id} 
                    onClick={() => setActiveFilter(f.id)}
                    className={`flex items-center gap-2 px-8 py-3 rounded-[18px] text-sm font-bold transition-all duration-300 ${activeFilter === f.id ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-105' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'}`}
                  >
                    {f.icon} {f.label}
                  </button>
                ))}
             </div>

             <div className="flex items-center gap-8">
               {/* Sub-filters for Repairs */}
               {(activeFilter === 'all' || activeFilter === 'repairs') && (
                 <div className="flex items-center gap-4 bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-2xl border border-slate-200 dark:border-white/5 animate-in zoom-in-95">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tickets:</span>
                   <div className="flex gap-1">
                    {['all', 'pending', 'completed'].map(s => (
                      <button key={s} onClick={() => setStatusFilter(s)} className={`px-4 py-1.5 rounded-xl text-[11px] font-bold transition ${statusFilter === s ? 'bg-sky-500 text-white shadow-md' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                        {s.toUpperCase()}
                      </button>
                    ))}
                   </div>
                 </div>
               )}

               {/* Sub-filters for Inventory */}
               {(activeFilter === 'all' || activeFilter === 'inventory') && (
                 <div className="flex items-center gap-4 bg-slate-100 dark:bg-white/5 px-4 py-2 rounded-2xl border border-slate-200 dark:border-white/5 animate-in zoom-in-95">
                   <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Stock:</span>
                   <div className="flex gap-1">
                    {['all', 'low'].map(s => (
                      <button key={s} onClick={() => setStockFilter(s)} className={`px-4 py-1.5 rounded-xl text-[11px] font-bold transition ${stockFilter === s ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'}`}>
                        {s === 'low' ? 'LOW (≤3)' : 'ALL'}
                      </button>
                    ))}
                   </div>
                 </div>
               )}
             </div>
           </div>

           <div className="grid grid-cols-12 gap-8">
            {/* Customers */}
            {(activeFilter === 'all' || activeFilter === 'customers') && results?.customers?.length > 0 && (
              <SectionCard title="Customers" className={activeFilter === 'all' ? "col-span-6" : "col-span-12"} icon={<User size={16} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {results.customers.map(c => (
                    <div key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-white/[0.02] hover:bg-indigo-500/5 border border-slate-200 dark:border-white/5 hover:border-indigo-500/20 transition-all cursor-pointer group shadow-sm hover:shadow-md">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 grid place-items-center text-indigo-500 font-black text-lg">{c.name[0]}</div>
                        <div>
                          <p className="font-black text-slate-800 dark:text-white text-base tracking-tight">{c.name}</p>
                          <p className="text-xs text-slate-500 font-medium">{c.phone}</p>
                        </div>
                      </div>
                      <div className="w-10 h-10 rounded-full border border-slate-200 dark:border-white/10 grid place-items-center group-hover:bg-indigo-500 group-hover:border-indigo-500 transition-all duration-300">
                        <ArrowRight size={16} className="text-slate-400 group-hover:text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Repairs */}
            {(activeFilter === 'all' || activeFilter === 'repairs') && filteredRepairs.length > 0 && (
              <SectionCard title="Repair Tickets" className={activeFilter === 'all' ? "col-span-6" : "col-span-12"} icon={<Wrench size={16} />}>
                <div className="grid grid-cols-1 gap-3">
                  {filteredRepairs.map(r => (
                    <div key={r.id} onClick={() => navigate(`/repairs?id=${r.id}`)} className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-white/[0.02] hover:bg-sky-500/5 border border-slate-200 dark:border-white/5 hover:border-sky-500/20 transition-all cursor-pointer group shadow-sm">
                      <div className="flex items-center gap-5">
                        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 grid place-items-center text-sky-500"><Wrench size={20} /></div>
                        <div>
                          <p className="font-black text-sky-600 dark:text-sky-400 text-sm tracking-tight">{r.ticket_no}</p>
                          <p className="text-sm text-slate-800 dark:text-slate-100 font-bold">{r.device_model}</p>
                        </div>
                      </div>
                      <Badge tone={r.status === 'Completed' ? 'green' : 'amber'} className="px-4 py-1 rounded-xl text-[10px] font-black tracking-widest">{r.status.toUpperCase()}</Badge>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Inventory */}
            {(activeFilter === 'all' || activeFilter === 'inventory') && filteredInventory.length > 0 && (
              <SectionCard title="Inventory Items" className={activeFilter === 'all' ? "col-span-6" : "col-span-12"} icon={<Box size={16} />}>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredInventory.map(i => (
                    <div key={i.id} onClick={() => navigate(`/inventory?q=${i.sku}`)} className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-white/[0.02] hover:bg-emerald-500/5 border border-slate-200 dark:border-white/5 hover:border-emerald-500/20 transition-all cursor-pointer group shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 grid place-items-center text-emerald-500"><Box size={22} /></div>
                        <div>
                          <p className="font-bold text-slate-800 dark:text-white text-sm">{i.name}</p>
                          <p className="text-[10px] text-slate-500 font-mono font-black uppercase tracking-widest">{i.sku}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-black ${i.quantity <= 3 ? 'text-rose-500' : 'text-emerald-500'}`}>{i.quantity}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">Units</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* Sales */}
            {(activeFilter === 'all' || activeFilter === 'sales') && results?.sales?.length > 0 && (
              <SectionCard title="Invoices / Sales" className={activeFilter === 'all' ? "col-span-6" : "col-span-12"} icon={<ShoppingBag size={16} />}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {results.sales.map(s => (
                    <div key={s.id} onClick={() => navigate(`/pos/history?id=${s.id}`)} className="flex items-center justify-between p-5 rounded-3xl bg-white dark:bg-white/[0.02] hover:bg-indigo-500/5 border border-slate-200 dark:border-white/5 hover:border-indigo-500/20 transition-all cursor-pointer group shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 grid place-items-center text-indigo-500"><ShoppingBag size={22} /></div>
                        <div>
                          <p className="font-black text-indigo-600 dark:text-indigo-400 text-sm">{s.invoice_no}</p>
                          <p className="text-xs text-slate-500 font-bold tracking-tighter">{new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-black text-slate-900 dark:text-white tracking-tighter">LKR {s.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            )}
            
            {loading && (
              <div className="col-span-12 py-32 text-center space-y-6">
                 <div className="flex justify-center gap-4">
                   {[1,2,3].map(i => <div key={i} className="w-12 h-12 rounded-2xl bg-white/5 animate-pulse" />)}
                 </div>
                 <p className="text-slate-500 font-bold animate-pulse">Searching your store...</p>
              </div>
            )}

            {!loading && results && Object.values(results).every(arr => arr.length === 0) && (
              <div className="col-span-12 py-32 text-center space-y-6">
                 <div className="w-24 h-24 bg-slate-100 dark:bg-white/5 rounded-[32px] grid place-items-center mx-auto shadow-inner">
                    <SearchIcon size={36} className="text-slate-300 dark:text-slate-600" />
                 </div>
                 <div className="max-w-xs mx-auto">
                    <p className="text-slate-800 dark:text-white font-black text-xl">Nothing found</p>
                    <p className="text-slate-500 text-sm mt-2 leading-relaxed">We couldn't find anything matching "{query}". Try checking for typos or searching for a phone number.</p>
                 </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
