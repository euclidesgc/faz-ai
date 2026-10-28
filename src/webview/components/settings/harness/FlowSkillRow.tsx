import { Badge } from '@radix-ui/themes';
import { useBoardStore } from '../../../store/boardStore';
import { t } from '../../../i18n';

/** Uma skill do fluxo que a extensão entrega pelo `get_skill` e não está na biblioteca: só para leitura. */
export function FlowSkillRow({ name, description }: { name: string; description: string }) {
  return (
    <li className="item-row artifact-row">
      <span className="item-check" />
      <div className="item-main">
        <div className="item-title">
          <button
            type="button"
            className="path-link item-name"
            title={t('Abre o texto só para leitura')}
            onClick={() => useBoardStore.getState().openHarnessFile({ kind: 'skill', name })}
          >
            {name}
          </button>
          <Badge color="gray" variant="outline" title={t('Vem com o board e acompanha a versão da extensão: só de leitura.')}>
            {t('de fábrica')}
          </Badge>
        </div>
        <p className="item-hint" title={description}>
          {description}
        </p>
      </div>
      <div className="row-actions">
        <Badge color="gray" variant="outline" title={t('O board entrega esta skill pelo get_skill, com o texto desta versão da extensão.')}>
          {t('Entregue pelo board')}
        </Badge>
      </div>
    </li>
  );
}
