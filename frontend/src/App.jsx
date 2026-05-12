import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repairs from "./pages/Repairs";
import Inventory from "./pages/Inventory";
import POS from "./pages/POS";
import Customers from "./pages/Customers";
import Reports from "./pages/Reports";
import Backup from "./pages/Backup";
import CustomerDetail from "./pages/CustomerDetail";
import PurchaseOrders from "./pages/PurchaseOrders";
import Barcodes from "./pages/Barcodes";
import Settings from "./pages/Settings";
import Search from "./pages/Search";
import ActivityLog from "./pages/ActivityLog";
import FinancialControl from "./pages/FinancialControl";

import { useEffect } from "react";
import api from "./lib/api";

function Guard({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

export default function App() {
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Check last backup
      api.get('/backup/last').then(res => {
        const last = res.data.last_backup_at;
        const now = new Date();
        if (!last || (now - new Date(last)) > 24 * 60 * 60 * 1000) {
          console.log("Triggering auto backup...");
          api.post('/backup/create?is_auto=true').catch(e => console.error("Auto backup failed", e));
        }
      });
    }
  }, []);

  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<Login/>} />
      <Route element={<Guard><Layout/></Guard>}>
        <Route path="/dashboard" element={<Dashboard/>} />
        <Route path="/repairs" element={<Repairs/>} />
        <Route path="/inventory" element={<Inventory/>} />
        <Route path="/purchase" element={<PurchaseOrders/>} />
        <Route path="/pos" element={<POS/>} />
        <Route path="/customers" element={<Customers/>} />
        <Route path="/customers/:id" element={<CustomerDetail/>} />
        <Route path="/reports" element={<Reports/>} />
        <Route path="/barcodes" element={<Barcodes/>} />
        <Route path="/backup" element={<Backup/>} />
        <Route path="/search" element={<Search/>} />
        <Route path="/audit" element={<ActivityLog/>} />
        <Route path="/financials" element={<FinancialControl/>} />
        <Route path="/settings" element={<Settings/>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard"/>} />
    </Routes>
  </BrowserRouter>;
}
