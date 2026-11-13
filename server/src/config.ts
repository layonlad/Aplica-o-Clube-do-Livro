import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(3),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FRONTEND_ORIGIN: z.string().url(),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
})
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(env)
  const origin = new URL(config.FRONTEND_ORIGIN)
  if (origin.origin !== config.FRONTEND_ORIGIN || origin.username || origin.password) {
    throw new Error('FRONTEND_ORIGIN deve conter somente a origem, sem caminho ou barra final.')
  }
  if (!['postgres:', 'postgresql:'].includes(new URL(config.DATABASE_URL).protocol)) {
    throw new Error('DATABASE_URL deve apontar para PostgreSQL.')
  }
  if (config.NODE_ENV === 'production' && (origin.protocol !== 'https:' || config.FIREBASE_PROJECT_ID.startsWith('demo-'))) {
    throw new Error('Produção exige HTTPS e um projeto Firebase real exclusivo.')
  }
  if (config.FIREBASE_AUTH_EMULATOR_HOST && (config.NODE_ENV === 'production' || !config.FIREBASE_PROJECT_ID.startsWith('demo-') || !/^(127\.0\.0\.1|localhost):\d+$/.test(config.FIREBASE_AUTH_EMULATOR_HOST))) {
    throw new Error('O emulador só pode ser usado localmente com projeto demo-.')
  }
  if (config.FIREBASE_PROJECT_ID.startsWith('demo-') && !config.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Projeto demo- exige o emulador local de autenticação.')
  }
  return config
}
