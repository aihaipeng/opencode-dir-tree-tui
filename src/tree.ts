import { existsSync } from "node:fs"
import { isAbsolute, join as joinPath, posix } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { Plugin } from "@opencode/plugin/tui"

type Context = Plugin.Context

const ROOT = ""
const STORAGE_EXPANDED = "dir-tree.expanded"
const MAX_REFRESH_CONCURRENCY = 4
const exec = promisify(execFile)

interface TreeState {
  version: number
  gitVersion: number
  loadError: string | undefined
}

/**
 * The only hiding the plugin does comes from the user's explicit `hiddenDirs`
 * option — empty means show everything the server returns.
 */
export function resolveHiddenDirs(options: { hiddenDirs?: unknown } | undefined): ReadonlySet<string> {
  const raw = options?.hiddenDirs
  if (!Array.isArray(raw)) return new Set()
  return new Set(raw.filter((item): item is string => typeof item === "string" && item.length > 0))
}

/** Match a whole basename. Remember only the latest star to avoid regex backtracking. */
function matchesName(name: readonly string[], pattern: readonly string[]): boolean {
  let n = 0
  let p = 0
  let star = -1
  let retry = 0
  while (n < name.length) {
    if (pattern[p] === "*") {
      star = p++
      retry = n
    } else if (pattern[p] === "?" || pattern[p] === name[n]) {
      n++
      p++
    } else if (star !== -1) {
      p = star + 1
      n = ++retry
    } else {
      return false
    }
  }
  while (pattern[p] === "*") p++
  return p === pattern.length
}

export type GitStatus = "added" | "deleted" | "modified"

export interface TreeNode {
  name: string
  /** Normalized relative path (forward slashes, no trailing slash). "" is the root. */
  path: string
  absolute: string
  isDir: boolean
}

/** V2 `FileSystemEntry` only carries `{ path, type }` — paths relative to the requested location. */
interface FsEntry {
  path: string
  type: "file" | "directory"
}

function normalizePath(input: string): string {
  const normalized = input.replaceAll("\\", "/").replace(/\/+$/, "")
  return normalized === "." || normalized === "" ? ROOT : normalized
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return JSON.stringify(error) ?? String(error)
}

/** V2 entries contain paths relative to the requested location. */
function toNode(raw: FsEntry, directory: string): TreeNode {
  const path = normalizePath(raw.path)
  return {
    name: posix.basename(path),
    path,
    absolute: isAbsolute(path) ? path : joinPath(directory, path).replaceAll("\\", "/"),
    isDir: raw.type === "directory",
  }
}

/** VS Code order: directories first, then case-insensitive natural name order. */
function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
}

interface StatusRow {
  path: string
  status: GitStatus
}

/**
 * Full git status via the git binary — covers untracked (`??`) and staged
 * (`A`) files, which OpenCode's VCS status API does not report.
 */
async function git(directory: string, ...args: string[]): Promise<string> {
  const { stdout } = await exec("git", ["-C", directory, ...args], {
    encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 16 * 1024 * 1024,
  })
  return stdout
}

