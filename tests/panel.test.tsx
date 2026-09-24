/** @jsxImportSource @opentui/solid */
import { expect, test } from "bun:test"
import { tmpdir } from "node:os"
import { RGBA } from "@opentui/core"
import { testRender } from "@opentui/solid"
import { createStore, produce } from "solid-js/store"
import type { Plugin } from "@opencode/plugin/tui"
import plugin from "../src/tui"

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
    await view.waitForFrame((frame) => frame.includes("▶ File Tree"))
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
