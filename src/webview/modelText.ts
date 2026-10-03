import type { FieldValue } from '../shared/model';
import { modelDisplay as display, type ModelOption } from '../shared/models';
import { t } from './i18n';

/** Texto de um valor de modelo na interface, com o esforço no idioma atual (ex.: "Haiku 4.5 - low"). */
export const modelDisplay = (catalog: ModelOption[], value: FieldValue | undefined, withTool = false): string =>
  display(catalog, value, withTool, t);
