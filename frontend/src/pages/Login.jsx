import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { clearAuthState, hasPermission, NAV_PERMISSION_MAP, savePermissions } from "../lib/rbac";
import "./Login.css";

function roleToLabel(role) {
  const raw = String(role || "").trim();
  if (!raw) return "Staff";
  return raw
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function pickLandingPath(permissions) {
  if (!Array.isArray(permissions) || permissions.length === 0) return "/dashboard";
  const navRows = Object.entries(NAV_PERMISSION_MAP);
  for (const [path, permission] of navRows) {
    if (hasPermission(permission, permissions)) return path;
  }
  return "/access-denied";
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.2-.9 2.3-1.9 3l3 2.3c1.7-1.6 2.7-4 2.7-6.8 0-.7-.1-1.5-.2-2.2H12z" />
      <path fill="#34A853" d="M12 22c2.4 0 4.5-.8 6-2.2l-3-2.3c-.8.5-1.9.9-3 .9-2.3 0-4.2-1.5-4.9-3.6l-3.1 2.4C5.4 20.2 8.5 22 12 22z" />
      <path fill="#4A90E2" d="M7.1 14.8A6 6 0 0 1 6.8 13c0-.6.1-1.2.3-1.8L4 8.8A10 10 0 0 0 3 13c0 1.5.4 2.9 1 4.2l3.1-2.4z" />
      <path fill="#FBBC05" d="M12 7.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A10 10 0 0 0 12 4a10 10 0 0 0-8 4.8l3.1 2.4c.7-2.1 2.6-3.6 4.9-3.6z" />
    </svg>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = useMemo(() => Boolean(String(username || "").trim() && password && !submitting), [username, password, submitting]);

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setError("");

    try {
      const form = new URLSearchParams();
      form.set("username", String(username || "").trim());
      form.set("password", password);
      form.set("grant_type", "password");
      form.set("remember_me", rememberMe ? "true" : "false");

      const tokenRes = await api.post("/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const accessToken = tokenRes?.data?.access_token;
      if (!accessToken) throw new Error("Missing access token");

      localStorage.setItem("token", accessToken);
      if (tokenRes?.data?.session_id) localStorage.setItem("session_id", tokenRes.data.session_id);

      const [meRes, permissionRes] = await Promise.all([
        api.get("/auth/me"),
        api.get("/auth/me/permissions").catch(() => ({ data: { permissions: [] } })),
      ]);

      const me = meRes?.data || {};
      const permissions = savePermissions(permissionRes?.data?.permissions || []);

      localStorage.setItem("username", me?.username || String(username || "").trim());
      localStorage.setItem("login_role", me?.role || "staff");
      localStorage.setItem("login_role_label", roleToLabel(me?.role || "staff"));

      navigate(pickLandingPath(permissions), { replace: true });
    } catch (err) {
      clearAuthState();
      const detail = err?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Sign in failed. Please verify username and password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="exact-login-shell">
      <section className="exact-login-window">
        <div className="exact-login-visual">
          <div className="exact-login-brand">iSTORE OS</div>

          <div className="exact-login-copy">
            <h2>Enterprise POS &amp; Repair Management</h2>
            <p>Premium control surface for mobile sales, diagnostics, and lifecycle execution.</p>
          </div>

          <div className="exact-login-dots" aria-hidden="true">
            <span className="active" />
            <span />
            <span />
          </div>
        </div>

        <div className="exact-login-auth">
          <div className="exact-login-form-shell">
            <header className="exact-login-head">
              <h1>Welcome back</h1>
              <p>
                New to our system? <a href="#support">Contact IT support</a>
              </p>
            </header>

            <form className="exact-login-form" onSubmit={onSubmit}>
              <label className="exact-login-field">
                <span className="sr-only">Username</span>
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  placeholder="Username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  disabled={submitting}
                />
              </label>

              <label className="exact-login-field exact-login-password">
                <span className="sr-only">Password</span>
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={submitting}
                />
                <button
                  type="button"
                  className="exact-login-eye"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={submitting}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </label>

              <label className="exact-login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                  disabled={submitting}
                />
                <span>Remember my login details</span>
              </label>

              {error ? <div className="exact-login-error">{error}</div> : null}

              <button type="submit" className="exact-login-submit" disabled={!canSubmit}>
                {submitting ? "Signing in..." : "Sign in to account"}
              </button>

              <div className="exact-login-divider">OR AUTHENTICATE WITH</div>

              <button type="button" className="exact-login-google" disabled>
                <GoogleMark />
                <span>Sign in with Google</span>
              </button>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
