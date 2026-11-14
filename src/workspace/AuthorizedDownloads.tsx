import { Link } from 'react-router-dom'
import { BookOpen, Download } from 'lucide-react'
import { CoverArt } from '../components/ui'
export function AuthorizedDownloads() {
  return (
    <div className="stack-lg">
      <header className="social-heading">
        <span className="eyebrow">ARQUIVOS COM ORIGEM E PERMISSÃO</span>
        <h1>Leituras para levar com você</h1>
        <p>
          O catálogo descreve livros. Esta área separa os arquivos que podem ser baixados e as
          condições de uso de cada origem.
        </p>
      </header>
      <article className="card catalog-download">
        <CoverArt title="A cadeira perto da janela" author="Clube do Livro" />
        <div>
          <span className="eyebrow">EPUB ORIGINAL DE DEMONSTRAÇÃO</span>
          <h2>A cadeira perto da janela</h2>
          <p>
            Um conto breve, preparado para experimentar capítulos, ilustrações, marcadores e
            destaques.
          </p>
          <p>
            <strong>Origem:</strong> conteúdo original deste aplicativo. <strong>Condições:</strong>{' '}
            leitura, cópia e distribuição autorizadas com o Clube do Livro; não contém obras de
            terceiros.
          </p>
          <div className="workspace-actions">
            <a className="button-link" href="/books/a-cadeira-perto-da-janela.epub" download>
              <Download size={17} /> Baixar EPUB de demonstração
            </a>
            <Link to="/app/library?sample=welcome">Adicionar à minha biblioteca →</Link>
          </div>
        </div>
      </article>
      <section className="card">
        <h2>Outros acervos para consultar</h2>
        <p>
          Confira o formato, a edição e as condições indicadas pelo acervo antes de importar um
          arquivo. Empréstimo e leitura na plataforma de origem não autorizam redistribuição pelo
          clube.
        </p>
        <ul>
          <li>
            <a
              href="https://portal.mec.gov.br/dominio-publico"
              target="_blank"
              rel="noopener noreferrer"
            >
              Portal Domínio Público · Ministério da Educação
            </a>
          </li>
          <li>
            <a
              href="https://www12.senado.leg.br/institucional/biblioteca/faq-biblioteca"
              target="_blank"
              rel="noopener noreferrer"
            >
              Biblioteca Digital do Senado · acesso e condições do acervo
            </a>
          </li>
          <li>
            <a
              href="https://standardebooks.org/about/standard-ebooks-and-the-public-domain"
              target="_blank"
              rel="noopener noreferrer"
            >
              Standard Ebooks · condições de domínio público nos EUA
            </a>
          </li>
        </ul>
      </section>
      <section className="card">
        <BookOpen />
        <h2>Seus arquivos e os arquivos do clube</h2>
        <p>
          Os EPUBs que você importa para sua conta ficam privados. Arquivos compartilhados pela
          administração precisam de autorização própria de distribuição e acesso ao clube. Adicionar
          uma referência bibliográfica não libera um arquivo.
        </p>
        <Link to="/app/library">Abrir minha biblioteca →</Link>
      </section>
    </div>
  )
}
