import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { applyWorkspaceAction, WorkspaceError, type WorkspaceAction, type WorkspaceSnapshot } from '../../server/src/workspace-model'
import type { Club, Session } from '../../server/src/contracts'
import { useAuth } from '../auth/AuthProvider'
import { ApiError,apiRequest, readableError } from '../auth/api'
import { loadPersonal, savePersonal, secureIndex } from './storage'

interface ContextValue {
  snapshot: WorkspaceSnapshot|null; clubs: Club[]; scope: string; scopeName: string; loading: boolean; busy:boolean; error:string
  setScope:(scope:string)=>void; refresh:()=>Promise<void>; act:(action:WorkspaceAction)=>Promise<boolean>
}
const Context=createContext<ContextValue|null>(null)
export function WorkspaceProvider({children}:{children:ReactNode}) {
  const {user}=useAuth()
  const [scope,setScope]=useState(()=>{if(!user?.emailVerified)return 'personal';try{const saved=sessionStorage.getItem(`clube-livro-scope:${user.uid}`);return saved&&/^[0-9a-f-]{36}$/i.test(saved)?saved:'personal'}catch{return 'personal'}})
  useEffect(()=>{if(user?.emailVerified)try{sessionStorage.setItem(`clube-livro-scope:${user.uid}`,scope)}catch{/* Storage preferences must not prevent reading. */}},[user?.uid,user?.emailVerified,scope])
  const [snapshot,setSnapshot]=useState<WorkspaceSnapshot|null>(null)
  const [clubs,setClubs]=useState<Club[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const current=useRef(snapshot); current.current=snapshot
  const lock=useRef(false)
  const generation=useRef(0)
  const identity=user?.emailVerified?user:null
  const identityRef=useRef(identity);identityRef.current=identity
  const scopeRef=useRef(scope);scopeRef.current=scope
  const refresh=useCallback(async()=>{
    const ticket=++generation.current
    setLoading(true);setError('');setSnapshot(null)
    try {
      if (!identity) {
        const value=await loadPersonal()
        if(ticket===generation.current){setSnapshot(value);setClubs([])}
      } else {
        const session=await apiRequest<Session>(identity,'/me')
        if(ticket!==generation.current)return
        setClubs(session.clubs)
        if(scope!=='personal'&&!session.clubs.some(c=>c.id===scope)){setScope('personal');return}
        const value=await apiRequest<WorkspaceSnapshot>(identity,scope==='personal'?'/me/workspace':`/clubs/${scope}/workspace`)
        if(ticket===generation.current)setSnapshot(value)
      }
    } catch(err){if(ticket===generation.current)setError(readableError(err))}
    finally {if(ticket===generation.current)setLoading(false)}
  },[identity,scope])
  useEffect(()=>{void refresh();return()=>{generation.current++}},[refresh])
  async function act(action:WorkspaceAction) {
    if(lock.current||!current.current)return false
    const ticket=generation.current;const source=current.current
    lock.current=true;setBusy(true);setError('')
    try {
      let next:WorkspaceSnapshot
      if(identity){next=await apiRequest<WorkspaceSnapshot>(identity,scope==='personal'?'/me/workspace':`/clubs/${scope}/workspace`,'POST',{action,version:source.version})}
      else {
        next=applyWorkspaceAction(source,action,{id:'visitor',name:localStorage.getItem('clube-livro-name')?.trim().slice(0,100)||'Você'},{id:crypto.randomUUID(),now:new Date().toISOString(),personal:true,...(action.type==='draw'&&source.state.nominations.length?{drawIndex:secureIndex(source.state.nominations.length)}:{})})
        await savePersonal(next)
      }
      if(ticket===generation.current&&identityRef.current?.uid===identity?.uid&&scopeRef.current===scope){current.current=next;setSnapshot(next)}
      return true
    }catch(err){if(ticket===generation.current){setError(err instanceof WorkspaceError?err.message:readableError(err)); if(err instanceof ApiError&&['WORKSPACE_CHANGED','READING_CHANGED'].includes(err.code)){void refresh().then(()=>{if(identityRef.current?.uid===identity?.uid&&scopeRef.current===scope)setError(err.message)})}}return false}
    finally{lock.current=false;setBusy(false)}
  }
  return <Context.Provider value={{snapshot,clubs,scope,scopeName:scope==='personal'?'Meu espaço':clubs.find(c=>c.id===scope)?.name??'Clube',loading,busy,error,setScope,refresh,act}}>{children}</Context.Provider>
}
export function useWorkspace(){const value=useContext(Context);if(!value)throw Error('WorkspaceProvider ausente');return value}
