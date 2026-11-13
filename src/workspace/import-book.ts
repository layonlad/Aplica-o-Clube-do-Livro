import { Unzip, UnzipInflate, strFromU8 } from 'fflate'
import type { z } from 'zod'
import type { bookMetadataSchema, chapterSchema } from '../../server/src/workspace-model'
export interface ImportedBook {title:string;author:string;content:string;metadata?:z.infer<typeof bookMetadataSchema>;chapters?:z.infer<typeof chapterSchema>[]}

function xml(value:string){if(/<!\s*ENTITY\b/i.test(value))throw Error('O EPUB contém entidades XML não suportadas.');const safe=value.replace(/<!DOCTYPE[\s\S]*?>/gi,'');const doc=new DOMParser().parseFromString(safe,'application/xml');if(doc.querySelector('parsererror'))throw Error('O EPUB contém um documento inválido.');return doc}
export async function importBook(file:File):Promise<ImportedBook> {
  if(file.size>10000000)throw Error('Escolha um arquivo de até 10 MB.')
  if(/\.txt$/i.test(file.name)) {
    const content=(await file.text()).trim()
    if(!content||content.length>600000)throw Error('O texto deve ter entre 1 e 600 mil caracteres.')
    return {title:file.name.replace(/\.txt$/i,''),author:'Autoria não informada',content}
  }
  if(!/\.epub$/i.test(file.name))throw Error('Selecione um arquivo EPUB sem DRM ou TXT.')
  const files:Record<string,string>=Object.create(null)
  let total=0,count=0,failure:Error|undefined
  const unzip=new Unzip(entry=>{
    if(++count>1500){failure=Error('O EPUB tem arquivos demais.');return}
    if(!/\.(xml|opf|xhtml|html|htm)$/i.test(entry.name))return
    if((entry.originalSize??0)>3000000){failure=Error('Um capítulo excede o limite de tamanho.');return}
    const chunks:Uint8Array[]=[];let size=0
    entry.ondata=(err,chunk,final)=>{
      if(err){failure=Error('Não foi possível abrir este EPUB.');return}
      total+=chunk.length;size+=chunk.length
      if(total>12000000||size>3000000){failure=Error('O texto descompactado excede o limite.');entry.terminate();return}
      chunks.push(chunk)
      if(final){const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length}files[entry.name]=strFromU8(bytes)}
    };entry.start()
  })
  unzip.register(UnzipInflate)
  const data=new Uint8Array(await file.arrayBuffer())
  for(let pos=0;pos<data.length;pos+=4096){unzip.push(data.subarray(pos,pos+4096),pos+4096>=data.length);if(failure)throw failure}
  const root=files['META-INF/container.xml'];if(!root)throw Error('Arquivo EPUB sem estrutura de publicação.')
  const path=xml(root).getElementsByTagName('rootfile')[0]?.getAttribute('full-path');if(!path||!files[path])throw Error('Índice do EPUB não encontrado.')
  if(files['META-INF/encryption.xml'])throw Error('EPUB com conteúdo protegido não é suportado. Use um arquivo sem DRM.')
  const opf=xml(files[path]);const base=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):''
  const items=new Map(Array.from(opf.getElementsByTagName('item')).map(item=>[item.getAttribute('id'),item.getAttribute('href')]))
  const chapters:string[]=[]
  const outline:z.infer<typeof chapterSchema>[]=[]
  let offset=0
  for(const ref of Array.from(opf.getElementsByTagName('itemref'))){
    const href=items.get(ref.getAttribute('idref'));if(!href)continue
    const url=new URL(href,'https://epub.invalid/'+base)
    if(url.origin!=='https://epub.invalid')continue
    const value=files[decodeURIComponent(url.pathname.slice(1))];if(!value)continue
    const doc=xml(value)
    doc.querySelectorAll('script,style,svg,iframe,object,head').forEach(node=>node.remove())
    const blocks=Array.from(doc.querySelectorAll('h1,h2,h3,p,li,blockquote')).filter(node=>!node.parentElement?.closest('p,li,blockquote'))
    const text=(blocks.length?blocks.map(node=>node.textContent?.trim()).filter(Boolean).join('\n\n'):doc.documentElement.textContent??'').trim()
    if(text){if(chapters.length)offset+=2;outline.push({title:doc.querySelector('h1,h2,h3')?.textContent?.trim().slice(0,200)||`Capítulo ${outline.length+1}`,start:offset,end:offset+text.length});chapters.push(text);offset+=text.length}
  }
  const content=chapters.filter(Boolean).join('\n\n')
  if(!content||content.length>600000)throw Error('O EPUB deve conter texto legível de até 600 mil caracteres.')
  const meta=(name:string)=>opf.getElementsByTagNameNS('*',name)[0]?.textContent?.trim()
  return {title:meta('title')||file.name.replace(/\.epub$/i,''),author:meta('creator')||'Autoria não informada',content,chapters:outline,metadata:{synopsis:meta('description')?.slice(0,3000),publisher:meta('publisher')?.slice(0,150),language:meta('language')?.slice(0,50),year:meta('date')?.slice(0,20),isbn:meta('identifier')?.slice(0,32),license:meta('rights')?.slice(0,500)}}
}

export async function importPhoto(file:File):Promise<string> {
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>10000000)throw Error('Escolha uma imagem JPG, PNG ou WebP de até 10 MB.')
  const bitmap=await createImageBitmap(file)
  try{const ratio=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);const value=canvas.toDataURL('image/jpeg',0.65);if(value.length>220000)throw Error('A imagem é muito detalhada. Selecione uma foto menor.');return value}
  finally{bitmap.close()}
}
