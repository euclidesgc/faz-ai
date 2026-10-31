import { describe, expect, it } from 'vitest';
import { parseVerdict, type Finding } from '../src/shared/reviewVerdict';

const prev: Finding[] = [{ id: 'A1', severity: 'bloqueia', where: 'a.ts:1', text: 'x' }];
const ok = (c: string, p: Finding[] = []) => {
  const r = parseVerdict(c, p);
  if (r.kind !== 'valid') throw new Error(r.problem);
  return r.value;
};
const problem = (c: string, p: Finding[] = []) => {
  const r = parseVerdict(c, p);
  return r.kind === 'invalid' ? r.problem : '';
};

describe('parseVerdict', () => {
  it('APROVADO sem achados e sem não checado', () => {
    expect(ok('Tudo certo.\nNão checado: nada\n\nVEREDITO: APROVADO\n')).toEqual({ verdict: 'APROVADO', findings: [], unchecked: [] });
  });
  it('REPROVADO com bloqueia novo', () => {
    const v = ok('- A1 [bloqueia] src/a.ts:10: falta validar\n- A2 [sugestao] b.ts:2: nome\nNão checado: nada\nVEREDITO: REPROVADO');
    expect(v.findings.map((f) => [f.id, f.severity, f.where])).toEqual([
      ['A1', 'bloqueia', 'src/a.ts:10'],
      ['A2', 'sugestao', 'b.ts:2'],
    ]);
  });
  it('NÃO COMPROVADO com itens, também sem acento', () => {
    expect(ok('Não checado:\n- rodar a suíte\n- ver a tela\nVEREDITO: NAO COMPROVADO').unchecked).toEqual(['rodar a suíte', 'ver a tela']);
    expect(ok('Não checado: a suíte\nVEREDITO: NÃO COMPROVADO').verdict).toBe('NÃO COMPROVADO');
  });
  it('rodada 2: ids anteriores com status', () => {
    const v = ok('- A1 [bloqueia] a.ts:1: x [RESOLVIDO]\nNão checado: nada\nVEREDITO: APROVADO', prev);
    expect(v.findings[0]!.status).toBe('RESOLVIDO');
    expect(ok('- A1 [bloqueia] a.ts:1: x [NÃO RESOLVIDO]\nNão checado: nada\nVEREDITO: REPROVADO', prev).verdict).toBe('REPROVADO');
  });

  it.each([
    ['', 'vazio'],
    ['Não checado: nada', 'VEREDITO'],
    ['Não checado: nada\nVEREDITO: TALVEZ', 'desconhecido'],
    ['Não checado: nada\nVEREDITO: APROVADO\nobrigado', 'VEREDITO'],
    ['VEREDITO: APROVADO', 'Não checado'],
    ['Não checado:\nVEREDITO: APROVADO', 'vazio'],
    ['Não checado: x\nVEREDITO: APROVADO', 'exige "Não checado: nada"'],
    ['- A1 [bloqueia] a.ts:1: x\nNão checado: nada\nVEREDITO: APROVADO', 'bloqueia'],
    ['Não checado: nada\nVEREDITO: NÃO COMPROVADO', '1 ou mais itens'],
    ['- A1 [sugestao] a.ts:1: x\nNão checado: nada\nVEREDITO: REPROVADO', 'REPROVADO exige'],
    ['- A1 [bloqueia] a.ts:1: x\n- A1 [bloqueia] a.ts:2: y\nNão checado: nada\nVEREDITO: REPROVADO', 'mais de uma vez'],
  ])('recusa %j', (c, frag) => {
    expect(problem(c)).toContain(frag);
  });

  it('rodada 2+: id anterior ausente ou sem status', () => {
    expect(problem('Não checado: nada\nVEREDITO: APROVADO', prev)).toContain('A1');
    expect(problem('- A1 [bloqueia] a.ts:1: x\nNão checado: nada\nVEREDITO: REPROVADO', prev)).toContain('RESOLVIDO');
  });
  it('APROVADO com NÃO RESOLVIDO de sugestão é recusado', () => {
    const p: Finding[] = [{ id: 'A1', severity: 'sugestao', where: 'a:1', text: 'x' }];
    expect(problem('- A1 [sugestao] a:1: x [NÃO RESOLVIDO]\nNão checado: nada\nVEREDITO: APROVADO', p)).toContain('NÃO RESOLVIDO');
  });
});
