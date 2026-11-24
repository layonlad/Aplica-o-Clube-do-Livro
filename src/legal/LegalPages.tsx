import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { privacyVersion, termsVersion } from '../../server/src/legal-versions'
import './legal.css'

const controller = import.meta.env.VITE_LEGAL_CONTROLLER?.trim()
const contact = import.meta.env.VITE_PRIVACY_CONTACT?.trim()
const transfer = import.meta.env.VITE_LEGAL_TRANSFER?.trim()
const topics = [
  'Confirmar tratamento ou acessar dados',
  'Corrigir dados pessoais',
  'Pedir portabilidade',
  'Pedir exclusão, anonimização ou bloqueio',
  'Revogar consentimento ou apresentar oposição',
  'Saber com quem os dados foram compartilhados',
  'Comunicar uso indevido de imagem ou obra',
  'Outra solicitação de privacidade',
]

export function LegalLinks({ newTab = false }: { newTab?: boolean }) {
  const attributes = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  return <nav className="legal-links" aria-label={newTab ? 'Documentos e formulário (abrem em nova aba)' : 'Documentos e formulário'}>
    <Link to="/termos" {...attributes}>Termos de Serviço</Link>
    <Link to="/privacidade" {...attributes}>Política de Privacidade</Link>
    <Link to="/lgpd" {...attributes}>Formulário LGPD</Link>
  </nav>
}

function Privacy() {
  return <>
    <p>Esta política explica como o Clube do Livro trata dados ao oferecer a biblioteca e os espaços de clubes e da comunidade.</p>
    <h2>Responsável e contato</h2>
    <p>{controller ? <>O controlador é {controller}. Para falar sobre seus dados, use o Formulário LGPD.</> : 'Documento em revisão. A identificação formal do controlador e o canal de atendimento serão preenchidos antes da publicação.'}</p>
    <h2>Dados e finalidades</h2>
    <ul>
      <li>Nome, e-mail, identificador da conta e verificação do e-mail permitem autenticar, recuperar a conta e administrar convites. Senhas são geridas pelo Firebase Auth.</li>
      <li>Biblioteca, EPUBs, notas, progresso, preferências e arquivos dão suporte à leitura e à sincronização solicitadas. Cópias locais podem permanecer no navegador ou dispositivo.</li>
      <li>Perfis, vínculos, mensagens, publicações, fotos, reações e denúncias permitem participar da comunidade e dos clubes. O acesso depende da visibilidade escolhida e das permissões do espaço.</li>
      <li>Registros operacionais e de moderação ajudam a proteger contas, investigar abusos e atender obrigações aplicáveis. O registro de aceite guarda a conta, as versões dos documentos e o horário.</li>
      <li>Quando você ativa notificações no aparelho, usamos a inscrição push para entregar os avisos selecionados. A opção pode ser desativada nas configurações do app ou do sistema.</li>
    </ul>
    <h2>Bases legais</h2>
    <p>O funcionamento solicitado da conta, das leituras e dos clubes se apoia na execução do serviço. Segurança e prevenção de abuso podem usar legítimo interesse, mediante avaliação e minimização. Obrigações legais e exercício regular de direitos podem exigir conservação de registros. Quando a lei exigir consentimento, ele é específico, informado e revogável.</p>
    <h2>Visibilidade e fornecedores</h2>
    <p>Dados de leitura pessoal ficam restritos à conta, salvo o que você escolher compartilhar. Conteúdo de clubes privados fica disponível aos integrantes autorizados. Perfis e conteúdo da comunidade seguem os controles de visibilidade, bloqueio e moderação. Administradores de clubes recebem os dados necessários para gerenciar sua participação.</p>
    <p>Usamos o Google para identidade, hospedagem, execução, banco e armazenamento. Serviços de pesquisa bibliográfica e notícias recebem consultas ou solicitações de conteúdo e imagens. Links para outros serviços seguem a política do destino. Parte da infraestrutura funciona nos Estados Unidos. {transfer || 'Os mecanismos jurídicos e as salvaguardas aplicáveis à transferência serão identificados na versão final.'}</p>
    <h2>Armazenamento no dispositivo</h2>
    <p>O navegador usa armazenamento local para sessão, opções, progresso e arquivos que você importar. O Firebase pode usar recursos do navegador para autenticação. Você pode encerrar a sessão e limpar os dados deste site nas configurações do dispositivo. Faça uma cópia das leituras locais que quiser guardar antes da limpeza.</p>
    <h2>Retenção e segurança</h2>
    <p>Conservamos os dados enquanto forem necessários para as finalidades informadas e conforme obrigações aplicáveis. Pedidos de exclusão são analisados conforme a LGPD. Cópias de recuperação têm ciclos próprios e acesso limitado. O serviço usa conexão protegida, controle de acesso por conta e clube e armazenamento de arquivos privado.</p>
    <h2>Seus direitos</h2>
    <p>Você pode pedir confirmação, acesso, correção, portabilidade e informação sobre compartilhamento. Também pode solicitar anonimização, bloqueio ou eliminação quando aplicável, revogar consentimento e apresentar oposição nos casos previstos em lei. Podemos verificar sua identidade por meio adequado antes de atender. Você pode peticionar à ANPD nos termos da LGPD.</p>
    <p><Link to="/lgpd">Exercer meus direitos pelo Formulário LGPD</Link></p>
  </>
}

