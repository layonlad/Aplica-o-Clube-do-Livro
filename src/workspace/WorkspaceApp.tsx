import { lazy, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, CalendarDays, ChevronRight, Clock, Heart, History, MapPin, Search, Sparkles, Star, UsersRound } from 'lucide-react'
import { updateProfile } from 'firebase/auth'
import { AuthProvider, useAuth } from '../auth/AuthProvider'
import { AuthScreen, VerifyEmailScreen } from '../auth/AuthScreen'
import { Protected, ClubList, ClubPage, InvitePage } from '../connected/ConnectedApp'
import { WorkspaceShell } from './WorkspaceShell'
import { BookStack, Button, Card, CoverArt, ProgressBar, Spines } from '../components/ui'
import { useTheme } from '../app/ThemeProvider'
import { WorkspaceProvider, useWorkspace } from './WorkspaceProvider'
import { backupSchema } from './storage'
import { importPhoto } from './import-book'
import { LibraryRoom as LibraryView } from './LibraryRoom'
import { ReadingRoom as ReaderView } from './ReadingRoom'
import './workspace.css'

const ClubIdentity=lazy(()=>import('../clubs/ClubIdentity').then(module=>({default:module.ClubIdentity})))
const AuthorizedDownloads=lazy(()=>import('./AuthorizedDownloads').then(module=>({default:module.AuthorizedDownloads})))
const ClubCalendar=lazy(()=>import('../clubs/ClubCalendar').then(module=>({default:module.ClubCalendar})))
const Notifications=lazy(()=>import('../community/Notifications').then(module=>({default:module.Notifications})))
const Moderation=lazy(()=>import('../community/Moderation').then(module=>({default:module.Moderation})))
const PublicCommunity=lazy(()=>import('../community/PublicCommunity').then(module=>({default:module.PublicCommunity})))
const SocialProfile=lazy(()=>import('../community/SocialProfile').then(module=>({default:module.SocialProfile})))
const SocialProfileEditor=lazy(()=>import('../community/SocialProfile').then(module=>({default:module.SocialProfileEditor})))
const Explore=lazy(()=>import('../community/Explore').then(module=>({default:module.Explore})))
const ClubForum=lazy(()=>import('../forum/ClubForum').then(module=>({default:module.ClubForum})))
const ClubWall=lazy(()=>import('../community/ClubWall').then(module=>({default:module.ClubWall})))
const ClubGallery=lazy(()=>import('../community/ClubGallery').then(module=>({default:module.ClubGallery})))
const localDate=(date:string)=>new Date(date).toLocaleString('pt-BR',{dateStyle:'medium',timeStyle:'short'})
const localTime=(date:string)=>new Date(date).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})
const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase()||'?'
const storedName=()=>{try{return localStorage.getItem('clube-livro-name')??''}catch{return ''}}
function Intro({title,body,action,eyebrow}:{title:string;body:string;action?:ReactNode;eyebrow?:string}){return <div className="page-intro"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1 className="title-reveal">{title}</h1><p>{body}</p></div>{action}</div>}
function Empty({title,body,link}:{title:string;body:string;link?:[string,string]}){return <Card className="empty-card"><BookStack/><h2>{title}</h2><p>{body}</p>{link&&<Link className="button-link" to={link[0]}>{link[1]} →</Link>}</Card>}
function DateTile({date}:{date:string}){const value=new Date(date);const past=value.getTime()<Date.now();return <span className={`date-tile ${past?'date-tile--past':''}`} aria-hidden="true"><strong>{value.getDate()}</strong><span>{value.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</span></span>}
function HomeView(){
  const {snapshot,scope,scopeName}=useWorkspace();const {state,reading}=snapshot!;const {user}=useAuth()
  const current=state.books.find(b=>b.id===state.currentBookId)??state.books.find(b=>(reading[b.id]?.percent??0)<100)
  const next=[...state.events].filter(e=>new Date(e.date).getTime()>=Date.now()).sort((a,b)=>a.date.localeCompare(b.date))[0]
  const finished=state.books.filter(b=>reading[b.id]?.percent===100).length
  const now=new Date();const hour=now.getHours()
  const greeting=hour>=5&&hour<12?'Bom dia':hour>=12&&hour<18?'Boa tarde':'Boa noite'
  const name=(user?.displayName||storedName()).trim().split(/\s+/)[0]
  const percent=current?reading[current.id]?.percent??0:0
  return <div className="stack-xl home-view reveal">{scope!=='personal'&&<ClubIdentity key={scope} clubId={scope}/>}
    <header className="home-hero">
      <span className="eyebrow">{now.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}</span>
      <p className="home-greeting">{greeting}{name?`, ${name}`:''}.</p>
      <h1 className="title-reveal">Que história vamos viver?</h1>
      <p className="t-subtitle">{scope==='personal'?'Seu espaço de leitura, no seu ritmo.':`Leituras e conversas em ${scopeName}.`}</p>
      <Spines/>
    </header>
    {current?<section className="card card--raised home-current" aria-labelledby="home-current-title">
      <Link to={`/app/reader/${current.id}`} tabIndex={-1} aria-hidden="true" className="home-current__cover cover-open"><CoverArt title={current.title} author={current.author} size="lg" tilt/></Link>
      <div className="home-current__body">
        <span className="eyebrow">{state.currentBookId?'Leitura em destaque':'Continue sua leitura'}</span>
        <h2 id="home-current-title">{current.title}</h2>
        <p className="home-current__author">{current.author}</p>
        <ProgressBar value={percent} label="Seu progresso"/>
        <Link className="button-link" to={`/app/reader/${current.id}`}>{current.content?'Abrir leitor':'Registrar progresso'} →</Link>
      </div>
    </section>:<Empty title="Sua próxima história começa aqui" body="Adicione seu primeiro livro ou importe um EPUB para começar a ler." link={['/app/library','Abrir minha biblioteca']}/>}
    <div className="home-ledger">
      <p><strong>{state.books.length}</strong><span>livros na estante</span></p>
      <p><strong>{finished}</strong><span>leituras concluídas</span></p>
      <p><strong>{scope==='personal'?state.topics.length:snapshot!.forumCount??0}</strong><span>{scope==='personal'?'notas de leitura':'conversas'}</span></p>
    </div>
    {next?<Link className="card card--interactive home-event" to="/app/calendar"><DateTile date={next.date}/><span className="home-event__body"><span className="eyebrow">Na agenda</span><strong>{next.title}</strong><small><span><Clock size={14} aria-hidden="true"/>{localTime(next.date)}</span>{next.location&&<span><MapPin size={14} aria-hidden="true"/>{next.location}</span>}</small></span><ChevronRight className="home-event__arrow" size={20} aria-hidden="true"/></Link>
      :<section className="card home-event home-event--empty"><span className="home-event__icon"><CalendarDays size={22} aria-hidden="true"/></span><span className="home-event__body"><strong>Reserve um tempo para ler</strong><small>Organize suas sessões de leitura e os próximos encontros na agenda.</small></span><Link className="text-link" to="/app/calendar">Abrir agenda <ArrowRight size={16} aria-hidden="true"/></Link></section>}
    <div className="quick-grid">
      <Link className="quick-tile quick-tile--honey" to="/app/nominations"><Sparkles size={22} aria-hidden="true"/><span><strong>Indicações e sorteio</strong><small>Deixe o acaso escolher a próxima leitura</small></span><ArrowRight size={18} aria-hidden="true"/></Link>
      <Link className="quick-tile quick-tile--blue" to="/app/history"><History size={22} aria-hidden="true"/><span><strong>Meu histórico</strong><small>As histórias que você já viveu</small></span><ArrowRight size={18} aria-hidden="true"/></Link>
    </div>
    <Card><h2>Leitura também é encontro</h2><p>Use o app individualmente ou reúna pessoas em um clube. A conta só é necessária para sincronizar e compartilhar.</p><Link to="/clubs">Criar ou acessar um clube →</Link></Card>
  </div>
}
function Remove({label,onConfirm}:{label:string;onConfirm:()=>Promise<boolean>}){const [confirm,setConfirm]=useState(false);const {busy}=useWorkspace();return confirm?<div className="workspace-actions"><span>Confirmar exclusão?</span><Button variant="danger" disabled={busy} onClick={()=>void onConfirm().then(ok=>{if(ok)setConfirm(false)})}>Excluir</Button><Button variant="ghost" disabled={busy} onClick={()=>setConfirm(false)}>Cancelar</Button></div>:<Button variant="ghost" disabled={busy} onClick={()=>setConfirm(true)}>{label}</Button>}
function CalendarView(){const {scope}=useWorkspace();return scope==='personal'?<PersonalCalendarView/>:<ClubCalendar key={scope} clubId={scope}/>}
function PersonalCalendarView(){
  const {snapshot,act,busy}=useWorkspace();const {state,role,actorId}=snapshot!
  const [show,setShow]=useState(false);const [title,setTitle]=useState('');const [date,setDate]=useState('');const [location,setLocation]=useState('');const [description,setDescription]=useState('');const [message,setMessage]=useState('')
  async function add(e:FormEvent){e.preventDefault();if(await act({type:'event.add',title,date:new Date(date).toISOString(),location,description})){setTitle('');setShow(false)}}
  async function photo(id:string,file:File){try{const src=await importPhoto(file);await act({type:'event.photo',id,src})}catch(e){setMessage((e as Error).message)}}
  const events=[...state.events].sort((a,b)=>a.date.localeCompare(b.date))
  return <div className="stack-lg"><Intro eyebrow="Agenda" title="Sua agenda de leitura" body="Horários exibidos no fuso deste aparelho." action={['owner','admin'].includes(role)&&<Button onClick={()=>setShow(!show)} aria-expanded={show}>Novo encontro</Button>}/>
    {show&&<Card className="composer-card"><form className="workspace-form" onSubmit={add}><label>Título do encontro<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label><div className="form-row"><label>Data e hora<input type="datetime-local" required value={date} onChange={e=>setDate(e.target.value)}/></label><label>Local ou link da reunião<input maxLength={200} value={location} onChange={e=>setLocation(e.target.value)}/></label></div><label>Descrição<textarea maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)}/></label><Button disabled={busy}>Salvar encontro</Button></form></Card>}
    {message&&<p role="alert" className="access-error">{message}</p>}
    <div className="event-list-x reveal">{events.map(event=>{const past=new Date(event.date).getTime()<Date.now();const going=Object.values(event.rsvps).filter(v=>v==='yes').length;return <article className={`card event-card-x ${past?'is-past':''}`} key={event.id}>
      <div className="event-card-x__head"><DateTile date={event.date}/><div><span className="eyebrow">{past?'Encontro passado':'Próximo encontro'}</span><h2>{event.title}</h2><p className="event-meta-x"><span><Clock size={15} aria-hidden="true"/>{localDate(event.date)}</span>{event.location&&<span><MapPin size={15} aria-hidden="true"/>{event.location}</span>}</p></div></div>
      {event.description&&<p className="preserve-text event-card-x__desc">{event.description}</p>}
      <div className="rsvp-x"><span className="rsvp-x__count"><UsersRound size={16} aria-hidden="true"/>{going} presença(s) confirmada(s)</span><div className="rsvp-x__options" role="group" aria-label={`Sua presença em ${event.title}`}>{(['yes','maybe','no'] as const).map((value,i)=><Button key={value} disabled={busy} aria-pressed={event.rsvps[actorId]===value} variant={event.rsvps[actorId]===value?'primary':'secondary'} onClick={()=>void act({type:'event.rsvp',id:event.id,value})}>{['Vou','Talvez','Não vou'][i]}</Button>)}</div></div>
      {event.photos.length>0&&<div className="workspace-photos">{event.photos.map(image=><img key={image.id} src={image.src} alt={`Registro do encontro ${event.title}`} loading="lazy" decoding="async"/>)}</div>}
      <div className="workspace-actions">{event.photos.length<8&&<label className="file-button">Adicionar foto<input aria-label={`Adicionar foto em ${event.title}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void photo(event.id,file);e.target.value=''}}/></label>}{['owner','admin'].includes(role)&&<Remove label={`Excluir encontro ${event.title}`} onConfirm={()=>act({type:'event.remove',id:event.id})}/>}</div>
    </article>})}</div>
    {!state.events.length&&<Empty title="Seu próximo encontro começa aqui" body="Planeje uma sessão individual de leitura ou um encontro do grupo."/>}
  </div>
}
function ForumView(){const {scope}=useWorkspace();return scope==='personal'?<PersonalForumView/>:<ClubForum key={scope} clubId={scope}/>}
function PersonalForumView(){
  const {snapshot,act,busy,scope}=useWorkspace();const {state,actorId,role}=snapshot!
  const [title,setTitle]=useState('');const [body,setBody]=useState('');const [spoiler,setSpoiler]=useState(false);const [query,setQuery]=useState('');const [revealed,setRevealed]=useState<string[]>([])
  async function post(e:FormEvent){e.preventDefault();if(await act({type:'topic.add',title,body,spoiler})){setTitle('');setBody('');setSpoiler(false)}}
  const personal=scope==='personal'
  const topics=state.topics.filter(t=>`${t.title} ${t.body}`.toLowerCase().includes(query.toLowerCase()))
  return <div className="stack-lg"><Intro eyebrow={personal?'Caderno':'Conversas'} title={personal?'Seu caderno de leitura':'Conversas do clube'} body={personal?'Guarde pensamentos, trechos e perguntas. Suas notas são pessoais.':'Compartilhe ideias com as pessoas deste clube.'}/>
    <Card className="composer-card"><form className="workspace-form" onSubmit={post}><label>Título<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{personal?'Sua anotação':'Sua mensagem'}<textarea required maxLength={5000} rows={4} value={body} onChange={e=>setBody(e.target.value)}/></label><div className="composer-card__foot"><label className="workspace-check"><input type="checkbox" checked={spoiler} onChange={e=>setSpoiler(e.target.checked)}/>Contém spoiler</label><Button disabled={busy}>{personal?'Salvar anotação':'Publicar conversa'}</Button></div></form></Card>
    {state.topics.length>0&&<div className="search-field"><Search size={18} aria-hidden="true"/><input aria-label="Buscar conversas" placeholder="Buscar por título ou conteúdo" value={query} onChange={e=>setQuery(e.target.value)}/></div>}
    <div className="topic-list-x reveal">{topics.map(topic=>{const liked=topic.likedBy.includes(actorId);const hidden=topic.spoiler&&!revealed.includes(topic.id);return <article className="card topic-card-x" key={topic.id}>
      <header className="topic-card-x__head"><span className="avatar avatar--md" aria-hidden="true">{initials(topic.name)}</span><span><strong>{topic.name}</strong><small>{localDate(topic.at)}</small></span>{topic.spoiler&&<span className="chip chip--warning">Spoiler</span>}</header>
      <h2>{topic.title}</h2>
      {hidden?<button type="button" className="spoiler-cover" onClick={()=>setRevealed([...revealed,topic.id])}><span><strong>Revelar spoiler</strong>Este texto fala de partes da história.</span></button>:<>
        <p className="preserve-text topic-card-x__body">{topic.body}</p>
        <div className="topic-card-x__actions"><button type="button" className="like-button" aria-pressed={liked} aria-label={`${liked?'Remover curtida':'Curtir'} · ${topic.likedBy.length}`} disabled={busy} onClick={()=>void act({type:'topic.like',id:topic.id})}><Heart size={16} aria-hidden="true"/>{topic.likedBy.length}</button>{topic.replies.length>0&&<span className="t-caption">{topic.replies.length} comentário(s)</span>}{(['owner','admin','moderator'].includes(role)||topic.by===actorId)&&<Remove label="Excluir conversa" onConfirm={()=>act({type:'topic.remove',id:topic.id})}/>}</div>
        {topic.replies.length>0&&<div className="workspace-replies">{topic.replies.map(reply=><div key={reply.id} className="reply-x"><span className="avatar avatar--sm" aria-hidden="true">{initials(reply.name)}</span><div><strong>{reply.name}</strong><small>{localDate(reply.at)}</small><p className="preserve-text">{reply.body}</p></div></div>)}</div>}
        <Reply id={topic.id}/></>}
    </article>})}</div>
    {!state.topics.length&&<div className="empty-state"><BookStack/><h2>A primeira página está em branco</h2><p>Escreva sua primeira {personal?'anotação':'conversa'} acima.</p></div>}
    {state.topics.length>0&&!topics.length&&<p className="empty-inline">Nada encontrado para “{query}”.</p>}
  </div>
}
function Reply({id}:{id:string}){const {act,busy}=useWorkspace();const [body,setBody]=useState('');return <form className="workspace-form reply-form" onSubmit={e=>{e.preventDefault();void act({type:'topic.reply',id,body}).then(ok=>ok&&setBody(''))}}><label><span className="sr-only">Adicionar comentário</span><textarea required maxLength={5000} rows={1} placeholder="Escreva um comentário…" value={body} onChange={e=>setBody(e.target.value)}/></label><Button variant="secondary" disabled={busy||!body.trim()}>Comentar</Button></form>}
function NominationsView(){
  const {snapshot,scope,act,busy}=useWorkspace();const {state,role,actorId}=snapshot!
  const [title,setTitle]=useState('');const [author,setAuthor]=useState('');const [confirm,setConfirm]=useState(false)
  return <div className="stack-lg"><Intro eyebrow="Indicações" title="Qual será a próxima leitura?" body={scope==='personal'?'Monte sua lista de desejos e deixe o acaso escolher.':'Uma indicação por pessoa em cada rodada. O responsável encerra a rodada com o sorteio.'}/>
    <Card className="composer-card"><form className="workspace-form" onSubmit={e=>{e.preventDefault();void act({type:'nomination.add',title,author}).then(ok=>{if(ok){setTitle('');setAuthor('')}})}}><div className="form-row"><label>Título indicado<input required maxLength={150} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Autor da indicação<input required maxLength={150} value={author} onChange={e=>setAuthor(e.target.value)}/></label></div><Button disabled={busy}>Indicar livro</Button></form></Card>
    {state.nominations.length>0&&<ol className="ballot reveal">{state.nominations.map((item,index)=><li key={item.id} className="card ballot__item"><span className="ballot__number" aria-hidden="true">{String(index+1).padStart(2,'0')}</span><CoverArt title={item.title} author={item.author} size="sm"/><div className="ballot__body"><h2>{item.title}</h2><p>{item.author}</p><small>Indicado por {item.name}</small></div>{(['owner','admin'].includes(role)||item.by===actorId)&&<Remove label={`Retirar ${item.title}`} onConfirm={()=>act({type:'nomination.remove',id:item.id})}/>}</li>)}</ol>}
    {['owner','admin'].includes(role)&&<Card className="draw-card-x"><Spines/><span className="draw-card-x__icon"><Sparkles size={24} aria-hidden="true"/></span><h2>Sortear a próxima leitura</h2><p>{state.nominations.length} título(s) nesta rodada. Cada indicação tem a mesma chance. O resultado e os títulos participantes ficam registrados; a rodada é encerrada.</p>{confirm?<div className="workspace-actions"><Button disabled={busy||!state.nominations.length} onClick={()=>void act({type:'draw'}).then(ok=>ok&&setConfirm(false))}>Confirmar sorteio</Button><Button variant="ghost" onClick={()=>setConfirm(false)}>Cancelar</Button></div>:<Button disabled={busy||!state.nominations.length} onClick={()=>setConfirm(true)}>Sortear leitura</Button>}</Card>}
    <section className="draw-results" aria-labelledby="draw-results-title"><h2 id="draw-results-title" className="section-title">Resultados das rodadas</h2>{!state.draws.length&&<p className="empty-inline">Os resultados aparecerão aqui após o primeiro sorteio.</p>}{state.draws.map(draw=><Card key={draw.id} className="draw-result"><CoverArt title={draw.title} size="sm"/><div><span className="eyebrow">Leitura sorteada</span><h3>{draw.title}</h3><p className="t-caption">{localDate(draw.at)}</p><details><summary>{draw.candidates.length} título(s) participante(s)</summary><ul>{draw.candidates.map(item=><li key={item.id}>{item.title}</li>)}</ul><small>Registro: {draw.id}</small></details></div></Card>)}</section>
  </div>
}
function HistoryView(){const {snapshot}=useWorkspace();const [query,setQuery]=useState('');const items=snapshot!.state.books.filter(book=>snapshot!.reading[book.id]?.percent===100&&`${book.title} ${book.author}`.toLowerCase().includes(query.toLowerCase()));return <div className="stack-lg"><Intro eyebrow="Histórico" title="Histórias que você já viveu" body="As leituras marcadas como concluídas aparecem aqui."/><div className="search-field"><Search size={18} aria-hidden="true"/><input aria-label="Buscar no histórico" placeholder="Título ou autor" value={query} onChange={e=>setQuery(e.target.value)}/></div>
  <ol className="timeline-x reveal">{items.map(book=>{const entry=snapshot!.reading[book.id];const rating=entry.rating??0;return <li key={book.id} className="timeline-x__item"><span className="timeline-x__dot" aria-hidden="true"/><article className="card card--interactive timeline-x__card"><CoverArt title={book.title} author={book.author} size="sm"/><div><span className="eyebrow">Concluído em {new Date(entry.finishedAt!).toLocaleDateString('pt-BR',{day:'numeric',month:'long',year:'numeric'})}</span><h2>{book.title}</h2><p>{book.author}</p><p className="stars" role="img" aria-label={rating?`Sua avaliação: ${rating}/5`:'Sem avaliação'}>{rating?[1,2,3,4,5].map(n=><Star key={n} size={15} aria-hidden="true" className={n<=rating?'is-on':''}/>):<span className="t-caption">Sem avaliação</span>}</p><Link className="text-link" to={`/app/reader/${book.id}`}>Revisitar leitura <ArrowRight size={15} aria-hidden="true"/></Link></div></article></li>})}</ol>
  {!items.length&&<Empty title="Cada leitura deixa uma marca" body="Conclua uma leitura na biblioteca para começar seu histórico." link={['/app/library','Escolher um livro']}/>}</div>}
function ProfileView(){
  const {user,signOut}=useAuth();const {snapshot,act,busy,scope}=useWorkspace()
  const [name,setName]=useState(user?.displayName??localStorage.getItem('clube-livro-name')??'');const [goal,setGoal]=useState(Number(localStorage.getItem('clube-livro-goal'))||12);const [message,setMessage]=useState('')
  const finished=Object.values(snapshot!.reading).filter(item=>item.finishedAt&&new Date(item.finishedAt).getFullYear()===new Date().getFullYear()).length
  async function profile(e:FormEvent){e.preventDefault();try{if(user){await updateProfile(user,{displayName:name.trim()});await user.getIdToken(true)}localStorage.setItem('clube-livro-name',name.trim());localStorage.setItem('clube-livro-goal',String(goal));setMessage('Perfil e meta salvos.')}catch{setMessage('Não foi possível salvar seu perfil. Tente novamente.')}}
  function download(){const blob=new Blob([JSON.stringify({format:'clube-livro-v1',state:snapshot!.state,reading:snapshot!.reading,preferences:snapshot!.preferences},null,2)],{type:'application/json'});const href=URL.createObjectURL(blob);const link=document.createElement('a');link.href=href;link.download=`clube-livro-backup-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);setMessage('Backup preparado para download.')}
  async function restore(file:File){try{if(file.size>10000000)throw Error('O backup excede 10 MB.');const data=backupSchema.parse(JSON.parse(await file.text()));if(await act({type:'workspace.import',state:data.state,reading:data.reading,preferences:data.preferences}))setMessage('Backup importado no seu espaço pessoal.')}catch{setMessage('Arquivo inválido. Selecione um backup JSON exportado pelo aplicativo.')}}
  return <div className="stack-lg"><Intro title="Seu perfil de leitor" body={user?`Conta: ${user.email}`:'Você está usando o app sem conta.'}/><Card><form className="workspace-form" onSubmit={profile}><label>Seu nome<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>Meta anual de livros<input required type="number" min={1} max={1000} value={goal} onChange={e=>setGoal(Number(e.target.value))}/></label><Button>Salvar perfil</Button></form><p>{finished} de {goal} livros concluídos em {new Date().getFullYear()}</p><ProgressBar value={Math.min(100,Math.round(finished/goal*100))}/></Card><Card><h2>Seus dados, com você</h2><p>O backup JSON guarda catálogo, texto de leitura, progresso, anotações e preferências. Baixe separadamente os EPUBs originais e as mídias que quiser conservar.</p><p><Link to="/app/social-profile">Perfil social e privacidade →</Link></p><p>{user?.emailVerified?'Seus livros e registros são sincronizados com sua conta. Nome e meta deste formulário ficam também neste aparelho.':'Sem conta, os registros ficam apenas neste navegador. Eles podem ser perdidos se os dados do navegador forem apagados. Exporte um backup para guardá-los.'}</p><Button variant="secondary" onClick={download}>Exportar backup</Button>{scope==='personal'&&<><p>A importação substitui o conteúdo do espaço pessoal. Guarde seu backup atual antes de importar.</p><label className="file-button">Importar backup pessoal<input type="file" accept="application/json,.json" aria-label="Importar backup pessoal" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void restore(file);e.target.value=''}}/></label></>}</Card>{message&&<p role="status">{message}</p>}<Card><h2>{user?'Sua conta':'Quer levar suas leituras para outros aparelhos?'}</h2><p>Você pode usar seu espaço pessoal sem clube. Para compartilhar leituras e conversas com um grupo, crie ou aceite um convite.</p><div className="workspace-actions"><Link to="/clubs">Meus clubes e convites →</Link>{user?<Button variant="ghost" onClick={()=>void signOut().then(()=>setMessage('Você saiu da conta. Seu espaço local continua neste aparelho.'))}>Sair da conta</Button>:<Link to="/account">Entrar ou criar conta →</Link>}<Link to="/app/theme">Personalizar aparência →</Link></div></Card></div>
}
function ThemeView(){const {theme,updateTheme,resetTheme}=useTheme();return <div className="stack-lg"><Intro title="Do seu jeito" body="A aparência é salva neste navegador."/><Card><div className="workspace-form"><label>Cor principal<input type="color" value={theme.primary} onChange={e=>updateTheme('primary',e.target.value)}/></label><label>Cor de destaque<input type="color" value={theme.accent} onChange={e=>updateTheme('accent',e.target.value)}/></label><label>Iniciais da marca<input maxLength={3} value={theme.monogram} onChange={e=>updateTheme('monogram',e.target.value)}/></label><label>Fonte<select value={theme.font} onChange={e=>updateTheme('font',e.target.value as typeof theme.font)}><option value="humanist">Humanista</option><option value="editorial">Editorial</option><option value="modern">Moderna</option></select></label><label>Modo<select value={theme.mode} onChange={e=>updateTheme('mode',e.target.value as typeof theme.mode)}><option value="light">Claro</option><option value="dark">Escuro</option></select></label><label>Formato dos cartões<select value={theme.radius} onChange={e=>updateTheme('radius',e.target.value as typeof theme.radius)}><option value="round">Arredondado</option><option value="soft">Suave</option><option value="square">Reto</option></select></label><Button variant="secondary" onClick={resetTheme}>Restaurar aparência</Button></div></Card></div>}
function AccountView(){const {user,loading}=useAuth();if(loading)return <p role="status">Carregando conta…</p>;if(!user)return <AuthScreen/>;if(!user.emailVerified)return <VerifyEmailScreen/>;return <Navigate to="/app" replace/>}
function OpenCurrentReading(){const {snapshot}=useWorkspace();const book=snapshot?.state.books.find(book=>book.id===snapshot.state.currentBookId)??snapshot?.state.books.find(book=>(snapshot.reading[book.id]?.percent??0)<100);return <Navigate to={book?`/app/reader/${book.id}`:'/app/library'} replace/>}
function OpenClub(){const {clubId}=useParams();const {setScope}=useWorkspace();const navigate=useNavigate();useEffect(()=>{if(clubId){setScope(clubId);navigate('/app',{replace:true})}},[clubId,setScope,navigate]);return <p role="status">Abrindo espaço do clube…</p>}
function WorkspaceSession(){const {user}=useAuth();return <WorkspaceProvider key={user?.emailVerified?user.uid:'visitor'}><Routes><Route path="/" element={<Navigate to="/app" replace/>}/><Route path="/app" element={<WorkspaceShell/>}><Route index element={<HomeView/>}/><Route path="downloads" element={<AuthorizedDownloads/>}/><Route path="library" element={<LibraryView/>}/><Route path="reader/:id" element={<ReaderView/>}/><Route path="reader" element={<OpenCurrentReading/>}/><Route path="wall" element={<ClubWall/>}/><Route path="gallery" element={<ClubGallery/>}/><Route path="explore" element={<Explore/>}/><Route path="notifications" element={<Notifications/>}/><Route path="moderation" element={<Moderation/>}/><Route path="community" element={<PublicCommunity/>}/><Route path="people/:id" element={<SocialProfile/>}/><Route path="social-profile" element={<SocialProfileEditor/>}/><Route path="calendar" element={<CalendarView/>}/><Route path="forum" element={<ForumView/>}/><Route path="nominations" element={<NominationsView/>}/><Route path="history" element={<HistoryView/>}/><Route path="profile" element={<ProfileView/>}/><Route path="theme" element={<ThemeView/>}/><Route path="admin" element={<Navigate to="/clubs" replace/>}/></Route><Route path="/account" element={<AccountView/>}/><Route path="/clubs" element={<Protected><ClubList/></Protected>}/><Route path="/clubs/:clubId" element={<Protected><ClubPage/></Protected>}/><Route path="/invite" element={<Protected><InvitePage/></Protected>}/><Route path="/space/:clubId" element={<Protected><OpenClub/></Protected>}/><Route path="*" element={<Navigate to="/app" replace/>}/></Routes></WorkspaceProvider>}
export function WorkspaceApp(){return <AuthProvider><WorkspaceSession/></AuthProvider>}
