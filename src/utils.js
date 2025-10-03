import fs from 'fs/promises';
import path from 'path';

import { glob } from 'glob';
import Mustache from 'mustache';

const CODE_REG = /^```\w*(.+)```/s;

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

export function parseCode(content) {
  const match = content.trim().match(CODE_REG);
  if (match) {
    content = match[1].trim();
  }
  return content;
}

export function renderTemplate(template, options) {
  let params = {
    ...options,
    ...options.params,
  };

  params = mapObjects(params);
  params = wrapProxy(params);
  return Mustache.render(template, params);
}

async function loadTemplate(file) {
  return await fs.readFile(file, 'utf-8');
}

// Transform arrays and object to versions
// that are more understandable in the context
// of a template that may have meaningful whitespace.
function mapObjects(params) {
  const result = {};
  for (let [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      value = mapArray(value);
    } else if (typeof value === 'object') {
      value = JSON.stringify(value, null, 2);
    }
    result[key] = value;
  }
  return result;
}

function mapArray(arr) {
  // Only map simple arrays of primitives.
  if (typeof arr[0] === 'string') {
    arr = arr
      .map((el) => {
        return `- ${el}`;
      })
      .join('\n');
  }
  return arr;
}

// Wrap params with a proxy object that reports
// as having all properties. If one is accessed
// that does not exist then return the original
// token. This way templates can be partially
// interpolated and re-interpolated later.
function wrapProxy(params) {
  return new Proxy(params, {
    has() {
      return true;
    },

    get(target, prop) {
      if (prop in target) {
        return target[prop];
      } else {
        return `{{{${prop.toString()}}}}`;
      }
    },
  });
}
