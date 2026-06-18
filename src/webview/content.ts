const APP_URL = "https://darrenjaworski.github.io/kanbeasy/?host=vscode";

/**
 * Webview HTML: embeds the kanbeasy web app in host mode and relays bridge
 * messages between the VS Code webview API and the cross-origin iframe.
 * The extension host cannot postMessage the iframe directly; this in-page
 * relay bridges acquireVsCodeApi() <-> iframe.contentWindow.
 */
export function getWebviewContent(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>kanbeasy</title>
</head>
<body style="margin:0;padding:0;overflow:hidden;height:100vh;width:100vw;">
  <iframe id="app" src="${APP_URL}" style="border:none;width:100vw;height:100vh;"></iframe>
  <script>
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('app');
    // iframe -> extension
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || data.source !== 'kanbeasy') { return; }
      if (iframe && event.source === iframe.contentWindow) {
        vscode.postMessage(data);
      } else {
        // extension -> iframe
        iframe.contentWindow && iframe.contentWindow.postMessage(data, '*');
      }
    });
  </script>
</body>
</html>`;
}
