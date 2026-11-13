// Development-only adapter. The production entrypoint never imports this file.
import {mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {resolve,dirname,sep} from 'node:path'
import type {PrivateStorage} from '../src/private-storage.js'
export function localStorage(directory:string):PrivateStorage{
  if(process.env.FIREBASE_PROJECT_ID!=='demo-clube-do-livro'||!process.env.FIREBASE_AUTH_EMULATOR_HOST)throw Error('Storage de desenvolvimento exige o projeto e o Auth Emulator locais.')
  const root=resolve(directory)
  const path=(key:string)=>{const target=resolve(root,key);if(!target.startsWith(root+sep))throw Error('Caminho de teste inválido.');return target}
  return {
    async put(key,bytes){const target=path(key);await mkdir(dirname(target),{recursive:true,mode:0o700});await writeFile(target,bytes,{mode:0o600})},
    async get(key){return readFile(path(key))},
    async remove(key){await rm(path(key),{force:true})},
  }
}
