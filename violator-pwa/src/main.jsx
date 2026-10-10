import '@fontsource/poppins/400.css'
import '@fontsource/poppins/700.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import AuthProvider from './auth/AuthProvider.jsx'
import CrashScreen from './components/CrashScreen.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import LanguageProvider from './i18n/LanguageProvider.jsx'
import { startMonitoring } from './monitoring.js'
import './index.css'

// Loads Sentry in the background on the live site (src/monitoring.js).
startMonitoring()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LanguageProvider>
          <ErrorBoundary fallback={<CrashScreen />}>
            <App />
          </ErrorBoundary>
        </LanguageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
