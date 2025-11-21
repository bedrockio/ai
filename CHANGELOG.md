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
