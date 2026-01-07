let mock;
let models;
let lastOptions;

export default function MockAnthropicClient() {
  return {
    messages: {
      create(options) {
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
