import { useState } from 'react';
import { Badge, Checkbox, Tabs, TextField } from '@radix-ui/themes';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { useAction } from '../../../useAction';
import { ActionButton } from '../../ui';
import { isWeb } from '../../../vscode';
import { t } from '../../../i18n';

export const ARTIFACT_LABELS = { rule: 'Regras', skill: 'Skills', agent: 'Subagentes', mcp: 'MCPs' } as const;

/** Uma origem, quatro tipos: a pessoa vê o que será copiado antes de importar. */
export function LibraryImport() {
  const preview = useBoardStore((s) => s.state!.harness.library?.preview);
  const [directory, setDirectory] = useState('');
  const [selected, setSelected] = useState<string[] | null>(null);
  const result = useBoardStore((s) => s.state!.harness.library?.importResult);
  const [tab, setTab] = useState('rule');
  const [queries, setQueries] = useState<Record<string, string>>({});
  const scan = useAction(async () => {
    await harness.scanLibraryFolder(directory.trim());
    setSelected(null);
  });
  const pick = useAction(async () => {
    await harness.pickLibraryArtifacts();
    setSelected(null);
  });
  const keys = selected ?? preview?.items.map((i) => i.key) ?? [];
  const apply = useAction(async () => {
    await harness.applyLibraryImport(keys);
    setSelected(null);
  });
  return (
    <details className="harness-import">
      <summary>{t('Importar artefatos')}</summary>
      <p className="muted small">
        {t(
          'Escolha uma pasta de um projeto ou coleção em qualquer lugar. O board identifica regras, skills, subagentes e MCPs e faz uma cópia para biblioteca apenas dos itens que você selecionar.',
        )}
      </p>
      <div className="actions-toolbar">
        <TextField.Root
          aria-label={t('Pasta de origem')}
          placeholder={t('Caminho completo da pasta de origem')}
          value={directory}
          onChange={(e) => setDirectory(e.target.value)}
        />
        <ActionButton
          hint={t('Procura os quatro tipos de artefato nesta pasta.')}
          loading={scan.busy}
          disabled={!directory.trim()}
          disabledReason={t('Informe a pasta de origem.')}
          onClick={() => void scan.run()}
        >
          {t('Examinar pasta')}
        </ActionButton>
        {!isWeb && (
          <ActionButton
            variant="soft"
            hint={t('Escolhe a pasta pelo gerenciador de arquivos.')}
            loading={pick.busy}
            onClick={() => void pick.run()}
          >
            {t('Escolher pasta')}
          </ActionButton>
        )}
      </div>
      {preview && (
        <div className="draft-card library-import-preview">
          <p className="muted small">{preview.directory}</p>
          <div className="row wrap">
            <ActionButton
              size="1"
              variant="ghost"
              hint={t('Marca todos os artefatos da prévia.')}
              onClick={() => setSelected(preview.items.map((i) => i.key))}
            >
              {t('Selecionar todas')}
            </ActionButton>
            <ActionButton size="1" variant="ghost" hint={t('Desmarca todos os artefatos da prévia.')} onClick={() => setSelected([])}>
              {t('Limpar seleção')}
            </ActionButton>
          </div>
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List aria-label={t('Tipos de artefatos para importar')}>
              {Object.entries(ARTIFACT_LABELS).map(([kind, label]) => (
                <Tabs.Trigger key={kind} value={kind}>
                  {t(label)} <Badge>{preview.items.filter((i) => i.kind === kind).length}</Badge>
                </Tabs.Trigger>
              ))}
            </Tabs.List>
            {Object.entries(ARTIFACT_LABELS).map(([kind, label]) => {
              const query = (queries[kind] ?? '').toLocaleLowerCase();
              const items = preview.items.filter(
                (i) => i.kind === kind && `${i.name} ${i.description}`.toLocaleLowerCase().includes(query),
              );
              return (
                <Tabs.Content key={kind} value={kind}>
                  <TextField.Root
                    type="search"
                    aria-label={t('Filtrar {type}', { type: t(label) })}
                    placeholder={t('Filtrar por nome ou descrição…')}
                    value={queries[kind] ?? ''}
                    onChange={(e) => setQueries({ ...queries, [kind]: e.target.value })}
                  />
                  {items.map((item) => (
                    <label className="row" key={item.key}>
                      <Checkbox
                        checked={keys.includes(item.key)}
                        aria-label={item.name}
                        onCheckedChange={(checked) => setSelected(checked ? [...keys, item.key] : keys.filter((key) => key !== item.key))}
                      />
                      <span className="library-import-label">
                        <span>{item.name}</span>
                        {item.description && <span className="muted small">{item.description}</span>}
                        {item.origin && <span className="muted small">{item.origin}</span>}
                      </span>
                    </label>
                  ))}
                  {!items.length && <p className="muted small">{t('Nenhum artefato encontrado nesta aba.')}</p>}
                </Tabs.Content>
              );
            })}
          </Tabs.Root>
          {!preview.items.length && <p role="status">{t('Nenhum artefato reconhecido nesta pasta.')}</p>}
          <div className="form-actions">
            <ActionButton
              loading={apply.busy}
              disabled={!keys.length}
              disabledReason={t('Selecione ao menos um artefato.')}
              hint={t('Copia os itens selecionados para a biblioteca do board.')}
              onClick={() => void apply.run()}
            >
              {t('Importar selecionados ({n})', { n: keys.length })}
            </ActionButton>
          </div>
        </div>
      )}
      {result && (
        <div role="status">
          <p>{t('{n} artefatos importados com sucesso.', { n: result.imported })}</p>
          {!!result.skipped.length && (
            <>
              <p>{t('{n} artefatos com o mesmo nome já existiam na biblioteca e não foram importados:', { n: result.skipped.length })}</p>
              <ul>
                {Object.entries(ARTIFACT_LABELS).map(([kind, label]) => {
                  const items = result.skipped.filter((i) => i.kind === kind);
                  return items.length ? (
                    <li key={kind}>
                      {t(label)}
                      <ul>
                        {items.map((i) => (
                          <li key={i.key}>{i.name}</li>
                        ))}
                      </ul>
                    </li>
                  ) : null;
                })}
              </ul>
              <p>{t('Deseja repetir o processo e sobrescrever estes artefatos pelos novos que estão sendo importados agora?')}</p>
              <p>
                <strong>{t('ATENÇÃO: Esse processo é irreversível.')}</strong>
              </p>
              <ActionButton
                color="red"
                loading={apply.busy}
                hint={t('Substitui somente os artefatos ignorados nesta importação.')}
                onClick={() =>
                  useBoardStore.getState().ask({
                    title: t('Sobrescrever artefatos existentes?'),
                    message: t('ATENÇÃO: Esse processo é irreversível.'),
                    confirmLabel: t('Sobrescrever'),
                    onConfirm: () =>
                      harness.applyLibraryImport(
                        result.skipped.map((i) => i.key),
                        true,
                      ),
                  })
                }
              >
                {t('Sobrescrever artefatos ignorados')}
              </ActionButton>
            </>
          )}
        </div>
      )}
      {(scan.error || pick.error || apply.error) && <p role="alert">{scan.error || pick.error || apply.error}</p>}
    </details>
  );
}
