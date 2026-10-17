import { Heart, MessageCircle, MoreHorizontal, Plus, Search, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Avatar, Button, Card, DemoBadge } from '../components/ui'
import { forumTopics as seedTopics } from '../data/mockData'

export function ForumPage() {
  const [topics, setTopics] = useState(seedTopics)
  const [revealed, setRevealed] = useState<string[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')

  function addTopic(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setTopics((current) => [{ id: `demo-${Date.now()}`, author: 'Marina Alves', initials: 'MA', title, excerpt: 'Conversa criada localmente para esta demonstração.', comments: 0, reactions: 0, age: 'agora', spoiler: false, tag: 'Nova conversa' }, ...current])
    setTitle('')
    setShowForm(false)
  }

  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Entre leituras</h1><p>Ideias ganham vida quando circulam.</p></div><Button onClick={() => setShowForm((value) => !value)}><Plus size={17} /> Conversa</Button></div>
      <div className="search-field"><Search size={19} /><input aria-label="Buscar conversas" placeholder="Buscar no fórum" /></div>
      {showForm && <form className="inline-form" onSubmit={addTopic}><label htmlFor="topic-title">Título da conversa</label><input id="topic-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Sobre o que vamos conversar?" autoFocus /><div><Button type="submit">Publicar</Button><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button></div></form>}
      <div className="topic-list">
        {topics.map((topic) => {
          const hidden = topic.spoiler && !revealed.includes(topic.id)
          return (
            <Card className="topic-card" key={topic.id}>
              <div className="topic-author"><Avatar initials={topic.initials} /><div><strong>{topic.author}</strong><span>{topic.age} · <b>{topic.tag}</b></span></div><button className="icon-button" aria-label="Mais opções"><MoreHorizontal /></button></div>
              <h2>{topic.title}</h2>
              {hidden ? <button className="spoiler-cover" onClick={() => setRevealed((current) => [...current, topic.id])}><ShieldAlert /><span><strong>Contém spoiler</strong>Toque para revelar</span></button> : <p>{topic.excerpt}</p>}
              <div className="topic-actions"><button><MessageCircle /> {topic.comments}</button><button><Heart /> {topic.reactions}</button><Button variant="ghost">Responder</Button></div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
