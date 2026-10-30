// No pool `forks` (o padrão do Vitest) cada worker é um processo filho ligado ao Vitest principal por IPC,
// e o tinypool não escuta o fim desse canal. Se o principal cai à força (o comando do terminal da IA estoura
// o tempo e é morto), o worker fica órfão rodando testes e prendendo CPU e memória por muito tempo. Com o
// canal fechado não há mais a quem entregar o resultado: o worker sai.
const state = globalThis as { __fazaiWorkerParent__?: boolean };
if (process.send && !state.__fazaiWorkerParent__) {
  // o setup roda a cada arquivo de teste no mesmo processo: um ouvinte só
  state.__fazaiWorkerParent__ = true;
  // não pelo `process.exit`: o Vitest o troca no worker por um aviso ao principal, que já não existe, e o
  // worker entra num laço tentando entregá-lo
  process.once('disconnect', () => process.kill(process.pid, 'SIGKILL'));
}
