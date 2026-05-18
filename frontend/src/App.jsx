import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Repairs from "./pages/Repairs";
import Inventory from "./pages/Inventory";
import InventoryModuleLayout from "./pages/inventory/InventoryModuleLayout";
import InventoryOverview from "./pages/inventory/InventoryOverview";
import InventoryVariants from "./pages/inventory/InventoryVariants";
import InventorySerials from "./pages/inventory/InventorySerials";
import InventoryMovements from "./pages/inventory/InventoryMovements";
import InventorySuppliers from "./pages/inventory/InventorySuppliers";
import InventorySupplierLedger from "./pages/inventory/InventorySupplierLedger";
import InventoryCategories from "./pages/inventory/InventoryCategories";
import InventoryBrands from "./pages/inventory/InventoryBrands";
import InventoryGrn from "./pages/inventory/InventoryGrn";
import InventoryDiscounts from "./pages/inventory/InventoryDiscounts";
import InventoryPriceAdjustments from "./pages/inventory/InventoryPriceAdjustments";
import InventoryStockTake from "./pages/inventory/InventoryStockTake";
import InventoryStockTakeSessionDetail from "./pages/inventory/InventoryStockTakeSessionDetail";
import InventorySerialDetail from "./pages/inventory/InventorySerialDetail";
import InventoryReports from "./pages/inventory/InventoryReports";
import POS from "./pages/POS";
import Customers from "./pages/Customers";
import Warranty from "./pages/Warranty";
import ReturnsRefunds from "./pages/ReturnsRefunds";
import ReportsModuleLayout from "./pages/reports/ReportsModuleLayout";
import OverviewDashboardPage from "./pages/reports/subpages/OverviewDashboardPage";
import SalesReportsPage from "./pages/reports/subpages/SalesReportsPage";
import RepairReportsPage from "./pages/reports/subpages/RepairReportsPage";
import ProfitLossReportsPage from "./pages/reports/subpages/ProfitLossReportsPage";
import ExpenseReportsPage from "./pages/reports/subpages/ExpenseReportsPage";
import InventoryReportsPage from "./pages/reports/subpages/InventoryReportsPage";
import OutstandingPaymentsPage from "./pages/reports/subpages/OutstandingPaymentsPage";
import TechnicianPerformancePage from "./pages/reports/subpages/TechnicianPerformancePage";
import ProductPerformancePage from "./pages/reports/subpages/ProductPerformancePage";
import CustomerReportsPage from "./pages/reports/subpages/CustomerReportsPage";
import SupplierReportsPage from "./pages/reports/subpages/SupplierReportsPage";
import TaxFinancialReportsPage from "./pages/reports/subpages/TaxFinancialReportsPage";
import RefundsReturnsPage from "./pages/reports/subpages/RefundsReturnsPage";
import AuditReportsPage from "./pages/reports/subpages/AuditReportsPage";
import ExportCenterPage from "./pages/reports/subpages/ExportCenterPage";
import Backup from "./pages/Backup";
import CustomerDetail from "./pages/CustomerDetail";
import PurchaseOrders from "./pages/PurchaseOrders";
import Expenses from "./pages/Expenses";
import Barcodes from "./pages/Barcodes";
import Settings from "./pages/Settings";
import Search from "./pages/Search";
import ActivityLog from "./pages/ActivityLog";
import FinancialControl from "./pages/FinancialControl";
import AccessDenied from "./pages/AccessDenied";
import PermissionManagement from "./pages/PermissionManagement";
import { bootstrapPermissions, canAccessPath, clearAuthState, hasPermission } from "./lib/rbac";

import { useEffect, useState } from "react";
import api from "./lib/api";

function Guard({ children }) {
  const location = useLocation();
  const [authState, setAuthState] = useState({
    checking: true,
    authenticated: false,
    allowed: false,
  });

  useEffect(() => {
    let mounted = true;
    const runCheck = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        if (mounted) setAuthState({ checking: false, authenticated: false, allowed: false });
        return;
      }
      try {
        const permissions = await bootstrapPermissions(api);
        const allowed = location.pathname === "/access-denied" ? true : canAccessPath(location.pathname, permissions);
        if (mounted) setAuthState({ checking: false, authenticated: true, allowed });
      } catch {
        clearAuthState();
        if (mounted) setAuthState({ checking: false, authenticated: false, allowed: false });
      }
    };
    runCheck();
    return () => {
      mounted = false;
    };
  }, [location.pathname]);

  if (authState.checking) {
    return <div className="h-screen grid place-items-center text-slate-400">Checking access permissions...</div>;
  }
  if (!authState.authenticated) return <Navigate to="/login" replace />;
  if (!authState.allowed && location.pathname !== "/access-denied") {
    return <Navigate to="/access-denied" replace />;
  }
  return children;
}

