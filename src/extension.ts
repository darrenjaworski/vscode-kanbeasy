import * as vscode from "vscode";
import { BoardStore } from "./board/BoardStore";
import { startMcpServer, type RunningMcpServer } from "./mcp/server";
import { registerMcpProvider } from "./mcp/provider";
import { attachBridge } from "./webview/bridge";
import { getWebviewContent } from "./webview/content";

class KanbeasyTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(): vscode.TreeItem[] {
    return [];
  }
}

let mcp: RunningMcpServer | undefined;
let activeBridge: { dispose(): void } | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const store = new BoardStore(context.globalState);

  // Register the board UI first so it always works, independent of MCP.
  const treeDataProvider = new KanbeasyTreeDataProvider();
  vscode.window.createTreeView("kanbeasyView", { treeDataProvider });

  let kanbanPanel: vscode.WebviewPanel | undefined;

  const toggleCommand = vscode.commands.registerCommand(
    "kanbeasy.toggleBoard",
    () => {
      if (kanbanPanel) {
        kanbanPanel.dispose();
        return;
      }
      kanbanPanel = vscode.window.createWebviewPanel(
        "kanbeasyBoard",
        "Kanbeasy",
        vscode.ViewColumn.One,
        { enableScripts: true, retainContextWhenHidden: true },
      );
      kanbanPanel.webview.html = getWebviewContent();
      activeBridge = attachBridge(kanbanPanel.webview, store);
      kanbanPanel.onDidDispose(
        () => {
          activeBridge?.dispose();
          activeBridge = undefined;
          kanbanPanel = undefined;
        },
        null,
        context.subscriptions,
      );
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    },
  );
  context.subscriptions.push(toggleCommand);

  const openCommand = vscode.commands.registerCommand(
    "kanbeasy.openBoard",
    () => {
      vscode.commands.executeCommand("kanbeasy.toggleBoard");
    },
  );
  context.subscriptions.push(openCommand);

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.text = "Kanbeasy";
  statusBarItem.tooltip = "Toggle Kanbeasy Board";
  statusBarItem.command = "kanbeasy.toggleBoard";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Start the in-process MCP server. A failure here must NOT take down the
  // board — the provider simply yields no server until one is available.
  try {
    mcp = await startMcpServer(store);
  } catch (e) {
    mcp = undefined;
    console.warn("[kanbeasy] MCP server failed to start:", e);
  }
  registerMcpProvider(context, () => mcp?.url);
}

export async function deactivate() {
  activeBridge?.dispose();
  activeBridge = undefined;
  await mcp?.dispose();
  mcp = undefined;
}
