import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { apiRequest } from '../auth/api'
import type { ExternalProgress } from '../../server/src/reading-integrations/providers'

export const integrationsPath = '/me/reading-integrations'
export const kindleBookPath = (id: string) => integrationsPath + '/kindle/books/' + id
const changed = 'external-reading-changed'

export function notifyExternalReadingChange() {
  window.dispatchEvent(new Event(changed))
}

export function useExternalReading(enabled = true) {
  const { user } = useAuth()
  const [result, setResult] = useState<{ uid: string; items: ExternalProgress[] }>()
  const [failedUid, setFailedUid] = useState<string>()
  useEffect(() => {
    if (!enabled || !user?.emailVerified) return
    let active = true
    let request = 0
    function load() {
      const current = ++request
      setFailedUid(undefined)
      void apiRequest<ExternalProgress[]>(user!, integrationsPath)
        .then((items) => {
          if (active && current === request) setResult({ uid: user!.uid, items })
        })
        .catch(() => {
          if (active && current === request) setFailedUid(user!.uid)
        })
    }
    load()
    window.addEventListener(changed, load)
    return () => {
      active = false
      window.removeEventListener(changed, load)
    }
  }, [enabled, user?.uid, user?.emailVerified])
  const ready = !!user && result?.uid === user.uid
  return {
    ready,
    items: enabled && user?.emailVerified && result?.uid === user.uid ? result.items : [],
    failed: !!user && failedUid === user.uid,
  }
}
