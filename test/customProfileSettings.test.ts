// Configurações › Ferramentas de IA, perfil de CLI personalizado, achados no teste de ponta a ponta com o rastreio do
// board. (1) O "Trabalhar na fase" dizia "O perfil não declara argumentos para esta permissão restrita." mesmo com os
// argumentos preenchidos; o motivo real é que o personalizado de CLI não passa na admissão por capacidades, e é ele
// que a tela mostra agora. (2) Editar os argumentos de um nível apagava os dos outros níveis.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { openInMemory } from '../src/extension/db/database';
import { MessageRouter } from '../src/extension/panel/messageRouter';
import { AiProfileRepo } from '../src/extension/repositories/aiProfileRepo';
import type { AiProfileDraft } from '../src/shared/aiProfiles';
import { admissionBlockedText } from '../src/extension/ai/admission';
import { CUSTOM_CLI_UNSUPPORTED, customCliUnsupported } from '../src/extension/headless';

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

describe('perfil personalizado de CLI como padrão: o "Trabalhar na fase"', () => {
  it('desliga antes do clique, com o motivo da admissão, mesmo com os argumentos de todos os níveis', () => {
    const id = saveCustom({ command: '/bin/echo', permissionArgs: { board: ['--b'], edits: ['--e'], full: ['--f'] } });
    router.handle({ type: 'settings.board.update', patch: { aiTool: id } });
    // antes dizia "não declara argumentos" (errado) e, corrigido isso, ligava e a execução era recusada na admissão
    expect(router.snapshot().aiRunUnsupported).toBe(CUSTOM_CLI_UNSUPPORTED);
  });

  it('o personalizado ACP antigo segue sem esse motivo: ele continua rodando', () => {
    const custom = router.snapshot().board.aiProfiles.find((p) => p.id === 'claude')!;
    const legacyAcp = {
      ...custom,
      id: 'gemini-acp',
      kind: 'custom',
      base: 'generic',
      mode: 'acp',
      config: { acpAgent: 'gemini' },
    } as typeof custom;
    expect(customCliUnsupported(legacyAcp)).toBeNull();
    expect(customCliUnsupported({ ...legacyAcp, mode: 'cli', config: { command: '/bin/echo' } } as typeof custom)).toBe(
      CUSTOM_CLI_UNSUPPORTED,
    );
  });

  it('um perfil do catálogo como padrão não ganha o motivo', () => {
    expect(customCliUnsupported(router.snapshot().board.aiProfiles.find((p) => p.id === 'claude')!)).toBeNull();
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
