/**
 * O Heartbeat está ligado? Lê o mesmo lugar que o agendador (`tick` e `nextRoundAt`), para o texto que o board
 * escreve e a rodada automática nunca divergirem. Uma rodada pedida à mão (`runNow`) não depende dele.
 */
export function heartbeatOn(ctx: { board: { runner: { heartbeat: boolean } } }): boolean {
  return ctx.board.runner.heartbeat;
}
