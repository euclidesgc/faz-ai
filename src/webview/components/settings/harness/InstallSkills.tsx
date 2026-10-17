import { useState } from 'react';
import type { AiTool } from '../../../../shared/harness';
import { harness, type HarnessScope } from '../../../commands';
import { useAction } from '../../../useAction';
import { useBoardStore } from '../../../store/boardStore';
import { Badge, Card, Checkbox, TextField } from '@radix-ui/themes';
import { ActionButton, SelectField, type EnumOption } from '../../ui';
import { withGlobalWarning } from './text';
import { t } from '../../../i18n';

// os rótulos ficam em português e são traduzidos onde a lista é usada
const DESTINATIONS: EnumOption<HarnessScope>[] = [
  { value: 'project', label: 'Instalar no projeto' },
  { value: 'user', label: 'Instalar no global' },
];

/** Instalar skills de uma pasta ou de um repositório git: procurar, revisar a lista e escolher o que copiar. */
export function InstallSkills({ tool, library = false }: { tool: AiTool; library?: boolean }) {
  const state = useBoardStore((s) => s.state)!;
  const ask = useBoardStore((s) => s.ask);
  const [source, setSource] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [to, setTo] = useState<HarnessScope>('project');
  const preview = state.harnessInstall;
  const existing = new Set(
    library
      ? state.harness.library?.artifacts.filter((a) => a.kind === 'skill').map((a) => a.name)
      : state.harness.inventory
          .find((t) => t.tool === tool)
          ?.items.filter((i) => i.kind === 'skill' && i.scope === to)
          .map((i) => i.name),
  );
  const installable = preview?.skills.filter((k) => k.valid && !existing.has(k.name)) ?? [];
  const picked = chosen.filter((rel) => installable.some((k) => k.rel === rel));
  // clonar o repositório e copiar as pastas levam segundos: os botões mostram a espera até o host confirmar
  const scan = useAction(() => harness.scanInstall(source));
  const install = useAction(() => (library ? harness.importLibrarySkills(picked) : harness.applyInstall(tool, to, picked)));
  const apply = () =>
    ask({
      title: t('Instalar {n} skill(s)?', { n: picked.length }),
      message: library
        ? t('Copia as skills selecionadas e seus arquivos de apoio para a biblioteca particular deste board.')
        : withGlobalWarning(
            t(
              'As pastas são copiadas para {destination}. Nada é executado na instalação, mas uma skill são instruções (e às vezes scripts) que a IA vai seguir: leia o que vem de fontes que você não conhece.',
              { destination: to === 'user' ? t('a sua pasta de usuário') : t('o projeto') },
            ),
            to,
          ),
      confirmLabel: t('Instalar'),
      onConfirm: async () => {
        if (await install.run()) setChosen([]);
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
          onKeyDown={(e) => e.key === 'Enter' && source.trim() && void scan.run()}
        />
        <ActionButton
          disabled={!source.trim()}
          disabledReason={t('Informe a origem: dono/repositório, endereço git ou o caminho de uma pasta.')}
          loading={scan.busy}
          hint={t('Clona ou lê a origem numa pasta temporária, sem rodar nada, e lista as skills encontradas.')}
          onClick={() => void scan.run()}
        >
          {t('Procurar skills')}
        </ActionButton>
      </div>
      {scan.busy && (
        <p role="status" className="muted small">
          <span className="spinner" aria-hidden /> {t('Buscando a origem e procurando skills…')}
        </p>
      )}
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
            {!library && (
              <SelectField
                aria-label={t('Onde instalar')}
                options={DESTINATIONS.map((o) => ({ ...o, label: t(o.label) }))}
                value={to}
                onChange={setTo}
              />
            )}
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
              <ActionButton
                variant="ghost"
                size="1"
                hint={t('Marca todas as skills que podem ser instaladas.')}
                onClick={() => setChosen(installable.map((k) => k.rel))}
              >
                {t('Selecionar todas')}
              </ActionButton>
            )}
            <ActionButton
              variant="soft"
              color="gray"
              hint={t('Descarta a lista e apaga a pasta temporária; nada foi instalado.')}
              onClick={() => {
                harness.cancelInstall();
                setChosen([]);
              }}
            >
              {t('Fechar')}
            </ActionButton>
            <ActionButton
              disabled={picked.length === 0}
              disabledReason={t('Marque pelo menos uma skill.')}
              loading={install.busy}
              hint={t('Copia as pastas das skills marcadas para o destino escolhido.')}
              onClick={apply}
            >
              {t('Instalar {n} selecionada(s)', { n: picked.length || '' })}
            </ActionButton>
          </div>
        </>
      )}
    </Card>
  );
}
