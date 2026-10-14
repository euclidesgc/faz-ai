import { Button } from '@radix-ui/themes';
import type { AiTool } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';

/**
 * As pastas importadas da ferramenta, no topo de Importados. Tirar uma pasta da lista tira do board os
 * artefatos dela, depois de confirmar; os arquivos na pasta não são tocados.
 */
export function ImportedFolders({ tool }: { tool: AiTool }) {
  const dirs = useBoardStore((s) => s.state!.harnessImports).filter((x) => x.tool === tool);
  const ask = useBoardStore((s) => s.ask);
  return (
    <div className="imported-folders">
      <span className="muted small">{t('Pastas importadas:')}</span>
      <ul>
        {dirs.map((x) => (
          <li key={x.dir}>
            <code>{x.dir}</code>
            <Button
              variant="ghost"
              size="1"
              aria-label={t('Remover pasta: {dir}', { dir: x.dir })}
              onClick={() =>
                ask({
                  title: t('Remover a pasta importada?'),
                  message: t('{dir}\n\nOs artefatos dela saem do board e deixam de aparecer em Importados. A pasta em si não é tocada.', {
                    dir: x.dir,
                  }),
                  confirmLabel: t('Remover pasta'),
                  danger: true,
                  onConfirm: () => harness.removeImport(tool, x.dir),
                })
              }
            >
              {t('Remover pasta')}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
