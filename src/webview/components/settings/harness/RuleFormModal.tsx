import { useEffect, useMemo, useState } from 'react';
import { Dialog, TextField } from '@radix-ui/themes';
import type { ArtifactAssistDraft } from '../../../../shared/artifactAssistant';
import { defaultVersion, type BoardArtifact } from '../../../../shared/artifacts';
import { coveredTopics, estimateTokens, ruleTemplate, RULE_TOPICS } from '../../../../shared/ruleTemplate';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { t } from '../../../i18n';
import { ActionButton, FormField, IconCheck, IconSuggest } from '../../ui';
import { MarkdownEditor } from '../../MarkdownEditor';
import { ruleNameProblem } from './RuleEditor';
import { useArtifactText } from './useArtifactText';

/** Mantém a linha `versao:` do frontmatter igual ao campo versão (só quando ela existe). */
export function withRuleVersion(text: string, version: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm || !/^versao:/m.test(fm[1]!)) return text;
  const head = fm[0].replace(/^versao:[^\r\n]*/m, `versao: ${version}`);
  return head + text.slice(fm[0].length);
}

const TIPS = [
  'Escreva frases no imperativo ("Use…", "Nunca…").',
  'Uma regra por linha.',
  'Não contradiga o fluxo do board.',
  'Seja curto: a regra ativa entra em todo pedido.',
];

