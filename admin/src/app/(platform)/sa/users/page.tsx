"use client"

import { useEffect, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { apiGet } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"

export default function PlatformUsersPage() {
    const [users, setUsers] = useState<any[]>([])
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiGet<any[]>("/platform/admins")
                setUsers(Array.isArray(res.data) ? res.data : [])
            } catch (err: any) {
                setError(err?.message ?? "Failed to load platform admins")
            }
        }
        load()
    }, [])

    return (
        <PageContainer>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Platform Users</h1>
                <p className="text-muted-foreground mt-1 text-sm">All users across every workspace.</p>
            </div>

            <GlassCard>
                <GlassCardHeader className="pb-3 border-b border-glass-border/50">
                    <GlassCardTitle className="text-lg">User Directory</GlassCardTitle>
                </GlassCardHeader>
                <GlassCardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-black/5">
                            <TableRow className="border-glass-border">
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Roles</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={3} className="h-32 text-center text-muted-foreground">
                                        No platform admins found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                users.map((user) => (
                                    <TableRow key={user.id} className="border-glass-border">
                                        <TableCell className="font-medium">{user.fullName}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            {(user.roles ?? []).map((role: any) => (
                                                <Badge key={role.id} variant="secondary" className="mr-2">{role.code}</Badge>
                                            ))}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </GlassCardContent>
            </GlassCard>

            <ErrorToast error={error} onClear={() => setError(null)} />
        </PageContainer>
    )
}
