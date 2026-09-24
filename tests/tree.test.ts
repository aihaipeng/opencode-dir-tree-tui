import { afterEach, expect, test } from "bun:test"
import { fileURLToPath } from "node:url"
import { tmpdir } from "node:os"
import { randomUUID } from "node:crypto"
import type { Plugin } from "@opencode/plugin/tui"
import { TreeStore, parsePorcelain, resolveHiddenDirs } from "../src/tree"

const bundle = await Bun.build({
  entrypoints: [fileURLToPath(new URL("./fixtures/host.ts", import.meta.url))],
  target: "browser",
})
if (!bundle.success) throw new AggregateError(bundle.logs, "Host fixture build failed")
const host: typeof import("./fixtures/host") = await import(
  `data:text/javascript;base64,${Buffer.from(await bundle.outputs[0]!.text()).toString("base64")}`
)

type Entry = { path: string; type: "file" | "directory" }
const stores: TreeStore[] = []
afterEach(() => stores.splice(0).forEach((store) => store.dispose()))

function fixture(initialDirectory: string | undefined = tmpdir(), expanded: string[] = [], hiddenDirs?: unknown) {
  let directory = initialDirectory
  const calls: string[] = []
  let list = async (path: string): Promise<Entry[] | undefined> => path === "."
    ? [{ path: "src\\", type: "directory" }]
    : [{ path: "src\\index.ts", type: "file" }]
  const storage = (_key: string, options: { initial: object }) => {
    const [state, setState] = host.createStore(options.initial)
    return [state, (mutation: (draft: object) => void) => setState(host.produce(mutation))]
  }
  const context = {
    get location() { return directory ? { directory } : undefined },
    storage: {
      memory: storage,
      store: (key: string) => storage(key, { initial: { dirs: expanded } }),
    },
    client: { file: { list: async ({ path }: { path: string }) => {
      calls.push(path)
      return { data: await list(path) }
    } } },
    ui: { toast: { show() {} } },
  } as unknown as Plugin.Context
  const store = new TreeStore(context, resolveHiddenDirs({ hiddenDirs }))
  stores.push(store)
  return {
    store, calls,
    setDirectory: (value: string) => { directory = value },
    setList: (value: typeof list) => { list = value },
  }
}

test("host computations see async children and cached collapse/reopen across Solid instances", async () => {
  const { store } = fixture()
  let visible: string[] = []
  let isExpanded = false
  const dispose = host.createRoot((dispose) => {
    host.createComputed(() => { visible = store.visibleRows().map(({ node }) => node.path) })
    host.createComputed(() => { isExpanded = store.isExpanded("src") })
    return dispose
  })
  try {
    await store.requestDirectory("")
    expect(visible).toEqual(["src"])
    store.toggle("src")
    await Bun.sleep(10)
    expect(visible).toEqual(["src", "src/index.ts"])
    expect(isExpanded).toBe(true)
    store.toggle("src")
    expect(visible).toEqual(["src"])
    expect(isExpanded).toBe(false)
    store.toggle("src")
    expect(visible).toEqual(["src", "src/index.ts"])
  } finally { dispose() }
})

test.each([
  { rules: ["*.log"], hidden: ["debug.log", ".log", "错误.log"], visible: ["debugXlog", "debug.log.bak", "debug.LOG"] },
  { rules: [".env*"], hidden: [".env", ".env.local"], visible: ["env", "other.env"] },
  { rules: ["temp?"], hidden: ["temp1", "temp中", "temp😀"], visible: ["temp", "temp12"] },
  { rules: ["a*b?c"], hidden: ["ab1c", "axxb2c"], visible: ["abc", "ab12c", "xab1c"] },
  { rules: ["a**b*c"], hidden: ["abc", "axbybzc"], visible: ["ab", "abcx"] },
  { rules: ["[ab]*.log", "a+(b).txt", "file{1}.txt"], hidden: ["[ab]x.log", "a+(b).txt", "file{1}.txt"], visible: ["ax.log", "ab.txt", "file1.txt"] },
  { rules: ["*"], hidden: [".env", "file.txt", "目录"], visible: [] },
  { rules: [], hidden: [], visible: [".env", "node_modules", "debug.log"] },
  { rules: [null, 42, "", "node_modules"], hidden: ["node_modules"], visible: ["node_modules_old", "Node_modules"] },
  { rules: "*.log", hidden: [], visible: ["debug.log"] },
  { rules: ["src/*.log", "!keep.log"], hidden: ["!keep.log"], visible: ["debug.log", "keep.log"] },
])("hiddenDirs matches whole basenames with rules $rules", async ({ rules, hidden, visible }) => {
  const { store, setList } = fixture(tmpdir(), [], rules)
  setList(async () => [...hidden, ...visible].map((path) => ({ path, type: "file" })))
  await store.requestDirectory("")
  expect(store.visibleRows().map(({ node }) => node.name).sort()).toEqual([...visible].sort())
})

