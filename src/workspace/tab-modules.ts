import { lazy } from 'react'

const loaders = {
  '/app': () => import('../coral/HomeScreen').then((m) => ({ default: m.HomeScreen })),
  '/app/explore': () => import('../coral/ExploreScreen').then((m) => ({ default: m.ExploreScreen })),
  '/app/library': () => import('../coral/LibraryScreen').then((m) => ({ default: m.LibraryScreen })),
  '/app/community': () => import('../coral/CommunityScreen').then((m) => ({ default: m.CommunityScreen })),
  '/app/profile': () => import('../community/SocialProfile').then((m) => ({ default: m.OwnSocialProfile })),
} as const

export const HomeTab = lazy(loaders['/app'])
export const ExploreTab = lazy(loaders['/app/explore'])
export const LibraryTab = lazy(loaders['/app/library'])
export const CommunityTab = lazy(loaders['/app/community'])
export const ProfileTab = lazy(loaders['/app/profile'])

export function preloadTab(path: string) {
  const load = loaders[path as keyof typeof loaders]
  if (load) void load().catch(() => { /* A later navigation can show the recovery screen. */ })
}

export function warmTabs(current: string) {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  if (connection?.saveData || connection?.effectiveType?.includes('2g')) return
  for (const path of ['/app/library', '/app/community']) if (path !== current) preloadTab(path)
}