/** Parse `git status --porcelain -z` output. */
export function parsePorcelain(out: string): StatusRow[] {
  const rows: StatusRow[] = []
  const entries = out.split("\0")
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!
    if (entry.length < 4) continue
    const xy = entry.slice(0, 2)
    if (!/^[ MADRCUTX?!B]{2}$/.test(xy)) continue
    // Rename/copy source paths are separate NUL fields, even if they look like XY records.
    if (/[RC]/.test(xy)) i++
    const file = entry.slice(3)
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
  readonly context: Context
  private readonly hiddenDirs: ReadonlySet<string>
  private readonly hiddenPatterns: string[][]
  private map = new Map<string, TreeNode[]>()
  private loading = new Map<string, Promise<void>>()
  private pendingRefresh = new Set<string>()
  private expandedSet = new Set<string>([ROOT])
  private gitStatuses = new Map<string, GitStatus>()
  // Cache successful root probes only; a later git init should be discovered.
  // Nested repositories still use the workspace repository status.
  private repoRootCache: { dir: string; root: string; prefix: string } | undefined
  private readonly state: TreeState
  private readonly updateState: (mutation: (draft: TreeState) => void) => void
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
  private refreshTask: Promise<void> | undefined
  private refreshAgain = false
  private updateExpanded: (mutation: (draft: { dirs: string[] }) => void) => Promise<void>
  private activeDirectory: string | undefined
  private generation = 0
  private disposed = false

  /** Current workspace root; read live so workspace switches keep paths valid. Undefined until the location syncs. */
  private get directory(): string | undefined {
    return this.context.location?.directory
  }

  constructor(context: Context, hiddenDirs: ReadonlySet<string> = new Set()) {
    this.context = context
    this.hiddenDirs = hiddenDirs
    this.hiddenPatterns = [...hiddenDirs].filter((name) => /[*?]/.test(name)).map((name) => Array.from(name))
    // The host owns these signals, even when a plain .ts import resolves a different Solid runtime.
    const [state, updateState] = context.storage.memory<TreeState>("dir-tree.state", {
      initial: { version: 0, gitVersion: 0, loadError: undefined },
    })
    this.state = state
    this.updateState = updateState
    this.setLoadError(undefined)

    const [expanded, updateExpanded] = context.storage.store(STORAGE_EXPANDED, {
      initial: { dirs: [] as string[] },
    })
    this.updateExpanded = updateExpanded
    for (const item of expanded.dirs) {
      if (typeof item === "string") this.expandedSet.add(normalizePath(item))
    }
  }

  isExpanded(path: string): boolean {
    this.state.version
    return this.expandedSet.has(normalizePath(path))
  }

  loadError(): string | undefined {
    return this.state.loadError
  }

  private setLoadError(error: string | undefined): void {
    this.updateState((draft) => { draft.loadError = error })
  }

  toggle(path: string): void {
    const key = normalizePath(path)
    if (this.expandedSet.has(key)) {
      this.expandedSet.delete(key)
    } else {
      this.expandedSet.add(key)
      // Show cached rows immediately, then revalidate after a folded period.
      void this.requestDirectory(key, this.map.has(key))
    }
    this.persistExpanded()
    this.bump()
  }

  /** Git status for a file node (absolute path), or undefined. */
  gitStatus(node: TreeNode): GitStatus | undefined {
    this.state.gitVersion
    return this.gitStatuses.get(node.absolute)
  }

  private async fetchGitStatuses(): Promise<void> {
    const directory = this.directory
    if (!directory || this.disposed) return
    const generation = this.generation

    try {
      const probe = this.repoRootCache?.dir === directory
        ? this.repoRootCache
        : await git(directory, "rev-parse", "--show-toplevel", "--show-prefix").then(
          (out) => {
            const [root, prefix = ""] = out.replaceAll("\\", "/").split(/\r?\n/)
            return root ? { dir: directory, root, prefix: normalizePath(prefix) } : undefined
          },
          () => undefined,
        )
      if (generation !== this.generation || this.directory !== directory) return
      if (!probe) return // Retry on the next refresh: git init can happen later.
      this.repoRootCache = probe
      const next = new Map<string, GitStatus>()
      // Porcelain paths are repository-root-relative. Use Git's own prefix
      // instead of comparing absolute paths: Git may expand Windows 8.3
      // aliases or symlinks that the file API retains in location.directory.
      for (const item of parsePorcelain(await git(directory, "status", "--porcelain", "-z", "--untracked-files=all", "--", "."))) {
        const path = normalizePath(item.path)
        const local = probe.prefix === "" ? path
          : path.startsWith(`${probe.prefix}/`) ? path.slice(probe.prefix.length + 1) : undefined
        if (local !== undefined) next.set(joinPath(directory, local).replaceAll("\\", "/"), item.status)
      }
      if (generation !== this.generation || this.directory !== directory) return
      this.gitStatuses = next
      this.updateState((draft) => { draft.gitVersion++ })
    } catch {
      // Git status is a nicety; a failing status call stays silent and keeps
      // the previous colors until the next refresh succeeds.
    }
  }

  private persistExpanded(): void {
    void this.updateExpanded((draft) => {
      draft.dirs = [...this.expandedSet]
    })
  }

  private isHidden(name: string): boolean {
    if (this.hiddenDirs.has(name)) return true
    if (this.hiddenPatterns.length === 0) return false
    const characters = Array.from(name)
    return this.hiddenPatterns.some((pattern) => matchesName(characters, pattern))
  }

  async requestDirectory(dir: string, force = false): Promise<void> {
    const key = normalizePath(dir)
    // The location may not be synced yet (undefined); the server.connected /
    // project.updated listeners re-fire this, so just wait.
    const directory = this.directory
    if (!directory || this.disposed) return
    if (this.activeDirectory !== directory) {
      this.activeDirectory = directory
      this.generation++
      this.map.clear()
      this.loading.clear()
      this.pendingRefresh.clear()
      this.gitStatuses.clear()
      this.repoRootCache = undefined
      this.setLoadError(undefined)
      this.bump()
      this.updateState((draft) => { draft.gitVersion++ })
    }
    const inFlight = this.loading.get(key)
    if (inFlight) {
      // A filesystem event during a request must not be lost. Coalesce all
      // forced refreshes into one follow-up request after the current one.
      if (force) this.pendingRefresh.add(key)
      await inFlight
      await this.loading.get(key)
      return
    }
    if (!force && this.map.has(key)) return
    const generation = this.generation

    const task = (async () => {
      try {
        const result = await this.context.client.file.list({
          location: { directory },
          path: key === ROOT ? "." : key,
        })
        if (generation !== this.generation || this.directory !== directory) return

        if (result.data === undefined) throw new Error("response contained no data")

        this.map.set(
          key,
          result.data
            .map((entry) => toNode(entry, directory))
            .filter((node) => !this.isHidden(node.name))
            .sort(compareNodes),
        )
        this.setLoadError(undefined)
        this.bump()
      } catch (error) {
        if (generation === this.generation && this.directory === directory) this.handleFailure(key, error)
      } finally {
        if (generation === this.generation) {
          this.loading.delete(key)
          if (this.pendingRefresh.delete(key) && !this.disposed) void this.requestDirectory(key, true)
        }
      }
    })()
    this.loading.set(key, task)
    await task
  }

  private handleFailure(key: string, error: unknown): void {
    // Startup race: server/workspace not ready yet (nothing ever loaded).
    // Stay quiet — the server.connected event re-fires the refresh; toasting
    // every pending directory here would spam the TUI.
    if (this.map.size === 0) {
      this.setLoadError(`Waiting for workspace (${describeError(error)})`)
      return
    }
    const directory = this.directory
    if (key !== ROOT && directory && existsSync(directory) && !existsSync(joinPath(directory, key))) {
      // Directory no longer exists: drop it and its expanded subtree
      // silently. The next listing of the parent removes the row.
      this.removeDirectory(key)
      this.bump()
    } else {
      const message = `Failed to list "${key || "."}": ${describeError(error)}`
      this.setLoadError(message)
      this.context.ui.toast.show({ variant: "error", title: "Dir Tree", message, duration: 5000 })
    }
  }

  /** Remove a directory and all of its descendants from the cache/expansion. */
  private removeDirectory(key: string): void {
    const prefix = `${key}/`
    for (const entries of [this.map, this.expandedSet]) {
      for (const dir of entries.keys()) {
        if (dir === key || dir.startsWith(prefix)) entries.delete(dir)
      }
    }

    this.persistExpanded()
    this.setLoadError(undefined)
  }

  /** Refresh every directory we have data for (debounced). */
  scheduleRefresh(delay = 300): void {
    if (this.disposed) return
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined
      void this.refreshAll()
    }, delay)
  }

  /** Stop pending work; call from the plugin cleanup function. */
  dispose(): void {
    this.disposed = true
    this.generation++
    this.loading.clear()
    this.pendingRefresh.clear()
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  refreshAll(): Promise<void> {
    if (this.refreshTask) {
      this.refreshAgain = true
      return this.refreshTask
    }
    // Coalesce overlapping events/polls. Only one walk (and Git process)
    // runs at once; a change during it gets one additional pass.
    const task = Promise.resolve().then(async () => {
      try {
        do {
          this.refreshAgain = false
          await this.refreshVisible()
        } while (this.refreshAgain && !this.disposed)
      } finally {
        this.refreshTask = undefined
      }
    })
    this.refreshTask = task
    return task
  }

  private async refreshVisible(): Promise<void> {
    // Refresh only the visible expanded tree. Cached but folded directories
    // stay available for instant reopening without being polled forever.
    const directory = this.directory
    if (this.disposed || !directory) return
    await this.requestDirectory(ROOT, true)
    if (this.disposed || this.directory !== directory) return

    let frontier = [ROOT]
    const seen = new Set(frontier)
    while (frontier.length) {
      const next: string[] = []
      for (const parent of frontier) {
        for (const node of this.map.get(parent) ?? []) {
          if (!node.isDir || !this.expandedSet.has(node.path) || seen.has(node.path)) continue
          seen.add(node.path)
          next.push(node.path)
        }
      }
      for (let i = 0; i < next.length; i += MAX_REFRESH_CONCURRENCY) {
        if (this.disposed || this.directory !== directory) return
        await Promise.all(next.slice(i, i + MAX_REFRESH_CONCURRENCY)
          .map((dir) => this.requestDirectory(dir, true)))
      }
      frontier = next
    }
    if (this.disposed || this.directory !== directory) return
    await this.fetchGitStatuses()
  }

  /** Flatten visible nodes depth-first. */
  visibleRows(): Array<{ node: TreeNode; depth: number }> {
    this.state.version
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
    this.updateState((draft) => { draft.version++ })
  }
}
