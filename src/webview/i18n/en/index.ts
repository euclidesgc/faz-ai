// Dicionário pt-BR → inglês. Um arquivo por área da interface; o texto em português é a chave.
import { library } from './library';
import { board } from './board';
import { card } from './card';
import { defaults } from './defaults';
import { environment } from './environment';
import { harness } from './harness';
import { gitNotices, host, usageLimitNotices } from './host';
import { metrics } from './metrics';
import { settings } from './settings';
import { shared } from './shared';
import { workflows } from './workflows';

export const EN: Record<string, string> = {
  ...library,
  ...shared,
  ...host,
  ...board,
  ...card,
  ...settings,
  ...workflows,
  ...harness,
  ...metrics,
  ...environment,
};

/** Nomes do board padrão em inglês (ver ./defaults). */
export const DEFAULT_NAMES_EN = defaults;

/** Os avisos que o board escreve na conversa e a tela traduz: os do gitflow e os do limite de uso (ver ./host). */
export const BOARD_NOTICES_EN: Record<string, string> = { ...gitNotices, ...usageLimitNotices };
