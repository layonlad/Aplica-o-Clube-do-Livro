import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button } from '../components/ui'
import { ConfirmAction } from '../community/ConfirmAction'
interface SharedFile {
  id: string
  filename: string
  byteSize: number
  source: string
  license: string
}
export function ClubBookFile({ clubId, bookId }: { clubId: string; bookId: string }) {
  const { user } = useAuth(),
    [open, setOpen] = useState(false),
    [data, setData] = useState<{
      enabled: boolean
      canManage: boolean
      items: SharedFile[]
    } | null>(null),
    [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState(''),
    [license, setLicense] = useState(''),
    [authorized, setAuthorized] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!open || !user?.emailVerified) return
    let live = true
    setData(null)
    apiRequest<NonNullable<typeof data>>(user, `/clubs/${clubId}/book-files/${bookId}`)
      .then((value) => live && setData(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId, bookId, open, revision])
  async function upload(event: FormEvent) {
    event.preventDefault()
    if (!user || !file || !authorized) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 10000000 || !/\.epub$/i.test(file.name))
        throw Error('Escolha um EPUB de até 10 MB.')
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let index = 0; index < bytes.length; index += 16384)
        binary += String.fromCharCode(...bytes.subarray(index, index + 16384))
      await apiRequest(user, `/clubs/${clubId}/book-files/${bookId}`, 'POST', {
        filename: file.name,
        data: btoa(binary),
        source,
        license,
        authorized,
      })
      setFile(null)
      setAuthorized(false)
      setMessage('EPUB autorizado disponibilizado somente neste clube.')
      setRevision((n) => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : readableError(err))
    } finally {
      setBusy(false)
    }
  }
  async function download(file: SharedFile) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const token = await user.getIdToken(),
        response = await fetch(
          `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/club-files/${file.id}/content`,
          {
            headers: { Authorization: `Bearer ${token}` },
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
            signal: AbortSignal.timeout(75000),
          },
        )
      if (!response.ok) throw Error('Este EPUB não está disponível para sua conta.')
      const href = URL.createObjectURL(await response.blob()),
        link = document.createElement('a')
      link.href = href
      link.download = file.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="library-discovery" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>EPUB autorizado do clube</summary>
      <p>
        Arquivos desta seção são enviados expressamente pela administração para participantes. Seus
        EPUBs pessoais nunca são incluídos aqui automaticamente.
      </p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!data && !error && <p role="status">Conferindo arquivos do clube…</p>}
      {data && !data.enabled && <p>O armazenamento não está habilitado neste ambiente.</p>}
      {data?.items.map((file) => (
        <article key={file.id}>
          <strong>{file.filename}</strong>
          <p>Origem: {file.source}</p>
          <p>Permissão informada pela administração: {file.license}</p>
          <Button disabled={busy} variant="secondary" onClick={() => void download(file)}>
            Baixar EPUB autorizado do clube
          </Button>
          {data.canManage && (
            <ConfirmAction
              label="Remover EPUB compartilhado"
              disabled={busy}
              onConfirm={async () => {
                setBusy(true)
                try {
                  const value = await apiRequest<{ purged: boolean }>(
                    user!,
                    `/club-files/${file.id}`,
                    'DELETE',
                  )
                  setMessage(
                    value.purged
                      ? 'Arquivo compartilhado removido.'
                      : 'Acesso revogado; a limpeza física será repetida.',
                  )
                  setRevision((n) => n + 1)
                } catch (err) {
                  setError(readableError(err))
                } finally {
                  setBusy(false)
                }
              }}
            />
          )}
        </article>
      ))}
      {data?.enabled &&
        !data.items.length &&
        (data.canManage ? (
          <form className="workspace-form" onSubmit={upload}>
            <label>
              Arquivo EPUB autorizado · até 10 MB
              <input
                required
                type="file"
                accept=".epub"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <label>
              Origem ou titular da obra
              <input
                required
                minLength={3}
                maxLength={500}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              />
            </label>
            <label>
              Licença ou autorização de distribuição
              <textarea
                required
                minLength={5}
                maxLength={1000}
                value={license}
                onChange={(event) => setLicense(event.target.value)}
              />
            </label>
            <label className="workspace-check">
              <input
                required
                type="checkbox"
                checked={authorized}
                onChange={(event) => setAuthorized(event.target.checked)}
              />
              Confirmo que tenho autorização para distribuir este arquivo aos participantes do
              clube.
            </label>
            <Button disabled={busy || !file || !authorized}>Disponibilizar EPUB neste clube</Button>
          </form>
        ) : (
          <p>
            Este título ainda não tem arquivo autorizado. A referência bibliográfica e o progresso
            de leitura continuam disponíveis.
          </p>
        ))}
    </details>
  )
}
