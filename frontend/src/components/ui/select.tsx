"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, PlusIcon, SearchIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type SelectCreateOption = {
  label: string
  href?: string
  onSelect?: () => void
  onCreated?: (created: unknown) => void
}

type SelectProps = React.ComponentProps<typeof SelectPrimitive.Root> & {
  createOption?: SelectCreateOption
}

const CREATE_OPTION_VALUE = "__pipstack_create_new__"
const SelectCreateOptionContext = React.createContext<SelectCreateOption | null>(null)
const SelectSearchContext = React.createContext("")

const getSearchText = (node: React.ReactNode): string => {
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(getSearchText).join(" ")
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return getSearchText(node.props.children)
  return ""
}

function Select({ createOption, onValueChange, ...props }: SelectProps) {
  const handleValueChange = (value: string) => {
    if (value === CREATE_OPTION_VALUE && createOption) {
      createOption.onSelect?.()
      if (createOption.href && typeof window !== "undefined") {
        const event = new CustomEvent("pipstack:quick-create", {
          cancelable: true,
          detail: createOption,
        })
        const shouldFallback = window.dispatchEvent(event)
        if (shouldFallback) {
          window.dispatchEvent(new CustomEvent("pipstack:quick-create-unsupported", { detail: createOption }))
        }
      }
      return
    }
    onValueChange?.(value)
  }

  return (
    <SelectCreateOptionContext.Provider value={createOption ?? null}>
      <SelectPrimitive.Root data-slot="select" onValueChange={handleValueChange} {...props} />
    </SelectCreateOptionContext.Provider>
  )
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[placeholder]:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  searchable = true,
  searchPlaceholder = "Search options...",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & {
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const createOption = React.useContext(SelectCreateOptionContext)
  const [search, setSearch] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setSearch("")
    if (searchable) {
      window.setTimeout(() => searchInputRef.current?.focus(), 0)
    }
  }, [searchable])

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectSearchContext.Provider value={search.trim().toLowerCase()}>
          {searchable ? (
            <div className="sticky top-0 z-10 border-b bg-popover p-2">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onKeyDown={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                  placeholder={searchPlaceholder}
                  className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-[3px] focus:ring-ring/50"
                />
              </div>
            </div>
          ) : null}
          <SelectScrollUpButton />
          <SelectPrimitive.Viewport
            className={cn(
              "p-1",
              position === "popper" &&
                "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-1"
            )}
          >
            {children}
            {createOption ? (
              <>
                <SelectPrimitive.Separator className="pointer-events-none -mx-1 my-1 h-px bg-border" />
                <SelectPrimitive.Item
                  value={CREATE_OPTION_VALUE}
                  className="relative flex w-full cursor-pointer items-center gap-2 rounded-sm py-2 pr-8 pl-2 text-sm font-medium text-primary outline-hidden select-none focus:bg-primary/10 focus:text-primary"
                >
                  <SelectPrimitive.ItemText>
                    <span className="flex items-center gap-2">
                      <PlusIcon className="size-4" />
                      Add new {createOption.label}
                    </span>
                  </SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              </>
            ) : null}
          </SelectPrimitive.Viewport>
          <SelectScrollDownButton />
        </SelectSearchContext.Provider>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-xs text-muted-foreground", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const search = React.useContext(SelectSearchContext)
  const itemText = getSearchText(children).toLowerCase()

  if (search && !itemText.includes(search)) return null

  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-2 flex size-3.5 items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none -mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-4" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-1",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-4" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
