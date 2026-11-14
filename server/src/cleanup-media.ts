import { ClubFiles } from './club-files.js'
import { MediaService } from './media-service.js'
import { createPool } from './database.js'
import { PrivateFiles } from './private-files.js'
import { createPrivateStorage } from './private-storage.js'
if (!process.argv.includes('--apply'))
  throw Error(
    'A limpeza altera arquivos excluídos ou uploads abandonados. Execute com --apply somente após revisar a política de retenção.',
  )
if (!process.env.DATABASE_URL) throw Error('DATABASE_URL ausente.')
const storage = createPrivateStorage()
if (!storage) throw Error('Armazenamento privado não configurado.')
const pool = createPool(process.env.DATABASE_URL)
try {
  console.log(
    JSON.stringify({
      clubEpub: await new ClubFiles(pool, storage).cleanup(),
      epub: await new PrivateFiles(pool, storage).cleanup(),
      social: await new MediaService(pool, storage).cleanup(),
    }),
  )
} finally {
  await pool.end()
}
