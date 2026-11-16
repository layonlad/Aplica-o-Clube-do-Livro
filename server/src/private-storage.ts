import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { createWriteStream } from 'node:fs'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { openEpubPackage } from './epub-package.js'
import { HttpError } from './errors.js'
import { createGoogleStorage } from './google-storage.js'
export interface PrivateStorage {
  put(key: string, bytes: Buffer, contentType?: string): Promise<void>
  get(key: string): Promise<Uint8Array>
  remove(key: string): Promise<void>
  preparePhotoUpload?(
    key: string,
    byteSize: number,
    contentType: string,
    expiresIn?: number,
  ): Promise<{ url: string; fields: Record<string, string> }>
  photoStatus?(key: string): Promise<{ byteSize: number; contentType: string } | null>
  copyPhotoToFile?(
    key: string,
    path: string,
    maxBytes: number,
  ): Promise<{ byteSize: number; contentType: string }>
}
export function createPrivateStorage(
  env: NodeJS.ProcessEnv = process.env,
): PrivateStorage | undefined {
  if (!env.MEDIA_BUCKET) return undefined
  if (env.MEDIA_PROVIDER === 'gcs') return createGoogleStorage(env.MEDIA_BUCKET)
  if (env.MEDIA_PROVIDER && env.MEDIA_PROVIDER !== 's3') throw Error('Provedor de armazenamento inválido.')
  for (const key of [
    'AWS_ENDPOINT_URL_S3',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
  ])
    if (!env[key]) throw Error('Configuração de armazenamento privado incompleta.')
  const endpoint = new URL(env.AWS_ENDPOINT_URL_S3!)
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
    throw Error('Armazenamento privado exige endpoint HTTPS.')
  const s3 = new S3Client({
    endpoint: endpoint.origin,
    region: env.AWS_REGION,
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  })
  const bucket = env.MEDIA_BUCKET
  return {
    async preparePhotoUpload(key, byteSize, contentType, expiresIn = 300) {
      return createPresignedPost(s3, {
        Bucket: bucket,
        Key: key,
        Expires: Math.max(1, Math.min(300, expiresIn)),
        Fields: {
          'Content-Type': contentType,
          'Cache-Control': 'private, no-store',
          'Content-Disposition': 'attachment',
        },
        Conditions: [
          ['content-length-range', byteSize, byteSize],
          ['eq', '$Content-Type', contentType],
          ['eq', '$Cache-Control', 'private, no-store'],
          ['eq', '$Content-Disposition', 'attachment'],
        ],
      })
    },
    async photoStatus(key) {
      try {
        const object = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(10000),
        })
        return { byteSize: object.ContentLength ?? 0, contentType: object.ContentType ?? '' }
      } catch (error) {
        if (
          (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
        )
          return null
        throw error
      }
    },
    async copyPhotoToFile(key, path, maxBytes) {
      const signal = AbortSignal.timeout(45000)
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: signal,
      })
      if (!object.Body || object.ContentLength !== maxBytes || maxBytes > 100000000)
        throw new HttpError(
          400,
          'INVALID_PHOTO_SIZE',
          'O arquivo enviado não corresponde ao tamanho autorizado.',
        )
      let size = 0
      const bounded = new Transform({
        transform(chunk, _, done) {
          size += chunk.length
          if (size > maxBytes)
            done(new HttpError(400, 'INVALID_PHOTO_SIZE', 'O arquivo excedeu o envio autorizado.'))
          else done(null, chunk)
        },
      })
      await pipeline(
        object.Body as import('node:stream').Readable,
        bounded,
        createWriteStream(path, { flags: 'wx', mode: 0o600 }),
        { signal },
      )
      if (size !== maxBytes)
        throw new HttpError(400, 'INVALID_PHOTO_SIZE', 'O envio da foto ficou incompleto.')
      return { byteSize: size, contentType: object.ContentType ?? '' }
    },
    async put(key, bytes, contentType = 'application/epub+zip') {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: contentType,
          CacheControl: 'private, no-store',
          ContentDisposition: 'attachment',
        }),
        { abortSignal: AbortSignal.timeout(20000) },
      )
    },
    async get(key) {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(20000),
      })
      if (!object.Body || !object.ContentLength || object.ContentLength > 10000000)
        throw Error('Arquivo indisponível ou maior que o limite')
      return object.Body.transformToByteArray()
    },
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(20000),
      })
    },
  }
}
export function validateEpub(bytes: Buffer) {
  try {
    openEpubPackage(bytes, false)
  } catch (error) {
    throw new HttpError(
      400,
      'INVALID_EPUB',
      error instanceof Error ? error.message : 'Arquivo EPUB inválido.',
    )
  }
}
