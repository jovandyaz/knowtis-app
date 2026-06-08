import { io } from 'socket.io-client';

const URL = process.env.AGENT_URL ?? 'http://localhost:3333/agent';
const TOKEN = process.env.AGENT_TOKEN;
const PROMPT =
  process.argv[2] ?? 'Busca mis notas sobre productividad y resúmelas.';

if (!TOKEN) {
  throw new Error('Set AGENT_TOKEN to a valid access token');
}

const socket = io(URL, { auth: { token: TOKEN }, transports: ['websocket'] });

const finish = (code: number) => {
  socket.close();
  process.exit(code);
};

const watchdog = setTimeout(() => {
  process.stdout.write('\n[timeout] no terminal event within 120s\n');
  finish(1);
}, 120000);

socket.on('connect', () => {
  process.stdout.write('connected; sending turn...\n\n');
  socket.emit('agent:message', {
    messages: [{ role: 'user', content: PROMPT }],
  });
});
socket.on('agent:chunk', ({ text }: { text: string }) =>
  process.stdout.write(text)
);
socket.on('agent:done', ({ usage }: { usage: unknown }) => {
  clearTimeout(watchdog);
  process.stdout.write(`\n\n[done] ${JSON.stringify(usage)}\n`);
  finish(0);
});
socket.on('agent:error', (e: unknown) => {
  clearTimeout(watchdog);
  process.stdout.write(`\n[error] ${JSON.stringify(e)}\n`);
  finish(1);
});
