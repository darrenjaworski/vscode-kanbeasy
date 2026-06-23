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

  test("relay script filters messages by kanbeasy source", () => {
    const html = getWebviewContent();
    assert.ok(
      html.includes("data.source !== 'kanbeasy'"),
      "Relay script must check for kanbeasy source to prevent relaying unrelated postMessages",
    );
  });
});
