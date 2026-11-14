import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { LanguageProvider } from './context/LanguageContext'
import { AppDataProvider } from './context/AppDataContext'
import { AuthProvider } from './context/AuthContext'
import { captureSessionFromUrl } from './lib/sessionStore'
import App from './App'
import './index.css'

// Capture ?session= from Google OAuth redirect before React mounts
captureSessionFromUrl()

// Always pull the newest shell — stale SW was serving the old setup/wizard UI.
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
  onOfflineReady() {
    /* no-op */
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <AppDataProvider>
          <App />
        </AppDataProvider>
      </AuthProvider>
    </LanguageProvider>
  </StrictMode>,
)
