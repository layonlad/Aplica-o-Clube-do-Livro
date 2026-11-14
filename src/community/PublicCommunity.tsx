import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { BookOpen, Compass, PenLine } from 'lucide-react'
import type { Page, PostDto } from '../../server/src/community-contracts'
import { useAuth } from '../auth/AuthProvider'
import { readableError } from '../auth/api'
import { Button, SkeletonPage } from '../components/ui'
import { PostCard, PostComposer, kindLabels } from './ClubWall'
import { socialRead } from './social-api'
import './community.css'
export function PublicCommunity() {
  const { user } = useAuth(),
    [params] = useSearchParams(),
    selected = params.get('post'),
    author = params.get('author')
  const [page, setPage] = useState<Page<PostDto>>({ items: [], nextCursor: null }),
    [query, setQuery] = useState(''),
    [search, setSearch] = useState(''),
    [kind, setKind] = useState(params.get('kind') ?? ''),
    [tab, setTab] = useState('all'),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const filters = new URLSearchParams({
      ...(search ? { q: search } : {}),
      ...(kind ? { kind } : {}),
      ...(author ? { author } : {}),
      ...(tab === 'following' ? { following: '1' } : {}),
      ...(tab === 'saved' ? { saved: '1' } : {}),
    }).toString(),
    path = selected ? `/public/posts/${selected}` : `/public/posts?${filters}`
  useEffect(() => {
    let live = true
    setBusy(true)
    setError('')
    setPage({ items: [], nextCursor: null })
    const result = selected
      ? socialRead<PostDto>(user, path).then((post) => ({ items: [post], nextCursor: null }))
      : socialRead<Page<PostDto>>(user, path)
    result
      .then((value) => live && setPage(value))
      .catch((err) => live && setError(readableError(err)))
      .finally(() => live && setBusy(false))
    return () => {
      live = false
    }
  }, [user?.uid, user?.emailVerified, path, selected, revision])
  async function more() {
    setBusy(true)
    setError('')
    try {
      const next = await socialRead<Page<PostDto>>(
        user,
        `/public/posts?${filters}&cursor=${encodeURIComponent(page.nextCursor!)}`,
      )
      setPage((value) => ({ items: [...value.items, ...next.items], nextCursor: next.nextCursor }))
    } catch (err) {
      setError(readableError(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="social-room stack-lg">
      <header className="social-heading">
        <span className="eyebrow">COMUNIDADE LITERÁRIA</span>
        <h1>As leituras nos encontram</h1>
        <p>Ideias, livros e pessoas para além de um só clube. Este espaço é público.</p>
        <Link className="text-link" to="/app/explore">
          <Compass size={17} /> Explorar leitores e livros
        </Link>
      </header>
      {selected ? (
        <Link to="/app/community">← Voltar à comunidade</Link>
      ) : (
        <>
          {user?.emailVerified ? (
            <>
              <PostComposer clubId={null} onPublished={() => setRevision((value) => value + 1)} />
              <p className="t-caption">
                As publicações usam seu{' '}
                <Link to="/app/social-profile">perfil público e suas escolhas de privacidade</Link>.
                Seus clubes e arquivos pessoais continuam privados.
              </p>
            </>
          ) : (
            <div className="notice">
              <BookOpen size={22} />
              <p>
                Fique à vontade para ler. <Link to="/account">Entre na sua conta</Link> quando
                quiser publicar ou conversar.
              </p>
            </div>
          )}
          {/* Sem conta só existe "Toda a comunidade": um filtro de uma opção não é mostrado. */}
          {user?.emailVerified && (
            <div className="filter-pills" role="group" aria-label="Filtrar comunidade">
              {[
                ['all', 'Toda a comunidade'],
                ['following', 'Seguindo'],
                ['saved', 'Salvos'],
              ].map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={tab === value ? 'active' : ''}
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div className="wall-filters">
            <form
              className="workspace-actions"
              onSubmit={(event) => {
                event.preventDefault()
                setSearch(query.trim())
              }}
            >
              <input
                aria-label="Pesquisar na comunidade"
                placeholder="Buscar na comunidade"
                minLength={2}
                maxLength={100}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <Button variant="secondary">Pesquisar</Button>
            </form>
            <label>
              Tipo de publicação
              <select value={kind} onChange={(event) => setKind(event.target.value)}>
                <option value="">Todas</option>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
      {error && (
        <div role="alert">
          {error}
          <Button variant="ghost" onClick={() => setRevision((value) => value + 1)}>
            Tentar novamente
          </Button>
        </div>
      )}
      {busy && !page.items.length && <SkeletonPage label="Abrindo a comunidade…" />}
      <div className="social-feed">
        {page.items.map((post) => (
          <PostCard
            key={post.id}
            clubId={null}
            post={post}
            onChanged={(value) =>
              setPage((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === value.id ? value : item)),
              }))
            }
            onRemoved={() =>
              setPage((page) => ({
                ...page,
                items: page.items.filter((item) => item.id !== post.id),
              }))
            }
          />
        ))}
      </div>
      {!busy && !error && !page.items.length && (
        <div className="library-empty">
          <PenLine size={36} />
          <h2>Há espaço para novas histórias</h2>
          <p>As publicações públicas dos leitores aparecerão aqui.</p>
        </div>
      )}
      {page.nextCursor && (
        <Button disabled={busy} variant="secondary" onClick={() => void more()}>
          Mais publicações
        </Button>
      )}
    </div>
  )
}
