import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PluginListenerHandle } from '@capacitor/core'
import { nativeLinkPath } from './links'

export function MobileBridge() {
  const routerNavigate = useNavigate()
  const navigate = useRef(routerNavigate)
  navigate.current = routerNavigate
  useEffect(() => {
    const handles: PluginListenerHandle[] = []
    let live = true
    async function attach() {
      const { App } = await import('@capacitor/app')
      if (!live) return
      const open = ({ url }: { url: string }) => {
        const path = nativeLinkPath(url, import.meta.env.VITE_NATIVE_LINK_ORIGIN)
        if (live && path) navigate.current(path)
      }
      const link = await App.addListener('appUrlOpen', open)
      if (!live) { await link.remove(); return }
      handles.push(link)
      const initial = await App.getLaunchUrl()
      if (initial) open(initial)
      const back = await App.addListener('backButton', ({ canGoBack }) => {
        if (!live) return
        if (canGoBack) navigate.current(-1)
        else void App.minimizeApp().catch(() => {})
      })
      if (live) handles.push(back)
      else await back.remove()
    }
    void attach().catch(() => {})
    return () => {
      live = false
      for (const handle of handles) void handle.remove().catch(() => {})
    }
  }, [])
  return null
}
