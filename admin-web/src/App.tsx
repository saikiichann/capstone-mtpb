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

// Record Officer
import RecordOfficerHomepage from "./pages/record-officer/Homepage";
import RecordOfficerQueueMonitor from "./pages/record-officer/QueueMonitor";
import RecordOfficerAllViolations from "./pages/record-officer/AllViolations";
import RecordOfficerClampingLog from "./pages/record-officer/ClampingLog";
import RecordOfficerImpoundingLog from "./pages/record-officer/ImpoundingLog";
import RecordOfficerVehicleHistory from "./pages/record-officer/VehicleHistory";
import RecordOfficerReleaseRequests from "./pages/record-officer/ReleaseRequests";
import RecordOfficerReleaseOrders from "./pages/record-officer/ReleaseOrders";
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
        {/* Authentication */}
        <Route path="/" element={<LoginPage />} />

        {/* OIC Dashboard */}
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
        <Route
          path="/dashboard/pending-payments"
          element={
            <ProtectedRoute allowedRoles={["oic"]}>
              <OICPendingPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/verification"
          element={
            <ProtectedRoute allowedRoles={["oic"]}>
              <OICPaymentVerification />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard/transactions"
          element={
            <ProtectedRoute allowedRoles={["oic"]}>
              <OICTransactionHistory />
            </ProtectedRoute>
          }
        />
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

        {/* Release Officer */}
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

        {/* Finance Staff */}
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

        {/* Record Officer */}
        <Route
          path="/record-officer"
          element={
            <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
              <RecordOfficerHomepage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/record-officer/queue"
          element={
            <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
              <RecordOfficerQueueMonitor />
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
          path="/record-officer/vehicle-history"
          element={
            <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
              <RecordOfficerVehicleHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/record-officer/release-requests"
          element={
            <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
              <RecordOfficerReleaseRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="/record-officer/release-orders"
          element={
            <ProtectedRoute allowedRoles={["record-officer", "it-admin"]}>
              <RecordOfficerReleaseOrders />
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

        {/* IT Admin Dashboard */}
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

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;