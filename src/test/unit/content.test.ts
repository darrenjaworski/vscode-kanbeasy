import * as assert from "assert";
import { getWebviewContent } from "../../webview/content";

suite("webview content", () => {
  test("iframe URL includes ?host=vscode to enable host-mode migration", () => {
    const html = getWebviewContent();
    assert.ok(
      html.includes("?host=vscode"),
      "Removing ?host=vscode from the iframe URL silently disables host mode and breaks the IDB→globalState migration path",
    );
  });

  test("iframe delegates clipboard permissions so paste works in the webview", () => {
    const html = getWebviewContent();
    assert.ok(
      /<iframe[^>]*\ballow=("|')[^"']*clipboard-read[^"']*clipboard-write/.test(
        html,
      ),
      "Cross-origin iframes need allow='clipboard-read; clipboard-write' or the app's async Clipboard API (paste/copy fallback) is blocked in the VS Code webview",
    );
  });

  test("appUrl override points the iframe at a local dev server, keeping host mode", () => {
    const html = getWebviewContent("http://localhost:5173/kanbeasy/");
    assert.ok(
      html.includes('src="http://localhost:5173/kanbeasy/?host=vscode"'),
      "Override URL must be used for the iframe with host=vscode appended",
    );
  });

  test("empty or malformed appUrl override falls back to the published app", () => {
    for (const override of ["", "   ", "not a url"]) {
      const html = getWebviewContent(override);
      assert.ok(
        html.includes("https://darrenjaworski.github.io/kanbeasy/?host=vscode"),
        `Override "${override}" must fall back to the published app URL`,
      );
    }
  });

  test("relay script filters messages by kanbeasy source", () => {
    const html = getWebviewContent();
    assert.ok(
      html.includes("data.source !== 'kanbeasy'"),
      "Relay script must check for kanbeasy source to prevent relaying unrelated postMessages",
    );
  });
});
