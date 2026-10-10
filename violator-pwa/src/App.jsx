import { Route, Routes } from 'react-router-dom'
import './App.css'
import RequireAuth, { RedirectIfSignedIn, RequirePayer } from './auth/RequireAuth'
import AppLayout from './components/AppLayout'
import UpdatePrompt from './components/UpdatePrompt'
import FaqChatbot from './pages/FaqChatbot'
import History from './pages/History'
import Home from './pages/Home'
import ImpoundLocation from './pages/ImpoundLocation'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import PaymentHistory from './pages/PaymentHistory'
import PayConfirm from './pages/pay/PayConfirm'
import PayDetails from './pages/pay/PayDetails'
import PayLayout from './pages/pay/PayLayout'
import PayMethod from './pages/pay/PayMethod'
import PaymentSuccess from './pages/pay/PaymentSuccess'
import ScanLanding from './pages/ScanLanding'
import ScanRedirect from './pages/ScanRedirect'
import Receipt from './pages/pay/Receipt'
import AccountSettings from './pages/profile/AccountSettings'
import EditProfile from './pages/profile/EditProfile'
import HelpSupport from './pages/profile/HelpSupport'
import PaymentSettings from './pages/profile/PaymentSettings'
import PrivacySettings from './pages/profile/PrivacySettings'
import ProfileInformation from './pages/profile/ProfileInformation'
import SignUp from './pages/SignUp'
import VerifyEmail from './pages/VerifyEmail'
import ViolationHistory from './pages/ViolationHistory'
import ViolationDetails from './pages/ViolationDetails'
import MyVehicles from './pages/vehicles/MyVehicles'
import VehicleDetails from './pages/vehicles/VehicleDetails'
import Welcome from './pages/Welcome'

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        {/* Public: opened from the clamp's QR code, no account needed.
            The admin app's stickers point at /scan?t=<scan token>, which
            hands over to /q/<token>; /v/:violationRef is one violation
            (used by links inside the app). */}
        <Route path="q/:qrId" element={<ScanLanding />} />
        <Route path="scan" element={<ScanRedirect />} />
        <Route path="v/:violationRef" element={<ViolationDetails />} />
        <Route path="faq" element={<FaqChatbot />} />
        <Route path="impound" element={<ImpoundLocation />} />

        {/* Signed-out only */}
        <Route element={<RedirectIfSignedIn />}>
          <Route path="welcome" element={<Welcome />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<SignUp />} />
        </Route>

        {/* Signed in, email not verified yet */}
        <Route path="verify-email" element={<VerifyEmail />} />

        {/* Signed in and verified */}
        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="history" element={<History />} />
            <Route path="vehicles" element={<MyVehicles />} />
            <Route path="profile" element={<AccountSettings />} />
            <Route path="violations" element={<ViolationHistory />} />
            <Route path="payments" element={<PaymentHistory />} />
          </Route>

          {/* Profile sub-screens (no bottom bar) */}
          <Route path="profile/info" element={<ProfileInformation />} />
          <Route path="profile/edit" element={<EditProfile />} />
          <Route path="profile/payment-methods" element={<PaymentSettings />} />
          <Route path="profile/privacy" element={<PrivacySettings />} />
          <Route path="profile/support" element={<HelpSupport />} />

          {/* Vehicles are added by the enforcement side when a violation is
              recorded against a plate — there is no owner-facing Add flow. */}
          <Route path="vehicles/:vehicleId" element={<VehicleDetails />} />


        </Route>

        {/* Payment flow: signed-in owners and guests who scanned the QR */}
        <Route element={<RequirePayer />}>
          <Route path="v/:violationRef/pay" element={<PayLayout />}>
            <Route index element={<PayMethod />} />
            <Route path=":method" element={<PayDetails />} />
            <Route path=":method/confirm" element={<PayConfirm />} />
          </Route>
          <Route path="payments/:reference/success" element={<PaymentSuccess />} />
          <Route path="receipts/:reference" element={<Receipt />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <UpdatePrompt />
    </div>
  )
}
