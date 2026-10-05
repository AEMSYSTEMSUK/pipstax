"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { PageContainer } from "@/components/layout/PageContainer"
import { GlassCard, GlassCardContent, GlassCardHeader, GlassCardTitle } from "@/components/glass/GlassCard"
import { GlassPanel } from "@/components/glass/GlassPanel"
import { GlassModal } from "@/components/glass/GlassModal"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Search, Folder, File, FileText, Image as ImageIcon, MoreHorizontal, UploadCloud, ChevronRight, RefreshCcw, HardDrive, CheckCircle2, Clock, ExternalLink, Cloud, Building2, Trash2 } from "lucide-react"
import { apiDelete, apiGet, apiPost, uploadWithProgress } from "@/lib/api"
import { ErrorToast } from "@/components/shared/ErrorToast"
import { DataPagination, useClientPagination } from "@/components/shared/DataPagination"
import { getModulePermissions } from "@/lib/permission-ui"
import { useSearchParams } from "next/navigation"
import { useToast } from "@/components/ui/toast"

type DocumentItem = {
    id: string
    name: string
    label?: string
    fileUrl: string
    externalId?: string
    fileSizeBytes?: number
    category?: string
    status?: string
    syncStatus?: string
    updatedAt?: string
}

type IntegrationItem = {
    provider: "GOOGLE_DRIVE" | "SHAREPOINT" | string
    status: "CONNECTED" | "DISCONNECTED" | "ERROR" | string
    isPreferred?: boolean
    metadata?: {
        rootFolderName?: string
    } | null
}

type StorageStats = {
    provider: "GOOGLE_DRIVE" | "SHAREPOINT" | string
    usedBytes: number
    totalBytes: number
    remainingBytes: number
}

type FolderItem = {
    id: string
    name: string
}

type TenantSettings = {
    documentSyncProvider?: "GOOGLE_DRIVE" | "SHAREPOINT" | string
}

const isDocumentProvider = (
    provider: unknown
): provider is "GOOGLE_DRIVE" | "SHAREPOINT" =>
    provider === "GOOGLE_DRIVE" || provider === "SHAREPOINT"

type DocumentProviderKey = "GOOGLE_DRIVE" | "SHAREPOINT"

