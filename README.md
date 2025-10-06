# @bedrockio/ai

This package provides a thin wrapper for common AI chatbots. It standardizes
usage to allow different platforms to be swapped easily and allows templated
usage.

- [Install](#install)
- [Usage](#usage)
- [Streaming](#stream)
- [Templates](#templates)
- [Platforms](#platforms)
- [Models](#models)

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
  // Platform: openai|gpt|anthopic|claude
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

  // Aa yada schema (or any JSON schema) may be passed
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

- `start` - Response has been initiated. This event also contains an `id` field.
  that can be passsed back in as `prevResponseId` (OpenAI/Grok only).
- `stop` - Response has finished. Contains the `id` field and usage data.
- `delta`- Main text delta event when a new token is output.
- `done` - Text has stopped.
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
   multiplexed, however at the time of this writing there seem to me issues with
   ensuring tht the LLM actually uses the correct tools and results have been
   flaky. Depending on the approach this may also increase token usage.

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
