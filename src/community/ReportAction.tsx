import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest, readableError } from '../auth/api'
import { Button } from '../components/ui'
export function ReportAction({
  kind,
  id,
}: {
  kind: 'post' | 'comment' | 'profile' | 'topic' | 'reply'
  id: string
}) {
  const { user } = useAuth(),
    [open, setOpen] = useState(false),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('')
  if (!user?.emailVerified) return null
  return (
    <div className="report-action">
      <Button variant="ghost" onClick={() => setOpen(!open)}>
        Denunciar
      </Button>
      {open && (
        <form
          className="workspace-form"
          onSubmit={(event) => {
            event.preventDefault()
            setBusy(true)
            void apiRequest(user, '/reports', 'POST', { kind, targetId: id, reason })
              .then(() => {
                setOpen(false)
                setReason('')
                setMessage('Denúncia enviada para análise.')
              })
              .catch((err) => setMessage(readableError(err)))
              .finally(() => setBusy(false))
          }}
        >
          <label>
            Motivo da denúncia
            <textarea
              required
              minLength={5}
              maxLength={1000}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button disabled={busy}>Enviar denúncia</Button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  )
}
