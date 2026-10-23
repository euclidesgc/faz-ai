import { policies } from './policies';
// Dicionário pt-BR → inglês. Um arquivo por área da interface; o texto em português é a chave.
import { library } from './library';
import { board } from './board';
import { card } from './card';
import { defaults } from './defaults';
import { environment } from './environment';
import { harness } from './harness';
import { gitNotices, host } from './host';
import { metrics } from './metrics';
import { settings } from './settings';
import { shared } from './shared';
import { workflows } from './workflows';
import { connect } from './connect';

export const EN: Record<string, string> = {
  ...library,
  ...policies,
  ...shared,
  ...host,
  ...board,
  ...card,
  ...settings,
  ...workflows,
  ...harness,
  ...metrics,
  ...environment,
  ...connect,
};

/** Nomes do board padrão em inglês (ver ./defaults). */
export const DEFAULT_NAMES_EN = defaults;

/** Os avisos do gitflow que o board escreve na conversa (ver gitNotices em ./host). */
export const GIT_NOTICES_EN = gitNotices;
