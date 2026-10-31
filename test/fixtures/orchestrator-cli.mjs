// CLI de teste: usa a ponte MCP real, disputa um arquivo e publica consumo estruturado.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const [configFile, card, column, mode] = process.argv.slice(2);
if (mode === 'transient') {
  // falha de rede antes de qualquer efeito: nenhuma alteração da pasta, nenhuma ferramenta
  process.stderr.write('Error: read ECONNRESET\n');
  process.exit(1);
}
// o que a IA declara no bloco final (#1109): a resposta termina com o JSON
const BLOCKS = {
  'needs-context': { outcome: 'NEEDS_CONTEXT', summary: 'falta o arquivo', pending: 'o caminho do módulo' },
  'needs-context-crash': { outcome: 'NEEDS_CONTEXT', summary: 'falta o arquivo', pending: 'o caminho do módulo' },
  blocked: { outcome: 'BLOCKED', summary: 'sem acesso ao serviço', failure_reason: 'a credencial expirou' },
  concerns: { outcome: 'DONE_WITH_CONCERNS', summary: 'feito', pending: 'o teste de carga não rodou' },
  declared: { outcome: 'DONE', summary: 'feito' },
};
const answer = BLOCKS[mode] ? `Feito.\n${JSON.stringify(BLOCKS[mode])}` : 'Feito';
const guard = path.join(process.cwd(), 'writer.guard');
const target = path.join(process.cwd(), 'work.txt');
const fd = fs.openSync(guard, 'wx');
try {
  fs.appendFileSync(target, `${card}\n`);
  if (mode === 'hold') {
    process.on('SIGTERM', () => {});
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM',()=>{}); process.stdout.write('ready'); setInterval(()=>{},1000)"], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    await new Promise((resolve, reject) => {
      child.stdout.once('data', resolve);
      child.once('error', reject);
    });
    fs.writeFileSync(path.join(process.cwd(), 'descendant'), String(child.pid));
    await new Promise(() => {});
  }
  await new Promise((resolve) => setTimeout(resolve, 30));
  if (mode === 'partial' || mode === 'needs-context-crash') process.exitCode = 1;
  else if (mode !== 'noop' && mode !== 'needs-context' && mode !== 'blocked') {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8')).mcpServers['faz-ai'];
    const client = new Client({ name: 'fixture', version: '1' });
    try {
      await client.connect(new StdioClientTransport({ ...config, env: { ...getDefaultEnvironment(), ...config.env }, stderr: 'ignore' }));
      const result = await client.callTool({ name: 'move_card', arguments: { card: Number(card), column } });
      if (result.isError) throw new Error(JSON.stringify(result.content));
    } finally {
      await client.close();
    }
  }
} finally {
  fs.closeSync(fd);
  fs.unlinkSync(guard);
}
// a IA que declarou e depois caiu: o processo sai com erro, e o bloco não vale
if (mode === 'needs-context-crash') {
  process.stdout.write(
    JSON.stringify({ type: 'result', subtype: 'success', result: answer, usage: { input_tokens: 2, output_tokens: 1 } }) + '\n',
  );
  process.exitCode = 1;
}
if (!process.exitCode)
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: answer,
      usage: { input_tokens: 2, output_tokens: 1 },
    }) + '\n',
  );
