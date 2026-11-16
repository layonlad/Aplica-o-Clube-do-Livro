import { localEpub, removeEpub } from './epub-storage'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { announceBookFiles, uploadOriginal } from './book-files'
import { Button } from '../components/ui'
interface StoredFile {
  id: string
  filename: string
  byteSize: number
}
export function PrivateBookFile({ bookId }: { bookId: string }) {
  const { user } = useAuth()
  const [info, setInfo] = useState<{ enabled: boolean; items: StoredFile[] } | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    let live = true
    if (!open || !user?.emailVerified) return
    setInfo(null)
    setError('')
    apiRequest<{ enabled: boolean; items: StoredFile[] }>(user, `/me/book-files/${bookId}`)
      .then((value) => live && setInfo(value))
      .catch((err) => live && setError(readableError(err)))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, bookId, open])
  async function upload(file: File) {
    if (!user) return
    if (file.size > 10000000 || !/\.epub$/i.test(file.name)) {
      setError('Escolha um EPUB de até 10 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const item = (await uploadOriginal(user, bookId, file, file.name)) as StoredFile | null
      if (item) setInfo({ enabled: true, items: [item] })
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  async function download(file: StoredFile) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(
        `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1/me/files/${file.id}/content`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          referrerPolicy: 'no-referrer',
          signal: AbortSignal.timeout(75000),
        },
      )
      if (!response.ok) throw Error('download')
      const href = URL.createObjectURL(await response.blob())
      const link = document.createElement('a')
      link.href = href
      link.download = file.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch {
      setError('Não deu para baixar agora. Tente de novo.')
    } finally {
      setBusy(false)
    }
  }
  async function remove(file: StoredFile) {
    if (!user) return
    setBusy(true)
    setError('')
    try {
      const result = await apiRequest<{ purged: boolean }>(user, `/me/files/${file.id}`, 'DELETE')
      await removeEpub(user.uid, bookId)
      announceBookFiles()
      setInfo({ enabled: true, items: [] })
      setConfirm(false)
      if (!result.purged)
        setError('Arquivo removido. A limpeza final termina em instantes.')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="library-discovery" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Arquivo do livro</summary>
      {open && !user?.emailVerified && <LocalOriginal bookId={bookId} />}
      {!user?.emailVerified ? (
        <p className="t-caption">
          <a href="#/account">Entre na sua conta</a> para ter este livro em qualquer aparelho.
        </p>
      ) : !info && !error ? (
        <p role="status" className="t-caption">Conferindo…</p>
      ) : info && !info.enabled ? (
        <p className="t-caption">Indisponível neste ambiente.</p>
      ) : info?.items.length ? (
        info.items.map((file) => (
          <div key={file.id} className="book-file">
            <p className="t-caption">
              Salvo na conta · {(file.byteSize / 1000000).toFixed(1)} MB
            </p>
            <div className="workspace-actions">
              <Button disabled={busy} variant="secondary" onClick={() => void download(file)}>
                Baixar EPUB
              </Button>
              {confirm ? (
                <>
                  <Button disabled={busy} variant="danger" onClick={() => void remove(file)}>
                    Apagar arquivo
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button disabled={busy} variant="ghost" onClick={() => setConfirm(true)}>
                  Apagar arquivo
                </Button>
              )}
            </div>
            {confirm && <p className="t-caption">Suas anotações e o progresso continuam.</p>}
          </div>
        ))
      ) : info?.enabled ? (
        <label className="file-button">
          Enviar EPUB
          <input
            type="file"
            accept=".epub"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void upload(file)
              e.target.value = ''
            }}
          />
        </label>
      ) : null}
      {busy && <p role="status" className="t-caption">Enviando…</p>}
      {error && <p role="alert">{error}</p>}
    </details>
  )
}

function LocalOriginal({ bookId }: { bookId: string }) {
  const { user } = useAuth(),
    [file, setFile] = useState<Awaited<ReturnType<typeof localEpub>>>(undefined),
    namespace = user?.emailVerified ? user.uid : 'visitor'
  useEffect(() => {
    let live = true
    void localEpub(namespace, bookId)
      .then((value) => live && setFile(value))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [namespace, bookId])
  if (!file) return null
  return (
    <div>
      <p className="t-caption">Salvo neste aparelho</p>
      <Button
        variant="secondary"
        onClick={() => {
          const href = URL.createObjectURL(file.file),
            link = document.createElement('a')
          link.href = href
          link.download = file.filename
          link.click()
          setTimeout(() => URL.revokeObjectURL(href), 1000)
        }}
      >
        Baixar EPUB
      </Button>
    </div>
  )
}
