## 0.13.2

- Don't force schema tool use if other tools are passed.
- Allow structured output on streaming `stop` event.

## 0.13.1

- Allow `max_tokens` in client options.

## 0.13.0

- Added `timestamps` and ensure they are stripped on sending to LLMs.

## 0.12.2

- Ensure `prompt` is passed through in all cases.

## 0.12.0

- Export `prompt` to allow storage of all messages.

## 0.11.0

### McpServer

- **Breaking:** Removed `apiKeyRequired` and `isValidApiKey` options.
  Authentication is the consumer's concern — wire it as Koa middleware.
- **Breaking:** `handleRequest(ctx)` mutates `ctx` directly. Use
  `await server.handleRequest(ctx)`, not `ctx.body = await ...`.
- **Breaking:** Mount with `router.all('/mcp', ...)` — non-`POST` returns 405.
- Tightened to MCP spec `2025-11-25`: Origin allow-list (`allowedOrigins`), tool
  input validation, tool errors as `isError: true`, 202 for notifications.

### Anthropic client

- **Breaking:** `mcp` tool input shape changed from `server_label`/`server_url`
  to `name`/`url`.
- Forwards `authorization_token` and auto-adds an `mcp_toolset` entry per `mcp`
  server.
- Stream events pass non-text content blocks through unchanged.

### OpenAI client (aligned to Anthropic shape)

- **Breaking:** Removed `prevResponseId`. Pass full message history yourself.
- **Breaking:** `id` removed from `start` and `stop` stream events.
- **Breaking:** Tool calls no longer emit a `function_call` stream event; they
  appear as `tool_use` blocks in the final `stop` message.
- MCP tool calls emit `content_block_start` / `content_block_stop` so a UI can
  show a loading state while the call is in flight.

## 0.10.0

- Allow file input.

## 0.9.5

- Export all clients.
- Error if template directory incorrect.

## 0.9.4

- Bumped yada dev version.

## 0.9.3

- Further fixes for empty input.

## 0.9.2

- Strip empty input out of resulting messages.

## 0.9.1

- Pass interpolated instructions back in result.

## 0.9.0

- Function calls are now handled out of the box.

## 0.8.4

- Fixed issue with user roles parsed from template is injected into conversation
  history.

## 0.8.3

- Fixed issue with message history not being retained.

## 0.8.2

- Fixed issue with extra input element being appended.

## 0.8.1

- Change to minimum protocol version to avoid supporing fixed versions.

## 0.8.0

- Simplified return values.
- Restored basic Gemini functionality.
- Normalize options inputs.
- Normalize stream event outputs.

## 0.7.3

- Allow debug on individual calls.

## 0.7.2

- Handling long filenames.

## 0.7.1

- Better model listing.

## 0.7.0

- Allow getting the template source.

## 0.6.2

- Pass tool_choice param.

## 0.6.0

- Moved template rendering out to external package.
- Normalized messages input.
- MCP use with Anthropic.

## 0.5.1

- Added basic api key authorization.

## 0.5.0

- Added `McpServer` and basic handling of using it in tools.

## 0.4.3

- Moved to files whitelist.

## 0.4.2

- Exclude keys from tarball.

## 0.4.1

- No error on missing API key.

## 0.4.0

- Rewrote OpenAI to use new responses format.
- Allow structured responses.
- Allow yada or JSON schema.
- Allow extracting partial JSON when streaming.
- Using `template` option only now.
- Allow specifying model in client options.
- Store the previous response id for OpenAI.
- Removed MultiClient for now.
- Client -> createClient.
- Added debug feature.

## 0.3.0

- Added MultiClient.
- Allow partial template interpolation.
- Changed default openai model to `gpt-4o-mini`.
- Allow passing in specific `params` object.
- Allow passing in complex arrays.

## 0.2.1

- Better error handling for entry.
- Allow parsing of unknown code.

## 0.2.0

- Added Gemini

## 0.1.0

- Initial commit
