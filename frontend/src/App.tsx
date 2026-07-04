import React, { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { useAuthStore } from "./store/useAuthStore";

import ProtectedRoute from "./components/common/ProtectedRoute";
import Layout from "./components/layout/Layout";
import LoginPage from "./pages/auth/LoginPage";
import DashboardPage from "./pages/client/DashboardPage";
import SchedulePage from "./pages/client/SchedulePage";
import BookingListPage from "./pages/client/BookingListPage";
import InvoiceListPage from "./pages/client/InvoiceListPage";
import DocumentListPage from "./pages/client/DocumentListPage";

import AdminBookingPage from "./pages/admin/AdminBookingPage";
import AdminShipmentPage from "./pages/admin/AdminShipmentPage";
import AdminSchedulePage from "./pages/admin/AdminSchedulePage";

function App() {
  const { isAuthenticated, checkAuth, user } = useAuthStore();
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    checkAuth().finally(() => setLoading(false));
  }, [checkAuth]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white font-sans font-bold">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Forwarding Hub 불러오는 중...</span>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Guest Route */}
        <Route
          path="/login"
          element={isAuthenticated ? <Navigate to={user?.role === "admin" ? "/admin/shipments" : "/"} /> : <LoginPage />}
        />

        {/* Authenticated Client-Only Routes */}
        <Route element={<ProtectedRoute allowedRoles={["client"]} />}>
          <Route element={<Layout />}>
            <Route path="/schedules" element={<SchedulePage />} />
          </Route>
        </Route>

        {/* Authenticated Shared Shipper Routes */}
        <Route element={<ProtectedRoute allowedRoles={["client", "admin"]} />}>
          <Route element={<Layout />}>
            <Route path="/" element={user?.role === "admin" ? <Navigate to="/admin/shipments" replace /> : <DashboardPage />} />
            <Route path="/bookings" element={<BookingListPage />} />
            <Route path="/invoices" element={<InvoiceListPage />} />
            <Route path="/documents" element={<DocumentListPage />} />
          </Route>
        </Route>

        {/* Authenticated Admin Routes */}
        <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
          <Route element={<Layout />}>
            <Route path="/admin/bookings" element={<AdminBookingPage />} />
            <Route path="/admin/shipments" element={<AdminShipmentPage />} />
            <Route path="/admin/schedules" element={<AdminSchedulePage />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
