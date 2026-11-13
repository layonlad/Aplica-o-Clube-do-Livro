import {act,cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {MemoryRouter} from 'react-router-dom'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {ClubForum} from './ClubForum'
import {apiRequest} from '../auth/api'
const {auth}=vi.hoisted(()=>({auth:{user:{uid:'same-local-reader',displayName:'Leitora',emailVerified:true,getIdToken:async()=> 'local-test-token'}}}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('../workspace/WorkspaceProvider',()=>({useWorkspace:()=>({snapshot:{role:'member',state:{books:[]}}})}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
const topic={id:'topic',title:'Uma conversa',body:'Um pensamento',spoiler:false,bookId:null,bookTitle:'',bookAuthor:'',chapter:'',pinned:false,closed:false,version:0,createdAt:'2026-11-13T12:00:00Z',updatedAt:'2026-11-13T12:00:00Z',author:{id:'author',name:'Autora'},replies:0,likes:0,liked:false,canEdit:false,canDelete:false,canModerate:false,media:[]}
beforeEach(()=>{vi.mocked(apiRequest).mockReset();vi.stubEnv('VITE_API_URL','http://localhost:3001');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([0]),{status:200})));vi.stubGlobal('URL',class extends URL {static createObjectURL(){return 'blob:local-test'}static revokeObjectURL(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs()})
it('mantém a resposta e o upload quando a sessão renova sem trocar o usuário',async()=>{
  let finish:(value:unknown)=>void=()=>{};const user=userEvent.setup()
  vi.mocked(apiRequest).mockImplementation((_user,path,method)=>{if(path.endsWith('/media')&&method==='POST')return new Promise(resolve=>{finish=resolve});return Promise.resolve(path.endsWith('/replies')?{items:[],nextCursor:null}:topic)})
  const view=render(<MemoryRouter initialEntries={['/app/forum?topic=topic']}><ClubForum clubId="club"/></MemoryRouter>)
  await user.type(await screen.findByLabelText('Sua resposta'),'Uma resposta que não pode desaparecer.')
  const file=new File(['fixture'],'registro.webp',{type:'image/webp'});Object.defineProperty(file,'arrayBuffer',{value:async()=>new Uint8Array([1,2,3]).buffer})
  await user.upload(view.container.querySelector('input[type=file]')!,file);await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith(auth.user,'/clubs/club/media','POST',expect.anything()))
  auth.user={...auth.user};view.rerender(<MemoryRouter initialEntries={['/app/forum?topic=topic']}><ClubForum clubId="club"/></MemoryRouter>)
  await act(async()=>finish({id:'media',kind:'image',width:80,height:60,duration:null}))
  expect(await screen.findByRole('button',{name:'Retirar arquivo'})).toBeInTheDocument();expect(screen.getByLabelText('Sua resposta')).toHaveValue('Uma resposta que não pode desaparecer.')
})
