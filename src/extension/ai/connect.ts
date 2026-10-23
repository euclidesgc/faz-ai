// O Conectar no host (épica "ferramenta por modo", história 7): `connect(profileId)` leva um perfil do
// catálogo de "a pessoa clicou em Conectar" a "Conectada", passo a passo, pelo driver da ferramenta:
//
//   locate → login (a chave de API no cofre e o `authenticate` do agente, ou a sonda de login da CLI) →
//   verify (as sondas de capacidade gravam as provas do perfil; o regime sai delas) → ciência (só no regime
//   compatível; grava a revisão do perfil) → modelos (o catálogo lido da ferramenta, com a data) → Conectada
//
// O que depende do host (processos, cofre, banco, verificador) chega por `ConnectorDeps`; o fluxo é o mesmo
// para toda ferramenta, e a diferença entre elas é o `auth` do driver. Um passo que espera a pessoa (a chave,
// a ciência) para o fluxo com `waiting`; um erro fica preso ao passo (`failed`), e "Tentar de novo" chama
// `connect` outra vez. A chave nunca volta: nem no estado publicado, nem no erro (que passa por `redact`).
import { isAcpProfile, isReadyProfile, modeLabel, verifiableProfile, type AiProfile } from '../../shared/aiProfiles';
import { toolModeEntry, type ToolMode } from '../../shared/aiTools';
import { regimeFromEvidence, type ConnectInput, type ConnectState, type ConnectStep, type ConnectSummary } from '../../shared/connect';
import type { CapabilityEvidence } from '../../shared/executionAdmission';
import { parseApiKey } from '../toolKeys';
import type { AcpAuth } from './acp/provider';
import { acpLoginHint } from './acp/provider';
import { acpAgent } from './acp/agents';
import { driverFor, type ToolDriver } from './drivers';

export type { ConnectInput } from '../../shared/connect';

