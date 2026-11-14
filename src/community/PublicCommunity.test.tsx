import {beforeEach,describe,it,expect,vi} from 'vitest'
import {render,screen,waitFor,fireEvent} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {PublicCommunity} from './PublicCommunity'
const mocks=vi.hoisted(()=>({user:null as null|{uid:string;emailVerified:boolean},public:vi.fn(),private:vi.fn(),add:vi.fn()}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>({user:mocks.user})}))
vi.mock('../auth/api',()=>({publicRequest:(...args:unknown[])=>mocks.public(...args),apiRequest:(...args:unknown[])=>mocks.private(...args),readableError:()=> 'Falha ao consultar'}))
vi.mock('../workspace/WorkspaceProvider',()=>({useWorkspace:()=>({snapshot:{state:{books:[]}},addToPersonal:mocks.add})}))
const post={id:'one',body:'Uma reflexão pública',kind:'reflection',bookTitle:'Livro descoberto',bookAuthor:'Autora',quote:'',source:'',version:0,createdAt:'2026-11-13T12:00:00Z',author:{id:'author',name:'Leitora'},likes:2,comments:0,liked:false,saved:false,media:[],options:[],canEdit:false,canDelete:false}
beforeEach(()=>{mocks.user=null;mocks.public.mockReset();mocks.private.mockReset();mocks.add.mockReset();mocks.public.mockImplementation(async(path:string)=>path.endsWith('/comments')?{items:[],nextCursor:null}:{items:[post],nextCursor:null});mocks.add.mockResolvedValue(true)})
describe('comunidade sem cadastro',()=>{
 it('mostra publicações e comentários sem token e reserva participação para login',async()=>{
  render(<MemoryRouter><PublicCommunity/></MemoryRouter>);await screen.findByText('Uma reflexão pública')
  expect(screen.getByRole('button',{name:'Curtir publicação'})).toBeDisabled()
  fireEvent.click(screen.getByRole('button',{name:'0 comentário(s)'}))
  await waitFor(()=>expect(mocks.public).toHaveBeenCalledWith('/public/posts/one/comments'))
  expect(screen.queryByRole('button',{name:'Comentar'})).not.toBeInTheDocument();expect(mocks.private).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Adicionar à minha biblioteca'}));await screen.findByText('Título adicionado à sua biblioteca pessoal.')
  expect(mocks.add).toHaveBeenCalledWith({title:'Livro descoberto',author:'Autora'})
 })
 it('consulta com a identidade atual quando existe conta verificada',async()=>{
  mocks.user={uid:'reader',emailVerified:true};mocks.private.mockResolvedValue({items:[post],nextCursor:null})
  render(<MemoryRouter><PublicCommunity/></MemoryRouter>);await screen.findByText('Uma reflexão pública')
  expect(mocks.private).toHaveBeenCalledWith(mocks.user,'/public/posts?');expect(mocks.public).not.toHaveBeenCalled()
  expect(screen.getByRole('button',{name:'Curtir publicação'})).not.toBeDisabled()
 })
})
