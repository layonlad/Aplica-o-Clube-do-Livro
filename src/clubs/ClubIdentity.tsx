import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest } from '../auth/api'
import type { ClubSettings } from '../../server/src/club-management'
import { PrivateMedia } from '../community/PrivateMedia'
export function ClubIdentity({ clubId }: { clubId: string }) {
  const { user } = useAuth(),
    [settings, setSettings] = useState<ClubSettings | null>(null)
  useEffect(() => {
    let live = true
    apiRequest<ClubSettings>(user!, `/clubs/${clubId}/settings`)
      .then((value) => live && setSettings(value))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, clubId])
  if (!settings) return null
  return (
    <section
      className="club-identity"
      style={{ borderInlineStart: `4px solid ${settings.accent}` }}
    >
      {settings.coverMediaId && (
        <div className="club-cover">
          <PrivateMedia
            media={{
              id: settings.coverMediaId,
              kind: 'image',
              width: 16,
              height: 7,
              duration: null,
            }}
            alt={`Capa de ${settings.name}`}
          />
        </div>
      )}
      <div>
        <span className="eyebrow">SEU CLUBE</span>
        <h2>{settings.name}</h2>
        {settings.description && <p className="preserve-text">{settings.description}</p>}
      </div>
    </section>
  )
}