export default function App() {
  useEffect(() => {
    const run = async () => {
      const token = localStorage.getItem("token");
      if (!token) return;
      try {
        const permissions = await bootstrapPermissions(api);
        if (!hasPermission("backup.view", permissions)) return;
        const res = await api.get("/backup/last");
        const last = res?.data?.last_backup_at;
        const now = new Date();
        if (!last || now - new Date(last) > 24 * 60 * 60 * 1000) {
          api.post("/backup/create?is_auto=true").catch(() => {});
        }
      } catch {
        // silent fallback
      }
    };
    run();
  }, []);

  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/login" element={<Login/>} />
      <Route element={<Guard><Layout/></Guard>}>
        <Route path="/access-denied" element={<AccessDenied/>} />
        <Route path="/dashboard" element={<Dashboard/>} />
        <Route path="/repairs" element={<Repairs/>} />
        <Route path="/inventory" element={<Navigate to="/inventory/overview" replace />} />
        <Route path="/inventory/*" element={<InventoryModuleLayout/>}>
          <Route path="overview" element={<InventoryOverview/>} />
          <Route path="products" element={<Inventory/>} />
          <Route path="categories" element={<InventoryCategories/>} />
          <Route path="brands" element={<InventoryBrands/>} />
          <Route path="variants" element={<InventoryVariants/>} />
          <Route path="serials" element={<InventorySerials/>} />
          <Route path="serials/:serialId" element={<InventorySerialDetail/>} />
          <Route path="movements" element={<InventoryMovements/>} />
          <Route path="grn" element={<InventoryGrn/>} />
          <Route path="stock-take" element={<InventoryStockTake/>} />
          <Route path="stock-take/:sessionId" element={<InventoryStockTakeSessionDetail/>} />
          <Route path="price-adjustments" element={<InventoryPriceAdjustments/>} />
          <Route path="discounts" element={<InventoryDiscounts/>} />
          <Route path="reports" element={<InventoryReports/>} />
          <Route path="suppliers" element={<InventorySuppliers/>} />
          <Route path="supplier-ledger" element={<InventorySupplierLedger/>} />
        </Route>
        <Route path="/purchase" element={<PurchaseOrders/>} />
        <Route path="/expenses" element={<Expenses/>} />
        <Route path="/pos" element={<POS/>} />
        <Route path="/customers" element={<Customers/>} />
        <Route path="/warranty" element={<Warranty/>} />
        <Route path="/returns" element={<ReturnsRefunds/>} />
        <Route path="/customers/:id" element={<CustomerDetail/>} />
        <Route path="/reports" element={<Navigate to="/reports/overview" replace />} />
        <Route path="/reports/*" element={<ReportsModuleLayout/>}>
          <Route path="overview" element={<OverviewDashboardPage />} />
          <Route path="sales" element={<SalesReportsPage />} />
          <Route path="repairs" element={<RepairReportsPage />} />
          <Route path="profit-loss" element={<ProfitLossReportsPage />} />
          <Route path="expenses" element={<ExpenseReportsPage />} />
          <Route path="inventory" element={<InventoryReportsPage />} />
          <Route path="outstanding-payments" element={<OutstandingPaymentsPage />} />
          <Route path="technician-performance" element={<TechnicianPerformancePage />} />
          <Route path="product-performance" element={<ProductPerformancePage />} />
          <Route path="customer-reports" element={<CustomerReportsPage />} />
          <Route path="supplier-reports" element={<SupplierReportsPage />} />
          <Route path="tax-financial" element={<TaxFinancialReportsPage />} />
          <Route path="refunds-returns" element={<RefundsReturnsPage />} />
          <Route path="audit" element={<AuditReportsPage />} />
          <Route path="export-center" element={<ExportCenterPage />} />
        </Route>
        <Route path="/barcodes" element={<Barcodes/>} />
        <Route path="/backup" element={<Backup/>} />
        <Route path="/search" element={<Search/>} />
        <Route path="/audit" element={<ActivityLog/>} />
        <Route path="/financials" element={<FinancialControl/>} />
        <Route path="/permissions" element={<PermissionManagement/>} />
        <Route path="/settings" element={<Settings/>} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard"/>} />
    </Routes>
  </BrowserRouter>;
}
