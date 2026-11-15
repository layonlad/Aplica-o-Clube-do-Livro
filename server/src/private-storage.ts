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
import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import { HttpError } from './errors.js'
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
  if (bytes.length < 4 || bytes.length > 10000000 || bytes.readUInt32LE(0) !== 0x04034b50)
    throw new HttpError(400, 'INVALID_EPUB', 'Selecione um EPUB válido de até 10 MB.')
  let count = 0,
    total = 0,
    failure = false,
    mime = '',
    container = '',
    encrypted = false
  const names = new Set<string>()
  const zip = new Unzip((file) => {
    names.add(file.name)
    if (++count > 1500 || (file.originalSize ?? 0) > 3000000) {
      failure = true
      return
    }
    if (!['mimetype', 'META-INF/container.xml', 'META-INF/encryption.xml'].includes(file.name))
      return
    if (file.name === 'META-INF/encryption.xml') {
      encrypted = true
      return
    }
    const parts: Uint8Array[] = []
    let length = 0
    file.ondata = (error, chunk, final) => {
      total += chunk.length
      length += chunk.length
      if (error || total > 3000000) {
        failure = true
        file.terminate()
        return
      }
      parts.push(chunk)
      if (final) {
        const value = new Uint8Array(length)
        let offset = 0
        for (const part of parts) {
          value.set(part, offset)
          offset += part.length
        }
        if (file.name === 'mimetype') mime = strFromU8(value)
        else container = strFromU8(value)
      }
    }
    file.start()
  })
  zip.register(UnzipInflate)
  try {
    for (let offset = 0; offset < bytes.length; offset += 4096) {
      zip.push(bytes.subarray(offset, offset + 4096), offset + 4096 >= bytes.length)
      if (failure) break
    }
  } catch {
    failure = true
  }
  const path = /\bfull-path\s*=\s*["']([^"']+)["']/.exec(container)?.[1]
  if (
    failure ||
    encrypted ||
    mime.trim() !== 'application/epub+zip' ||
    !path ||
    !names.has(path) ||
    path.startsWith('/') ||
    path.split('/').includes('..') ||
    !/\.opf$/i.test(path) ||
    /<!DOCTYPE|<!ENTITY/i.test(container)
  )
    throw new HttpError(
      400,
      'INVALID_EPUB',
      'O arquivo não tem estrutura EPUB suportada ou usa conteúdo protegido.',
    )
}
