import { localEpub, removeEpub } from './epub-storage'
import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
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
      setError('Selecione um EPUB de até 10 MB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let i = 0; i < bytes.length; i += 16384)
        binary += String.fromCharCode(...bytes.subarray(i, i + 16384))
      const item = await apiRequest<StoredFile>(user, `/me/book-files/${bookId}`, 'POST', {
        filename: file.name,
        data: btoa(binary),
      })
      setInfo({ enabled: true, items: [item] })
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
      setError('Não foi possível baixar o arquivo. Confira sua sessão e tente novamente.')
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
      setInfo({ enabled: true, items: [] })
      setConfirm(false)
      if (!result.purged)
        setError('Acesso ao arquivo revogado. A remoção física será repetida pelo operador.')
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="library-discovery" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Arquivo EPUB original · privado</summary>
      <p>
        O arquivo original pertence somente à sua conta. Participar de um clube não dá aos outros
        membros acesso a ele.
      </p>
      {open && <LocalOriginal bookId={bookId} />}{' '}
      {!user?.emailVerified ? (
        <p>
          Entre com uma conta confirmada para guardar o arquivo original entre aparelhos. A leitura
          de texto local continua disponível sem cadastro.
        </p>
      ) : !info && !error ? (
        <p role="status">Conferindo arquivo privado…</p>
      ) : info && !info.enabled ? (
        <p>O armazenamento de arquivos originais ainda não está habilitado neste ambiente.</p>
      ) : info?.items.length ? (
        info.items.map((file) => (
          <div key={file.id}>
            <p>
              {file.filename} · {(file.byteSize / 1000000).toFixed(1)} MB
            </p>
            <Button disabled={busy} variant="secondary" onClick={() => void download(file)}>
              Baixar meu EPUB
            </Button>
            {confirm ? (
              <>
                <p>Excluir este arquivo original? A versão de texto e suas anotações permanecem.</p>
                <Button disabled={busy} variant="danger" onClick={() => void remove(file)}>
                  Confirmar exclusão do arquivo
                </Button>
                <Button variant="ghost" onClick={() => setConfirm(false)}>
                  Cancelar
                </Button>
              </>
            ) : (
              <Button disabled={busy} variant="ghost" onClick={() => setConfirm(true)}>
                Excluir arquivo original
              </Button>
            )}
          </div>
        ))
      ) : info?.enabled ? (
        <label className="file-button">
          Guardar EPUB original
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
      {busy && <p role="status">Transferindo arquivo privado…</p>}
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
      <p>Cópia privada neste navegador: {file.filename}</p>
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
        Baixar EPUB deste navegador
      </Button>
    </div>
  )
}
