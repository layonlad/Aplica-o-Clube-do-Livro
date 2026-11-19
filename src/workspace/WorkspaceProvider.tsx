import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { type WorkspaceAction, type WorkspaceSnapshot } from '../../server/src/workspace-model'
import type { Club, Session } from '../../server/src/contracts'
import { useAuth } from '../auth/AuthProvider'
import { ApiError,apiRequest, readableError } from '../auth/api'
import { sessionEnded } from '../auth/session-events'

interface ContextValue {
  publicModerator:boolean; snapshot: WorkspaceSnapshot|null; clubs: Club[]; scope: string; scopeName: string; loading: boolean; busy:boolean; error:string;errorCode:string
  addToPersonal:(book:{title:string;author:string;category?:string;metadata?:import('../../server/src/workspace-model').WorkspaceState['books'][number]['metadata']})=>Promise<boolean>
  setScope:(scope:string)=>void; refresh:(soft?:boolean)=>Promise<void>; act:(action:WorkspaceAction,onSaved?:(snapshot:WorkspaceSnapshot)=>void,options?:{quiet?:boolean})=>Promise<boolean>
}
const Context=createContext<ContextValue|null>(null)
export function WorkspaceProvider({children}:{children:ReactNode}) {
  const auth=useAuth()
  const {user}=auth
  const initialAccount=useRef(auth.status==='authenticated'?auth.accountSession:undefined)
  const [scope,setScope]=useState(()=>{if(!user?.emailVerified)return 'personal';try{const saved=sessionStorage.getItem(`clube-livro-scope:${user.uid}`);return saved&&/^[0-9a-f-]{36}$/i.test(saved)?saved:'personal'}catch{return 'personal'}})
  useEffect(()=>{if(user?.emailVerified)try{sessionStorage.setItem(`clube-livro-scope:${user.uid}`,scope)}catch{/* Storage preferences must not prevent reading. */}},[user?.uid,user?.emailVerified,scope])
  const [snapshot,setSnapshot]=useState<WorkspaceSnapshot|null>(null)
  const [publicModerator,setPublicModerator]=useState(false)
  const [clubs,setClubs]=useState<Club[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [errorCode,setErrorCode]=useState('')
  const current=useRef(snapshot); current.current=snapshot
  const lock=useRef(false)
  const generation=useRef(0)
  const identity=user?.emailVerified?user:null
  const identityRef=useRef(identity);identityRef.current=identity
  const scopeRef=useRef(scope);scopeRef.current=scope
  // soft: atualiza os dados sem desmontar a tela aberta (usado depois de um conflito ao salvar, ex.: no leitor).
  const refresh=useCallback(async(soft=false)=>{
    const ticket=++generation.current
    const account=identityRef.current
    if(!soft){setLoading(true);setSnapshot(null)}
    setError('');setErrorCode('')
    try {
      if (!account || sessionEnded(account)) return
      const session = initialAccount.current ?? await apiRequest<Session>(account, '/me')
      if (ticket !== generation.current) return
      setClubs(session.clubs)
      setPublicModerator(!!session.publicModerator)
      if (scope !== 'personal' && !session.clubs.some((club) => club.id === scope)) {
        setScope('personal')
        return
      }
      const value = await apiRequest<WorkspaceSnapshot>(account, scope === 'personal'
        ? '/me/workspace' : `/clubs/${scope}/workspace?view=app`)
      if (ticket === generation.current) { initialAccount.current = undefined; current.current = value; setSnapshot(value) }
    } catch(err){if(ticket===generation.current){setError(readableError(err));setErrorCode(err instanceof ApiError?(err.status===401?'AUTH_REQUIRED':err.code):'')}}
    finally {if(ticket===generation.current&&!soft)setLoading(false)}
  },[identity?.uid,scope])
  useEffect(()=>{void refresh(false);return()=>{generation.current++}},[refresh])
  async function act(action:WorkspaceAction,onSaved?:(snapshot:WorkspaceSnapshot)=>void,options:{quiet?:boolean}={}) {
    if (!identity || sessionEnded(identity) || scopeRef.current !== scope || lock.current || !current.current) return false
    const ticket=generation.current;const source=current.current
    lock.current=true;setBusy(true);setError('');setErrorCode('')
    try {
      const next = await apiRequest<WorkspaceSnapshot>(identity, scope === 'personal'
        ? '/me/workspace' : `/clubs/${scope}/workspace?view=app`, 'POST', { action, version: source.version })
      if(ticket===generation.current&&identityRef.current?.uid===identity?.uid&&scopeRef.current===scope){current.current=next;setSnapshot(next);onSaved?.(next)}
      return true
    }catch(err){if(ticket===generation.current){const conflict=err instanceof ApiError&&['WORKSPACE_CHANGED','READING_CHANGED'].includes(err.code);if(!options.quiet){setErrorCode(err instanceof ApiError?(err.status===401?'AUTH_REQUIRED':err.code):'');setError(readableError(err))} if(conflict){void refresh(true).then(()=>{if(!options.quiet&&identityRef.current?.uid===identity?.uid&&scopeRef.current===scope)setError((err as ApiError).message)})}}return false}
    finally{lock.current=false;setBusy(false)}
  }
  async function addToPersonal(book:{title:string;author:string;category?:string;metadata?:import('../../server/src/workspace-model').WorkspaceState['books'][number]['metadata']}){
    const account=identityRef.current,sourceScope=scopeRef.current
    if (!account || sessionEnded(account) || lock.current) return false
    lock.current=true;setBusy(true);setError('')
    try{
      const source=await apiRequest<WorkspaceSnapshot>(account, '/me/workspace')
      if(source.state.books.some(item=>item.title.toLocaleLowerCase()===book.title.toLocaleLowerCase()&&item.author.toLocaleLowerCase()===book.author.toLocaleLowerCase()))return true
      const action:WorkspaceAction={type:'book.add',title:book.title,author:book.author||'Autor não informado',category:book.category??'',content:'',metadata:book.metadata}
      const next = await apiRequest<WorkspaceSnapshot>(account, '/me/workspace', 'POST', { action, version: source.version })
      if(identityRef.current?.uid===account?.uid&&scopeRef.current===sourceScope&&sourceScope==='personal'){current.current=next;setSnapshot(next)}
      return true
    }catch(err){if(identityRef.current?.uid===account?.uid)setError(readableError(err));return false}finally{lock.current=false;setBusy(false)}
  }
  return <Context.Provider value={{publicModerator,snapshot,clubs,scope,scopeName:scope==='personal'?'Meu espaço':clubs.find(c=>c.id===scope)?.name??'Clube',loading,busy,error,errorCode,setScope,refresh,act,addToPersonal}}>{children}</Context.Provider>
}
export function useWorkspace(){const value=useContext(Context);if(!value)throw Error('WorkspaceProvider ausente');return value}
