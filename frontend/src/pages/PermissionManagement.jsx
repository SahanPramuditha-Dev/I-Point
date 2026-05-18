import { useEffect, useMemo, useState } from "react";
import {
  Check,
  RefreshCw,
  Save,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import api from "../lib/api";
import { useFeedback } from "../components/FeedbackProvider";
import { Badge, Button, Input, KpiCard, SectionCard, Select, Table } from "../components/UI";
import { hasPermission, loadPermissions } from "../lib/rbac";

function permissionKey(roleId, permissionId) {
  return `${Number(roleId)}:${Number(permissionId)}`;
}

function roleTone(roleName) {
  const key = String(roleName || "").toLowerCase();
  if (key.includes("owner")) return "amber";
  if (key.includes("admin")) return "indigo";
  if (key.includes("manager")) return "indigo";
  if (key.includes("technician")) return "sky";
  if (key.includes("view")) return "slate";
  return "green";
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows : [];
}

export default function PermissionManagement() {
  const { toast } = useFeedback();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState([]);
  const [rbacData, setRbacData] = useState({
    roles: [],
    permissions: [],
    grouped_modules: {},
    role_permissions: [],
  });
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [draftMap, setDraftMap] = useState({});
  const [sourceMap, setSourceMap] = useState({});

  const [selectedUserId, setSelectedUserId] = useState("");
  const [overrideRows, setOverrideRows] = useState([]);
  const [effectivePermissions, setEffectivePermissions] = useState([]);
  const [overrideDraft, setOverrideDraft] = useState({ permission_id: "", effect: "allow", reason: "" });

  const permissions = useMemo(() => loadPermissions(), []);
  const canManage = hasPermission("settings.manage_settings", permissions);

  const roles = useMemo(() => normalizeRows(rbacData.roles), [rbacData.roles]);
  const permissionCatalog = useMemo(() => normalizeRows(rbacData.permissions), [rbacData.permissions]);
  const groupedModules = useMemo(() => rbacData.grouped_modules || {}, [rbacData.grouped_modules]);

  const selectedRole = useMemo(
    () => roles.find((row) => Number(row.id) === Number(selectedRoleId)) || null,
    [roles, selectedRoleId]
  );

  const selectedRoleName = selectedRole?.display_name || selectedRole?.name || "";
  const selectedRoleProtected = Boolean(selectedRole?.is_protected && String(selectedRole?.name || "") === "owner");

  const changedCount = useMemo(() => {
    if (!selectedRoleId) return 0;
    let count = 0;
    for (const perm of permissionCatalog) {
      const key = permissionKey(selectedRoleId, perm.id);
      const a = Boolean(sourceMap[key]);
      const b = Boolean(draftMap[key]);
      if (a !== b) count += 1;
    }
    return count;
  }, [selectedRoleId, permissionCatalog, sourceMap, draftMap]);

  const roleEnabledCount = useMemo(() => {
    if (!selectedRoleId) return 0;
    return permissionCatalog.filter((perm) => Boolean(draftMap[permissionKey(selectedRoleId, perm.id)])).length;
  }, [selectedRoleId, permissionCatalog, draftMap]);

  const filteredModules = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return groupedModules;

    const out = {};
    Object.entries(groupedModules).forEach(([module, rows]) => {
      const filtered = normalizeRows(rows).filter((row) => {
        const code = String(row.code || "").toLowerCase();
        const action = String(row.action || "").toLowerCase();
        const label = String(row.label || "").toLowerCase();
        const mod = String(module || "").toLowerCase();
        return code.includes(q) || action.includes(q) || label.includes(q) || mod.includes(q);
      });
      if (filtered.length > 0) out[module] = filtered;
    });
    return out;
  }, [groupedModules, search]);

  const kpis = useMemo(() => {
    const totalRoles = roles.length;
    const totalPermissions = permissionCatalog.length;
    const assigned = selectedRoleId ? roleEnabledCount : 0;
    const totalOverrides = overrideRows.length;
    return [
      { title: "Roles", value: String(totalRoles), tone: "indigo", icon: <Shield size={16} /> },
      { title: "Permissions", value: String(totalPermissions), tone: "sky", icon: <ShieldCheck size={16} /> },
      {
        title: "Selected Role Access",
        value: selectedRoleId ? `${assigned}/${totalPermissions}` : "-",
        tone: assigned === totalPermissions ? "green" : "amber",
        icon: <Check size={16} />,
      },
      { title: "User Overrides", value: String(totalOverrides), tone: "violet", icon: <Users size={16} /> },
    ];
  }, [roles.length, permissionCatalog.length, roleEnabledCount, selectedRoleId, overrideRows.length]);

  const rebuildPermissionMaps = (payload) => {
    const map = {};
    for (const row of normalizeRows(payload?.role_permissions)) {
      const key = permissionKey(row.role_id, row.permission_id);
      map[key] = Boolean(row.allowed);
    }
    setSourceMap(map);
    setDraftMap({ ...map });
  };

  const loadRbacData = async () => {
    const [rbacRes, staffRes] = await Promise.all([
      api.get("/settings/access-control/rbac"),
      api.get("/settings/employees").catch(() => ({ data: [] })),
    ]);

    const payload = rbacRes?.data || {};
    setRbacData({
      roles: normalizeRows(payload.roles),
      permissions: normalizeRows(payload.permissions),
      grouped_modules: payload.grouped_modules || {},
      role_permissions: normalizeRows(payload.role_permissions),
    });
    setEmployees(normalizeRows(staffRes?.data));
    rebuildPermissionMaps(payload);

    const roleRows = normalizeRows(payload.roles);
    const preferred = roleRows.find((row) => String(row.name || "") === "manager") || roleRows[0] || null;
    if (preferred && (!selectedRoleId || !roleRows.find((row) => Number(row.id) === Number(selectedRoleId)))) {
      setSelectedRoleId(Number(preferred.id));
    }
  };

  const loadOverrides = async (userId) => {
    if (!userId) {
      setOverrideRows([]);
      setEffectivePermissions([]);
      return;
    }
    const [ovRes, effRes] = await Promise.all([
      api.get(`/settings/access-control/users/${userId}/overrides`),
      api.get(`/settings/access-control/users/${userId}/effective-permissions`),
    ]);
    setOverrideRows(normalizeRows(ovRes?.data?.overrides));
    setEffectivePermissions(normalizeRows(effRes?.data?.permissions));
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await loadRbacData();
    } catch (error) {
      toast(error?.response?.data?.detail || "Failed to load permission management data.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (selectedUserId) {
      loadOverrides(selectedUserId).catch((error) => {
        toast(error?.response?.data?.detail || "Failed to load user overrides.", "error");
      });
    } else {
      setOverrideRows([]);
      setEffectivePermissions([]);
    }
  }, [selectedUserId]);

  const isAllowed = (permissionId) => {
    if (!selectedRoleId) return false;
    return Boolean(draftMap[permissionKey(selectedRoleId, permissionId)]);
  };

  const togglePermission = (permissionId) => {
    if (!selectedRoleId || !canManage || selectedRoleProtected) return;
    const key = permissionKey(selectedRoleId, permissionId);
    setDraftMap((prev) => ({ ...prev, [key]: !Boolean(prev[key]) }));
  };

  const saveRoleChanges = async () => {
    if (!selectedRoleId || !canManage || selectedRoleProtected) return;

    const allowIds = [];
    const denyIds = [];

    for (const perm of permissionCatalog) {
      const key = permissionKey(selectedRoleId, perm.id);
      const original = Boolean(sourceMap[key]);
      const current = Boolean(draftMap[key]);
      if (original === current) continue;
      if (current) allowIds.push(Number(perm.id));
      else denyIds.push(Number(perm.id));
    }

    if (allowIds.length === 0 && denyIds.length === 0) {
      toast("No changes to save.", "warning");
      return;
    }

    setSaving(true);
    try {
      if (allowIds.length > 0) {
        await api.put(`/settings/access-control/roles/${selectedRoleId}/permissions`, {
          permission_ids: allowIds,
          allowed: true,
        });
      }
      if (denyIds.length > 0) {
        await api.put(`/settings/access-control/roles/${selectedRoleId}/permissions`, {
          permission_ids: denyIds,
          allowed: false,
        });
      }
      await loadRbacData();
      toast("Role permissions updated successfully.", "success");
    } catch (error) {
      toast(error?.response?.data?.detail || "Failed to save role permissions.", "error");
    } finally {
      setSaving(false);
    }
  };

  const applyRoleBulk = async (allow) => {
    if (!selectedRoleId || !canManage || selectedRoleProtected) return;
    setGrantBusy(true);
    try {
      await api.post(`/settings/access-control/roles/${selectedRoleId}/${allow ? "grant-all" : "revoke-all"}`);
      await loadRbacData();
      toast(allow ? "All permissions granted." : "All permissions revoked.", "success");
    } catch (error) {
      toast(error?.response?.data?.detail || "Failed to apply bulk permission update.", "error");
    } finally {
      setGrantBusy(false);
    }
  };

  const addOverride = async () => {
    if (!canManage) return;
    if (!selectedUserId) {
      toast("Select a user first.", "warning");
      return;
    }
    if (!overrideDraft.permission_id) {
      toast("Select a permission to override.", "warning");
      return;
    }
    try {
      await api.put(`/settings/access-control/users/${selectedUserId}/overrides`, {
        permission_id: Number(overrideDraft.permission_id),
        effect: overrideDraft.effect,
        reason: overrideDraft.reason || "",
      });
      await loadOverrides(selectedUserId);
      setOverrideDraft({ permission_id: "", effect: "allow", reason: "" });
      toast("Override saved.", "success");
    } catch (error) {
      toast(error?.response?.data?.detail || "Failed to save override.", "error");
    }
  };

  const removeOverride = async (permissionId) => {
    if (!canManage || !selectedUserId) return;
    try {
      await api.delete(`/settings/access-control/users/${selectedUserId}/overrides/${permissionId}`);
      await loadOverrides(selectedUserId);
      toast("Override removed.", "success");
    } catch (error) {
      toast(error?.response?.data?.detail || "Failed to remove override.", "error");
    }
  };

  if (loading) {
    return <div className="h-full min-h-0 grid place-items-center text-slate-400">Loading permission management...</div>;
  }

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-3">
            <Shield className="text-indigo-300" /> Permission Management
          </h1>
          <p className="text-xs text-slate-400 mt-1">Manage role-based access, permission overrides, and effective access policies.</p>
        </div>
        <Button variant="secondary" onClick={loadAll}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {!canManage && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 flex items-center gap-2">
          <ShieldAlert size={14} />
          You have read-only access. `settings.manage_settings` permission is required to modify permissions.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.title} title={kpi.title} value={kpi.value} tone={kpi.tone} icon={kpi.icon} />
        ))}
      </div>

      <SectionCard
        title="Role Permissions"
        subtitle="Granular module/action permission matrix for each role."
        right={
          <div className="inline-flex items-center gap-2">
            <Badge tone={changedCount > 0 ? "amber" : "green"}>{changedCount} pending</Badge>
            <Button size="sm" variant="secondary" disabled={grantBusy || !canManage || selectedRoleProtected} onClick={() => applyRoleBulk(true)}>
              Grant All
            </Button>
            <Button size="sm" variant="secondary" disabled={grantBusy || !canManage || selectedRoleProtected} onClick={() => applyRoleBulk(false)}>
              Revoke All
            </Button>
            <Button size="sm" disabled={saving || !canManage || selectedRoleProtected} onClick={saveRoleChanges}>
              <Save size={13} /> {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Role</span>
            <Select value={selectedRoleId || ""} onChange={(e) => setSelectedRoleId(Number(e.target.value || 0) || null)}>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.display_name || role.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Search permission</span>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-500" />
              <Input className="pl-9" placeholder="Filter by module, action, or code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </label>
        </div>

        <div className="mb-3 flex items-center gap-2 text-xs text-slate-300">
          <Badge tone={roleTone(selectedRoleName)}>{selectedRoleName || "-"}</Badge>
          {selectedRoleProtected ? <span className="text-amber-300">Owner role is locked and always allowed.</span> : null}
        </div>

        <div className="space-y-3">
          {Object.keys(filteredModules).length === 0 && (
            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-8 text-center text-sm text-slate-500">No permissions match the current filter.</div>
          )}

          {Object.entries(filteredModules)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([module, rows]) => (
              <div key={module} className="rounded-xl border border-white/10 bg-black/20 overflow-hidden">
                <div className="px-3 py-2 border-b border-white/10 bg-white/5 flex items-center justify-between">
                  <div className="font-semibold text-slate-100 uppercase tracking-wider text-xs">{module}</div>
                  <Badge tone="slate">{rows.length} actions</Badge>
                </div>
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Code</th>
                        <th>Label</th>
                        <th>Allowed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((perm) => {
                        const allowed = isAllowed(perm.permission_id);
                        return (
                          <tr key={perm.permission_id}>
                            <td>{perm.action}</td>
                            <td>{perm.code}</td>
                            <td>{perm.label || perm.code}</td>
                            <td>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={allowed}
                                  disabled={!canManage || selectedRoleProtected}
                                  onChange={() => togglePermission(perm.permission_id)}
                                />
                                <span className={allowed ? "text-emerald-300" : "text-slate-400"}>{allowed ? "Allowed" : "Blocked"}</span>
                              </label>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              </div>
            ))}
        </div>
      </SectionCard>

      <SectionCard title="User Permission Overrides" subtitle="Apply user-specific allow/deny overrides on top of role permissions.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">User</span>
            <Select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Select user</option>
              {employees.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.full_name} (@{user.username})
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Permission</span>
            <Select
              value={overrideDraft.permission_id}
              onChange={(e) => setOverrideDraft((prev) => ({ ...prev, permission_id: e.target.value }))}
              disabled={!selectedUserId || !canManage}
            >
              <option value="">Select permission</option>
              {permissionCatalog.map((perm) => (
                <option key={perm.id} value={perm.id}>
                  {perm.code}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Effect</span>
            <Select
              value={overrideDraft.effect}
              onChange={(e) => setOverrideDraft((prev) => ({ ...prev, effect: e.target.value }))}
              disabled={!selectedUserId || !canManage}
            >
              <option value="allow">Allow</option>
              <option value="deny">Deny</option>
            </Select>
          </label>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 mb-4">
          <Input
            placeholder="Reason (optional)"
            value={overrideDraft.reason}
            disabled={!selectedUserId || !canManage}
            onChange={(e) => setOverrideDraft((prev) => ({ ...prev, reason: e.target.value }))}
          />
          <Button disabled={!selectedUserId || !canManage} onClick={addOverride}>
            Save Override
          </Button>
        </div>

        {selectedUserId && (
          <div className="mb-3 text-xs text-slate-300">
            Effective permissions: <span className="text-indigo-200 font-semibold">{effectivePermissions.length}</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/25">
          <Table className="text-xs">
            <thead>
              <tr>
                <th>Permission</th>
                <th>Effect</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {overrideRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-6 text-slate-500">
                    {selectedUserId ? "No overrides configured." : "Select a user to manage overrides."}
                  </td>
                </tr>
              )}
              {overrideRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.permission_code}</td>
                  <td>
                    <Badge tone={row.effect === "allow" ? "green" : "red"}>{row.effect}</Badge>
                  </td>
                  <td>{row.reason || "-"}</td>
                  <td>
                    <Button size="sm" variant="danger" disabled={!canManage} onClick={() => removeOverride(row.permission_id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </SectionCard>
    </div>
  );
}
