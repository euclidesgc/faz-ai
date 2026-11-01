import type { FailureClass } from '../../../shared/failureClass';
import { t } from '../../i18n';

/** O nome da classe da falha (#1099). Literal em cada `t()`: o teste do dicionário lê o código. */
export const failureClassLabel = (c: FailureClass): string => {
  switch (c) {
    case 'transient':
      return t('transitória');
    case 'deterministic':
      return t('determinística');
    case 'budget':
      return t('limite de uso');
    case 'canceled':
      return t('cancelada');
  }
};
