import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runAcceptance, type AcceptanceResult, type ReferenceStory } from './stories';

/**
 * Copia `repo/` (e, se pedido, `solution/` por cima) para uma pasta temporária nova e a devolve. Quem chama
 * remove a pasta. A `solution/` só serve à prova do conjunto: o runner copia apenas `repo/` para a IA.
 */
export function materialize(story: ReferenceStory, opts: { withSolution: boolean }): string {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `fazai-ref-${story.id}-`));
  fs.cpSync(path.join(story.dir, 'repo'), work, { recursive: true });
  if (opts.withSolution) fs.cpSync(path.join(story.dir, 'solution'), work, { recursive: true });
  return work;
}

/** Quantas vezes cada lado da prova roda: o aceite precisa dar o mesmo resultado nas duas (determinismo). */
const PROOF_RUNS = 2;

async function runSide(story: ReferenceStory, withSolution: boolean): Promise<AcceptanceResult[]> {
  const results: AcceptanceResult[] = [];
  for (let i = 0; i < PROOF_RUNS; i++) {
    const work = materialize(story, { withSolution });
    try {
      results.push(await runAcceptance(story, work));
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
  return results;
}

/**
 * A prova do conjunto: o aceite falha no `repo/` puro e passa com a `solution/` por cima, duas vezes cada.
 * Não decide nada: devolve os resultados para o teste apontar o lado que quebrou, com a saída do `node --test`.
 */
export async function proveReference(
  story: ReferenceStory,
): Promise<{ withoutSolution: AcceptanceResult[]; withSolution: AcceptanceResult[] }> {
  return { withoutSolution: await runSide(story, false), withSolution: await runSide(story, true) };
}
