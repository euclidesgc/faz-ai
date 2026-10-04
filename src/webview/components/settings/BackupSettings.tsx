import { Card } from '@radix-ui/themes';
import { useBoardStore } from '../../store/boardStore';
import { backup } from '../../commands';
import { t } from '../../i18n';
import { Button } from '../ui';
import { PageHeader } from './PageHeader';

/** Aba Backup: exportar o board num arquivo e importar um arquivo no lugar do board atual. */
export function BackupSettings() {
  const state = useBoardStore((s) => s.state)!;
  const busy = useBoardStore((s) => s.backupBusy);
  const setBusy = useBoardStore((s) => s.setBackupBusy);
  const running = state.aiRuns.length > 0 || state.cards.some((c) => c.status === 'running');
  const start = (what: 'export' | 'import') => {
    setBusy(what);
    if (what === 'export') backup.export();
    else backup.importPick();
  };

  return (
    <div>
      <PageHeader title={t('Backup')}>
        {t('Leve o board para outra máquina ou guarde uma cópia. O arquivo inclui configurações, cards, conversas e anexos.')}
      </PageHeader>

      <Card className="form-card" aria-label={t('Exportar')}>
        <h3>{t('Exportar')}</h3>
        <p className="muted">
          {t(
            'Gera um arquivo .fazai.json com tudo o que está neste board, inclusive cards arquivados e na lixeira. O arquivo contém as conversas e os anexos: guarde-o com cuidado.',
          )}
        </p>
        <div className="row">
          <Button variant="primary" disabled={busy !== null} onClick={() => start('export')}>
            {busy === 'export' ? t('Exportando…') : t('Exportar board')}
          </Button>
        </div>
      </Card>

      <Card className="form-card" aria-label={t('Importar')}>
        <h3>{t('Importar')}</h3>
        <p className="muted">
          {t(
            'Substitui o board atual pelo de um arquivo exportado, com os mesmos números de card. Você confirma depois de ver o resumo, e uma cópia de segurança do banco é gravada antes.',
          )}
        </p>
        <div className="row">
          <Button
            disabled={busy !== null || running}
            title={running ? t('Espere a execução da IA terminar') : undefined}
            onClick={() => start('import')}
          >
            {busy === 'import' ? t('Lendo o arquivo…') : t('Importar de um arquivo…')}
          </Button>
          {running && <span className="muted">{t('Espere a execução da IA terminar')}</span>}
        </div>
      </Card>
    </div>
  );
}
