import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PostMedia } from '../../server/src/community-contracts'
import { PrivateMedia } from './PrivateMedia'

export function MediaCarousel({
  media,
  alt,
  publicMedia = false,
}: {
  media: PostMedia[]
  alt: string
  publicMedia?: boolean
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  if (!media.length) return null
  function move(index: number) {
    const element = rail.current
    if (!element) return
    element.scrollTo({
      left: index * element.clientWidth,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }
  const current = media[Math.min(active, media.length - 1)]
  return (
    <div
      className="media-carousel"
      role="region"
      aria-roledescription="carrossel"
      aria-label="Fotos da publicação"
    >
      <div
        ref={rail}
        className="media-carousel__rail"
        style={{ aspectRatio: `${current.width}/${current.height}` }}
        onScroll={(event) => {
          const el = event.currentTarget
          if (el.clientWidth)
            setActive(
              Math.min(media.length - 1, Math.max(0, Math.round(el.scrollLeft / el.clientWidth))),
            )
        }}
        tabIndex={media.length > 1 ? 0 : undefined}
        onKeyDown={(event) => {
          if (event.key === 'ArrowRight') {
            event.preventDefault()
            move(Math.min(media.length - 1, active + 1))
          }
          if (event.key === 'ArrowLeft') {
            event.preventDefault()
            move(Math.max(0, active - 1))
          }
        }}
      >
        {media.map((item, index) => (
          <div
            className="media-carousel__slide"
            key={item.id}
            role="group"
            aria-roledescription="foto"
            aria-label={`${index + 1} de ${media.length}`}
          >
            <PrivateMedia media={item} alt={alt} publicMedia={publicMedia} feed />
          </div>
        ))}
      </div>
      {media.length > 1 && (
        <div className="media-carousel__controls">
          <button
            className="icon-button"
            type="button"
            aria-label="Foto anterior"
            disabled={active === 0}
            onClick={() => move(active - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span aria-live="polite">
            {active + 1} / {media.length}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Próxima foto"
            disabled={active === media.length - 1}
            onClick={() => move(active + 1)}
          >
            <ChevronRight size={20} />
          </button>
        </div>
      )}
    </div>
  )
}
