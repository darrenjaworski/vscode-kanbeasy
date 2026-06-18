import * as vscode from "vscode";

/**
 * Registers the running MCP HTTP server with VS Code so Copilot can discover it.
 */
export function registerMcpProvider(
  context: vscode.ExtensionContext,
  getUrl: () => string | undefined,
): void {
  const didChange = new vscode.EventEmitter<void>();
  context.subscriptions.push(didChange);
  context.subscriptions.push(
    vscode.lm.registerMcpServerDefinitionProvider("kanbeasy.mcp", {
      onDidChangeMcpServerDefinitions: didChange.event,
      provideMcpServerDefinitions: async () => {
        const url = getUrl();
        if (!url) {
          return [];
        }
        return [
          new vscode.McpHttpServerDefinition(
            "Kanbeasy Board",
            vscode.Uri.parse(url),
          ),
        ];
      },
      resolveMcpServerDefinition: async (server) => server,
    }),
  );
  // Server URL becomes available after async start; fire once so VS Code re-queries.
  didChange.fire();
}
