export const VERDICTS = ['APROVADO', 'REPROVADO', 'NÃO COMPROVADO'] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface Finding {
  id: string;
  severity: 'bloqueia' | 'sugestao';
  where: string;
  text: string;
  status?: 'RESOLVIDO' | 'NÃO RESOLVIDO';
}

export interface ParsedVerdict {
  verdict: Verdict;
  findings: Finding[];
  unchecked: string[];
}

export type VerdictRead = { kind: 'valid'; value: ParsedVerdict } | { kind: 'invalid'; problem: string };

const bad = (problem: string): VerdictRead => ({ kind: 'invalid', problem });

const VERDICT_LINE = /^VEREDITO:\s*(.+?)\s*$/i;
const FINDING_LINE =
  /^[-*]\s+([A-Za-z]\d+)\s+\[(bloqueia|sugest[aã]o)\]\s+(\S+?)(?=:\s):\s*(.*?)(?:\s*\[(RESOLVIDO|N[AÃ]O RESOLVIDO)\])?\s*$/i;
const UNCHECKED_HEAD = /^N[aã]o checado:\s*(.*)$/i;

const stripAccents = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function readVerdict(raw: string): Verdict | null {
  const key = stripAccents(raw).toUpperCase().replace(/\s+/g, ' ');
  return VERDICTS.find((v) => stripAccents(v) === key) ?? null;
}

/**
 * Lê o comment de fechamento da sub-tarefa de revisão. Falha fechada: qualquer inconsistência é `invalid`,
 * com a linha que falta ou sobra dita em português. `previous` são os achados da rodada anterior (vazio na 1).
 */
export function parseVerdict(comment: string, previous: readonly Finding[]): VerdictRead {
  const lines: string[] = comment.split(/\r?\n/).map((l) => l.trim());
  let last = lines.length - 1;
  while (last >= 0 && (lines[last] ?? '') === '') last--;
  if (last < 0) return bad('O comment está vazio: falta a última linha "VEREDITO: APROVADO|REPROVADO|NÃO COMPROVADO".');
  const m = VERDICT_LINE.exec(lines[last] ?? '');
  if (!m)
    return bad('Falta a última linha "VEREDITO: APROVADO|REPROVADO|NÃO COMPROVADO" (ela precisa ser a última linha não vazia do comment).');
  const raw = m[1] ?? '';
  const verdict = readVerdict(raw);
  if (!verdict) return bad(`Veredito "${raw}" desconhecido: use APROVADO, REPROVADO ou NÃO COMPROVADO.`);

  const findings: Finding[] = [];
  const unchecked: string[] = [];
  let uncheckedSeen = false;
  let inUnchecked = false;
  for (const line of lines.slice(0, last)) {
    if (line === '') continue;
    const head = UNCHECKED_HEAD.exec(line);
    if (head) {
      if (uncheckedSeen) return bad('O bloco "Não checado:" aparece mais de uma vez.');
      uncheckedSeen = true;
      inUnchecked = true;
      const rest = (head[1] ?? '').trim();
      if (rest) unchecked.push(rest);
      continue;
    }
    const f = FINDING_LINE.exec(line);
    if (f) {
      inUnchecked = false;
      const [, fid = '', fsev = '', fwhere = '', ftext = '', fstatus = ''] = f;
      const id = fid.toUpperCase();
      if (findings.some((x) => x.id === id)) return bad(`O achado ${id} aparece mais de uma vez.`);
      const status = fstatus ? (stripAccents(fstatus).toUpperCase() === 'RESOLVIDO' ? 'RESOLVIDO' : 'NÃO RESOLVIDO') : undefined;
      findings.push({
        id,
        severity: stripAccents(fsev).toLowerCase() === 'bloqueia' ? 'bloqueia' : 'sugestao',
        where: fwhere,
        text: ftext,
        ...(status ? { status } : {}),
      });
      continue;
    }
    if (inUnchecked && /^[-*]\s+/.test(line)) unchecked.push(line.replace(/^[-*]\s+/, ''));
    else inUnchecked = false;
  }
  if (!uncheckedSeen) return bad('Falta o bloco "Não checado:" (itens, ou "Não checado: nada").');
  const noneDeclared = unchecked.length === 0 || (unchecked.length === 1 && /^nada\.?$/i.test(unchecked[0] ?? ''));
  const items = noneDeclared ? [] : unchecked;
  if (unchecked.length === 0) return bad('O bloco "Não checado:" está vazio: liste os itens ou escreva "Não checado: nada".');

  if (previous.length > 0) {
    for (const p of previous) {
      const now = findings.find((f) => f.id === p.id);
      if (!now) return bad(`Falta o achado anterior ${p.id}: toda rodada 2+ repete cada id anterior com [RESOLVIDO] ou [NÃO RESOLVIDO].`);
      if (!now.status) return bad(`O achado anterior ${p.id} precisa terminar com [RESOLVIDO] ou [NÃO RESOLVIDO].`);
    }
  }
  const unresolved = findings.filter((f) => f.status === 'NÃO RESOLVIDO');
  const openBlockers = findings.filter((f) => f.severity === 'bloqueia' && f.status !== 'RESOLVIDO');

  if (verdict === 'APROVADO') {
    if (items.length > 0) return bad('APROVADO exige "Não checado: nada"; há itens não checados (use NÃO COMPROVADO).');
    if (openBlockers.length > 0) return bad(`APROVADO não admite achado "bloqueia" aberto (${openBlockers[0]?.id}).`);
    if (unresolved.length > 0) return bad(`APROVADO não admite achado NÃO RESOLVIDO (${unresolved[0]?.id}).`);
  } else if (verdict === 'NÃO COMPROVADO') {
    if (items.length === 0) return bad('NÃO COMPROVADO exige 1 ou mais itens em "Não checado:".');
  } else if (openBlockers.length === 0 && unresolved.length === 0) {
    return bad('REPROVADO exige 1 ou mais achados "bloqueia" novos ou algum achado NÃO RESOLVIDO.');
  }
  return { kind: 'valid', value: { verdict, findings, unchecked: items } };
}
