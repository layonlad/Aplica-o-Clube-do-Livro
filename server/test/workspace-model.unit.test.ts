import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { applyWorkspaceAction, emptyWorkspace, preferencesSchema, type WorkspaceAction, type WorkspaceSnapshot } from '../src/workspace-model.js'
const actor={id:randomUUID(),name:'Leitora'}
const create=():WorkspaceSnapshot=>({state:emptyWorkspace(),reading:{},role:'owner',actorId:actor.id,version:0})
function act(value:WorkspaceSnapshot,action:WorkspaceAction,personal=true){return applyWorkspaceAction(value,action,actor,{id:randomUUID(),now:'2026-11-13T12:00:00.000Z',personal})}
function withBook(){return act(create(),{type:'book.add',title:'Uma leitura',author:'Autora',category:'Romance',content:'Um trecho original para testar notas privadas.'})}
describe('evolução compatível da biblioteca',()=>{
  it('mantém os dados antigos e adiciona preferências padrão sem alterar a versão por ação pessoal',()=>{
    let state=withBook();const id=state.state.books[0].id;const version=state.version
    state=act(state,{type:'shelf.add',name:'Literatura brasileira'})
    state=act(state,{type:'reading.update',id,status:'paused',favorite:true,shelf:'Literatura brasileira'})
    expect(state.version).toBe(version);expect(state.preferences?.shelves).toEqual(['Literatura brasileira'])
    expect(state.reading[id]).toMatchObject({status:'paused',favorite:true,shelf:'Literatura brasileira',revision:1})
    state=act(state,{type:'shelf.remove',name:'Literatura brasileira'})
    expect(state.reading[id].shelf).toBe('');expect(state.state.books[0].content).toContain('original')
  })
  it('detecta progresso concorrente sem descartar o progresso já salvo',()=>{
    let state=withBook();const id=state.state.books[0].id
    state=act(state,{type:'reading.update',id,percent:40,locator:3,expectedRevision:0})
    expect(()=>act(state,{type:'reading.update',id,percent:10,expectedRevision:0})).toThrow('outro dispositivo')
    expect(state.reading[id].percent).toBe(40)
    state=act(state,{type:'reading.update',id,status:'finished',expectedRevision:1})
    expect(state.reading[id].percent).toBe(100);expect(state.reading[id].finishedAt).toBeTruthy()
    state=act(state,{type:'reading.update',id,status:'paused',expectedRevision:2})
    expect(state.reading[id].percent).toBe(0);expect(state.reading[id].finishedAt).toBeNull()
  })
  it('vincula anotações ao texto original e não as grava no estado compartilhado',()=>{
    let state=withBook();const id=state.state.books[0].id
    state=act(state,{type:'reading.annotate',id,start:3,end:9,quote:'trecho',note:'Minha observação'},false)
    expect(state.reading[id].annotations?.[0].note).toBe('Minha observação')
    expect(JSON.stringify(state.state)).not.toContain('Minha observação')
    expect(()=>act(state,{type:'reading.annotate',id,start:0,end:6,quote:'trecho',note:''})).toThrow('trecho válido')
  })
  it('permite preferências pessoais a um membro sem conceder edição do acervo',()=>{
    let state=withBook();state.role='member'
    state=act(state,{type:'reader.preferences',reader:{size:24,font:'serif',theme:'sepia',margin:'wide'}},false)
    expect(state.preferences?.reader.theme).toBe('sepia')
    expect(()=>act(state,{type:'book.metadata',id:state.state.books[0].id,title:'Mudado',author:'Outro',category:'',metadata:{}},false)).toThrow('responsável')
  })
  it('preserva preferências ao exportar e importar o espaço pessoal',()=>{
    let state=withBook();state=act(state,{type:'shelf.add',name:'Favoritos do ano'})
    const imported=act(create(),{type:'workspace.import',state:state.state,reading:state.reading,preferences:state.preferences})
    expect(imported.preferences?.shelves).toContain('Favoritos do ano')
    expect(preferencesSchema.parse(undefined).reader.size).toBe(20)
  })
})
