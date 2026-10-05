"use client"

import { KeyboardEvent, useState } from "react"
import { X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type TagChipsInputProps = {
    value: string[]
    placeholder?: string
    disabled?: boolean
    onChange: (tags: string[]) => void
}

const normalizeTag = (value: string) => value.trim()

export function TagChipsInput({
    value,
    placeholder = "Type a tag and press Enter",
    disabled,
    onChange,
}: TagChipsInputProps) {
    const [draft, setDraft] = useState("")

    const addTag = (rawTag: string) => {
        const tag = normalizeTag(rawTag)
        if (!tag) return
        const exists = value.some((current) => current.toLowerCase() === tag.toLowerCase())
        if (!exists) {
            onChange([...value, tag])
        }
        setDraft("")
    }

    const removeTag = (tag: string) => {
        onChange(value.filter((current) => current !== tag))
    }

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Enter" || event.key === ",") {
            event.preventDefault()
            addTag(draft)
        }
        if (event.key === "Backspace" && !draft && value.length > 0) {
            removeTag(value[value.length - 1])
        }
    }

    return (
        <div className="rounded-xl border border-input bg-white/50 px-3 py-2 focus-within:ring-[3px] focus-within:ring-ring/50">
            <div className="flex min-h-8 flex-wrap items-center gap-2">
                {value.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1.5 border border-glass-border bg-white/70 pr-1">
                        {tag}
                        <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:bg-black/10 hover:text-foreground"
                            disabled={disabled}
                            onClick={() => removeTag(tag)}
                        >
                            <X className="h-3 w-3" />
                            <span className="sr-only">Remove {tag}</span>
                        </button>
                    </Badge>
                ))}
                <Input
                    className="h-7 min-w-[160px] flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                    disabled={disabled}
                    placeholder={value.length === 0 ? placeholder : "Add another tag..."}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    onBlur={() => addTag(draft)}
                />
            </div>
        </div>
    )
}
