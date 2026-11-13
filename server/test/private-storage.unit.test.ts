import {expect,it} from 'vitest'
import {strToU8,zipSync} from 'fflate'
import {validateEpub,createPrivateStorage} from '../src/private-storage.js'
export const epubFixture=()=>Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'),'book.opf':strToU8('<package/>')}))
it('recusa assinatura inválida, ZIP genérico, manifesto ausente e conteúdo criptografado',()=>{
  for(const bytes of [Buffer.from('x'),Buffer.from('<html/>'),Buffer.from(zipSync({'a.txt':strToU8('Texto')})),Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<rootfile full-path="missing.opf"/>')})),Buffer.from(zipSync({'mimetype':strToU8('application/epub+zip'),'META-INF/container.xml':strToU8('<rootfile full-path="book.opf"/>'),'book.opf':strToU8('<package/>'),'META-INF/encryption.xml':strToU8('<encryption/>')}))])expect(()=>validateEpub(bytes)).toThrow()
  expect(()=>validateEpub(epubFixture())).not.toThrow()
})
it('não habilita storage por acidente e recusa configuração incompleta ou insegura',()=>{
  expect(createPrivateStorage({})).toBeUndefined()
  expect(()=>createPrivateStorage({MEDIA_BUCKET:'private'})).toThrow('incompleta')
  expect(()=>createPrivateStorage({MEDIA_BUCKET:'private',AWS_ENDPOINT_URL_S3:'http://storage.example',AWS_REGION:'us-east-1',AWS_ACCESS_KEY_ID:'fake',AWS_SECRET_ACCESS_KEY:'fake'})).toThrow('HTTPS')
})
