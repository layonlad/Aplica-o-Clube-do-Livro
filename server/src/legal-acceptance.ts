import type { Pool } from 'pg'
import { z } from 'zod'
import { HttpError } from './errors.js'
import { privacyVersion, termsVersion } from './legal-versions.js'

export const legalAcceptanceRoute = '/v1/me/legal-acceptance'

const acceptanceInput = z.object({
  termsVersion: z.string().max(32),
  privacyVersion: z.string().max(32),
  acceptTerms: z.literal(true),
  acknowledgePrivacy: z.literal(true),
}).strict()

export class LegalAcceptance {
  constructor(private pool: Pool) {}

  async require(userId: string) {
    const result = await this.pool.query<{ allowed: boolean }>(
      `SELECT NOT u.legal_review_required OR EXISTS (
        SELECT 1 FROM legal_acceptances a
        WHERE a.user_id=u.id AND a.terms_version=$2 AND a.privacy_version=$3
      ) AS allowed FROM users u WHERE u.id=$1`,
      [userId, termsVersion, privacyVersion],
    )
    if (!result.rows[0]?.allowed) {
      throw new HttpError(428, 'LEGAL_ACCEPTANCE_REQUIRED', 'Leia os termos e a política de privacidade para concluir seu cadastro.')
    }
  }

  async record(userId: string, body: unknown) {
    const input = acceptanceInput.parse(body)
    if (input.termsVersion !== termsVersion || input.privacyVersion !== privacyVersion) {
      throw new HttpError(409, 'LEGAL_VERSION_CHANGED', 'Os documentos foram atualizados. Recarregue a página e revise a versão atual.')
    }
    const versions = [userId, termsVersion, privacyVersion]
    await this.pool.query(
      `INSERT INTO legal_acceptances (user_id, terms_version, privacy_version)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, versions,
    )
    const { rows: [record] } = await this.pool.query<{ acceptedAt: Date }>(
      `SELECT accepted_at AS "acceptedAt" FROM legal_acceptances
       WHERE user_id=$1 AND terms_version=$2 AND privacy_version=$3`, versions,
    )
    return { termsVersion, privacyVersion, acceptedAt: record.acceptedAt }
  }
}
