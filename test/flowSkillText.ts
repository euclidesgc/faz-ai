import { FLOW_SKILLS } from '../src/extension/flowSkill';

/** O texto de todas as skills do fluxo (a principal e as por assunto), para os testes que conferem uma regra sem importar em qual delas ela está. */
export const FLOW_TEXT = FLOW_SKILLS.map((k) => k.body).join('\n');
