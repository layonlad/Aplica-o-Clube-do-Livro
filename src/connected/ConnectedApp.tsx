import {ClubSettingsPanel} from '../clubs/ClubSettingsPanel'
import {roleLabels} from '../../server/src/permissions'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Club, ClubDetails, CreatedInvite, Invite, Session, Member } from '../../server/src/contracts'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { AuthScreen, VerifyEmailScreen } from '../auth/AuthScreen'
import { ApiError, apiRequest, readableError } from '../auth/api'
import { Button, Card } from '../components/ui'
import './connected.css'

export function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <main className="access-page" role="status">Carregando sua conta…</main>
  if (!user) return <AuthScreen />
  if (!user.emailVerified) return <VerifyEmailScreen />
  return <div key={user.uid}>{children}</div>
}
function Shell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  const [error, setError] = useState('')
  return <div className="connected-shell"><header className="connected-header"><Link to="/app"><span className="brand-mark">CL</span> Voltar ao aplicativo</Link>
    <div><span>{user?.displayName || user?.email}</span><Button variant="ghost" onClick={() => void signOut().catch((err) => setError(readableError(err)))}>Sair</Button></div></header>
    <main className="connected-content">{error && <p role="alert">{error}</p>}{children}</main></div>
}
export function ClubList() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [session, setSession] = useState<Session | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(''); setSession(null)
    apiRequest<Session>(user!, '/me').then((value) => { if (!cancelled) setSession(value) }).catch((err) => { if (!cancelled) setError(readableError(err)) })
    return () => { cancelled = true }
  }, [user, reload])
  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const club = await apiRequest<Club>(user!, '/clubs', 'POST', { name }); navigate(`/clubs/${club.id}`) }
    catch (err) { setError(readableError(err)) }
    finally { setBusy(false) }
  }
  return <Shell><div className="page-intro"><div><p className="eyebrow">LEITURAS COMPARTILHADAS</p><h1>Seus clubes</h1><p>Escolha um clube ou reúna seu próprio grupo.</p></div></div>
    {error && <div role="alert" className="access-error">{error} <Button variant="ghost" onClick={() => setReload((v) => v + 1)}>Tentar novamente</Button></div>}
    {!session && !error && <p role="status">Buscando seus clubes…</p>}
    {session && <><div className="club-grid">{session.clubs.map((club) => <Link className="club-link" key={club.id} to={`/clubs/${club.id}`}><Card><span className="eyebrow">{['owner','admin'].includes(club.role) ? 'VOCÊ ADMINISTRA' : 'VOCÊ PARTICIPA'}</span><h2>{club.name}</h2><span>Abrir clube →</span></Card></Link>)}</div>
      <p><Link to="/app/explore">Descobrir clubes abertos a novos leitores →</Link></p>
      {!session.clubs.length && <Card><h2>Seu próximo capítulo começa aqui</h2><p>Você ainda não participa de nenhum clube. Abra o link que recebeu ou crie o seu.</p><Link to="/invite">Tenho um código de convite</Link></Card>}
      <Card><h2>Criar um clube</h2><form className="access-form" onSubmit={create}><label>Nome do clube<input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><Button disabled={busy} type="submit">{busy ? 'Criando…' : 'Criar clube'}</Button></form></Card>
    </>}
  </Shell>
}

