import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { harness, type HarnessScope } from '../../../commands';
import { useBoardStore } from '../../../store/boardStore';
import { Badge, Button, Card, Checkbox, TextField } from '@radix-ui/themes';
import { SelectField, type EnumOption } from '../../ui';
import { withGlobalWarning } from './text';
import { t } from '../../../i18n';

// os rótulos ficam em português e são traduzidos onde a lista é usada
const DESTINATIONS: EnumOption<HarnessScope>[] = [
  { value: 'project', label: 'Instalar no projeto' },
  { value: 'user', label: 'Instalar no global' },
];

/** Instalar skills de uma pasta ou de um repositório git: procurar, revisar a lista e escolher o que copiar. */
export function InstallSkills({ tool }: { tool: AiTool }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const [source, setSource] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [to, setTo] = useState<HarnessScope>('project');
  const preview = state.harnessInstall;
  const existing = new Set(
    state.harness.inventory
      .find((t) => t.tool === tool)
      ?.items.filter((i) => i.kind === 'skill' && i.scope === to)
      .map((i) => i.name),
  );
  const installable = preview?.skills.filter((k) => k.valid && !existing.has(k.name)) ?? [];
  const picked = chosen.filter((rel) => installable.some((k) => k.rel === rel));
  const apply = () =>
    ask({
      title: t('Instalar {n} skill(s)?', { n: picked.length }),
      message: withGlobalWarning(
        t(
          'As pastas são copiadas para {destination}. Nada é executado na instalação, mas uma skill são instruções (e às vezes scripts) que a IA vai seguir: leia o que vem de fontes que você não conhece.',
          { destination: to === 'user' ? t('a sua pasta de usuário') : t('o projeto') },
        ),
        to,
      ),
      confirmLabel: t('Instalar'),
      onConfirm: () => {
        harness.applyInstall(tool, to, picked);
        setChosen([]);
      },
    });
  return (
    <Card className="draft-card" aria-label={t('Instalar skills')}>
      <div className="row">
        <TextField.Root
          className="grow"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder={t('dono/repositorio, endereço git (https ou ssh) ou o caminho de uma pasta')}
          spellCheck={false}
          onKeyDown={(e) => e.key === 'Enter' && source.trim() && harness.scanInstall(source)}
        />
        <Button disabled={!source.trim()} onClick={() => harness.scanInstall(source)}>
          {t('Procurar skills')}
        </Button>
      </div>
      <p className="muted small">
        {t(
          'Um repositório é clonado numa pasta temporária, sem rodar nada dele. Você vê as skills encontradas antes de copiar qualquer coisa.',
        )}
      </p>
      {preview && (
        <>
          <div className="row">
            <b>{t('{n} skill(s) em {source}', { n: preview.skills.length, source: preview.source })}</b>
            <span className="spacer" />
            <SelectField
              aria-label={t('Onde instalar')}
              options={DESTINATIONS.map((o) => ({ ...o, label: t(o.label) }))}
              value={to}
              onChange={setTo}
            />
          </div>
          <table className="table">
            <tbody>
              {preview.skills.map((k) => {
                const blocked = !k.valid ? t('nome de pasta inválido para skill') : existing.has(k.name) ? t('já existe no destino') : '';
                return (
                  <tr key={k.rel} className={blocked ? 'off' : ''}>
                    <td>
                      <Checkbox
                        aria-label={t('Instalar {name}', { name: k.name })}
                        disabled={!!blocked}
                        checked={picked.includes(k.rel)}
                        onCheckedChange={(on) => setChosen(on === true ? [...picked, k.rel] : picked.filter((r) => r !== k.rel))}
                      />
                    </td>
                    <td>
                      {k.name}
                      {blocked && (
                        <Badge color="gray" variant="outline">
                          {blocked}
                        </Badge>
                      )}
                    </td>
                    <td className="muted small">{k.description || '—'}</td>
                    <td className="muted small">
                      <code>{k.rel}</code>
                      {k.files > 0 && ` · ${t('{n} arquivo(s) de apoio', { n: k.files })}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {preview.skills.length === 0 && <p className="muted small">{t('Nenhuma pasta com SKILL.md nessa origem.')}</p>}
          <div className="form-actions">
            {installable.length > 1 && (
              <Button variant="ghost" size="1" onClick={() => setChosen(installable.map((k) => k.rel))}>
                {t('Selecionar todas')}
              </Button>
            )}
            <Button
              variant="soft"
              color="gray"
              onClick={() => {
                harness.cancelInstall();
                setChosen([]);
              }}
            >
              {t('Fechar')}
            </Button>
            <Button disabled={picked.length === 0} onClick={apply}>
              {t('Instalar {n} selecionada(s)', { n: picked.length || '' })}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
