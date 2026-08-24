import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { OperatorDashboardPage } from './pages/dashboard/OperatorDashboardPage';
import { InsightsPage } from './pages/insights/InsightsPage';
import { PatientsPage } from './pages/patients/PatientsPage';
import { VisitPage } from './pages/visit/VisitPage';
import { LaboratoryPage } from './pages/laboratory/LaboratoryPage';
import { CatalogPage } from './pages/catalog/CatalogPage';
import { DoctorsPage } from './pages/doctors/DoctorsPage';
import { DoctorDashboardPage } from './pages/doctors/DoctorDashboardPage';
import { DoctorStatementPrintPage } from './pages/doctors/DoctorStatementPrintPage';
import { InvoicesPage } from './pages/billing/InvoicesPage';
import { InvoiceDetailPage } from './pages/billing/InvoiceDetailPage';
import { InvoicePrintPage } from './pages/billing/InvoicePrintPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { ReportPrintPage } from './pages/reports/ReportPrintPage';
import { ReportDocumentPage } from './pages/reports/ReportDocumentPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { ProfilePage } from './pages/settings/ProfilePage';
import { CashShiftPage } from './pages/cash-shift/CashShiftPage';
import { Loading } from './components/Loading';
import { RequirePermission } from './components/RequirePermission';
import { Permission, isAdminRole } from './lib/permissions';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * The "/" route's actual page differs by role: ADMIN gets the existing
 * management/financial Admin Dashboard, every other active role
 * (currently just LAB_OPERATOR) gets the new operational dashboard. This
 * is a routing decision, not two widget sets on one page — see
 * docs/12_RBAC_and_Operator_Dashboard.md for why that distinction
 * matters.
 */
function RoleHome() {
  const { user } = useAuth();
  return isAdminRole(user?.role) ? <DashboardPage /> : <OperatorDashboardPage />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      {/* Clean print documents — no sidebar / app chrome */}
      <Route
        path="/invoices/:id/print"
        element={
          <Protected>
            <InvoicePrintPage />
          </Protected>
        }
      />
      <Route
        path="/reports/:id/print"
        element={
          <Protected>
            <ReportDocumentPage />
          </Protected>
        }
      />
      <Route
        path="/doctors/:id/statement/print"
        element={
          <Protected>
            <RequirePermission permission={Permission.DOCTOR_MANAGE}>
              <DoctorStatementPrintPage />
            </RequirePermission>
          </Protected>
        }
      />

      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<RoleHome />} />
        <Route
          path="insights"
          element={
            <RequirePermission permission={Permission.ANALYTICS_VIEW}>
              <InsightsPage />
            </RequirePermission>
          }
        />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="visit" element={<VisitPage />} />
        <Route path="laboratory" element={<LaboratoryPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:id" element={<ReportPrintPage />} />
        <Route
          path="catalog"
          element={
            <RequirePermission permission={Permission.CATALOG_MANAGE}>
              <CatalogPage />
            </RequirePermission>
          }
        />
        <Route
          path="doctors"
          element={
            <RequirePermission permission={Permission.DOCTOR_MANAGE}>
              <DoctorsPage />
            </RequirePermission>
          }
        />
        <Route
          path="doctors/:id"
          element={
            <RequirePermission permission={Permission.DOCTOR_MANAGE}>
              <DoctorDashboardPage />
            </RequirePermission>
          }
        />
        <Route
          path="settings"
          element={
            <RequirePermission permission={Permission.SETTINGS_MANAGE}>
              <SettingsPage />
            </RequirePermission>
          }
        />
        {/* Unlike /settings, this needs no permission — every logged-in
            role can edit their own name/password. */}
        <Route path="profile" element={<ProfilePage />} />
        <Route
          path="cash-shift"
          element={
            <RequirePermission permission={Permission.CASH_SHIFT_MANAGE}>
              <CashShiftPage />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <AppRoutes />
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
