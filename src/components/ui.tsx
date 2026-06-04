import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '../lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-zinc-200 bg-white/70 text-zinc-700',
      violet: 'border-violet-200 bg-violet-50 text-violet-700',
      blue: 'border-sky-200 bg-sky-50 text-sky-700',
      amber: 'border-amber-200 bg-amber-50 text-amber-800',
    },
  },
  defaultVariants: { tone: 'neutral' },
})

export function Badge({ className, tone, ...props }: ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />
}

export function Card({ className, ...props }: ComponentProps<'article'>) {
  return <article className={cn('rounded-3xl border border-zinc-200/80 bg-white/80 shadow-sm shadow-zinc-200/60 backdrop-blur', className)} {...props} />
}

export function ButtonLink({ className, ...props }: ComponentProps<'a'>) {
  return <a className={cn('inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-700 hover:shadow-lg hover:shadow-violet-100', className)} {...props} />
}
