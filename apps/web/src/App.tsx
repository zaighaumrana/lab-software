import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { AppLayout } from './layouts/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
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
import { Loading } from './components/Loading';
import type { ReactNode } from 'react';

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
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
            <DoctorStatementPrintPage />
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
        <Route index element={<DashboardPage />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="visit" element={<VisitPage />} />
        <Route path="laboratory" element={<LaboratoryPage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:id" element={<ReportPrintPage />} />
        <Route path="catalog" element={<CatalogPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:id" element={<DoctorDashboardPage />} />
        <Route path="settings" element={<SettingsPage />} />
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
