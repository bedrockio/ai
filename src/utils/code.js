const CODE_REG = /^```\w*(.+)```/s;

export function parseCode(content) {
  if (!content) {
    return '';
  }

  const match = content.trim().match(CODE_REG);
  if (match) {
    content = match[1].trim();
  }
  return content;
}
