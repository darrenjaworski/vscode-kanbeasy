import * as http from "node:http";
import { AddressInfo } from "node:net";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { BoardStore } from "../board/BoardStore";
import type { ToolResult } from "./tools";
import { tools } from "./tools";

// The SDK's ToolCallback expects a CallToolResult, which carries an open index
// signature ([x: string]: unknown). Our ToolResult is structurally identical at
// runtime ({ content: [{ type: "text", text }], isError? }) but lacks that index
// signature, so TS rejects the direct assignment. Cast at this single boundary
// to satisfy the SDK type without weakening the handler implementations.
type SdkToolResult = ToolResult & { [k: string]: unknown };

export interface RunningMcpServer {
  url: string;
  dispose(): Promise<void>;
}

function buildMcpServer(store: BoardStore): McpServer {
  const server = new McpServer({ name: "kanbeasy", version: "1.0.0" });
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>): Promise<SdkToolResult> =>
        tool.handler(store, args ?? {}) as SdkToolResult,
    );
  }
  return server;
}

async function readBody(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * Start a stateless Streamable-HTTP MCP server bound to localhost.
 * A fresh server+transport is created per request (stateless mode).
 */
export async function startMcpServer(
  store: BoardStore,
): Promise<RunningMcpServer> {
  const httpServer = http.createServer(async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      const server = buildMcpServer(store);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, await readBody(req));
    } catch {
      if (!res.headersSent) {
        res.writeHead(500).end();
      }
    }
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const { port } = httpServer.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}/`;

  return {
    url,
    dispose: () =>
      new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}
