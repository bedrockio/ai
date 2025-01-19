let mock;

function OpenAI() {
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
  };
}

async function* streamMock() {
  const content = mock.choices[0].message.content;
  const size = Math.floor(content.length / 3);
  const one = content.slice(0, size);
  const two = content.slice(size, 2 * size);
  const three = content.slice(2 * size);
  yield wrapChunk(one);
  yield wrapChunk(two);
  yield wrapChunk(three);
}

function wrapChunk(str) {
  return {
    choices: [
      {
        delta: {
          content: str,
        },
      },
    ],
  };
}

function setResponse(data) {
  mock = data;
}

OpenAI.setResponse = setResponse;

module.exports = OpenAI;
