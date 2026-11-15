import { S3Client, GetBucketCorsCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3'
// Explicitly run only after deployment approval. This does not make the bucket public.
const origin = new URL(process.env.FRONTEND_ORIGIN ?? '')
if (origin.protocol !== 'https:' || origin.origin !== process.env.FRONTEND_ORIGIN)
  throw Error('Configure a origem HTTPS exata do aplicativo.')
if (!process.env.MEDIA_BUCKET || !process.env.AWS_ENDPOINT_URL_S3)
  throw Error('Armazenamento não configurado.')
const endpoint = new URL(process.env.AWS_ENDPOINT_URL_S3)
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
  throw Error('Endpoint inválido.')
for (const key of ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'])
  if (!process.env[key]) throw Error('Credencial de armazenamento incompleta.')
const config = {
  CORSRules: [
    {
      ID: 'clube-photo-browser',
      AllowedOrigins: [origin.origin],
      AllowedMethods: ['POST'],
      AllowedHeaders: ['content-type'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 300,
    },
  ],
}
if (!process.argv.includes('--apply'))
  console.log(JSON.stringify({ dryRun: true, bucket: process.env.MEDIA_BUCKET, cors: config }))
else {
  const client = new S3Client({
    endpoint: endpoint.origin,
    region: process.env.AWS_REGION,
    forcePathStyle: true,
    maxAttempts: 1,
  })
  try {
    let previous: import('@aws-sdk/client-s3').CORSRule[] = []
    try {
      previous =
        (await client.send(new GetBucketCorsCommand({ Bucket: process.env.MEDIA_BUCKET })))
          .CORSRules ?? []
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404)
        throw error
    }
    const merged = {
      CORSRules: [
        ...previous.filter((rule) => rule.ID !== 'clube-photo-browser'),
        ...config.CORSRules,
      ],
    }
    if (merged.CORSRules.length > 100) throw Error('Revise as regras existentes de CORS.')
    await client.send(
      new PutBucketCorsCommand({ Bucket: process.env.MEDIA_BUCKET, CORSConfiguration: merged }),
    )
    console.log('CORS de upload configurado para a origem aprovada; regras anteriores preservadas.')
  } finally {
    client.destroy()
  }
}
