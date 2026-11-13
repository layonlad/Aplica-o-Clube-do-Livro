import {StrictMode,useState} from 'react'
import {cleanup,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {MediaPicker} from './PrivateMedia'
import type {PostMedia} from '../../server/src/community-contracts'
import {apiRequest} from '../auth/api'
const {auth}=vi.hoisted(()=>({auth:{user:{uid:'local-reader',emailVerified:true,getIdToken:async()=> 'local-test-token'}}}))
vi.mock('../auth/AuthProvider',()=>({useAuth:()=>auth}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
function Form(){const [media,setMedia]=useState<PostMedia[]>([]),[busy,setBusy]=useState(false),[text,setText]=useState('');return <form><label>Mensagem<input value={text} onChange={event=>setText(event.target.value)}/></label><MediaPicker clubId="club" value={media} onChange={setMedia} onBusy={setBusy} imagesOnly/><button disabled={busy} type="button">Publicar</button><output>{media.length} arquivo preparado</output></form>}
beforeEach(()=>{vi.mocked(apiRequest).mockReset();vi.stubEnv('VITE_API_URL','http://localhost:3001');vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(new Uint8Array([0]),{status:200})));vi.stubGlobal('URL',class extends URL {static createObjectURL(){return 'blob:local-test'}static revokeObjectURL(){}})})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.unstubAllEnvs()})
it('preserva a foto selecionada após concluir upload e digitar a mensagem',async()=>{
  const user=userEvent.setup();let finish:(value:unknown)=>void=()=>{};vi.mocked(apiRequest).mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
  const view=render(<StrictMode><Form/></StrictMode>),file=new File(['fixture'],'registro.webp',{type:'image/webp'});Object.defineProperty(file,'arrayBuffer',{value:async()=>new Uint8Array([1,2,3]).buffer})
  await user.upload(view.container.querySelector('input[type=file]')!,file)
  await waitFor(()=>expect(apiRequest).toHaveBeenCalled())
  expect(screen.getByRole('button',{name:'Publicar'})).toBeDisabled()
  finish({id:'media',kind:'image',width:80,height:60,duration:null})
  expect(await screen.findByText('1 arquivo preparado')).toBeInTheDocument()
  await user.type(screen.getByLabelText('Mensagem'),'Reflexão com uma foto.')
  expect(screen.getByText('1 arquivo preparado')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Retirar arquivo'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'Publicar'})).toBeEnabled()
})

it('recupera um arquivo já preparado sem reenviar seus bytes',async()=>{
  const user=userEvent.setup();vi.mocked(apiRequest).mockResolvedValue({items:[{id:'prepared',kind:'image',width:80,height:60,duration:null}],nextCursor:null})
  render(<Form/>);await user.click(screen.getByText('Recuperar arquivos preparados'));await user.click(await screen.findByRole('button',{name:'Usar este arquivo'}))
  expect(screen.getByText('1 arquivo preparado')).toBeInTheDocument();expect(vi.mocked(apiRequest).mock.calls.some(call=>call[2]==='POST')).toBe(false)
})
