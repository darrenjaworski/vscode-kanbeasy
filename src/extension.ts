// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand(
    "kanbeasy.openBoard",
    () => {
      const panel = vscode.window.createWebviewPanel(
        "kanbeasyBoard",
        "Kanbeasy Board",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );
      panel.webview.html = getWebviewContent();
    }
  );
  context.subscriptions.push(disposable);
}

function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kanbeasy Board</title>
</head>
<body style="margin:0;padding:0;overflow:hidden;height:100vh;width:100vw;">
    <iframe src="https://darrenjaworski.github.io/kanbeasy/" style="border:none;width:100vw;height:100vh;"></iframe>
</body>
</html>`;
}

// This method is called when your extension is deactivated
export function deactivate() {}