function Terms() {
  return <>
    <p>Os Termos disciplinam o uso do Clube do Livro, da conta, da biblioteca e dos recursos de participação. {controller && <>O serviço é oferecido por {controller}.</>}</p>
    <h2>Uso da conta</h2>
    <p>Use seus próprios dados, mantenha a conta protegida e avise se houver uso indevido. Convites, funções de administração e participação em espaços privados seguem as permissões de cada clube.</p>
    <h2>Conteúdo e direitos</h2>
    <p>Compartilhe somente arquivos, imagens e textos próprios ou que você esteja autorizado a distribuir. A licença deve cobrir o destino escolhido. Verifique também os direitos das pessoas retratadas. Ter acesso a uma obra ou capa para leitura pessoal não concede autorização de distribuição.</p>
    <p>Você preserva seus direitos sobre o que publica. Ao escolher compartilhar, concede a permissão limitada para armazenar, exibir e disponibilizar o conteúdo ao público escolhido enquanto estiver publicado, na medida necessária ao serviço. A cópia que outra pessoa tenha feito pode persistir fora do app.</p>
    {import.meta.env.PROD && <p><a href={import.meta.env.BASE_URL + 'licencas-ativos.txt'}>Licenças das fontes e dos ícones</a></p>}
    <h2>Convivência e moderação</h2>
    <p>O app permite denunciar conteúdo e bloquear contas. Assédio, ameaças, exposição de dados pessoais e violação de direitos podem levar à remoção de conteúdo e restrição de acesso, conforme a gravidade. Use o Formulário LGPD para comunicar uso indevido de imagem ou obra e informe o link e o motivo.</p>
    <h2>Alterações e encerramento</h2>
    <p>Alterações relevantes serão informadas e podem exigir novo aceite. Você pode parar de usar o serviço, exportar os dados disponíveis no app ou pedir atendimento sobre a conta. Estes Termos preservam os direitos garantidos pela legislação brasileira, incluindo a legislação de defesa do consumidor quando aplicável.</p>
  </>
}

function RightsForm() {
  const [topic, setTopic] = useState(topics[0])
  const [details, setDetails] = useState('')
  const [prepared, setPrepared] = useState('')
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!contact) return
    const body = ['Solicitação para o Clube do Livro', topic, details.trim()].filter(Boolean).join('\n\n')
    setPrepared('mailto:' + contact + '?subject=' + encodeURIComponent('Clube do Livro — ' + topic) + '&body=' + encodeURIComponent(body))
  }
  return <>
    <p>Prepare um pedido para o canal de privacidade, mesmo sem conta no app. Você envia a mensagem pelo seu aplicativo de e-mail.</p>
    {contact ? <p>Canal de privacidade <a href={'mailto:' + contact}>{contact}</a></p> : <p role="status">Canal de atendimento em configuração. O envio ficará disponível após a confirmação do endereço de privacidade.</p>}
    <form className="rights-form" onSubmit={prepare} onChange={() => setPrepared('')}>
      <label>Tipo de solicitação<select value={topic} onChange={e => setTopic(e.target.value)}>
        {topics.map(item => <option key={item}>{item}</option>)}
      </select></label>
      <label>Informações adicionais (opcional)<textarea rows={5} maxLength={500}
        aria-describedby="rights-help" value={details} onChange={e => setDetails(e.target.value)} /></label>
      <small id="rights-help">Inclua somente o necessário. Evite senhas, documentos ou dados sensíveis.</small>
      <button className="button button--primary" disabled={!contact} type="submit">Preparar e-mail</button>
    </form>
    {prepared && <p role="status">Mensagem preparada. <a href={prepared}>Abrir e-mail para conferir e enviar</a></p>}
  </>
}

export function LegalPage({ page }: { page: 'privacy' | 'terms' | 'rights' }) {
  const title = page === 'privacy' ? 'Política de Privacidade' : page === 'terms' ? 'Termos de Serviço' : 'Formulário LGPD'
  return <main className="legal-page" aria-labelledby="legal-title">
    <Link to="/account">Acessar o Clube do Livro</Link>
    <h1 id="legal-title">{title}</h1>
    {page !== 'rights' && <p>Versão {page === 'privacy' ? privacyVersion : termsVersion}{!controller && ' · Minuta para revisão'}</p>}
    {page === 'privacy' ? <Privacy /> : page === 'terms' ? <Terms /> : <RightsForm />}
    <LegalLinks />
  </main>
}
