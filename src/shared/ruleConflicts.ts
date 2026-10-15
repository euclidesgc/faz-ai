// Termos que costumam entrar em conflito com o fluxo do board (fases, aprovação, uso do MCP). O assistente de
// regras confere o texto contra esta lista antes de gravar: a regra nasce desligada e a pessoa decide, mas
// sabe de antemão onde o texto manda a IA contra o que o board espera dela.

export interface RuleConflict {
  /** a linha do texto onde o termo apareceu */
  excerpt: string;
  /** o que o board espera, e por que o trecho atrapalha */
  reason: string;
}

const plain = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /\b(nao|nunca|evite|don'?t|never|do not)\b.{0,24}\b(use|usar|utilize|utilizar|chame|chamar|acesse|acessar|call|use)\b.{0,24}\b(mcp|servidor mcp|ferramentas do board|board tools)\b/,
    reason: 'O board conduz a IA pelo servidor MCP: sem ele a IA não lê o card nem registra o andamento.',
  },
  {
    re: /\b(ignore|ignorar|desconsidere|desconsiderar|esqueca|esquecer)\b.{0,24}\b(o |a )?(board|kanban|faz ai|fluxo|cards?)\b/,
    reason: 'O board decide o que a IA faz em cada fase; mandar ignorá-lo desfaz o fluxo.',
  },
  {
    re: /\b(ignore|skip)\b.{0,16}\b(the )?(board|kanban|workflow)\b/,
    reason: 'O board decide o que a IA faz em cada fase; mandar ignorá-lo desfaz o fluxo.',
  },
  {
    re: /\b(nao|nunca|don'?t|never|do not)\b.{0,24}\b(peca|pedir|solicite|solicitar|request|ask for)\b.{0,24}\b(revisao|aprovacao|review|approval)\b/,
    reason: 'Nas fases com aprovação a IA entrega para revisão e para; pedir que não peça revisão quebra essa parada.',
  },
  {
    re: /\b(pule|pular|dispense|dispensar|sem|skip|bypass)\b.{0,20}\b(a |o )?(aprovacao|revisao|approval|review)\b/,
    reason: 'A aprovação da pessoa é o que libera o card para a próxima fase; pulá-la quebra o fluxo.',
  },
  {
    re: /\b(commit|commits|push|enviar?|subir|suba)\b.{0,24}\b(direto|diretamente|directly)\b.{0,16}\b(na|no|em|to|on)?\s*(main|master)\b/,
    reason: 'O board trabalha numa branch por história e entrega por pull request; commit direto na main passa por cima disso.',
  },
  {
    re: /\bcommit\w*\b.{0,12}\b(na|no) (main|master)\b/,
    reason: 'O board trabalha numa branch por história e entrega por pull request; commit direto na main passa por cima disso.',
  },
  {
    re: /\b(nao|nunca|don'?t|never|do not)\b.{0,24}\b(crie|criar|use|usar|abra|abrir|create|open)\b.{0,16}\b(branch|ramo|worktree|pull request|pr)\b/,
    reason: 'O board prepara uma branch e uma worktree para cada história; proibir a branch impede a IA de entregar pelo fluxo.',
  },
  {
    re: /\b(nao|nunca|don'?t|never|do not)\b.{0,16}\b(mova|mover|move)\b.{0,12}\b(o |os |the )?(cards?)\b/,
    reason: 'Mover o card é como a IA sinaliza o progresso no board.',
  },
  {
    re: /\b(nao|nunca|don'?t|never|do not)\b.{0,12}\b(pergunte|perguntar|faca perguntas|ask questions|ask)\b/,
    reason: 'Quando falta informação a IA pergunta pelo board (ask_question); proibir perguntas a deixa decidir no escuro.',
  },
];

/** Os motivos, para a tela traduzir. */
export const RULE_CONFLICT_REASONS: string[] = [...new Set(PATTERNS.map((p) => p.reason))];

/** Os trechos do texto que podem conflitar com o fluxo do board, uma entrada por linha suspeita. */
export function findRuleConflicts(text: string): RuleConflict[] {
  const out: RuleConflict[] = [];
  for (const line of text.split(/\r?\n/)) {
    const flat = plain(line).replace(/[`*_>#]/g, ' ');
    const hit = PATTERNS.find((p) => p.re.test(flat));
    if (hit)
      out.push({
        excerpt: line
          .trim()
          .replace(/^[-*]\s*/, '')
          .slice(0, 160),
        reason: hit.reason,
      });
  }
  return out;
}
