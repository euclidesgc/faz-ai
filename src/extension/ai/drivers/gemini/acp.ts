import { acpAgent } from '../../acp/agents';
import { acpDriver } from '../acp';

/**
 * Gemini CLI pelo ACP (`gemini --acp --skip-trust`), validado na 0.65.0. Por enquanto é o agente do
 * catálogo como os outros; o login pela chave de API (`authenticate` com `_meta`) entra aqui na história 7.
 */
export const geminiAcpDriver = acpDriver(acpAgent('gemini')!);
