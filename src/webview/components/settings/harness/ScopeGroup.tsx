import { useState } from 'react';
import type { AiTool, HarnessItem, HarnessScope } from '../../../../shared/harness';
import { HARNESS_SCOPES } from '../../../../shared/harness';
import { Badge, Button, Checkbox } from '@radix-ui/themes';
import { ItemRow } from './ItemRow';
import { toolLabel } from './text';
import type { ItemActions } from './useItemActions';

/** Chave estável de uma linha: o mesmo arquivo pode trazer várias entradas (hooks, regras de permissão). */
const keyOf = (i: HarnessItem) => `${i.path}|${i.name}|${i.detail ?? ''}`;

interface Props {
  tool: AiTool;
  scope: HarnessScope;
  items: HarnessItem[];
  actions: ItemActions;
  filesOpen: string | null;
  onFilesOpen: (path: string | null) => void;
}

/**
 * Os itens de um tipo num escopo (projeto, global ou plugins): cabeçalho que diz de onde eles vêm,
 * caixas de seleção e a barra de ações em massa sobre o que foi marcado.
 */
export function ScopeGroup({ tool, scope, items, actions, filesOpen, onFilesOpen }: Props) {
  const { copyable, twin, copy, setMode, deletable, remove } = actions;
  const info = HARNESS_SCOPES.find((s) => s.id === scope)!;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const picked = items.filter((i) => selected.has(keyOf(i)));
  const set = (list: HarnessItem[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const i of list) {
        if (on) next.add(keyOf(i));
        else next.delete(keyOf(i));
      }
      return next;
    });
  const done = () => setSelected(new Set());

  const modeable = picked.filter((i) => i.mode && i.scope !== 'plugin');
  const toProject = picked.filter((i) => scope !== 'project' && copyable(i, 'project') && !twin(i, 'project'));
  const toUser = picked.filter((i) => scope !== 'user' && copyable(i, 'user') && !twin(i, 'user'));
  const removable = picked.filter(deletable);
  const allOn = items.length > 0 && picked.length === items.length;

  return (
    <section className={`scope-group scope-${scope}`} aria-label={info.label}>
      <header className="scope-head">
        <Checkbox
          disabled={items.length === 0}
          aria-label={`Selecionar todos em ${info.label}`}
          checked={allOn ? true : picked.length > 0 ? 'indeterminate' : false}
          onCheckedChange={(v) => set(items, v === true)}
        />
        <Badge color={scope === 'project' ? 'indigo' : 'gray'} variant={scope === 'project' ? 'solid' : 'soft'} size="2">
          {info.label}
        </Badge>
        <span className="muted small">{items.length}</span>
        <span className="muted small scope-summary">{info.summary}</span>
      </header>
      {picked.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Ações nos itens marcados">
          <b>{picked.length} marcados</b>
          {modeable.length > 0 && (
            <>
              <Button
                variant="soft"
                color="gray"
                size="1"
                title="A IA vê a descrição em toda sessão e decide quando usar"
                onClick={() => {
                  setMode(modeable, 'auto');
                  done();
                }}
              >
                Deixar automáticas
              </Button>
              <Button
                variant="soft"
                color="gray"
                size="1"
                title="A IA deixa de invocar sozinha; elas continuam valendo nos cards que as indicam"
                onClick={() => {
                  setMode(modeable, 'manual');
                  done();
                }}
              >
                Deixar só quando indicadas
              </Button>
            </>
          )}
          {toProject.length > 0 && (
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={() => {
                copy(toProject, 'project');
                done();
              }}
            >
              Copiar para o projeto ({toProject.length})
            </Button>
          )}
          {toUser.length > 0 && (
            <Button
              variant="soft"
              color="gray"
              size="1"
              onClick={() => {
                copy(toUser, 'user');
                done();
              }}
            >
              Copiar para o global ({toUser.length})
            </Button>
          )}
          {removable.length > 0 && (
            <Button
              variant="soft"
              color="red"
              size="1"
              onClick={() => {
                remove(removable);
                done();
              }}
            >
              Apagar ({removable.length})
            </Button>
          )}
          <Button variant="ghost" size="1" onClick={done}>
            Limpar seleção
          </Button>
        </div>
      )}
      {items.length === 0 && <p className="muted small scope-empty">Nada neste projeto para o {toolLabel(tool)}.</p>}
      <ul className="item-list">
        {items.map((i) => (
          <ItemRow
            key={keyOf(i)}
            tool={tool}
            item={i}
            actions={actions}
            selected={selected.has(keyOf(i))}
            onSelect={(on) => set([i], on)}
            filesOpen={filesOpen === i.path}
            onToggleFiles={() => onFilesOpen(filesOpen === i.path ? null : i.path)}
          />
        ))}
      </ul>
    </section>
  );
}