export function InvitePage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [token, setToken] = useState(params.get('token') ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function accept(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('')
    try { const club = await apiRequest<Club>(user!, '/invites/accept', 'POST', { token: token.trim() }); setToken(''); navigate(`/clubs/${club.id}`, { replace: true }) }
    catch (err) { setError(readableError(err)) }
    finally { setBusy(false) }
  }
  return <Shell><Card><h1>Você tem um convite</h1><p>Ao aceitar, você passará a participar do clube com a conta <strong>{user?.email}</strong>.</p>
    <form className="access-form" onSubmit={accept}><label>Código do convite<input required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" spellCheck={false} /></label>
      {error && <p role="alert" className="access-error">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Aceitando…' : 'Aceitar convite'}</Button></form>
    <Link to="/clubs">Voltar para meus clubes</Link></Card></Shell>
}

export function ClubPage() {
  const { user } = useAuth()
  const { clubId } = useParams()
  const [details, setDetails] = useState<ClubDetails | null>(null)
  const [invites, setInvites] = useState<Invite[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [email, setEmail] = useState('')
  const [days, setDays] = useState(7)
  const [uses, setUses] = useState(1)
  const [inviteLink, setInviteLink] = useState('')
  const [removeId, setRemoveId] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    setDetails(null); setInvites([]); setError(''); setRemoveId(null)
    async function load() {
      try {
        const result = await apiRequest<ClubDetails>(user!, `/clubs/${clubId}`)
        const list = ['owner','admin'].includes(result.club.role) ? await apiRequest<Invite[]>(user!, `/clubs/${clubId}/invites`) : []
        if (!cancelled) { setDetails(result); setInvites(list) }
      } catch (err) { if (!cancelled) setError(readableError(err)) }
    }
    void load()
    return () => { cancelled = true }
  }, [user, clubId, reload])
  useEffect(() => { setInviteLink(''); setMessage('') }, [clubId])
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('')
    try { await work(); setReload((value) => value + 1) }
    catch (err) {
      setError(readableError(err))
      if (err instanceof ApiError && [401, 403].includes(err.status)) { setDetails(null); setInvites([]); setInviteLink('') }
    } finally { setBusy(false) }
  }
  async function createInvite(event: FormEvent) {
    event.preventDefault()
    await action(async () => {
      const invite = await apiRequest<CreatedInvite>(user!, `/clubs/${clubId}/invites`, 'POST', { ...(email.trim() ? { email: email.trim() } : {}), maxUses: email.trim() ? 1 : uses, expiresInDays: days })
      const url = new URL(window.location.href); url.search = ''; url.hash = `/invite?token=${invite.token}`
      setInviteLink(url.toString()); setMessage('Convite criado. Copie o link antes de sair desta tela.'); setEmail('')
    })
  }
  async function moreMembers(){if(!details?.membersNextCursor)return;setBusy(true);setError('');try{const value=await apiRequest<{items:Member[];nextCursor:string|null}>(user!,`/clubs/${clubId}/members?cursor=${encodeURIComponent(details.membersNextCursor)}`);setDetails(current=>current?{...current,members:[...current.members,...value.items],membersNextCursor:value.nextCursor}:current)}catch(err){setError(readableError(err))}finally{setBusy(false)}}
  const owner = details?.club.role === 'owner'
  const manager = owner || details?.club.role === 'admin'
  return <Shell>{error && <div role="alert" className="access-error">{error} <Button variant="ghost" onClick={() => setReload((v) => v + 1)}>Atualizar</Button></div>}
    {!details && !error && <p role="status">Abrindo o clube…</p>}
    {details && <><div className="page-intro"><div><p className="eyebrow">SEU CLUBE</p><h1>{details.club.name}</h1><p>{details.memberCount??details.members.filter((m) => m.status === 'active').length} participantes · {owner ? 'Você é responsável pelo clube' : 'Você participa deste clube'}</p></div></div>
      {message && <p role="status">{message}</p>}
      <Card><h2>Participantes</h2><ul className="real-members">{details.members.map((member) => <li key={member.id}><div><strong>{member.name}</strong><small>{member.status === 'removed' ? 'Acesso removido' : roleLabels[member.role]}</small></div>
        {owner && member.role !== 'owner' && member.status==='active' && <label>Papel<select className="member-role-select" aria-label={`Papel de ${member.name}`} disabled={busy} value={member.role} onChange={event=>void action(async()=>{await apiRequest(user!,`/clubs/${clubId}/members/${member.id}/role`,'POST',{role:event.target.value});setMessage('Papel atualizado.')})}><option value="member">Membro</option><option value="moderator">Moderador</option><option value="admin">Administrador</option></select></label>}{manager && member.role !== 'owner' && (owner||member.role!=='admin') && (member.status === 'removed' ? <Button disabled={busy} variant="secondary" onClick={() => action(async () => { await apiRequest(user!, `/clubs/${clubId}/members/${member.id}/restore`, 'POST'); setMessage('Acesso reativado.') })}>Reativar</Button> : removeId === member.id ? <div className="access-actions"><span>Remover o acesso de {member.name}?</span><Button disabled={busy} variant="danger" onClick={() => action(async () => { await apiRequest(user!, `/clubs/${clubId}/members/${member.id}`, 'DELETE'); setMessage('Acesso removido.'); setRemoveId(null) })}>Confirmar remoção</Button><Button disabled={busy} variant="ghost" onClick={() => setRemoveId(null)}>Cancelar</Button></div> : <Button disabled={busy} variant="ghost" onClick={() => setRemoveId(member.id)}>Remover</Button>)}</li>)}</ul>{details.membersNextCursor&&<Button disabled={busy} variant="secondary" onClick={()=>void moreMembers()}>Mais participantes</Button>}</Card>
      {manager && <><Card><h2>Convidar para o clube</h2><p>Compartilhe um convite com seu grupo ou reserve o acesso para uma pessoa.</p>
        <form className="access-form" onSubmit={createInvite}>
          <label>E-mail da pessoa (opcional)<input type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></label>
          <div className="form-columns"><label>Validade em dias<input type="number" required min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value))} /></label>
          <label>Quantidade de usos<input type="number" required min={1} max={50} disabled={!!email.trim()} value={email.trim() ? 1 : uses} onChange={(e) => setUses(Number(e.target.value))} /></label></div>
          <Button type="submit" disabled={busy}>{busy ? 'Aguarde…' : 'Criar convite'}</Button></form>
        {inviteLink && <div className="invite-result"><label>Link do convite<input readOnly value={inviteLink} onFocus={(e) => e.target.select()} /></label><Button variant="secondary" onClick={() => navigator.clipboard.writeText(inviteLink).then(() => setMessage('Link copiado.')).catch(() => setMessage('Selecione e copie o link no campo acima.'))}>Copiar link</Button><small>O link só aparece agora. Se perdê-lo, revogue o convite e crie outro.</small></div>}
      </Card><Card><h2>Convites recentes</h2>{!invites.length && <p>Nenhum convite criado ainda.</p>}<ul className="real-members">{invites.map((invite) => {
        const available = !invite.revokedAt && new Date(invite.expiresAt).getTime() > Date.now() && invite.uses < invite.maxUses
        return <li key={invite.id}><div><strong>{invite.email || 'Convite para o grupo'}</strong><small>{invite.uses}/{invite.maxUses} usos · {invite.revokedAt ? 'Revogado' : new Date(invite.expiresAt).getTime() <= Date.now() ? 'Expirado' : `Válido até ${new Date(invite.expiresAt).toLocaleDateString('pt-BR')}`}</small></div>{available && <Button disabled={busy} variant="ghost" onClick={() => action(async () => { await apiRequest(user!, `/clubs/${clubId}/invites/${invite.id}`, 'DELETE'); setInviteLink(''); setMessage('Convite revogado.') })}>Revogar</Button>}</li>
      })}</ul></Card></>}
      {details.club.role!=='owner'&&<LeaveClub clubId={clubId!}/>}
      <ClubSettingsPanel clubId={clubId!} role={details.club.role} onUpdated={()=>setReload(v=>v+1)}/>
      <Card><h2>O espaço do seu clube</h2><p>Acesse a biblioteca compartilhada, as leituras, os encontros, as conversas e as indicações deste grupo.</p><Link className="button-link" to={`/space/${clubId}`}>Abrir aplicativo neste clube →</Link></Card>
    </>}
  </Shell>
}

function LeaveClub({clubId}:{clubId:string}){const {user}=useAuth(),navigate=useNavigate(),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');async function leave(){setBusy(true);try{await apiRequest(user!,`/clubs/${clubId}/leave`,'POST');navigate('/clubs',{replace:true})}catch(err){setError(readableError(err))}finally{setBusy(false)}}return <Card><h2>Sua participação</h2>{confirm?<><p>Sair deste clube revoga o acesso às conversas e aos arquivos do grupo. Para retornar, peça a reativação à administração.</p><Button disabled={busy} variant="danger" onClick={()=>void leave()}>Confirmar saída do clube</Button><Button disabled={busy} variant="ghost" onClick={()=>setConfirm(false)}>Cancelar saída</Button></>:<Button variant="ghost" onClick={()=>setConfirm(true)}>Sair deste clube</Button>}{error&&<p role="alert">{error}</p>}</Card>}

export function ConnectedApp() {
  return <AuthProvider><Protected><Routes>
    <Route path="/clubs" element={<ClubList />} />
    <Route path="/clubs/:clubId" element={<ClubPage />} />
    <Route path="/invite" element={<InvitePage />} />
    <Route path="*" element={<Navigate to="/clubs" replace />} />
  </Routes></Protected></AuthProvider>
}
