import { useState } from 'react';
import { Badge, Button, Checkbox } from '@radix-ui/themes';
import { pluginActions, type AiTool, type HarnessItem, type PluginAction } from '../../../../shared/harness';
import { harness } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { ItemRow } from './ItemRow';
import type { ItemActions } from './useItemActions';
import { t } from '../../../i18n';

/** Chave estável de uma linha: o mesmo arquivo pode trazer várias entradas (hooks, regras de permissão). */
const keyOf = (i: HarnessItem) => `${i.path}|${i.name}|${i.detail ?? ''}`;

interface Props {
  tool: AiTool;
  /** os itens do grupo Plugins: o de cada plugin (`kind: 'plugin'`) e o que ele traz */
  items: HarnessItem[];
  actions: ItemActions;
}

/**
 * Os plugins instalados, um bloco recolhido por plugin com o que ele traz. Os que a ferramenta deixa
 * mexer têm caixa de seleção, e a barra desativa, ativa ou desinstala os marcados pela própria
 * ferramenta: desinstalar pede confirmação.
 */
export function PluginGroup({ tool, items, actions }: Props) {
  const ask = useBoardStore((s) => s.ask);
  const [filesOpen, setFilesOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // a ferramenta leva alguns segundos por plugin: a barra diz que está trabalhando até o host confirmar
  const apply = useAction((action: PluginAction, ids: string[]) => harness.applyPlugins(tool, action, ids));
  const busy = apply.busy;

  // um bloco por plugin, pelo nome; o item do próprio plugin (o manifesto) diz como ele está instalado
  const plugins = [...new Set(items.map((i) => i.plugin ?? ''))].map((name) => ({
    name,
    manifest: items.find((i) => i.kind === 'plugin' && i.plugin === name),
    own: items.filter((i) => (i.plugin ?? '') === name && i.kind !== 'plugin'),
  }));
  const pickable = plugins.flatMap((p) => (p.manifest && pluginActions(tool, p.manifest.install).length > 0 ? [p.manifest] : []));
  const chosen = pickable.filter((p) => picked.has(p.install!.id));
  const pick = (list: HarnessItem[], on: boolean) =>
    setPicked((cur) => {
      const next = new Set(cur);
      for (const p of list) {
        if (on) next.add(p.install!.id);
        else next.delete(p.install!.id);
      }
      return next;
    });
  const those = (action: PluginAction) => chosen.filter((p) => pluginActions(tool, p.install).includes(action));
  const count = (list: HarnessItem[]) => (list.length < chosen.length ? ` (${list.length})` : '');
  const run = (action: PluginAction, list: HarnessItem[]) => {
    void apply.run(
      action,
      list.map((p) => p.install!.id),
    );
    setPicked(new Set());
  };
  const uninstall = (list: HarnessItem[]) =>
    ask({
      title: list.length === 1 ? t('Desinstalar "{name}"?', { name: list[0]!.name }) : t('Desinstalar {n} plugins?', { n: list.length }),
      message: `${
        tool === 'cursor'
          ? t('A pasta de cada um sai de ~/.cursor/plugins/local.')
          : t('O Claude Code remove o plugin e apaga os dados e as opções que ele guardou.')
      }\n\n${list.map((p) => p.name).join('\n')}`,
      confirmLabel: t('Desinstalar'),
      danger: true,
      onConfirm: () => run('uninstall', list),
    });

  return (
    <>
      {pickable.length > 0 && (
        <div className="item-list-head" role="toolbar" aria-label={t('Ações nos plugins marcados')}>
          <label className="item-check-all">
            <Checkbox
              aria-label={t('Selecionar todos: {group}', { group: t('Plugins') })}
              checked={chosen.length === pickable.length ? true : chosen.length > 0 ? 'indeterminate' : false}
              onCheckedChange={(v) => pick(pickable, v === true)}
            />
            <span className="muted small">
              {busy ? t('Aplicando pela ferramenta…') : chosen.length > 0 ? t('{n} marcados', { n: chosen.length }) : t('Selecionar todos')}
            </span>
          </label>
          {chosen.length > 0 && (
            <>
              {those('disable').length > 0 && (
                <Button variant="soft" color="gray" size="1" disabled={busy} onClick={() => run('disable', those('disable'))}>
                  {t('Desativar')}
                  {count(those('disable'))}
                </Button>
              )}
              {those('enable').length > 0 && (
                <Button variant="soft" color="gray" size="1" disabled={busy} onClick={() => run('enable', those('enable'))}>
                  {t('Ativar')}
                  {count(those('enable'))}
                </Button>
              )}
              {those('uninstall').length > 0 && (
                <Button variant="soft" color="red" size="1" disabled={busy} onClick={() => uninstall(those('uninstall'))}>
                  {t('Desinstalar')}
                  {count(those('uninstall'))}
                </Button>
              )}
              <Button variant="ghost" size="1" onClick={() => setPicked(new Set())}>
                {t('Limpar seleção')}
              </Button>
            </>
          )}
        </div>
      )}
      {plugins.map(({ name, manifest, own }) => {
        const install = manifest?.install;
        return (
          <div key={name} className="plugin-pick">
            <span className="item-check">
              {manifest && pickable.includes(manifest) && (
                <Checkbox
                  aria-label={t('Selecionar {name}', { name })}
                  checked={picked.has(install!.id)}
                  onCheckedChange={(v) => pick([manifest], v === true)}
                />
              )}
            </span>
            <details className="plugin-group">
              <summary>
                <span className="item-name">{name}</span>{' '}
                <Badge color="gray" variant="outline">
                  {own.length}
                </Badge>{' '}
                {install && !install.enabled && (
                  <Badge color="amber" variant="soft" title={t('A ferramenta não carrega o plugin até ele ser ativado de novo')}>
                    {t('desativado')}
                  </Badge>
                )}{' '}
                {install?.scopes.includes('synced') && (
                  <Badge color="gray" variant="soft" title={t('Vem da sua conta no claude.ai: dá para desativar, não para desinstalar')}>
                    {t('sincronizado do claude.ai')}
                  </Badge>
                )}{' '}
                {install?.scopes.includes('managed') && (
                  <Badge color="gray" variant="soft" title={t('Instalado pela sua organização: dá para desativar, não para desinstalar')}>
                    {t('da organização')}
                  </Badge>
                )}{' '}
                {manifest?.description && <span className="muted small">{manifest.description}</span>}
              </summary>
              <ul className="item-list">
                {own.map((i) => (
                  <ItemRow
                    key={keyOf(i)}
                    tool={tool}
                    item={i}
                    actions={actions}
                    explain
                    filesOpen={filesOpen === i.path}
                    onToggleFiles={() => setFilesOpen(filesOpen === i.path ? null : i.path)}
                  />
                ))}
              </ul>
            </details>
          </div>
        );
      })}
    </>
  );
}
