import './setup';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Theme } from '@radix-ui/themes';
import { FieldBadge } from '../../src/webview/components/FieldRenderer';
import { techColor, techIcon } from '../../src/webview/techLogos';
import type { FieldDef } from '../../src/shared/model';

const field = (over: Partial<FieldDef> = {}): FieldDef => ({
  id: 'f1',
  boardId: 'b1',
  name: 'Tecnologia',
  kind: 'multiselect',
  options: ['Flutter', 'Dart', 'frontend'],
  appliesToTypes: null,
  display: 'chip',
  position: 0,
  ...over,
});

describe('logos de tecnologia', () => {
  it('reconhece a tecnologia por nome, apelido e grafia', () => {
    expect(techIcon('Flutter')?.title).toBe('Flutter');
    expect(techIcon('react')?.title).toBe('React');
    expect(techIcon('Vue.js')?.title).toBe('Vue.js');
    expect(techIcon('vue')?.title).toBe('Vue.js');
    expect(techIcon('node')?.title).toBe('Node.js');
    expect(techIcon('TS')?.title).toBe('TypeScript');
    expect(techIcon('c++')?.title).toBe('C++');
    expect(techIcon('k8s')?.title).toBe('Kubernetes');
  });

  it('texto que não é tecnologia fica sem logo', () => {
    expect(techIcon('frontend')).toBeUndefined();
    expect(techIcon('')).toBeUndefined();
    expect(techIcon('Alta')).toBeUndefined();
  });

  it('usa a cor da marca, e a do texto quando a marca some no fundo claro ou escuro', () => {
    expect(techColor(techIcon('Flutter')!)).toBe('#02569B');
    expect(techColor(techIcon('GitHub')!)).toBe('currentColor');
  });

  it('as opções que são tecnologias aparecem no card com o logo; as outras, só com o texto', () => {
    const { container } = render(
      <Theme>
        <FieldBadge field={field()} value={['Flutter', 'frontend']} />
      </Theme>,
    );
    const chips = container.querySelectorAll('.chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]!.querySelector('svg.tech-logo')).not.toBeNull();
    expect(chips[0]).toHaveTextContent('Flutter');
    expect(chips[1]!.querySelector('svg.tech-logo')).toBeNull();
  });

  it('um campo de texto não ganha logo mesmo que o valor seja o nome de uma tecnologia', () => {
    const { container } = render(
      <Theme>
        <FieldBadge field={field({ kind: 'text', options: [], display: 'badge' })} value="Flutter" />
      </Theme>,
    );
    expect(container.querySelector('svg')).toBeNull();
  });
});
