interface ComingSoonProps {
  title: string
  description: string
}

export function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="max-w-2xl space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
      <p className="text-zinc-500">{description}</p>
    </div>
  )
}
