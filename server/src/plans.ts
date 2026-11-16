/**
 * Planos do app e o que cada um permite.
 * Hoje todas as contas estão no plano gratuito; quando houver assinatura, `planOf` passa a ler o plano
 * da conta e nada mais precisa mudar nas regras de limite.
 */
export const plans = {
  gratuito: { label: 'Gratuito', epubFiles: 30 },
  assinatura: { label: 'Assinatura', epubFiles: 50 },
  premium: { label: 'Premium', epubFiles: 100 },
} as const

export type PlanId = keyof typeof plans

export function planOf(_userId: string): PlanId {
  return 'gratuito'
}

export function epubLimit(userId: string) {
  const plan = planOf(userId)
  return { plan, label: plans[plan].label, limit: plans[plan].epubFiles }
}
