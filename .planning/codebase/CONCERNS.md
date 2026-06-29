# Codebase Concerns

**Analysis Date:** 2026-06-29

## Tech Debt

**Unsafe Type Assertions in Message Handling:**

- Issue: `src/webview/bridge.ts` uses multiple type assertions (`as`) on untrusted webview messages without runtime validation
  - Line 37: `const msg = message as BridgeMessage | undefined`
  - Lines 45, 48, 53: Message payloads cast without validation
- Files: `src/webview/bridge.ts`
- Impact: Malformed messages from the webview or iframe could bypass type safety, causing runtime errors or unexpected behavior
- Fix approach: Use Zod validation (already available in `src/mcp/tools.ts`) to validate message structure before casting, or add type guards with runtime checks

**Hardcoded External Dependency:**

- Issue: Webview always loads kanban app from hardcoded GitHub Pages URL: `https://darrenjaworski.github.io/kanbeasy/?host=vscode`
- Files: `src/webview/content.ts:1`
- Impact: Extension breaks if GitHub Pages goes down, is compromised, or domain is unavailable. No fallback or error handling
- Fix approach: Add configurable app URL via settings or environment variable; implement fallback or offline mode; add error handling in webview for failed iframe load

**Insufficient Error Handling in MCP Server Startup:**

- Issue: `src/extension.ts` lines 78-83 catch MCP server startup errors but only log a warning. Server continues regardless of error state
- Files: `src/extension.ts:78-83`
- Impact: If MCP server fails to start, extension appears to function normally but Copilot integration is silently broken. Users won't know the feature is unavailable
- Fix approach: Add diagnostic logging; track MCP server state and report availability in status bar or command palette; consider making MCP startup optional

## Known Bugs

**Data Migration Edge Case (Recently Fixed):**

- Symptoms: User's board data was wiped when upgrading from v1.2.x to v1.3.0
- Files: `src/extension.ts`, `src/board/BoardStore.ts`
- Trigger: Update extension while board exists in web app's IndexedDB but not yet in VS Code globalState
- Workaround: v1.3.1 fixed this by sending `isFirstRun: true` flag to web app for recovery
- Note: This was fixed, but the complexity of the migration suggests the web app / extension sync is fragile

**MCP Provider Registration Timing Window:**

- Symptoms: Between extension activation and MCP server startup (async), Copilot queries see no server available
- Files: `src/extension.ts:84`, `src/mcp/provider.ts:30-31`
- Trigger: Copilot attempts to connect immediately after extension activates (before MCP server URL is available)
- Impact: First Copilot interaction after VS Code launch may fail or timeout
- Workaround: Retry or re-query server definitions after short delay

## Security Considerations

**Untrusted Message Handling:**

- Risk: Webview messages and iframe postMessages are not validated before use
- Files: `src/webview/bridge.ts:37-54`
- Current mitigation: Source check (`msg.source !== MESSAGE_SOURCE`) prevents some spoofing; message types are limited to known handlers
- Recommendations:
  - Add Zod schemas for all message types
  - Validate payload structure before casting
  - Log suspicious messages for debugging

**CSRF-like Attack Surface:**

- Risk: Iframe can postMessage to extension webview; extension webview relays to VS Code without origin validation
- Files: `src/webview/content.ts:23-32`
- Current mitigation: Source check in bridge reducer; iframe loads from same origin as hosted app
- Recommendations:
  - Document origin validation assumptions
  - Add explicit origin checks in iframe relay (line 30: `iframe.contentWindow.postMessage(data, '*')` should restrict origin)
  - Consider Content Security Policy headers

**MCP Tool Input Validation:**

- Risk: While tools use Zod validation for argument types, column title matching is case-insensitive but exact (could match wrong column if titles differ only by case)
- Files: `src/mcp/tools.ts:32-36`, `src/board/BoardStore.ts:287-289`
- Current mitigation: Tools only accept string columns and use exact title match after lowercase normalization
- Recommendations:
  - Add warnings/confirmations for operations on ambiguous column titles
  - Consider requiring column ID for programmatic operations

## Performance Bottlenecks

**Column History Array Unbounded Growth:**

- Problem: Each card stores complete `columnHistory` array tracking every column move with timestamps
- Files: `src/board/types.ts:1-4`, `src/board/BoardStore.ts:114-115, 158-161`
- Cause: No pruning of old history entries; cards moved frequently accumulate large arrays
- Impact: Cards with many moves have larger serialized size; memory grows over time; slower saves to globalState
- Improvement path:
  - Add history pruning (keep last N entries or entries within X days)
  - Consider lazy-loading history or archiving old entries separately
  - Monitor globalState size in large projects

**Linear Column Search in BoardStore:**

- Problem: `requireCard()` iterates all columns to find a card by number
- Files: `src/board/BoardStore.ts:303-313`
- Cause: No indexing; O(n) search per card mutation
- Impact: Negligible for typical boards (<100 cards), but becomes noticeable at scale
- Improvement path: Add optional number-to-location index for boards with 500+ cards

**JSON Serialization on Every Board Save:**

- Problem: Full board state serialized to JSON on every mutation (addCard, moveCard, etc.)
- Files: `src/board/BoardStore.ts:322-324`
- Cause: VS Code globalState stores JSON; no delta encoding
- Impact: Large boards with complex state become slow to persist
- Improvement path: Consider compression or delta encoding for large states; batch writes

## Fragile Areas

**Board/Web App Sync Protocol:**

