import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import type { Page } from '../../server/src/community-contracts'
import { Button } from '../components/ui'
type Report = {
  id: string
  kind: string
  targetId: string
  reason: string
  excerpt: string
  createdAt: string
}
export function Moderation() {
  const { user } = useAuth(),
    [params] = useSearchParams(),
    clubId = params.get('club'),
    [page, setPage] = useState<Page<Report>>({ items: [], nextCursor: null }),
    [reason, setReason] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [decision, setDecision] = useState<'dismissed' | 'removed'>('dismissed'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0)
  const path = '/moderation/reports' + (clubId ? '?clubId=' + encodeURIComponent(clubId) : '')
  useEffect(() => {
    if (!user?.emailVerified) return
    let live = true
    setBusy(true)
    apiRequest<Page<Report>>(user, path)
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, path, revision])
  return (
    <div className="social-room stack-lg">
      <header className="social-heading">
        <span className="eyebrow">CUIDADO COM A COMUNIDADE</span>
        <h1>Moderação {clubId ? 'do clube' : 'pública'}</h1>
        <p>Analise cada denúncia e registre o motivo da decisão.</p>
      </header>
      {!user?.emailVerified ? (
        <Link to="/account">Entrar na conta</Link>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          {page.items.map((report) => (
            <article className="card" key={report.id}>
              <small>
                {report.kind} · {new Date(report.createdAt).toLocaleString('pt-BR')}
              </small>
              <h2>Motivo informado</h2>
              <p>{report.reason}</p>
              <blockquote className="preserve-text">{report.excerpt}</blockquote>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelected(report.id)
                  setReason('')
                }}
              >
                Analisar denúncia
              </Button>
              {selected === report.id && (
                <form
                  className="workspace-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setBusy(true)
                    setError('')
                    void apiRequest(user, `/moderation/reports/${report.id}/review`, 'POST', {
                      decision,
                      reason,
                    })
                      .then(() => {
                        setSelected(null)
                        setRevision((n) => n + 1)
                      })
                      .catch((err) => setError(readableError(err)))
                      .finally(() => setBusy(false))
                  }}
                >
                  <label>
                    Decisão
                    <select
                      value={decision}
                      onChange={(event) => setDecision(event.target.value as typeof decision)}
                    >
                      <option value="dismissed">Arquivar denúncia</option>
                      <option value="removed">Remover conteúdo / suspender perfil público</option>
                    </select>
                  </label>
                  <label>
                    Justificativa
                    <textarea
                      required
                      minLength={5}
                      maxLength={1000}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <Button disabled={busy}>Confirmar decisão</Button>
                </form>
              )}
            </article>
          ))}
          {!busy && !error && !page.items.length && <p>Nenhuma denúncia pendente.</p>}
          {page.nextCursor && (
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => {
                setBusy(true)
                void apiRequest<Page<Report>>(
                  user,
                  path + (clubId ? '&' : '?') + 'cursor=' + encodeURIComponent(page.nextCursor!),
                )
                  .then((next) =>
                    setPage((value) => ({
                      items: [...value.items, ...next.items],
                      nextCursor: next.nextCursor,
                    })),
                  )
                  .catch((err) => setError(readableError(err)))
                  .finally(() => setBusy(false))
              }}
            >
              Mais denúncias
            </Button>
          )}
        </>
      )}
    </div>
  )
}
