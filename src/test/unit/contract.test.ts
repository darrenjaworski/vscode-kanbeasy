import * as assert from "assert";
import {
  MESSAGE_SOURCE,
  PROTOCOL_VERSION,
  NEXT_CARD_NUMBER_KEY,
} from "../../board/constants";

suite("bridge contract", () => {
  test("matches the web app hostBridge constants", () => {
    assert.strictEqual(MESSAGE_SOURCE, "kanbeasy");
    assert.strictEqual(PROTOCOL_VERSION, 1);
    assert.strictEqual(NEXT_CARD_NUMBER_KEY, "kanbeasy:nextCardNumber");
  });
});
