import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { LanguageProvider } from './context/LanguageContext'
import { AppDataProvider } from './context/AppDataContext'
import App from './App'
import './index.css'

registerSW({ immediate: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <AppDataProvider>
        <App />
      </AppDataProvider>
    </LanguageProvider>
  </StrictMode>,
)
