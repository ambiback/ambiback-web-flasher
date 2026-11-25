import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LangProvider } from './i18n.jsx'
import { SerialProvider } from './SerialContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LangProvider>
      <SerialProvider>
        <App />
      </SerialProvider>
    </LangProvider>
  </StrictMode>
)
