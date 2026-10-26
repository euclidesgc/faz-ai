import { useEffect, useState } from 'react';
import { Button, Card, Heading, TextArea, TextField } from '@radix-ui/themes';
import type { BoardArtifact } from '../../../../shared/artifacts';
import { SKILL_NAME_PATTERN } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { FormField } from '../../ui';
import { SkillFiles } from './SkillFiles';
import { composeSkill, parseSkill } from './skillMarkdown';
import { useArtifactText } from './useArtifactText';
import { t } from '../../../i18n';

/** Por que o nome de uma skill não pode ser salvo; `null` quando está livre. */
export function skillNameProblem(name: string, taken: readonly string[]): string | null {
  if (!name) return t('Dê um nome à skill.');
  if (!SKILL_NAME_PATTERN.test(name)) return t('Use letras minúsculas, números e hífen (até 64).');
  if (taken.includes(name)) return t('Já existe uma skill com este nome.');
  return null;
}

/**
 * Editor de uma skill do board: o SKILL.md (nome, descrição e corpo) e os arquivos de apoio. Sem `skill` cria uma
 * nova; com `skill` lê o SKILL.md com `harness.artifact.read` e espera o `readResult`. Os arquivos de apoio só
 * existem depois que a skill é salva.
 */
export function SkillEditor({ skill, onClose }: { skill?: BoardArtifact; onClose: () => void }) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const current = artifacts.find((a) => a.kind === 'skill' && a.name === skill?.name) ?? skill;
  const read = useArtifactText('skill', skill?.name);
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [extra, setExtra] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(!skill);
  useEffect(() => {
    if (read.text === null) return;
    const p = parseSkill(read.text);
    setDescription(p.description);
    setBody(p.body);
    setExtra(p.extra);
    setLoaded(true);
  }, [read.text]);

  const trimmed = name.trim();
  const renamed = !!skill && trimmed !== skill.name;
  const taken = artifacts.filter((a) => a.kind === 'skill' && a.name !== skill?.name).map((a) => a.name);
  const problem = !skill || renamed ? skillNameProblem(trimmed, taken) : null;
  const readonly = !!skill?.generated;
  const save = useAction(() =>
    harness.saveArtifact({
      kind: 'skill',
      name: trimmed,
      body: composeSkill({ name: trimmed, description, body, extra }),
      ...(renamed ? { previous: skill!.name } : {}),
      via: 'manual',
    }),
  );
  const submit = async () => {
    if (await save.run()) onClose();
  };
  const canSave = loaded && !readonly && !problem && description.trim() !== '' && body.trim() !== '' && !save.busy;

  return (
    <Card className="draft-card" aria-label={skill ? t('Editar skill') : t('Nova skill')}>
      <form
        className="wizard-body"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void submit();
        }}
      >
        <Heading as="h4" size="2">
          {skill ? t('Editar skill') : t('Nova skill')}
        </Heading>
        {readonly && <p className="muted small">{t('Esta skill é gerada pela extensão e regravada a cada abertura: só o modo muda.')}</p>}
        <FormField label={t('Nome da skill')} hint={problem ?? t('Letras minúsculas, números e hífen.')}>
          {(id) => (
            <TextField.Root
              id={id}
              color={problem && trimmed ? 'red' : undefined}
              aria-invalid={problem && trimmed ? true : undefined}
              disabled={readonly}
              value={name}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
          )}
        </FormField>
        {renamed && (
          <p className="muted small" role="status">
            {t('Os cards e os agentes que citam "{name}" não são reescritos: ajuste-os se for preciso.', { name: skill!.name })}
          </p>
        )}
        <FormField label={t('Descrição')} hint={t('É por ela que a IA e a pessoa decidem quando usar a skill.')}>
          {(id) => (
            <TextArea
              id={id}
              rows={2}
              disabled={!loaded || readonly}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          )}
        </FormField>
        <FormField label={t('Corpo do SKILL.md')} hint={read.loading ? t('Lendo a skill…') : undefined}>
          {(id) => (
            <TextArea
              id={id}
              className="code-area"
              rows={14}
              spellCheck={false}
              disabled={!loaded || readonly}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          )}
        </FormField>
        <p className="muted small">
          {current?.revision !== undefined && `${t('Versão {n}.', { n: current.revision })} `}
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
      {skill && (
        <section aria-label={t('Arquivos de apoio')}>
          <Heading as="h5" size="2">
            {t('Arquivos de apoio')}
          </Heading>
          <SkillFiles skill={skill.name} files={current?.files ?? []} editable={!readonly} />
        </section>
      )}
      {!skill && <p className="muted small">{t('Salve a skill para acrescentar arquivos de apoio.')}</p>}
    </Card>
  );
}
