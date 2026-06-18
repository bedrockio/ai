import path from 'path';

import {
  getAllOptions,
  getLastOptions,
  setResponse,
  setResponses,
} from '@anthropic-ai/sdk';

import yd from '@bedrockio/yada';
import { describe, expect, it, vi } from 'vitest';

import Toolset from '../src/Toolset';
import { AnthropicClient } from '../src/anthropic';

vi.mock('@anthropic-ai/sdk');

const client = new AnthropicClient({
  templates: path.join(__dirname, './templates'),
});

function textResponse(text) {
  return {
    id: 'msg_text',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
  };
}

function toolUseResponse(calls) {
  return {
    id: 'msg_tool',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content: calls.map((call, i) => {
      return {
        type: 'tool_use',
        id: call.id || `toolu_${i}`,
        name: call.name,
        input: call.input || {},
      };
    }),
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
  };
}

function schemaResponse(input) {
  return {
    id: 'msg_schema',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5',
    content: [
      {
        type: 'tool_use',
        id: 'toolu_schema',
        name: 'schema',
        input,
      },
    ],
    stop_reason: 'tool_use',
    usage: {
      input_tokens: 10,
      output_tokens: 5,
    },
  };
}

describe('local tool loop', () => {
  it('should execute a local handler and feed the result back', async () => {
    const handler = vi.fn().mockReturnValue('42');
    setResponses([
      toolUseResponse([
        {
          name: 'lookup',
          input: {
            q: 'x',
          },
        },
      ]),
      textResponse('the answer is 42'),
    ]);

    const { result } = await client.prompt({
      input: 'hi',
      tools: [
        {
          name: 'lookup',
          description: 'Looks things up.',
          inputSchema: yd.object({
            q: yd.string(),
          }),
          handler,
        },
      ],
    });

    expect(result).toBe('the answer is 42');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      {
        q: 'x',
      },
      undefined,
    );

    // The second call carries the tool exchange.
    const { messages } = getLastOptions();
    expect(messages).toEqual([
      {
        role: 'user',
        content: 'hi',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_0',
            name: 'lookup',
            input: {
              q: 'x',
            },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_0',
            content: '42',
          },
        ],
      },
    ]);
  });

  it('should strip the handler and serialize inputSchema for the wire', async () => {
    setResponse(textResponse('done'));

    await client.prompt({
      input: 'hi',
      tools: [
        {
          name: 'lookup',
          description: 'Looks things up.',
          inputSchema: yd.object({
            q: yd.string(),
          }),
          handler() {
            return 'nope';
          },
        },
      ],
    });

    const { tools } = getLastOptions();
    expect(tools).toEqual([
      {
        name: 'lookup',
        description: 'Looks things up.',
        input_schema: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    ]);
  });

  it('should finalize via the schema tool without executing it', async () => {
    const handler = vi.fn().mockReturnValue(
      JSON.stringify({
        found: true,
      }),
    );
    setResponses([
      toolUseResponse([
        {
          name: 'find',
          input: {
            name: 'Ruffus',
          },
        },
      ]),
      schemaResponse({
        id: 'patient_1',
      }),
    ]);

    const { result } = await client.prompt({
      input: 'find the patient',
      schema: yd.object({
        id: yd.string().required(),
      }),
      tools: [
        {
          name: 'find',
          description: 'Finds a patient.',
          inputSchema: yd.object({
            name: yd.string(),
          }),
          handler,
        },
      ],
    });

    expect(result).toEqual({
      id: 'patient_1',
    });
    // 'find' ran once; 'schema' was never executed as a handler.
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should feed a thrown handler back as an error result and continue', async () => {
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('not found');
    });
    setResponses([
      toolUseResponse([
        {
          name: 'find',
          input: {},
        },
      ]),
      textResponse('I could not find it.'),
    ]);

    const { result } = await client.prompt({
      input: 'find it',
      tools: [
        {
          name: 'find',
          description: 'Finds.',
          handler,
        },
      ],
    });

    expect(result).toBe('I could not find it.');

    const { messages } = getLastOptions();
    const last = messages[messages.length - 1];
    expect(last.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'toolu_0',
        content: 'not found',
        is_error: true,
      },
    ]);
  });

  it('should run multiple sequential tool rounds', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    setResponses([
      toolUseResponse([
        {
          name: 'step',
          id: 'a',
          input: {
            n: 1,
          },
        },
      ]),
      toolUseResponse([
        {
          name: 'step',
          id: 'b',
          input: {
            n: 2,
          },
        },
      ]),
      textResponse('all done'),
    ]);

    const { result } = await client.prompt({
      input: 'go',
      tools: [
        {
          name: 'step',
          description: 'A step.',
          handler,
        },
      ],
    });

    expect(result).toBe('all done');
    expect(handler).toHaveBeenCalledTimes(2);
    // Three model calls: two tool rounds + the final text.
    expect(getAllOptions()).toHaveLength(3);
  });

  it('should execute multiple tool calls in a single turn', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    setResponses([
      toolUseResponse([
        {
          name: 'step',
          id: 'a',
          input: {
            n: 1,
          },
        },
        {
          name: 'step',
          id: 'b',
          input: {
            n: 2,
          },
        },
      ]),
      textResponse('both done'),
    ]);

    const { result } = await client.prompt({
      input: 'go',
      tools: [
        {
          name: 'step',
          description: 'A step.',
          handler,
        },
      ],
    });

    expect(result).toBe('both done');
    expect(handler).toHaveBeenCalledTimes(2);

    const { messages } = getLastOptions();
    const last = messages[messages.length - 1];
    expect(last.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 'a',
        content: 'ok',
      },
      {
        type: 'tool_result',
        tool_use_id: 'b',
        content: 'ok',
      },
    ]);
  });

  it('should forward the context to the handler', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    setResponses([
      toolUseResponse([
        {
          name: 'step',
          input: {},
        },
      ]),
      textResponse('done'),
    ]);

    const context = {
      user: 'me',
    };
    await client.prompt({
      input: 'go',
      context,
      tools: [
        {
          name: 'step',
          description: 'A step.',
          handler,
        },
      ],
    });

    expect(handler).toHaveBeenCalledWith({}, context);
  });

  it('should accept tools via a Toolset option', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    const toolset = new Toolset({
      tools: [
        {
          name: 'step',
          description: 'A step.',
          inputSchema: yd.object({
            n: yd.number(),
          }),
          handler,
        },
      ],
    });
    setResponses([
      toolUseResponse([
        {
          name: 'step',
          input: {},
        },
      ]),
      textResponse('done'),
    ]);

    const { result } = await client.prompt({
      input: 'go',
      toolset,
    });

    expect(result).toBe('done');
    expect(handler).toHaveBeenCalledTimes(1);
    // The toolset's tools are surfaced to the model on the first call.
    const [first] = getAllOptions();
    expect(first.tools).toEqual([
      {
        name: 'step',
        description: 'A step.',
        input_schema: {
          type: 'object',
          properties: {
            n: {
              type: 'number',
            },
          },
          required: [],
          additionalProperties: false,
        },
      },
    ]);
  });

  it('should remain single-shot when no local tools are present', async () => {
    setResponse(textResponse('just text'));

    const { result } = await client.prompt({
      input: 'hi',
    });

    expect(result).toBe('just text');
    expect(getAllOptions()).toHaveLength(1);
  });
});