test("wildcards filter files and directories at any depth and on refresh", async () => {
  const { store, setList } = fixture(tmpdir(), [], ["*.log", "cache*", "node_modules"])
  setList(async (path) => path === "." ? [
    { path: "src\\", type: "directory" },
    { path: "cache-main\\", type: "directory" },
    { path: "node_modules\\", type: "directory" },
    { path: "debug.log", type: "file" },
  ] : [
    { path: "src\\cache-local\\", type: "directory" },
    { path: "src\\debug.log", type: "file" },
    { path: "src\\keep.ts", type: "file" },
  ])
  await store.requestDirectory("")
  await store.requestDirectory("src")
  store.toggle("src")
  expect(store.visibleRows().map(({ node }) => node.path)).toEqual(["src", "src/keep.ts"])
  await store.requestDirectory("src", true)
  expect(store.visibleRows().map(({ node }) => node.path)).toEqual(["src", "src/keep.ts"])
})

test("many wildcard segments with a failing suffix complete without exponential backtracking", async () => {
  const { store, setList } = fixture(tmpdir(), [], ["*a".repeat(40) + "b"])
  const path = "a".repeat(200)
  setList(async () => [{ path, type: "file" }])
  await store.requestDirectory("")
  expect(store.visibleRows()[0]?.node.name).toBe(path)
})

test("refresh retries the root and restored expansions after location becomes available", async () => {
  const { store, calls, setDirectory } = fixture("", ["src"])
  void store.refreshAll()
  expect(calls).toEqual([])
  setDirectory(tmpdir())
  store.scheduleRefresh(0)
  await Bun.sleep(30)
  expect(calls).toContain(".")
  expect(calls).toContain("src")
  expect(store.visibleRows().map(({ node }) => node.path)).toEqual(["src", "src/index.ts"])
})

test("refresh retries an initial listing failure", async () => {
  const { store, setList } = fixture()
  setList(async () => { throw new Error("server not ready") })
  await store.requestDirectory("")
  expect(store.loadError()).toContain("server not ready")
  setList(async () => [{ path: "README.md", type: "file" }])
  store.scheduleRefresh(0)
  await Bun.sleep(30)
  expect(store.visibleRows()[0]?.node.name).toBe("README.md")
  expect(store.loadError()).toBeUndefined()
})

test("missing response data reports failure without replacing a loaded listing", async () => {
  const { store, setList } = fixture()
  setList(async () => undefined)
  await store.requestDirectory("")
  expect(store.loadError()).toContain("response contained no data")

  setList(async () => [{ path: "keep.ts", type: "file" }])
  await store.requestDirectory("")
  expect(store.loadError()).toBeUndefined()
  setList(async () => undefined)
  await store.requestDirectory("", true)
  expect(store.loadError()).toContain('Failed to list ".": response contained no data')
  expect(store.visibleRows().map(({ node }) => node.name)).toEqual(["keep.ts"])
})

test("rename source filenames resembling porcelain status are not parsed as extra files", () => {
  expect(parsePorcelain("R  new.ts\0AM old.ts\0?? added.ts\0")).toEqual([
    { path: "new.ts", status: "added" },
    { path: "added.ts", status: "added" },
  ])
})

test("late responses cannot overwrite a switched workspace or a disposed store", async () => {
  const { store, setList, setDirectory } = fixture()
  let finish!: (entries: Entry[]) => void
  setList(() => new Promise((resolve) => { finish = resolve }))
  const oldRequest = store.requestDirectory("")
  setDirectory("D:/new-workspace")
  setList(async () => [{ path: "new.ts", type: "file" }])
  await store.requestDirectory("")
  finish([{ path: "old.ts", type: "file" }])
  await oldRequest
  expect(store.visibleRows().map(({ node }) => node.name)).toEqual(["new.ts"])

  setList(() => new Promise((resolve) => { finish = resolve }))
  const lateRequest = store.requestDirectory("", true)
  store.dispose()
  finish([{ path: "late.ts", type: "file" }])
  await lateRequest
  expect(store.visibleRows().map(({ node }) => node.name)).toEqual(["new.ts"])
})

test("a removed directory clears its descendants but keeps the root and sibling cache", async () => {
  const removed = `missing-${randomUUID()}`
  const sibling = `${removed}-sibling`
  const { store, calls, setList } = fixture(tmpdir(), [removed, `${removed}/child`, sibling])
  setList(async (path) => {
    if (path === ".") return [removed, sibling].map((path) => ({ path, type: "directory" }))
    if (path === removed) return [{ path: `${removed}/child`, type: "directory" }]
    return [{ path: `${path}/keep.ts`, type: "file" }]
  })
  for (const dir of ["", removed, `${removed}/child`, sibling]) await store.requestDirectory(dir)
  setList(async () => { throw new Error("directory removed") })
  await store.requestDirectory(removed, true)
  expect(store.isExpanded(removed)).toBe(false)
  expect(store.isExpanded(`${removed}/child`)).toBe(false)
  expect(store.isExpanded(sibling)).toBe(true)
  expect(store.visibleRows().map(({ node }) => node.path)).toEqual([removed, sibling, `${sibling}/keep.ts`])

  const before = calls.length
  setList(async () => [])
  for (const dir of ["", sibling, removed, `${removed}/child`]) await store.requestDirectory(dir)
  expect(calls.slice(before)).toEqual([removed, `${removed}/child`])
})
