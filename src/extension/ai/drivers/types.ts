// O contrato de conexão (épica "ferramenta por modo", história 5): o que a sonda, os requisitos, o
// Diagnóstico e a leitura de modelos precisam saber de uma ferramenta num modo, sem executar nada. Há
// um driver por (ferramenta, modo), em `drivers/<ferramenta>/<modo>.ts`, e o registro `driverFor` em
// `drivers/index.ts`; o catálogo da tela é `TOOLS` (`src/shared/aiTools.ts`). A execução (`run`,
// `bindingContext`) é o outro contrato, o `Executor`, da história 6. A verificação de capacidades
// (`verify`) e a classificação de falhas (`classifyFailure`) entram no driver nas histórias 7 e 12.
import type { InstallStep } from '../../../shared/environment';
import type { ModeEnforcement, ToolMode } from '../../../shared/aiTools';
import type { ModelOption } from '../../../shared/models';
import type { CliRun } from '../../cliRun';
import type { AiMeasure } from '../provider';

/**
 * Como se entra na conta da ferramenta: um comando no terminal (as CLIs prontas) ou o `authenticate` do
 * ACP, que nesta história ainda é o comando de login da própria ferramenta, no terminal (o login pela
 * tela é a história 7). A chave de API no cofre (`api-key`) entra com o Conectar.
 */
export type DriverAuth = { kind: 'login-command'; command: string } | { kind: 'acp-authenticate'; terminal: string };

/** O que a sonda de login recebe do host: tudo já com o perfil aplicado, para o driver não ver segredos à toa. */
export interface SignInProbe {
  homeDir: string;
  /** roda um comando de consulta da CLI do perfil (executável, ambiente e revisão do perfil já aplicados) */
  query(args: string[]): Promise<CliRun>;
  /** o ambiente próprio do perfil (só a cópia de uma CLI pronta), para a ferramenta que lê uma pasta de dados */
  env?: Record<string, string>;
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
  /** o que o gateway promete medir: custo, tokens ou nada */
  readonly measure: AiMeasure;
  /** o que o board impõe neste modo: a linha do catálogo (`TOOLS`) */
  readonly enforcement: ModeEnforcement;
}
