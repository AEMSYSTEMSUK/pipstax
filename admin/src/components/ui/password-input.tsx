"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PasswordInputProps = Omit<React.ComponentPropsWithoutRef<typeof Input>, "type"> & {
    toggleLabel?: string
}

export function PasswordInput({ className, toggleLabel = "Toggle password visibility", ...props }: PasswordInputProps) {
    const [visible, setVisible] = React.useState(false)

    return (
        <div className="relative">
            <Input
                {...props}
                type={visible ? "text" : "password"}
                className={cn("pr-10", className)}
            />
            <button
                type="button"
                aria-label={toggleLabel}
                aria-pressed={visible}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition"
                onClick={() => setVisible((prev) => !prev)}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    )
}
