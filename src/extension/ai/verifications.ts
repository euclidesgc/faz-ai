// A coordenação das verificações de capacidade de cada perfil no host (histórias 2, 3 e 7): uma verificação por
// perfil e por estado da chave de cada vez, e a verificação automática em segundo plano (ao ligar um agente ACP,
// na conferência do ambiente), que não roda por cima do Conectar. Saiu do `boardHost.ts` para ser testada com o
// `onProfileEnabled` de verdade do router (o caminho que ligava o perfil e verificava sem a chave, história 7).
import { isAcpProfile, type AiProfile } from '../../shared/aiProfiles';

export interface VerificationsDeps<R> {
  /** o perfil público */
  profile(id: string): AiProfile | null;
  /** roda a verificação (o verificador do host, com a chave do cofre lida na hora) */
  run(id: string): Promise<R>;
  /**
   * O estado da chave com que a verificação roda (um digest; `''` sem chave). Uma verificação em andamento só é
   * reaproveitada pelo mesmo estado: a que começou sem a chave não responde ao Conectar que acabou de guardá-la.
   */
  keyState(id: string): string;
  /** a prova gravada ainda vale para o vínculo atual do perfil */
  current(id: string): boolean;
  /** o Conectar do perfil está em andamento (ele faz a própria verificação) */
  busy(id: string): boolean;
  /** a frase do resultado, para o log */
  message(result: R): string;
  log(line: string): void;
  /** ao fim de cada verificação (o host confere o ambiente de novo, para o Diagnóstico ler as provas novas) */
  done?(): void;
  disposed?(): boolean;
}

export class Verifications<R> {
  private running = new Map<string, { key: string; promise: Promise<R> }>();

  constructor(private readonly deps: VerificationsDeps<R>) {}

  /** Há uma verificação do perfil em andamento (com qualquer estado da chave). */
  isRunning(id: string): boolean {
    return this.running.has(id);
  }

  /** A verificação com o resultado inteiro; pedida duas vezes com a mesma chave, roda uma vez só. */
  detailed(id: string): Promise<R> {
    const key = this.deps.keyState(id);
    const running = this.running.get(id);
    if (running && running.key === key) return running.promise;
    const promise: Promise<R> = this.deps.run(id).finally(() => {
      if (this.running.get(id)?.promise === promise) this.running.delete(id);
      this.deps.done?.();
    });
    this.running.set(id, { key, promise });
    return promise;
  }

  /**
   * A verificação que o host dispara sozinho, em segundo plano, com o resultado no log. Só o agente ACP (dois
   * handshakes, sem gastar a conta); o Claude verifica no Conectar e no Reconectar (a cópia, por "Verificar
   * capacidades" em Ferramentas de IA), porque a sonda dele roda a CLI quatro vezes. Não roda com a prova em vigor, com outra
   * verificação do perfil em andamento nem durante o Conectar dele.
   */
  inBackground(id: string, why: string): void {
    const meta = this.deps.profile(id);
    if (this.deps.disposed?.() || !meta || !meta.enabled || !isAcpProfile(meta) || this.running.has(id) || this.deps.busy(id)) return;
    if (this.deps.current(id)) return;
    this.detailed(id)
      .then((result) => this.deps.log(`Verificação de capacidades (${why}): ${this.deps.message(result)}`))
      .catch((e: unknown) =>
        this.deps.log(`Verificação de capacidades de ${meta.name} (${why}): ${e instanceof Error ? e.message : String(e)}`),
      );
  }
}
