  import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
  import { ProtectedRoute } from "./components/ProtectedRoute";

  // Authentication
  import LoginPage from "./pages/login/LoginPage";

  // OIC Dashboard
  import Homepage from "./pages/oic/Homepage";
  import SectorAnalytics from "./pages/oic/SectorAnalytics";
  import OICReleaseRequests from "./pages/oic/ReleaseRequests";
  import GeospatialHeatmap from "./pages/oic/Geospatialheatmap";
  import OICClampingLog from "./pages/oic/ClampingLog";
  import OICActiveImpounding from "./pages/oic/ActiveImpounding";
  import OICImpoundingLog from "./pages/oic/ImpoundingLog";
  import OICVehicleHistory from "./pages/oic/VehicleHistory";
  import OICPendingPayments from "./pages/oic/PendingPayments";
  import OICPaymentVerification from "./pages/oic/PaymentVerification";
  import OICTransactionHistory from "./pages/oic/TransactionHistory";
  import OICRevenueReports from "./pages/oic/RevenueReports";
  import OICReleaseQueue from "./pages/oic/ReleaseQueue";
  import OICReleaseLog from "./pages/oic/ReleaseLog";
  import OICActiveClampingTeams from "./pages/oic/ActiveClampingTeams";
  import OICFieldUpdates from "./pages/oic/FieldUpdates";
  import OICOperationScheduler from "./pages/oic/OperationScheduler";

  // Impounding Staff
  import ImpoundingStaffHomepage from "./pages/impounding-staff/Homepage";
  import ImpoundingLog from "./pages/impounding-staff/ImpoundingLog";
  import ActiveImpounding from "./pages/impounding-staff/ActiveImpounding";
  import FieldUpdates from "./pages/impounding-staff/FieldUpdates";

  // Release Officer
  import ReleaseOfficerHomepage from "./pages/release-officer/Homepage";
  import QueueMonitor from "./pages/release-officer/QueueMonitor";
  import ReleaseLog from "./pages/release-officer/ReleaseLog";

  // Finance Staff
  import FinanceHomepage from "./pages/finance/Homepage";
  import PendingPayments from "./pages/finance/PendingPayments";
  import PaymentVerification from "./pages/finance/PaymentVerification";
  import TransactionHistory from "./pages/finance/TransactionHistory";
  import RevenueReports from "./pages/finance/RevenueReports";
  import FinanceAllReports from "./pages/finance/AllReports";
  import FinanceExportCenter from "./pages/finance/ExportCenter";

  // Record Officer — trimmed to match the new sidebar design.
  // Queue Monitor, Vehicle History, Release Requests, and Release Orders
  // have been removed from the sidebar and their routes removed here so
  // navigating directly to those URLs now falls through to the fallback.
  import RecordOfficerHomepage from "./pages/record-officer/Homepage";
  import RecordOfficerAllViolations from "./pages/record-officer/AllViolations";
  import RecordOfficerClampingLog from "./pages/record-officer/ClampingLog";
  import RecordOfficerImpoundingLog from "./pages/record-officer/ImpoundingLog";
  import RecordOfficerReleaseLog from "./pages/record-officer/ReleaseLog";
  import RecordOfficerAllReports from "./pages/record-officer/AllReports";
  import RecordOfficerExportCenter from "./pages/record-officer/ExportCenter";

  // IT Admin
  import ITAdminHomePage from "./pages/it-admin/ITAdminHomepage";
  import UserManagement from "./pages/it-admin/UserManagement";
  import QRManagement from "./pages/it-admin/QRManagement";
  import SystemHealth from "./pages/it-admin/SystemHealth";
  import BackupRestore from "./pages/it-admin/BackupRestore";
  import RolesPermission from "./pages/it-admin/RolesPermission";
  import SessionMonitor from "./pages/it-admin/SessionMonitor";
  import AuditLog from "./pages/it-admin/AuditLog";
  import DataPrivacyLog from "./pages/it-admin/DataPrivacyLog";
  import Settings from "./pages/it-admin/Settings";

  function App() {
    return (
      <BrowserRouter>
        <Routes>
          {/* Authentication - Public */}
          <Route path="/" element={<LoginPage />} />

          {/* ================================================================
              OIC DASHBOARD (shared with Supervisor)

              Supervisors use the same pages as the OIC. Their Payment/Finance
              menu is hidden inside each page, and the Finance routes further
              below do NOT include "supervisor", so typing those URLs
              directly is still blocked.

              Clamping Log and Active Impounding are also shared with
              Supervisor for VIEWING — but the "Subject to Impound" action on
              Clamping Log is OIC-only. That is enforced two ways: the button
              itself is hidden for anyone whose role isn't "oic" (see
              ClampingLog.tsx), and the write is additionally guarded in the
              handler as a safety net. Neither of those is the real security
              boundary — a Firestore rule restricting writes to
              `violations.impoundStatus` and to the `impoundRecords`
              collection (create) to role == "oic" still needs to be added,
              or a Supervisor could trigger the same write straight from the
              browser console.

              All four Payment/Finance pages (Pending Payments, Payment
              Verification, Transaction History, Revenue Reports) are
              OIC-only — NOT shared with Supervisor — for consistency with
              the Payment/Finance group being hidden from Supervisor's
              sidebar on every OIC page. Transaction History and Revenue
              Reports have no write actions at all; they're OIC-only purely
              for that consistency, not because viewing them is risky.

              Sidebar items without a route here send the user back to the
              login page through the catch-all at the bottom, so add a route
              for each one as its page is finished.
          ================================================================ */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <Homepage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/sector-analytics"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <SectorAnalytics />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/heatmap"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <GeospatialHeatmap />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/clamping"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICClampingLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/impounding"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICImpoundingLog />
              </ProtectedRoute>
            }
          />
          {/* OIC-only, NOT shared with Supervisor — unlike every other
              route in this block. Payment/Finance is hidden from Supervisor's
              sidebar on every OIC page, and this route enforces that same
              boundary at the routing level, not just in the nav. */}
          <Route
            path="/dashboard/pending-payments"
            element={
              <ProtectedRoute allowedRoles={["oic"]}>
                <OICPendingPayments />
              </ProtectedRoute>
            }
          />
          {/* OIC-only, NOT shared with Supervisor — same reasoning as
              Pending Payments above. */}
          <Route
            path="/dashboard/verification"
            element={
              <ProtectedRoute allowedRoles={["oic"]}>
                <OICPaymentVerification />
              </ProtectedRoute>
            }
          />
          {/* Read-only, no write actions on this page at all — still kept
              OIC-only (not supervisor) for consistency with the rest of
              Payment/Finance, which is hidden from Supervisor's sidebar on
              every OIC page. */}
          <Route
            path="/dashboard/transactions"
            element={
              <ProtectedRoute allowedRoles={["oic"]}>
                <OICTransactionHistory />
              </ProtectedRoute>
            }
          />
          {/* Read-only, same reasoning as Transaction History above — OIC-only
              for consistency with the rest of Payment/Finance. */}
          <Route
            path="/dashboard/revenue"
            element={
              <ProtectedRoute allowedRoles={["oic"]}>
                <OICRevenueReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/vehicle-history"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICVehicleHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/release-requests"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICReleaseRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/release-queue"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICReleaseQueue />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/release-log"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICReleaseLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/clamping-teams"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICActiveClampingTeams />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/active-impounding"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICActiveImpounding />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/field-updates"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICFieldUpdates />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dashboard/operation-scheduler"
            element={
              <ProtectedRoute allowedRoles={["oic", "supervisor"]}>
                <OICOperationScheduler />
              </ProtectedRoute>
            }
          />

          {/* Impounding Staff */}
          <Route
            path="/impounding-staff"
            element={
              <ProtectedRoute allowedRoles={["impounding-staff", "it-admin"]}>
                <ImpoundingStaffHomepage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/impounding-staff/log"
            element={
              <ProtectedRoute allowedRoles={["impounding-staff", "it-admin"]}>
                <ImpoundingLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/impounding-staff/active"
            element={
              <ProtectedRoute allowedRoles={["impounding-staff", "it-admin"]}>
                <ActiveImpounding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/impounding-staff/field-updates"
            element={
              <ProtectedRoute allowedRoles={["impounding-staff", "it-admin"]}>
                <FieldUpdates />
              </ProtectedRoute>
            }
          />

          {/* Release Officer — 3 pages only */}
          <Route
            path="/release-officer"
            element={
              <ProtectedRoute allowedRoles={["release-officer", "it-admin"]}>
                <ReleaseOfficerHomepage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/release-officer/queue"
            element={
              <ProtectedRoute allowedRoles={["release-officer", "it-admin"]}>
                <QueueMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/release-officer/log"
            element={
              <ProtectedRoute allowedRoles={["release-officer", "it-admin"]}>
                <ReleaseLog />
              </ProtectedRoute>
            }
          />

          {/* Finance Staff — 7 pages only */}
          <Route
            path="/finance"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <FinanceHomepage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/pending"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <PendingPayments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/verification"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <PaymentVerification />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/transactions"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <TransactionHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/revenue"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <RevenueReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/reports"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <FinanceAllReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/finance/export"
            element={
              <ProtectedRoute allowedRoles={["finance", "it-admin"]}>
                <FinanceExportCenter />
              </ProtectedRoute>
            }
          />

          {/* ================================================================
              Record Officer — 7 pages only (trimmed to match sidebar)

              Sidebar groups (see NAV_GROUPS in each page):
                Dashboard:  Overview
                Enforcement: All Violations, Clamping Log, Impounding Log
                Vehicle Release: Release Log
                Reports: All Reports, Export Center

              Removed: Queue Monitor, Vehicle History, Release Requests,
              Release Orders. These have no sidebar link anymore, so their
              routes have been removed too. Navigating directly to those
              URLs now falls through to the catch-all at the bottom.
          ================================================================ */}
          <Route
            path="/record-officer"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerHomepage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/violations"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerAllViolations />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/clamping"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerClampingLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/impounding"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerImpoundingLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/release-log"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerReleaseLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/reports"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerAllReports />
              </ProtectedRoute>
            }
          />
          <Route
            path="/record-officer/export"
            element={
              <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
                <RecordOfficerExportCenter />
              </ProtectedRoute>
            }
          />

          {/* IT Admin Dashboard — strictly it-admin only */}
          <Route
            path="/it-admin"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <ITAdminHomePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/users"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/qr-codes"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <QRManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/system-health"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <SystemHealth />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/backup"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <BackupRestore />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/roles"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <RolesPermission />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/sessions"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <SessionMonitor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/audit-log"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/data-privacy"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <DataPrivacyLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/it-admin/settings"
            element={
              <ProtectedRoute allowedRoles={["it-admin"]}>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Fallback
              BABALA: pinapabalik nito sa login ang bawat hindi kilalang URL.
              Sa gumagamit, mukhang biglang nag-log out ang sistema. Bago ang
              defense, palitan ito ng simpleng "Page not found" na may balik
              na button — mas malinaw at hindi nakakatakot. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  export default App;