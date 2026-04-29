let mock;
let models;
let lastOptions;

export default function MockAnthropicClient() {
  return {
    messages: {
      create(options) {
        validateToolUseInput(options);
        lastOptions = options;
        if (options.stream) {
          return streamMock();
        } else {
          return mock;
        }
      },
    },
    models: {
      list() {
        return {
          data: models,
        };
      },
    },
  };
}

// Mirrors the 400 the real API returns when a tool_use or mcp_tool_use
// block in messages is missing the required `input` field — for example
// after a Mongoose `Mixed` field has stripped the empty `{}`.
function validateToolUseInput(options) {
  const messages = options.messages || [];
  for (let m = 0; m < messages.length; m++) {
    const content = messages[m].content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (let c = 0; c < content.length; c++) {
      const block = content[c];
      const isToolUse =
        block.type === 'tool_use' || block.type === 'mcp_tool_use';
      if (isToolUse && block.input === undefined) {
        throw new Error(
          `messages.${m}.content.${c}.${block.type}.input: Field required`,
        );
      }
    }
  }
}

export function setResponse(data) {
  mock = data;
}

export function setModels(data) {
  models = data;
}

export function getLastOptions() {
  return lastOptions;
}

async function* streamMock() {
  for await (let event of mock) {
    yield event;
  }
}
