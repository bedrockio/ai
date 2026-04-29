# @bedrockio/ai

This package provides a thin wrapper for common AI chatbots. It standardizes
usage to allow different platforms to be swapped easily and allows templated
usage.

- [Install](#install)
- [Usage](#usage)
- [Files](#files)
- [Streaming](#stream)
- [Templates](#templates)
- [Platforms](#platforms)
- [Models](#models)
- [MCP Tools](#mcp-tools)
- [MCP Server](#mcp-server)

## Install

```bash
yarn install @bedrockio/ai
```

## Usage

```js
import yd from '@bedrockio/yada';
import { createClient } from '@bedrockio/ai';

const client = createClient({
  // Directory to templates
  templates: './test/templates',
  // Platform: openai|gpt|anthropic|claude
  platform: 'openai',
  // Your API key
  apiKey: 'my-api-key',
});

// Get a one time response.
const response = await client.prompt({
  // The template to use. If no template is found will
  // use this string as the template.
  template: 'classify-fruits',
  // The form of output. May be raw|text|messages|json.
  // Default is "text".
  output: 'json',

  // A yada schema (or any JSON schema) may be passed
  // here to define structured output.
  schema: yd.object({
    name: yd.string(),
  })

  // All other variables will be
  // interpolated into the template.
  text: 'a long yellow fruit',
  fruit: 'banana, apple, pear',
});
```

## Files

Files can be passed directly in the options object and follow the same input
type as the Anthropic API:

```js
await client.prompt({
  files: [
    // By URL
    {
      type: 'document',
      source: {
        type: 'url',
        url: 'https://example.com/my-file.pdf',
      },
    },
    // By base64
    {
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: 'bXl1cmw=',
      },
    },
    // By uploaded ID
    {
      type: 'document',
      source: {
        type: 'file',
        file_id: 'file_01',
      },
    },
  ],
});
```

## Streaming

Responses may be streamed:

```js
// Stream the results
const stream = await client.stream({
  template: 'classify-fruits',

  // See below.
  extractMessages: 'text',
});

// Will return an AsyncIterator
for await (const event of stream) {
  console.info(event.text);
}
```

Event types:

- `start` - Response has been initiated.
- `stop` - Response has finished. Contains the final `messages` array and usage data.
- `delta`- Main text delta event when a new token is output.
- `done` - Text has stopped.
- `content_block_start` / `content_block_stop` - Anthropic-shaped passthrough
  for non-text content blocks (`tool_use`, `mcp_tool_use`, etc). Emitted by
  Anthropic for any non-text block, and by OpenAI for MCP tool calls so a UI
  can show a loading state while the call is in flight.
- `extract:delta` - Used with `extractMessages` (see below).
- `extract:done` - Used with `extractMessages` (see below).

### Streaming Structured Data

Often you want prompt responses to be structured JSON, however you still want to
stream the user-facing message. In this case use the `extractMessages` option to
define the key of the structured output you want to stream. When this is defined
you receive additional `extract:delta` and `extract:done` events. These will
stream even as the partial JSON data comes in.

### Streaming Notes

Note that in addition to streaming partial data above, there are 2 other valid
approaches:

1. Send two prompts, one for the message and one for the extracted data. This
   works, however there are edge cases when there needs to correlation between
   the responses. For example when asking the user a "next question" in text but
   extracting the type of question in data, the results may not match depending
   on the LLM temperament. This also will increase token usage.

2. Use function calls, ie "tools". This approach seems more appropriate as
   function calls stream separately to text output and can easily be
   multiplexed, however at the time of this writing there seem to be issues
   with ensuring that the LLM actually uses the correct tools and results have
   been flaky. Depending on the approach this may also increase token usage.

For the reasons above currently the most reliable approach to streaming
structured data is using `extractMessage` to stream the partial JSON response.

## Templates

Template files must be markdown (`.md`) and live in your templates directory.
These will be passed as `instructions`, or the equivalent to the `developer`
role.

````
Which fruit do you think the following input most closely resembles?

Please provide your response as a JSON object containing:

- "name" {string} - The name of the fruit.
- "reason" {string} - The reason you believe it matches.
- "certainty" {number} - Your confidence in your answer from 0 to 1.

```
{{text}}
```
````

## Platforms

Currently supported platforms:

- OpenAI (ChatGPT)
- Anthropic (Claude)
- xAi (Grok).

## Models

Available models can be listed with:

```js
const models = await client.models();
```

## MCP Tools

A remote [MCP](https://modelcontextprotocol.io/) server can be exposed to the
model as a tool. The model will then be able to discover and call any tools
the server advertises via `tools/list`.

```js
await client.prompt({
  input: 'Find me a book about birds.',
  tools: [
    {
      type: 'mcp',
      name: 'my-app',
      url: 'https://my-app.com/mcp',
      authorization_token: jwtForCurrentUser,
    },
  ],
});
```

The shape mirrors Anthropic's MCP connector. For each `mcp` tool, an
`mcp_toolset` entry is added to the request automatically (so the model can
invoke the server's tools) unless the caller has already provided one.

### authorization_token

Anthropic's MCP connector does not forward the user's browser cookies — every
JSON-RPC request comes from Anthropic's infrastructure. To tell the MCP
server *who* the model is acting on behalf of, pass `authorization_token`;
it is sent as `Authorization: Bearer <token>` on every request. Typically
this is a short-lived JWT minted server-side with the user's id (~15 min,
HS256). The MCP server verifies it and scopes its handlers to that user.

## MCP Server

The `McpServer` class provides a minimal [MCP](https://modelcontextprotocol.io/)
server that exposes tools to LLM clients over the Streamable HTTP transport. It
is designed to be mounted in a Koa route handler — `handleRequest(ctx)` reads
from `ctx.request.body` and writes the response (status, body, and
`content-type` header) directly onto `ctx`.

The server targets the `2025-11-25` revision of the MCP spec but negotiates down
to `2025-06-18` and `2025-03-26` if the client requests them.

```js
import yd from '@bedrockio/yada';
import { McpServer } from '@bedrockio/ai';

const server = new McpServer({
  name: 'my-app',
  version: '1.0.0',

  // Optional: allow-list of `Origin` header values. When set, requests
  // with an `Origin` that is not in this list are rejected with HTTP 403.
  // This is the spec-mandated DNS-rebinding defense for browser clients.
  allowedOrigins: ['https://app.example.com'],

  // Tools exposed to the client. `inputSchema` accepts a yada schema
  // (or any JSON schema). If the schema has a `validate` method (yada
  // does), arguments are validated before the handler runs and validation
  // failures are returned as tool execution errors. The handler receives
  // the parsed arguments and the Koa context; the return value is sent
  // back as the tool result (strings as-is, everything else JSON-encoded).
  tools: [
    {
      name: 'search_drugs',
      description: 'Search for drug information by name.',
      inputSchema: yd.object({
        name: yd.string().description('Name of the drug to search for.'),
      }),
      async handler(params, ctx) {
        const { name } = params;
        return await Drug.search({ keyword: name });
      },
    },
  ],
});
```

Authentication is the consumer's concern — wire it as Koa middleware before the
route, or inside the route handler, using whatever scheme your app already uses
(JWT, session cookie, etc.).

Mount it on a route — typically at `/mcp` — using `.all()` so the server can
respond with `405 Method Not Allowed` for `GET`/`DELETE` (which the spec
requires when SSE and session termination aren't supported):

```js
router.all('/mcp', async (ctx) => {
  await server.handleRequest(ctx);
});
```

`handleRequest` sets `ctx.body` and `ctx.status` itself — do not assign
`ctx.body = await server.handleRequest(ctx)`, because notifications respond with
`202 Accepted` and no body, which Koa would otherwise rewrite to `204`.

### Sessions (advanced)

`Mcp-Session-Id` is optional in the spec and is only useful if your server keeps
per-session state (subscriptions, caches keyed by conversation, `listChanged`
push notifications, etc.). For stateless tool calls — the typical "Claude calls
a tool, the handler queries the DB, returns a result" shape — skip this section.

If you do need it, pass `getSessionId(ctx)` and return a session identifier. The
value is set on the response as `mcp-session-id` during `initialize` and
validated on subsequent requests; returning `undefined` disables session
validation for that request. Spec-canonical practice is to generate a UUID
server-side at initialization and store any associated state keyed by that UUID.
In a multi-backend deployment you'll also need either backend affinity or shared
storage so any backend can resolve the session.

### Tool errors

If a tool's `inputSchema.validate` rejects the arguments, or its `handler`
throws, the error is returned as a tool execution error
(`{ content: [...], isError: true }`) rather than as a JSON-RPC error. This is
what the spec recommends so the model can self-correct.

### Errors and Koa middleware

Protocol-level errors (`Invalid Request`, `Forbidden`, `Invalid Session`) are
thrown as `Error` instances with a `status` property and a `toJSON()` that
produces the JSON-RPC error body. A typical Koa setup serializes them with an
error middleware:

```js
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = err.toJSON ? err.toJSON() : { error: { message: err.message } };
  }
});
```

### Supported methods

`initialize`, `ping`, `tools/list`, `tools/call`, plus any `notifications/*`
notification (acknowledged with `202 Accepted`). Unknown methods return a
JSON-RPC `Method not found` error.

### What is not implemented

This is intentionally a minimal implementation. Non-`POST` requests are answered
with `405 Method Not Allowed`. The following parts of the spec are out of scope:

- Server-Sent Events on `GET`
- Session termination via `DELETE`
- `tools/list` pagination
- `outputSchema` / `structuredContent` on tool results
- Resources, prompts, sampling, elicitation, and tasks
