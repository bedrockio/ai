import { OBJ, STR, parse } from 'partial-json';

export function createMessageExtractor(keys) {
  let buffer = '';
  const extractors = keys.map((key) => {
    return createExtractor(key);
  });
  return (delta) => {
    buffer += delta;
    return extractors
      .map((extractor) => {
        return extractor(buffer);
      })
      .filter((extracted) => {
        return extracted;
      });
  };
}

function createExtractor(key) {
  let lastText = '';
  let done = false;
  return (buffer) => {
    if (done) {
      return;
    }

    const text = extractText(buffer, key);

    if (!text) {
      return;
    }

    if (text === lastText) {
      done = true;
    }

    const delta = text.slice(lastText.length);

    lastText = text;

    return {
      key,
      text,
      delta,
      done,
    };
  };
}

function extractText(input, key) {
  if (!input) {
    return;
  }
  const parsed = parse(input, STR | OBJ);
  return parsed?.[key] || '';
}
