// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// Empty tree data provider for the sidebar view
class KanbeasyTreeDataProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>
{
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.TreeItem[] {
    // Return empty array to show the welcome view
    return [];
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let kanbanPanel: vscode.WebviewPanel | undefined;

  // Register the tree view for the sidebar (empty to show welcome content)
  const treeDataProvider = new KanbeasyTreeDataProvider();
  vscode.window.createTreeView("kanbeasyView", {
    treeDataProvider,
  });

  // Toggle command - opens in main editor area or closes if already open
  const toggleCommand = vscode.commands.registerCommand(
    "kanbeasy.toggleBoard",
    () => {
      if (kanbanPanel) {
        kanbanPanel.dispose();
        kanbanPanel = undefined;
        return;
      }
      kanbanPanel = vscode.window.createWebviewPanel(
        "kanbeasyBoard",
        "Kanbeasy",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      kanbanPanel.webview.html = getWebviewContent();
      kanbanPanel.onDidDispose(
        () => {
          kanbanPanel = undefined;
        },
        null,
        context.subscriptions
      );

      // Close the sidebar after opening the kanban board
      vscode.commands.executeCommand("workbench.action.closeSidebar");
    }
  );
  context.subscriptions.push(toggleCommand);

  // Legacy command for backwards compatibility
  const openCommand = vscode.commands.registerCommand(
    "kanbeasy.openBoard",
    () => {
      vscode.commands.executeCommand("kanbeasy.toggleBoard");
    }
  );
  context.subscriptions.push(openCommand);

  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100
  );
  statusBarItem.text = "$(layout)";
  statusBarItem.tooltip = "Toggle Kanbeasy Board";
  statusBarItem.command = "kanbeasy.toggleBoard";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>kanbeasy</title>
</head>
<body style="margin:0;padding:0;overflow:hidden;height:100vh;width:100vw;">
    <iframe src="https://darrenjaworski.github.io/kanbeasy/" style="border:none;width:100vw;height:100vh;"></iframe>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
