import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import PortalEntry from './PortalEntry.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PortalEntry />
  </StrictMode>,
)
