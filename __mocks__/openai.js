let models;
let lastOptions;
let responses = {};

export default function MockOpenAiClient() {
  return {
    chat: {
      completions: {
        create(options) {
          const response = responses['default'];
          if (options.stream) {
            return streamMock(response);
          } else {
            return response;
          }
        },
      },
    },
    responses: {
      create(options) {
        const { previous_response_id = 'default', input } = options;
        if (!input || input.length === 0) {
          throw new Error('Missing parameter "input".');
        } else if (Array.isArray(input) && !input[0].content) {
          throw new Error('Missing input content.');
        }
        lastOptions = options;
        const response = responses[previous_response_id];
        if (options.stream) {
          return streamMock(response);
        } else {
          return response;
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

export function setResponse(data, name = 'default') {
  responses[name] = data;
}

export function setModels(data) {
  models = data;
}

export function getLastOptions() {
  return lastOptions;
}

async function* streamMock(response) {
  if (!response) {
    throw new Error('No response to stream!');
  }
  for await (let event of response) {
    yield event;
  }
}
