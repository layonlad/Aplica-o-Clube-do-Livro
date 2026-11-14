import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
export function SpaceSwitcher({
  value,
  options,
  disabled,
  label,
  onChange,
}: {
  value: string
  options: { id: string; name: string }[]
  disabled: boolean
  label: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 300 }),
    trigger = useRef<HTMLButtonElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId()
  useEffect(() => {
    if (!open) return
    const rect = trigger.current!.getBoundingClientRect(),
      width = Math.min(Math.max(rect.width, 260), window.innerWidth - 24)
    setPosition({
      top: Math.min(rect.bottom + 8, window.innerHeight - 180),
      left: Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      width,
      maxHeight: Math.max(140, Math.min(320, window.innerHeight - rect.bottom - 24)),
    })
    const dismiss = (event: Event) => {
      if (
        !list.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', close)
    const timer = setTimeout(
      () => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus(),
      0,
    )
    return () => {
      clearTimeout(timer)
      document.removeEventListener('pointerdown', dismiss)
      window.removeEventListener('resize', close)
    }
  }, [open])
  return (
    <div className="space-switch">
      <small>{label}</small>
      <button
        ref={trigger}
        type="button"
        className="space-trigger"
        disabled={disabled}
        aria-label="Espaço de leitura"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{options.find((item) => item.id === value)?.name}</span>
        <ChevronDown size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={list}
            id={id}
            className="space-popover"
            role="listbox"
            aria-label="Espaço de leitura"
            style={position}
            onKeyDown={(event) => {
              const items = Array.from(
                list.current!.querySelectorAll<HTMLButtonElement>('[role="option"]'),
              )
              const index = items.indexOf(document.activeElement as HTMLButtonElement)
              if (event.key === 'Escape') {
                setOpen(false)
                trigger.current?.focus()
              } else if (event.key === 'Tab') setOpen(false)
              else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                event.preventDefault()
                items[
                  event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? items.length - 1
                      : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                ]?.focus()
              }
            }}
          >
            {options.map((item) => (
              <button
                key={item.id}
                role="option"
                type="button"
                aria-selected={value === item.id}
                onClick={() => {
                  onChange(item.id)
                  setOpen(false)
                  trigger.current?.focus()
                }}
              >
                <span>{item.name}</span>
                {value === item.id && <Check size={18} />}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
