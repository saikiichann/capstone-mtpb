/* ------------------------------------------------------------------
   ALL PAGE STYLES — loaded up front, in the same order as before.

   The pages' JavaScript now loads per page (React.lazy in App.tsx), but
   many pages rely on CSS written in other pages' files (shared class
   names like .dashboard, .sidebar, .data-table). Loading every stylesheet
   here keeps each page looking exactly as it did when everything was in
   one bundle. Order matters: it is the original import order.

   When you add a new page with its own CSS file, its import inside the
   page is enough; add it here only if other pages need its classes.
------------------------------------------------------------------ */
import "./components/Modal.css";
import "./components/ChangePasswordModal.css";
import "./pages/login/LoginPage.css";
import "./pages/oic/Homepage.css";
import "./pages/oic/SectorAnalytics.css";
import "./pages/oic/ReleaseRequests.css";
import "leaflet/dist/leaflet.css";
import "./pages/oic/Geospatialheatmap.css";
import "./pages/oic/ClampingLog.css";
import "./pages/oic/ImpoundingLog.css";
import "./pages/oic/VehicleHistory.css";
import "./pages/oic/PendingPayments.css";
import "./components/CashPaymentSlip.css";
import "./pages/oic/PaymentVerification.css";
import "./pages/oic/TransactionHistory.css";
import "./pages/oic/RevenueReports.css";
import "./pages/oic/ReleaseQueue.css";
import "./components/ReleaseDetailsDrawer.css";
import "./pages/oic/ReleaseLog.css";
import "./pages/oic/FieldUpdates.css";
import "./pages/oic/OperationScheduler.css";
import "./pages/supervisor/Homepage.css";
import "./pages/supervisor/SectorAnalytics.css";
import "./pages/supervisor/GeospatialHeatmap.css";
import "./pages/supervisor/ClampingLog.css";
import "./pages/supervisor/ImpoundingLog.css";
import "./pages/supervisor/EditImpoundModal.css";
import "./pages/supervisor/VehicleHistory.css";
import "./pages/supervisor/ReleaseRequests.css";
import "./pages/supervisor/ReleaseQueue.css";
import "./pages/supervisor/ReleaseLog.css";
import "./pages/supervisor/FieldUpdates.css";
import "./pages/supervisor/OperationScheduler.css";
import "./pages/impounding-staff/Homepage.css";
import "./pages/impounding-staff/ImpoundingLog.css";
import "./pages/impounding-staff/ActiveImpounding.css";
import "./components/NotificationBell.css";
import "./pages/release-officer/Homepage.css";
import "./pages/release-officer/QueueMonitor.css";
import "./pages/release-officer/ReleaseLog.css";
import "./pages/finance/Homepage.css";
import "./pages/finance/PendingPayments.css";
import "./pages/finance/PaymentVerification.css";
import "./pages/finance/TransactionHistory.css";
import "./pages/finance/RevenueReports.css";
import "./pages/finance/AllReports.css";
import "./pages/record-officer/AllReports.css";
import "./pages/finance/ExportCenter.css";
import "./pages/record-officer/Homepage.css";
import "./pages/record-officer/ViolationDetailsModal.css";
import "./pages/record-officer/AllViolations.css";
import "./pages/record-officer/ClampingLog.css";
import "./pages/record-officer/ImpoundingLog.css";
import "./pages/record-officer/ReleaseLog.css";
import "./pages/record-officer/ExportCenter.css";
import "./pages/it-admin/ITAdminHomepage.css";
import "./pages/it-admin/PasswordReset.css";
import "./pages/it-admin/UserManagement.css";
import "./pages/it-admin/QRManagement.css";
import "./pages/it-admin/SystemHealth.css";
import "./pages/it-admin/BackupRestore.css";
import "./pages/it-admin/RolesPermission.css";
import "./pages/it-admin/SessionMonitor.css";
import "./pages/it-admin/AuditLog.css";
import "./pages/it-admin/DataPrivacyLog.css";
import "./pages/it-admin/Settings.css";
import "./modernTheme.css";
import "./a11yFixes.css";
import "./responsiveFixes.css";
