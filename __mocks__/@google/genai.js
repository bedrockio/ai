let mock;

export class GoogleGenAI {
  constructor() {
    return {
      models: {
        generateContent() {
          return wrapGetter(mock);
        },
        generateContentStream() {
          return streamMock();
        },
      },
    };
  }
}

export function setResponse(data) {
  mock = data;
}

async function* streamMock() {
  for await (let event of mock) {
    yield wrapGetter(event);
  }
}

function wrapGetter(response) {
  return {
    ...response,
    get text() {
      return response.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    },
  };
}
