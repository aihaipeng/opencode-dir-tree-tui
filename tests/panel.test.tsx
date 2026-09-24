/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createStore, produce } from "solid-js/store"
import type { Plugin } from "@opencode/plugin/tui"
import { DIR_COLORS, GIT_STATUS_COLORS } from "../src/components/dir-tree-panel"
const { default: plugin } = await import(process.env.PLUGIN_TEST_ENTRY ?? "../src/tui")

// Git colors are fixed VS Code family values, not theme tokens — the
// whole point is that they must not drift with the active OpenCode theme.
test("git status colors are fixed VS Code values for both theme modes", () => {
  const expected = {
    dark: {
      added: "#73c991", // SCM added green
      modified: "#cca700", // classic modification yellow
      deleted: "#f14c4c", // list error red
    },
    light: {
      added: "#388138", // official light gitDecoration defaults below
      modified: "#895503",
      deleted: "#ad0707",
    },
  } as const
  for (const mode of ["dark", "light"] as const) {
    for (const status of ["added", "modified", "deleted"] as const) {
      expect(GIT_STATUS_COLORS[mode][status].hex).toBe(RGBA.fromHex(expected[mode][status]).hex)
    }
  }
})

// Directories are a fixed blue for the same reason: must not drift with the
// theme and must never collide with the green/yellow/red git states.
test("directory color is a fixed mid-tone blue for both theme modes", () => {
  expect(DIR_COLORS.dark.hex).toBe(RGBA.fromHex("#569cd6").hex)
  expect(DIR_COLORS.light.hex).toBe(RGBA.fromHex("#0969da").hex)
})

test("real panel handles mouse expansion, header collapse/reopen, and cleanup", async () => {
  let render!: () => any
  let unregistered = false
  let calls = 0
  let extraFile = false
  let empty = false
  let rootListed = Promise.withResolvers<void>()
  const longName = "很长的文件名称😀-very-long-file-name.ts"
  const toastMessages: string[] = []
  const white = RGBA.fromHex("#ffffff")
  const events = new Map<string, () => void>()
  const storage = (_key: string, options: { initial: object }) => {
    const [state, setState] = createStore(options.initial)
    return [state, (mutation: (draft: object) => void) => setState(produce(mutation))]
  }
  const context = {
    location: { directory: tmpdir() },
    options: { hiddenDirs: ["hidden"] },
    storage: { memory: storage, store: storage },
    themeMode: "dark",
    theme: { text: { base: white, muted: white, feedback: {
      success: { base: white }, error: { base: white }, warning: { base: white },
    } } },
    client: { file: { list: async ({ path }: { path: string }) => {
      calls++
      if (path === ".") rootListed.resolve()
      return { data: empty ? [] : path === "." ? [
        { path: "src\\", type: "directory" },
        { path: "hidden\\", type: "directory" },
        { path: longName, type: "file" },
        ...(extraFile ? [{ path: "fresh.ts", type: "file" }] : []),
      ] : [{ path: "src\\index.ts", type: "file" }] }
    } } },
    data: { on: (name: string, fn: () => void) => {
      events.set(name, fn)
      return () => { events.delete(name) }
    } },
    ui: {
      slot: (options: { render: () => any }) => {
        render = options.render
        return () => { unregistered = true }
      },
      toast: { show: ({ message }: { message: string }) => { toastMessages.push(message) } },
    },
  } as unknown as Plugin.Context
  const cleanup = plugin.setup!(context) as () => void
  const view = await testRender(() => <box width="100%" height={16}><scrollbox>{render()}</scrollbox></box>, {
    width: 40, height: 20,
  })
  try {
    await view.waitForFrame((frame) => frame.includes("▸ src"))
    expect(view.captureCharFrame()).not.toContain("hidden")
    view.resize(80, 20)
    await view.waitForFrame((frame) => frame.includes(longName))
    view.resize(20, 20)
    await view.waitForFrame((frame) => !frame.includes(longName) && frame.includes("..."))
    const narrow = view.captureCharFrame()
    expect(narrow.split("\n").some((line) => line.includes("...") && line.trimEnd().endsWith(".ts"))).toBe(true)
    expect(narrow).not.toContain("�")
    view.resize(80, 20)
    await view.waitForFrame((frame) => frame.includes(longName))
    await view.mockMouse.click(2, 1)
    await view.waitForFrame((frame) => frame.includes("index.ts"))
    expect(view.captureCharFrame()).toContain("▾ src")
    await view.mockMouse.click(2, 1)
    await view.waitForFrame((frame) => !frame.includes("index.ts"))
    const cachedCalls = calls
    await view.mockMouse.click(2, 1)
    await view.waitForFrame((frame) => frame.includes("index.ts"))
    expect(calls).toBe(cachedCalls)

    await view.mockMouse.click(2, 0)
    await view.waitForFrame((frame) => frame.includes("▶ Dir Tree"))
    expect(view.captureCharFrame()).not.toContain("index.ts")
    extraFile = true
    rootListed = Promise.withResolvers<void>()
    await view.mockMouse.click(2, 0)
    await rootListed.promise
    await view.waitForFrame((frame) => frame.includes("fresh.ts"))
    expect(view.captureCharFrame()).toContain("index.ts")
    expect(toastMessages).toEqual([])

    empty = true
    // Frame waits stop at visual idle; wait for the debounced request first.
    rootListed = Promise.withResolvers<void>()
    events.get("server.connected")!()
    await rootListed.promise
    await view.waitForFrame((frame) => frame.includes("No files listed"))
    empty = false
    rootListed = Promise.withResolvers<void>()
    events.get("server.connected")!()
    await rootListed.promise
    await view.waitForFrame((frame) => frame.includes("▾ src") && !frame.includes("No files listed"))
  } finally {
    cleanup()
    view.renderer.destroy()
  }
  expect(unregistered).toBe(true)
  expect(events.size).toBe(0)
})

