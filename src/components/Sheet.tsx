import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
/** Native modal: focus stays inside, Escape closes, and mobile keyboards resize the content. */
export function Sheet({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId()
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const dialog = ref.current!,
      previous = document.body.style.overflow
    const resize = () =>
      dialog.style.setProperty(
        '--sheet-height',
        `${window.visualViewport?.height ?? window.innerHeight}px`,
      )
    resize()
    window.visualViewport?.addEventListener('resize', resize)
    document.body.style.overflow = 'hidden'
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    return () => {
      window.visualViewport?.removeEventListener('resize', resize)
      dialog.close?.()
      document.body.style.overflow = previous
    }
  }, [])
  return createPortal(
    <dialog
      ref={ref}
      className={`social-sheet ${className}`}
      aria-labelledby={heading}
      onCancel={(event) => {
        event.preventDefault()
        close.current()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close.current()
      }}
    >
      <div className="sheet-surface">
        <header className="sheet-heading">
          <h2 id={heading}>{title}</h2>
          <button
            autoFocus
            className="icon-button"
            type="button"
            aria-label={`Fechar ${title.toLowerCase()}`}
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </dialog>,
    document.body,
  )
}
