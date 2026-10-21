import { useEffect, useState } from 'react';
import { Badge, Checkbox, Dialog, RadioGroup, Text, TextField } from '@radix-ui/themes';
import { AI_BASES, type AiTool } from '../../../../shared/harness';
import { selectableOfKind, type ArtifactKind } from '../../../../shared/artifacts';
import type { ImportCandidate, ImportSource } from '../../../../shared/artifactImport';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton, FormField } from '../../ui';
import { isWeb } from '../../../vscode';
import { ARTIFACT_LABELS } from './LibraryImport';
import { t } from '../../../i18n';

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
  const suggestions = state.harnessSuggestions;
  const [origin, setOrigin] = useState<Origin>('folder');
  const [path, setPath] = useState('');
  const [subdir, setSubdir] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});

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
    setReasons({});
  }, [preview]);

  // a IA indicou: marca só o que é candidato desta lista e guarda a razão
  useEffect(() => {
    if (!suggestions || !preview) return;
    const valid = new Set(preview.candidates.filter((c) => !c.problem).map((c) => c.key));
    const hits = suggestions.items.filter((i) => valid.has(i.location));
    if (!hits.length) return;
    setChosen((cur) => [...new Set([...cur, ...hits.map((i) => i.location)])]);
    setReasons((cur) => ({ ...cur, ...Object.fromEntries(hits.map((i) => [i.location, i.reason])) }));
  }, [suggestions, preview]);

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
  const toolSource = preview?.source.from === 'tool' ? preview.source.tool : null;

  const toggle = (c: ImportCandidate, on: boolean) => setChosen((cur) => (on ? [...cur, c.key] : cur.filter((k) => k !== c.key)));

  const suggest = (kind: ArtifactKind) => {
    if (toolSource) harness.suggest(toolSource, selectableOfKind(kind));
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && !apply.busy && close()}>
      <Dialog.Content maxWidth="760px" className="scope-harness" onInteractOutside={(e) => e.preventDefault()}>
        <Dialog.Title>{t('Importar artefatos para o board')}</Dialog.Title>
        <Dialog.Description>
          {t('Nada é ativado nem executado na importação. Regras e servidores MCP importados esperam a sua revisão.')}
        </Dialog.Description>

        {!inStep2 && (
          <section aria-label={t('Origem')}>
            <RadioGroup.Root value={origin} onValueChange={(v) => setOrigin(v as Origin)} aria-label={t('Origem')}>
              <RadioGroup.Item value="folder">{t('Pasta ou repositório git')}</RadioGroup.Item>
              <RadioGroup.Item value="tool">{t('Ferramenta instalada')}</RadioGroup.Item>
              <RadioGroup.Item value="export">{t('Arquivo de exportação')}</RadioGroup.Item>
            </RadioGroup.Root>
            {showError && (
              <Text as="p" color="red" size="2" role="alert">
                {showError}
              </Text>
            )}
            {origin === 'folder' && (
              <>
                <FormField label={t('Caminho da pasta ou endereço do repositório')}>
                  {(id) => (
                    <TextField.Root id={id} value={path} onChange={(e) => setPath(e.target.value)} spellCheck={false} />
                  )}
                </FormField>
                <FormField label={t('Subpasta (opcional)')}>
                  {(id) => <TextField.Root id={id} value={subdir} onChange={(e) => setSubdir(e.target.value)} spellCheck={false} />}
                </FormField>
                <div className="form-actions">
                  {!isWeb && (
                    <ActionButton
                      variant="soft"
                      loading={pick.busy}
                      hint={t('Escolhe a pasta pelo gerenciador de arquivos.')}
                      onClick={() => {
                        void pick.run('folder');
                      }}
                    >
                      {t('Escolher pasta')}
                    </ActionButton>
                  )}
                  <ActionButton
                    disabled={!path.trim()}
                    disabledReason={t('Informe o caminho da pasta ou o endereço do repositório.')}
                    loading={scan.busy}
                    hint={t('Lê a origem sem rodar nada e lista os artefatos encontrados.')}
                    onClick={() => {
                      void scan.run({ from: 'folder', path: path.trim(), ...(subdir.trim() ? { subdir: subdir.trim() } : {}) });
                    }}
                  >
                    {t('Examinar')}
                  </ActionButton>
                </div>
              </>
            )}
            {origin === 'tool' && (
              <ul className="plain-list">
                {AI_BASES.map((b) => {
                  const here = installed(b.id);
                  return (
                    <li key={b.id} className="row">
                      <ActionButton
                        variant="soft"
                        disabled={!here}
                        disabledReason={t('Esta ferramenta não está instalada.')}
                        loading={scan.busy}
                        hint={t('Lê as regras, skills, agentes e MCPs que esta ferramenta já tem.')}
                        onClick={() => {
                          void scan.run({ from: 'tool', tool: b.id });
                        }}
                      >
                        {b.label}
                      </ActionButton>
                      {!here && <span className="muted small">{t('não encontrada nesta máquina')}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {origin === 'export' && (
              <div className="form-actions">
                <ActionButton
                  loading={pick.busy}
                  hint={t('Escolhe um arquivo de exportação do board e lista o que há nele.')}
                  onClick={() => {
                    void pick.run('export');
                  }}
                >
                  {t('Escolher arquivo')}
                </ActionButton>
              </div>
            )}
          </section>
        )}

        {inStep2 && preview && (
          <section aria-label={t('Artefatos encontrados')}>
            <p className="muted small">{preview.label}</p>
            {candidates.length === 0 && <p>{t('Nenhum artefato encontrado')}</p>}
            {KINDS.map((kind) => {
              const group = candidates.filter((c) => c.kind === kind);
              if (!group.length) return null;
              return (
                <fieldset key={kind} className="import-group">
                  <legend>{t(ARTIFACT_LABELS[kind])}</legend>
                  {toolSource && (
                    <ActionButton
                      size="1"
                      variant="ghost"
                      hint={t('A IA lê o projeto e marca o que faz mais sentido; você confirma antes de importar.')}
                      onClick={() => suggest(kind)}
                    >
                      {t('Indicar artefatos')}
                    </ActionButton>
                  )}
                  <ul className="plain-list">
                    {group.map((c) => (
                      <li key={c.key} className={c.problem ? 'off' : ''}>
                        {c.problem ? null : (
                          <Checkbox
                            aria-label={t('Importar {name}', { name: c.name })}
                            checked={picked.includes(c.key)}
                            onCheckedChange={(on) => toggle(c, on === true)}
                          />
                        )}{' '}
                        <b>{c.name}</b>
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
                        <span className="muted small"> {c.description || c.origin}</span>
                        {reasons[c.key] && <span className="muted small"> · {reasons[c.key]}</span>}
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

        <div className="form-actions">
          {inStep2 && (
            <ActionButton variant="soft" color="gray" hint={t('Volta para escolher outra origem.')} onClick={back}>
              {t('Voltar')}
            </ActionButton>
          )}
          <ActionButton variant="soft" color="gray" hint={t('Fecha sem importar nada.')} onClick={close}>
            {t('Fechar')}
          </ActionButton>
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
        </div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
