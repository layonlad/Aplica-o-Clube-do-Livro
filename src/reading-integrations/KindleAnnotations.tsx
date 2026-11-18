import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Button } from '../components/ui'
import { apiRequest, messageFor } from '../auth/api'
import { maxClippingsBytes, maxImportEntries, type ImportedClipping } from '../../server/src/reading-integrations/providers'
import { integrationsPath, kindleBookPath } from './client'

interface Annotation extends ImportedClipping {
  id: string
  personalNote: string
  importedAt: string
}
type BookOption = { id: string; title: string; author: string }
interface Preview {
  groups: { sourceBook: string; suggestedBookId: string | null; entries: ImportedClipping[] }[]
  skipped: number
}
type FilePayload = { filename: string; mime: string; data: string }

async function readFile(file: File): Promise<FilePayload> {
  if (!/\.txt$/i.test(file.name) || !['', 'text/plain', 'application/octet-stream'].includes(file.type))
    throw Error('Escolha o TXT My Clippings exportado pelo Kindle.')
  if (!file.size || file.size > maxClippingsBytes) throw Error('Escolha um TXT com até 256 KB.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  let data = ''
  for (let index = 0; index < bytes.length; index += 8192)
    data += String.fromCharCode(...bytes.subarray(index, index + 8192))
  return { filename: file.name, mime: file.type, data: btoa(data) }
}

function ClippingDetails({ item }: { item: ImportedClipping }) {
  return <>
    <strong>{item.kind === 'highlight' ? 'Destaque' : 'Nota'}</strong>
    <small>{[item.location, item.sourceDate].filter(Boolean).join(' · ')}</small>
    <p className="reading-clipping-content">{item.content}</p>
  </>
}

export function KindleAnnotations({ user, book, books, onReflect }: {
  user: User
  book: BookOption
  books: BookOption[]
  onReflect: () => void
}) {
  const [notes, setNotes] = useState<Annotation[]>()
  const [preview, setPreview] = useState<{ file: FilePayload; result: Preview }>()
  const [groupIndex, setGroupIndex] = useState(0)
  const [target, setTarget] = useState('')
  const [selected, setSelected] = useState<number[]>([])
  const [page, setPage] = useState(0)
  const [editing, setEditing] = useState<{ id: string; note: string }>()
  const [deleting, setDeleting] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const request = useRef(false)
  const path = kindleBookPath(book.id) + '/annotations'
  const load = () => apiRequest<Annotation[]>(user, path)

  useEffect(() => {
    let active = true
    void load().then((items) => { if (active) setNotes(items) })
      .catch((err) => { if (active) setError(messageFor(err)) })
    return () => { active = false }
  }, [path, user.uid])

  async function run(task: () => Promise<void>) {
    if (request.current) return
    request.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try { await task() }
    catch (err) { setError(messageFor(err)) }
    finally { request.current = false; setBusy(false) }
  }

  function choose(next: number, result: Preview) {
    const group = result.groups[next]
    setGroupIndex(next)
    setPage(0)
    setTarget(group.suggestedBookId ?? '')
    setSelected(group.entries.length <= maxImportEntries ? group.entries.map((_, index) => index) : [])
  }

  async function previewFile(file: File) {
    setPreview(undefined)
    const payload = await readFile(file)
    const result = await apiRequest<Preview>(user, integrationsPath + '/kindle/annotations/preview', 'POST', payload)
    setPreview({ file: payload, result })
    choose(0, result)
  }

  const group = preview?.result.groups[groupIndex]
  async function confirmImport() {
    if (!preview || !group || !target) return
    const result = await apiRequest<{ imported: number; duplicates: number }>(user, kindleBookPath(target) + '/annotations', 'POST', {
      ...preview.file, sourceBook: group.sourceBook, selected,
    })
    setMessage(`${result.imported} importada(s), ${result.duplicates} duplicada(s) em ${books.find((item) => item.id === target)?.title}.`)
    setSelected([])
    if (target === book.id) setNotes(await load())
  }

  return <div className="reading-integration-form" aria-busy={busy}>
    <p>Importe o TXT <strong>My Clippings</strong> do Kindle, quando disponível. As notas e os destaques são privados.</p>
    <label>Arquivo TXT do Kindle
      <input type="file" accept=".txt,text/plain" disabled={busy} onChange={(event) => {
        const file = event.currentTarget.files?.[0]
        event.currentTarget.value = ''
        if (file) void run(() => previewFile(file))
      }} />
    </label>
    <p className="t-caption">TXT em português ou inglês, até 256 KB. UTF-8 ou UTF-16 com marca de início.</p>
    {error && <p role="alert" className="access-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {preview && group && <section className="reading-integration-form" aria-label="Prévia de anotações">
      <h3>Prévia de anotações</h3>
      <label>Obra no TXT<select value={groupIndex} disabled={busy} onChange={(event) => choose(Number(event.target.value), preview.result)}>
        {preview.result.groups.map((item, index) => <option key={item.sourceBook} value={index}>{item.sourceBook}</option>)}
      </select></label>
      <label>Confirmar livro na biblioteca<select value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)}>
        <option value="">Selecione a edição correta</option>
        {books.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.author}</option>)}
      </select></label>
      <p className="t-caption">{group.suggestedBookId ? 'Sugestão pelo título e autor. Confira a edição antes de importar.' : 'Correspondência incerta. Selecione o livro.'} {preview.result.skipped > 0 && `${preview.result.skipped} registros incompatíveis ou vazios ignorados.`}</p>
      <p className="t-caption">{selected.length} de {group.entries.length} selecionadas. Até {maxImportEntries} por importação.</p>
      <ul className="reading-clippings">
        {group.entries.slice(page * 15, page * 15 + 15).map((item, offset) => {
          const index = page * 15 + offset
          const checked = selected.includes(index)
          return <li key={index}>
            <label className="reading-integration-check">
              <input type="checkbox" aria-label={`Selecionar ${item.kind === 'note' ? 'nota' : 'destaque'} ${index + 1}`} checked={checked} disabled={busy || (!checked && selected.length >= maxImportEntries)} onChange={() => setSelected(checked ? selected.filter((id) => id !== index) : [...selected, index])} />
              <span>{item.kind === 'note' ? 'Nota' : 'Destaque'} {index + 1}</span>
            </label>
            <ClippingDetails item={item} />
          </li>
        })}
      </ul>
      {group.entries.length > 15 && <div className="workspace-actions">
        <Button variant="secondary" disabled={busy || page === 0} onClick={() => setPage(page - 1)}>Anteriores</Button>
        <Button variant="secondary" disabled={busy || (page + 1) * 15 >= group.entries.length} onClick={() => setPage(page + 1)}>Próximas</Button>
      </div>}
      <div className="workspace-actions">
        <Button disabled={busy || !target || !selected.length} onClick={() => void run(confirmImport)}>Confirmar importação</Button>
        <Button variant="ghost" disabled={busy} onClick={() => setPreview(undefined)}>Fechar prévia</Button>
      </div>
    </section>}
    <h3>Minhas anotações deste livro</h3>
    {!notes && !error && <p role="status">Carregando anotações…</p>}
    {notes?.length === 0 && <p className="t-caption">Nenhuma anotação importada.</p>}
    <ul className="reading-clippings">
      {notes?.map((item) => <li key={item.id}>
        <ClippingDetails item={item} />
        {item.personalNote && <p className="reading-clipping-content">{item.personalNote}</p>}
        {editing?.id === item.id ? <form className="reading-integration-form" onSubmit={(event) => {
          event.preventDefault()
          void run(async () => {
            await apiRequest(user, path + '/' + item.id, 'POST', { note: editing.note })
            setEditing(undefined)
            setNotes(await load())
          })
        }}>
          <label>Comentário pessoal<textarea maxLength={2000} value={editing.note} onChange={(event) => setEditing({ id: item.id, note: event.target.value })} /></label>
          <div className="workspace-actions"><Button disabled={busy}>Salvar comentário</Button><Button type="button" variant="ghost" onClick={() => setEditing(undefined)}>Cancelar</Button></div>
        </form> : <div className="workspace-actions">
          <Button variant="ghost" disabled={busy} onClick={() => setEditing({ id: item.id, note: item.personalNote })}>Editar comentário</Button>
          <Button variant="ghost" disabled={busy} onClick={onReflect}>Escrever reflexão</Button>
          {deleting === item.id ?
            <Button variant="danger" disabled={busy} onClick={() => void run(async () => {
              await apiRequest(user, path + '/' + item.id, 'DELETE')
              setDeleting('')
              setNotes(await load())
            })}>Confirmar exclusão</Button>
            : <Button variant="ghost" disabled={busy} onClick={() => setDeleting(item.id)}>Excluir</Button>}
        </div>}
      </li>)}
    </ul>
  </div>
}
