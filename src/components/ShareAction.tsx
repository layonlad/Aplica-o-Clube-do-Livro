import { useState } from 'react'
import { Send, Copy } from 'lucide-react'
import { Sheet } from './Sheet'
import { Button } from './ui'
/** Shares only the permission-gated link, never private captions, files or participant identities. */
export function ShareAction({
  path,
  privateContent = false,
  label,
}: {
  path: string
  privateContent?: boolean
  /** Com rótulo, vira item de menu ("Enviar link") em vez de ícone solto. */
  label?: string
}) {
  const [open, setOpen] = useState(false),
    [message, setMessage] = useState('')
  const nativeBuild = import.meta.env.VITE_APP_NATIVE === '1'
  const url = new URL(import.meta.env.BASE_URL, nativeBuild ? import.meta.env.VITE_NATIVE_LINK_ORIGIN : window.location.href)
  url.hash = path
  async function share() {
    if (nativeBuild) {
      try {
        const { Share } = await import('@capacitor/share')
        await Share.share({ url: url.href })
        return
      } catch { /* Present the existing copy-link sheet. */ }
    }
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
        className={label ? 'button button--ghost' : 'social-action'}
        aria-label={label ? undefined : 'Compartilhar link'}
        title="Compartilhar link"
        onClick={() => void share()}
      >
        <Send size={label ? 18 : 22} />
        {label}
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
