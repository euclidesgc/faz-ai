// O contrato de conexão (épica "ferramenta por modo", história 5): o que a sonda, os requisitos, o
// Diagnóstico e a leitura de modelos precisam saber de uma ferramenta num modo, sem executar nada. Há
// um driver por (ferramenta, modo), em `drivers/<ferramenta>/<modo>.ts`, e o registro `driverFor` em
// `drivers/index.ts`; o catálogo da tela é `TOOLS` (`src/shared/aiTools.ts`). A execução (`run`,
// `bindingContext`) é o outro contrato, o `Executor` (história 6), que todo driver também cumpre. A
// verificação de capacidades segue no verificador do host (`capabilityVerifier.ts`), chamado pelo Conectar
// (`ai/connect.ts`, história 7); a classificação de falhas (`classifyFailure`) é da história 12.
import type { InstallStep } from '../../../shared/environment';
import type { ModeEnforcement, ToolMode } from '../../../shared/aiTools';
import type { AiProfile } from '../../../shared/aiProfiles';
import type { ExecutionTransport } from '../../../shared/executionAdmission';
import type { ModelOption } from '../../../shared/models';
import type { FailureClass, ToolFailure } from '../../../shared/usageLimit';
import type { CliRun } from '../../cliRun';
import type { HeadlessCommand, HeadlessInput } from '../../headless';
import type { Measured, MeasuredDeps } from '../../aiOutput/measured';
import type { AcpSpawnFn } from '../acp/provider';
import type { AiMeasure } from '../provider';

/**
 * Como se entra na conta da ferramenta: um comando no terminal (as CLIs prontas), o login do agente ACP no
 * terminal (`acp-authenticate`, os agentes sem login por chave) ou a chave de API (`api-key`): a pessoa a
 * cola na tela do Conectar e o host a guarda no cofre (`ToolKeys`, por ferramenta, a mesma nos modos). No
 * agente ACP, o host a entrega no `authenticate` do protocolo (`methodId`), em cada processo, e o `terminal`
 * é o login alternativo da ferramenta. No modo API (história 10) não há agente: quem usa a chave é o próprio
 * board, e o Conectar a confere na hora com a API (`checkApiKey`); `docs` é a página onde se cria a chave.
 */
export type DriverAuth =
  | { kind: 'login-command'; command: string }
  | { kind: 'acp-authenticate'; terminal: string }
  | { kind: 'api-key'; methodId: string; terminal: string }
  | { kind: 'api-key'; methodId?: undefined; docs: string };

/** O que a sonda de login recebe do host: tudo já com o perfil aplicado, para o driver não ver segredos à toa. */
export interface SignInProbe {
  homeDir: string;
  /** roda um comando de consulta da CLI do perfil (executável, ambiente e revisão do perfil já aplicados) */
  query(args: string[]): Promise<CliRun>;
  /** o ambiente próprio do perfil (só a cópia de uma CLI pronta), para a ferramenta que lê uma pasta de dados */
  env?: Record<string, string>;
  /** a chave da ferramenta está no cofre (só a presença; o valor nunca chega à sonda) */
  hasApiKey?: boolean;
}

export interface ConnectionDriver {
  readonly tool: string;
  readonly mode: ToolMode;
  /** o comando que a instalação deixa no PATH */
  readonly command: string;
  /** o executável no PATH (e nas pastas de instalação usuais), ou null */
  locate(pathEnv: string | undefined, homeDir: string): string | null;
  /** os argumentos que fazem a CLI dizer a versão */
  readonly versionArgs: readonly string[];
  /** a página oficial de instalação */
  readonly docs: string;
  /** os comandos oficiais que instalam a ferramenta; vazio quando só a página explica */
  install(platform: 'unix' | 'windows'): InstallStep[];
  readonly auth: DriverAuth;
  /** se a conta está conectada; null quando o modo não tem como dizer */
  signedIn(probe: SignInProbe): Promise<boolean | null>;
  /** os modelos da conta, quando a ferramenta os lista por comando; ausente quando não lista */
  listModels?(executable: string, pathEnv: string | undefined): Promise<ModelOption[]>;
  /**
   * Os modelos da conta pela API, com a chave: o modo API e o Gemini pela CLI (que não tem comando que liste
   * modelos). É também a conferência da chave no Conectar (uma chamada que não gasta a conta); lança com o
   * motivo quando a API recusa.
   */
  apiModels?(apiKey: string): Promise<ModelOption[]>;
  /** o que o gateway promete medir: custo, tokens ou nada */
  readonly measure: AiMeasure;
  /** o que o board impõe neste modo: a linha do catálogo (`TOOLS`) */
  readonly enforcement: ModeEnforcement;
}

/**
 * O que o gateway entrega ao driver para uma execução. Os dois `spawn` já vêm com as conferências do
 * gateway (a admissão revalida o comando, o snapshot e a sessão MCP antes de cada tentativa): o driver
 * escolhe o do seu transporte e nunca inicia um processo por conta própria.
 */
