import { GoogleGenAI } from '@google/genai';

import BaseClient from './BaseClient.js';

const DEFAULT_MODEL = 'gemini-2.5-flash';

export class GoogleClient extends BaseClient {
  constructor(options) {
    super(options);
    const { apiKey } = options;
    this.client = new GoogleGenAI({
      apiKey,
    });
  }

  /**
   * Lists available models.
   * {@link https://ai.google.dev/gemini-api/docs/models/gemini#gemini-2.0-flashl Documentation}
   */
  async models() {
    return [
      // Gemini 3 (Nov 2025)
      'gemini-3-pro-preview',

      // Gemini 2.5
      'gemini-2.5-pro',
      'gemini-2.5-flash',

      // Gemini 2.0
      'gemini-2.0-flash',

      // Gemini 1.5 (legacy but still available)
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ];
  }

  async runPrompt(options) {
    const { model = DEFAULT_MODEL, messages, system } = options;

    const contents = messages.map((message) => {
      const { role, content } = message;
      return {
        role,
        parts: [
          {
            text: content,
          },
        ],
      };
    });

    const params = {
      model,
      contents,
      ...(system && {
        config: {
          systemInstruction: system,
        },
      }),
    };

    return await this.client.models.generateContent(params);
  }

  runStream(options) {
    const params = this.getParams(options);
    return this.client.models.generateContentStream(params);
  }

  getTextResponse(response) {
    return response.text;
  }

  normalizeResponse(response, options) {
    const { messages } = options;
    return {
      messages: [
        ...messages,
        {
          role: 'assistant',
          content: response.text,
        },
      ],
      usage: this.normalizeUsage(response),
    };
  }

  normalizeUsage(response) {
    return {
      input_tokens: response.usageMetadata.promptTokenCount,
      output_tokens: response.usageMetadata.candidatesTokenCount,
    };
  }

  getParams(options) {
    const { model = DEFAULT_MODEL, messages, system } = options;

    const contents = messages.map((message) => {
      const { role, content } = message;
      return {
        role,
        parts: [
          {
            text: content,
          },
        ],
      };
    });

    return {
      model,
      contents,
      ...(system && {
        config: {
          systemInstruction: system,
        },
      }),
    };
  }

  normalizeStreamEvent(event) {
    // Note Gemini doesn't provide different events, only a single GenerateContentResponse.
    return {
      type: 'delta',
      delta: event.text,
    };
  }
}
