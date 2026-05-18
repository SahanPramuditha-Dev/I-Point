import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Wrench,
  Boxes,
  ShoppingCart,
  Truck,
  Users,
  BarChart3,
  Settings,
  Database,
  LogOut,
  Bell,
  Search,
  Moon,
  Sun,
  Barcode,
  History,
  ShieldCheck,
  Shield,
  Search as SearchIcon,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFetch } from "../hooks/useFetch";
import { hasPermission, loadPermissions, NAV_PERMISSION_MAP } from "../lib/rbac";
import api from "../lib/api";

const navGroups = [
  {
    label: "Main",
    items: [
      ["/dashboard", "Dashboard", LayoutDashboard],
      ["/search", "Search Hub", SearchIcon],
    ],
  },
  {
    label: "Operations",
    items: [
      ["/repairs", "Repair Management", Wrench],
      ["/warranty", "Warranty", Shield],
      ["/returns", "Returns & Refunds", RotateCcw],
      ["/inventory/products", "Inventory", Boxes],
      ["/purchase", "Purchasing", Truck],
      ["/expenses", "Expenses", Wallet],
      ["/pos", "POS / Billing", ShoppingCart],
    ],
  },
  {
    label: "People",
    items: [["/customers", "Customers", Users]],
  },
  {
    label: "Analytics",
    items: [
      ["/reports", "Reports", BarChart3],
      ["/financials", "Financial Audit", ShieldCheck],
      ["/barcodes", "Labels", Barcode],
    ],
  },
  {
    label: "System",
    items: [
      ["/permissions", "Permissions", Shield],
      ["/audit", "Audit Trail", History],
      ["/backup", "Backup", Database],
      ["/settings", "Settings", Settings],
    ],
  },
];

function initials(name) {
  const s = (name || "").trim();
  if (!s) return "IS";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return s.slice(0, 2).toUpperCase();
}

