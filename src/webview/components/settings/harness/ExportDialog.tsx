import { useEffect, useMemo, useState } from 'react';
import { Badge, Callout, Checkbox, Dialog, RadioGroup, SegmentedControl, Text, TextField } from '@radix-ui/themes';
import { AI_BASES } from '../../../../shared/harness';
import {
  defaultSelection,
  itemOutcome,
  type ExportItem,
  type ExportKind,
  type ExportOutcome,
  type ExportPlan,
  type ExportTarget,
} from '../../../../shared/toolExport';
import { useBoardStore } from '../../../store/boardStore';
import { ActionButton, IconInfo, IconWarning } from '../../ui';
import { exportError, lossText, refuseText } from './exportTexts';
import { useToolExport } from './useToolExport';
import { t } from '../../../i18n';

const GROUPS: { kind: ExportKind; label: string }[] = [
  { kind: 'rule', label: 'Regras' },
  { kind: 'skill', label: 'Skills' },
  { kind: 'agent', label: 'Agentes' },
];

const OUTCOMES: { outcome: ExportOutcome; label: (n: number) => string }[] = [
  { outcome: 'written', label: (n) => t('{n} gravados', { n }) },
  { outcome: 'replaced', label: (n) => t('{n} substituídos', { n }) },
  { outcome: 'skipped', label: (n) => t('{n} pulados', { n }) },
  { outcome: 'refused', label: (n) => t('{n} recusados', { n }) },
  { outcome: 'failed', label: (n) => t('{n} com falha', { n }) },
];

/** Caminho relativo à pasta da ferramenta no destino; o absoluto fica no `title`. */
function relative(plan: ExportPlan, abs: string): string {
  const root = plan.roots[plan.target];
  return root && abs.startsWith(root) ? abs.slice(root.length).replace(/^[\\/]/, '') : abs;
}

function statusOf(item: ExportItem, replace: boolean): { text: string; color: 'gray' | 'amber' | 'red' | 'green' } {
  const refused = item.blocked ?? item.files.find((f) => f.refused)?.refused;
  if (refused) return { text: t('recusado: {reason}', { reason: refuseText(refused) }), color: 'red' };
  const outcome = itemOutcome(item, replace);
  if (outcome === 'replace') return { text: t('já existe · será substituído'), color: 'amber' };
  if (outcome === 'skip') return { text: t('já existe · será pulado'), color: 'amber' };
  return { text: t('novo'), color: 'green' };
}

/**
 * "Exportar para a ferramenta": passo 1 escolhe a ferramenta e o destino, passo 2 mostra a prévia (o que será gravado,
 * o que se perde no formato), passo 3 o resumo por situação. O resultado é uma cópia desconectada do board.
 */
