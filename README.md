# @bedrockio/ai

This package provides a thin wrapper for common AI chatbots. It standardizes
usage to allow different platforms to be swapped easily and allows templated
usage.

- [Install](#install)
- [Usage](#usage)

## Install

```bash
yarn install @bedrockio/ai
```

## Usage

```js
import { Client } from '@bedrockio/ai';

const client = new Client({
  // Directory to templates
  templates: './test/templates',
  // Platform: openai|gpt|anthopic|claude
  platform: 'openai',
  // Your API key
  apiKey: 'my-api-key',
});

// Get a one time response.
const response = await client.prompt({
  // The template file to use.
  file: 'classify-fruits',
  // The form of output. May be raw|text|messages|json.
  // Default is "text".
  output: 'json',
  // A custom template may be passed if "file" is not.
  template: 'custom',

  // All other variables will be
  // interpolated into the template.
  text: 'a long yellow fruit',
  fruit: 'banana, apple, pear',
});

// Stream the results
const stream = await client.stream({
  file: 'classify-fruits',
  // ...
});

// Will return an AsyncIterator
for await (const chunk of stream) {
  console.info(chunk.text);
}

// List available models
const models = await client.models();
```

## Templates

Template files must have be markdown (`.md`) and live in your templates
directory. They may be a simple text description or delineated roles:

````
--- SYSTEM ---

This is a list of fruits: {{fruits}}

--- USER ---

Which fruit do you think the following input most closely resembles?

Please provide your response as a JSON object containing:

- "name" {string} - The name of the fruit.
- "reason" {string} - The reason you believe it matches.
- "certainty" {number} - Your confidence in your answer from 0 to 1.

```
{{text}}
```
````
