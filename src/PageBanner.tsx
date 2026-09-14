import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import './PageBanner.css'

export default function PageBanner({ label, title, description, action, onAction, href, download, controls, icon, image, tone = 'green' }: { label: string; title: string; description: string; action: string; onAction?: () => void; href?: string; download?: string; controls?: ReactNode; icon?: ReactNode; image?: ReactNode; tone?: 'green' | 'blue' }) {
  return <section className={`page-banner page-banner-${tone}`} aria-label={label}>
    <div className="page-banner-copy"><span className="page-banner-label">{icon}{label}</span><h2>{title}</h2><p>{description}</p>{href ? <a className="sa-button" href={href} download={download}>{action}<ArrowRight size={16} /></a> : <button className="sa-button" onClick={onAction}>{action}<ArrowRight size={16} /></button>}{controls}</div>
    {image && <div className="page-banner-image">{image}</div>}
  </section>
}