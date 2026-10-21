import { baseValue } from '../../../../shared/harness';
import { useMemo, useState } from 'react';
import { Button, Checkbox, SegmentedControl, TextArea, TextField } from '@radix-ui/themes';
import { nameFromText } from '../../../../shared/agentWizard';
import { SKILL_NAME_PATTERN, type AiTool } from '../../../../shared/harness';
import { HARNESS_CATALOG, createTargets, type CreateTarget } from '../../../../shared/harnessCatalog';
import { toItemName } from '../../../../shared/harnessProject';
import { usageOf } from '../../../../shared/harnessSelection';
import { findRuleConflicts } from '../../../../shared/ruleConflicts';
import { RULE_IDEAS, RULE_WIZARD_STEPS, conventionItems, draftRule, pathSuggestions } from '../../../../shared/ruleWizard';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Chip, FormField, IconWarning, SelectField } from '../../ui';
import { WizardQuestion, WizardShell } from './Wizard';
import { GLOBAL_WARNING } from './text';
import { useProjectProfile } from './useProjectProfile';
import { t } from '../../../i18n';

const STEPS = RULE_WIZARD_STEPS;

/** Os lugares onde uma regra pode nascer neste escopo, separados em principal e por assunto. */
function ruleTargets(tool: AiTool, scope: 'project' | 'user'): { main: CreateTarget[]; topic: CreateTarget[] } {
  const all = createTargets(tool).filter((c) => c.scope === scope && c.kind === 'instructions');
  const group = (c: CreateTarget) => (baseValue(HARNESS_CATALOG, tool) ?? [])[c.source]!.group;
  return {
    main: all.filter((c) => c.layout === 'file' && group(c) === 'main'),
    topic: all.filter((c) => c.layout === 'files' && group(c) === 'topic'),
  };
}

/**
 * "Criar regra com ajuda": cinco passos para escrever uma regra no formato da ferramenta, na principal (todo o
 * projeto) ou numa regra por assunto, com as convenções que o perfil do projeto sugere e a conferência contra o
 * que o fluxo do board espera. A regra nasce desligada no board; nada é gravado antes do último passo.
 */
