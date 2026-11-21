import type { Pool } from 'pg'
import { getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

/** A pending signal: the person's Firebase uid and the inbox version to publish. */
export interface Signal {
  uid: string
  version: number
}
export type SignalWriter = (signals: Signal[]) => Promise<void>

/** Firestore collection read by the app. Each document holds only `{ v }`, readable by its owner. */
export const SIGNAL_COLLECTION = 'notificationSignals'
const BATCH = 400
// Firestore path segments cannot contain '/'; Firebase Auth uids from Google and e-mail never do.
const safeUid = /^[A-Za-z0-9_-]{1,128}$/

/** Writes the versions to the chat Firestore database, which already exists and is closed to clients. */
export function firestoreSignalWriter(): SignalWriter {
  return async (signals) => {
    const db = getFirestore(getApp(), 'clube-chat')
    const batch = db.batch()
    for (const { uid, version } of signals)
      batch.set(db.doc(`${SIGNAL_COLLECTION}/${uid}`), { v: version })
    await batch.commit()
  }
}

/**
 * Publishes the inbox versions bumped by the database triggers (migration 024).
 * Calls are coalesced: one flush runs at a time and a call during it schedules exactly one more.
 * Publishing is idempotent, so a flush on another instance or a retry only rewrites the same number.
 */
export function createSignalPublisher(pool: Pool, write: SignalWriter, maxRounds = 5) {
  let running: Promise<number> | undefined,
    again = false
  async function flushOnce() {
    let published = 0
    for (let round = 0; round < maxRounds; round++) {
      const { rows } = await pool.query<{ user_id: string; uid: string; version: string }>(
        `SELECT s.user_id,u.firebase_uid AS uid,s.version FROM notification_signals s JOIN users u ON u.id=s.user_id
         WHERE s.version>s.published ORDER BY s.changed_at LIMIT $1`,
        [BATCH],
      )
      if (!rows.length) break
      const valid = rows.filter((row) => safeUid.test(row.uid))
      if (valid.length)
        await write(valid.map((row) => ({ uid: row.uid, version: Number(row.version) })))
      // Invalid uids are marked as published too, so they never block the queue.
      await pool.query(
        `UPDATE notification_signals s SET published=greatest(s.published,v.version)
         FROM unnest($1::uuid[],$2::bigint[]) v(user_id,version) WHERE s.user_id=v.user_id`,
        [rows.map((row) => row.user_id), rows.map((row) => row.version)],
      )
      published += valid.length
      if (rows.length < BATCH) break
    }
    return published
  }
  async function flush(): Promise<number> {
    if (running) {
      again = true
      return running
    }
    running = (async () => {
      let total = 0
      try {
        do {
          again = false
          total += await flushOnce()
        } while (again)
      } finally {
        running = undefined
      }
      return total
    })()
    return running
  }
  return {
    flush,
    /** Fire and forget, for hooks after a response. Failures wait for the next call or the executor's run. */
    request() {
      void flush().catch(() =>
        console.error('Sinal de notificações adiado; a próxima alteração ou o executor tentará de novo.'),
      )
    },
  }
}
export type SignalPublisher = ReturnType<typeof createSignalPublisher>
