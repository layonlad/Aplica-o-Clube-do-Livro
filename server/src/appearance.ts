import type { Pool } from 'pg'
import type { UserProfile } from './contracts.js'
import { transaction } from './database.js'
import { emptyWorkspace } from './workspace-model.js'
import { appearanceSchema, type Appearance } from './appearance-schema.js'

export { appearanceSchema, type Appearance }

export class AppearanceService {
  constructor(private pool: Pool) {}
  async get(user: UserProfile): Promise<{ appearance: Appearance | null }> {
    const { rows } = await this.pool.query(
      "SELECT preferences->'appearance' AS appearance FROM personal_workspaces WHERE user_id=$1",
      [user.id],
    )
    const parsed = appearanceSchema.safeParse(rows[0]?.appearance)
    return { appearance: parsed.success ? parsed.data : null }
  }
  save(user: UserProfile, appearance: Appearance | null) {
    return transaction(this.pool, async (client) => {
      await client.query(
        'INSERT INTO personal_workspaces (user_id,state) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [user.id, emptyWorkspace()],
      )
      // O lock da linha é o mesmo usado pelas ações do espaço pessoal; nenhuma das duas sobrescreve a outra.
      await client.query('SELECT 1 FROM personal_workspaces WHERE user_id=$1 FOR UPDATE', [user.id])
      await client.query(
        appearance
          ? "UPDATE personal_workspaces SET preferences=jsonb_set(COALESCE(preferences,'{}'),'{appearance}',$2::jsonb),updated_at=now() WHERE user_id=$1"
          : "UPDATE personal_workspaces SET preferences=COALESCE(preferences,'{}')-'appearance',updated_at=now() WHERE user_id=$1",
        appearance ? [user.id, JSON.stringify(appearance)] : [user.id],
      )
      return { appearance }
    })
  }
}
