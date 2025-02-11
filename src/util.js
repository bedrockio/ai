import fs from 'fs/promises';

import path from 'path';

import { glob } from 'glob';

const CODE_REG = /^```\w*$(.+)```/ms;
const JSON_REG = /([{[].+[}\]])/s;

export async function loadTemplates(dir) {
  const result = {};
  const files = await glob(path.join(dir, '*.md'));

  if (!files.length) {
    throw new Error(`No templates found in: ${dir}.`);
  }

  for (let file of files) {
    const base = path.basename(file, '.md');
    result[base] = await loadTemplate(file);
  }

  return result;
}

export async function loadTemplate(file) {
  return await fs.readFile(file, 'utf-8');
}

export function transformResponse(options) {
  const { output = 'text', messages, message } = options;
  const content = message.content || message.text;
  if (output === 'text') {
    return content;
  } else if (output === 'messages') {
    return [...messages, message];
  } else if (output === 'json') {
    return parseJson(content);
  } else if (output === 'code') {
    return parseCode(content);
  } else {
    throw new Error(`No output type provided.`);
  }
}

function parseJson(content) {
  try {
    return JSON.parse(content.match(JSON_REG)[0]);
  } catch (error) {
    throw new Error(`Unable to derive JSON from response:\n\n${content}`);
  }
}

function parseCode(content) {
  try {
    return content.match(CODE_REG)[1].trim();
  } catch (error) {
    throw new Error(`Unable to derive code from response:\n\n${content}`);
  }
}
