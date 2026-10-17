import { Award, Bell, BookOpenCheck, ChevronRight, Heart, LogOut, Moon, Settings2, Star, Target } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Card, DemoBadge, ProgressBar } from '../components/ui'

export function ProfilePage() {
  const navigate = useNavigate()
  return (
    <div className="stack-lg profile-page">
      <DemoBadge />
      <section className="profile-hero"><div className="profile-avatar"><Avatar initials="MA" size="lg" /><span>Owner</span></div><h1>Marina Alves</h1><p>“Leio para descobrir outras maneiras de estar no mundo.”</p><small>Membro desde janeiro de 2025</small></section>
      <div className="profile-stats"><span><strong>18</strong> lidos</span><span><strong>4,8</strong> média</span><span><strong>5</strong> indicações</span></div>
      <Card className="goal-card"><div className="section-heading"><div><span className="eyebrow">META DE 2026</span><h2>12 de 16 livros</h2></div><Target /></div><ProgressBar value={75} /><p>Faltam 4 livros para sua meta anual.</p></Card>
      <section><div className="section-heading"><div><span className="eyebrow">CONQUISTAS</span><h2>Sua estante de momentos</h2></div></div><div className="achievement-row"><span><Award />Fundadora</span><span><BookOpenCheck />12 em um ano</span><span><Heart />Boa conversa</span></div></section>
      <Card className="settings-list">
        <button><span><Bell /> Notificações</span><ChevronRight /></button>
        <button><span><Moon /> Aparência</span><ChevronRight /></button>
        <button><span><Star /> Preferências de leitura</span><ChevronRight /></button>
        <Link to="/app/admin"><span><Settings2 /> Administração</span><ChevronRight /></Link>
        <button className="logout-row" onClick={() => navigate('/')}><span><LogOut /> Sair da demonstração</span><ChevronRight /></button>
      </Card>
    </div>
  )
}
