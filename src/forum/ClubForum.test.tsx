import {render,screen} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,expect,it,vi} from 'vitest'
import {ClubForum} from './ClubForum'
import {apiRequest,ApiError} from '../auth/api'
const {auth}=vi.hoisted(()=>({auth:{user:{uid:'forum-reader',displayName:'Leitora',emailVerified:true}}}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('../workspace/WorkspaceProvider',()=>({useWorkspace:()=>({snapshot:{role:'member',state:{books:[]}}})}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
vi.mock('../community/PrivateMedia',()=>({PrivateMedia:()=>null,MediaPicker:()=>null}))
const topic={id:'topic',title:'Uma discussão literária',body:'Trecho com revelações da história.',spoiler:true,bookId:null,bookTitle:'',bookAuthor:'',chapter:'',pinned:false,closed:false,version:0,createdAt:'2026-11-13T12:00:00Z',updatedAt:'2026-11-13T12:00:00Z',author:{id:'author',name:'Uma leitora'},replies:0,likes:0,liked:false,canEdit:false,canDelete:false,canModerate:false,media:[]}
beforeEach(()=>{vi.mocked(apiRequest).mockReset()})
it('revela texto e consulta respostas só depois da escolha explícita de ver spoilers',async()=>{
  const user=userEvent.setup();vi.mocked(apiRequest).mockImplementation((_user,path)=>Promise.resolve(path.endsWith('/replies')?{items:[],nextCursor:null}:topic))
  render(<MemoryRouter initialEntries={['/app/forum?topic=topic']}><ClubForum clubId="club"/></MemoryRouter>)
  expect(await screen.findByRole('button',{name:'Revelar discussão'})).toBeInTheDocument();expect(screen.queryByText(topic.body)).not.toBeInTheDocument();expect(apiRequest).toHaveBeenCalledTimes(1)
  await user.click(screen.getByRole('button',{name:'Revelar discussão'}));expect(await screen.findByText(topic.body)).toBeInTheDocument();expect(apiRequest).toHaveBeenCalledWith(auth.user,'/clubs/club/forum/topics/topic/replies')
})
it('não oferece publicar resposta numa discussão encerrada',async()=>{
  vi.mocked(apiRequest).mockImplementation((_user,path)=>Promise.resolve(path.endsWith('/replies')?{items:[],nextCursor:null}:{...topic,spoiler:false,closed:true}))
  render(<MemoryRouter initialEntries={['/app/forum?topic=topic']}><ClubForum clubId="club"/></MemoryRouter>)
  expect(await screen.findByText('A moderação encerrou esta discussão. As respostas continuam disponíveis para leitura.')).toBeInTheDocument();expect(screen.queryByRole('button',{name:'Publicar resposta'})).not.toBeInTheDocument()
})
it('preserva a reflexão em caso de falha ao persistir a nova discussão',async()=>{
  const user=userEvent.setup();vi.mocked(apiRequest).mockImplementation((_user,_path,method)=>method==='POST'?Promise.reject(new ApiError(503,'UNAVAILABLE','Não foi possível criar a discussão.')):Promise.resolve({items:[],pinned:[],nextCursor:null}))
  render(<MemoryRouter><ClubForum clubId="club"/></MemoryRouter>)
  await user.click(await screen.findByRole('button',{name:'Criar discussão'}));await user.type(screen.getByLabelText('Título da discussão'),'Uma pergunta');await user.type(screen.getByLabelText('Sua reflexão ou pergunta'),'Quero guardar este pensamento.');await user.click(screen.getByRole('button',{name:'Publicar discussão'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível criar a discussão.');expect(screen.getByLabelText('Sua reflexão ou pergunta')).toHaveValue('Quero guardar este pensamento.')
})
