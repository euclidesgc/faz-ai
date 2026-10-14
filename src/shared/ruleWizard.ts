// Lógica pura do assistente "Criar regra com ajuda": o texto da regra e as convenções que o perfil do projeto
// sugere. A tela só mostra e deixa a pessoa marcar; nada daqui grava.
import type { AiTool } from './harness';
import type { ProjectProfile } from './projectProfile';

/** Os passos do assistente, na ordem; o nome em português é a chave da tradução. */
export const RULE_WIZARD_STEPS = ['Onde vale', 'O que garante', 'Convenções do projeto', 'Conflito com o board', 'Rascunho e resumo'];

/** Ideias de regra para quem não sabe por onde começar; clicar preenche a resposta do passo 2. */
export const RULE_IDEAS: { label: string; text: string }[] = [
  { label: 'Commits', text: 'Mensagens de commit em português, no imperativo, sem ponto final.' },
  { label: 'Testes', text: 'Todo código novo vem com teste; rode os testes antes de dizer que terminou.' },
  { label: 'Comentários', text: 'Comentários explicam o porquê, nunca repetem o que o código já diz.' },
  { label: 'Escopo', text: 'Altere só o que a tarefa pede; mudanças fora dela viram uma observação, não uma edição.' },
];

/** Um item de convenção que o perfil do projeto sugere para entrar na regra. */
export interface ConventionItem {
  id: string;
  /** o que o item é, para a lista: um molde em português, que a tela traduz e preenche com `params` */
  label: string;
  params: Record<string, string>;
  /** a linha que entra na regra se o item for marcado */
  text: string;
}

const SCRIPT_TEXT: Record<string, (cmd: string) => string> = {
  test: (c) => `Rode os testes com \`${c}\` antes de dizer que terminou.`,
  lint: (c) => `Rode o lint com \`${c}\` e corrija o que ele apontar.`,
  format: (c) => `Formate o código com \`${c}\`.`,
  typecheck: (c) => `Confira os tipos com \`${c}\`.`,
  build: (c) => `Confira que o projeto compila com \`${c}\`.`,
};

const TOOL_TEXT: Record<string, string> = {
  eslint: 'O código segue as regras do ESLint do projeto.',
  prettier: 'O formato do código é o do Prettier do projeto; não reformate por conta própria.',
  biome: 'O formato e o lint do código são os do Biome do projeto.',
  vitest: 'Os testes usam Vitest e ficam ao lado do que testam ou na pasta de testes.',
  jest: 'Os testes usam Jest e ficam ao lado do que testam ou na pasta de testes.',
  pytest: 'Os testes usam pytest.',
  ruff: 'O lint e o formato de Python seguem o Ruff do projeto.',
  playwright: 'Os testes de interface usam Playwright.',
};

/** Os itens de convenção que o perfil sugere: linguagens, comandos do package, ferramentas de qualidade e pastas. */
export function conventionItems(profile: ProjectProfile): ConventionItem[] {
  const items: ConventionItem[] = [];
  if (profile.languages.length)
    items.push({
      id: 'languages',
      label: 'Linguagens: {list}',
      params: { list: profile.languages.join(', ') },
      text: `As linguagens do projeto são ${profile.languages.join(', ')}; não introduza outras sem pedir.`,
    });
  for (const [name, text] of Object.entries(SCRIPT_TEXT)) {
    const cmd = profile.scripts[name];
    if (cmd) items.push({ id: `script:${name}`, label: 'Comando {name}: {cmd}', params: { name, cmd }, text: text(`npm run ${name}`) });
  }
  for (const tool of profile.tools) {
    const text = TOOL_TEXT[tool];
    if (text) items.push({ id: `tool:${tool}`, label: 'Ferramenta: {name}', params: { name: tool }, text });
  }
  if (profile.folders.length)
    items.push({
      id: 'folders',
      label: 'Pastas principais: {list}',
      params: { list: profile.folders.slice(0, 8).join(', ') },
      text: `As pastas principais são ${profile.folders
        .slice(0, 8)
        .map((f) => `\`${f}/\``)
        .join(', ')}; coloque código novo no lugar que já existe para ele.`,
    });
  return items;
}

/** Sugestões de caminho para uma regra por assunto, a partir das pastas e das ferramentas do projeto. */
export function pathSuggestions(profile: ProjectProfile): { label: string; params: Record<string, string>; glob: string }[] {
  const out = [{ label: 'Arquivos de teste', params: {}, glob: '**/*.test.*' }];
  for (const f of profile.folders.slice(0, 4)) out.push({ label: 'Pasta {name}', params: { name: f }, glob: `${f}/**` });
  return out;
}

/** Onde a regra mora e como ela se aplica. */
export interface RuleScope {
  /** a regra principal (todo o projeto) ou uma regra por assunto, com caminhos opcionais */
  kind: 'main' | 'topic';
  /** só em regra por assunto: os caminhos em que ela vale (vazio = sempre) */
  paths: string[];
}

const sentence = (text: string): string => text.replace(/\s+/g, ' ').trim();

/**
 * O texto da regra. A principal vira uma seção que se acrescenta ao arquivo; a por assunto é um arquivo novo, com
 * o frontmatter de cada ferramenta: `paths:` no Claude Code, `globs:` e `alwaysApply: false` no Cursor (as duas
 * formas, conforme a documentação de cada uma lida em 2026-10-14).
 */
export function draftRule(tool: AiTool, scope: RuleScope, what: string, conventions: ConventionItem[]): string {
  const body = [
    ...what
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => (scope.kind === 'main' || /^[-*#]/.test(l) ? l : `- ${l}`)),
    ...(conventions.length ? ['', '## Convenções do projeto', ...conventions.map((c) => `- ${c.text}`)] : []),
  ];
  if (scope.kind === 'main') return ['## Regras do projeto', '', ...body].join('\n') + '\n';
  // a descrição do arquivo é a primeira linha da regra: é o que a ferramenta mostra e usa para decidir quando ela vale
  const description = sentence(what.split(/\r?\n/).find((l) => l.trim()) ?? '').slice(0, 140);
  const front =
    tool === 'cursor'
      ? [
          '---',
          `description: ${JSON.stringify(description)}`,
          ...(scope.paths.length ? [`globs: ${scope.paths.join(', ')}`] : []),
          'alwaysApply: false',
          '---',
        ]
      : [
          '---',
          `description: ${JSON.stringify(description)}`,
          ...(scope.paths.length ? ['paths:', ...scope.paths.map((p) => `  - ${JSON.stringify(p)}`)] : []),
          '---',
        ];
  return [...front, '', ...body].join('\n') + '\n';
}
