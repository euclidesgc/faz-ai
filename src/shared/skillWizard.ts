// Lógica pura do assistente "Criar skill com ajuda": os passos que ele propõe a partir do perfil do projeto e o
// texto do SKILL.md. A tela só mostra e deixa a pessoa ajustar; nada daqui grava.
import type { ProjectProfile } from './projectProfile';
import { words } from './skillCatalog';

const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const stripEnd = (text: string): string =>
  text
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');

/** Os passos do assistente, na ordem; o nome em português é a chave da tradução. */
export const SKILL_WIZARD_STEPS = [
  'Que tarefa ensina',
  'Quando usar',
  'Passo a passo',
  'O que nunca faz',
  'Arquivos de apoio',
  'Rascunho e resumo',
];

/** O nome da pasta da skill a partir da tarefa: as primeiras palavras que dizem algo. */
export function skillNameFromTask(task: string, count = 4): string {
  return words(task).slice(0, count).join('-').replace(/-+/g, '-').slice(0, 48).replace(/-$/, '');
}

/** A descrição do frontmatter: o que a skill ensina e quando usar; é por ela que a IA (e a pessoa, no card) escolhe a skill. */
export function skillDescription(task: string, trigger: string): string {
  const t = stripEnd(task);
  const g = stripEnd(trigger).replace(/^use (esta skill )?(quando|se|para)\s+/i, '');
  return g ? `${t}. Use quando ${g}.` : `${t}.`;
}

/** Os passos que o assistente propõe: genéricos, ajustados pelos verbos da tarefa e pelos comandos do projeto. */
export function proposeSkillSteps(task: string, profile: ProjectProfile): string[] {
  const text = plain(task);
  const steps = ['Leia o pedido e os arquivos que ele cita antes de alterar qualquer coisa.'];
  if (/\b(escrev|cri|adicion|implement|nov[ao])/.test(text))
    steps.push('Procure no projeto um exemplo do mesmo tipo e siga a estrutura, os nomes e o estilo dele.');
  if (/\b(migra|schema|banco|sql)/.test(text)) steps.push('Confira o estado atual do esquema e das migrações antes de escrever a nova.');
  if (/\b(corrig|bug|erro|falha)/.test(text)) steps.push('Reproduza o problema e escreva um teste que falha antes de corrigir.');
  steps.push('Faça a mudança no menor número de arquivos possível.');
  const s = profile.scripts;
  if (s.typecheck) steps.push(`Confira os tipos com \`npm run typecheck\`.`);
  if (s.test) steps.push(`Rode os testes com \`npm run test\` e corrija o que quebrar.`);
  if (s.lint) steps.push(`Rode o lint com \`npm run lint\`.`);
  steps.push('Termine com um resumo curto do que mudou e do que foi verificado.');
  return steps;
}

/** Limites que o assistente propõe para a skill ficar com escopo reduzido. */
export const DEFAULT_SKILL_LIMITS = [
  'Não altere arquivos fora do que a tarefa pede.',
  'Não apague nem renomeie arquivos sem pedido explícito.',
  'Não faça commit nem push; isso é do fluxo do board.',
];

export interface SkillAnswers {
  name: string;
  task: string;
  trigger: string;
  steps: string[];
  limits: string[];
  /** arquivos de apoio (`references/…`, `assets/…`, `scripts/…`), criados vazios */
  files: string[];
}

/** O SKILL.md completo, no formato das duas ferramentas (frontmatter `name` e `description`, corpo em markdown). */
export function renderSkill(a: SkillAnswers): string {
  const clean = (l: string) => l.replace(/\s+/g, ' ').trim();
  const steps = a.steps.map(clean).filter(Boolean);
  const limits = a.limits.map(clean).filter(Boolean);
  const out = [
    '---',
    `name: ${a.name}`,
    `description: ${JSON.stringify(skillDescription(a.task, a.trigger))}`,
    '---',
    '',
    `# ${a.name}`,
    '',
    `${stripEnd(a.task)}.`,
    ...(stripEnd(a.trigger) ? ['', '## Quando usar', '', `${stripEnd(a.trigger)}.`] : []),
    ...(steps.length ? ['', '## Passo a passo', '', ...steps.map((s, i) => `${i + 1}. ${s}`)] : []),
    ...(limits.length ? ['', '## O que nunca faz', '', ...limits.map((l) => `- ${l}`)] : []),
    ...(a.files.length ? ['', '## Arquivos de apoio', '', ...a.files.map((f) => `- [${f}](${f})`)] : []),
  ];
  return `${out.join('\n')}\n`;
}
