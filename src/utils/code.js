const CODE_REG = /^```\w*(.+)```/s;

export function parseCode(content) {
  const match = content.trim().match(CODE_REG);
  if (match) {
    content = match[1].trim();
  }
  return content;
}
