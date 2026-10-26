import { useEffect, useState } from 'react';
import { Button, Card, Heading, TextArea, TextField } from '@radix-ui/themes';
import type { BoardArtifact } from '../../../../shared/artifacts';
import { RULE_NAME_PATTERN } from '../../../../shared/artifactImport';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { FormField } from '../../ui';
import { useArtifactText } from './useArtifactText';
import { t } from '../../../i18n';

/** Por que o nome de uma regra não pode ser salvo; `null` quando está livre. */
export function ruleNameProblem(name: string, taken: readonly string[]): string | null {
  if (!name) return t('Dê um nome à regra.');
  if (!RULE_NAME_PATTERN.test(name)) return t('Use letras minúsculas, números e hífen (até 64), com .md opcional.');
  if (taken.includes(name)) return t('Já existe uma regra com este nome.');
  return null;
}

/**
 * Editor de uma regra do board: nome e texto. Sem `rule` cria uma nova; com `rule` lê o texto do host e, se o nome
 * mudar, salva como renomeação (`previous`). Funciona sem nenhuma ferramenta de IA instalada.
 */
export function RuleEditor({ rule, onClose }: { rule?: BoardArtifact; onClose: () => void }) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const read = useArtifactText('rule', rule?.name);
  const [name, setName] = useState(rule?.name ?? '');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(!rule);
  useEffect(() => {
    if (read.text !== null) {
      setBody(read.text);
      setLoaded(true);
    }
  }, [read.text]);

  const trimmed = name.trim();
  const renamed = !!rule && trimmed !== rule.name;
  const taken = artifacts.filter((a) => a.kind === 'rule' && a.name !== rule?.name).map((a) => a.name);
  const problem = !rule || renamed ? ruleNameProblem(trimmed, taken) : null;
  const save = useAction(() =>
    harness.saveArtifact({ kind: 'rule', name: trimmed, body, ...(renamed ? { previous: rule!.name } : {}), via: 'manual' }),
  );
  const submit = async () => {
    if (await save.run()) onClose();
  };
  const canSave = loaded && !problem && body.trim() !== '' && !save.busy;

  return (
    <Card className="draft-card" aria-label={rule ? t('Editar regra') : t('Nova regra')}>
      <form
        className="wizard-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void submit();
        }}
      >
        <Heading as="h4" size="2">
          {rule ? t('Editar regra') : t('Nova regra')}
        </Heading>
        <FormField label={t('Nome da regra')} hint={problem ?? t('Letras minúsculas, números e hífen; .md é opcional.')}>
          {(id) => (
            <TextField.Root
              id={id}
              color={problem && trimmed ? 'red' : undefined}
              aria-invalid={problem && trimmed ? true : undefined}
              value={name}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        {renamed && (
          <p className="muted small" role="status">
            {t('Os cards e os agentes que citam "{name}" não são reescritos: ajuste-os se for preciso.', { name: rule!.name })}
          </p>
        )}
        <FormField label={t('Texto da regra')} hint={read.loading ? t('Lendo a regra…') : undefined}>
          {(id) => (
            <TextArea
              id={id}
              className="code-area"
              rows={12}
              spellCheck={false}
              disabled={!loaded}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </FormField>
        <p className="muted small">
          {rule?.revision !== undefined && `${t('Versão {n}.', { n: rule.revision })} `}
          {t('A alteração vale para as próximas execuções; a execução em andamento não muda.')}
        </p>
        {(read.error || save.error) && (
          <p className="wizard-warning" role="alert">
            {read.error ?? save.error}
          </p>
        )}
        <div className="form-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" disabled={!canSave} loading={save.busy}>
            {t('Salvar')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
