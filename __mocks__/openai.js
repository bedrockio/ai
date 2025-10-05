let models;
let responses = {};

export default function MockOpenAiClient() {
  return {
    chat: {
      completions: {
        create(options) {
          if (options.stream) {
            return streamMock();
          } else {
            return responses['default'];
          }
        },
      },
    },
    responses: {
      create(options) {
        const { previous_response_id = 'default' } = options;
        if (!options.input) {
          throw new Error('Missing parameter "input".');
        }
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

async function* streamMock(response) {
  for await (let event of response) {
    yield event;
  }
}