test("collapsing the panel in one terminal leaves other terminals expanded", async () => {
  // The host synchronizes storage.store across TUI instances while
  // storage.memory stays per-terminal. Simulate that split: both instances
  // share one durable backing, memory is fresh per instance. With the old
  // storage.store panel state, collapsing here folded every terminal.
  const white = RGBA.fromHex("#ffffff")
  const durable = new Map<string, [object, (mutation: (draft: object) => void) => void]>()
  const localStore = (options: { initial: object }) => {
    const [state, setState] = createStore(options.initial)
    return [state, (mutation: (draft: object) => void) => setState(produce(mutation))] as const
  }
  const list = async () => ({
    data: [
      { path: "src\\", type: "directory" },
      { path: "readme.md", type: "file" },
    ],
  })
  const setupInstance = () => {
    let render!: () => any
    const context = {
      location: { directory: tmpdir() },
      options: {},
      storage: {
        memory: (options: { initial: object }) => localStore(options),
        store: (key: string, options: { initial: object }) => {
          let entry = durable.get(key)
          if (!entry) durable.set(key, (entry = localStore(options)))
          return entry
        },
      },
      themeMode: "dark",
      theme: { text: { base: white, muted: white, feedback: {
        success: { base: white }, error: { base: white }, warning: { base: white },
      } } },
      client: { file: { list } },
      data: { on: () => () => {} },
      ui: {
        slot: (slotOptions: { render: () => any }) => {
          render = slotOptions.render
          return () => {}
        },
        toast: { show: () => {} },
      },
    } as unknown as Plugin.Context
    const cleanup = plugin.setup!(context) as () => void
    return { render: () => render(), cleanup }
  }
  const a = setupInstance()
  const b = setupInstance()
  const aView = await testRender(() => <box width="100%" height={8}><scrollbox>{a.render()}</scrollbox></box>, {
    width: 40, height: 10,
  })
  const bView = await testRender(() => <box width="100%" height={8}><scrollbox>{b.render()}</scrollbox></box>, {
    width: 40, height: 10,
  })
  try {
    await aView.waitForFrame((frame) => frame.includes("▸ src"))
    await bView.waitForFrame((frame) => frame.includes("▸ src"))
    await aView.mockMouse.click(2, 0)
    await aView.waitForFrame((frame) => frame.includes("▶ Dir Tree"))
    expect(aView.captureCharFrame()).not.toContain("readme.md")
    expect(bView.captureCharFrame()).toContain("▼ Dir Tree")
    expect(bView.captureCharFrame()).toContain("readme.md")
  } finally {
    a.cleanup()
    b.cleanup()
    aView.renderer.destroy()
    bView.renderer.destroy()
  }
})
