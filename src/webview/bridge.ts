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
 * post back to the webview, or undefined if there's nothing to send.
 */
export function reduceWebviewMessage(
  store: BoardStore,
  message: unknown,
): BridgeMessage | undefined {
  const msg = message as BridgeMessage | undefined;
  if (!msg || msg.source !== MESSAGE_SOURCE || typeof msg.type !== "string") {
    return undefined;
  }
  switch (msg.type) {
    case "host:ready":
      return wrap("host:init", store.getInitPayload());
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
): { dispose(): void } {
  // A webview-originated mutation (host:saveBoard/kvSet/kvRemove) fires the
  // store's change event synchronously; suppress the echo so we don't push the
  // just-received state straight back to the same webview.
  let applyingInbound = false;
  const sub = webview.onDidReceiveMessage((message) => {
    applyingInbound = true;
    try {
      const reply = reduceWebviewMessage(store, message);
      if (reply) {
        void webview.postMessage(reply);
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
