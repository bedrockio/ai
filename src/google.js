import { GoogleGenerativeAI } from '@google/generative-ai';

import BaseClient from './BaseClient.js';
import { transformResponse } from './util.js';

const DEFAULT_MODEL = 'models/gemini-2.0-flash-exp';

export class GoogleClient extends BaseClient {
  constructor(options) {
    super(options);
    const { apiKey } = options;
    this.client = new GoogleGenerativeAI(apiKey);
  }

  /**
   * Lists available models.
   * {@link https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.0-flashl Documentation}
   */
  async models() {
    return [
      'gemini-2.0-flash-exp',
      'gemini-1.5-flash',
      'gemini-1.5-flash-8b',
      'gemini-1.5-pro',
    ];
  }

  async getCompletion(options) {
    const { model = DEFAULT_MODEL, output = 'text', stream = false } = options;
    const { client } = this;

    const generator = client.getGenerativeModel({ model });

    const messages = await this.getMessages(options);

    const prompts = messages.map((message) => {
      return message.content;
    });

    let response;

    if (stream) {
      response = await generator.generateContentStream(prompts);
    } else {
      response = await generator.generateContent(prompts);
    }
    // const response = await client.chat.completions.create({
    //   model,
    //   messages,
    //   stream,
    // });

    if (output === 'raw') {
      return response;
    }

    // @ts-ignore
    const parts = response.response.candidates.flatMap((candidate) => {
      return candidate.content.parts;
    });
    const [message] = parts;

    return transformResponse({
      ...options,
      messages,
      message,
    });
  }
  async getStream(options) {
    const response = await super.getStream(options);
    // @ts-ignore
    return response.stream;
  }

  getStreamedChunk(chunk, started) {
    const [candidate] = chunk.candidates;

    let type;
    if (!started) {
      type = 'start';
    } else if (candidate.finishReason === 'STOP') {
      type = 'stop';
    } else {
      type = 'chunk';
    }

    if (type) {
      return {
        type,
        text: candidate.content.parts[0].text || '',
      };
    }
  }
}
