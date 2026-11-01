import { acpAgent } from '../../acp/agents';
import { acpDriver } from '../acp';

/**
 * Gemini CLI pelo ACP (`gemini --acp --skip-trust`), validado na 0.65.0. É o agente do catálogo como os
 * outros; o que o distingue é o login por chave de API pelo protocolo (`apiKeyAuth` em `acp/agents.ts`:
 * `authenticate` com `gemini-api-key` e a chave em `_meta["api-key"]`), que o driver anuncia como
 * `auth.kind === 'api-key'` e que o Conectar usa (história 7).
 */
export const geminiAcpDriver = acpDriver(acpAgent('gemini')!);