export interface ExecutorContext extends Pick<MeasuredDeps, 'log' | 'runId' | 'leaseCoordinationDir' | 'execManifest'> {
  /** o perfil resolvido, com o cofre aplicado */
  profile: AiProfile;
  cwd: string;
  /** inicia o comando de uma CLI de uma passada */
  spawn: MeasuredDeps['spawn'];
  /** inicia um agente ACP com a entrada aberta; ausente no host sem o transporte */
  spawnAcp?: AcpSpawnFn;
  /**
   * A chave de API da ferramenta, lida do cofre pelo gateway, para o driver com `auth.kind === 'api-key'`.
   * Não entra no log: o gateway a mascara em toda linha. No ACP não entra no vínculo; no modo API só o
   * digest dela entra, pelo `bindingContext` (a admissão o recebe do mesmo cofre).
   */
  apiKey?: string;
  /**
   * As conferências do gateway antes de cada pedido ao modelo no modo API (o par dos `spawn` acima, que
   * não existem nele): o vínculo admitido não mudou, o snapshot dos artefatos segue válido e a sessão MCP
   * da execução não foi revogada. Lança quando algo mudou; o driver para sem mandar o pedido.
   */
  beforeRequest?(): void;
}

/**
 * A parte do vínculo de isolamento que é da ferramenta: o que a linha de comando fixa e qual executável
 * resolver. O resto do vínculo (a identidade do host, o digest do binário, o ambiente filtrado, as
 * políticas gerenciadas, a pasta) é o mesmo para toda ferramenta e fica na admissão, que canoniza e faz o
 * hash: um driver não tem como esquecer o binário e enfraquecer a prova.
 */
export type BindingInvocation = ProcessBinding | ApiBinding;

/** O vínculo de quem roda um processo da ferramenta (a CLI e o agente ACP). */
export interface ProcessBinding {
  /** entra no vínculo como `invocation`, exatamente como é */
  invocation: object;
  /** o comando a resolver no PATH (o executável real e o digest dele entram no vínculo) */
  command: string;
  /** o PATH próprio do comando, quando o perfil o define; senão o do host */
  pathEnv?: string;
  /** onde mais procurar o executável (o mesmo `lookup` do comando) */
  lookup?: HeadlessCommand['lookup'];
  /** as variáveis próprias do comando, que entram no ambiente do vínculo mesmo fora da lista relevante */
  env?: Record<string, string>;
}

/**
 * O vínculo do modo API, sem executável: não há processo da ferramenta, binário nem linha de comando. O
 * que prende a prova é para onde o board fala e com que código: o endpoint, o modelo, a versão da
 * extensão (é o laço dela que cumpre os checks por construção) e o digest da chave. Montado por
 * `apiBinding` (`ai/apiBinding.ts`), que nunca guarda a chave.
 */
export interface ApiBinding {
  api: ApiInvocation;
}
export interface ApiInvocation {
  transport: 'api';
  endpoint: string;
  model: string;
  extensionVersion: string;
  /** HMAC da chave com um rótulo fixo; a chave em si nunca entra */
  keyDigest: string;
}

/**
 * O contrato de execução: como a ferramenta roda num modo e o que, nesse modo, prende uma prova de
 * capacidade. O gateway chama `run` (o ciclo do log, a admissão e o cancelamento são dele); a admissão
 * chama `bindingContext`.
 */
export interface Executor {
  /** o transporte que roda de fato, o mesmo que a admissão confere */
  readonly transport: ExecutionTransport;
  run(input: HeadlessInput, ctx: ExecutorContext): Measured;
  /**
   * A parte da ferramenta no vínculo, para uma entrada (o prompt já vem trocado pelo marcador) e uma
   * pasta (null no vínculo de isolamento, que vale para qualquer pasta de projeto).
   */
  bindingContext(input: HeadlessInput, ctx: { profile: AiProfile; cwd: string | null; apiKey?: string | null }): BindingInvocation;
  /**
   * Só no modo API: os checks de `API_CAPABILITY_CHECKS` que o laço do driver cumpre de fato para esta
   * entrada. O host afirma e assina por construção (`recordByConstruction`) só estes; um check que o laço
   * não cumpre fica sem recibo, e a capacidade sai parcial, em vez de uma promessa assinada.
   */
  guarantees?(input: HeadlessInput): readonly string[];
  /**
   * Se a falha que a ferramenta devolveu é o limite de uso, e até quando (história 12). É a mesma função que o
   * leitor do modo usa para ligar `usageLimitReached` e `usageLimitHint` no relatório: os três modos do Gemini
   * falam da mesma cota da API e classificam igual (`gemini/limit.ts`). Ausente: o leitor da ferramenta
   * decide sozinho (o Claude Code lê o `rate_limit_event`, o Kimi Code a frase do plano) ou não há limite
   * reconhecido (o Cursor e os demais agentes ACP).
   */
  classifyFailure?(failure: ToolFailure): FailureClass;
}

/** Um driver: a conexão e a execução de uma ferramenta num modo. */
export interface ToolDriver extends ConnectionDriver, Executor {}
