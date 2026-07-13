import path from 'path';

import { getAllOptions, setResponses } from '@anthropic-ai/sdk';
import yd from '@bedrockio/yada';
import { describe, expect, it, vi } from 'vitest';

import { AnthropicClient } from '../src/anthropic';

vi.mock('@anthropic-ai/sdk');

const client = new AnthropicClient({
  templates: path.join(__dirname, './templates'),
});

const USAGE = {
  input_tokens: 5,
  output_tokens: 3,
};

// Stream events for one assistant turn that emits text.
function textTurn(text) {
  return [
    {
      type: 'message_start',
      message: {},
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'text',
        text: '',
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'text_delta',
        text,
      },
    },
    {
      type: 'content_block_stop',
      index: 0,
    },
    {
      type: 'message_delta',
      usage: USAGE,
    },
    {
      type: 'message_stop',
    },
  ];
}

// Stream events for one assistant turn that calls a tool (input streamed as an
// input_json_delta, as the real API does).
function toolTurn(call) {
  return [
    {
      type: 'message_start',
      message: {},
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'tool_use',
        id: call.id,
        name: call.name,
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(call.input),
      },
    },
    {
      type: 'content_block_stop',
      index: 0,
    },
    {
      type: 'message_delta',
      usage: USAGE,
    },
    {
      type: 'message_stop',
    },
  ];
}

// Stream events for one assistant turn that thinks before emitting text, as
// models with thinking on by default (e.g. Sonnet 5) do.
function thinkingTextTurn(text) {
  return [
    {
      type: 'message_start',
      message: {},
    },
    {
      type: 'content_block_start',
      index: 0,
      content_block: {
        type: 'thinking',
        thinking: '',
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'thinking_delta',
        thinking: 'hmm',
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'signature_delta',
        signature: 'sig',
      },
    },
    {
      type: 'content_block_stop',
      index: 0,
    },
    {
      type: 'content_block_start',
      index: 1,
      content_block: {
        type: 'text',
        text: '',
      },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'text_delta',
        text,
      },
    },
    {
      type: 'content_block_stop',
      index: 1,
    },
    {
      type: 'message_delta',
      usage: USAGE,
    },
    {
      type: 'message_stop',
    },
  ];
}

async function collect(stream) {
  const events = [];
  for await (let event of stream) {
    events.push(event);
  }
  return events;
}

function localTool(name, handler) {
  return {
    name,
    description: `Calls ${name}.`,
    inputSchema: yd.object({
      q: yd.string(),
    }),
    handler,
  };
}

describe('streaming tool loop', () => {
  it('should execute a tool mid-stream and continue to the final text', async () => {
    const handler = vi.fn().mockReturnValue('42');
    setResponses([
      toolTurn({
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      }),
      textTurn('the answer is 42'),
    ]);

    const events = await collect(
      client.stream({
        input: 'hi',
        tools: [localTool('lookup', handler)],
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      {
        q: 'x',
      },
      undefined,
    );

    // One continuous stream: a single start, a single stop.
    expect(
      events.filter((e) => {
        return e.type === 'start';
      }),
    ).toHaveLength(1);
    expect(
      events.filter((e) => {
        return e.type === 'stop';
      }),
    ).toHaveLength(1);

    const text = events
      .filter((e) => {
        return e.type === 'delta';
      })
      .map((e) => {
        return e.delta;
      })
      .join('');
    expect(text).toBe('the answer is 42');

    // The final stop carries the whole exchange for persistence.
    const stop = events.find((e) => {
      return e.type === 'stop';
    });
    expect(stop.messages).toEqual([
      {
        role: 'user',
        content: 'hi',
      },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 't1',
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
            tool_use_id: 't1',
            content: '42',
          },
        ],
      },
      {
        role: 'assistant',
        content: 'the answer is 42',
      },
    ]);
  });

  it('should run multiple tool rounds before finishing', async () => {
    const handler = vi.fn().mockReturnValue('ok');
    setResponses([
      toolTurn({
        id: 'a',
        name: 'lookup',
        input: {
          q: '1',
        },
      }),
      toolTurn({
        id: 'b',
        name: 'lookup',
        input: {
          q: '2',
        },
      }),
      textTurn('done'),
    ]);

    const events = await collect(
      client.stream({
        input: 'go',
        tools: [localTool('lookup', handler)],
      }),
    );

    expect(handler).toHaveBeenCalledTimes(2);
    expect(
      events.filter((e) => {
        return e.type === 'start';
      }),
    ).toHaveLength(1);
    expect(
      events.filter((e) => {
        return e.type === 'stop';
      }),
    ).toHaveLength(1);
    // Three streamed turns: two tool rounds + the final text.
    expect(getAllOptions()).toHaveLength(3);
  });

  it('should feed a thrown handler back as an error result and recover', async () => {
    const handler = vi.fn().mockImplementation(() => {
      throw new Error('boom');
    });
    setResponses([
      toolTurn({
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      }),
      textTurn('recovered'),
    ]);

    const events = await collect(
      client.stream({
        input: 'hi',
        tools: [localTool('lookup', handler)],
      }),
    );

    const stop = events.find((e) => {
      return e.type === 'stop';
    });
    const toolResult = stop.messages.find((m) => {
      return Array.isArray(m.content) && m.content[0]?.type === 'tool_result';
    });
    expect(toolResult.content).toEqual([
      {
        type: 'tool_result',
        tool_use_id: 't1',
        content: 'boom',
        is_error: true,
      },
    ]);
  });

  it('should keep thinking blocks out of the persisted message', async () => {
    setResponses([thinkingTextTurn('all done')]);

    const events = await collect(
      client.stream({
        input: 'hi',
      }),
    );

    expect(
      events
        .filter((e) => {
          return e.type === 'delta';
        })
        .map((e) => {
          return e.delta;
        })
        .join(''),
    ).toBe('all done');

    // The assistant message carries only the text — a replayed thinking block
    // (whose deltas are never accumulated) would be rejected on the next turn.
    const stop = events.find((e) => {
      return e.type === 'stop';
    });
    expect(stop.messages).toEqual([
      {
        role: 'user',
        content: 'hi',
      },
      {
        role: 'assistant',
        content: 'all done',
      },
    ]);
  });

  it('should stream a single pass when no local tools are present', async () => {
    setResponses([textTurn('just text')]);

    const events = await collect(
      client.stream({
        input: 'hi',
      }),
    );

    expect(
      events.filter((e) => {
        return e.type === 'start';
      }),
    ).toHaveLength(1);
    expect(
      events.filter((e) => {
        return e.type === 'stop';
      }),
    ).toHaveLength(1);
    expect(
      events
        .filter((e) => {
          return e.type === 'delta';
        })
        .map((e) => {
          return e.delta;
        })
        .join(''),
    ).toBe('just text');
    expect(getAllOptions()).toHaveLength(1);
  });
});
