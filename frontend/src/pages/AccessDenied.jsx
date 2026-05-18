import { ShieldAlert } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AccessDenied() {
  const navigate = useNavigate();
  return (
    <div className="h-full min-h-0 grid place-items-center px-6">
      <div className="w-full max-w-xl rounded-2xl border border-rose-400/25 bg-rose-500/10 p-8 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full border border-rose-300/35 bg-rose-400/15 grid place-items-center text-rose-100">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-2xl font-black text-white">Access Denied</h1>
        <p className="mt-2 text-sm text-rose-100/90">
          Your account does not have permission to view this section.
        </p>
        <div className="mt-6">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="rounded-xl border border-indigo-400/40 bg-indigo-500/20 px-4 py-2 text-sm font-bold text-indigo-100 hover:bg-indigo-500/30 transition"
          >
            Go To Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
