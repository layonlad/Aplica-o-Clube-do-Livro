import { Storage } from '@google-cloud/storage'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { HttpError } from './errors.js'
import type { PrivateStorage } from './private-storage.js'

/** ADC uses the Cloud Run identity. No service-account keys or public URLs. */
export function createGoogleStorage(bucketName: string): PrivateStorage {
  const storage = new Storage({ retryOptions: { maxRetries: 2, totalTimeout: 60 } })
  const bucket = storage.bucket(bucketName)
  const metadata = async (key: string) => {
    try {
      return (await bucket.file(key).getMetadata())[0]
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return null
      throw error
    }
  }
  return {
    async preparePhotoUpload(key, byteSize, contentType, expiresIn = 300) {
      if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > 100000000)
        throw new HttpError(400, 'INVALID_PHOTO_SIZE', 'O tamanho da foto não é permitido.')
      const [policy] = await bucket.file(key).generateSignedPostPolicyV4({
        expires: Date.now() + Math.max(1, Math.min(300, expiresIn)) * 1000,
        fields: {
          'Content-Type': contentType,
          'Cache-Control': 'private, no-store',
          'Content-Disposition': 'attachment',
        },
        conditions: [
          ['content-length-range', byteSize, byteSize],
          ['eq', '$Content-Type', contentType],
          ['eq', '$Cache-Control', 'private, no-store'],
          ['eq', '$Content-Disposition', 'attachment'],
        ],
      })
      return policy
    },
    async photoStatus(key) {
      const value = await metadata(key)
      return value
        ? { byteSize: Number(value.size ?? 0), contentType: value.contentType ?? '' }
        : null
    },
    async copyPhotoToFile(key, path, maxBytes) {
      const value = await metadata(key)
      if (!value || Number(value.size) !== maxBytes || maxBytes > 100000000)
        throw new HttpError(
          400,
          'INVALID_PHOTO_SIZE',
          'O arquivo não corresponde ao envio autorizado.',
        )
      let size = 0
      const bounded = new Transform({
        transform(chunk, _, done) {
          size += chunk.length
          done(
            size > maxBytes
              ? new HttpError(400, 'INVALID_PHOTO_SIZE', 'A foto excedeu o tamanho autorizado.')
              : null,
            chunk,
          )
        },
      })
      // Pin the generation: replacing a staged upload cannot change this download.
      const file = bucket.file(key, { generation: value.generation })
      await pipeline(
        file.createReadStream({ decompress: false, validation: 'crc32c' }),
        bounded,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
        { signal: AbortSignal.timeout(45000) },
      )
      if (size !== maxBytes)
        throw new HttpError(400, 'INVALID_PHOTO_SIZE', 'O envio da foto ficou incompleto.')
      return { byteSize: size, contentType: value.contentType ?? '' }
    },
    async put(key, bytes, contentType = 'application/epub+zip') {
      await bucket.file(key).save(bytes, {
        resumable: false,
        validation: 'crc32c',
        timeout: 20000,
        metadata: {
          contentType,
          cacheControl: 'private, no-store',
          contentDisposition: 'attachment',
        },
      })
    },
    async get(key) {
      const value = await metadata(key)
      if (!value || !Number(value.size) || Number(value.size) > 10000000)
        throw Error('Arquivo indisponível ou maior que o limite')
      const [bytes] = await bucket
        .file(key, { generation: value.generation })
        .download({ validation: 'crc32c', decompress: false })
      if (bytes.length !== Number(value.size) || bytes.length > 10000000)
        throw Error('Arquivo indisponível ou maior que o limite')
      return bytes
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true })
    },
  }
}
