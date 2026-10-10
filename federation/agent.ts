/* ============================================================
   agent.ts — tools for AI agents, defined once and served two ways:
   - by the local MCP server (mcp/server.mjs, over stdio), to an
     assistant that builds a map in site/ (docs/mcp.md);
   - by a page, with WebMCP: the map (src/agent.ts) registers its
     read-only tools with the browser at document.modelContext (the
     W3C Web Machine Learning Community Group's draft), or at
     navigator.modelContext (Chrome's first previews).
   A tool is a name, a title, a description, a JSON Schema for its
   input, hints about what it does, and a function. callTool() checks
   the input against the schema before the function runs, whichever
   way the call came: an agent's input is data, never trusted.
   Plain, erasable TypeScript, like the rest of federation/: Node
   runs it, Vite bundles it.
   ============================================================ */

/** The part of JSON Schema the tools use. */
export interface Schema {
  type?: SchemaType | SchemaType[];
  description?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  enum?: readonly (string | number | boolean | null)[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}
export type SchemaType = "object" | "array" | "string" | "integer" | "number" | "boolean" | "null";
export type ObjectSchema = Schema & { type: "object"; properties: Record<string, Schema> };

/** What a tool does, for the agent and its user to weigh before a call. */
export interface ToolHints {
  /** Reads only; changes nothing. */
  readOnly?: boolean;
  /** May remove or overwrite data. */
  destructive?: boolean;
  /** The same call twice has the effect of one. */
  idempotent?: boolean;
  /** Reaches past the local data: the web, another site. */
  openWorld?: boolean;
  /** Returns text that third parties wrote (a company's own description, say). */
  untrustedContent?: boolean;
}

export interface AgentTool<I = Record<string, unknown>> {
  /** Lowercase letters, digits and underscores: valid in MCP and in WebMCP. */
  name: string;
  title: string;
  description: string;
  inputSchema: ObjectSchema;
  hints: ToolHints;
  /** Called only with input that fits inputSchema. Returns a JSON value. */
  run(input: I, signal?: AbortSignal): unknown;
}

export const TOOL_NAME = /^[a-z][a-z0-9_]{0,63}$/;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function typeFits(t: SchemaType, v: unknown): boolean {
  switch (t) {
    case "null":
      return v === null;
    case "array":
      return Array.isArray(v);
    case "object":
      return isObject(v);
    case "integer":
      return Number.isInteger(v);
    case "number":
      return typeof v === "number" && Number.isFinite(v);
    case "string":
      return typeof v === "string";
    case "boolean":
      return typeof v === "boolean";
  }
}

/** Where `value` does not fit `schema`, as "input.field: what is wrong" lines; empty when it fits. */
export function checkInput(schema: Schema, value: unknown, at = "input"): string[] {
  const types = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types && !types.some((t) => typeFits(t, value))) return [`${at}: expected ${types.join(" or ")}`];
  const out: string[] = [];
  if (schema.enum && !schema.enum.includes(value as string)) out.push(`${at}: expected one of ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) out.push(`${at}: at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) out.push(`${at}: at most ${schema.maxLength} characters`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) out.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) out.push(`${at}: at least ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) out.push(`${at}: at most ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) out.push(`${at}: at least ${schema.minItems} item(s)`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) out.push(`${at}: at most ${schema.maxItems} items`);
    const items = schema.items;
    if (items) value.forEach((v, i) => out.push(...checkInput(items, v, `${at}[${i}]`)));
  }
  if (isObject(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) out.push(`${at}.${k}: required`);
    for (const [k, v] of Object.entries(value)) {
      const sub = schema.properties?.[k];
      if (sub) out.push(...checkInput(sub, v, `${at}.${k}`));
      else if (schema.additionalProperties === false) out.push(`${at}.${k}: not a field this tool takes`);
    }
  }
  return out;
}

