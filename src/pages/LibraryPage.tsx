import { BookOpenCheck, Search, SlidersHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookCover, DemoBadge, ProgressBar, Rating } from '../components/ui'
import { books } from '../data/mockData'

type Filter = 'all' | 'reading' | 'finished'

export function LibraryPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => books.filter((book) =>
    (filter === 'all' || book.status === filter) &&
    `${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()),
  ), [filter, query])

  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Sua próxima página</h1><p>{books.length} títulos na biblioteca do clube</p></div><button className="icon-button"><SlidersHorizontal size={20} /><span className="sr-only">Filtrar</span></button></div>
      <div className="search-field"><Search size={19} /><input aria-label="Buscar na biblioteca" placeholder="Buscar por título ou autor" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      <div className="filter-pills" role="group" aria-label="Filtrar livros">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Todos</button>
        <button className={filter === 'reading' ? 'active' : ''} onClick={() => setFilter('reading')}>Lendo</button>
        <button className={filter === 'finished' ? 'active' : ''} onClick={() => setFilter('finished')}>Concluídos</button>
      </div>

      <div className="book-list">
        {filtered.map((book) => (
          <article className="book-row" key={book.id}>
            <BookCover book={book} />
            <div className="book-row__body">
              <span className="book-category">{book.category}</span>
              <h2>{book.title}</h2><p>{book.author}</p>
              {book.status === 'reading' && <><ProgressBar value={book.progress ?? 0} /><Link to="/app/reader">Continuar lendo</Link></>}
              {book.status === 'finished' && <div className="book-meta"><BookOpenCheck size={15} /> Concluído {book.rating && <Rating value={book.rating} />}</div>}
              {book.status === 'available' && <div className="book-meta">Disponível · {book.pages} páginas</div>}
            </div>
          </article>
        ))}
        {filtered.length === 0 && <p className="no-results">Nenhum livro encontrado para “{query}”.</p>}
      </div>
    </div>
  )
}
