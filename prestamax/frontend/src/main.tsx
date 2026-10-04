import React from 'react'
import ReactDOM from 'react-dom/client'
import { initSentry } from './lib/sentry'
import { installChunkErrorRecovery } from './lib/chunkReload'

// Inicializar Sentry (no-op si VITE_SENTRY_DSN no esta configurada)
initSentry()
// Si un despliegue nuevo deja obsoleto algún archivo de esta pestaña, recarga una vez en vez de dejar la pantalla en blanco.
installChunkErrorRecovery()
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
