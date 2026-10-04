import { describe, expect, it } from 'vitest';
import { lineSplitter } from '../src/extension/aiOutput/lines';

describe('lineSplitter', () => {
  it('uma linha que chega partida em dois pedaços sai uma vez só, inteira', () => {
    const splitter = lineSplitter();
    expect(splitter.push('ola ')).toEqual([]);
    expect(splitter.push('mundo\n')).toEqual(['ola mundo']);
  });

  it('uma linha que chega partida em três pedaços sai uma vez só, inteira', () => {
    const splitter = lineSplitter();
    expect(splitter.push('o')).toEqual([]);
    expect(splitter.push('la ')).toEqual([]);
    expect(splitter.push('mundo\n')).toEqual(['ola mundo']);
  });

  it('\\r\\n dá o mesmo resultado que \\n: o \\r do fim da linha é descartado', () => {
    const splitter = lineSplitter();
    expect(splitter.push('ola mundo\r\n')).toEqual(['ola mundo']);
  });

  it('pedaço sem nenhuma quebra de linha não devolve nada e fica guardado', () => {
    const splitter = lineSplitter();
    expect(splitter.push('sem quebra ainda')).toEqual([]);
  });

  it('flush() devolve o resto sem quebra no fim e esvazia o buffer', () => {
    const splitter = lineSplitter();
    splitter.push('resto sem quebra');
    expect(splitter.flush()).toEqual(['resto sem quebra']);
  });

  it('flush() chamado de novo depois de já ter esvaziado devolve lista vazia', () => {
    const splitter = lineSplitter();
    splitter.push('resto sem quebra');
    splitter.flush();
    expect(splitter.flush()).toEqual([]);
  });

  it('teto de buffer: ultrapassado sem quebra, devolve o que tem como uma linha e esvazia', () => {
    const splitter = lineSplitter(10);
    expect(splitter.push('12345678901')).toEqual(['12345678901']);
    // o buffer esvaziou: o próximo pedaço começa do zero, não concatenado ao anterior
    expect(splitter.flush()).toEqual([]);
  });

  it('o splitter devolve toda linha, inclusive a vazia', () => {
    const splitter = lineSplitter();
    expect(splitter.push('primeira\n\nterceira\n')).toEqual(['primeira', '', 'terceira']);
  });
});
