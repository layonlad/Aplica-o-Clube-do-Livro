import { BookOpenCheck, Crown, Search, Sparkles, Star } from 'lucide-react'
import { Card, DemoBadge } from '../components/ui'
import { readingHistory } from '../data/mockData'

export function HistoryPage() {
  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Histórias que já vivemos</h1><p>Desde janeiro de 2025 · 18 leituras</p></div><BookOpenCheck className="title-icon" /></div>
      <div className="history-summary"><span><strong>18</strong> livros</span><span><strong>4,7</strong> média</span><span><strong>7.420</strong> páginas</span></div>
      <div className="search-field"><Search size={19} /><input aria-label="Buscar no histórico" placeholder="Buscar uma leitura" /></div>
      <div className="timeline">
        {readingHistory.map((item) => (
          <article className="history-item" key={`${item.month}-${item.year}`}>
            <div className="timeline-date"><strong>{item.month}</strong><span>{item.year}</span></div>
            <span className="timeline-dot" />
            <Card>
              <span className="history-cover" style={{ background: item.color }}>{item.title.slice(0, 1)}</span>
              <div><h2>{item.title}</h2><p>{item.author}</p><span className="chosen-by"><Crown size={14} /> {item.chosenBy}</span><small><Sparkles size={13} /> {item.method}</small></div>
              <span className="history-rating"><Star size={14} fill="currentColor" /> {item.rating}</span>
            </Card>
          </article>
        ))}
      </div>
    </div>
  )
}
