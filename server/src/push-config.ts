import { createECDH, ECDH } from 'node:crypto'
export function assertPublicPushKey(publicKey: string) {
  try {
    if (!/^[A-Za-z0-9_-]{87}$/.test(publicKey)) throw Error()
    const bytes = Buffer.from(publicKey, 'base64url')
    if (bytes.length !== 65 || bytes[0] !== 4 || ECDH.convertKey(bytes, 'prime256v1').length !== 65)
      throw Error()
  } catch {
    throw Error('Chave pública Web Push inválida.')
  }
}
export function assertVapidConfig(publicKey: string, privateKey: string, subject: string) {
  assertPublicPushKey(publicKey)
  try {
    const uri = new URL(subject)
    if (uri.protocol !== 'https:' || uri.hostname === 'localhost' || uri.username || uri.password)
      throw Error()
    const ecdh = createECDH('prime256v1')
    ecdh.setPrivateKey(Buffer.from(privateKey, 'base64url'))
    if (ecdh.getPublicKey().toString('base64url') !== publicKey) throw Error()
  } catch {
    throw Error('Configuração Web Push inválida ou chaves incompatíveis.')
  }
}
