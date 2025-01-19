import fs from 'fs/promises';

import path from 'path';

import { glob } from 'glob';

const JSON_REG = /([{[].+[}\]])/s;

export async function loadTemplates(dir) {
  const result = {};
  const files = await glob(path.join(dir, '*.md'));

  for (let file of files) {
    const base = path.basename(file, '.md');
    result[base] = await fs.readFile(file, 'utf-8');
  }

  return result;
}

export function parse(content) {
  try {
    const match = content.match(JSON_REG);
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error('Unable to derive JSON object in response.');
  }
}

export function transformResponse(options) {
  const { output = 'text', messages, message } = options;
  const content = message.content || message.text;
  if (output === 'text') {
    return content;
  } else if (output === 'messages') {
    return [...messages, message];
  } else if (output === 'json') {
    return parse(content);
  } else {
    throw new Error(`Unknown output type "${output}".`);
  }
}
