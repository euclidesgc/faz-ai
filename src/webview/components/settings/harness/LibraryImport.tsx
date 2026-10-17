import { useState } from 'react';
import { Badge, Checkbox, TextField } from '@radix-ui/themes';
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
  const [success, setSuccess] = useState(false);
  const scan = useAction(async () => {
    await harness.scanLibraryFolder(directory.trim());
    setSelected(null);
    setSuccess(false);
  });
  const pick = useAction(async () => {
    await harness.pickLibraryArtifacts();
    setSelected(null);
    setSuccess(false);
  });
  const keys = selected ?? preview?.items.map((i) => i.key) ?? [];
  const apply = useAction(async () => {
    await harness.applyLibraryImport(keys);
    setSelected(null);
    setSuccess(true);
  });
  return (
    <details className="harness-import">
      <summary>{t('Importar artefatos de uma pasta')}</summary>
      <p className="muted small">
        {t(
          'Escolha uma pasta de projeto ou coleção. O board identifica regras, skills, subagentes e MCPs e copia os itens selecionados para suas abas.',
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
          {Object.entries(ARTIFACT_LABELS).map(([kind, label]) => {
            const items = preview.items.filter((i) => i.kind === kind);
            return (
              <section key={kind}>
                <strong>
                  {t(label)} <Badge>{items.length}</Badge>
                </strong>
                {items.map((item) => (
                  <label className="row" key={item.key}>
                    <Checkbox
                      checked={keys.includes(item.key)}
                      onCheckedChange={(checked) => setSelected(checked ? [...keys, item.key] : keys.filter((key) => key !== item.key))}
                    />
                    <span className="library-import-label">
                      <span>{item.name}</span>
                      {item.origin && <span className="muted small">{item.origin}</span>}
                    </span>
                  </label>
                ))}
              </section>
            );
          })}
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
      {success && <p role="status">{t('Importação concluída. Os artefatos estão nas abas correspondentes.')}</p>}
    </details>
  );
}
