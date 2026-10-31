/**
 * Avaliação de modelos: conduz as histórias de referência pelo board real com um modelo e grava o placar.
 *
 *   npm run eval -- --model <perfil>:<modelo>@<esforço> [--stories a,b] [--arm A|B] [--timeout <min>] [--keep] [--out <pasta>]
 */
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseModel } from './lib/evalBoard';
import { armDir, checkUvx, fixtureHash, loadArm, parseArm, readManifest, type Arm } from './lib/harnessArm';
import { openHostBoard } from './lib/hostBoard';
import { dropOuterRunGitConfig } from './lib/outerRun';
import { runStory } from './lib/runStory';
import { scoreStory, summarize, writeScoreboard, type StoryScore } from './lib/scoreboard';
import { loadStories, prepareProject, runAcceptance, UnknownStoryError, type AcceptanceResult } from './lib/stories';

const ROOT = path.resolve(__dirname, '..', '..');

const HELP = `Avaliação de modelos do Faz AI: roda as histórias de referência e grava o placar.

Uso: npm run eval -- --model <perfil>:<modelo>@<esforço> [opções]

  --model <valor>     modelo avaliado, por exemplo claude:opus@medium (obrigatória)
  --story <a,b>       só estas histórias (padrão: todas de evals/stories); --stories também vale
  --arm <A|B>         Harness do braço do piloto de contexto mínimo (A: atual; B: revisado). Sem a opção, o Harness de fábrica
  --timeout <min>     tempo limite por história, em minutos (padrão: o da história)
  --keep              mantém a pasta temporária de cada história e mostra o caminho
  --out <pasta>       onde gravar o placar (padrão: evals/scoreboard)
  -h, --help          mostra esta ajuda

Gasta tokens do modelo escolhido. Os dados da pessoa nunca são abertos: cada história roda num board temporário.
`;

interface Options {
  model: string;
  stories?: string[];
  timeoutMinutes?: number;
  arm: Arm | null;
  keep: boolean;
  out: string;
}

function parseArgs(args: string[]): Options {
  const rest = [...args];
  const value = (name: string): string | undefined => {
    const i = rest.indexOf(name);
    if (i < 0) return undefined;
    const v = rest[i + 1];
    if (!v || v.startsWith('--')) throw new Error(`Falta o valor de ${name}.`);
    rest.splice(i, 2);
    return v;
  };
  const model = value('--model');
  const stories = value('--story') ?? value('--stories');
  const timeout = value('--timeout');
  const out = value('--out');
  const arm = parseArm(value('--arm'));
  const keep = rest.includes('--keep');
  const unknown = rest.find((a) => a !== '--keep');
  if (unknown) throw new Error(`Argumento desconhecido: ${unknown}. Veja npm run eval -- -h.`);
  if (!model) throw new Error('Falta --model.');
  let timeoutMinutes: number | undefined;
  if (timeout !== undefined) {
    timeoutMinutes = Number(timeout);
    if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) throw new Error(`--timeout inválido: "${timeout}".`);
  }
  return {
    model,
    stories: stories
      ? stories
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    timeoutMinutes,
    arm,
    keep,
    out: path.resolve(out ?? path.join(ROOT, 'evals', 'scoreboard')),
  };
}

function git(args: string[]): string {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : '';
}