export function RuleWizard({ tool, scope, onClose }: { tool: AiTool; scope: 'project' | 'user'; onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const { profile, loading } = useProjectProfile();
  const { main, topic } = ruleTargets(tool, scope);
  const items = state.harness.inventory.find((x) => x.tool === tool)?.items ?? [];
  const [step, setStep] = useState(0);
  const [kind, setKind] = useState<'main' | 'topic'>(main.length ? 'main' : 'topic');
  const [mainSource, setMainSource] = useState(main[0]?.source ?? -1);
  const [pathsText, setPathsText] = useState('');
  const [what, setWhat] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const convention = useMemo(() => conventionItems(profile), [profile]);
  const suggestedPaths = useMemo(() => pathSuggestions(profile), [profile]);
  const paths = pathsText
    .split(/[,\n]/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chosen = convention.filter((c) => picked.includes(c.id));
  const draft = draftRule(tool, { kind, paths }, what, chosen);
  const body = text ?? draft;
  const conflicts = findRuleConflicts(body);
  const draftConflicts = findRuleConflicts(draft);

  const target = kind === 'main' ? main.find((m) => m.source === mainSource) : topic[0];
  const ruleName = name ?? nameFromText(what);
  const exists = (c: CreateTarget) => items.some((i) => i.kind === 'instructions' && i.source === c.source);
  const nameOk =
    kind === 'main' || (SKILL_NAME_PATTERN.test(ruleName) && !items.some((i) => i.source === target?.source && i.name === ruleName));
  const appending = kind === 'main' && !!target && exists(target);
  const location = target ? target.label.replace('<nome>', kind === 'main' ? '' : `${ruleName}`) : '';
  const nothing = main.length === 0 && topic.length === 0;

  const finish = () => {
    if (!target) return;
    harness.writeItem(tool, target.source, kind === 'main' ? '' : ruleName, body, undefined, appending);
    // a regra entra desligada; uma que já estava no board mantém o modo que a pessoa deu
    if (!usageOf(state.harnessSelection, { kind: 'instructions', location })) {
      harness.setSelection([{ kind: 'instructions', location }], 'off');
    }
    onClose();
  };

  const label = (c: CreateTarget) => c.label.replace('<nome>', t('<nome>'));
  const disabled = step === 0 ? nothing || !target : step === 1 ? !what.trim() : step === 4 ? !nameOk || !body.trim() : false;

  return (
    <WizardShell
      label={t('Criar regra com ajuda')}
      steps={STEPS}
      step={step}
      onBack={() => setStep(step - 1)}
      onNext={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
      onCancel={onClose}
      finishLabel={appending ? t('Acrescentar ao arquivo') : t('Criar regra')}
      nextDisabled={disabled}
    >
      {step === 0 && (
        <WizardQuestion question={t('Onde a regra vale: em todo o projeto ou só num assunto?')} example={t('Só nos arquivos de teste')}>
          {nothing ? (
            <p className="muted small">{t('Este escopo não tem onde gravar regras para a ferramenta escolhida.')}</p>
          ) : (
            <>
              <SegmentedControl.Root
                size="1"
                value={kind}
                onValueChange={(v) => setKind(v as 'main' | 'topic')}
                aria-label={t('Onde a regra vale')}
              >
                {main.length > 0 && <SegmentedControl.Item value="main">{t('Principal (todo o projeto)')}</SegmentedControl.Item>}
                {topic.length > 0 && <SegmentedControl.Item value="topic">{t('Por assunto')}</SegmentedControl.Item>}
              </SegmentedControl.Root>
              {kind === 'main' ? (
                <FormField
                  label={t('Arquivo')}
                  hint={t('A regra principal entra no começo de toda conversa. Num arquivo que já existe, o texto é acrescentado no fim.')}
                >
                  {(id) => (
                    <SelectField
                      id={id}
                      aria-label={t('Arquivo')}
                      options={main.map((m) => ({
                        value: String(m.source),
                        label: exists(m) ? `${label(m)} (${t('acrescenta ao existente')})` : label(m),
                      }))}
                      value={String(mainSource)}
                      onChange={(v) => setMainSource(Number(v))}
                    />
                  )}
                </FormField>
              ) : (
                <>
                  <p className="muted small">
                    {t('Uma regra nova em {path}.', { path: topic[0] ? label(topic[0]) : '' })}{' '}
                    {tool === 'claude'
                      ? t('Com caminhos, o Claude Code só a lê quando mexe nesses arquivos (paths no topo do arquivo).')
                      : t('Com caminhos, o Cursor só a aplica a esses arquivos (globs no topo do arquivo).')}
                  </p>
                  <FormField label={t('Caminhos (opcional)')} hint={t('Separados por vírgula. Vazio = vale sempre que a regra for lida.')}>
                    {(id) => (
                      <TextField.Root
                        id={id}
                        value={pathsText}
                        onChange={(e) => setPathsText(e.target.value)}
                        placeholder="src/**/*.test.ts, test/**"
                      />
                    )}
                  </FormField>
                  <div className="chips-editor">
                    {suggestedPaths.map((s) => (
                      <Chip
                        key={s.glob}
                        on={paths.includes(s.glob)}
                        title={s.glob}
                        onClick={() =>
                          setPathsText(
                            paths.includes(s.glob) ? paths.filter((p) => p !== s.glob).join(', ') : [...paths, s.glob].join(', '),
                          )
                        }
                      >
                        {t(s.label, s.params)}
                      </Chip>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </WizardQuestion>
      )}

      {step === 1 && (
        <WizardQuestion
          question={t('O que a regra garante? Uma regra por linha, no imperativo.')}
          example={t('Mensagens de commit em português, no imperativo, sem ponto final.')}
        >
          <FormField label={t('A regra')}>
            {(id) => <TextArea id={id} autoFocus rows={3} value={what} onChange={(e) => setWhat(e.target.value)} />}
          </FormField>
          <div className="chips-editor" aria-label={t('Ideias de regra')}>
            {RULE_IDEAS.map((idea) => (
              <Chip
                key={idea.label}
                on={false}
                title={idea.text}
                onClick={() => setWhat(what.trim() ? `${what.trim()}\n${idea.text}` : idea.text)}
              >
                {t(idea.label)}
              </Chip>
            ))}
          </div>
        </WizardQuestion>
      )}

      {step === 2 && (
        <WizardQuestion
          question={t('Quer incluir alguma convenção do projeto? Marque as que valem.')}
          example={t('Rode os testes com npm run test antes de dizer que terminou.')}
        >
          {loading && <p className="muted small">{t('Lendo o projeto…')}</p>}
          {!loading && convention.length === 0 && (
            <p className="muted small">{t('Não achei convenções no projeto para sugerir. Pode continuar.')}</p>
          )}
          {convention.length > 0 && (
            <>
              <ul className="wizard-checks">
                {convention.map((c) => (
                  <li key={c.id}>
                    <label className="tool-option">
                      <Checkbox
                        aria-label={t(c.label, c.params)}
                        checked={picked.includes(c.id)}
                        onCheckedChange={(v) => setPicked(v === true ? [...picked, c.id] : picked.filter((x) => x !== c.id))}
                      />
                      <span>{t(c.label, c.params)}</span>
                      <span className="muted small">{c.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <Button
                variant="ghost"
                size="1"
                onClick={() => setPicked(picked.length === convention.length ? [] : convention.map((c) => c.id))}
              >
                {picked.length === convention.length ? t('Desmarcar todas') : t('Marcar todas')}
              </Button>
            </>
          )}
        </WizardQuestion>
      )}

      {step === 3 && (
        <WizardQuestion
          question={t('Confiro o texto contra o fluxo do board (fases, aprovação, servidor MCP, branches).')}
          example={t('Não use MCP; commit direto na main; pule a aprovação.')}
        >
          {draftConflicts.length === 0 ? (
            <p className="muted small">{t('Nenhum trecho conflita com o fluxo do board.')}</p>
          ) : (
            <ConflictList conflicts={draftConflicts} />
          )}
          <p className="muted small">{t('A regra entra no board desligada: você a revisa e ativa depois, na lista de regras.')}</p>
        </WizardQuestion>
      )}

      {step === 4 && (
        <WizardQuestion question={t('Confira o rascunho. Nada é gravado antes do botão de baixo.')}>
          {kind === 'topic' && (
            <FormField label={t('Nome do arquivo')} hint={ruleName && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
              {(id) => (
                <TextField.Root
                  id={id}
                  color={ruleName && !nameOk ? 'red' : undefined}
                  value={ruleName}
                  onChange={(e) => setName(toItemName(e.target.value))}
                />
              )}
            </FormField>
          )}
          <dl className="wizard-summary">
            <dt>{t('Onde')}</dt>
            <dd>
              <code>{location}</code> {appending && <span className="muted small">{t('(acrescenta ao fim do arquivo)')}</span>}
            </dd>
            <dt>{t('No board')}</dt>
            <dd>{t('Desligada, até você ativar')}</dd>
          </dl>
          <FormField label={t('Texto da regra')}>
            {(id) => (
              <>
                <TextArea
                  id={id}
                  className="code-area"
                  rows={12}
                  spellCheck={false}
                  value={body}
                  onChange={(e) => setText(e.target.value)}
                />
                {text !== null && (
                  <Button variant="ghost" size="1" onClick={() => setText(null)}>
                    {t('Refazer o rascunho com as respostas')}
                  </Button>
                )}
              </>
            )}
          </FormField>
          {conflicts.length > 0 && <ConflictList conflicts={conflicts} />}
          {scope === 'user' && <p className="muted small">{t(GLOBAL_WARNING)}</p>}
        </WizardQuestion>
      )}
    </WizardShell>
  );
}

/** Os trechos que podem conflitar com o fluxo do board, com o motivo de cada um. */
function ConflictList({ conflicts }: { conflicts: { excerpt: string; reason: string }[] }) {
  return (
    <div className="wizard-conflicts" role="alert">
      <p className="wizard-warning">
        <IconWarning /> {t('Estes trechos podem conflitar com o fluxo do board:')}
      </p>
      <ul>
        {conflicts.map((c, i) => (
          <li key={i}>
            <q>{c.excerpt}</q>
            <span className="muted small"> {t(c.reason)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
