"use client"

import * as React from "react"
import { ChevronDownIcon, SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

const DEFAULT_DIAL_CODE = "+44"

const PHONE_CODE_OPTIONS = [
    { label: "+44 United Kingdom", dialCode: "+44" },
    { label: "+1 United States", dialCode: "+1" },
    { label: "+1 Canada", dialCode: "+1" },
    { label: "+91 India", dialCode: "+91" },
    { label: "+61 Australia", dialCode: "+61" },
    { label: "+43 Austria", dialCode: "+43" },
    { label: "+353 Ireland", dialCode: "+353" },
    { label: "+33 France", dialCode: "+33" },
    { label: "+49 Germany", dialCode: "+49" },
    { label: "+39 Italy", dialCode: "+39" },
    { label: "+34 Spain", dialCode: "+34" },
    { label: "+31 Netherlands", dialCode: "+31" },
    { label: "+32 Belgium", dialCode: "+32" },
    { label: "+45 Denmark", dialCode: "+45" },
    { label: "+46 Sweden", dialCode: "+46" },
    { label: "+47 Norway", dialCode: "+47" },
    { label: "+358 Finland", dialCode: "+358" },
    { label: "+41 Switzerland", dialCode: "+41" },
    { label: "+971 United Arab Emirates", dialCode: "+971" },
    { label: "+27 South Africa", dialCode: "+27" },
    { label: "+64 New Zealand", dialCode: "+64" },
    { label: "+", dialCode: "+" },
]

const parsePhoneValue = (value?: string) => {
    const trimmed = String(value ?? "").trim()
    if (!trimmed) return { dialCode: DEFAULT_DIAL_CODE, number: "" }
    const match = trimmed.match(/^(\+\d{1,4}|\+)\s*(.*)$/)
    if (!match) return { dialCode: DEFAULT_DIAL_CODE, number: trimmed }
    return { dialCode: match[1], number: match[2] ?? "" }
}

type PhoneInputProps = {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    className?: string
}

export function PhoneInput({ value, onChange, disabled = false, className }: PhoneInputProps) {
    const parsed = parsePhoneValue(value)

    const updateValue = (dialCode: string, number: string) => {
        const cleanedNumber = number.trimStart()
        onChange(cleanedNumber ? `${dialCode} ${cleanedNumber}` : dialCode)
    }

    return (
        <div className={cn("relative grid grid-cols-1 gap-2 min-[360px]:grid-cols-[140px_minmax(0,1fr)]", className)}>
            <PhoneCodeDropdown
                value={parsed.dialCode}
                onChange={(dialCode) => updateValue(dialCode, parsed.number)}
                disabled={disabled}
            />
            <Input
                type="tel"
                placeholder="7700 900000"
                value={parsed.number}
                disabled={disabled}
                onChange={(event) => updateValue(parsed.dialCode, event.target.value)}
                className="bg-white/50 min-[360px]:col-start-2 min-[360px]:row-start-1"
            />
        </div>
    )
}

function PhoneCodeDropdown({
    value,
    onChange,
    disabled = false,
}: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
}) {
    const [open, setOpen] = React.useState(false)
    const [query, setQuery] = React.useState("")
    const containerRef = React.useRef<HTMLDivElement>(null)
    const searchRef = React.useRef<HTMLInputElement>(null)
    const normalizedQuery = query.trim().toLowerCase()
    const filteredOptions = PHONE_CODE_OPTIONS.filter((country) => country.label.toLowerCase().includes(normalizedQuery))

    React.useEffect(() => {
        if (!open) return
        const handlePointerDown = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("pointerdown", handlePointerDown)
        window.setTimeout(() => searchRef.current?.focus(), 0)
        return () => document.removeEventListener("pointerdown", handlePointerDown)
    }, [open])

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={open}
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-white/50 px-3 py-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                    setQuery("")
                    setOpen((current) => !current)
                }}
            >
                <span className="truncate font-medium">{value || DEFAULT_DIAL_CODE}</span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
            </button>
            {open ? (
                <div className="absolute left-0 top-full z-50 mt-1 max-h-56 w-full min-w-72 max-w-[calc(94vw-3rem)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md min-[360px]:w-80">
                    <div className="border-b bg-popover p-2">
                        <div className="relative">
                            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                ref={searchRef}
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Search country code..."
                                className="h-9 bg-background pl-8"
                            />
                        </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto p-1" role="listbox">
                        {filteredOptions.length === 0 ? (
                            <div className="px-2 py-3 text-sm text-muted-foreground">No country codes found.</div>
                        ) : (
                            filteredOptions.map((country) => (
                                <button
                                    key={country.label}
                                    type="button"
                                    role="option"
                                    aria-selected={country.dialCode === value}
                                    className={cn(
                                        "flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                                        country.dialCode === value && "bg-accent/70 font-medium"
                                    )}
                                    onClick={() => {
                                        onChange(country.dialCode)
                                        setOpen(false)
                                    }}
                                >
                                    {country.label}
                                </button>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