function fazAiInfo(): { version: string; commit: string; dirty: boolean } {
  const version = (JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
  return { version, commit: git(['rev-parse', '--short', 'HEAD']) || 'desconhecido', dirty: git(['status', '--porcelain']) !== '' };
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    process.stdout.write(HELP);
    return 0;
  }
  let opts: Options;
  try {
    opts = parseArgs(args);
  } catch (err) {
    process.stderr.write(`eval: ${(err as Error).message}\n\n${HELP}`);
    return 1;
  }
  // antes de qualquer git ou board: sem isso, os hooks de duas execuções aninhadas travam o git da história
  if (dropOuterRunGitConfig(process.env)) {
    process.stdout.write('Rodando dentro de uma execução de card: os hooks de trailers dela ficam de fora do eval.\n');
  }
  const config = parseModel(opts.model);
  let stories;
  try {
    stories = loadStories(path.join(ROOT, 'evals', 'stories'), opts.stories);
  } catch (err) {
    if (!(err instanceof UnknownStoryError)) throw err;
    process.stderr.write(`eval: ${err.message}\n`);
    return 2;
  }
  if (stories.length === 0) throw new Error('Nenhuma história de referência em evals/stories.');

  // o braço é validado antes de abrir qualquer board: falha aqui não gasta tokens
  let harness: { hash: string; notMeasured: string[] } | null = null;
  if (opts.arm) {
    try {
      const manifest = readManifest(armDir(opts.arm));
      harness = { hash: fixtureHash(armDir(opts.arm)), notMeasured: manifest.notMeasured };
      checkUvx();
    } catch (err) {
      process.stderr.write(`eval: ${(err as Error).message}\n`);
      return 1;
    }
  }

  let interrupted = false;
  let current: { stop(): void } | null = null;
  process.on('SIGINT', () => {
    interrupted = true;
    current?.stop();
  });

  const scores: StoryScore[] = [];
  for (const story of stories) {
    if (interrupted) break;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-eval-'));
    process.stdout.write(`\n== ${story.id}: ${story.title}\n`);
    try {
      prepareProject(story, path.join(root, 'project'));
      const board = await openHostBoard(root, config, (line) => process.stdout.write(`   ${line}\n`));
      current = board.autopilot;
      const { router } = board;
      if (opts.arm) {
        const info = loadArm(router, opts.arm);
        process.stdout.write(`   Harness do braço ${info.arm} carregado (${info.items} itens, hash ${info.hash.slice(0, 12)})\n`);
      }
      const periodStart = Date.now();
      let closed = false;
      try {
        const run = await runStory(board, story, config, { timeoutMs: (opts.timeoutMinutes ?? story.timeoutMinutes) * 60_000 });
        if (interrupted) {
          closed = true;
          await board.close({ start: periodStart, end: Date.now() });
          break;
        }
        const acceptance: AcceptanceResult | null = run.end === 'delivered' ? await runAcceptance(story, board.projectDir) : null;
        // os documentos da fase moram no card da história: confere pelo nome, antes de fechar o board
        const have = new Set(
          router
            .snapshot()
            .attachments.filter((a) => a.artifact)
            .map((a) => a.filename),
        );
        const missingArtifacts = run.end === 'delivered' ? story.requiredArtifacts.filter((f) => !have.has(f)) : [];
        closed = true;
        const log = await board.close({ start: periodStart, end: Date.now() });
        const score = scoreStory(story, run, log, acceptance, config, missingArtifacts);
        scores.push(score);
        process.stdout.write(
          `${story.id}: ${score.accepted ? 'aceita' : 'não aceita'} (${score.end}${score.missingArtifacts.length > 0 ? `; faltam os anexos ${score.missingArtifacts.join(', ')}` : ''}) em ${Math.round(score.durationMs / 1000)} s, ${score.runs} execução(ões)\n`,
        );
      } finally {
        if (!closed) await board.close({ start: periodStart, end: Date.now() }).catch(() => undefined);
        current = null;
      }
    } finally {
      if (opts.keep) process.stdout.write(`   pasta mantida: ${root}\n`);
      else fs.rmSync(root, { recursive: true, force: true });
    }
  }

  if (interrupted) {
    process.stderr.write('eval: interrompido; nenhum placar foi gravado.\n');
    return 1;
  }
  const date = new Date();
  const file = writeScoreboard(
    opts.out,
    {
      version: 1,
      date: date.toISOString(),
      fazAi: fazAiInfo(),
      config,
      arm: opts.arm,
      harness,
      summary: summarize(scores),
      stories: scores,
    },
    date,
  );
  process.stdout.write(`\nPlacar gravado em ${file}\n`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`eval: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
