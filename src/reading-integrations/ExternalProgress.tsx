import { useRef, useState, type FormEvent } from 'react'
import type { User } from 'firebase/auth'
import type { ExternalProgress as Progress } from '../../server/src/reading-integrations/providers'
import { apiRequest, messageFor } from '../auth/api'
import { Button } from '../components/ui'
import { kindleBookPath, notifyExternalReadingChange } from './client'

function localDate() {
  const now = new Date()
  return new Date(now.valueOf() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function ExternalProgress({ user, bookId, internal, progress, onSaved }: {
  user: User
  bookId: string
  internal: number
  progress?: Progress
  onSaved: (value?: Progress) => void
}) {
  const [percentage, setPercentage] = useState(String(progress?.percentage ?? 0))
  const [chapter, setChapter] = useState(progress?.chapter ?? '')
  const [readingDate, setReadingDate] = useState(progress?.readingDate ?? localDate())
  const [observation, setObservation] = useState(progress?.observation ?? '')
  const [includeInSummary, setIncludeInSummary] = useState(progress?.includeInSummary ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  const path = kindleBookPath(bookId) + '/progress'

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const value = event
        ? await apiRequest<Progress>(user, path, 'POST', {
            percentage: Number(percentage), chapter, readingDate, observation,
            includeInSummary, revision: progress?.revision ?? 0,
          })
        : await apiRequest<undefined>(user, path + '?revision=' + progress?.revision, 'DELETE')
      notifyExternalReadingChange()
      onSaved(value)
    } catch (err) { setError(messageFor(err)) }
    finally { saving.current = false; setBusy(false) }
  }

  return <form className="reading-integration-form" onSubmit={(event) => void save(event)}>
    <p>Aplicativo <strong>{internal}%</strong> · Kindle <strong>{progress ? progress.percentage + '%' : 'sem registro'}</strong></p>
    <label>Plataforma<input readOnly value="Amazon Kindle" /></label>
    <label>Percentual concluído<input type="number" inputMode="numeric" min={0} max={100} step={1} required value={percentage} onChange={(event) => setPercentage(event.target.value)} /></label>
    <label>Capítulo atual<input maxLength={150} value={chapter} onChange={(event) => setChapter(event.target.value)} /></label>
    <label>Data da leitura<input type="date" min="1900-01-01" max="9999-12-31" required value={readingDate} onChange={(event) => setReadingDate(event.target.value)} /></label>
    <label>Observação privada<textarea maxLength={1000} value={observation} onChange={(event) => setObservation(event.target.value)} /></label>
    <label className="reading-integration-check"><input type="checkbox" checked={includeInSummary} onChange={(event) => setIncludeInSummary(event.target.checked)} /> Incluir no meu histórico e na meta anual</label>
    {error && <p role="alert" className="access-error">{error}</p>}
    <div className="workspace-actions">
      <Button disabled={busy}>{busy ? 'Salvando…' : 'Salvar progresso Kindle'}</Button>
      {progress && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save()}>Excluir progresso Kindle</Button>}
    </div>
  </form>
}
