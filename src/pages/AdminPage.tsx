import { BookOpen, CalendarDays, ChevronRight, Crown, Flag, MailPlus, Palette, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Avatar, Button, Card, DemoBadge } from '../components/ui'
import { members } from '../data/mockData'

export function AdminPage() {
  return (
    <div className="stack-lg">
      <div className="page-intro"><div><DemoBadge /><h1>Cuidar do clube</h1><p>Visão da owner · ações simuladas</p></div><span className="owner-seal"><Crown /> Owner</span></div>
      <div className="admin-metrics"><Card><Users /><strong>9</strong><span>ativos</span></Card><Card><BookOpen /><strong>18</strong><span>livros</span></Card><Card><Flag /><strong>2</strong><span>pendências</span></Card></div>
      <section>
        <div className="section-heading"><div><span className="eyebrow">ACESSOS</span><h2>Membros e convites</h2></div><Button variant="secondary"><MailPlus size={17} /> Convidar</Button></div>
        <Card className="member-list">
          {members.map((member) => <div className="member-row" key={member.id}><Avatar initials={member.initials} /><div><strong>{member.name}</strong><span>{member.status === 'invited' ? 'Convite pendente' : `${member.booksRead} livros lidos`}</span></div><span className={`role-chip role-chip--${member.role}`}>{member.role === 'owner' ? 'Owner' : member.role === 'admin' ? 'Admin' : 'Membro'}</span><button className="icon-button" aria-label={`Gerenciar ${member.name}`}><ChevronRight /></button></div>)}
        </Card>
      </section>
      <section><div className="section-heading"><div><span className="eyebrow">GESTÃO</span><h2>Áreas do clube</h2></div></div><div className="admin-links">
        <button><span className="admin-link-icon"><BookOpen /></span><span><strong>Acervo e direitos</strong><small>18 livros · 1 revisão pendente</small></span><ChevronRight /></button>
        <button><span className="admin-link-icon"><Sparkles /></span><span><strong>Sorteios</strong><small>Rodada de novembro aberta</small></span><ChevronRight /></button>
        <button><span className="admin-link-icon"><CalendarDays /></span><span><strong>Encontros</strong><small>3 eventos futuros</small></span><ChevronRight /></button>
        <button><span className="admin-link-icon"><ShieldCheck /></span><span><strong>Moderação</strong><small>1 denúncia para revisar</small></span><ChevronRight /></button>
        <Link to="/app/theme"><span className="admin-link-icon"><Palette /></span><span><strong>Identidade visual</strong><small>Cores, fontes, logo e cartões</small></span><ChevronRight /></Link>
        <button><span className="admin-link-icon"><Settings /></span><span><strong>Configurações</strong><small>Privacidade, papéis e regras</small></span><ChevronRight /></button>
      </div></section>
      <div className="security-note"><ShieldCheck /><div><strong>Acesso protegido por função</strong><p>No produto final, toda ação administrativa será validada novamente pela API, nunca apenas pela interface.</p></div></div>
    </div>
  )
}
