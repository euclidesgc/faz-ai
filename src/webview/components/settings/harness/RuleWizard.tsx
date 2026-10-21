import { useMemo, useState } from 'react';
import { Button, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import { nameFromText } from '../../../../shared/agentWizard';
import { RULE_NAME_PATTERN } from '../../../../shared/artifactImport';
import { toItemName } from '../../../../shared/harnessProject';
import { findRuleConflicts } from '../../../../shared/ruleConflicts';
import { RULE_IDEAS, conventionItems, draftRule } from '../../../../shared/ruleWizard';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Chip, FormField, IconWarning } from '../../ui';
import { WizardQuestion, WizardShell } from './Wizard';
import { useProjectProfile } from './useProjectProfile';
import { t } from '../../../i18n';

const STEPS = ['O que garante', 'Convenções do projeto', 'Conflito com o board', 'Rascunho e resumo'];

/**
 * "Criar regra com ajuda": quatro passos para escrever uma regra do board, com as convenções que o perfil do projeto
 * sugere e a conferência contra o que o fluxo do board espera. A regra é gravada no board em "Desligado" (o host
 * decide pelo `via: 'wizard'`); nada é gravado antes do último passo.
 */
export function RuleWizard({ onClose }: { onClose: () => void }) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const { profile, loading } = useProjectProfile();
  const [step, setStep] = useState(0);
  const [what, setWhat] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);

  const convention = useMemo(() => conventionItems(profile), [profile]);
  const chosen = convention.filter((c) => picked.includes(c.id));
  const draft = draftRule('claude', { kind: 'main', paths: [] }, what, chosen);
  const body = text ?? draft;
  const conflicts = findRuleConflicts(body);
  const draftConflicts = findRuleConflicts(draft);

  const ruleName = name ?? nameFromText(what);
  const nameOk = RULE_NAME_PATTERN.test(ruleName) && !artifacts.some((a) => a.kind === 'rule' && a.name === ruleName);

  const finish = () => {
    void harness.saveArtifact({ kind: 'rule', name: ruleName, body, via: 'wizard' });
    onClose();
  };

  const disabled = step === 0 ? !what.trim() : step === 3 ? !nameOk || !body.trim() : false;

  return (
    <WizardShell
      label={t('Criar regra com ajuda')}
      steps={STEPS}
      step={step}
      onBack={() => setStep(step - 1)}
      onNext={() => (step === STEPS.length - 1 ? finish() : setStep(step + 1))}
      onCancel={onClose}
      finishLabel={t('Criar regra')}
      nextDisabled={disabled}
    >
      {step === 0 && (
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

      {step === 1 && (
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

      {step === 2 && (
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

      {step === 3 && (
        <WizardQuestion question={t('Confira o rascunho. Nada é gravado antes do botão de baixo.')}>
          <FormField label={t('Nome da regra')} hint={ruleName && !nameOk ? t('Nome inválido ou já usado.') : undefined}>
            {(id) => (
              <TextField.Root
                id={id}
                color={ruleName && !nameOk ? 'red' : undefined}
                value={ruleName}
                onChange={(e) => setName(toItemName(e.target.value))}
              />
            )}
          </FormField>
          <dl className="wizard-summary">
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
