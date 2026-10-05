"use client"

import { useMemo, useState } from "react"
import { Check, Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export type AutocompleteOption = {
    id?: string
    title: string
}

type CreatableAutocompleteProps = {
    value: string
    options: AutocompleteOption[]
    placeholder?: string
    emptyLabel?: string
    disabled?: boolean
    onChange: (value: string) => void
    onCreateOption?: (title: string) => Promise<AutocompleteOption | void> | AutocompleteOption | void
}

const normalize = (value: string) => value.trim().toLowerCase()

export function CreatableAutocomplete({
    value,
    options,
    placeholder = "Search or add...",
    emptyLabel = "No matches",
    disabled,
    onChange,
    onCreateOption,
}: CreatableAutocompleteProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState(value)
    const [isCreating, setIsCreating] = useState(false)

    const filteredOptions = useMemo(() => {
        const needle = normalize(query)
        return options
            .filter((option) => !needle || normalize(option.title).includes(needle))
            .slice(0, 8)
    }, [options, query])
    const canCreate =
        Boolean(onCreateOption) &&
        Boolean(query.trim()) &&
        !options.some((option) => normalize(option.title) === normalize(query))

    const selectValue = (nextValue: string) => {
        onChange(nextValue)
        setQuery(nextValue)
        setOpen(false)
    }

    const createValue = async () => {
        const title = query.trim()
        if (!title || !onCreateOption) return
        setIsCreating(true)
        try {
            const created = await onCreateOption(title)
            selectValue(created?.title ?? title)
        } finally {
            setIsCreating(false)
        }
    }

    return (
        <div className="relative">
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    className="bg-white/50 pl-9"
                    disabled={disabled}
                    placeholder={placeholder}
                    value={open ? query : value}
                    onFocus={() => {
                        setQuery(value)
                        setOpen(true)
                    }}
                    onBlur={() => setOpen(false)}
                    onChange={(event) => {
                        setQuery(event.target.value)
                        onChange(event.target.value)
                        setOpen(true)
                    }}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && canCreate) {
                            event.preventDefault()
                            void createValue()
                        }
                        if (event.key === "Escape") {
                            setOpen(false)
                        }
                    }}
                />
            </div>
            {open ? (
                <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-glass-border bg-white/95 p-1 shadow-xl backdrop-blur-xl">
                    {canCreate ? (
                        <Button
                            type="button"
                            variant="ghost"
                            className="mb-1 w-full justify-start gap-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/15"
                            disabled={isCreating}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => { void createValue() }}
                        >
                            <Plus className="h-4 w-4" />
                            {isCreating ? "Adding..." : `Add new option: "${query.trim()}"`}
                        </Button>
                    ) : onCreateOption && !query.trim() ? (
                        <div className="mb-1 rounded-lg bg-white/70 px-3 py-2 text-xs text-muted-foreground">
                            Type a new value to add it.
                        </div>
                    ) : null}
                    <div className="max-h-56 overflow-y-auto">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map((option) => {
                                const selected = normalize(option.title) === normalize(value)
                                return (
                                    <button
                                        key={option.id ?? option.title}
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-primary/10",
                                            selected && "bg-primary/10 text-primary"
                                        )}
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => selectValue(option.title)}
                                    >
                                        <span>{option.title}</span>
                                        {selected ? <Check className="h-4 w-4" /> : null}
                                    </button>
                                )
                            })
                        ) : (
                            <div className="px-3 py-2 text-sm text-muted-foreground">{emptyLabel}</div>
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}