export default function Layout() {
  const location = useLocation();
  const n = useNavigate();
  const [dark, setDark] = useState(() => (localStorage.getItem("theme") ?? "dark") === "dark");
  const [collapsed, setCollapsed] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const { data: repairs } = useFetch("/repairs");
  const { data: dashboardData } = useFetch("/dashboard");
  const { data: apiNotifications } = useFetch("/notifications");

  const permissions = useMemo(() => loadPermissions(), [location.pathname]);
  const pendingRepairs = useMemo(() => {
    const rows = Array.isArray(repairs) ? repairs : [];
    return rows.filter((r) => r.status && r.status !== "Delivered").length;
  }, [repairs]);

  const notifications = useMemo(() => {
    const items = [...(apiNotifications || [])];
    const lowStockItems = dashboardData?.low_stock_items || [];
    if (lowStockItems.length > 0) {
      items.push({
        id: "low-stock",
        title: "Low Stock Alert",
        message: `${lowStockItems.length} items below threshold`,
      });
    }
    return items;
  }, [dashboardData, pendingRepairs, apiNotifications]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  const visibleNavGroups = useMemo(
    () =>
      navGroups
        .map((group) => ({
          ...group,
          items: group.items.filter(([to]) => hasPermission(NAV_PERMISSION_MAP[to], permissions)),
        }))
        .filter((group) => group.items.length > 0),
    [permissions]
  );
  const visibleFlatNav = visibleNavGroups.flatMap((g) => g.items);
  const crumb = visibleFlatNav.find(([to]) => location.pathname.startsWith(to))?.[1] ?? "Dashboard";
  const displayName = localStorage.getItem("username") || "Store Admin";
  const roleLabel = localStorage.getItem("login_role_label") || localStorage.getItem("login_role") || "Staff";

  return (
    <div className="app-shell transition-colors duration-300">
      <div className="flex h-screen overflow-hidden">
        <aside 
          className={`${collapsed ? 'w-[80px]' : 'w-[280px]'} border-r border-[var(--sidebar-border)] px-3 py-5 bg-[var(--sidebar-bg)] flex flex-col h-full shrink-0 transition-all duration-300 ease-in-out`}
        >
          <div className={`px-2 mb-8 flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-3`}>
            {!collapsed && (
              <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 shadow-lg grid place-items-center text-white font-extrabold text-sm">
                  iS
                </div>
                <div>
                  <h1 className="text-xl font-extrabold text-[var(--app-text)]">iStore</h1>
                  <p className="text-[11px] text-slate-400">Business Suite</p>
                </div>
              </div>
            )}
            {collapsed && (
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 shadow-lg grid place-items-center text-white font-extrabold text-sm">
                iS
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-0 overflow-y-auto overflow-x-hidden pr-1 custom-scrollbar">
            {visibleNavGroups.map((group) => (
              <div key={group.label} className="mb-6">
                {!collapsed && (
                  <div className="px-3 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 animate-in fade-in">
                    {group.label}
                  </div>
                )}
                {collapsed && <div className="h-px bg-slate-800/50 mx-2 mb-4" />}
                <div className="space-y-1">
                  {group.items.map(([to, label, Icon]) => (
                    <NavLink
                      key={to}
                      to={to}
                      title={collapsed ? label : ""}
                      className={({ isActive }) =>
                        `flex items-center gap-3 p-3 rounded-xl transition-all group ${
                          collapsed ? 'justify-center' : ''
                        } ${
                          isActive ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-200 border border-indigo-500/20 shadow-sm shadow-indigo-500/10" : "text-[var(--sidebar-text)] hover:bg-black/5 dark:hover:bg-white/5"
                        }`
                      }
                    >
                      <Icon size={20} className={collapsed ? 'shrink-0' : 'shrink-0'} />
                      {!collapsed && <span className="font-medium text-sm truncate animate-in fade-in slide-in-from-left-1">{label}</span>}
                      {!collapsed && to === "/repairs" && pendingRepairs > 0 && (
                        <span className="ml-auto bg-rose-500 text-[10px] px-1.5 py-0.5 rounded-full text-white">{pendingRepairs}</span>
                      )}
                      {collapsed && to === "/repairs" && pendingRepairs > 0 && (
                        <div className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-[var(--sidebar-bg)]" />
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-auto pt-4 border-t border-[var(--sidebar-border)]">
            {!collapsed ? (
              <div className="flex items-center gap-3 px-3 py-4 mb-2 bg-black/5 dark:bg-white/5 rounded-2xl border border-[var(--sidebar-border)] animate-in fade-in slide-in-from-bottom-2">
                <div className="h-10 w-10 rounded-full bg-orange-500 grid place-items-center text-white font-black text-xs border-2 border-white/20">
                  {initials(displayName)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--app-text)] truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate">{roleLabel}</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-center mb-2">
                <div className="h-10 w-10 rounded-full bg-orange-500 grid place-items-center text-white font-black text-xs border-2 border-white/20">
                  {initials(displayName)}
                </div>
              </div>
            )}
            <button
              onClick={async () => {
                try {
                  const sessionId = localStorage.getItem("session_id");
                  await api.post("/auth/logout", { session_id: sessionId || null, logout_all: false });
                } catch {
                  // local logout fallback
                }
                localStorage.clear();
                n("/login");
              }}
              className={`w-full p-3 rounded-xl bg-black/5 dark:bg-white/5 text-[var(--sidebar-text)] flex items-center gap-2 hover:bg-rose-500/10 hover:text-rose-400 transition ${collapsed ? 'justify-center' : 'justify-center'}`}
            >
              <LogOut size={18} /> {!collapsed && <span className="text-sm font-medium">Logout</span>}
            </button>
          </div>
        </aside>

        <main className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden p-5 transition-all duration-300 bg-[var(--app-bg)]">
          <div className="flex items-center justify-between mb-6">
             <div className="flex items-center gap-4">
                <button 
                  onClick={() => setCollapsed(!collapsed)}
                  className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 transition-colors"
                >
                  {collapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
                </button>
                <div className="text-sm text-slate-500">iStore / <span className="text-[var(--app-text)] font-bold">{crumb}</span></div>
             </div>
             <div className="flex items-center gap-4">
                <div className="relative w-64">
                   <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                   <input onClick={() => n('/search')} className="w-full bg-black/5 dark:bg-white/5 border border-[var(--sidebar-border)] rounded-full pl-9 pr-4 py-2 text-sm text-[var(--app-text)] focus:outline-none focus:border-indigo-500/50" placeholder="Search system..." readOnly />
                </div>
                <button onClick={() => setShowNotifications(!showNotifications)} className="p-2.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--sidebar-border)] text-slate-500 relative">
                  <Bell size={18} />
                  {notifications.length > 0 && <span className="absolute top-0 right-0 w-2 h-2 bg-rose-500 rounded-full border-2 border-[var(--app-bg)]"></span>}
                </button>
                <button
                  className="p-2.5 rounded-full bg-black/5 dark:bg-white/5 border border-[var(--sidebar-border)] text-slate-500"
                  title={dark ? "Switch to light" : "Switch to dark"}
                  onClick={() => setDark((d) => !d)}
                >
                  {dark ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button
                  type="button"
                  onClick={() => n("/settings")}
                  title="Open account settings"
                  className="h-9 w-9 rounded-full bg-indigo-500 grid place-items-center text-white text-xs font-black border border-white/20 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-indigo-400/70"
                >
                  {initials(displayName)}
                </button>
             </div>
          </div>

          {showNotifications && (
            <div className="absolute right-5 top-20 z-50 w-80 bg-[var(--sidebar-bg)] border border-[var(--sidebar-border)] rounded-2xl shadow-2xl p-4 animate-in fade-in slide-in-from-top-2">
               <h4 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">Notifications</h4>
               <div className="space-y-2">
                 {notifications.map(n => (
                   <div key={n.id} className={`p-3 rounded-xl border ${n.is_read ? 'bg-white/2 border-white/5 opacity-60' : 'bg-indigo-500/10 border-indigo-500/20'}`}>
                     <p className="text-sm font-bold text-white">{n.title}</p>
                     <p className="text-[10px] text-slate-400 mt-1">{n.message}</p>
                   </div>
                 ))}
                 {notifications.length === 0 && <p className="text-center py-4 text-xs text-slate-600">No alerts</p>}
               </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
