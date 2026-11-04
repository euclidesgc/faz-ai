// Arquivos que a ferramenta só lê da pasta do projeto, criados para uma execução e apagados no fim: a filha da
// sessão da História no Kimi Code (`.kimi-code/agents/<nome>.md`). Diferente do `.kimi-code/mcp.json`, que é um
// arquivo compartilhado reparado por empréstimo, estes nascem e morrem com a execução; um que já exista é da pessoa
// (ou de outra execução) e nunca é sobrescrito.
import * as fs from 'node:fs';
import * as path from 'node:path';

/** Um caminho relativo seguro: segmentos sem `..`, sem barra no começo e só com `[\w.-]`. */
const safeRelative = (rel: string): boolean =>
  rel.split('/').every((part) => /^[a-zA-Z0-9._-]+$/.test(part) && part !== '.' && part !== '..');

/**
 * Cria os arquivos em `cwd` e devolve quem os apaga (e as pastas que criou, se ficarem vazias). Falha, sem criar
 * nada, se um deles já existir ou se um caminho sair do projeto.
 */
export function materializeProjectFiles(cwd: string, files: Record<string, string> | undefined): () => void {
  const entries = Object.entries(files ?? {});
  if (!entries.length) return () => {};
  if (entries.some(([rel]) => !safeRelative(rel))) throw new Error('Caminho de arquivo do projeto inválido.');
  const targets = entries.map(([rel, content]) => ({ file: path.join(cwd, ...rel.split('/')), content }));
  const existing = targets.find(({ file }) => fs.existsSync(file));
  if (existing) throw new Error(`O arquivo ${path.relative(cwd, existing.file)} já existe no projeto; a execução não o sobrescreve.`);
  const createdDirs: string[] = [];
  const created: string[] = [];
  try {
    for (const { file, content } of targets) {
      // as pastas que ainda não existem, da mais externa para a mais interna, para apagar na ordem inversa
      const missing: string[] = [];
      for (let dir = path.dirname(file); dir !== cwd && !fs.existsSync(dir); dir = path.dirname(dir)) missing.unshift(dir);
      for (const dir of missing) {
        fs.mkdirSync(dir, { mode: 0o700 });
        createdDirs.push(dir);
      }
      fs.writeFileSync(file, content, { mode: 0o600, flag: 'wx' });
      created.push(file);
    }
  } catch (error) {
    cleanup(created, createdDirs);
    throw error;
  }
  return () => cleanup(created, createdDirs);
}

function cleanup(files: string[], dirs: string[]): void {
  for (const file of files) fs.rmSync(file, { force: true });
  for (const dir of [...dirs].reverse()) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {
      // a pasta já não existe ou ganhou conteúdo de outra pessoa: fica
    }
  }
}
