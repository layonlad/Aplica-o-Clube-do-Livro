import { useState } from 'react'
import { BookOpen, Cable, FileUp, NotebookPen } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../workspace/WorkspaceProvider'
import { Button, Card } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { PostComposer } from '../community/ClubWall'
import { useExternalReading } from './client'
import { KindleExport } from './KindleExport'
import { KindleAnnotations } from './KindleAnnotations'
import { ExternalProgress } from './ExternalProgress'
import './reading-integrations.css'

const tabs = [
  ['export', 'Enviar ao Kindle', FileUp],
  ['progress', 'Atualizar progresso', BookOpen],
  ['annotations', 'Importar anotações', NotebookPen],
] as const

export function ReadingIntegrations() {
  const [params, setParams] = useSearchParams()
  const { user } = useAuth()
  const { snapshot, scope, setScope, clubs } = useWorkspace()
  const external = useExternalReading(scope === 'personal')
  const [saved, setSaved] = useState('')
  const [reflect, setReflect] = useState(false)
  const [audience, setAudience] = useState('')
  const [includeProgress, setIncludeProgress] = useState(false)
  const [compose, setCompose] = useState(false)
  const books = snapshot?.state.books ?? []
  const book = books.find((item) => item.id === params.get('livro')) ?? books[0]
  const progress = external.items.find((item) => item.bookId === book?.id && item.provider === 'kindle')
  const active = tabs.find(([key]) => key === params.get('modo'))
  const internal = book ? snapshot?.reading[book.id]?.percent ?? 0 : 0

  function open(mode?: string, bookId = book?.id) {
    const next = new URLSearchParams()
    if (bookId) next.set('livro', bookId)
    if (mode) next.set('modo', mode)
    setParams(next, { replace: true })
  }

  function openReflection() {
    setReflect(true)
    setAudience('')
    setCompose(false)
    setIncludeProgress(false)
  }

  if (scope !== 'personal') return <Card>
    <h2>Integrações de Leitura</h2>
    <p>Escolha um livro no espaço pessoal para gerenciar seus dados Kindle.</p>
    <Button onClick={() => setScope('personal')}>Abrir espaço pessoal</Button>
  </Card>

  return <section className="reading-integration-form">
    <Card className="reading-integration-form">
      <h2><Cable size={20} aria-hidden="true" /> Amazon Kindle</h2>
      {!user?.emailVerified ? <Link className="button-link" to="/account">Entrar com a conta confirmada</Link>
        : !book ? <p>Adicione um livro à sua <Link to="/app/library">biblioteca</Link> para preencher a leitura externa.</p>
        : <>
          <label>Livro da biblioteca<select value={book.id} onChange={(event) => { setSaved(''); open(undefined, event.target.value) }}>
            {books.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.author}</option>)}
          </select></label>
          <p>Aplicativo <strong>{internal}%</strong> · Kindle <strong>{progress ? progress.percentage + '%' : 'sem registro'}</strong></p>
          {progress && <p className="t-caption">{progress.percentage === 100 ? 'Concluído' : progress.percentage > 0 ? 'Em leitura' : 'A iniciar'} no Kindle · Atualizado em {new Date(progress.updatedAt).toLocaleDateString('pt-BR')}</p>}
          {external.failed && <p role="alert">Não foi possível carregar o progresso Kindle agora.</p>}
          {saved && <p role="status">{saved}</p>}
          <div className="action-menu">
            {tabs.map(([key, title, Icon]) => <button type="button" key={key} onClick={() => open(key)}>
              <span className="action-menu__icon"><Icon size={19} aria-hidden="true" /></span><span>{title}</span>
            </button>)}
            <button type="button" onClick={openReflection}>
              <span className="action-menu__icon"><NotebookPen size={19} aria-hidden="true" /></span><span>Escrever reflexão</span>
            </button>
          </div>
        </>}
      <details>
        <summary>Privacidade e preferências</summary>
        <p>O progresso informado, as observações, os destaques e o histórico de envio pertencem à sua conta. Você decide se uma conclusão entra na meta e no histórico pessoal. Para publicar uma reflexão, selecione o destino e confirme a publicação.</p>
        <p>Transferência e sincronização entre aparelhos Kindle são processadas pela Amazon. Atualize seu progresso aqui quando quiser.</p>
      </details>
    </Card>
    {user?.emailVerified && book && active && !reflect && <Sheet title={active[1]} onClose={() => open()} className="action-sheet reading-integration-sheet">
      <div className="reading-integration-form" key={book.id + active[0]}>
        <p className="t-caption">{book.title}</p>
        {active[0] === 'export' && <KindleExport user={user} bookId={book.id} />}
        {active[0] === 'progress' && !external.ready && !external.failed && <p role="status">Carregando progresso…</p>}
        {active[0] === 'progress' && external.failed && <p role="alert">O progresso está indisponível. Reabra o painel e tente novamente.</p>}
        {active[0] === 'progress' && external.ready && !external.failed && <ExternalProgress key={progress?.revision ?? 0} user={user} bookId={book.id} internal={internal} progress={progress} onSaved={(value) => {
          setSaved(value ? 'Progresso Kindle salvo.' : 'Progresso Kindle excluído.')
          open()
        }} />}
        {active[0] === 'annotations' && <KindleAnnotations user={user} book={book} books={books} onReflect={openReflection} />}
      </div>
    </Sheet>}
    {user?.emailVerified && book && reflect && <Sheet title="Compartilhar reflexão" onClose={() => setReflect(false)} className="action-sheet reading-integration-sheet">
      <div className="reading-integration-form">
        <p className="t-caption">{book.title}</p>
        {!compose ? <>
          <label>Destino da reflexão<select value={audience} onChange={(event) => setAudience(event.target.value)}>
            <option value="">Escolha um destino</option>
            <option value="community">Comunidade</option>
            {clubs.map((club) => <option value={club.id} key={club.id}>{club.name}</option>)}
          </select></label>
          {progress && <label className="reading-integration-check"><input type="checkbox" checked={includeProgress} onChange={(event) => setIncludeProgress(event.target.checked)} /> Incluir {progress.percentage}% de progresso no Kindle</label>}
          <p className="t-caption">Escreva uma reflexão com suas palavras. As anotações e os destaques ficam na sua biblioteca.</p>
          <Button disabled={!audience} onClick={() => setCompose(true)}>Escrever publicação</Button>
        </> : <PostComposer
          clubId={audience === 'community' ? null : audience}
          linkedBook={{ title: book.title, author: book.author }}
          initialBody={includeProgress && progress ? `Minha leitura de ${book.title} no Kindle chegou a ${progress.percentage}%.\n\n` : ''}
          onCancel={() => setCompose(false)}
          onPublished={() => { setReflect(false); open(); setSaved('Reflexão publicada.') }}
        />}
      </div>
    </Sheet>}
  </section>
}