export function ExportDialog({ onClose }: { onClose: () => void }) {
  const boardTool = useBoardStore((s) => s.state!.board.aiTool);
  const [tool, setTool] = useState(AI_BASES.some((b) => b.id === boardTool) ? boardTool : AI_BASES[0]!.id);
  const [target, setTarget] = useState<ExportTarget>('project');
  const [query, setQuery] = useState('');
  const [replace, setReplace] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const { plan, loading, error, result, applying, apply } = useToolExport(tool, target);

  // sem pasta de projeto, o diálogo abre em "Pasta do usuário" (e lembra, porque a prévia seguinte é a do destino novo)
  const [noProject, setNoProject] = useState(false);
  useEffect(() => {
    if (plan && plan.roots.project === null) {
      setNoProject(true);
      setTarget('user');
    }
  }, [plan]);

  // uma prévia nova refaz a seleção
  useEffect(() => {
    if (plan) setChosen(defaultSelection(plan.items));
  }, [plan]);

  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (plan?.items ?? []).filter((i) => !needle || `${i.name} ${i.description}`.toLowerCase().includes(needle)),
    [plan, needle],
  );
  const picked = (plan?.items ?? []).filter((i) => chosen.has(i.id) && !i.blocked);
  const flowChosen = picked.some((i) => i.flowSkill);
  const toggle = (id: string, on: boolean) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const counts = OUTCOMES.map((o) => ({ ...o, n: result?.files.filter((f) => f.outcome === o.outcome).length ?? 0 })).filter(
    (o) => o.n > 0,
  );
  const toolLabel = AI_BASES.find((b) => b.id === tool)?.label ?? tool;
  const rootOf = (x: ExportTarget) => plan?.roots[x] ?? null;

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !applying && onClose()}>
      <Dialog.Content maxWidth="760px" className="scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <Dialog.Title>{t('Exportar para a ferramenta')}</Dialog.Title>
        <Dialog.Description>{t('Copia regras, skills e agentes do board no formato de {tool}.', { tool: toolLabel })}</Dialog.Description>

        {!result && (
          <>
            <section aria-label={t('Ferramenta e destino')}>
              <SegmentedControl.Root value={tool} onValueChange={(v) => setTool(v)} aria-label={t('Ferramenta')}>
                {AI_BASES.map((b) => (
                  <SegmentedControl.Item key={b.id} value={b.id}>
                    {b.label}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl.Root>
              <RadioGroup.Root value={target} onValueChange={(v) => setTarget(v as ExportTarget)} aria-label={t('Destino')}>
                <RadioGroup.Item value="project" disabled={noProject} title={rootOf('project') ?? undefined}>
                  {t('Pasta do projeto')} {rootOf('project') && <span className="muted small">{rootOf('project')}</span>}
                </RadioGroup.Item>
                <RadioGroup.Item value="user" title={rootOf('user') ?? undefined}>
                  {t('Pasta do usuário')} {rootOf('user') && <span className="muted small">{rootOf('user')}</span>}
                </RadioGroup.Item>
              </RadioGroup.Root>
              {noProject && (
                <Text as="p" size="1" className="muted">
                  {t('Abra uma pasta de projeto para exportar para ela.')}
                </Text>
              )}
            </section>

            <Callout.Root color="gray" size="1">
              <Callout.Icon>
                <IconInfo />
              </Callout.Icon>
              <Callout.Text>
                {t(
                  'O resultado é uma cópia desconectada: o board não atualiza, não acompanha e não apaga o que for exportado. Uma mudança no board só chega à ferramenta exportando de novo.',
                )}
              </Callout.Text>
            </Callout.Root>
            {plan && plan.mcpCount > 0 && (
              <Callout.Root color="gray" size="1">
                <Callout.Icon>
                  <IconInfo />
                </Callout.Icon>
                <Callout.Text>
                  {t(
                    'Os {n} servidores MCP do board não são exportados: o "Conectar ao board" registra o do board, e os outros você configura na ferramenta.',
                    { n: plan.mcpCount },
                  )}
                </Callout.Text>
              </Callout.Root>
            )}

            {loading && <p className="muted">{t('Carregando a prévia…')}</p>}
            {error && (
              <Text as="p" color="red" size="2" role="alert">
                {exportError(error)}
              </Text>
            )}

            {plan && (
              <section aria-label={t('Prévia')}>
                <div className="row">
                  <TextField.Root
                    type="search"
                    aria-label={t('Buscar por nome ou descrição')}
                    placeholder={t('Buscar por nome ou descrição…')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <Text as="label" size="2">
                    <Checkbox checked={replace} onCheckedChange={(on) => setReplace(on === true)} /> {t('Substituir os que já existem')}
                  </Text>
                </div>
                {plan.items.length === 0 && <p>{t('Nenhum artefato para exportar')}</p>}
                {GROUPS.map(({ kind, label }) => {
                  const all = plan.items.filter((i) => i.kind === kind);
                  const group = visible.filter((i) => i.kind === kind);
                  if (!all.length) return null;
                  return (
                    <fieldset key={kind} className="import-group">
                      <legend>
                        {t(label)} ({all.filter((i) => chosen.has(i.id)).length}/{all.length})
                      </legend>
                      <ul className="plain-list">
                        {group.map((item) => {
                          const status = statusOf(item, replace);
                          const first = item.files[0];
                          const extra = item.files.length > 1 ? ` (+${item.files.length - 1})` : '';
                          return (
                            <li key={item.id} className={item.blocked ? 'off' : ''}>
                              {!item.blocked && (
                                <Checkbox
                                  aria-label={t('Exportar {name}', { name: item.name })}
                                  checked={chosen.has(item.id)}
                                  onCheckedChange={(on) => toggle(item.id, on === true)}
                                />
                              )}{' '}
                              <b>{item.name}</b>{' '}
                              <Badge color={status.color} variant="outline">
                                {status.text}
                              </Badge>
                              {first && (
                                <span className="muted small" title={first.path}>
                                  {' '}
                                  {relative(plan, first.path)}
                                  {extra}
                                </span>
                              )}
                              {item.flowSkill && (
                                <p className="muted small">
                                  {t('A sessão conectada ao board já recebe o fluxo pelo MCP; a cópia fica parada na versão de hoje.')}
                                </p>
                              )}
                              {item.extras.length > 0 && (
                                <p className="muted small">
                                  {t('A pasta no destino tem {n} arquivo(s) que o board não tem ({names}): eles ficam.', {
                                    n: item.extras.length,
                                    names: item.extras.join(', '),
                                  })}
                                </p>
                              )}
                              {item.losses.map((loss, idx) => (
                                <p key={idx} className="muted small">
                                  {lossText(loss)}
                                </p>
                              ))}
                            </li>
                          );
                        })}
                      </ul>
                    </fieldset>
                  );
                })}
                {flowChosen && (
                  <Callout.Root color="amber" size="1" role="alert">
                    <Callout.Icon>
                      <IconWarning />
                    </Callout.Icon>
                    <Callout.Text>
                      {t(
                        'A skill do fluxo vai como uma cópia parada: a sessão conectada ao board recebe o fluxo atualizado pelo MCP, e esta cópia não acompanha.',
                      )}
                    </Callout.Text>
                  </Callout.Root>
                )}
              </section>
            )}
          </>
        )}

        {result && (
          <section aria-label={t('Resumo')}>
            <p>{counts.length ? counts.map((o) => o.label(o.n)).join(' · ') : t('Nada foi gravado.')}</p>
            <ul className="plain-list">
              {result.files.map((f) => (
                <li key={f.path} title={f.path}>
                  <Badge
                    color={f.outcome === 'failed' || f.outcome === 'refused' ? 'red' : f.outcome === 'skipped' ? 'amber' : 'green'}
                    variant="outline"
                  >
                    {OUTCOMES.find((o) => o.outcome === f.outcome)
                      ?.label(1)
                      .replace(/^1 /, '')}
                  </Badge>{' '}
                  <span className="small">{plan ? relative(plan, f.path) : f.path}</span>
                  {(f.reason || f.error) && <span className="muted small"> · {f.reason ? refuseText(f.reason) : f.error}</span>}
                </li>
              ))}
            </ul>
            <Callout.Root color="gray" size="1">
              <Callout.Icon>
                <IconInfo />
              </Callout.Icon>
              <Callout.Text>
                {t('O resultado é uma cópia desconectada: o board não atualiza, não acompanha e não apaga o que foi exportado.')}
              </Callout.Text>
            </Callout.Root>
          </section>
        )}

        <div className="form-actions">
          {result ? (
            <ActionButton hint={t('Fecha o resumo.')} onClick={onClose}>
              {t('Fechar')}
            </ActionButton>
          ) : (
            <>
              <ActionButton variant="soft" color="gray" disabled={applying} hint={t('Fecha sem exportar nada.')} onClick={onClose}>
                {t('Cancelar')}
              </ActionButton>
              <ActionButton
                disabled={picked.length === 0 || !plan}
                disabledReason={t('Marque pelo menos um artefato.')}
                loading={applying}
                hint={t('Grava os artefatos marcados na pasta da ferramenta.')}
                onClick={() =>
                  void apply(
                    picked.map((i) => i.id),
                    replace,
                  )
                }
              >
                {t('Exportar {n}', { n: picked.length })}
              </ActionButton>
            </>
          )}
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
