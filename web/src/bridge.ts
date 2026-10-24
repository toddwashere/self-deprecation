export interface BridgeResult<T> {
  data?: T;
  error?: { code: string; message: string };
}

export interface Bridge {
  callTool<T>(name: string, args?: object): Promise<BridgeResult<T>>;
  sendPrompt(text: string): Promise<void>;
  initialToolOutput<T>(): T | undefined;
  onToolOutput(listener: (output: unknown) => void): () => void;
  theme(): "light" | "dark";
  saveViewState(state: object): void;
  openExternal(url: string): void;
}

interface OpenAIHost {
  callTool?: (
    name: string,
    args: object,
  ) => Promise<{ structuredContent?: unknown; isError?: boolean }>;
  sendFollowUpMessage?: (args: { prompt: string }) => Promise<void>;
  toolOutput?: unknown;
  setWidgetState?: (state: object) => void;
  theme?: "light" | "dark";
  openExternal?: (args: { href: string }) => void;
}

interface HostContext {
  theme?: "light" | "dark";
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
}

declare global {
  interface Window {
    openai?: OpenAIHost;
  }
}

class McpAppClient {
  private id = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private initialized = false;
  private context: HostContext = {};
  private toolOutputListeners = new Set<(output: unknown) => void>();
  initialOutput: unknown;

  constructor() {
    window.addEventListener("message", (event) => this.receive(event));
  }

  async connect(): Promise<boolean> {
    try {
      const result = (await this.request(
        "ui/initialize",
        {
          protocolVersion: "2026-01-26",
          appInfo: { name: "Self-Deprecation panel", version: "0.1.0" },
          appCapabilities: {},
        },
        750,
      )) as { hostContext?: HostContext };
      this.context = result.hostContext ?? {};
      this.initialized = true;
      this.notify("ui/notifications/initialized", {});
      this.watchSize();
      return true;
    } catch {
      return false;
    }
  }

  getContext() {
    return this.context;
  }

  onToolOutput(listener: (output: unknown) => void) {
    this.toolOutputListeners.add(listener);
    return () => this.toolOutputListeners.delete(listener);
  }

  callTool(name: string, args: object) {
    return this.request("tools/call", { name, arguments: args });
  }

  sendMessage(text: string) {
    return this.request("ui/message", { role: "user", content: [{ type: "text", text }] });
  }

  openLink(url: string) {
    return this.request("ui/open-link", { url });
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = 10_000,
  ): Promise<unknown> {
    const id = ++this.id;
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`${method} timed out`));
      }, timeoutMs);
    });
    this.post({ jsonrpc: "2.0", id, method, params });
    return promise;
  }

  private notify(method: string, params: Record<string, unknown>) {
    this.post({ jsonrpc: "2.0", method, params });
  }

  private post(message: JsonRpcMessage) {
    window.parent.postMessage(message, "*");
  }

  private receive(event: MessageEvent) {
    if (event.source !== window.parent) return;
    const message = event.data as JsonRpcMessage;
    if (message?.jsonrpc !== "2.0") return;
    if (typeof message.id === "number") {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    if (message.method === "ui/notifications/tool-result" && message.params?.structuredContent) {
      this.initialOutput = message.params.structuredContent;
      for (const listener of this.toolOutputListeners) listener(this.initialOutput);
    }
    if (message.method === "ui/notifications/host-context-changed") {
      this.context = { ...this.context, ...(message.params as HostContext) };
    }
  }

  private watchSize() {
    if (!this.initialized || typeof ResizeObserver === "undefined") return;
    const send = () =>
      this.notify("ui/notifications/size-changed", {
        width: Math.ceil(document.documentElement.getBoundingClientRect().width),
        height: Math.ceil(document.documentElement.getBoundingClientRect().height),
      });
    new ResizeObserver(send).observe(document.documentElement);
    send();
  }
}

const app = new McpAppClient();
const connected = app.connect();

function extractError(value: unknown): { code: string; message: string } | undefined {
  if (!value || typeof value !== "object" || !("error" in value)) return undefined;
  const error = (value as { error?: { code?: unknown; message?: unknown } }).error;
  return error && typeof error.code === "string" && typeof error.message === "string"
    ? { code: error.code, message: error.message }
    : undefined;
}

async function callTool<T>(name: string, args: object = {}): Promise<BridgeResult<T>> {
  try {
    const result = (await connected)
      ? ((await app.callTool(name, args)) as { structuredContent?: unknown; isError?: boolean })
      : await window.openai?.callTool?.(name, args);
    if (!result) {
      return {
        error: { code: "HOST_UNAVAILABLE", message: "Open this panel from a connected MCP tool." },
      };
    }
    const error = extractError(result?.structuredContent);
    return result?.isError
      ? { error: error ?? { code: "TOOL_ERROR", message: "The tool could not complete." } }
      : { data: result?.structuredContent as T };
  } catch (error) {
    return {
      error: {
        code: "BRIDGE_ERROR",
        message: error instanceof Error ? error.message : "Host error",
      },
    };
  }
}

export const bridge: Bridge = {
  callTool,
  async sendPrompt(text) {
    if (await connected) await app.sendMessage(text);
    else await window.openai?.sendFollowUpMessage?.({ prompt: text });
  },
  initialToolOutput<T>() {
    return (app.initialOutput ?? window.openai?.toolOutput) as T | undefined;
  },
  onToolOutput(listener) {
    return app.onToolOutput(listener);
  },
  theme() {
    return app.getContext().theme ?? window.openai?.theme ?? "light";
  },
  saveViewState(state) {
    if (window.openai?.setWidgetState) window.openai.setWidgetState(state);
    else localStorage.setItem("self-deprecation-view", JSON.stringify(state));
  },
  openExternal(url) {
    void connected.then((ready) =>
      ready ? app.openLink(url) : window.openai?.openExternal?.({ href: url }),
    );
  },
};