/** "Nova regra" e a edição de uma regra: o texto em Markdown, o checklist de tópicos e a estimativa de tokens ao lado. */
export function RuleFormModal({
  rule,
  initial,
  onClose,
  onAssist,
}: {
  /** a regra a editar; ausente = nova */
  rule?: BoardArtifact;
  /** pré-preenchimento (do "Criar com IA" ou do "Duplicar") */
  initial?: Partial<ArtifactAssistDraft>;
  onClose: () => void;
  /** o link "Criar com IA" do rodapé: fecha o modal e abre o assistente */
  onAssist: () => void;
}) {
  const artifacts = useBoardStore((s) => s.state?.harness.library?.artifacts) ?? [];
  const read = useArtifactText('rule', rule?.name);
  const [name, setName] = useState(rule?.name ?? initial?.name ?? '');
  const [version, setVersion] = useState(rule?.version ?? initial?.version ?? defaultVersion('rule'));
  const slug = name.trim().replace(/\.md$/i, '') || 'regra';
  const [body, setBody] = useState(() => initial?.body ?? (rule ? '' : withRuleVersion(ruleTemplate(slug), version)));
  // o modelo acompanha o nome e a versão enquanto a pessoa não escreveu no editor
  const [touched, setTouched] = useState(!!initial?.body);
  const [loaded, setLoaded] = useState(!rule);

  useEffect(() => {
    if (read.text !== null) {
      setBody(read.text);
      setLoaded(true);
    }
  }, [read.text]);

  const changeName = (next: string) => {
    setName(next);
    if (!touched && !rule) setBody(withRuleVersion(ruleTemplate(next.trim().replace(/\.md$/i, '') || 'regra'), version));
  };
  const changeVersion = (next: string) => {
    setVersion(next);
    if (next.trim()) setBody((b) => withRuleVersion(b, next.trim()));
  };

  const trimmed = name.trim();
  const taken = artifacts.filter((a) => a.kind === 'rule' && a.name !== rule?.name).map((a) => a.name);
  const nameProblem = rule ? null : ruleNameProblem(trimmed, taken);
  const versionProblem = /^[\w.-]{1,32}$/.test(version.trim()) ? null : t('Use letras, números, ponto e hífen (até 32).');
  const covered = useMemo(() => coveredTopics(body), [body]);
  const tokens = estimateTokens(body);

  const save = useAction(async (active: boolean) => {
    await harness.saveLibraryArtifact({
      ...(rule ? { id: rule.id } : {}),
      kind: 'rule',
      name: trimmed,
      description: rule?.description ?? '',
      body,
      version: version.trim(),
      ...(rule ? {} : { active }),
    });
    onClose();
  });
  const canSave = loaded && !nameProblem && !versionProblem && body.trim() !== '';
  const why = !loaded
    ? t('Lendo a regra…')
    : nameProblem && trimmed
      ? nameProblem
      : !trimmed && !rule
        ? t('Dê um nome à regra.')
        : versionProblem
          ? versionProblem
          : t('Escreva o texto da regra.');

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !save.busy && onClose()}>
      <Dialog.Content className="board-dialog board-dialog-xl scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <header className="board-dialog-head">
          <Dialog.Title>{rule ? t('Editar regra') : t('Nova regra')}</Dialog.Title>
          <Dialog.Description>
            {t('Uma regra ativa entra em todo pedido à IA. Salva inativa, fica na biblioteca sem entrar em nada.')}
          </Dialog.Description>
        </header>

        <div className="artifact-form board-dialog-scroll">
          <div className="artifact-form-main">
            <div className="artifact-form-row">
              <FormField
                label={t('Nome da regra')}
                hint={nameProblem && trimmed ? nameProblem : t('Letras minúsculas, números e hífen; .md é opcional.')}
              >
                {(id) => (
                  <TextField.Root
                    id={id}
                    value={name}
                    disabled={!!rule}
                    spellCheck={false}
                    color={nameProblem && trimmed ? 'red' : undefined}
                    aria-invalid={nameProblem && trimmed ? true : undefined}
                    onChange={(e) => changeName(e.target.value)}
                    placeholder="projeto"
                  />
                )}
              </FormField>
              <FormField label={t('Versão')} hint={versionProblem ?? undefined}>
                {(id) => (
                  <TextField.Root
                    id={id}
                    value={version}
                    spellCheck={false}
                    color={versionProblem ? 'red' : undefined}
                    onChange={(e) => changeVersion(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <FormField label={t('Texto da regra')} hint={read.error ?? (read.loading ? t('Lendo a regra…') : undefined)}>
              {(id) => (
                <MarkdownEditor
                  id={id}
                  ariaLabel={t('Texto da regra')}
                  minRows={16}
                  value={body}
                  onChange={(v) => {
                    setTouched(true);
                    setBody(v);
                  }}
                />
              )}
            </FormField>
          </div>

          <aside className="artifact-form-side" aria-label={t('Guia da regra')}>
            <section className="form-panel">
              <h4>{t('Tópicos recomendados')}</h4>
              <ul className="topic-list">
                {RULE_TOPICS.map((topic) => (
                  <li key={topic} className={covered.has(topic) ? 'topic-done' : 'topic-todo'}>
                    {covered.has(topic) ? <IconCheck aria-label={t('coberto')} /> : <span className="topic-dot" aria-hidden />}
                    <span>{t(topic)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="form-panel">
              <h4>{t('Como escrever')}</h4>
              <ul className="tip-list">
                {TIPS.map((tip) => (
                  <li key={tip}>{t(tip)}</li>
                ))}
              </ul>
            </section>
            <p className="muted small" role="status">
              {t('~{n} tokens', { n: tokens })}
            </p>
          </aside>
        </div>

        {save.error && (
          <p role="alert" className="form-error">
            {save.error}
          </p>
        )}
        <footer className="board-dialog-footer">
          {!rule && (
            <ActionButton
              variant="ghost"
              hint={t('Fecha este formulário e deixa a IA fazer perguntas para montar a regra.')}
              onClick={onAssist}
            >
              <IconSuggest aria-hidden /> {t('Criar com IA')}
            </ActionButton>
          )}
          <span className="spacer" />
          <ActionButton variant="soft" color="gray" hint={t('Fecha sem salvar.')} onClick={onClose} disabled={save.busy}>
            {t('Cancelar')}
          </ActionButton>
          {rule ? (
            <ActionButton
              disabled={!canSave}
              disabledReason={why}
              loading={save.busy}
              hint={t('Grava a regra; ela continua ativa ou inativa como estava.')}
              onClick={() => void save.run(false)}
            >
              {t('Salvar')}
            </ActionButton>
          ) : (
            <>
              <ActionButton
                variant="soft"
                disabled={!canSave}
                disabledReason={why}
                loading={save.busy}
                hint={t('Grava a regra na biblioteca sem ativá-la.')}
                onClick={() => void save.run(false)}
              >
                {t('Salvar inativa')}
              </ActionButton>
              <ActionButton
                disabled={!canSave}
                disabledReason={why}
                loading={save.busy}
                hint={t('Grava a regra e a ativa: ela passa a entrar em todo pedido.')}
                onClick={() => void save.run(true)}
              >
                {t('Salvar e ativar')}
              </ActionButton>
            </>
          )}
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
