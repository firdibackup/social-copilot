interface MediaImageProps {
  src: string
  alt?: string
  className?: string
}

/** Photos come from short-lived signed Storage URLs, which next/image would cache past their expiry. */
export function MediaImage({ src, alt = '', className }: MediaImageProps) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />
}

/** Images from other sites (website logos, Instagram's CDN): no referrer, and plain <img> like MediaImage. */
export function ExternalImage({ src, className }: { src: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={className} />
}
