// CLI de teste: usa a ponte MCP real, disputa um arquivo e publica consumo estruturado.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const [configFile, card, column, mode] = process.argv.slice(2);
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
  if (mode === 'partial') process.exitCode = 1;
  else if (mode !== 'noop') {
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
if (!process.exitCode)
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'Feito',
      usage: { input_tokens: 2, output_tokens: 1 },
    }) + '\n',
  );
