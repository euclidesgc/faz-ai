import { useEffect, useState } from 'react';
import { Badge, Checkbox, Dialog, RadioGroup, Text, TextField } from '@radix-ui/themes';
import { AI_BASES, type AiTool } from '../../../../shared/harness';
import { type ArtifactKind } from '../../../../shared/artifacts';
import type { ImportCandidate, ImportSource } from '../../../../shared/artifactImport';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';
import { isWeb } from '../../../vscode';
import { t } from '../../../i18n';

/** O nome de cada tipo no plural, em português (traduzido onde é usado). */
const ARTIFACT_LABELS = { rule: 'Regras', skill: 'Skills', agent: 'Subagentes', mcp: 'MCPs' } as const;

type Origin = 'folder' | 'tool' | 'export';

const KINDS: ArtifactKind[] = ['rule', 'skill', 'agent', 'mcp'];

/**
 * Importar artefatos para o board: passo 1 escolhe a origem, passo 2 lista os candidatos
 * (`state.artifactImport`). Nada é ativado nem executado na importação; regras ficam para revisão.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const preview = state.artifactImport;
  const [origin, setOrigin] = useState<Origin>('folder');
  const [path, setPath] = useState('');
  const [subdir, setSubdir] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);

  const scan = useAction(async (source: ImportSource) => {
    await harness.importScan(source);
  });
  const pick = useAction((what: 'folder' | 'export') => harness.importPick(what));
  const apply = useAction(async (keys: string[], onConflict: 'replace' | 'skip') => {
    await harness.importApply(keys, onConflict);
    onClose();
  });

  // uma prévia nova começa sem nada marcado
  useEffect(() => {
    setChosen([]);
  }, [preview]);

  const close = () => {
    harness.importCancel();
    onClose();
  };
  const back = () => {
    harness.importCancel();
    scan.reset();
    pick.reset();
  };

  const candidates = preview?.candidates ?? [];
  const picked = chosen.filter((k) => candidates.some((c) => c.key === k && !c.problem));
  const duplicates = candidates.filter((c) => picked.includes(c.key) && c.exists);

  const doApply = () => {
    if (!duplicates.length) {
      void apply.run(picked, 'skip');
      return;
    }
    ask({
      title: t('{n} já estão no board', { n: duplicates.length }),
      message: `${duplicates.map((c) => `${t(ARTIFACT_LABELS[c.kind])}: ${c.name}`).join('\n')}\n\n${t(
        'Substituir troca o conteúdo atual pelo importado. Pular os repetidos importa só o que é novo.',
      )}`,
      confirmLabel: t('Substituir'),
      secondary: { label: t('Pular os repetidos'), onClick: () => void apply.run(picked, 'skip') },
      onConfirm: () => void apply.run(picked, 'replace'),
    });
  };

  const showError = scan.error ?? pick.error;
  const inStep2 = !!preview && !showError;
  const installed = (tool: AiTool) => state.harness.inventory.find((i) => i.tool === tool)?.installed ?? false;

  const toggle = (c: ImportCandidate, on: boolean) => setChosen((cur) => (on ? [...cur, c.key] : cur.filter((k) => k !== c.key)));

  const examineFolder = () => void scan.run({ from: 'folder', path: path.trim(), ...(subdir.trim() ? { subdir: subdir.trim() } : {}) });

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !apply.busy && close()}>
      <Dialog.Content className="board-dialog board-dialog-md scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <header className="board-dialog-head">
          <Dialog.Title>{t('Importar artefatos para o board')}</Dialog.Title>
          <Dialog.Description>
            {t('Nada é ativado nem executado na importação. Regras e servidores MCP importados esperam a sua revisão.')}
          </Dialog.Description>
        </header>

        {!inStep2 && (
          <div className="board-dialog-body">
            <div className="form-field">
              <Text as="span" size="1" weight="medium" className="form-field-label" id="import-origin">
                {t('De onde importar')}
              </Text>
              <RadioGroup.Root
                className="radio-row"
                value={origin}
                onValueChange={(v) => setOrigin(v as Origin)}
                aria-labelledby="import-origin"
              >
                <RadioGroup.Item value="folder">{t('Pasta ou repositório git')}</RadioGroup.Item>
                <RadioGroup.Item value="tool">{t('Ferramenta instalada')}</RadioGroup.Item>
                <RadioGroup.Item value="export">{t('Arquivo de exportação')}</RadioGroup.Item>
              </RadioGroup.Root>
            </div>

            {origin === 'folder' && (
              <>
                <FormField
                  label={t('Caminho da pasta ou endereço do repositório')}
                  hint={t('Uma pasta neste computador ou o endereço de um repositório git.')}
                >
                  {(id) => (
                    <div className="field-with-action">
                      <TextField.Root
                        id={id}
                        value={path}
                        placeholder={t('/caminho/da/pasta ou https://github.com/conta/repositorio')}
                        onChange={(e) => setPath(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && path.trim()) examineFolder();
                        }}
                        spellCheck={false}
                      />
                      {!isWeb && (
                        <ActionButton
                          variant="soft"
                          color="gray"
                          loading={pick.busy}
                          hint={t('Escolhe a pasta pelo gerenciador de arquivos.')}
                          onClick={() => void pick.run('folder')}
                        >
                          {t('Escolher pasta')}
                        </ActionButton>
                      )}
                    </div>
                  )}
                </FormField>
                <FormField label={t('Subpasta (opcional)')} hint={t('A pasta dentro da origem onde estão os artefatos.')}>
                  {(id) => <TextField.Root id={id} value={subdir} onChange={(e) => setSubdir(e.target.value)} spellCheck={false} />}
                </FormField>
              </>
            )}

            {origin === 'tool' && (
              <ul className="choice-list" aria-label={t('Ferramentas')}>
                {AI_BASES.map((b) => {
                  const here = installed(b.id);
                  return (
                    <li key={b.id} className={`choice-row${here ? '' : ' off'}`}>
                      <div className="choice-main">
                        <span className="choice-name">{b.label}</span>
                        <span className="muted small">
                          {here ? t('Tem regras, skills, agentes ou MCPs para importar.') : t('Nada para importar nesta máquina.')}
                        </span>
                      </div>
                      <ActionButton
                        variant="soft"
                        size="1"
                        disabled={!here}
                        disabledReason={t('Não há pasta nem arquivos desta ferramenta no projeto nem no usuário.')}
                        loading={scan.busy}
                        aria-label={t('Examinar {tool}', { tool: b.label })}
                        hint={t('Lê as regras, skills, agentes e MCPs que esta ferramenta já tem.')}
                        onClick={() => void scan.run({ from: 'tool', tool: b.id })}
                      >
                        {t('Examinar')}
                      </ActionButton>
                    </li>
                  );
                })}
              </ul>
            )}

            {origin === 'export' && (
              <p className="muted small">{t('Escolha um arquivo gerado por "Exportar o board" para ver o que há nele.')}</p>
            )}

            {showError && (
              <Text as="p" color="red" size="2" role="alert">
                {showError}
              </Text>
            )}
          </div>
        )}

        {inStep2 && preview && (
          <section className="board-dialog-body board-dialog-scroll" aria-label={t('Artefatos encontrados')}>
            <p className="muted small">{preview.label}</p>
            {candidates.length === 0 && <p>{t('Nenhum artefato encontrado')}</p>}
            {KINDS.map((kind) => {
              const group = candidates.filter((c) => c.kind === kind);
              if (!group.length) return null;
              return (
                <fieldset key={kind} className="import-group">
                  <legend>{t(ARTIFACT_LABELS[kind])}</legend>
                  <ul className="choice-list">
                    {group.map((c) => (
                      <li key={c.key} className={`choice-row${c.problem ? ' off' : ''}`}>
                        {c.problem ? (
                          <span className="choice-check" />
                        ) : (
                          <Checkbox
                            className="choice-check"
                            aria-label={t('Importar {name}', { name: c.name })}
                            checked={picked.includes(c.key)}
                            onCheckedChange={(on) => toggle(c, on === true)}
                          />
                        )}
                        <div className="choice-main">
                          <span className="choice-name">
                            {c.name}
                            {c.exists && (
                              <Badge color="gray" variant="outline">
                                {t('já está no board')}
                              </Badge>
                            )}
                            {c.problem && (
                              <Badge color="red" variant="outline">
                                {c.problem}
                              </Badge>
                            )}
                          </span>
                          <span className="muted small">{c.description || c.origin}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              );
            })}
            {apply.error && (
              <Text as="p" color="red" size="2" role="alert">
                {apply.error}
              </Text>
            )}
          </section>
        )}

        <footer className="board-dialog-footer">
          {inStep2 && (
            <ActionButton variant="soft" color="gray" hint={t('Volta para escolher outra origem.')} onClick={back}>
              {t('Voltar')}
            </ActionButton>
          )}
          <span className="spacer" />
          <ActionButton variant="soft" color="gray" hint={t('Fecha sem importar nada.')} onClick={close}>
            {t('Fechar')}
          </ActionButton>
          {!inStep2 && origin === 'folder' && (
            <ActionButton
              disabled={!path.trim()}
              disabledReason={t('Informe o caminho da pasta ou o endereço do repositório.')}
              loading={scan.busy}
              hint={t('Lê a origem sem rodar nada e lista os artefatos encontrados.')}
              onClick={examineFolder}
            >
              {t('Examinar')}
            </ActionButton>
          )}
          {!inStep2 && origin === 'export' && (
            <ActionButton
              loading={pick.busy}
              hint={t('Escolhe um arquivo de exportação do board e lista o que há nele.')}
              onClick={() => void pick.run('export')}
            >
              {t('Escolher arquivo')}
            </ActionButton>
          )}
          {inStep2 && (
            <ActionButton
              disabled={picked.length === 0}
              disabledReason={t('Marque pelo menos um artefato.')}
              loading={apply.busy}
              hint={t('Copia os artefatos marcados para o board.')}
              onClick={doApply}
            >
              {t('Importar {n}', { n: picked.length })}
            </ActionButton>
          )}
        </footer>
      </Dialog.Content>
    </Dialog.Root>
  );
}
