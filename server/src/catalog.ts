import { HttpError } from './errors.js'
export interface CatalogEntry {key:string;title:string;author:string;category:string;metadata:{isbn?:string;publisher?:string;language?:string;year?:string;pages?:number;source:string;license:string;cover?:string}}
const cache=new Map<string,{until:number;items:CatalogEntry[]}>()
let nextRequest=0
export async function searchCatalog(query:string,request:typeof fetch=fetch):Promise<CatalogEntry[]>{
  const key=query.trim().toLocaleLowerCase();const hit=cache.get(key)
  if(hit&&hit.until>Date.now())return hit.items
  if(Date.now()<nextRequest)throw new HttpError(429,'CATALOG_BUSY','Aguarde um instante antes de pesquisar novamente.')
  nextRequest=Date.now()+1100
  const url=new URL('https://openlibrary.org/search.json');url.search=new URLSearchParams({q:query,limit:'12',lang:'pt',fields:'key,title,author_name,first_publish_year,isbn,publisher,language,number_of_pages_median,subject,cover_i'}).toString()
  try{
    const response=await request(url,{headers:{'User-Agent':'ClubeDoLivro/0.3 (https://github.com/layonlad/Aplica-o-Clube-do-Livro)'},signal:AbortSignal.timeout(8000)})
    if(!response.ok)throw Error('Catalog unavailable')
    const data=await response.json() as {docs?:Record<string,unknown>[]}
    const string=(value:unknown,max=150)=>typeof value==='string'?value.slice(0,max):''
    const first=(value:unknown,max=150)=>Array.isArray(value)?string(value[0],max):''
    const items=(Array.isArray(data.docs)?data.docs:[]).slice(0,12).flatMap(item=>{
      const work=string(item.key);if(!/^\/works\/OL\d+W$/.test(work)||!string(item.title))return []
      const pages=Number(item.number_of_pages_median)
      return [{key:work,title:string(item.title),author:Array.isArray(item.author_name)?item.author_name.filter((name):name is string=>typeof name==='string').join(', ').slice(0,150)||'Autoria não informada':'Autoria não informada',category:first(item.subject,80),metadata:{isbn:first(item.isbn,32),publisher:first(item.publisher),language:first(item.language,50),year:typeof item.first_publish_year==='number'?String(item.first_publish_year):'',...(Number.isSafeInteger(pages)&&pages>0&&pages<=100000?{pages}:{}),source:'https://openlibrary.org'+work,license:'Referência bibliográfica. Não inclui arquivo nem autorização para distribuir a obra.',...(typeof item.cover_i==='number'&&Number.isSafeInteger(item.cover_i)&&item.cover_i>0?{cover:`https://covers.openlibrary.org/b/id/${item.cover_i}-M.jpg`}:{})}}]
    })
    if(cache.size>=128)cache.delete(cache.keys().next().value!)
    cache.set(key,{until:Date.now()+300000,items});return items
  }catch(error){if(error instanceof HttpError)throw error;throw new HttpError(503,'CATALOG_UNAVAILABLE','O catálogo externo está indisponível. Você pode cadastrar o livro manualmente.')}
}
