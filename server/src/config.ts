import {assertPublicPushKey,assertVapidConfig} from './push-config.js'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(10).default(10),
  FIREBASE_PROJECT_ID: z.string().min(3),
  FIREBASE_WEB_API_KEY: z.string().min(1).optional(),
  FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
  FRONTEND_ORIGIN: z.string().url(),
  ALLOW_NATIVE_STAGING_ORIGINS: z.enum(['true','false']).default('false').transform(value => value === 'true'),
  FRONTEND_EXTRA_ORIGINS: z.string().default('').transform(value => value.split(',').map(item => item.trim()).filter(Boolean)),
  REQUIRE_LEGAL_ACCEPTANCE: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  LITERARY_NEWS_SYNC:z.enum(['true','false']).default('false').transform(value=>value==='true'),
  MEDIA_CLEANUP_ENABLED:z.enum(['true','false']).default('false').transform(value=>value==='true'),
  PLATFORM_MODERATOR_UIDS: z.string().default('').transform(value=>value.split(',').map(id=>id.trim()).filter(Boolean)).refine(ids=>ids.length<=10&&ids.every(id=>/^[A-Za-z0-9_-]{1,128}$/.test(id))),
  PHOTO_CLEANUP_TOKEN:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  PUSH_PRIVATE_KEY:z.string().regex(/^[A-Za-z0-9_-]{43}$/).optional(),
  PUSH_SUBJECT:z.url().startsWith('https://').optional(),
  PUSH_PUBLIC_KEY:z.string().regex(/^[A-Za-z0-9_-]{87}$/).optional(),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
})
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = schema.parse(env)
  const origin = new URL(config.FRONTEND_ORIGIN)
  if (origin.origin !== config.FRONTEND_ORIGIN || origin.username || origin.password) {
    throw new Error('FRONTEND_ORIGIN deve conter somente a origem, sem caminho ou barra final.')
  }
  if (config.FRONTEND_EXTRA_ORIGINS.length > 3 || config.FRONTEND_EXTRA_ORIGINS.some(value => {
    try { const url = new URL(value); return url.origin !== value || !!url.username || !!url.password || url.protocol !== 'https:' }
    catch { return true }
  })) throw new Error('Origens adicionais exigem até três origens HTTPS exatas.')
  if (config.ALLOW_NATIVE_STAGING_ORIGINS) {
    if (config.NODE_ENV !== 'development' ||
        ['gen-lang-client-0194308411', 'project-acb850f4-4bb8-45de-a84'].includes(config.FIREBASE_PROJECT_ID)) {
      throw new Error('Origens de WebView são exclusivas da API de staging.')
    }
    config.FRONTEND_EXTRA_ORIGINS = [...new Set([...config.FRONTEND_EXTRA_ORIGINS, 'capacitor://localhost', 'https://localhost'])]
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
  if(config.PUSH_PRIVATE_KEY&&(!config.PUSH_PUBLIC_KEY||!config.PUSH_SUBJECT))throw Error('Configuração VAPID incompleta.')
  if(config.PUSH_PUBLIC_KEY)assertPublicPushKey(config.PUSH_PUBLIC_KEY)
  if(config.PUSH_PRIVATE_KEY)assertVapidConfig(config.PUSH_PUBLIC_KEY!,config.PUSH_PRIVATE_KEY,config.PUSH_SUBJECT!)
  return config
}
