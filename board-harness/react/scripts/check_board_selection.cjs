#!/usr/bin/env node
// Executa descoberta e ranking reais em leitura, sem instalar ou selecionar skills no Harness.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '../..');
const ts = require(path.join(repo, 'node_modules/typescript'));
const cache = new Map();

function loadTs(file) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file).exports;
  const source = fs.readFileSync(file, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const module = { exports: {} };
  cache.set(file, module);
  const localRequire = (id) => (id.startsWith('.') ? loadTs(path.resolve(path.dirname(file), `${id}.ts`)) : require(id));
  vm.runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require: localRequire,
      __filename: file,
      __dirname: path.dirname(file),
      console,
      process,
    },
    { filename: file },
  );
  return module.exports;
}

const catalog = JSON.parse(fs.readFileSync(path.join(root, 'catalog.json'), 'utf8')).skills;
const cases = JSON.parse(fs.readFileSync(path.join(root, 'evaluations/cases.json'), 'utf8')).cases;
const { findSkills } = loadTs(path.join(repo, 'src/extension/skillInstall.ts'));
const { suggestSkills } = loadTs(path.join(repo, 'src/shared/skillCatalog.ts'));
const found = findSkills(root);
const foundNames = new Set(found.map((skill) => skill.name));
const discoveryOk = found.length === catalog.length && catalog.every((skill) => foundNames.has(skill.name));
if (!discoveryOk || found.some((s) => !s.valid || s.files !== 3 || !s.description)) {
  throw new Error('A descoberta real não encontrou exatamente as 32 skills com suas três referências.');
}
const candidates = found.map((skill) => ({ name: skill.name, description: skill.description, scope: 'imported' }));
const selectionCases = cases.filter((c) => c.kind === 'capability' && c.mode === 'projetar');
const rows = selectionCases.map((c) => {
  const ranked = suggestSkills(c.request, candidates, 8).map((s) => s.name);
  return { skill: c.skill, rank: ranked.indexOf(c.skill) + 1, suggestions: ranked };
});
const negativeRows = cases
  .filter((c) => c.kind === 'non_activation')
  .map((c) => {
    const ranked = suggestSkills(c.request, candidates, 8).map((s) => s.name);
    return {
      skill: c.skill,
      expected: c.expected_primary_skill,
      expectedRank: ranked.indexOf(c.expected_primary_skill) + 1,
      excludedRank: ranked.indexOf(c.skill) + 1,
      suggestions: ranked,
    };
  });
const report = {
  inputs: {
    catalogSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'catalog.json')))
      .digest('hex'),
    casesSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(root, 'evaluations/cases.json')))
      .digest('hex'),
    matcherSha256: crypto
      .createHash('sha256')
      .update(fs.readFileSync(path.join(repo, 'src/shared/skillCatalog.ts')))
      .digest('hex'),
  },
  discovery: { found: found.length, valid: discoveryOk, referencesPerSkill: 3 },
  selection: {
    cases: rows.length,
    top1: rows.filter((r) => r.rank === 1).length,
    top3: rows.filter((r) => r.rank > 0 && r.rank <= 3).length,
    top8: rows.filter((r) => r.rank > 0).length,
  },
  capabilitySuggestions: rows,
  nonActivationSuggestions: negativeRows,
  note: 'Ranking lexical do board com descrições reais; não executa os procedimentos das skills. Zero indica ausência das oito sugestões.',
};
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Descoberta real: ${found.length} skills válidas, três referências por skill.`);
  console.log(
    `Dono esperado nos 32 cenários: top1 ${report.selection.top1}, top3 ${report.selection.top3}, top8 ${report.selection.top8}.`,
  );
  for (const row of rows.filter((r) => r.rank !== 1))
    console.log(`  ${row.skill}: posição ${row.rank || 'ausente'}; primeiro ${row.suggestions[0] ?? 'nenhum'}`);
  console.log('Casos próximos: só sugestões; a decisão de não ativação exige avaliar a responsabilidade da entrega.');
}
if (report.selection.top8 !== selectionCases.length) process.exitCode = 1;
