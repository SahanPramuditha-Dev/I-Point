const ROUTE_PERMISSION_MAP = [
  { prefix: "/dashboard", permission: "dashboard.view" },
  { prefix: "/search", permission: "dashboard.view" },
  { prefix: "/repairs", permission: "repairs.view" },
  { prefix: "/inventory", permission: "inventory.view" },
  { prefix: "/purchase", permission: "suppliers.view" },
  { prefix: "/expenses", permission: "expenses.view" },
  { prefix: "/pos", permission: "pos.view" },
  { prefix: "/customers", permission: "customers.view" },
  { prefix: "/warranty", permission: "warranty.view" },
  { prefix: "/returns", permission: "returns.view" },
  { prefix: "/reports", permission: "reports.view" },
  { prefix: "/barcodes", permission: "labels.view" },
  { prefix: "/backup", permission: "backup.view" },
  { prefix: "/settings", permission: "settings.view" },
  { prefix: "/permissions", permission: "settings.view" },
  { prefix: "/audit", permission: "audit_logs.view" },
  { prefix: "/financials", permission: "financial_audit.view" },
];

export const AUTH_STORAGE_KEYS = ["token", "username", "permissions", "session_id", "login_role", "login_role_label"];

function uniqueStrings(values) {
  return [...new Set((values || []).map((v) => String(v || "").trim()).filter(Boolean))];
}

export function getRoutePermission(pathname) {
  const path = String(pathname || "");
  const match = ROUTE_PERMISSION_MAP.find((row) => path.startsWith(row.prefix));
  return match?.permission || null;
}

export function clearAuthState() {
  AUTH_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function loadPermissions() {
  try {
    const raw = localStorage.getItem("permissions");
    const parsed = raw ? JSON.parse(raw) : [];
    return uniqueStrings(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

export function savePermissions(permissions) {
  const clean = uniqueStrings(Array.isArray(permissions) ? permissions : []);
  localStorage.setItem("permissions", JSON.stringify(clean));
  return clean;
}

export async function bootstrapPermissions(apiClient) {
  const token = localStorage.getItem("token");
  if (!token) return [];

  let permissions = loadPermissions();
  if (permissions.length > 0) return permissions;

  if (!apiClient) return [];
  const res = await apiClient.get("/auth/me/permissions");
  permissions = savePermissions(res?.data?.permissions || []);
  return permissions;
}

export function hasPermission(permission, permissions = null) {
  if (!permission) return true;
  const list = Array.isArray(permissions) ? uniqueStrings(permissions) : loadPermissions();
  if (!Array.isArray(list) || list.length === 0) return false;
  if (list.includes("*")) return true;
  if (list.includes(permission)) return true;

  const [module] = String(permission).split(".");
  if (module && (list.includes(`${module}.*`) || list.includes(`${module}.all`))) {
    return true;
  }

  return false;
}

export function canAccessPath(pathname, permissions = null) {
  const required = getRoutePermission(pathname);
  return hasPermission(required, permissions);
}

export const NAV_PERMISSION_MAP = {
  "/dashboard": "dashboard.view",
  "/search": "dashboard.view",
  "/repairs": "repairs.view",
  "/warranty": "warranty.view",
  "/returns": "returns.view",
  "/inventory/products": "inventory.view",
  "/purchase": "suppliers.view",
  "/expenses": "expenses.view",
  "/pos": "pos.view",
  "/customers": "customers.view",
  "/reports": "reports.view",
  "/financials": "financial_audit.view",
  "/barcodes": "labels.view",
  "/audit": "audit_logs.view",
  "/backup": "backup.view",
  "/settings": "settings.view",
  "/permissions": "settings.view",
};
