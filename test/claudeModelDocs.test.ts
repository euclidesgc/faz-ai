import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CLAUDE_MODELS_DOC, olderThan, parseClaudeModelDocs } from '../src/shared/claudeModelDocs';
import { claudeDocsModels } from '../src/extension/ai/drivers/claude/cli';

/** Um trecho da página de modelos do Claude Code em Markdown, como estava em 2026-10-25. */
const DOC = fs.readFileSync(path.join(__dirname, 'fixtures', 'claude-model-config.md'), 'utf8');

describe('modelos do Claude Code pela documentação', () => {
  it('cada apelido ganha o nome do modelo, os esforços, o padrão e a versão mínima da CLI', () => {
    expect(
      parseClaudeModelDocs(DOC, 7).map(({ model, label, efforts, defaultEffort, requires }) => ({
        model,
        label,
        efforts,
        defaultEffort,
        requires,
      })),
    ).toEqual([
      {
        model: 'fable',
        label: 'Fable 5.1',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'high',
        requires: '2.1.257',
      },
      {
        model: 'opus',
        label: 'Opus 5.5',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
        requires: '2.1.280',
      },
      {
        model: 'sonnet',
        label: 'Sonnet 5.5',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
        requires: '2.1.284',
      },
      {
        model: 'haiku',
        label: 'Haiku 5.5',
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'medium',
        requires: '2.1.293',
      },
    ]);
    // entram no catálogo como lista lida (não a embutida), com a data da leitura
    expect(parseClaudeModelDocs(DOC, 7)[3]).toMatchObject({ id: 'claude:haiku', tool: 'claude', fromTool: true, readAt: 7 });
  });

  it('a linha da API da Anthropic vale, não a dos outros provedores; um modelo fora da tabela de esforço fica sem ajuste', () => {
    const doc = DOC.replace(
      '| Anthropic API | Opus 5.5 | Sonnet 5.5 | Haiku 5.5 |',
      '| Anthropic API | Opus 5.5 | Sonnet 5.5 | Haiku 4.5 |',
    );
    expect(parseClaudeModelDocs(doc).find((o) => o.model === 'haiku')).toMatchObject({
      label: 'Haiku 4.5',
      efforts: [],
      defaultEffort: null,
    });
  });

  it('a página de outra forma não vira catálogo: vale a lista embutida', () => {
    expect(parseClaudeModelDocs('# Página nova\nNada de tabela aqui.')).toEqual([]);
  });

  it('a página é baixada com limite de tempo; sem rede ou com erro, a lista sai vazia', async () => {
    const ok = vi.fn(async () => new Response(DOC, { status: 200 }));
    expect((await claudeDocsModels(ok as never)).map((o) => o.label)).toEqual(['Fable 5.1', 'Opus 5.5', 'Sonnet 5.5', 'Haiku 5.5']);
    expect(ok).toHaveBeenCalledWith(CLAUDE_MODELS_DOC, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(await claudeDocsModels((async () => new Response('', { status: 503 })) as never)).toEqual([]);
    expect(
      await claudeDocsModels((async () => {
        throw new Error('sem rede');
      }) as never),
    ).toEqual([]);
  });

  it('compara a versão instalada (como o --version a escreve) com a mínima', () => {
    expect(olderThan('2.1.280 (Claude Code)', '2.1.293')).toBe(true);
    expect(olderThan('2.1.310 (Claude Code)', '2.1.293')).toBe(false);
    expect(olderThan('2.1.293', '2.1.293')).toBe(false);
    expect(olderThan(null, '2.1.293')).toBeNull();
  });
});
