import { useEffect, useRef, useState } from 'react'
import type { User } from 'firebase/auth'
import { Button } from '../components/ui'
import { apiRequest, authenticatedResponse, messageFor } from '../auth/api'
import { exportEvents, exportPermissions, readingProviders } from '../../server/src/reading-integrations/providers'
import { kindleBookPath } from './client'

type Permission = (typeof exportPermissions)[number]
type ExportEvent = (typeof exportEvents)[number]
const labels: Record<Permission, string> = {
  blocked: 'Bloquear exportação',
  personal: 'Arquivo pessoal com direito de transferência',
  public_domain: 'Obra em domínio público',
  licensed_transfer: 'Licença que autoriza transferência',
}
const states: Record<string, string> = {
  preparing: 'Preparação iniciada', available: 'Arquivo disponibilizado',
  preparation_failed: 'Falha de preparação', download_started: 'Download iniciado',
  share_requested: 'Compartilhamento solicitado',
}
interface ExportInfo {
  file: { id: string; filename: string; byteSize: number; permission: Permission; editionId?: string } | null
  history: { id: string; status: string; createdAt: string }[]
}

export function supportsFileShare(file: File, system = navigator) {
  try { return !!system.share && !!system.canShare?.({ files: [file] }) }
  catch { return false }
}

export function KindleExport({ user, bookId }: { user: User; bookId: string }) {
  const path = kindleBookPath(bookId)
  const [info, setInfo] = useState<ExportInfo>()
  const [permission, setPermission] = useState<Permission>('blocked')
  const [prepared, setPrepared] = useState<{ file: File; id: string }>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const reload = () => apiRequest<ExportInfo>(user, path + '/exports')
  useEffect(() => {
    let live = true
    void reload().then((data) => {
      if (!live) return
      setInfo(data)
      setPermission(data.file?.permission ?? 'blocked')
    }).catch((err) => { if (live) setError(messageFor(err)) })
    return () => { live = false }
  }, [path, user.uid])

  async function run(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try { await task() }
    catch (err) { setError(messageFor(err)) }
    finally { inFlight.current = false; setBusy(false) }
  }

  async function prepare() {
    if (!info?.file) return
    const response = await authenticatedResponse(user, path + '/exports', 'POST', { fileId: info.file.id })
    const id = response.headers.get('X-Reading-Export-Id')
    if (!id || !response.headers.get('Content-Type')?.startsWith('application/epub+zip'))
      throw Error('O serviço não devolveu um EPUB para compartilhar.')
    const blob = await response.blob()
    if (blob.size !== info.file.byteSize) throw Error('O arquivo ficou incompleto. Prepare novamente.')
    setPrepared({ file: new File([blob], info.file.filename, { type: 'application/epub+zip' }), id })
    setMessage('Arquivo pronto. Escolha como transferir.')
    setInfo(await reload())
  }

  async function record(id: string, status: ExportEvent) {
    try {
      await apiRequest(user, path + '/exports/' + id, 'POST', { status })
      setInfo(await reload())
    } catch {
      setError('Não foi possível atualizar o histórico desta tentativa.')
    }
  }

  function download() {
    if (!prepared || inFlight.current) return
    void run(async () => {
      const url = URL.createObjectURL(prepared.file)
      const link = document.createElement('a')
      link.href = url
      link.download = prepared.file.name
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      setMessage('Download iniciado. Escolha o arquivo no Send to Kindle.')
      await record(prepared.id, 'download_started')
    })
  }

  function share() {
    if (!prepared || inFlight.current) return
    void run(async () => {
      if (!supportsFileShare(prepared.file)) throw Error('O compartilhamento deste arquivo está indisponível. Use Baixar EPUB.')
      try { await navigator.share({ files: [prepared.file] }) }
      catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        throw Error('Não foi possível abrir o compartilhamento. Use Baixar EPUB.')
      }
      setMessage('Compartilhamento solicitado. Confira o processamento na Amazon.')
      await record(prepared.id, 'share_requested')
    })
  }

  return <div className="reading-integration-form" aria-busy={busy}>
    {error && <p role="alert" className="access-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!info && !error && <p role="status">Consultando o original…</p>}
    {info && !info.file && <p>A biblioteca precisa de um EPUB pessoal ou de uma edição com transferência autorizada.</p>}
    {info?.file && <>
      <p className="t-caption">{info.file.filename}</p>
      {info.file.editionId ? <p className="t-caption">Transferência autorizada pela licença da edição do catálogo.</p> : <>
        <label>Permissão de exportação
          <select disabled={busy} value={permission} onChange={(event) => {
            setPermission(event.target.value as Permission)
            setPrepared(undefined)
          }}>
            {exportPermissions.map((item) => <option key={item} value={item}>{labels[item]}</option>)}
          </select>
        </label>
        <p className="t-caption">Ao autorizar, você confirma que pode transferir este arquivo para uso pessoal. O original precisa estar livre de DRM.</p>
      </>}
      <div className="workspace-actions">
        {permission !== info.file.permission && <Button disabled={busy} onClick={() => void run(async () => {
          await apiRequest(user, path + '/permission', 'POST', { fileId: info.file!.id, permission })
          setInfo(await reload())
          setMessage('Permissão atualizada.')
        })}>Salvar permissão</Button>}
        {permission !== 'blocked' && permission === info.file.permission && !prepared &&
          <Button disabled={busy} onClick={() => void run(prepare)}>{busy ? 'Preparando…' : 'Preparar EPUB'}</Button>}
      </div>
    </>}
    {prepared && <div className="workspace-actions">
      {supportsFileShare(prepared.file) && <Button disabled={busy} onClick={share}>Compartilhar pelo aparelho</Button>}
      <Button variant="secondary" disabled={busy} onClick={download}>Baixar EPUB</Button>
    </div>}
    <p>Se o Kindle aparecer no menu do aparelho, selecione-o. Você também pode baixar o EPUB e escolhê-lo no portal da Amazon.</p>
    <a className="text-link" href={readingProviders.kindle.transferUrl} target="_blank" rel="noopener noreferrer">Abrir Send to Kindle</a>
    <details>
      <summary>Limites e envio manual por e-mail</summary>
      <p>A biblioteca guarda EPUBs pessoais de até 10 MB. O portal da Amazon aceita até 200 MB por arquivo. Para e-mail, use um remetente aprovado na Amazon e um EPUB abaixo de 50 MB.</p>
      <a href="https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV" target="_blank" rel="noopener noreferrer">Configurar na Amazon</a>
    </details>
    {!!info?.history.length && <details>
      <summary>Histórico de preparação</summary>
      <ul>{info.history.map((item) => <li key={item.id}>{states[item.status]} · {new Date(item.createdAt).toLocaleString('pt-BR')}</li>)}</ul>
      <Button variant="ghost" disabled={busy} onClick={() => void run(async () => {
        await apiRequest(user, path + '/exports', 'DELETE')
        setPrepared(undefined)
        setInfo(await reload())
      })}>Limpar histórico</Button>
    </details>}
  </div>
}
