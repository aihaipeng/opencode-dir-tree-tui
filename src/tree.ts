import { createSignal } from "solid-js"
import type { Accessor } from "solid-js"
import { existsSync } from "node:fs"
import { isAbsolute, join as joinPath } from "node:path"
import { spawn } from "node:child_process"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"

const ROOT = ""
const EXPANDED_KEY = "opencode-dir-tree-tui.expanded"

export type GitStatus = "added" | "deleted" | "modified"

export interface TreeNode {
  name: string
  /** Normalized relative path (forward slashes, no trailing slash). "" is the root. */
  path: string
  absolute: string
  isDir: boolean
}

interface RawNode {
  name: string
  path: string
  absolute: string
  type: "file" | "directory"
  ignored: boolean
}

function normalizePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/\/+$/, "")
  return normalized === "." || normalized === "" ? ROOT : normalized
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  const e = error as {
    status?: number
    statusText?: string
    message?: string
    body?: { message?: string } | string
  }
  const parts: string[] = []
  if (typeof e?.status === "number") parts.push(String(e.status))
  if (typeof e?.statusText === "string") parts.push(e.statusText)
  const bodyMessage = typeof e?.body === "string" ? e.body : e?.body?.message
  if (typeof bodyMessage === "string" && bodyMessage.length > 0) parts.push(bodyMessage)
  if (typeof e?.message === "string" && e.message.length > 0) parts.push(e.message)
  if (parts.length === 0) return JSON.stringify(error)
  return parts.join(" ")
}

function toNode(raw: RawNode): TreeNode {
  const name = (raw.name ?? "").replace(/[\\/]+$/, "")
  return {
    name,
    path: normalizePath(raw.path),
    absolute: raw.absolute.replaceAll("\\", "/"),
    isDir: raw.type === "directory",
  }
}

interface StatusRow {
  path: string
  status: GitStatus
}

/**
 * Full git status via the git binary — covers untracked (`??`) and staged
 * (`A`) files, which OpenCode's /file/status endpoint does not report.
 */
function gitStatusRows(directory: string): Promise<StatusRow[]> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-C", directory, "status", "--porcelain", "-z"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
    let out = ""
    child.stdout!.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8")
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`git status exited with code ${code}`))
        return
      }
      resolve(parsePorcelain(out))
    })
  })
}

/** Parse `git status --porcelain -z` output. Exported for the self-check. */
export function parsePorcelain(out: string): StatusRow[] {
  const rows: StatusRow[] = []
  for (const entry of out.split("\0")) {
    if (entry.length < 4) continue
    const xy = entry.slice(0, 2)
    let file = entry.slice(3)
    const renameArrow = file.indexOf(" -> ")
    if (renameArrow !== -1) file = file.slice(renameArrow + 4)
        const status: GitStatus = xy.includes("D")
          ? "deleted"
          : xy === "??" || xy.includes("A") || xy.includes("R")
            ? "added"
            : "modified"
    rows.push({ path: file.replaceAll("\\", "/"), status })
  }
  return rows
}

export class TreeStore {
  readonly api: TuiPluginApi
  private map = new Map<string, TreeNode[]>()
  private loading = new Set<string>()
  private expandedSet = new Set<string>([ROOT])
  private gitStatuses = new Map<string, GitStatus>()
  /** Set after the first failed file.status() call: repo has no git, stop polling for it. */
  private gitUnavailable = false
  private versionSignal: Accessor<number>
  private setVersion: (value: number | ((prev: number) => number)) => number
  private loadError: Accessor<string | undefined>
  private setLoadError: (value: string | undefined) => void
  private refreshTimer: ReturnType<typeof setTimeout> | undefined

  /** Current workspace root; read live so workspace switches keep paths valid. */
  private get directory(): string {
    return this.api.state.path.directory
  }

  constructor(api: TuiPluginApi) {
    this.api = api
    const [version, setVersion] = createSignal(0)
    const [loadError, setLoadError] = createSignal<string | undefined>(undefined)
    this.versionSignal = version
    this.setVersion = setVersion
    this.loadError = loadError
    this.setLoadError = setLoadError

    const saved = api.kv.get<string[]>(EXPANDED_KEY, [])
    if (Array.isArray(saved)) {
      for (const item of saved) {
        if (typeof item === "string") this.expandedSet.add(normalizePath(item))
      }
    }
  }

  isExpanded(path: string): boolean {
    return this.expandedSet.has(normalizePath(path))
  }

  toggle(path: string): void {
    const key = normalizePath(path)
    if (this.expandedSet.has(key)) {
      this.expandedSet.delete(key)
    } else {
      this.expandedSet.add(key)
      void this.requestDirectory(key)
    }
    this.persistExpanded()
    this.bump()
  }

  /** Load the root plus every directory the user had expanded. */
  requestInitial(): void {
    void this.requestDirectory(ROOT)
    for (const dir of this.expandedSet) {
      if (dir !== ROOT) void this.requestDirectory(dir)
    }
    void this.fetchGitStatuses()
  }

