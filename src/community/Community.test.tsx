import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach,expect,it,vi} from 'vitest'
import {ClubWall,PostComposer} from './ClubWall'
import {ClubGallery} from './ClubGallery'
import {apiRequest,ApiError} from '../auth/api'
const {context,auth}=vi.hoisted(()=>({context:{scope:'club-a',scopeName:'Clube A',snapshot:{role:'member',actorId:'reader',state:{books:[],events:[]}}},auth:{user:{uid:'local-reader',displayName:'Leitora',emailVerified:true}}}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('../workspace/WorkspaceProvider',()=>({useWorkspace:()=>context}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
vi.mock('./PrivateMedia',()=>({PrivateMedia:({alt}:{alt:string})=><span>{alt}</span>,MediaPicker:()=>null}))
beforeEach(()=>{vi.mocked(apiRequest).mockReset();context.scope='club-a';context.scopeName='Clube A'})
it('publica no clube escolhido sem enviar identidade ou público controlados pelo navegador',async()=>{
  const user=userEvent.setup(),published=vi.fn();vi.mocked(apiRequest).mockResolvedValue({id:'post'})
  render(<MemoryRouter><PostComposer clubId="club-a" onPublished={published}/></MemoryRouter>)
  await user.click(screen.getByRole('button',{name:/O que sua leitura despertou/}))
  await user.type(screen.getByLabelText('Sua mensagem'),'Uma descoberta entre leitores.')
  await user.click(screen.getByRole('button',{name:'Publicar no clube'}))
  expect(apiRequest).toHaveBeenCalledWith(auth.user,'/clubs/club-a/posts','POST',expect.objectContaining({body:'Uma descoberta entre leitores.',kind:'reflection'}))
  const payload=vi.mocked(apiRequest).mock.calls[0][3] as Record<string,unknown>
  expect(payload).not.toHaveProperty('authorUserId');expect(payload).not.toHaveProperty('audience');expect(published).toHaveBeenCalledTimes(1)
})
it('mantém o rascunho quando a persistência falha',async()=>{
  const user=userEvent.setup(),published=vi.fn();vi.mocked(apiRequest).mockRejectedValue(new ApiError(503,'UNAVAILABLE','Não foi possível publicar.'))
  render(<MemoryRouter><PostComposer clubId="club-a" onPublished={published}/></MemoryRouter>)
  await user.click(screen.getByRole('button',{name:/O que sua leitura despertou/}));await user.type(screen.getByLabelText('Sua mensagem'),'Meu rascunho privado.');await user.click(screen.getByRole('button',{name:'Publicar no clube'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível publicar.');expect(screen.getByLabelText('Sua mensagem')).toHaveValue('Meu rascunho privado.');expect(published).not.toHaveBeenCalled()
})
it('descarta resposta atrasada do clube anterior ao trocar de espaço',async()=>{
  let finish:(value:unknown)=>void=()=>{}
  vi.mocked(apiRequest).mockImplementation((_user,path)=>path.includes('/club-a/')?new Promise(resolve=>{finish=resolve}):Promise.resolve({items:[],nextCursor:null}))
  const view=render(<MemoryRouter><ClubWall/></MemoryRouter>);await waitFor(()=>expect(apiRequest).toHaveBeenCalled())
  context.scope='club-b';context.scopeName='Clube B';view.rerender(<MemoryRouter><ClubWall/></MemoryRouter>)
  await screen.findByText(/O mural de Clube B/)
  await act(async()=>finish({items:[{id:'old-post',body:'Mensagem privada do clube anterior'}],nextCursor:null}))
  expect(screen.queryByText('Mensagem privada do clube anterior')).not.toBeInTheDocument()
})
it('só exibe identificação na foto depois do aceite e da confirmação do servidor',async()=>{
  const user=userEvent.setup(),album={id:'album',title:'Encontro local',description:'',eventDate:'2026-11-13',canUpload:false,canManage:false,allowDownload:false},photo={id:'photo',kind:'image',width:80,height:60,duration:null,caption:'Registro local',addedBy:{id:'author',name:'Autora'},tags:[],myPendingTag:true,canRemove:false,postId:'photo-post',likes:0,liked:false}
  vi.mocked(apiRequest).mockImplementation((_user,path,method)=>{
    if(method==='POST')return Promise.resolve({accepted:true})
    if(path.endsWith('/photos/photo'))return Promise.resolve({...photo,tags:[{id:'reader',name:'Pessoa marcada'}],myPendingTag:false})
    if(path.endsWith('/photos'))return Promise.resolve({items:[photo],nextCursor:null})
    return Promise.resolve(album)
  })
  render(<MemoryRouter initialEntries={['/app/gallery?album=album']}><ClubGallery/></MemoryRouter>)
  expect(await screen.findByText('Você foi identificado neste registro. Permitir que seu nome apareça?')).toBeInTheDocument();expect(screen.queryByText('Com Pessoa marcada')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'Permitir meu nome'}))
  expect(await screen.findByText('Com Pessoa marcada')).toBeInTheDocument();expect(apiRequest).toHaveBeenCalledWith(auth.user,'/clubs/club-a/albums/album/photos/photo/consent','POST',{accept:true})
})
