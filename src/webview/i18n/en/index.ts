// Dicionário pt-BR → inglês. Um arquivo por área da interface; o texto em português é a chave.
import { board } from './board';
import { card } from './card';
import { harness } from './harness';
import { host } from './host';
import { settings } from './settings';
import { shared } from './shared';
import { workflows } from './workflows';

export const EN: Record<string, string> = { ...shared, ...host, ...board, ...card, ...settings, ...workflows, ...harness };
