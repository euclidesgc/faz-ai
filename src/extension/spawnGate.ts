// O launcher não inicia a CLI antes de receber a descrição inteira pela entrada padrão.
// O host só a envia depois de gravar a identidade no WAL. Host morto antes disso = nenhuma inferência.
export const SPAWN_GATE = String.raw`
const {spawn} = require('node:child_process');
const chunks = [];
process.stdin.on('data', chunk => chunks.push(chunk));
process.stdin.on('end', () => {
  if (!chunks.length) return;
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (input.version !== 1 || typeof input.file !== 'string' || !Array.isArray(input.args)) throw new Error();
  } catch { process.stderr.write('Descrição de processo inválida.\n'); process.exitCode = 1; return; }
  let child;
  try {
    child = spawn(input.file, input.args, {
      cwd: input.cwd, env: input.env, shell: input.shell,
      windowsVerbatimArguments: input.shell, windowsHide: true,
      stdio: ['pipe', 'inherit', 'inherit']
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input.stdin);
  } catch { process.stderr.write('Não foi possível iniciar a ferramenta de IA.\n'); process.exitCode = 1; return; }
  child.on('error', () => { process.stderr.write('Não foi possível iniciar a ferramenta de IA.\n'); process.exitCode = 1; });
  child.on('close', code => { process.exitCode = code === null ? 1 : code; });
});
`;
