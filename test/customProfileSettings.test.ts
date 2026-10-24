// Configurações › Ferramentas de IA, perfil de CLI personalizado: os dois defeitos achados no teste de ponta a
// ponta com o rastreio do board. (1) O "Trabalhar na fase" ficava sempre desligado com "O perfil não declara
// argumentos para esta permissão restrita.", porque a conferência usava o perfil público do snapshot, que não leva
// os argumentos (ficam no cofre). (2) Editar os argumentos de um nível apagava os dos outros níveis.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import type { AiProfileDraft } from '../src/shared/aiProfiles';
import { admissionBlockedText } from '../src/extension/ai/admission';

const MISSING_ARGS = 'O perfil não declara argumentos para esta permissão restrita.';

let dir: string;
let router: MessageRouter;
let db: Awaited<ReturnType<typeof openInMemory>>;

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fazai-custom-'));
  db = await openInMemory(path.resolve(__dirname, '../node_modules/sql.js/dist'));
  router = new MessageRouter({ db, scheduleSave: () => {}, close: async () => {} } as never, {
    workspaceKey: 'ws',
    folderName: 'Projeto',
    author: 'Pessoa',
    attachmentsDir: path.join(dir, 'attachments'),
    workspaceDir: dir,
    homeDir: path.join(dir, 'home'),
  });
});

afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Grava o personalizado e devolve o id que o board deu a ele. */
function saveCustom(config: AiProfileDraft['config'], id?: string): string {
  const before = router.snapshot().board.aiProfiles.map((p) => p.id);
  const draft = {
    ...(id ? { id } : {}),
    name: 'Claude falso',
    enabled: true,
    kind: 'custom',
    base: 'generic',
    position: 100,
    config,
  } as AiProfileDraft;
  router.handle({ type: 'settings.aiProfiles.save', profile: draft });
  return id ?? router.snapshot().board.aiProfiles.find((p) => !before.includes(p.id))!.id;
}

describe('perfil personalizado como padrão: o "Trabalhar na fase"', () => {
  it('liga quando o perfil declara os argumentos da permissão do board, que o snapshot público não traz', () => {
    const id = saveCustom({ command: '/bin/echo', permissionArgs: { board: ['--modo-board'] } });
    router.handle({ type: 'settings.board.update', patch: { aiTool: id } });
    const state = router.snapshot();
    expect(state.board.runner.permission).toBe('board');
    // o público continua sem os argumentos: a regra é a do perfil que a execução usa
    expect(state.board.aiProfiles.find((p) => p.id === id)!.config.permissionArgs).toBeUndefined();
    expect(state.aiRunUnsupported).toBeNull();
  });

  it('continua desligado, com o motivo, quando o nível do board não tem argumentos', () => {
    const id = saveCustom({ command: '/bin/echo', permissionArgs: { edits: ['--modo-arquivos'] } });
    router.handle({ type: 'settings.board.update', patch: { aiTool: id } });
    expect(router.snapshot().aiRunUnsupported).toBe(MISSING_ARGS);
  });
});

describe('editar o perfil personalizado: "deixe vazio para manter"', () => {
  it('gravar os argumentos de um nível mantém os dos outros e o comando', () => {
    const id = saveCustom({ command: '/bin/echo', permissionArgs: { board: ['--modo-board'] } });
    // a edição manda só o que foi preenchido, como a tela faz
    saveCustom({ permissionArgs: { edits: ['--modo-arquivos'] } }, id);
    const config = new AiProfileRepo(db).resolveConfig(router.boardId, id);
    expect(config.command).toBe('/bin/echo');
    expect(config.permissionArgs).toEqual({ board: ['--modo-board'], edits: ['--modo-arquivos'] });
  });

  it('um nível enviado vazio é esvaziado de propósito, sem mexer nos outros', () => {
    const id = saveCustom({ command: '/bin/echo', permissionArgs: { board: ['--modo-board'], edits: ['--modo-arquivos'] } });
    saveCustom({ permissionArgs: { edits: [] } }, id);
    expect(new AiProfileRepo(db).resolveConfig(router.boardId, id).permissionArgs).toEqual({ board: ['--modo-board'], edits: [] });
  });
});

describe('Testar e execução bloqueados pela admissão: o motivo em frase', () => {
  it('troca os códigos crus pelas capacidades com o nome da tela e diz onde resolver', () => {
    const text = admissionBlockedText({
      reasons: [
        { code: 'capability-not-verified', capability: 'conversation' },
        { code: 'capability-not-verified', capability: 'mcp' },
        { code: 'compatibility-not-reviewed' },
        { code: 'tool-mapping-unavailable' },
        { code: 'codigo-novo' },
      ],
    });
    expect(text).toBe(
      'Execução bloqueada pela admissão: o perfil ainda não teve verificado: conversa nova, MCP. Em Configurações › Ferramentas de IA, use o Conectar da ferramenta ou "Verificar capacidades", nos perfis que têm um dos dois (o personalizado de CLI não tem); o perfil roda no regime compatível e falta a sua ciência, no cartão do perfil; o board não sabe traduzir as ferramentas do card para esta CLI; codigo-novo.',
    );
    expect(text).not.toContain('capability-not-verified');
  });
});
