"use client"

import * as React from "react"
import { Label as LabelPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type LabelProps = React.ComponentProps<typeof LabelPrimitive.Root> & {
  required?: boolean
  optional?: boolean
}

function Label({
  className,
  children,
  required,
  optional,
  ...props
}: LabelProps) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {required ? (
        <span className="text-destructive" aria-hidden="true">*</span>
      ) : null}
    </LabelPrimitive.Root>
  )
}

export { Label }
