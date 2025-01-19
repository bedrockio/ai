let mock;

function Anthropic() {
  return {
    messages: {
      create(options) {
        if (options.stream) {
          return streamMock();
        } else {
          return mock;
        }
      },
    },
  };
}

function setResponse(data) {
  mock = data;
}

async function* streamMock() {
  const content = mock.content[0].text;
  const size = Math.floor(content.length / 3);
  const one = content.slice(0, size);
  const two = content.slice(size, 2 * size);
  const three = content.slice(2 * size);
  yield wrapChunk(one, 'content_block_start');
  yield wrapChunk(two, 'content_block_delta');
  yield wrapChunk(three, 'message_stop');
}

function wrapChunk(str, type) {
  return {
    type,
    delta: {
      text: str,
    },
  };
}

Anthropic.setResponse = setResponse;

module.exports = Anthropic;
