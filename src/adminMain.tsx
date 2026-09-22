import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminEntry from './AdminEntry'
import './index.css'

createRoot(document.getElementById('root')!).render(<StrictMode><AdminEntry /></StrictMode>)