  /** Git status for a file node (absolute path), or undefined. */
  gitStatus(node: TreeNode): GitStatus | undefined {
    const version = this.versionSignal()
    void version
    return this.gitStatuses.get(node.absolute)
  }

  private async fetchGitStatuses(): Promise<void> {
    if (this.gitUnavailable) return
    try {
      const next = new Map<string, GitStatus>()
      for (const item of await gitStatusRows(this.directory)) {
        const absolute = isAbsolute(item.path)
          ? item.path
          : joinPath(this.directory, item.path)
        next.set(absolute.replaceAll("\\", "/"), item.status)
      }
      this.gitStatuses = next
      this.bump()
    } catch {
      // Git status is a nicety; a failing call (e.g. no git repo) stays silent
      // and disables further polling for it. Only trust the failure once the
      // server answered at least one request — startup races would otherwise
      // disable git status in real repos forever.
      if (this.map.has(ROOT)) this.gitUnavailable = true
    }
  }

  errorSignal(): Accessor<string | undefined> {
    return this.loadError
  }

  private persistExpanded(): void {
    this.api.kv.set(EXPANDED_KEY, [...this.expandedSet])
  }

  async requestDirectory(dir: string, force = false): Promise<void> {
    const key = normalizePath(dir)
    if (this.loading.has(key)) return
    if (!force && this.map.has(key)) return

    this.loading.add(key)
    try {
      const result = await this.api.client.file.list({
        path: key === ROOT ? "." : key,
      })

      // A failed response (e.g. the directory was deleted) comes back with no
      // data instead of an exception. The server reports missing paths as a
      // generic error (not 404), so check the local filesystem instead.
      if (result.data === undefined) {
        this.handleFailure(key, result.error)
        return
      }

      const raw = (result.data ?? []) as RawNode[]
      this.map.set(key, raw.filter((node) => !node.ignored).map(toNode))
      this.loading.delete(key)
      this.setLoadError(undefined)
      this.bump()
    } catch (error) {
      this.handleFailure(key, error)
    }
  }

  private handleFailure(key: string, error: unknown): void {
    this.loading.delete(key)
    // Startup race: server/workspace not ready yet (nothing ever loaded).
    // Stay quiet — the workspace.ready event re-fires the refresh; toasting
    // every pending directory here would spam the TUI.
    if (this.map.size === 0) {
      this.setLoadError(`Waiting for workspace (${describeError(error)})`)
      this.bump()
      return
    }
    if (key !== ROOT && !existsSync(joinPath(this.directory, key))) {
      // Directory no longer exists: drop it and its expanded subtree
      // silently. The next listing of the parent removes the row.
      this.removeDirectory(key)
    } else {
      this.surfaceError(key, error)
    }
    this.bump()
  }

  private surfaceError(key: string, error: unknown): void {
    const message = describeError(error)
    this.setLoadError(`Failed to list "${key || "."}": ${message}`)
    this.api.ui.toast({
      variant: "error",
      title: "Dir Tree",
      message: `Failed to list "${key || "."}": ${message}`,
      duration: 5000,
    })
  }

  /** Remove a directory and all of its descendants from the cache/expansion. */
  private removeDirectory(key: string): void {
    const prefix = key === ROOT ? ROOT : `${key}/`

    for (const dir of [...this.map.keys()]) {
      if (dir !== ROOT && (dir === key || dir.startsWith(prefix))) {
        this.map.delete(dir)
      }
    }

    for (const dir of [...this.expandedSet]) {
      if (dir !== ROOT && (dir === key || dir.startsWith(prefix))) {
        this.expandedSet.delete(dir)
      }
    }

    this.persistExpanded()
    this.setLoadError(undefined)
  }

  /** Refresh every directory we have data for (debounced). */
  scheduleRefresh(delay = 300): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      void this.refreshAll()
    }, delay)
  }

  /** Stop pending work; call from plugin lifecycle onDispose. */
  dispose(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  private async refreshAll(): Promise<void> {
    // Re-fetch in place (no map.clear) so rows swap atomically on success
    // instead of blanking out for a frame.
    const dirs = [...this.map.keys()]
    await Promise.all(dirs.map((dir) => this.requestDirectory(dir, true)))
    await this.fetchGitStatuses()
    this.bump()
  }

  /** Flatten visible nodes depth-first. */
  visibleRows(): Array<{ node: TreeNode; depth: number }> {
    const version = this.versionSignal()
    void version
    const rows: Array<{ node: TreeNode; depth: number }> = []
    const walk = (dir: string, depth: number) => {
      const children = this.map.get(dir)
      if (!children) return
      for (const node of children) {
        rows.push({ node, depth })
        if (node.isDir && this.expandedSet.has(node.path)) {
          walk(node.path, depth + 1)
        }
      }
    }
    walk(ROOT, 0)
    return rows
  }

  private bump(): void {
    this.setVersion((value) => value + 1)
  }
}
