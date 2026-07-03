import type { BoardStore } from "../board/BoardStore";
import type { BoardState } from "../board/types";
import type * as vscode from "vscode";
import { MESSAGE_SOURCE, PROTOCOL_VERSION } from "../board/constants";

export interface BridgeMessage {
  source: string;
  protocolVersion?: number;
  type: string;
  payload?: unknown;
}

/**
 * Minimal clipboard surface (matches vscode.env.clipboard). Injected so the
 * bridge stays testable outside the extension host, and so host:init only
 * advertises the clipboard capability when an implementation is present.
 */
export interface ClipboardLike {
  readText(): Thenable<string>;
  writeText(value: string): Thenable<void>;
}

function wrap(type: string, payload: unknown): BridgeMessage {
  return {
    source: MESSAGE_SOURCE,
    protocolVersion: PROTOCOL_VERSION,
    type,
    payload,
  };
}

export function boardChangedMessage(store: BoardStore): BridgeMessage {
  return wrap("host:boardChanged", {
    state: store.getBoard(),
    nextCardNumber: store.getNextCardNumber(),
  });
}

/**
 * Apply an inbound webview message to the store. Returns a reply message to
 * post back to the webview (possibly async, for clipboard reads), or
 * undefined if there's nothing to send.
 */
export function reduceWebviewMessage(
  store: BoardStore,
  message: unknown,
  clipboard?: ClipboardLike,
): BridgeMessage | Promise<BridgeMessage | undefined> | undefined {
  const msg = message as BridgeMessage | undefined;
  if (!msg || msg.source !== MESSAGE_SOURCE || typeof msg.type !== "string") {
    return undefined;
  }
  switch (msg.type) {
    case "host:ready":
      return wrap("host:init", {
        ...store.getInitPayload(),
        // The web app only activates its clipboard bridge when the host
        // advertises this; old app versions ignore the extra field.
        capabilities: { clipboard: Boolean(clipboard) },
      });
    case "host:saveBoard":
      store.saveBoard((msg.payload as { state: BoardState }).state);
      return undefined;
    case "host:kvSet": {
      const { key, value } = msg.payload as { key: string; value: unknown };
      store.setKv(key, value);
      return undefined;
    }
    case "host:kvRemove": {
      const { key } = msg.payload as { key: string };
      store.removeKv(key);
      return undefined;
    }
    case "host:clipboard:write": {
      if (!clipboard) {
        return undefined;
      }
      const { text } = msg.payload as { text: string };
      if (typeof text === "string") {
        void clipboard.writeText(text);
      }
      return undefined;
    }
    case "host:clipboard:read": {
      if (!clipboard) {
        return undefined;
      }
      const { requestId } = msg.payload as { requestId: string };
      return Promise.resolve(clipboard.readText()).then(
        (text) => wrap("host:clipboard:readResult", { requestId, text }),
        // Reply even on failure so the web app doesn't wait out its timeout.
        () => wrap("host:clipboard:readResult", { requestId, text: "" }),
      );
    }
    default:
      return undefined;
  }
}

/**
 * Wire a webview to the store: relay inbound messages through the reducer and
 * push host:boardChanged whenever the store changes. Returns a disposable.
 */
export function attachBridge(
  webview: vscode.Webview,
  store: BoardStore,
  clipboard?: ClipboardLike,
): { dispose(): void } {
  // A webview-originated mutation (host:saveBoard/kvSet/kvRemove) fires the
  // store's change event synchronously; suppress the echo so we don't push the
  // just-received state straight back to the same webview.
  let applyingInbound = false;
  const sub = webview.onDidReceiveMessage((message) => {
    applyingInbound = true;
    try {
      const reply = reduceWebviewMessage(store, message, clipboard);
      if (reply) {
        void Promise.resolve(reply).then(
          (resolved) => resolved && webview.postMessage(resolved),
        );
      }
    } finally {
      applyingInbound = false;
    }
  });
  const off = store.onDidChangeBoard(() => {
    if (applyingInbound) {
      return;
    }
    void webview.postMessage(boardChangedMessage(store));
  });
  return {
    dispose() {
      sub.dispose();
      off();
    },
  };
}
