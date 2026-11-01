import type { Card } from './model';

/** Seções da descrição de uma sub-tarefa: o único lugar que as define. */
export const BRIEF_SECTIONS = {
  goal: 'Objetivo',
  done: 'Pronto quando',
  may: 'Pode tocar',
  mayNot: 'Não pode tocar',
  decisions: 'Decisões anteriores',
} as const;

/** As seções exigidas, na ordem em que aparecem na descrição. */
export const REQUIRED_BRIEF_SECTIONS: readonly string[] = [
  BRIEF_SECTIONS.goal,
  BRIEF_SECTIONS.done,
  BRIEF_SECTIONS.may,
  BRIEF_SECTIONS.mayNot,
];

const PLACEHOLDERS: Record<string, string> = {
  [BRIEF_SECTIONS.goal]: 'o que esta sub-tarefa entrega e por quê',
  [BRIEF_SECTIONS.done]: 'como verificar: teste, typecheck, comando ou tela',
  [BRIEF_SECTIONS.may]: 'arquivos que ela pode alterar',
  [BRIEF_SECTIONS.mayNot]: 'arquivos e áreas que ela não pode alterar',
  [BRIEF_SECTIONS.decisions]: 'decisões já tomadas que ela deve respeitar (opcional)',
};

/** Esqueleto com um título e um `<placeholder>` por seção. */
export function briefSkeleton(): string {
  return [...REQUIRED_BRIEF_SECTIONS, BRIEF_SECTIONS.decisions].map((name) => `### ${name}\n<${PLACEHOLDERS[name]}>`).join('\n\n');
}

function normalizeTitle(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\*\*/g, '').replace(/\s+/g, ' ').trim().replace(/:$/, '').trim();
}

interface Heading {
  line: number;
  level: number;
  title: string;
}

function headingsOf(lines: readonly string[]): Heading[] {
  const found: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((text, line) => {
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(text);
    if (open) {
      const mark = open[1]?.charAt(0) ?? '';
      if (fence === null) fence = mark;
      else if (mark === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const m = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/.exec(text);
    if (m) found.push({ line, level: (m[1] ?? '').length, title: normalizeTitle(m[2] ?? '') });
  });
  return found;
}

function hasContent(lines: readonly string[]): boolean {
  return (
    lines
      .join('\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim() !== ''
  );
}

/** Seções exigidas que faltam (ou estão sem texto) na descrição. */
export function briefGaps(description: string | null | undefined): string[] {
  const lines = (description ?? '').split(/\r?\n/);
  const headings = headingsOf(lines);
  const filled = new Set<string>();
  headings.forEach((h, i) => {
    const next = headings.slice(i + 1).find((n) => n.level <= h.level);
    const body = lines.slice(h.line + 1, next ? next.line : lines.length);
    if (hasContent(body)) filled.add(h.title);
  });
  return REQUIRED_BRIEF_SECTIONS.filter((name) => !filled.has(normalizeTitle(name)));
}

export interface BriefFailure {
  card: Card;
  missing: string[];
}

/** Sub-tarefas com seção faltando, ordenadas por número. */
export function briefFailures(cards: readonly Card[]): BriefFailure[] {
  return cards
    .map((card) => ({ card, missing: briefGaps(card.description) }))
    .filter((f) => f.missing.length > 0)
    .sort((a, b) => a.card.number - b.card.number);
}

/** Chave da sessão da história parada pela conferência; `handedBack` vem de `handedBackAt`. */
export function briefKey(story: Card, failures: readonly BriefFailure[], handedBack: number): string {
  const ids = failures.map((f) => f.card.id).sort();
  return JSON.stringify(['story', story.id, story.columnId, 'brief', ids, handedBack]);
}

export function isBriefKey(key: string): boolean {
  try {
    const parsed: unknown = JSON.parse(key);
    return Array.isArray(parsed) && parsed[0] === 'story' && parsed[3] === 'brief';
  } catch {
    return false;
  }
}

function summary(failures: readonly BriefFailure[]): string {
  return failures.map((f) => `#${f.card.number}: falta ${f.missing.join(', ')}.`).join(' ');
}

/** Motivo repassado à IA que devolve a história ao Plan. */
export function briefReason(story: Card, failures: readonly BriefFailure[]): string {
  return `A história #${story.number} tem sub-tarefas com a descrição incompleta. ${summary(failures)} Complete as seções com update_card antes de executar.`;
}

/** Motivo do bloqueio quando a conferência continua reprovando. */
export function briefBlockedReason(story: Card, failures: readonly BriefFailure[]): string {
  return `A história #${story.number} segue com a descrição de sub-tarefas incompleta. ${summary(failures)} Complete as seções (Objetivo, Pronto quando, Pode tocar, Não pode tocar) e libere o card.`;
}
