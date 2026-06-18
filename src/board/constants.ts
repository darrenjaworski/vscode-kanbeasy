/** Bridge protocol — must match the kanbeasy web app's hostBridge.ts. */
export const MESSAGE_SOURCE = "kanbeasy";
export const PROTOCOL_VERSION = 1;

/** KV key the web app reads/writes for the card-number counter. */
export const NEXT_CARD_NUMBER_KEY = "kanbeasy:nextCardNumber";

/** globalState keys owned by the extension. */
export const GLOBAL_BOARD_KEY = "kanbeasy.board";
export const GLOBAL_KV_KEY = "kanbeasy.kv";
