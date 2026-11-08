"use client"

import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle, GlassCardDescription } from "@/components/glass/GlassCard"
import { Badge } from "@/components/ui/badge"

export default function PlatformSettingsPage() {
    return (
        <PageContainer>
            <div className="mb-6">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">Platform Settings</h1>
                <p className="text-muted-foreground mt-1 text-sm">High-level configuration for the AEM Systems platform.</p>
            </div>

            <GlassCard>
                <GlassCardHeader>
                    <GlassCardTitle>Platform Identity</GlassCardTitle>
                    <GlassCardDescription>Global branding and environment details.</GlassCardDescription>
                </GlassCardHeader>
                <GlassCardContent className="space-y-3">
                    <div className="flex items-center justify-between border border-glass-border/60 rounded-lg p-3 bg-white/40">
                        <span className="text-sm font-medium">Platform Name</span>
                        <Badge variant="secondary">AEM Systems</Badge>
                    </div>
                    <div className="flex items-center justify-between border border-glass-border/60 rounded-lg p-3 bg-white/40">
                        <span className="text-sm font-medium">Environment</span>
                        <Badge variant="outline">Production</Badge>
                    </div>
                    <div className="flex items-center justify-between border border-glass-border/60 rounded-lg p-3 bg-white/40">
                        <span className="text-sm font-medium">Support Email</span>
                        <Badge variant="secondary">platform@aem-systems.co.uk</Badge>
                    </div>
                </GlassCardContent>
            </GlassCard>
        </PageContainer>
    )
}
