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