export interface ConnectorDeps {
  /** o perfil público (sem o cofre) */
  profile(id: string): AiProfile | null;
  /** liga o perfil (é a revisão do perfil pronto): sem isso nada dele roda nem é sondado */
  enable(id: string): void;
  /** o perfil com o cofre aplicado, para o host resolver o comando e sondar */
  resolve(id: string): AiProfile;
  /** o executável do perfil no PATH do terminal (e nas pastas de instalação usuais), ou null */
  locate(profile: AiProfile): string | null;
  version(profile: AiProfile, executable: string): Promise<string | null>;
  /** a sonda de login da CLI (`login-command`) */
  signedIn(profile: AiProfile, executable: string): Promise<boolean | null>;
  /** o cofre das chaves por ferramenta (`ToolKeys`): a chave nova só entra depois de aceita (`replace`) */
  keys: { get(tool: string): string | null; replace(tool: string, apiKey: string, accept: (key: string) => Promise<void>): Promise<void> };
  /** entrega a chave ao agente pelo `authenticate` (`acpSignIn`); lança com o motivo quando ele recusa */
  authenticate(profile: AiProfile, executable: string, auth: AcpAuth): Promise<void>;
  /**
   * No modo API (história 10): confere a chave na hora com a API, por uma chamada que não gasta a conta (a
   * lista de modelos); devolve quantos modelos a conta tem. Lança com o motivo quando a API recusa.
   */
  checkApiKey(profile: AiProfile, apiKey: string): Promise<number>;
  /** grava o modo do perfil pronto (o cartão escolhido: um perfil por ferramenta, com o modo trocável) */
  setMode(profileId: string, mode: ToolMode): void;
  /** as sondas de capacidade do perfil, gravando as provas no vínculo dele (`BoardHost.verifyExecutor`) */
  verify(profileId: string): Promise<{ evidence: CapabilityEvidence[]; authRequired?: boolean }>;
  /** a revisão da ciência já gravada para o perfil, ou null */
  reviewOf(profileId: string): number | null;
  /** grava a ciência do perfil e devolve a revisão nova */
  recordReview(profileId: string): number;
  /** tira a ciência do perfil (ele provou o exclusivo, ou a pessoa a revogou) */
  revokeReview(profileId: string): void;
  /** lê os modelos da ferramenta e os junta ao catálogo; null quando ela não lista (vale a lista embutida) */
  listModels(profile: AiProfile, executable: string): Promise<number | null>;
  /** grava o resumo da conexão concluída (versão, login, regime, modelos, data) */
  save(profileId: string, summary: ConnectSummary): void;
  /** o resumo da última conexão concluída, gravado */
  saved(profileId: string): ConnectSummary | null;
  /** publica o estado para a tela a cada passo */
  publish(state: ConnectState): void;
  /** mascara o que o cofre conhece (as chaves) numa mensagem */
  redact(text: string): string;
  log?(line: string): void;
  now?(): number;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export class Connector {
  /** a última conexão de cada perfil nesta sessão (a em curso, a que espera a pessoa, a que falhou) */
  private states = new Map<string, ConnectState>();
  private running = new Map<string, Promise<ConnectState>>();

  constructor(private readonly deps: ConnectorDeps) {}

  /** Um Conectar deste perfil está em andamento: o host não dispara a verificação automática por cima dele. */
  active(profileId: string): boolean {
    return this.running.has(profileId);
  }

  /** O estado de cada perfil: a conexão desta sessão ou, sem ela, a última concluída que ficou gravada. */
  snapshot(profileIds: readonly string[]): Record<string, ConnectState> {
    const out: Record<string, ConnectState> = {};
    for (const id of profileIds) {
      const live = this.states.get(id);
      const saved = live ? null : this.deps.saved(id);
      if (live) out[id] = live;
      else if (saved) out[id] = { profileId: id, step: 'models', status: 'connected', summary: saved };
    }
    return out;
  }

  /**
   * Conecta (ou reconecta) o perfil. Dois cliques seguidos viram uma conexão só. O perfil fica marcado como "em
   * conexão" antes de qualquer efeito (ligar o perfil, guardar a chave): ligar dispara, no mesmo instante, a
   * verificação automática do host, que precisa saber que o Conectar faz a dele.
   */
  connect(profileId: string, input: ConnectInput = {}): Promise<ConnectState> {
    const running = this.running.get(profileId);
    if (running) return running;
    const done = Promise.resolve()
      .then(() => this.flow(profileId, input))
      .finally(() => this.running.delete(profileId));
    this.running.set(profileId, done);
    return done;
  }

  /**
   * De onde o fluxo retoma: depois de um passo que espera a pessoa (a ciência) ou que falhou depois do login
   * (a ciência, os modelos), com o resumo que já tinha; a chave e a sondagem não se refazem. Uma chave nova
   * colada recomeça do login.
   */
  private resumeFrom(previous: ConnectState | undefined, input: ConnectInput): 'review' | 'models' | null {
    if (!previous || input.apiKey !== undefined || !previous.summary.signIn) return null;
    if (previous.step === 'review' && (previous.status === 'waiting' || previous.status === 'failed')) return 'review';
    if (previous.step === 'models' && previous.status === 'failed') return 'models';
    return null;
  }

  private async flow(profileId: string, input: ConnectInput): Promise<ConnectState> {
    const { deps } = this;
    const meta = deps.profile(profileId);
    if (!meta) throw new Error(`Perfil indisponível neste board: ${profileId}.`);
    // o Conectar é do perfil pronto do catálogo (o id é a ferramenta); cópias e personalizados seguem pelo formulário
    if (!isReadyProfile(meta))
      throw new Error(`${meta.name}: o Conectar é das ferramentas do catálogo; o perfil personalizado segue pelo formulário.`);
    // o modo é o do cartão em que a pessoa clicou (um perfil por ferramenta, com o modo trocável): só um que a
    // extensão oferece para a ferramenta, e o perfil só passa a ele depois de o login ter dado certo
    const mode = input.mode ?? meta.mode;
    if (!toolModeEntry(meta.tool, mode)) throw new Error(`${meta.name}: o modo ${modeLabel(mode)} não é oferecido nesta versão.`);
    const driver = driverFor(meta.tool, mode);
    if (!driver) throw new Error(`${meta.name}: o Conectar é das ferramentas do catálogo; o perfil personalizado segue pelo formulário.`);
    // trocar de modo recomeça do início: o login e a verificação do outro modo não valem para este
    const resume = mode === meta.mode ? this.resumeFrom(this.states.get(profileId), input) : null;
    const state: ConnectState = {
      profileId,
      mode,
      step: 'locate',
      status: 'running',
      summary: resume ? { ...this.states.get(profileId)!.summary } : {},
    };
    const publish = () => {
      this.states.set(profileId, structuredClone(state));
      deps.publish(structuredClone(state));
    };
    const enter = (step: ConnectStep) => {
      state.step = step;
      state.status = 'running';
      delete state.error;
      delete state.needs;
      publish();
    };
    const stop = (status: 'waiting' | 'failed', extra: Partial<ConnectState> = {}): ConnectState => {
      Object.assign(state, { status }, extra);
      if (state.error) state.error = deps.redact(state.error);
      publish();
      deps.log?.(
        `Conectar ${meta.name}: ${status === 'failed' ? `falhou no passo ${state.step}` : `espera a pessoa no passo ${state.step}`}${state.error ? ` (${state.error})` : ''}.`,
      );
      return structuredClone(state);
    };
    try {
      // o perfil pronto vem do código (a configuração dele é a do catálogo): as sondas rodam nele como se ligado,
      // e ele só é ligado de fato depois de a ferramenta ser achada e de o login ter o que precisa (a chave no
      // cofre). Ligar antes faria a verificação automática do host correr sem a chave
      const probe: AiProfile = { ...meta, enabled: true, mode };
      enter('locate');
      // o modo API não tem binário: quem fala com a rede é a extensão, e não há versão da ferramenta a ler
      const api = driver.transport === 'api';
      const executable = api ? '' : deps.locate(probe);
      if (!api && !executable)
        return stop('failed', {
          error: `O comando \`${driver.command}\` do ${meta.name} não está no PATH. Instale pela página oficial e tente de novo.`,
          docs: driver.docs,
        });
      if (!resume) {
        state.summary.version = api ? null : await deps.version(probe, executable!);
        const step = { state, enter, stop };
        const signIn = await this.signIn(driver, probe, executable!, input, step);
        if (signIn) return signIn;
        if (mode !== meta.mode) deps.setMode(profileId, mode);
        if (!deps.profile(profileId)?.enabled) deps.enable(profileId);
        enter('verify');
        const verified = await this.verify(driver, deps.resolve(profileId), step);
        if (verified) return verified;
      } else if (!deps.profile(profileId)?.enabled) deps.enable(profileId);
      const profile = deps.resolve(profileId);
      if (resume !== 'models') {
        enter('review');
        const existing = deps.reviewOf(profileId);
        if (state.summary.regime === 'compatible') {
          // a ciência só é gravada uma vez por conexão: "Tentar de novo" depois dela não sobe a revisão
          const reviewed = existing ?? (input.acknowledge ? deps.recordReview(profileId) : null);
          if (!reviewed) return stop('waiting', { needs: 'review' });
          state.summary.reviewed = reviewed;
        } else {
          // o perfil que agora prova o exclusivo perde a ciência antiga: ela o deixaria rodar no compatível
          if (existing && state.summary.regime === 'exclusive') deps.revokeReview(profileId);
          state.summary.reviewed = null;
        }
      }
      enter('models');
      state.summary.models = await deps.listModels(profile, executable!);
      const summary: ConnectSummary = {
        version: state.summary.version ?? null,
        signIn: state.summary.signIn ?? 'unverified',
        regime: state.summary.regime ?? null,
        reviewed: state.summary.reviewed ?? null,
        models: state.summary.models ?? null,
        at: deps.now?.() ?? Date.now(),
      };
      deps.save(profileId, summary);
      state.summary = summary;
      state.status = 'connected';
      publish();
      deps.log?.(`Conectar ${meta.name}: conectada.`);
      return structuredClone(state);
    } catch (e) {
      return stop('failed', { error: message(e) });
    }
  }

  /** O passo do login, pelo `auth` do driver; devolve o estado quando o fluxo para aqui. */
  private async signIn(
    driver: ToolDriver,
    profile: AiProfile,
    executable: string,
    input: ConnectInput,
    { state, enter, stop }: Step,
  ): Promise<ConnectState | null> {
    const { deps } = this;
    enter('signIn');
    const auth = driver.auth;
    if (auth.kind === 'api-key') {
      // quem aceita a chave: no ACP, o `authenticate` do agente (que não consulta a rede); no modo API, a
      // própria API, numa chamada que não gasta a conta (a lista de modelos), então a chave fica conferida
      const methodId = auth.methodId;
      const accept = async (apiKey: string): Promise<void> => {
        try {
          if (driver.transport === 'api') await deps.checkApiKey(profile, apiKey);
          else if (methodId) await deps.authenticate(profile, executable, { methodId, apiKey });
          else throw new Error(`${profile.name}: o login por chave não tem método neste modo.`);
        } catch (e) {
          // a chave recusada não chega ao cofre, então a ocultação dele não a conhece: mascara aqui
          throw new Error(message(e).split(apiKey).join('[credencial local]'));
        }
      };
      try {
        if (input.apiKey !== undefined) {
          const parsed = parseApiKey(input.apiKey);
          if ('error' in parsed) return stop('waiting', { needs: 'api-key', error: parsed.error });
          // a chave nova só entra no cofre depois de aceita: recusada, a anterior continua como estava
          await deps.keys.replace(driver.tool, parsed.key, accept);
        } else {
          const stored = deps.keys.get(driver.tool);
          if (!stored) return stop('waiting', { needs: 'api-key' });
          await accept(stored);
        }
      } catch (e) {
        // a recusa (ou a rede fora do ar): o campo volta para a pessoa conferir ou trocar a chave
        return stop('waiting', { needs: 'api-key', error: message(e) });
      }
      state.summary.signIn = driver.transport === 'api' ? 'api-key-checked' : 'api-key';
      return null;
    }
    if (auth.kind === 'login-command') {
      const signedIn = await deps.signedIn(profile, executable);
      if (signedIn === false)
        return stop('failed', {
          error: `Entre na conta do ${profile.name} no terminal (\`${auth.command}\`) e tente de novo.`,
          command: auth.command,
        });
      state.summary.signIn = signedIn ? 'signed-in' : 'unverified';
      return null;
    }
    // o agente ACP sem login por chave entra pelo terminal; a verificação diz se ele recusa a sessão
    state.summary.signIn = 'unverified';
    return null;
  }

  /** O passo da verificação: grava as provas e tira o regime delas; devolve o estado quando o fluxo para aqui. */
  private async verify(driver: ToolDriver, profile: AiProfile, { state, enter, stop }: Step): Promise<ConnectState | null> {
    const summary = state.summary;
    // o modo API é exclusivo por construção: não há processo da ferramenta a sondar. A prova é de um modelo
    // (o do card), e o host a afirma e assina na primeira execução com ele (`ExecutionAdmission.prepare`)
    if (driver.transport === 'api') {
      summary.regime = 'exclusive';
      return null;
    }
    // sem sonda de capacidades (Cursor, Kimi Code): o regime não se aplica, e a ciência também não
    if (!verifiableProfile(profile)) {
      summary.regime = null;
      return null;
    }
    const result = await this.deps.verify(profile.id);
    if (result.authRequired) {
      const agent = isAcpProfile(profile) ? acpAgent(String(profile.config.acpAgent)) : undefined;
      if (driver.auth.kind === 'api-key') {
        enter('signIn');
        return stop('waiting', {
          needs: 'api-key',
          error: `${profile.name} recusou a sessão com a chave guardada. Confira a chave e tente de novo.`,
        });
      }
      return stop('failed', { error: agent ? acpLoginHint(agent) : `${profile.name} pede login.` });
    }
    const regime = regimeFromEvidence(driver.transport, result.evidence);
    if (!regime.regime)
      return stop('failed', {
        error: `${profile.name}: a verificação de capacidades não passou. Pendentes: ${regime.pending.join(', ') || 'checks ausentes'}.`,
      });
    summary.regime = regime.regime;
    return null;
  }
}

/** O que cada passo recebe do fluxo: o estado que ele preenche, a entrada num passo e a parada. */
interface Step {
  state: ConnectState;
  enter(step: ConnectStep): void;
  stop(status: 'waiting' | 'failed', extra?: Partial<ConnectState>): ConnectState;
}
