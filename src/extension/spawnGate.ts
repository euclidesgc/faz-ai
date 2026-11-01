// O launcher não inicia a CLI antes de receber a descrição inteira pela entrada padrão.
// O host só a envia depois de gravar a identidade no WAL. Host morto antes disso = nenhuma inferência.
export const SPAWN_GATE = String.raw`
const {spawn} = require('node:child_process');
const chunks = [];
let child = null;
let started = false;
const launch = (raw, rest) => {
  if (started) return;
  started = true;
  let input;
  try {
    input = JSON.parse(raw.toString('utf8'));
    if (input.version !== 1 || typeof input.file !== 'string' || !Array.isArray(input.args)) throw new Error();
  } catch { process.stderr.write('Descrição de processo inválida.\n'); process.exitCode = 1; return; }
  try {
    child = spawn(input.file, input.args, {
      cwd: input.cwd, env: input.env, shell: input.shell,
      windowsVerbatimArguments: input.shell, windowsHide: true,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.stdin.on('error', () => {});
    if (input.stdinOpen) { if (rest && rest.length) child.stdin.write(rest); }
    else child.stdin.end(input.stdin);
  } catch { process.stderr.write('Não foi possível iniciar a ferramenta de IA.\n'); process.exitCode = 1; return; }
  child.on('error', () => { process.stderr.write('Não foi possível iniciar a ferramenta de IA.\n'); process.exitCode = 1; });
  child.on('close', code => { process.exitCode = code === null ? 1 : code; });
};
process.stdin.on('data', chunk => {
  if (started) { if (child && !child.stdin.destroyed) child.stdin.write(chunk); return; }
  chunks.push(chunk);
  const all = Buffer.concat(chunks);
  const nl = all.indexOf(10);
  if (nl >= 0) launch(all.subarray(0, nl), all.subarray(nl + 1));
});
process.stdin.on('end', () => {
  if (started) { if (child && !child.stdin.destroyed) child.stdin.end(); return; }
  if (!chunks.length) return;
  launch(Buffer.concat(chunks), null);
});
`;
