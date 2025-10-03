import { AnthropicClient } from './anthropic.js';
import { GoogleClient } from './google.js';
import { OpenAiClient } from './openai.js';
import { XAiClient } from './xai.js';

export class Client {
  constructor(options = {}) {
    if (!options.platform) {
      throw new Error('No platform specified.');
    } else if (!options.apiKey) {
      throw new Error('No API key specified.');
    }
    return getClientForPlatform(options);
  }
}

export class MultiClient {
  constructor(options) {
    const { platforms } = options;

    this.clients = {};

    for (let platform of platforms) {
      const { name, apiKey } = platform;
      const client = getClientForPlatform({
        ...options,
        platform: name,
        apiKey,
      });
      this.clients[name] = client;
      this.clients[undefined] ||= client;
    }
  }

  prompt(options) {
    return this.getClient(options).prompt(options);
  }

  stream(options) {
    return this.getClient(options).stream(options);
  }

  buildTemplate(options) {
    return this.getClient(options).buildTemplate(options);
  }

  getClient(options) {
    const { platform } = options;
    const client = this.clients[platform];
    if (!client) {
      throw new Error(`Platform "${platform}" not found.`);
    }
    return client;
  }
}

function getClientForPlatform(options) {
  const { platform } = options;
  if (platform === 'openai' || platform === 'gpt') {
    return new OpenAiClient(options);
  } else if (platform === 'google' || platform === 'gemini') {
    return new GoogleClient(options);
  } else if (platform === 'anthropic' || platform === 'claude') {
    return new AnthropicClient(options);
  } else if (platform === 'xai' || platform === 'grok') {
    return new XAiClient(options);
  } else if (platform) {
    throw new Error(`Unknown platform "${platform}".`);
  }
}
