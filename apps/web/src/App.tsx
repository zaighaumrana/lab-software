import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AppLayout } from './layouts/AppLayout';
import { Loading } from './components/Loading';
import { RequirePermission } from './components/RequirePermission';
import { Permission, isAdminRole } from './lib/permissions';
import { lazy, Suspense, type ReactNode } from 'react';

// Operational pages load on demand; session and permission guards remain unchanged.
const LoginPage = lazy(() => import('./pages/auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const OperatorDashboardPage = lazy(() => import('./pages/dashboard/OperatorDashboardPage').then((module) => ({ default: module.OperatorDashboardPage })));
const InsightsPage = lazy(() => import('./pages/insights/InsightsPage').then((module) => ({ default: module.InsightsPage })));
const PatientsPage = lazy(() => import('./pages/patients/PatientsPage').then((module) => ({ default: module.PatientsPage })));
const VisitPage = lazy(() => import('./pages/visit/VisitPage').then((module) => ({ default: module.VisitPage })));
const LaboratoryPage = lazy(() => import('./pages/laboratory/LaboratoryPage').then((module) => ({ default: module.LaboratoryPage })));
const CatalogPage = lazy(() => import('./pages/catalog/CatalogPage').then((module) => ({ default: module.CatalogPage })));
const DoctorsPage = lazy(() => import('./pages/doctors/DoctorsPage').then((module) => ({ default: module.DoctorsPage })));
const DoctorDashboardPage = lazy(() => import('./pages/doctors/DoctorDashboardPage').then((module) => ({ default: module.DoctorDashboardPage })));
const DoctorStatementPrintPage = lazy(() => import('./pages/doctors/DoctorStatementPrintPage').then((module) => ({ default: module.DoctorStatementPrintPage })));
const InvoicesPage = lazy(() => import('./pages/billing/InvoicesPage').then((module) => ({ default: module.InvoicesPage })));
const InvoiceDetailPage = lazy(() => import('./pages/billing/InvoiceDetailPage').then((module) => ({ default: module.InvoiceDetailPage })));
const InvoicePrintPage = lazy(() => import('./pages/billing/InvoicePrintPage').then((module) => ({ default: module.InvoicePrintPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const ReportPrintPage = lazy(() => import('./pages/reports/ReportPrintPage').then((module) => ({ default: module.ReportPrintPage })));
const ReportDocumentPage = lazy(() => import('./pages/reports/ReportDocumentPage').then((module) => ({ default: module.ReportDocumentPage })));
const SettingsPage = lazy(() => import('./pages/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const ProfilePage = lazy(() => import('./pages/settings/ProfilePage').then((module) => ({ default: module.ProfilePage })));
const CashShiftPage = lazy(() => import('./pages/cash-shift/CashShiftPage').then((module) => ({ default: module.CashShiftPage })));

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
          <Suspense fallback={<Loading label="Loading page..." />}>
            <AppRoutes />
          </Suspense>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
