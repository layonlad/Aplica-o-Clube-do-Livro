import { useState } from 'react'
import { Send, Copy } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './ui'
/** Shares only the permission-gated link, never private captions, files or participant identities. */
export function ShareAction({
  path,
  privateContent = false,
}: {
  path: string
  privateContent?: boolean
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState('')
  const url = new URL(import.meta.env.BASE_URL, window.location.href)
  url.hash = path
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ url: url.href })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }
    setOpen(true)
  }
  return (
    <>
      <button
        type="button"
        className="social-action"
        aria-label="Compartilhar link"
        title="Compartilhar link"
        onClick={() => void share()}
      >
        <Send size={22} />
      </button>
      {open && (
        <Sheet title="Compartilhar" onClose={() => setOpen(false)}>
          <div className="sheet-body stack">
            <p>
              {privateContent
                ? 'Somente membros autorizados poderão abrir este link. O conteúdo do clube continua privado.'
                : 'Envie o link desta publicação.'}
            </p>
            <label>
              Link da publicação
              <input readOnly value={url.href} onFocus={(event) => event.target.select()} />
            </label>
            <Button
              onClick={() => {
                if (!navigator.clipboard) {
                  setMessage('Selecione e copie o link acima.')
                  return
                }
                void navigator.clipboard
                  .writeText(url.href)
                  .then(() => setMessage('Link copiado.'))
                  .catch(() => setMessage('Selecione e copie o link acima.'))
              }}
            >
              <Copy size={18} />
              Copiar link
            </Button>
            {message && <p role="status">{message}</p>}
          </div>
        </Sheet>
      )}
    </>
  )
}
