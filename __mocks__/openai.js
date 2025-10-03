let mock;
let models;

export default function MockOpenAiClient() {
  return {
    chat: {
      completions: {
        create(options) {
          if (options.stream) {
            return streamMock();
          } else {
            return mock;
          }
        },
      },
    },
    responses: {
      create(options) {
        if (!options.input) {
          throw new Error('Missing parameter "input".');
        }
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

export function setResponse(data) {
  mock = data;
}

export function setModels(data) {
  models = data;
}

async function* streamMock() {
  for await (let event of mock) {
    yield event;
  }
}
