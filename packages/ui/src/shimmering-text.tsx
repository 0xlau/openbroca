/// <reference types="vite/client" />

import './shimmering-text.css'

import { cn } from './utils'

function ShimmeringText({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="shimmering-text"
      className={cn('openbroca-shimmering-text', className)}
      {...props}
    />
  )
}

export { ShimmeringText }
