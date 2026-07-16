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

// Stream events for one assistant turn that thinks before calling a tool —
// the shape Sonnet-5-class models produce with adaptive thinking on. The
// thinking block must be accumulated in full: it is replayed alongside the
// tool results on the next round, and the API rejects an empty one.
function thinkingToolTurn(call) {
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
        thinking: 'let me look that up',
      },
    },
    {
      type: 'content_block_delta',
      index: 0,
      delta: {
        type: 'signature_delta',
        signature: 'sig123',
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
        type: 'tool_use',
        id: call.id,
        name: call.name,
      },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(call.input),
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

// Stream events for one assistant turn that thinks before calling a tool on a
// model whose thinking display is "omitted" (the default on Sonnet 5 and Opus
// 4.7+): no thinking deltas arrive at all, only the signature. The resulting
// block has empty text but a valid signature and must still be replayed with
// the tool results.
function omittedThinkingToolTurn(call) {
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
        type: 'signature_delta',
        signature: 'sig456',
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
        type: 'tool_use',
        id: call.id,
        name: call.name,
      },
    },
    {
      type: 'content_block_delta',
      index: 1,
      delta: {
        type: 'input_json_delta',
        partial_json: JSON.stringify(call.input),
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

  it('should replay a complete thinking block with the tool results', async () => {
    const handler = vi.fn().mockReturnValue('42');
    setResponses([
      thinkingToolTurn({
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

    // The second request replays the assistant's tool-use turn. The thinking
    // block must arrive complete — accumulated content and signature — or the
    // API rejects the request.
    const requests = getAllOptions();
    expect(requests).toHaveLength(2);
    const replayed = requests[1].messages.find((m) => {
      return m.role === 'assistant';
    });
    expect(replayed.content).toEqual([
      {
        type: 'thinking',
        thinking: 'let me look that up',
        signature: 'sig123',
      },
      {
        type: 'tool_use',
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      },
    ]);

    // The persisted tool-use turn keeps its thinking block — it is complete
    // (content + signature), so replaying it later is valid. Only the final
    // assistant message strips thinking (see the persisted-message test).
    const stop = events.find((e) => {
      return e.type === 'stop';
    });
    const persisted = stop.messages.find((m) => {
      return (
        Array.isArray(m.content) &&
        m.content.some((block) => {
          return block.type === 'tool_use';
        })
      );
    });
    expect(persisted.content[0]).toEqual({
      type: 'thinking',
      thinking: 'let me look that up',
      signature: 'sig123',
    });
    expect(stop.messages.at(-1)).toEqual({
      role: 'assistant',
      content: 'the answer is 42',
    });
  });

  it('should replay a signed thinking block with empty text (display omitted)', async () => {
    const handler = vi.fn().mockReturnValue('42');
    setResponses([
      omittedThinkingToolTurn({
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      }),
      textTurn('the answer is 42'),
    ]);

    await collect(
      client.stream({
        input: 'hi',
        tools: [localTool('lookup', handler)],
      }),
    );

    expect(handler).toHaveBeenCalledTimes(1);

    // With display "omitted" the block has no text, only a signature. It is
    // valid — the API decrypts the signature to reconstruct the reasoning —
    // and dropping it from the tool-use replay is a 400.
    const requests = getAllOptions();
    expect(requests).toHaveLength(2);
    const replayed = requests[1].messages.find((m) => {
      return m.role === 'assistant';
    });
    expect(replayed.content).toEqual([
      {
        type: 'thinking',
        thinking: '',
        signature: 'sig456',
      },
      {
        type: 'tool_use',
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      },
    ]);
  });

  it('should drop empty thinking blocks from replayed saved messages', async () => {
    setResponses([textTurn('healed')]);

    // A conversation persisted before thinking deltas were accumulated — the
    // assistant message carries a malformed thinking block with no content
    // and no signature, which the API rejects on replay.
    const events = await collect(
      client.stream({
        messages: [
          {
            role: 'user',
            content: 'hi',
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'thinking',
                thinking: '',
              },
              {
                type: 'text',
                text: 'old reply',
              },
            ],
          },
          {
            role: 'user',
            content: 'and again?',
          },
        ],
      }),
    );

    const [request] = getAllOptions();
    const assistant = request.messages.find((m) => {
      return m.role === 'assistant';
    });
    expect(assistant.content).toEqual([
      {
        type: 'text',
        text: 'old reply',
      },
    ]);

    expect(
      events
        .filter((e) => {
          return e.type === 'delta';
        })
        .map((e) => {
          return e.delta;
        })
        .join(''),
    ).toBe('healed');
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

    // The assistant message carries only the text. The final turn's thinking
    // is dropped from the persisted history: the API allows prior turns to
    // omit thinking blocks, this message was never part of a request prefix
    // (so no cache entry depends on it), and on Opus 4.5+ / Sonnet 4.6+ a
    // replayed thinking block would be kept in context and billed.
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

  it('should forward cache_control on every tool-loop round', async () => {
    const handler = vi.fn().mockReturnValue('42');
    setResponses([
      toolTurn({
        id: 't1',
        name: 'lookup',
        input: {
          q: 'x',
        },
      }),
      textTurn('done'),
    ]);

    await collect(
      client.stream({
        input: 'hi',
        tools: [localTool('lookup', handler)],
        cache_control: {
          type: 'ephemeral',
        },
      }),
    );

    // Each round is a separate request, and the auto-placed breakpoint must
    // advance past the appended tool exchange — so every round carries the
    // top-level cache_control.
    const requests = getAllOptions();
    expect(requests).toHaveLength(2);
    for (let request of requests) {
      expect(request.cache_control).toEqual({
        type: 'ephemeral',
      });
    }
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
