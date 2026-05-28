import React from 'react'
import ReactDOM from 'react-dom/client'
import { initSentry } from './lib/sentry'

// Inicializar Sentry (no-op si VITE_SENTRY_DSN no esta configurada)
initSentry()
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
