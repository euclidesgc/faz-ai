import { CARD_STATUSES, OWNER_LABEL } from '../../../../shared/status';
import { useBoardStore } from '../../../store/boardStore';
import { settings } from '../../../commands';
import { t } from '../../../i18n';
import { ContrastHint } from '../ColorPreview';
import { StatusBadge } from '../../StatusBar';
import { TextField } from '@radix-ui/themes';
import { SectionHeader } from '../SectionHeader';

/** Tabela de rótulo/cor dos status dos cards: os status são fixos, só o nome e a cor são ajustáveis. */
export function StatusesSettings() {
  const appearance = useBoardStore((s) => s.state)!.board.appearance;
  const set = (patch: Partial<typeof appearance>) => settings.updateBoard({ appearance: patch });

  return (
    <div>
      <SectionHeader title={t('Status dos cards')}>
        {t('Os status são fixos, porque as regras do board dependem deles; o nome e a cor de cada um podem ser ajustados.')}
      </SectionHeader>
      <table className="table">
        <thead>
          <tr>
            <th>{t('Status')}</th>
            <th>{t('Nome')}</th>
            <th>{t('Cor')}</th>
            <th>{t('Com quem fica')}</th>
          </tr>
        </thead>
        <tbody>
          {CARD_STATUSES.map((s) => {
            const style = appearance.statuses[s.id];
            const patch = (v: Partial<typeof style>) => set({ statuses: { ...appearance.statuses, [s.id]: { ...style, ...v } } });
            return (
              <tr key={s.id}>
                <td>
                  <StatusBadge status={s.id} />
                </td>
                <td>
                  <TextField.Root
                    aria-label={t('Nome do status {id}', { id: s.id })}
                    key={style.label}
                    defaultValue={style.label}
                    onBlur={(e) =>
                      e.target.value.trim() && e.target.value.trim() !== style.label && patch({ label: e.target.value.trim() })
                    }
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    aria-label={t('Cor do status {id}', { id: s.id })}
                    value={style.color}
                    onChange={(e) => patch({ color: e.target.value })}
                  />
                  <ContrastHint color={style.color} onPick={(color) => patch({ color })} />
                </td>
                <td className="muted">
                  {t(OWNER_LABEL[s.owner])} — {t(s.hint).toLowerCase()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
