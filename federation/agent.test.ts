import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOL_NAME, ToolInputError, callTool, checkInput, mcpAnnotations, registerWebMcp, webMcpAnnotations, webModelContext, type AgentTool, type ObjectSchema } from "./agent.ts";

const schema: ObjectSchema = {
  type: "object",
  properties: {
    slug: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", maxLength: 48 },
    limit: { type: "integer", minimum: 1, maximum: 50 },
    note: { type: ["string", "null"], maxLength: 5 },
    kind: { type: "string", enum: ["a", "b"] },
    tags: { type: "array", items: { type: "string", minLength: 1 }, maxItems: 2 },
    source: { type: "object", properties: { title: { type: "string" } }, required: ["title"], additionalProperties: false },
  },
  required: ["slug"],
  additionalProperties: false,
};

const echo: AgentTool<{ slug: string }> = {
  name: "echo",
  title: "Echo",
  description: "Returns its slug.",
  inputSchema: schema,
  hints: { readOnly: true, idempotent: true, untrustedContent: true },
  run: ({ slug }) => ({ slug }),
};

describe("checkInput", () => {
  it("accepts input that fits, nullable fields included", () => {
    expect(checkInput(schema, { slug: "acme", limit: 3, note: null, kind: "a", tags: ["x"], source: { title: "Page" } })).toEqual([]);
  });

  it("names every field that does not fit", () => {
    const problems = checkInput(schema, { slug: "Not A Slug", limit: 2.5, note: "too long", kind: "c", tags: ["", "y", "z"], source: { url: "x" }, extra: 1 });
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^input\.slug: does not match/),
        "input.limit: expected integer",
        "input.note: at most 5 characters",
        expect.stringMatching(/^input\.kind: expected one of "a", "b"/),
        "input.tags: at most 2 items",
        "input.tags[0]: at least 1 characters",
        "input.source.title: required",
        "input.source.url: not a field this tool takes",
        "input.extra: not a field this tool takes",
      ]),
    );
  });

  it("requires what the schema requires, and an object at the top", () => {
    expect(checkInput(schema, {})).toEqual(["input.slug: required"]);
    expect(checkInput(schema, "acme")).toEqual(["input: expected object"]);
    expect(checkInput(schema, null)).toEqual(["input: expected object"]);
  });
});

describe("callTool", () => {
  it("runs the tool with input that fits", async () => {
    await expect(callTool(echo as AgentTool, { slug: "acme" })).resolves.toEqual({ slug: "acme" });
  });

  it("runs nothing when the input does not fit", async () => {
    const run = vi.fn();
    await expect(callTool({ ...echo, run } as AgentTool, { slug: "ACME" })).rejects.toBeInstanceOf(ToolInputError);
    expect(run).not.toHaveBeenCalled();
  });
});

describe("annotations", () => {
  it("say the same hints in MCP's words and in WebMCP's", () => {
    expect(mcpAnnotations(echo)).toEqual({ title: "Echo", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(webMcpAnnotations({ destructive: true })).toEqual({ readOnlyHint: false, untrustedContentHint: false, consequentialHint: true });
    expect(webMcpAnnotations(echo.hints)).toEqual({ readOnlyHint: true, untrustedContentHint: true, consequentialHint: false });
  });

  it("tool names fit both MCP and WebMCP", () => {
    for (const ok of ["get_status", "search_companies", "a"]) expect(TOOL_NAME.test(ok), ok).toBe(true);
    for (const bad of ["Get", "get-status", "1st", "", "a".repeat(65)]) expect(TOOL_NAME.test(bad), bad).toBe(false);
  });
});

describe("registerWebMcp", () => {
  const g = globalThis as unknown as { document?: unknown; navigator?: unknown };
  const saved = { document: g.document, navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator") };
  afterEach(() => {
    g.document = saved.document;
    if (saved.navigator) Object.defineProperty(globalThis, "navigator", saved.navigator);
  });

  type Registered = { name: string; annotations: unknown; execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown> };

  it("does nothing where the browser has no WebMCP", () => {
    g.document = {};
    expect(webModelContext()).toBeNull();
    expect(() => registerWebMcp([echo as AgentTool])()).not.toThrow();
  });

  it("registers with document.modelContext (the draft), returns plain results, and unregisters by its signal", async () => {
    const tools: Registered[] = [];
    const signals: AbortSignal[] = [];
    g.document = {
      modelContext: {
        registerTool: (t: Registered, options: { signal: AbortSignal }) => {
          tools.push(t);
          signals.push(options.signal);
          return Promise.resolve();
        },
      },
    };
    expect(webModelContext()?.legacy).toBe(false);
    const off = registerWebMcp([echo as AgentTool]);
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
    expect(tools[0].annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true, consequentialHint: false });
    await expect(tools[0].execute({ slug: "acme" })).resolves.toEqual({ slug: "acme" });
    await expect(tools[0].execute({ slug: "Nope!" })).rejects.toThrow(/does not fit/);
    expect(signals[0].aborted).toBe(false);
    off();
    expect(signals[0].aborted).toBe(true);
  });

  it("registers with navigator.modelContext (Chrome's first previews), returning MCP text content", async () => {
    const tools: Registered[] = [];
    const unregister = vi.fn();
    g.document = {};
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { modelContext: { registerTool: (t: Registered) => (tools.push(t), { unregister }) } } });
    expect(webModelContext()?.legacy).toBe(true);
    const off = registerWebMcp([echo as AgentTool]);
    await expect(tools[0].execute({ slug: "acme" })).resolves.toEqual({ content: [{ type: "text", text: '{"slug":"acme"}' }] });
    off();
    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("keeps the other tools when the browser refuses one", () => {
    const names: string[] = [];
    g.document = {
      modelContext: {
        registerTool: (t: Registered) => {
          if (t.name === "echo") throw new Error("taken");
          names.push(t.name);
          return Promise.resolve();
        },
      },
    };
    registerWebMcp([echo as AgentTool, { ...(echo as AgentTool), name: "other" }]);
    expect(names).toEqual(["other"]);
  });
});
