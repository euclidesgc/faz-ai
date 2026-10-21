import { baseValue } from '../../../../shared/harness';
import { useState } from 'react';
import { Badge, Button, Checkbox, TextArea, TextField } from '@radix-ui/themes';
import { agentContextOf } from '../../../../shared/executionContext';
import { ExecutionContext } from '../../card/ExecutionContext';
import { AGENT_FORMAT } from '../../../../shared/agentTools';
import { activeProfile } from '../../../../shared/aiProfiles';
import { enforcementForTexts, TOOL_PRESETS, type ExecAspect } from '../../../../shared/execution';
import { selectedMcpNames } from '../../../../shared/harnessSelection';
import type { Agent } from '../../../../shared/harness';
import type { AiToolInfo } from '../../../../shared/harnessProject';
import type { AgentInput } from '../../../../shared/messages';
import { harness } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { ModelEditor } from '../../FieldRenderer';
import { SkillPicker } from '../../skills/SkillPicker';
import { ChipsEditor, FormField } from '../../ui';
import { ToolChecklist } from './ToolChecklist';
import { t } from '../../../i18n';

/** Edição de um agente: o frontmatter por campos (cada um grava ao sair) e as instruções com salvar. */
export function AgentEditor({ agent: a, tool, onClose }: { agent: Agent; tool: AiToolInfo; onClose: () => void }) {
  const state = useBoardStore((s) => s.state)!;
  const [body, setBody] = useState(a.body);
  const how = enforcementForTexts(activeProfile({ aiTool: tool.id, aiProfiles: state.board.aiProfiles }));
  const servers = [
    ...new Set(
      (state.harness.inventory.find((x) => x.tool === tool.id)?.items ?? [])
        .filter((i) => i.kind === 'mcp' && i.name !== 'faz-ai')
        .map((i) => i.name),
    ),
  ].sort();
  const format = baseValue(AGENT_FORMAT, tool.id) ?? { tools: false, skills: false, mcp: false, readonly: false, background: false };
  const boardServers = selectedMcpNames(state);
  const patch = (p: Partial<AgentInput>) => harness.updateAgent(a.name, a.scope, p);
  const badge = (aspect: ExecAspect) => (
    <Badge
      color={how[aspect] === 'enforced' ? 'indigo' : 'gray'}
      variant={how[aspect] === 'enforced' ? 'soft' : 'outline'}
      title={
        how[aspect] === 'enforced'
          ? t('Na execução pelo board, o {tool} recebe isto por parâmetro: a sessão não tem como usar outra coisa.', { tool: tool.label })
          : t('O {tool} não aceita isto por parâmetro: segue no prompt, como instrução.', { tool: tool.label })
      }
    >
      {how[aspect] === 'enforced' ? t('imposto') : t('orientado')}
    </Badge>
  );
  const dirty = body !== a.body;
  return (
    <div className="profile-editor" aria-label={t('Agente {name}', { name: a.name })}>
      <ExecutionContext
        agent
        preview={agentContextOf(
          { ...state, board: { ...state.board, aiTool: tool.id } },
          {
            id: a.name,
            name: a.name,
            purpose: a.description,
            instructions: body,
            skills: a.skills,
            mcpServers: a.mcp,
            tools: a.tools,
            deniedTools: a.deniedTools,
            model: a.modelValue,
            isDefault: false,
            scope: a.scope,
            path: a.path,
          },
        )}
      />
      <FormField label={t('O que este agente faz')} hint={t('Uma frase: é por ela que o "Refinar com IA" escolhe o agente de um card.')}>
        {(id) => (
          <TextField.Root
            id={id}
            key={a.description}
            defaultValue={a.description}
            onBlur={(e) =>
              e.target.value.trim() && e.target.value.trim() !== a.description && patch({ description: e.target.value.trim() })
            }
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
        )}
      </FormField>
      <FormField
        label={
          <>
            {t('Instruções')} {badge('agent')}
          </>
        }
        hint={t('O papel da sessão: como trabalha, padrões, comandos, o que nunca fazer. Vai inteiro para a IA.')}
      >
        {(id) => (
          <>
            <TextArea id={id} className="code-area" value={body} onChange={(e) => setBody(e.target.value)} rows={12} spellCheck={false} />
            <div className="form-actions">
              {dirty && <span className="muted small">{t('Alterações não salvas')}</span>}
              <Button variant="soft" color="gray" onClick={onClose}>
                {dirty ? t('Descartar') : t('Fechar')}
              </Button>
              <Button disabled={!dirty} onClick={() => harness.updateAgent(a.name, a.scope, {}, body)}>
                {t('Salvar')}
              </Button>
            </div>
          </>
        )}
      </FormField>
      <FormField
        label={
          <>
            {t('Modelo e esforço')} {badge('model')}
          </>
        }
        hint={t('O modelo indicado no card tem preferência.')}
      >
        {() => <ModelEditor value={a.modelValue || null} onChange={(v) => patch({ model: typeof v === 'string' ? v : '' })} />}
      </FormField>
      {format.skills && (
        <FormField
          label={
            <>
              {t('Skills')} {badge('skills')}
            </>
          }
          hint={t('Lidas em toda execução com este agente, além das indicadas no card. Só as marcadas no Harness.')}
        >
          {() => (
            <SkillPicker
              value={a.skills}
              onChange={(skills) => patch({ skills })}
              intent={a.description}
              title={t('Skills de {name}', { name: a.name })}
            />
          )}
        </FormField>
      )}
      {format.mcp && (
        <FormField
          label={
            <>
              {t('Servidores MCP')} {badge('mcp')}
            </>
          }
          hint={t('Além do servidor do board, que vai sempre. Nada marcado = só o board.')}
        >
          {() => (
            <ChipsEditor options={[...new Set([...servers, ...a.mcp])]} values={a.mcp} onChange={(mcp) => patch({ mcp })}>
              {servers.length === 0 && (
                <span className="muted small">{t('Nenhum outro servidor configurado para o {tool}.', { tool: tool.label })}</span>
              )}
            </ChipsEditor>
          )}
        </FormField>
      )}
      {format.tools && (
        <>
          <FormField
            label={
              <>
                {t('Ferramentas disponíveis')} {badge('tools')}
              </>
            }
            hint={t('Marque as que o agente pode usar; nada marcado = as que o nível de permissão da execução libera.')}
          >
            {() => (
              <>
                <div className="agent-presets">
                  {TOOL_PRESETS.map((preset) => (
                    <Button
                      key={preset.id}
                      variant="soft"
                      color="gray"
                      size="1"
                      title={t(preset.hint)}
                      onClick={() => patch({ tools: preset.tools })}
                    >
                      {t(preset.label)}
                    </Button>
                  ))}
                  <Button
                    variant="ghost"
                    size="1"
                    title={t('Sem lista: vale o que o nível de permissão libera')}
                    onClick={() => patch({ tools: [] })}
                  >
                    {t('Usar as ferramentas do nível de permissão')}
                  </Button>
                </div>
                <ToolChecklist tool={tool.id} value={a.tools} servers={boardServers} onChange={(tools) => patch({ tools })} />
              </>
            )}
          </FormField>
          <FormField
            label={
              <>
                {t('Ferramentas negadas')} {badge('tools')}
              </>
            }
            hint={t('Retiradas do agente mesmo que o nível de permissão as libere.')}
          >
            {() => (
              <details className="tool-denied" open={a.deniedTools.length > 0}>
                <summary>{a.deniedTools.length ? t('{n} negadas', { n: a.deniedTools.length }) : t('Nenhuma negada')}</summary>
                <ToolChecklist
                  tool={tool.id}
                  deny
                  prefix={t('Negar') + ' '}
                  value={a.deniedTools}
                  onChange={(deniedTools) => patch({ deniedTools })}
                />
              </details>
            )}
          </FormField>
        </>
      )}
      {(format.readonly || format.background) && (
        <FormField
          label={t('Como o agente roda')}
          hint={t('O {tool} não tem lista de ferramentas, skills nem servidores MCP por agente: ele herda tudo da conversa principal.', {
            tool: tool.label,
          })}
        >
          {() => (
            <div className="agent-flags">
              {format.readonly && (
                <label className="tool-option">
                  <Checkbox
                    aria-label={t('Somente leitura')}
                    checked={a.readonly}
                    onCheckedChange={(v) => patch({ readonly: v === true })}
                  />
                  <span>{t('Somente leitura')}</span>
                  <span className="muted small">{t('Não edita arquivos nem roda comandos que mudem estado.')}</span>
                </label>
              )}
              {format.background && (
                <label className="tool-option">
                  <Checkbox
                    aria-label={t('Em segundo plano')}
                    checked={a.background}
                    onCheckedChange={(v) => patch({ background: v === true })}
                  />
                  <span>{t('Em segundo plano')}</span>
                  <span className="muted small">{t('Roda sem a conversa esperar pelo resultado.')}</span>
                </label>
              )}
            </div>
          )}
        </FormField>
      )}
    </div>
  );
}
