import {z} from 'zod'
import {HttpError} from './errors.js'
export const pageInput=z.object({limit:z.coerce.number().int().min(1).max(50).default(20),cursor:z.string().max(512).optional()})
const cursorInput=z.object({time:z.string().min(10).max(60).refine(value=>Number.isFinite(Date.parse(value))),id:z.uuid()}).strict()
export function decodeCursor(value?:string){
  if(!value)return undefined
  try{return cursorInput.parse(JSON.parse(Buffer.from(value,'base64url').toString('utf8')))}catch{throw new HttpError(400,'INVALID_CURSOR','A página informada é inválida.')}
}
export function pageOf<T extends {sortTime:string;id:string}>(rows:T[],limit:number){
  const more=rows.length>limit,items=rows.slice(0,limit),last=items.at(-1)
  return {items:items.map(({sortTime:_,...item})=>item),nextCursor:more&&last?Buffer.from(JSON.stringify({time:last.sortTime,id:last.id})).toString('base64url'):null}
}
