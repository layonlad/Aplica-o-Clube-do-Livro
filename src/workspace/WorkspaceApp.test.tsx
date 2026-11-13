import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../app/ThemeProvider'
import { WorkspaceApp } from './WorkspaceApp'
import { apiRequest } from '../auth/api'

vi.mock('../auth/AuthProvider',()=>({AuthProvider:({children}:{children:React.ReactNode})=>children,useAuth:()=>({user:null,loading:false,signOut:vi.fn()})}))
vi.mock('../auth/api',async original=>({...await original<typeof import('../auth/api')>(),apiRequest:vi.fn()}))
function open(path='/'){return render(<MemoryRouter initialEntries={[path]}><ThemeProvider><WorkspaceApp/></ThemeProvider></MemoryRouter>)}
describe('aplicativo sem cadastro',()=>{
  it('abre o aplicativo completo sem autenticação ou consulta a dados privados',async()=>{
    open()
    expect(await screen.findByRole('heading',{name:'Que história vamos viver?'})).toBeInTheDocument()
    expect(screen.getByRole('navigation',{name:'Navegação principal'})).toBeInTheDocument()
    expect(screen.queryByLabelText('Senha')).not.toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(screen.queryByText('Torto Arado')).not.toBeInTheDocument()
  })
  it('salva um livro sem conta, abre o leitor e mantém o histórico após reabrir',async()=>{
    const user=userEvent.setup();const view=open('/app/library')
    await user.click(await screen.findByRole('button',{name:'Adicionar livro'}))
    await user.type(screen.getByLabelText('Título'),'Minha leitura')
    await user.type(screen.getByLabelText('Autor'),'Autora')
    fireEvent.change(screen.getByLabelText('Texto para ler (opcional)'),{target:{value:'Um texto original para testar a leitura e o histórico.'}})
    await user.click(screen.getByRole('button',{name:'Salvar livro'}))
    await user.click(await screen.findByRole('link',{name:'Ler agora →'}))
    expect(await screen.findByText('Um texto original para testar a leitura e o histórico.')).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'Concluir leitura'}))
    expect(await screen.findByRole('status')).toHaveTextContent('Leitura concluída')
    view.unmount();open('/app/history')
    expect(await screen.findByRole('heading',{name:'Minha leitura'})).toBeInTheDocument()
  })
  it('guarda anotações pessoais sem publicar em um clube',async()=>{
    const user=userEvent.setup();open('/app/forum')
    await user.type(await screen.findByLabelText('Título'),'Uma ideia')
    await user.type(screen.getByLabelText('Sua anotação'),'Pensamento pessoal')
    await user.click(screen.getByRole('button',{name:'Salvar anotação'}))
    expect(await screen.findByRole('heading',{name:'Uma ideia'})).toBeInTheDocument()
    expect(screen.getByText('Pensamento pessoal')).toBeInTheDocument()
    expect(apiRequest).not.toHaveBeenCalled()
  })
  it('mantém a entrada por convite protegida e oferece continuar sem cadastro',()=>{
    open('/invite?token=secret')
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Continuar sem cadastro →'})).toHaveAttribute('href','/app')
    expect(apiRequest).not.toHaveBeenCalled()
  })
})