- Files: `src/webview/bridge.ts`, `src/board/types.ts`, `src/mcp/tools.ts`
- Why fragile:
  - Implicit protocol contract between extension (host) and web app (iframe) defined only in constants
  - Change to message format requires coordinated updates in both repos
  - No schema versioning beyond `PROTOCOL_VERSION`
  - Only basic contract test coverage (`src/test/unit/contract.test.ts`)
- Safe modification:
  - Update `PROTOCOL_VERSION` when breaking changes
  - Add migration logic for old protocol versions
  - Add comprehensive contract tests for each message type
  - Document the host bridge API explicitly
- Test coverage:
  - 1 contract test covering all message types at high level
  - No tests for malformed or edge-case messages

**MCP Server HTTP Handler:**

- Files: `src/mcp/server.ts:56-76`
- Why fragile:
  - Error handling is broad (catch-all) with minimal logging
  - Stateless server creates new McpServer per request (expensive)
  - Resource cleanup depends on `res.on('close')` which may not fire reliably
  - No request timeout or size limits
- Safe modification:
  - Add explicit error types and logging
  - Consider pooling/reusing server instances
  - Add request timeout and body size limits
  - Test error paths explicitly
- Test coverage: No tests for server error scenarios

**Type Casting Boundary in MCP Server:**

- Files: `src/mcp/server.ts:14, 32`
- Why fragile:
  - Comment explains intentional type cast to bypass SDK type check
  - Direct cast bypasses type safety; future SDK changes could break
  - No validation that handler result matches expected shape
- Safe modification:
  - Add runtime validation of handler result shape
  - Consider creating adapter types that explicitly satisfy SDK requirements
  - Test handler outputs match SDK expectations
- Test coverage: Basic tool execution tested but not shape validation

## Scaling Limits

**Board State Size:**

- Current capacity: Tested locally; likely works up to thousands of cards
- Limit: VS Code globalState storage limit (~20MB per extension). Board state is JSON, so 500KB board = ~40,000 moderately-sized cards
- Scaling path:
  - Implement pagination or lazy-loading of archive
  - Consider moving archive to separate storage or external database
  - Add warnings when board size approaches limits

**MCP Server Concurrency:**

- Current capacity: Single-threaded event loop; each request spawns new server instance
- Limit: High concurrent Copilot requests could exhaust memory or cause timeouts
- Scaling path:
  - Implement request pooling or async queue
  - Add connection limits and backpressure handling
  - Monitor memory usage during concurrent access

## Dependencies at Risk

**@modelcontextprotocol/sdk (^1.29.0):**

- Risk: Early-stage SDK; API may change significantly
- Impact: Type casts in `src/mcp/server.ts:14` are brittle workaround; future versions could break
- Migration plan:
  - Monitor SDK changelog
  - Add integration tests to catch SDK breaking changes
  - Consider wrapper types to insulate from SDK changes

**zod (^4.4.3):**

- Risk: Schema validation library; moderate maintenance
- Impact: MCP tool validation depends on it
- Migration plan: Actively maintained; low risk. Consider if validation library changes needed

**@types/vscode (^1.125.0):**

- Risk: Lags behind VS Code releases
- Impact: VS Code API features newer than type definitions can't be used safely
- Migration plan: Monitor @types/vscode for updates; use type-ignore for new APIs if needed

## Missing Critical Features

**Graceful Degradation of Webview:**

- Problem: If iframe load fails (network, URL gone), user sees blank panel with no error message
- Blocks: User can't diagnose why board won't load
- Add: Error boundary with diagnostic message (network error, timeouts, CSP violations, 404, etc.)

**Offline Support:**

- Problem: Extension requires internet to load kanban app from GitHub Pages
- Blocks: Offline users can't access board
- Consider: Bundle web app or implement local fallback mode

**Session Persistence for MCP:**

- Problem: MCP server URL changes on every VS Code restart; some clients may cache old URL
- Blocks: Possible stale connection issues
- Consider: Implement URL persistence or at least graceful reconnection

**Board Export/Import:**

- Problem: No way to backup board outside VS Code or migrate to other tools
- Blocks: Users locked into VS Code; can't access board if extension breaks
- Consider: Add commands for JSON export/import with validation

## Test Coverage Gaps

**Untested Deactivate Path:**

- What's not tested: `src/extension.ts:87-92` deactivate function
- Files: `src/extension.ts:87-92`
- Risk: Bridge cleanup, MCP disposal may have memory leaks or resource leaks
- Priority: High (affects long-term extension stability)

**MCP Server Startup Failure:**

- What's not tested: Error path in `src/extension.ts:78-83` when MCP server fails to start
- Files: `src/extension.ts:78-83`
- Risk: Silent failure; users don't know Copilot integration is broken
- Priority: High

**Webview Message Error Cases:**

- What's not tested: Invalid or malformed messages, type mismatches in payload
- Files: `src/webview/bridge.ts:33-60`
- Risk: Unexpected runtime errors if web app sends wrong message format
- Priority: Medium (assumes web app stability)

**Board State Persistence:**

- What's not tested: Actual writes to VS Code globalState; recovery from write failures
- Files: `src/board/BoardStore.ts:322-330`
- Risk: Data loss if persistence fails silently
- Priority: Medium

**MCP Tool End-to-End:**

- What's not tested: Tools integrated with running MCP server; actual HTTP requests
- Files: `src/mcp/tools.ts`, `src/mcp/server.ts`
- Risk: Tools may work in isolation but fail in real server context
- Priority: Medium

**Large Board Performance:**

- What's not tested: Performance with 1000+ cards, large column history
- Files: `src/board/BoardStore.ts`, `src/board/types.ts`
- Risk: Slowdowns discovered in production use
- Priority: Low (rare scenario but high impact)

---

_Concerns audit: 2026-06-29_
