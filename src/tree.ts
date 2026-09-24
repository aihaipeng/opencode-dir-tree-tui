import { existsSync } from "node:fs"
import { isAbsolute, join as joinPath, posix } from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import type { Plugin } from "@opencode/plugin/tui"

type Context = Plugin.Context

const ROOT = ""
const STORAGE_EXPANDED = "dir-tree.expanded"
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
  private loading = new Set<string>()
  private expandedSet = new Set<string>([ROOT])
  private gitStatuses = new Map<string, GitStatus>()
  // single root probe cached until the workspace switches; late
  // `git init` in the root (or nested repos) won't get colors — restore
  // per-directory probing if nested repos ever need colors
  private repoRootCache: { dir: string; root: string | null } | undefined
  private readonly state: TreeState
  private readonly updateState: (mutation: (draft: TreeState) => void) => void
  private refreshTimer: ReturnType<typeof setTimeout> | undefined
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
      void this.requestDirectory(key)
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
      const root = this.repoRootCache?.dir === directory
        ? this.repoRootCache.root
        : await git(directory, "rev-parse", "--show-toplevel").then(
          (out) => out.trim().replaceAll("\\", "/") || null,
          () => null,
        )
      if (generation !== this.generation || this.directory !== directory) return
      this.repoRootCache = { dir: directory, root }
      if (!root) return
      const next = new Map<string, GitStatus>()
      for (const item of parsePorcelain(await git(root, "status", "--porcelain", "-z"))) {
        const absolute = isAbsolute(item.path)
          ? item.path
          : joinPath(root, item.path)
        next.set(absolute.replaceAll("\\", "/"), item.status)
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
      this.gitStatuses.clear()
      this.repoRootCache = undefined
      this.setLoadError(undefined)
      this.bump()
      this.updateState((draft) => { draft.gitVersion++ })
    }
    if (this.loading.has(key) || (!force && this.map.has(key))) return
    const generation = this.generation

    this.loading.add(key)
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
      if (generation === this.generation) this.loading.delete(key)
    }
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
    if (key !== ROOT && directory && !existsSync(joinPath(directory, key))) {
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
    if (this.refreshTimer) clearTimeout(this.refreshTimer)
    this.refreshTimer = undefined
  }

  async refreshAll(): Promise<void> {
    // Re-fetch in place (no map.clear) so rows swap atomically on success
    // instead of blanking out for a frame.
    if (this.disposed || !this.directory) return
    const dirs = new Set([ROOT, ...this.expandedSet,
      ...(this.activeDirectory === this.directory ? this.map.keys() : []),
    ])
    await Promise.all([...dirs].map((dir) => this.requestDirectory(dir, true)))
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