/** An input that does not fit the tool's schema: nothing ran. */
export class ToolInputError extends Error {
  problems: string[];
  constructor(tool: string, problems: string[]) {
    super(`${tool}: the input does not fit the tool's schema; nothing ran.\n  ${problems.join("\n  ")}`);
    this.name = "ToolInputError";
    this.problems = problems;
  }
}

/** Runs `tool` with `input`, after checking it against the tool's schema. */
export async function callTool(tool: AgentTool, input: unknown, signal?: AbortSignal): Promise<unknown> {
  const problems = checkInput(tool.inputSchema, input ?? {});
  if (problems.length) throw new ToolInputError(tool.name, problems);
  return tool.run((input ?? {}) as Record<string, unknown>, signal);
}

/** The tool's hints as MCP annotations (the MCP specification's ToolAnnotations). */
export function mcpAnnotations(tool: Pick<AgentTool, "title" | "hints">) {
  const h = tool.hints;
  return { title: tool.title, readOnlyHint: !!h.readOnly, destructiveHint: !!h.destructive, idempotentHint: !!h.idempotent, openWorldHint: !!h.openWorld };
}

/** The tool's hints as WebMCP annotations (the draft's ToolAnnotations). */
export function webMcpAnnotations(hints: ToolHints) {
  return { readOnlyHint: !!hints.readOnly, untrustedContentHint: !!hints.untrustedContent, consequentialHint: !!hints.destructive };
}

/* ---------------- WebMCP ---------------- */

interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: ObjectSchema;
  annotations: ReturnType<typeof webMcpAnnotations>;
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>;
}

/** What a page registers tools with: the draft's ModelContext, or the shape of Chrome's first previews. */
interface ModelContextLike {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): unknown;
  unregisterTool?(name: string): unknown;
}

const hasRegister = (v: unknown): v is ModelContextLike => isObject(v) && typeof v.registerTool === "function";

/** The page's WebMCP registry, or null where the browser has none. `legacy` marks Chrome's first previews. */
export function webModelContext(): { context: ModelContextLike; legacy: boolean } | null {
  const fromDocument = typeof document === "undefined" ? undefined : (document as unknown as { modelContext?: unknown }).modelContext;
  if (hasRegister(fromDocument)) return { context: fromDocument, legacy: false };
  const fromNavigator = typeof navigator === "undefined" ? undefined : (navigator as unknown as { modelContext?: unknown }).modelContext;
  if (hasRegister(fromNavigator)) return { context: fromNavigator, legacy: true };
  return null;
}

/**
 * Registers `tools` with the page's WebMCP registry, if the browser has one, and returns a function
 * that unregisters them. A result goes back as the draft defines it (any JSON value); to Chrome's
 * first previews, as MCP text content. One tool the browser refuses leaves the others registered.
 */
export function registerWebMcp(tools: readonly AgentTool[]): () => void {
  const found = webModelContext();
  if (!found) return () => undefined;
  const { context, legacy } = found;
  const controller = new AbortController();
  const handles = new Map<string, unknown>();
  for (const tool of tools) {
    const def: WebMcpTool = {
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: webMcpAnnotations(tool.hints),
      execute: async (input, options) => {
        const result = await callTool(tool, input ?? {}, options?.signal);
        return legacy ? { content: [{ type: "text", text: JSON.stringify(result) }] } : result;
      },
    };
    try {
      const handle = legacy ? context.registerTool(def) : context.registerTool(def, { signal: controller.signal });
      // The draft's registerTool returns a promise; a refused registration leaves the page as it was.
      if (isObject(handle) && typeof handle.then === "function") (handle as unknown as Promise<unknown>).catch(() => undefined);
      handles.set(tool.name, handle);
    } catch {
      // A name the page already holds, say.
    }
  }
  return () => {
    controller.abort();
    if (!legacy) return;
    for (const [name, handle] of handles) {
      try {
        if (isObject(handle) && typeof handle.unregister === "function") (handle.unregister as () => void)();
        else context.unregisterTool?.(name);
      } catch {
        // Already gone.
      }
    }
  };
}
