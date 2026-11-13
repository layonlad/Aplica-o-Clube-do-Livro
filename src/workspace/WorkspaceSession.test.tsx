import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,expect,it,vi} from 'vitest'
import {WorkspaceApp} from './WorkspaceApp'
import {ThemeProvider} from '../app/ThemeProvider'
import {apiRequest,ApiError} from '../auth/api'
const {state}=vi.hoisted(()=>({state:{user:{uid:'expired-local-reader',email:'local@example.com',emailVerified:true} as {uid:string;email:string;emailVerified:boolean}|null,loading:false,signOut:vi.fn(async()=>{})}}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>state,AuthProvider:({children}:{children:React.ReactNode})=>children}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
beforeEach(()=>{state.user={uid:'expired-local-reader',email:'local@example.com',emailVerified:true};state.signOut.mockReset();vi.mocked(apiRequest).mockReset()})
it('permite entrar novamente quando a API rejeita a sessão antes de carregar o espaço',async()=>{
  const user=userEvent.setup();vi.mocked(apiRequest).mockRejectedValue(new ApiError(401,'INVALID_SESSION','Sua sessão foi revogada.'))
  state.signOut.mockImplementation(async()=>{state.user=null})
  render(<MemoryRouter initialEntries={['/app']}><ThemeProvider><WorkspaceApp/></ThemeProvider></MemoryRouter>)
  await user.click(await screen.findByRole('button',{name:'Entrar novamente'}))
  expect(state.signOut).toHaveBeenCalledTimes(1);expect(await screen.findByRole('heading',{name:'Bom ter você aqui'})).toBeInTheDocument()
})

it('salva um livro no espaço da conta autenticada',async()=>{
  const user=userEvent.setup(),empty={state:{books:[],currentBookId:null,events:[],topics:[],nominations:[],draws:[]},reading:{},version:0,role:'owner',actorId:'account-reader'}
  vi.mocked(apiRequest).mockImplementation((_user,path,method)=>{
    if(path==='/me')return Promise.resolve({user:{id:'account-reader',name:'Leitora',email:'local@example.com'},clubs:[]})
    if(method==='POST')return Promise.resolve({...empty,version:1,state:{...empty.state,books:[{id:'11111111-1111-4111-8111-111111111111',title:'Livro da conta',author:'Autora',category:'',content:'',createdBy:'account-reader',createdAt:'2026-11-13T12:00:00Z'}]}})
    return Promise.resolve(empty)
  })
  render(<MemoryRouter initialEntries={['/app/library']}><ThemeProvider><WorkspaceApp/></ThemeProvider></MemoryRouter>)
  await user.click(await screen.findByRole('button',{name:'Adicionar livro'}));await user.type(screen.getByLabelText('Título'),'Livro da conta');await user.type(screen.getByLabelText('Autor'),'Autora');await user.click(screen.getByRole('button',{name:'Salvar livro'}))
  expect(await screen.findByRole('heading',{name:'Livro da conta'})).toBeInTheDocument();expect(apiRequest).toHaveBeenCalledWith(state.user,'/me/workspace','POST',expect.objectContaining({action:expect.objectContaining({type:'book.add',title:'Livro da conta'})}))
})
