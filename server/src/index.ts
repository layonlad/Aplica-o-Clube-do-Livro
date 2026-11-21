import {createNotificationDispatcher} from './push-dispatcher.js'
import {startMaintenance} from './maintenance.js'
import { readConfig } from './config.js'
import { createPool } from './database.js'
import { createFirebaseVerifier } from './auth.js'
import { buildApp } from './app.js'
import { createPrivateStorage } from './private-storage.js'
import { warmLazyModules } from './lazy-modules.js'

const config = readConfig()
const pool = createPool(config.DATABASE_URL,config.DB_POOL_MAX)
const storage=createPrivateStorage()
const app = await buildApp({ pool, verifyToken: createFirebaseVerifier(config.FIREBASE_PROJECT_ID, config.FIREBASE_WEB_API_KEY), origin: config.FRONTEND_ORIGIN, additionalOrigins:config.FRONTEND_EXTRA_ORIGINS, logger: true,moderatorUids:config.PLATFORM_MODERATOR_UIDS,pushPublicKey:config.PUSH_PUBLIC_KEY,photoCleanupToken:config.PHOTO_CLEANUP_TOKEN,literaryNewsSync:config.LITERARY_NEWS_SYNC,afterSocialMutation:createNotificationDispatcher(pool),storage })
const stopMaintenance=startMaintenance(pool,storage,config.MEDIA_CLEANUP_ENABLED)
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, async () => { stopMaintenance();await app.close(); await pool.end() })
try { await app.listen({ host: config.HOST, port: config.PORT }); warmLazyModules() }
catch { console.error('Não foi possível iniciar a API. Confira a configuração e a porta.'); await pool.end(); process.exitCode = 1 }
