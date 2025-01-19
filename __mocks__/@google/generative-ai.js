let mock;

class MockGoogleClient {
  constructor() {
    return {
      getGenerativeModel() {
        return {
          generateContent() {
            return mock;
          },
          generateContentStream() {
            return {
              stream: streamMock(),
            };
          },
        };
      },
    };
  }
}

function setResponse(data) {
  mock = data;
}

async function* streamMock() {
  const content = mock.response.candidates[0].content.parts[0].text;
  const size = Math.floor(content.length / 3);
  const one = content.slice(0, size);
  const two = content.slice(size, 2 * size);
  const three = content.slice(2 * size);
  yield wrapChunk(one);
  yield wrapChunk(two);
  yield wrapChunk(three, true);
}

function wrapChunk(str, finish) {
  return {
    candidates: [
      {
        ...(finish && {
          finishReason: 'STOP',
        }),
        content: {
          parts: [
            {
              text: str,
            },
          ],
        },
      },
    ],
  };
}

module.exports = {
  setResponse,
  GoogleGenerativeAI: MockGoogleClient,
};
