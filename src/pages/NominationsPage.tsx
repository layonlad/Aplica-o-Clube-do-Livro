import { CheckCircle2, Clock3, Dice5, Info, Plus, ShieldCheck, Sparkles, Trophy } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar, Button, Card, DemoBadge } from '../components/ui'
import { nominations as seedNominations } from '../data/mockData'

export function NominationsPage() {
  const [items, setItems] = useState(seedNominations)
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function addNomination(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setItems((current) => [...current, { id: `demo-${Date.now()}`, title, author: 'Autoria a confirmar', member: 'Marina', initials: 'MA', votes: 0, color: '#5b3a73' }])
    setTitle('')
    setShowForm(false)
    setSubmitted(true)
  }

  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Qual será a próxima?</h1><p>Cada voz traz uma nova história.</p></div><Sparkles className="title-icon" /></div>
      <Card className="deadline-card">
        <div><span className="eyebrow">RODADA DE NOVEMBRO</span><h2>Indicações abertas</h2><p><Clock3 size={16} /> Encerra em 6 dias</p></div>
        <div className="deadline-ring"><strong>3</strong><span>de 9<br/>indicaram</span></div>
      </Card>
      <div className="info-strip"><Info size={18} /><span>Uma indicação por membro. O sorteio acontece após o prazo e ficará registrado.</span></div>

      {submitted && <div className="success-strip"><CheckCircle2 size={18} /> Indicação adicionada à demonstração.</div>}

      <section>
        <div className="section-heading"><div><span className="eyebrow">NA ESTANTE DO SORTEIO</span><h2>{items.length} livros indicados</h2></div><Button variant="secondary" onClick={() => setShowForm((value) => !value)}><Plus size={17} /> Indicar</Button></div>
        {showForm && <form className="inline-form" onSubmit={addNomination}><label htmlFor="book-title">Título do livro</label><input id="book-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Digite um título" autoFocus /><div><Button type="submit">Adicionar</Button><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button></div></form>}
        <div className="nomination-list">
          {items.map((item, index) => (
            <Card className="nomination-card" key={item.id}>
              <span className="nomination-rank">{index + 1}</span>
              <span className="mini-cover" style={{ background: item.color }}>{item.title.slice(0, 1)}</span>
              <div><h3>{item.title}</h3><p>{item.author}</p><span className="nominated-by"><Avatar initials={item.initials} size="sm" /> Indicado por {item.member}</span></div>
              <span className="vote-count">♡ {item.votes}</span>
            </Card>
          ))}
        </div>
      </section>

      <Card className="draw-card">
        <span className="draw-icon"><Dice5 /></span>
        <div><span className="eyebrow">COMO FUNCIONARÁ</span><h2>Sorteio justo e auditável</h2><p>No produto final, o backend fará um único sorteio criptograficamente seguro, com participantes elegíveis e trilha imutável.</p></div>
        <div className="audit-points"><span><ShieldCheck /> Sem repetição</span><span><Trophy /> Resultado registrado</span></div>
        <Button disabled>Sortear após o prazo</Button>
      </Card>
    </div>
  )
}