export default function DocumentsPage() {
    const searchParams = useSearchParams()
    const { canView, canManage } = getModulePermissions("documents.view", "documents.manage")
    const { toast } = useToast()
    const [searchQuery, setSearchQuery] = useState("")
    const [documents, setDocuments] = useState<DocumentItem[]>([])
    const [connectedProvider, setConnectedProvider] = useState<"GOOGLE_DRIVE" | "SHAREPOINT" | null>(null)
    const [storageProviderName, setStorageProviderName] = useState("Google Drive")
    const [storageProviderStatus, setStorageProviderStatus] = useState<"CONNECTED" | "DISCONNECTED" | "ERROR">("DISCONNECTED")
    const [defaultSyncProvider, setDefaultSyncProvider] = useState<DocumentProviderKey | null>(null)
    const [rootFolderName, setRootFolderName] = useState("aem-storage")
    const [activeFolder, setActiveFolder] = useState<string | null>(null)
    const [availableFolders, setAvailableFolders] = useState<string[]>([])
    const [storageUsedBytes, setStorageUsedBytes] = useState<number | null>(null)
    const [storageTotalBytes, setStorageTotalBytes] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [newFolderOpen, setNewFolderOpen] = useState(false)
    const [isCreatingFolder, setIsCreatingFolder] = useState(false)
    const [newFolderName, setNewFolderName] = useState("")
    const [uploadOpen, setUploadOpen] = useState(false)
    const [isUploadingFile, setIsUploadingFile] = useState(false)
    const [uploadProgress, setUploadProgress] = useState<number | null>(null)
    const [uploadIndeterminate, setUploadIndeterminate] = useState(false)
    const [uploadingFileName, setUploadingFileName] = useState<string>("")
    const [isForceSyncing, setIsForceSyncing] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<DocumentItem | null>(null)
    const [isDeletingFile, setIsDeletingFile] = useState(false)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadForm, setUploadForm] = useState({ name: "", category: "" })

    useEffect(() => {
        if (searchParams.get("create") === "document" && canManage) {
            setUploadOpen(true)
        }
    }, [canManage, searchParams])
    const getErrorMessage = (err: unknown, fallback: string) =>
        err instanceof Error ? err.message : fallback
    const normalizeCategory = (doc: Pick<DocumentItem, "category">) =>
        doc.category?.trim() ? doc.category.trim() : "Uncategorized"
    const formatBytes = (bytes: number) => {
        if (!Number.isFinite(bytes) || bytes < 0) return "--"
        const units = ["B", "KB", "MB", "GB", "TB"]
        let value = bytes
        let unitIndex = 0
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024
            unitIndex += 1
        }
        return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
    }

    const loadDocumentsAndIntegration = useCallback(async () => {
        try {
            const [docsRes, integrationsRes, tenantSettingsRes] = await Promise.all([
                apiGet<DocumentItem[]>(`/documents`),
                apiGet<IntegrationItem[]>(`/integrations`),
                apiGet<TenantSettings>("/settings/tenant").catch(() => null)
            ])
            setDocuments(Array.isArray(docsRes.data) ? docsRes.data : [])
            const tenantPreferredProvider = isDocumentProvider(
                tenantSettingsRes?.data?.documentSyncProvider
            )
                ? tenantSettingsRes?.data?.documentSyncProvider
                : null
            const providerIntegrations = (Array.isArray(integrationsRes.data) ? integrationsRes.data : []).filter(
                (item) => item.provider === "GOOGLE_DRIVE" || item.provider === "SHAREPOINT"
            )
            const preferredFromTenant = tenantPreferredProvider
                ? providerIntegrations.find((item) => item.provider === tenantPreferredProvider)
                : undefined
            const preferred = providerIntegrations.find((item) => item.isPreferred)
            const connectedFallback = providerIntegrations.find((item) => item.status === "CONNECTED")
            const connectedFallbackProvider = connectedFallback?.provider
            setDefaultSyncProvider(
                connectedFallbackProvider === "GOOGLE_DRIVE" || connectedFallbackProvider === "SHAREPOINT"
                    ? connectedFallbackProvider
                    : null
            )
            const selected =
                preferredFromTenant ??
                preferred ??
                connectedFallback ??
                providerIntegrations[0] ??
                (tenantPreferredProvider
                    ? {
                        provider: tenantPreferredProvider,
                        status: "DISCONNECTED" as const,
                        metadata: { rootFolderName: "aem-storage" },
                    }
                    : null)

            if (selected) {
                const selectedProvider =
                    selected.provider === "SHAREPOINT"
                        ? "SHAREPOINT"
                        : selected.provider === "GOOGLE_DRIVE"
                            ? "GOOGLE_DRIVE"
                            : null
                const isConnected = Boolean(selectedProvider && selected.status === "CONNECTED")
                setConnectedProvider(isConnected ? selectedProvider : null)
                setStorageProviderName(
                    selected.provider === "SHAREPOINT" ? "SharePoint" : "Google Drive"
                )
                setStorageProviderStatus(
                    selected.status === "CONNECTED"
                        ? "CONNECTED"
                        : selected.status === "ERROR"
                            ? "ERROR"
                            : "DISCONNECTED"
                )
                setRootFolderName(selected.metadata?.rootFolderName?.trim() || "aem-storage")
                try {
                    if (isConnected && selectedProvider) {
                        const foldersRes = await apiGet<FolderItem[]>(
                            `/integrations/${selectedProvider}/folders`
                        )
                        const names = (Array.isArray(foldersRes.data) ? foldersRes.data : [])
                            .map((folder) => folder.name?.trim())
                            .filter((name): name is string => Boolean(name))
                        setAvailableFolders(Array.from(new Set(names)).sort((a, b) => a.localeCompare(b)))
                    } else {
                        setAvailableFolders([])
                    }
                } catch {
                    setAvailableFolders([])
                }
                try {
                    if (isConnected && selectedProvider) {
                        const statsRes = await apiGet<StorageStats>(
                            `/integrations/${selectedProvider}/storage-stats`
                        )
                        setStorageUsedBytes(statsRes.data?.usedBytes ?? 0)
                        setStorageTotalBytes(statsRes.data?.totalBytes ?? 0)
                    } else {
                        setStorageUsedBytes(null)
                        setStorageTotalBytes(null)
                    }
                } catch {
                    setStorageUsedBytes(null)
                    setStorageTotalBytes(null)
                }
            } else {
                setConnectedProvider(null)
                setAvailableFolders([])
                setDefaultSyncProvider(null)
                setStorageProviderName(
                    tenantPreferredProvider === "SHAREPOINT" ? "SharePoint" : "Google Drive"
                )
                setStorageProviderStatus("DISCONNECTED")
                setStorageUsedBytes(null)
                setStorageTotalBytes(null)
            }
            setActiveFolder(null)
            setError(null)
        } catch (err: unknown) {
            setError(getErrorMessage(err, "Failed to load documents"))
        }
    }, [])

    useEffect(() => {
        loadDocumentsAndIntegration()
    }, [loadDocumentsAndIntegration])

    const handleForceSync = async () => {
        try {
            if (!canManage) {
                toast({
                    title: "Insufficient permissions",
                    description: "You can view documents but cannot run sync.",
                    variant: "error",
                })
                return
            }
            if (!connectedProvider) {
                toast({
                    title: "No provider connected",
                    description: "Connect Google Drive or SharePoint first.",
                    variant: "error",
                })
                return
            }
            setIsForceSyncing(true)
            const res = await apiPost(`/integrations/${connectedProvider}/sync-now`, {})
            const pull = (res.data as { pull?: { imported?: number; updated?: number } } | undefined)?.pull
            const imported = pull?.imported ?? 0
            const updated = pull?.updated ?? 0
            toast({
                title: "Sync completed",
                description:
                    res.message ??
                    `Force sync finished. Imported ${imported} and updated ${updated} files.`,
                variant: "success",
            })
            await loadDocumentsAndIntegration()
        } catch (err: unknown) {
            const message = getErrorMessage(err, "Failed to force sync")
            setError(message)
            toast({
                title: "Sync failed",
                description: message,
                variant: "error",
            })
        } finally {
            setIsForceSyncing(false)
        }
    }

    const handleCreateFolder = async () => {
        try {
            if (!canManage) return
            if (!connectedProvider) {
                toast({
                    title: "No provider connected",
                    description: "Connect Google Drive or SharePoint first.",
                    variant: "error",
                })
                return
            }
            const name = newFolderName.trim()
            if (!name) {
                toast({
                    title: "Folder name required",
                    description: "Please enter a folder name.",
                    variant: "error",
                })
                return
            }
            setIsCreatingFolder(true)
            const res = await apiPost<{ id: string; name: string; existing?: boolean }>(
                `/integrations/${connectedProvider}/folders`,
                { name }
            )
            const createdName = res.data?.name?.trim() || name
            setAvailableFolders((prev) =>
                Array.from(new Set([...prev, createdName])).sort((a, b) => a.localeCompare(b))
            )
            setUploadForm((prev) => ({ ...prev, category: createdName }))
            setNewFolderName("")
            setNewFolderOpen(false)
            toast({
                title: res.data?.existing ? "Folder already exists" : "Folder created",
                description: `"${createdName}" is ready for uploads.`,
                variant: "success",
            })
        } catch (err: unknown) {
            const message = getErrorMessage(err, "Failed to create folder")
            setError(message)
            toast({
                title: "Folder create failed",
                description: message,
                variant: "error",
            })
        } finally {
            setIsCreatingFolder(false)
        }
    }

    const handleUploadDocument = async () => {
        try {
            if (!canManage) return
            const selectedFolder = uploadForm.category.trim()
            if (!selectedFolder) {
                toast({
                    title: "Select folder",
                    description: "Select a folder or create a new one before upload.",
                    variant: "error",
                })
                return
            }
            if (!uploadFile) {
                toast({
                    title: "File required",
                    description: "Please choose a file to upload.",
                    variant: "error",
                })
                return
            }
            setIsUploadingFile(true)
            const formData = new FormData()
            const documentName = uploadForm.name.trim() || uploadFile.name
            setUploadingFileName(uploadFile.name)
            formData.append("file", uploadFile)
            formData.append("name", documentName)
            formData.append("category", selectedFolder)
            setUploadProgress(0)
            setUploadIndeterminate(true)
            const created = await uploadWithProgress<DocumentItem>(
                "/documents/upload-stream",
                formData,
                (percent) => {
                    if (percent === null) {
                        setUploadIndeterminate(true)
                        return
                    }
                    setUploadIndeterminate(false)
                    setUploadProgress(Math.max(1, percent))
                },
            )
            setDocuments((prev) => [created.data, ...prev])
            setUploadFile(null)
            setUploadForm({ name: "", category: selectedFolder })
            setUploadOpen(false)
            setUploadProgress(100)
            setUploadIndeterminate(false)
            toast({
                title: "File uploaded",
                description: "Document uploaded and sync queued.",
                variant: "success",
            })
            window.setTimeout(() => setUploadProgress(null), 2500)
        } catch (err: unknown) {
            const message = getErrorMessage(err, "Failed to upload file")
            setError(message)
            toast({
                title: "Upload failed",
                description: message,
                variant: "error",
            })
            window.setTimeout(() => setUploadProgress(null), 1200)
        } finally {
            setIsUploadingFile(false)
            window.setTimeout(() => setUploadIndeterminate(false), 2500)
            window.setTimeout(() => setUploadingFileName(""), 2500)
        }
    }

    const lowerSearch = searchQuery.trim().toLowerCase()
    const splitPath = (value: string) =>
        value
            .split("/")
            .map((segment) => segment.trim())
            .filter((segment) => Boolean(segment))
    const normalizedFolderPath = (value: string) => splitPath(value).join("/")
    const allFolderPaths = useMemo(() => {
        const set = new Set<string>()
        availableFolders.forEach((name) => {
            const normalized = normalizedFolderPath(name)
            if (normalized) set.add(normalized)
        })
        documents.forEach((doc) => {
            const normalized = normalizedFolderPath(normalizeCategory(doc))
            if (normalized) set.add(normalized)
        })
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [availableFolders, documents])
    const filteredDocuments = documents.filter((doc) => {
        const category = normalizedFolderPath(normalizeCategory(doc))
        const inFolder = activeFolder ? category === activeFolder : false
        const matchesSearch =
            !lowerSearch ||
            doc.name.toLowerCase().includes(lowerSearch) ||
            category.toLowerCase().includes(lowerSearch)
        return inFolder && matchesSearch
    })
    const documentsPagination = useClientPagination(filteredDocuments)
    const storageUsageText =
        storageUsedBytes !== null && storageTotalBytes !== null && storageTotalBytes > 0
            ? `${formatBytes(storageUsedBytes)} / ${formatBytes(storageTotalBytes)}`
            : "Unavailable"
    const storageUsagePct =
        storageUsedBytes !== null && storageTotalBytes !== null && storageTotalBytes > 0
            ? Math.max(0, Math.min(100, (storageUsedBytes / storageTotalBytes) * 100))
            : 0

    const folders = useMemo(() => {
        const map = new Map<string, { id: string; name: string; fullPath: string; lastModified: string; files: number }>()
        const upsert = (fullPath: string) => {
            const normalizedPath = normalizedFolderPath(fullPath)
            if (!normalizedPath) return
            const pathSegments = splitPath(normalizedPath)
            if (pathSegments.length === 0) return

            let visiblePath = pathSegments[0]
            if (activeFolder) {
                const activeSegments = splitPath(activeFolder)
                let matchesParent = true
                for (let i = 0; i < activeSegments.length; i += 1) {
                    if (pathSegments[i] !== activeSegments[i]) {
                        matchesParent = false
                        break
                    }
                }
                if (!matchesParent || pathSegments.length <= activeSegments.length) return
                visiblePath = pathSegments.slice(0, activeSegments.length + 1).join("/")
            }
            const label = splitPath(visiblePath).slice(-1)[0] ?? visiblePath
            if (!map.has(visiblePath)) {
                map.set(visiblePath, {
                    id: visiblePath.toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-"),
                    name: label,
                    fullPath: visiblePath,
                    lastModified: "",
                    files: 0,
                })
            }
        }

        allFolderPaths.forEach(upsert)

        documents.forEach((doc) => {
            const category = normalizedFolderPath(normalizeCategory(doc))
            const targetFolder = activeFolder
                ? category
                : splitPath(category)[0] ?? category
            const normalizedTarget = normalizedFolderPath(targetFolder)
            const existing = map.get(normalizedTarget)
            if (!existing) return
            existing.files += 1
            if (doc.updatedAt && doc.updatedAt > existing.lastModified) {
                existing.lastModified = doc.updatedAt
            }
        })
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
    }, [activeFolder, allFolderPaths, documents])
    const allFolderNames = useMemo(() => allFolderPaths, [allFolderPaths])
    const visibleFolders = useMemo(() => {
        if (!lowerSearch) return folders
        return folders.filter((folder) => folder.name.toLowerCase().includes(lowerSearch))
    }, [activeFolder, folders, lowerSearch])
    const activeFolderSegments = activeFolder ? splitPath(activeFolder) : []

    const getFileIcon = (type: string) => {
        switch (type) {
            case 'pdf': return <FileText className="h-5 w-5 text-red-500" />
            case 'image': return <ImageIcon className="h-5 w-5 text-blue-500" />
            case 'doc': return <FileText className="h-5 w-5 text-blue-600" />
            default: return <File className="h-5 w-5 text-muted-foreground" />
        }
    }

    const getSyncBadgeClass = (status: string) => {
        const normalized = status.toLowerCase()
        if (normalized === "synced") {
            return "bg-emerald-50 border-emerald-200 text-emerald-700"
        }
        if (normalized === "pending") {
            return "bg-amber-50 border-amber-200 text-amber-700"
        }
        if (normalized === "error" || normalized === "errored" || normalized === "failed") {
            return "bg-red-50 border-red-200 text-red-700"
        }
        return "bg-white/50 border-glass-border text-muted-foreground"
    }

    const resolveDocumentProvider = (doc: DocumentItem): DocumentProviderKey | null => {
        const syncProviderPrefix = typeof doc.externalId === "string" ? doc.externalId.split(":")[0] : ""
        if (syncProviderPrefix === "SHAREPOINT" || syncProviderPrefix === "GOOGLE_DRIVE") {
            return syncProviderPrefix
        }
        const lowerUrl = doc.fileUrl?.toLowerCase() ?? ""
        if (lowerUrl.includes("drive.google.com/")) return "GOOGLE_DRIVE"
        if (lowerUrl.includes("sharepoint.com/") || lowerUrl.includes("graph.microsoft.com/")) return "SHAREPOINT"
        return defaultSyncProvider
    }

    const getProviderIcon = (provider: DocumentProviderKey, className = "h-3.5 w-3.5") =>
        provider === "SHAREPOINT" ? (
            <Building2 className={className} />
        ) : (
            <Cloud className={className} />
        )

    const openFile = (url?: string) => {
        const trimmed = url?.trim()
        if (!trimmed) {
            toast({
                title: "File unavailable",
                description: "This file does not have a valid URL yet.",
                variant: "error",
            })
            return
        }
        window.open(trimmed, "_blank", "noopener,noreferrer")
    }

    const handleDeleteFile = async () => {
        if (!deleteTarget) return
        try {
            setIsDeletingFile(true)
            const response = await apiDelete<{ warnings?: string[] }>(`/documents/${deleteTarget.id}`, { confirmed: true })
            const warnings = Array.isArray(response.data?.warnings) ? response.data.warnings : []
            setDocuments((prev) => prev.filter((doc) => doc.id !== deleteTarget.id))
            setDeleteTarget(null)
            toast({
                title: warnings.length > 0 ? "Deleted with warnings" : "File deleted",
                description: warnings.length > 0 ? warnings.join(" | ") : "File removed from CRM and cleanup attempted.",
                variant: warnings.length > 0 ? "error" : "success",
            })
        } catch (err: unknown) {
            const message = getErrorMessage(err, "Failed to delete file")
            toast({
                title: "Delete failed",
                description: message,
                variant: "error",
            })
        } finally {
            setIsDeletingFile(false)
        }
    }

    return (
        <PageContainer>
            {!canView ? (
                <GlassCard>
                    <GlassCardHeader>
                        <GlassCardTitle>Documents</GlassCardTitle>
                    </GlassCardHeader>
                    <GlassCardContent>You do not have access to view documents.</GlassCardContent>
                </GlassCard>
            ) : (
            <>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-foreground">Document Shadowing</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Two-way sync with your Google Drive or SharePoint.</p>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end">
                    {(isUploadingFile || typeof uploadProgress === "number") && (
                        <div className="w-full sm:w-[300px] rounded-lg border border-glass-border bg-white/60 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-medium text-foreground truncate">
                                    {uploadingFileName || "Uploading file"}
                                </p>
                                {!uploadIndeterminate && typeof uploadProgress === "number" ? (
                                    <span className="text-[11px] font-semibold text-muted-foreground">
                                        {uploadProgress}%
                                    </span>
                                ) : (
                                    <span className="text-[11px] font-semibold text-muted-foreground">
                                        Uploading...
                                    </span>
                                )}
                            </div>
                            <div className="mt-1.5 h-2.5 w-full rounded-full bg-black/10 overflow-hidden">
                                {uploadIndeterminate ? (
                                    <div className="h-full w-2/5 bg-primary/80 animate-pulse" />
                                ) : (
                                    <div
                                        className="h-full bg-primary transition-all duration-200"
                                        style={{ width: `${uploadProgress ?? 0}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                    <GlassModal
                        open={newFolderOpen}
                        onOpenChange={setNewFolderOpen}
                        trigger={
                            <Button variant="outline" className="gap-2 bg-white/40" disabled={!canManage}>
                                <Folder className="h-4 w-4" /> New Folder
                            </Button>
                        }
                        title="Create Folder"
                        description="Create a new folder directly inside your connected storage root."
                        footer={
                            <div className="flex justify-end gap-2 w-full">
                                <Button variant="outline" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                                <Button onClick={handleCreateFolder} disabled={isCreatingFolder || !canManage}>
                                    {isCreatingFolder ? "Creating..." : "Create Folder"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-2">
                            <Label required>Folder Name</Label>
                            <Input
                                placeholder="e.g. Service Reports"
                                value={newFolderName}
                                onChange={(e) => setNewFolderName(e.target.value)}
                                disabled={!canManage || isCreatingFolder}
                            />
                        </div>
                    </GlassModal>
                    <GlassModal
                        open={uploadOpen}
                        onOpenChange={(open) => {
                            setUploadOpen(open)
                            if (open) {
                                setUploadForm((prev) => ({
                                    ...prev,
                                    category: prev.category || activeFolder || allFolderNames[0] || "",
                                }))
                            }
                        }}
                        trigger={
                            <Button className="gap-2" disabled={!canManage}>
                                <UploadCloud className="h-4 w-4" /> Upload File
                            </Button>
                        }
                        title="Upload Document"
                        description="Add a document and sync it to your connected storage."
                        footer={
                            <div className="flex justify-end gap-2 w-full">
                                <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
                                <Button onClick={handleUploadDocument} disabled={!canManage || isUploadingFile}>
                                    {isUploadingFile ? "Uploading..." : "Upload"}
                                </Button>
                            </div>
                        }
                    >
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label optional>Document Name</Label>
                                <Input
                                    placeholder="Leave empty to use file name"
                                    value={uploadForm.name}
                                    onChange={(e) => setUploadForm((prev) => ({ ...prev, name: e.target.value }))}
                                    disabled={!canManage || isUploadingFile}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label optional>Folder</Label>
                                <div className="flex gap-2">
                                    <select
                                        className="h-10 flex-1 rounded-md border border-input bg-transparent px-3 text-sm"
                                        value={uploadForm.category}
                                        onChange={(e) => setUploadForm((prev) => ({ ...prev, category: e.target.value }))}
                                        disabled={!canManage || isUploadingFile}
                                    >
                                        <option value="">Select folder</option>
                                        {allFolderNames.map((folder) => (
                                            <option key={folder} value={folder}>{folder}</option>
                                        ))}
                                    </select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setNewFolderOpen(true)}
                                        disabled={!canManage || isUploadingFile}
                                    >
                                        New
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label required>Choose File</Label>
                                <Input
                                    type="file"
                                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                                    disabled={!canManage || isUploadingFile}
                                />
                                {(isUploadingFile || typeof uploadProgress === "number") && (
                                    <div className="space-y-1">
                                        <div className="h-2 w-full rounded-full bg-black/10 overflow-hidden">
                                            {uploadIndeterminate ? (
                                                <div className="h-full w-2/5 bg-primary/80 animate-pulse" />
                                            ) : (
                                                <div
                                                    className="h-full bg-primary transition-all duration-200"
                                                    style={{ width: `${uploadProgress ?? 0}%` }}
                                                />
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            {!uploadIndeterminate && typeof uploadProgress === "number"
                                                ? `${uploadingFileName || "file"} (${uploadProgress}%)`
                                                : `${uploadingFileName || "file"} (uploading...)`}
                                        </p>
                                    </div>
                                )}
                                {uploadFile?.name ? (
                                    <p className="text-xs text-muted-foreground">
                                        Selected: {uploadFile.name}
                                    </p>
                                ) : null}
                            </div>
                        </div>
                    </GlassModal>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Drive Status Panel */}
                <div className="md:col-span-1 space-y-6">
                    <GlassCard>
                        <GlassCardContent className="pt-6">
                            <div className="flex flex-col items-center text-center">
                                <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3 border border-blue-100 shadow-sm">
                                    <HardDrive className="h-6 w-6" />
                                </div>
                                <h3 className="font-semibold text-lg">{storageProviderName}</h3>
                                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                    {storageProviderStatus === "CONNECTED" ? (
                                        <>
                                            <CheckCircle2 className="h-3 w-3 text-success" /> Connected & Syncing
                                        </>
                                    ) : storageProviderStatus === "ERROR" ? (
                                        <>
                                            <Clock className="h-3 w-3 text-red-600" /> Connection Error
                                        </>
                                    ) : (
                                        <>
                                            <Clock className="h-3 w-3 text-muted-foreground" /> Not Connected
                                        </>
                                    )}
                                </p>

                                <div className="w-full mt-6 space-y-2">
                                    <div className="flex justify-between text-xs text-muted-foreground">
                                        <span>Storage Used</span>
                                        <span>{storageUsageText}</span>
                                    </div>
                                    <div className="w-full bg-black/5 h-2 rounded-full overflow-hidden">
                                        <div
                                            className="bg-blue-600 h-full transition-all duration-500"
                                            style={{ width: `${storageUsagePct}%` }}
                                        />
                                    </div>
                                </div>

                                <Button
                                    variant="outline"
                                    className="w-full mt-6 bg-white/40 gap-2"
                                    disabled={!canManage || isForceSyncing || !connectedProvider}
                                    onClick={handleForceSync}
                                >
                                    <RefreshCcw className={`h-4 w-4 ${isForceSyncing ? "animate-spin" : ""}`} />
                                    {isForceSyncing ? "Syncing..." : "Force Sync Now"}
                                </Button>
                            </div>
                        </GlassCardContent>
                    </GlassCard>

                    <GlassCard>
                        <GlassCardHeader className="pb-3 border-b border-glass-border">
                            <GlassCardTitle className="text-sm">Storage Areas</GlassCardTitle>
                        </GlassCardHeader>
                        <GlassCardContent className="p-0">
                            <div className="flex flex-col">
                                <button
                                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors text-left ${
                                        activeFolder === null
                                            ? "bg-primary/5 text-primary"
                                            : "text-muted-foreground hover:bg-black/5"
                                    }`}
                                    onClick={() => setActiveFolder(null)}
                                >
                                    <HardDrive className="h-4 w-4" /> {rootFolderName}
                                </button>
                            </div>
                        </GlassCardContent>
                    </GlassCard>
                </div>

                {/* Main Browser Area */}
                <div className="md:col-span-3 flex flex-col gap-4">
                    <GlassPanel className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div className="flex items-center text-sm font-medium text-muted-foreground overflow-x-auto whitespace-nowrap hide-scrollbar">
                            <button
                                type="button"
                                className="hover:text-foreground transition-colors"
                                onClick={() => setActiveFolder(null)}
                            >
                                {storageProviderName}
                            </button>
                            <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
                            <button
                                type="button"
                                className={`transition-colors ${
                                    activeFolder ? "cursor-pointer hover:text-foreground" : "text-foreground"
                                }`}
                                onClick={() => {
                                    if (activeFolder) setActiveFolder(null)
                                }}
                            >
                                {rootFolderName}
                            </button>
                            {activeFolderSegments.map((segment, index) => {
                                const partialPath = activeFolderSegments.slice(0, index + 1).join("/")
                                const isLast = index === activeFolderSegments.length - 1
                                return (
                                <Fragment key={`${partialPath}-${index}`}>
                                    <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" />
                                    <button
                                        type="button"
                                        className={`transition-colors ${isLast ? "text-foreground" : "hover:text-foreground"}`}
                                        onClick={() => setActiveFolder(partialPath)}
                                    >
                                        {segment}
                                    </button>
                                </Fragment>
                                )
                            })}
                        </div>

                        <div className="relative w-full sm:w-64 shrink-0">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search files..."
                                className="pl-9 bg-white/40 h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </GlassPanel>

                    <GlassCard className="flex-1">
                        <GlassCardContent className="p-0">
                            <Table>
                                <TableHeader className="bg-black/5">
                                    <TableRow className="hover:bg-transparent border-glass-border">
                                        <TableHead>Name</TableHead>
                                        <TableHead className="w-[120px]">Sync</TableHead>
                                        <TableHead>Last Modified</TableHead>
                                        <TableHead>Size</TableHead>
                                        <TableHead className="w-[50px]"></TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* Folders first */}
                                    {visibleFolders.map((folder) => (
                                        <TableRow
                                            key={folder.id}
                                            className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer group"
                                            onClick={() => setActiveFolder(folder.fullPath)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <Folder className="h-5 w-5 text-primary fill-primary/20" />
                                                    <span className="font-medium text-sm group-hover:text-primary transition-colors">{folder.name}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs text-muted-foreground flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 w-max">
                                                    <CheckCircle2 className="h-3 w-3 text-success" /> folder
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                            {folder.lastModified
                                                ? new Date(folder.lastModified).toLocaleDateString('en-GB')
                                                : "--"}
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {folder.files} items
                                        </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* Files next */}
                                    {documentsPagination.paginatedItems.map((file) => (
                                        <TableRow
                                            key={file.id}
                                            className="border-glass-border hover:bg-black/5 transition-colors cursor-pointer group"
                                            onClick={() => openFile(file.fileUrl)}
                                        >
                                            <TableCell>
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {getFileIcon(file.name.split('.').pop() || 'file')}
                                                    <div className="min-w-0">
                                                        <span
                                                            className="font-medium text-sm truncate block"
                                                            title={file.label?.trim() || file.name}
                                                        >
                                                            {file.label?.trim() || file.name}
                                                        </span>
                                                        {file.label?.trim() ? (
                                                            <span
                                                                className="text-[11px] text-muted-foreground truncate block"
                                                                title={file.name}
                                                            >
                                                                {file.name}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className={`text-xs flex items-center gap-1.5 border px-1.5 py-0.5 rounded shadow-sm w-max ${getSyncBadgeClass(file.syncStatus ?? "pending")}`}>
                                                    {(() => {
                                                        const syncedProvider =
                                                            (file.syncStatus ?? "").toLowerCase() === "synced"
                                                                ? resolveDocumentProvider(file)
                                                                : null
                                                        return syncedProvider
                                                            ? getProviderIcon(syncedProvider, "h-3 w-3")
                                                            : null
                                                    })()}
                                                    <span className="uppercase">{file.syncStatus ?? "pending"}</span>
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {file.updatedAt
                                                    ? new Date(file.updatedAt).toLocaleDateString('en-GB')
                                                    : "--"}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {typeof file.fileSizeBytes === "number" && Number.isFinite(file.fileSizeBytes)
                                                    ? formatBytes(file.fileSizeBytes)
                                                    : "--"}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        className="h-8 w-8 p-0"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            openFile(file.fileUrl)
                                                        }}
                                                    >
                                                        <ExternalLink className="h-4 w-4" />
                                                    </Button>
                                                    {canManage && (
                                                        <Button
                                                            variant="ghost"
                                                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                setDeleteTarget(file)
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {visibleFolders.length === 0 && filteredDocuments.length === 0 && (
                                        <TableRow className="border-glass-border">
                                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                                                <div className="flex flex-col items-center gap-3">
                                                    <span>{documents.length === 0 && availableFolders.length === 0 ? "No documents or folders yet." : "No documents found."}</span>
                                                    {documents.length === 0 && availableFolders.length === 0 && canManage ? (
                                                        <div className="flex flex-wrap justify-center gap-2">
                                                            <Button size="sm" variant="outline" className="gap-2" onClick={() => setNewFolderOpen(true)}>
                                                                <Folder className="h-4 w-4" /> New Folder
                                                            </Button>
                                                            <Button size="sm" className="gap-2" onClick={() => setUploadOpen(true)}>
                                                                <UploadCloud className="h-4 w-4" /> Upload File
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
	                            </Table>
	                            <DataPagination {...documentsPagination} onPageChange={documentsPagination.setPage} />
	                        </GlassCardContent>
                    </GlassCard>
                </div>
            </div>
            <GlassModal
                open={Boolean(deleteTarget)}
                onOpenChange={(open) => {
                    if (!open) setDeleteTarget(null)
                }}
                title="Delete File?"
                description="This removes the file from CRM, local storage, and synced provider (if connected)."
                footer={
                    <div className="flex justify-end gap-2 w-full">
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                            disabled={isDeletingFile}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteFile}
                            disabled={isDeletingFile}
                        >
                            {isDeletingFile ? "Deleting..." : "Delete File"}
                        </Button>
                    </div>
                }
            >
                <p className="text-sm text-muted-foreground">
                    {deleteTarget?.name
                        ? `Are you sure you want to delete "${deleteTarget.name}"?`
                        : "Are you sure you want to delete this file?"}
                </p>
            </GlassModal>
            <ErrorToast error={error} onClear={() => setError(null)} />
            </>
            )}
        </PageContainer>
    )
}
