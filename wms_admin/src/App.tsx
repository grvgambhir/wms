import { Navigate, Outlet, Route, Routes } from "react-router-dom";

import { AuthProvider } from "./auth/AuthProvider";
import { EnrolMfaPage } from "./auth/EnrolMfaPage";
import { ForgotPasswordPage } from "./auth/ForgotPasswordPage";
import { RequireAuth, RequireOcAdmin } from "./auth/RequireAuth";
import { SignInPage } from "./auth/SignInPage";
import { AccreditationDeskPage } from "./pages/AccreditationDeskPage";
import { AssistedRegistrationPage } from "./pages/AssistedRegistrationPage";
import { CommunicationsPage } from "./pages/CommunicationsPage";
import { EvidenceReviewPage } from "./pages/EvidenceReviewPage";
import { FinancePage } from "./pages/FinancePage";
import { ExceptionsPage } from "./pages/ExceptionsPage";
import { OperationsPage } from "./pages/OperationsPage";
import { PeoplePage } from "./pages/PeoplePage";
import { RegistrationDetailPage } from "./pages/RegistrationDetailPage";
import { RegistrationsPage } from "./pages/RegistrationsPage";
import { RosterChangeReviewPage } from "./pages/RosterChangeReviewPage";
import { RulesConfiguratorPage } from "./pages/RulesConfiguratorPage";
import { WaitlistReviewPage } from "./pages/WaitlistReviewPage";
import { ToastProvider } from "./components/ui/ToastProvider";

function ProtectedLayout() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route
            path="/enrol-mfa"
            element={
              <RequireAuth>
                <EnrolMfaPage />
              </RequireAuth>
            }
          />
          <Route element={<ProtectedLayout />}>
            <Route path="/operations" element={<OperationsPage />} />
            <Route path="/registrations" element={<RegistrationsPage />} />
            <Route
              path="/registrations/:entryId"
              element={<RegistrationDetailPage />}
            />
            <Route path="/evidence-review" element={<EvidenceReviewPage />} />
            <Route
              path="/roster-changes"
              element={<RosterChangeReviewPage />}
            />
            <Route path="/waitlist" element={<WaitlistReviewPage />} />
            <Route path="/finance" element={<FinancePage />} />
            <Route path="/exceptions" element={<ExceptionsPage />} />
            <Route
              path="/accreditation-desk"
              element={<AccreditationDeskPage />}
            />
            <Route
              path="/assisted-registration"
              element={<AssistedRegistrationPage />}
            />
            <Route path="/communications" element={<CommunicationsPage />} />
            <Route
              path="/rules-configurator"
              element={<RulesConfiguratorPage />}
            />
            <Route
              path="/people"
              element={
                <RequireOcAdmin>
                  <PeoplePage />
                </RequireOcAdmin>
              }
            />
            <Route path="*" element={<Navigate to="/operations" replace />} />
          </Route>
        </Routes>
      </AuthProvider>
    </ToastProvider>
  );
}
