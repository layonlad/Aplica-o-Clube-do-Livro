import { useState } from 'react'
import { Button } from '../components/ui'
export function ConfirmAction({
  label,
  confirmLabel = 'Confirmar exclusão',
  onConfirm,
  disabled = false,
}: {
  label: string
  confirmLabel?: string
  onConfirm: () => Promise<void>
  disabled?: boolean
}) {
  const [confirm, setConfirm] = useState(false)
  return confirm ? (
    <span className="workspace-actions">
      <span>Confirmar esta ação?</span>
      <Button
        variant="danger"
        disabled={disabled}
        onClick={() => void onConfirm().then(() => setConfirm(false))}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" disabled={disabled} onClick={() => setConfirm(false)}>
        Cancelar
      </Button>
    </span>
  ) : (
    <Button variant="ghost" disabled={disabled} onClick={() => setConfirm(true)}>
      {label}
    </Button>
  )
}
