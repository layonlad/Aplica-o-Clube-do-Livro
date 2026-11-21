import { useSyncExternalStore } from 'react'
import type { User } from 'firebase/auth'
import { apiRequest, ApiError, readableError } from '../auth/api'
import type { Notification, NotificationPage, UnreadNotificationCount } from './types'
import { defaultSignalWatcher, type SignalWatcher } from './signal'

/**
 * Serviço único de notificações do app (um por aba). Todas as telas leem daqui; nenhuma faz consultas próprias.
 *
 * Tempo real: quando o sinal está ligado, o serviço escuta um número de versão no Firestore (ver ./signal.ts) e
 * consulta a API só quando ele muda; a consulta periódica vira uma conferência a cada 5 min. Sem sinal, ou se ele
 * cair, volta a consultar o contador (barato, calculado no servidor) a cada 30 s com a aba visível. Em ambos os
 * casos também consulta na hora em que algo acontece: o app volta ao primeiro plano, a conexão volta, chega um
 * push ou uma tela avisa que mudou algo. A primeira página só é relida quando o contador sobe ou o sinal avisa,
 * para incluir as novas e avisar o banner. Ver docs/notificacoes/TEMPO_REAL.md.
 */

export interface NotificationState {
  uid: string | null
  unread: number
  items: Notification[] | null
  nextCursor: string | null
  status: 'idle' | 'loading' | 'ready' | 'error'
  error: string
  loadingMore: boolean
  /** Momento da última confirmação com o servidor (para "atualizado agora"). */
  syncedAt: number | null
}

const empty = (uid: string | null): NotificationState => ({ uid, unread: 0, items: null, nextCursor: null, status: 'idle', error: '', loadingMore: false, syncedAt: null })
const VISIBLE_INTERVAL = 30000
/** Com o sinal ativo a consulta é só uma rede de segurança. */
const SIGNAL_INTERVAL = 300000
const MAX_BACKOFF = 300000
const PAGE = 20

type Arrival = (items: Notification[]) => void

export class NotificationStore {
  state: NotificationState = empty(null)
  private user: User | null = null
  private listeners = new Set<() => void>()
  private arrivals = new Set<Arrival>()
  private retains = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private failures = 0
  private generation = 0
  private polling = false
  private again = false
  /** IDs já vistos nesta sessão: só os outros são anunciados no banner (não depende do relógio do aparelho). */
  private seen: Set<string> | null = null
  private detach: (() => void) | null = null
  /** Sinal de tempo real: escuta ativa, versão já vista e pedido de reler a primeira página. */
  private unwatch: (() => void) | null = null
  private watching = false
  private live = false
  private version: number | null = null
  private signalled = false

  constructor(private watcher: SignalWatcher | null = defaultSignalWatcher()) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  onArrival(listener: Arrival) {
    this.arrivals.add(listener)
    return () => { this.arrivals.delete(listener) }
  }
  private set(patch: Partial<NotificationState>) {
    this.state = { ...this.state, ...patch }
    for (const listener of this.listeners) listener()
  }

  /** Troca de conta, entrada ou saída: zera tudo e recomeça para a conta nova. */
  setUser(user: User | null) {
    const uid = user?.emailVerified ? user.uid : null
    this.user = uid ? user : null
    if (uid === this.state.uid) return
    this.generation++
    this.seen = null
    this.failures = 0
    this.set(empty(uid))
    this.unwatchSignal()
    if (uid && this.retains) { this.schedule(0); this.watchSignal() }
    else this.stopTimer()
  }

