import { spawn } from "node:child_process"

/** Open a file or directory with the system default program. */
export function openPath(absolutePath: string): boolean {
  const cmd =
    process.platform === "win32"
      ? [process.env.ComSpec ?? "cmd.exe", "/c", "start", "", absolutePath.replaceAll("/", "\\")]
      : [process.platform === "darwin" ? "open" : "xdg-open", absolutePath]
  try {
    const child = spawn(cmd[0]!, cmd.slice(1), { detached: true, stdio: "ignore" })
    // A missing opener (e.g. no xdg-open) emits 'error' async; without a
    // listener that would crash the TUI.
    child.on("error", () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}
