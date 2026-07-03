export const DEFAULT_APP_URL = "https://darrenjaworski.github.io/kanbeasy/";

/**
 * Resolve the app URL the webview iframe loads. An override (the
 * `kanbeasy.appUrl` setting) lets you point the extension at a local dev
 * server (e.g. http://localhost:5173/kanbeasy/) to test the full
 * extension <-> web app integration before either side is released.
 * `host=vscode` is always appended so the app boots in host mode.
 */
export function resolveAppUrl(override?: string): string {
  const base = override?.trim() || DEFAULT_APP_URL;
  try {
    const url = new URL(base);
    url.searchParams.set("host", "vscode");
    return url.toString();
  } catch {
    // Malformed override — fall back to the published app.
    const url = new URL(DEFAULT_APP_URL);
    url.searchParams.set("host", "vscode");
    return url.toString();
  }
}

/**
 * Webview HTML: embeds the kanbeasy web app in host mode and relays bridge
 * messages between the VS Code webview API and the cross-origin iframe.
 * The extension host cannot postMessage the iframe directly; this in-page
 * relay bridges acquireVsCodeApi() <-> iframe.contentWindow.
 */
export function getWebviewContent(appUrlOverride?: string): string {
  const appUrl = resolveAppUrl(appUrlOverride);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>kanbeasy</title>
</head>
<body style="margin:0;padding:0;overflow:hidden;height:100vh;width:100vw;">
  <iframe id="app" src="${appUrl}" allow="clipboard-read; clipboard-write" style="border:none;width:100vw;height:100vh;"></iframe>
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