  /** Mantém o serviço ligado enquanto houver uma tela usando. Devolve a função que libera. */
  retain() {
    this.retains++
    if (this.retains === 1) this.start()
    return () => {
      this.retains--
      if (!this.retains) this.stop()
    }
  }
  private start() {
    const wake = () => {
      if (document.visibilityState !== 'visible') return
      this.watchSignal() // religa o sinal se ele caiu
      this.schedule(0)
    }
    const message = (event: MessageEvent) => { if (event.data?.type === 'notifications-changed') this.schedule(0) }
    window.addEventListener('notifications-changed', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('online', wake)
    document.addEventListener('visibilitychange', wake)
    navigator.serviceWorker?.addEventListener('message', message)
    this.detach = () => {
      window.removeEventListener('notifications-changed', wake)
      window.removeEventListener('focus', wake)
      window.removeEventListener('online', wake)
      document.removeEventListener('visibilitychange', wake)
      navigator.serviceWorker?.removeEventListener('message', message)
    }
    if (this.user) { this.schedule(0); this.watchSignal() }
  }
  private stop() {
    this.detach?.()
    this.detach = null
    this.stopTimer()
    this.unwatchSignal()
  }
  private watchSignal() {
    if (!this.watcher || !this.user || !this.retains || this.watching) return
    const ticket = this.generation
    const current = () => ticket === this.generation && this.watching
    this.watching = true
    this.watcher(
      this.user,
      (version) => {
        if (!current()) return
        const known = this.version
        this.version = version
        this.live = true // a próxima consulta já sai espaçada
        if (known !== null && version !== known) {
          this.signalled = true
          this.schedule(0)
        }
      },
      () => {
        if (!current()) return
        this.unwatchSignal()
        this.schedule(0) // sem sinal: volta para a consulta a cada 30 s
      },
    ).then(
      (stop) => { if (current()) this.unwatch = stop; else stop() },
      () => { if (current()) { this.unwatchSignal(); this.schedule(0) } },
    )
  }
  private unwatchSignal() {
    this.unwatch?.()
    this.unwatch = null
    this.watching = false
    this.live = false
    this.version = null
  }
  private stopTimer() {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }
  private schedule(delay: number) {
    this.stopTimer()
    if (!this.user || !this.retains) return
    this.timer = setTimeout(() => void this.poll(), delay)
  }
  private async poll() {
    if (!this.user) return
    if (this.polling) { this.again = true; return } // um aviso durante a consulta gera mais uma, logo depois
    if (document.visibilityState === 'hidden') return // volta a consultar quando a aba aparecer
    this.polling = true
    const ticket = this.generation
    try {
      const { count } = await apiRequest<UnreadNotificationCount>(this.user, '/me/notifications/unread')
      if (ticket !== this.generation) return
      const grew = count > this.state.unread
      // O sinal também avisa leituras em outro aparelho e avisos agrupados que não mudam o contador.
      const signalled = this.signalled
      this.signalled = false
      this.failures = 0
      this.set({ unread: count, syncedAt: Date.now() })
      // Contador subiu ou o sinal mudou: relê só a primeira página para incluir as novas (e anunciá-las).
      const loaded = this.state.items !== null
      if ((grew && (loaded || this.arrivals.size)) || (signalled && loaded)) await this.refreshHead(ticket)
    } catch {
      if (ticket === this.generation) this.failures++
    } finally {
      this.polling = false
      // A troca de conta pode ter consumido o primeiro timer enquanto a consulta anterior ainda estava aberta.
      if (ticket !== this.generation || this.again) { this.again = false; this.schedule(0) }
      else this.schedule(this.failures ? Math.min(MAX_BACKOFF, VISIBLE_INTERVAL * 2 ** this.failures) : this.live ? SIGNAL_INTERVAL : VISIBLE_INTERVAL)
    }
  }
  private async refreshHead(ticket = this.generation) {
    if (!this.user) return
    const page = await apiRequest<NotificationPage>(this.user, `/me/notifications?limit=${PAGE}`)
    if (ticket !== this.generation) return
    const known = new Set((this.state.items ?? []).map((item) => item.id))
    const fresh = page.items.filter((item) => !known.has(item.id))
    const items = this.state.items
      ? [...fresh, ...this.state.items.map((item) => page.items.find((next) => next.id === item.id) ?? item)]
      : page.items
    this.set({
      items: this.state.items ? items : null,
      nextCursor: this.state.items ? this.state.nextCursor : null,
      syncedAt: Date.now(),
    })
    this.announce(page.items)
  }
  /** Anuncia ao banner só o que chegou depois da primeira leitura desta sessão, sem repetir. */
  private announce(items: Notification[]) {
    if (!this.seen) { this.seen = new Set(items.map((item) => item.id)); return }
    const fresh = items.filter((item) => !item.readAt && !this.seen!.has(item.id))
    for (const item of items) this.seen.add(item.id)
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-300))
    if (fresh.length) for (const listener of this.arrivals) listener(fresh)
  }

  /** Primeira página da central (usa a lista já carregada quando existe). */
  async load(force = false) {
    if (!this.user) return
    if (this.state.items && !force) { this.schedule(0); return }
    const ticket = this.generation
    this.set({ status: 'loading', error: '' })
    try {
      const [page, unread] = await Promise.all([
        apiRequest<NotificationPage>(this.user, `/me/notifications?limit=${PAGE}`),
        apiRequest<UnreadNotificationCount>(this.user, '/me/notifications/unread'),
      ])
      if (ticket !== this.generation) return
      this.set({ items: page.items, nextCursor: page.nextCursor, unread: unread.count, status: 'ready', syncedAt: Date.now() })
      this.announce(page.items)
    } catch (error) {
      if (ticket === this.generation) this.set({ status: 'error', error: readableError(error) })
    }
  }
  async loadMore() {
    if (!this.user || !this.state.nextCursor || this.state.loadingMore) return
    const ticket = this.generation
    this.set({ loadingMore: true, error: '' })
    try {
      const page = await apiRequest<NotificationPage>(this.user, `/me/notifications?limit=${PAGE}&cursor=${encodeURIComponent(this.state.nextCursor)}`)
      if (ticket !== this.generation) return
      const known = new Set((this.state.items ?? []).map((item) => item.id))
      this.set({ items: [...(this.state.items ?? []), ...page.items.filter((item) => !known.has(item.id))], nextCursor: page.nextCursor, loadingMore: false })
    } catch (error) {
      if (ticket === this.generation) this.set({ loadingMore: false, error: readableError(error) })
    }
  }
  /** Marca como lida na hora (otimista) e desfaz se o servidor recusar. */
  async markRead(id: string) {
    if (!this.user) return
    const item = this.state.items?.find((value) => value.id === id)
    if (item?.readAt) return
    const before = this.state
    const now = new Date().toISOString()
    this.set({
      items: this.state.items?.map((value) => (value.id === id ? { ...value, readAt: now } : value)) ?? null,
      unread: Math.max(0, this.state.unread - 1),
    })
    try {
      await apiRequest(this.user, '/me/notifications/read', 'POST', { id })
    } catch (error) {
      if (before.uid === this.state.uid) this.set({ items: before.items, unread: before.unread })
      throw error
    }
  }
  async markAllRead() {
    if (!this.user) return
    const before = this.state
    const now = new Date().toISOString()
    this.set({ items: this.state.items?.map((value) => (value.readAt ? value : { ...value, readAt: now })) ?? null, unread: 0 })
    try {
      await apiRequest(this.user, '/me/notifications/read', 'POST', {})
    } catch (error) {
      if (before.uid === this.state.uid) this.set({ items: before.items, unread: before.unread })
      throw error
    }
  }
  /** Confere com a API se o conteúdo ainda existe e pode ser visto (exclusão, saída do clube, bloqueio). */
  async verify(id: string): Promise<Notification | null> {
    if (!this.user) return null
    try {
      return await apiRequest<Notification>(this.user, `/me/notifications/${id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        this.forget(id)
        return null
      }
      throw error
    }
  }
  /** Tira da lista um item cujo conteúdo não existe mais. */
  forget(id: string) {
    const item = this.state.items?.find((value) => value.id === id)
    this.set({
      items: this.state.items?.filter((value) => value.id !== id) ?? null,
      unread: item && !item.readAt ? Math.max(0, this.state.unread - 1) : this.state.unread,
    })
  }
  refresh() { this.schedule(0) }
}

export const notifications = new NotificationStore()

/** Lê só uma parte do estado: a tela só redesenha quando essa parte muda. */
export function useNotifications<T>(select: (state: NotificationState) => T): T {
  return useSyncExternalStore(notifications.subscribe, () => select(notifications.state), () => select(notifications.state))
}
export function useUnreadCount() {
  return useNotifications((state) => (state.uid ? state.unread : 0))
}
/** Para telas que mudam algo ligado a notificações (aceitar convite, por exemplo). */
export function notificationChanged() {
  window.dispatchEvent(new Event('notifications-changed'))
}
