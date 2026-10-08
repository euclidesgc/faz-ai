// A porta de IA dos testes: grava o log de uso num banco em memória, como o board de verdade, e deixa
// o teste dizer o que o "processo" da CLI faz. O log é obrigatório no `AiGateway`, então todo teste
// que executa a IA passa por aqui em vez de montar um executor sem log.
import type { Database } from 'sql.js';
import { AiGateway } from '../../src/extension/ai/gateway';
import type { SpawnFn } from '../../src/extension/aiOutput/measured';
import { createRunLog } from '../../src/extension/log/runLog';
import type { MessageRouter } from '../../src/extension/panel/messageRouter';

export function gatewayFor(router: MessageRouter, db: Database, spawn: SpawnFn, log?: (line: string) => void): AiGateway {
  return new AiGateway({ boardId: router.boardId, runLog: createRunLog(db, log), spawn });
}
