// stderr only: on the stdio transport, stdout carries the MCP messages.
const time = () => new Date().toISOString().slice(11, 19);

export const log = {
  info: (msg: string) => console.error(`${time()} ${msg}`),
  warn: (msg: string) => console.error(`${time()} warning: ${msg}`),
};
