import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import api from "../lib/api";

export default function Login() {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const n = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      const body = new URLSearchParams({ username, password });
      const { data } = await api.post('/auth/login', body, { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('username', username);
      n('/dashboard');
    } catch (e) { 
      setError(e.response?.data?.detail || 'Login failed'); 
    }
  };

  return (
    <div 
      className="min-h-screen w-full flex items-center justify-center bg-cover bg-center bg-no-repeat relative font-sans"
      style={{ backgroundImage: `url('/bg-login.png')` }}
    >
      <div className="absolute inset-0 bg-indigo-900/10 mix-blend-multiply" />
      
      <div className="w-full max-w-[440px] bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-10 relative z-10 shadow-[0_8px_32px_0_rgba(31,38,135,0.37)]">
        <h1 className="text-white text-[32px] font-extrabold text-center mb-8 tracking-wide">Login</h1>
        
        <form onSubmit={submit} className="space-y-6">
          <div className="relative">
            <input 
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full bg-transparent border border-white/40 text-white placeholder-white/80 rounded-full py-3.5 px-6 outline-none focus:border-white focus:bg-white/5 transition-all text-sm font-medium"
            />
            <User className="absolute right-5 top-1/2 -translate-y-1/2 text-white/90" size={18} strokeWidth={2.5} />
          </div>

          <div className="relative">
            <input 
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-transparent border border-white/40 text-white placeholder-white/80 rounded-full py-3.5 px-6 outline-none focus:border-white focus:bg-white/5 transition-all text-sm font-medium pr-12"
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/90 hover:text-white transition-colors p-1"
            >
              {showPassword ? <EyeOff size={18} strokeWidth={2.5} /> : <Lock size={18} strokeWidth={2.5} />}
            </button>
          </div>

          <div className="flex justify-between items-center text-white text-sm px-2 pt-1 font-medium">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input 
                  type="checkbox" 
                  className="peer appearance-none w-4 h-4 border border-white/70 rounded-[3px] bg-transparent checked:bg-white checked:border-white transition-all cursor-pointer" 
                />
                <svg className="absolute w-3 h-3 text-indigo-600 opacity-0 peer-checked:opacity-100 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <span className="group-hover:text-white/80 transition-colors">Remember me</span>
            </label>
            <a href="#" className="hover:text-white/80 transition-colors">Forgot password?</a>
          </div>

          {error && (
            <div className="text-red-200 text-sm text-center font-medium bg-red-500/20 py-2.5 rounded-2xl border border-red-500/30">
              {error}
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-white text-gray-900 font-extrabold text-[15px] rounded-full py-3.5 mt-2 hover:bg-gray-100 transition-colors shadow-lg active:scale-[0.98]"
          >
            Login
          </button>
        </form>

        <p className="text-center text-white text-sm mt-8 font-medium">
          Don't have an account? <a href="#" className="font-extrabold hover:text-white/80 transition-colors ml-1">Register</a>
        </p>
      </div>
    </div>
  );
}
