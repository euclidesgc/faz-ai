// Dicionário pt-BR → inglês. Um arquivo por área da interface; o texto em português é a chave.
import { board } from './board';
import { card } from './card';
import { defaults } from './defaults';
import { harness } from './harness';
import { host } from './host';
import { metrics } from './metrics';
import { settings } from './settings';
import { shared } from './shared';
import { workflows } from './workflows';

export const EN: Record<string, string> = { ...shared, ...host, ...board, ...card, ...settings, ...workflows, ...harness, ...metrics };

/** Nomes do board padrão em inglês (ver ./defaults). */
export const DEFAULT_NAMES_EN = defaults;
