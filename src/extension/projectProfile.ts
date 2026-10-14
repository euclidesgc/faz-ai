import * as fs from 'node:fs';
import * as path from 'node:path';
import { EMPTY_PROFILE, type ProjectProfile } from '../shared/projectProfile';

/** Pastas de primeiro nível que não dizem nada sobre o projeto. */
const SKIP_FOLDERS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'target', 'vendor', '__pycache__', 'venv', 'env']);

/** Lê um arquivo de texto pequeno; vazio quando não existe ou é grande demais para uma configuração. */
function read(file: string): string {
  try {
    return fs.statSync(file).size > 512 * 1024 ? '' : fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

const exists = (dir: string, ...names: string[]): boolean => names.some((n) => fs.existsSync(path.join(dir, n)));

/** Algum arquivo da pasta tem um destes nomes (com curinga de extensão: `eslint.config.*`). */
function hasFileLike(files: string[], prefixes: string[]): boolean {
  return files.some((f) => prefixes.some((p) => f === p || f.startsWith(p)));
}

/**
 * O perfil do projeto, sem chamar IA: linguagens pelos manifestos, scripts do package.json, ferramentas de
 * qualidade por arquivo de configuração ou dependência, pastas de primeiro nível e o título do README. Sem pasta
 * de projeto devolve o perfil vazio. Lê só a raiz: é rápido e não depende do tamanho do repositório.
 */
export function readProjectProfile(dir: string): ProjectProfile {
  if (!dir || !fs.existsSync(dir)) return EMPTY_PROFILE;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return EMPTY_PROFILE;
  }
  const files = entries.filter((e) => e.isFile()).map((e) => e.name);
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_FOLDERS.has(e.name))
    .map((e) => e.name)
    .sort();

  let pkg: { scripts?: Record<string, unknown>; dependencies?: Record<string, unknown>; devDependencies?: Record<string, unknown> } = {};
  try {
    pkg = JSON.parse(read(path.join(dir, 'package.json')) || '{}') as typeof pkg;
  } catch {
    /* package.json quebrado: segue sem ele */
  }
  const deps = new Set([...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})]);
  const scripts = Object.fromEntries(
    Object.entries(pkg.scripts ?? {})
      .filter((e): e is [string, string] => typeof e[1] === 'string')
      .slice(0, 30)
      .map(([k, v]) => [k, v.slice(0, 200)]),
  );
  const pyproject = read(path.join(dir, 'pyproject.toml'));

  const languages: string[] = [];
  if (files.includes('package.json') || files.includes('tsconfig.json'))
    languages.push(files.includes('tsconfig.json') || deps.has('typescript') ? 'TypeScript' : 'JavaScript');
  if (exists(dir, 'pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile')) languages.push('Python');
  if (exists(dir, 'Cargo.toml')) languages.push('Rust');
  if (exists(dir, 'go.mod')) languages.push('Go');
  if (exists(dir, 'pubspec.yaml')) languages.push('Dart');
  if (exists(dir, 'pom.xml', 'build.gradle', 'build.gradle.kts')) languages.push('Java/Kotlin');
  if (files.some((f) => /\.(csproj|sln)$/.test(f))) languages.push('C#');
  if (exists(dir, 'Gemfile')) languages.push('Ruby');
  if (exists(dir, 'composer.json')) languages.push('PHP');
  if (exists(dir, 'Package.swift')) languages.push('Swift');

  const tools: string[] = [];
  const add = (name: string, found: boolean) => {
    if (found && !tools.includes(name)) tools.push(name);
  };
  add('typescript', files.includes('tsconfig.json') || deps.has('typescript'));
  add('eslint', hasFileLike(files, ['eslint.config.', '.eslintrc']) || deps.has('eslint'));
  add('prettier', hasFileLike(files, ['.prettierrc', 'prettier.config.']) || deps.has('prettier'));
  add('biome', exists(dir, 'biome.json', 'biome.jsonc') || deps.has('@biomejs/biome'));
  add('vitest', hasFileLike(files, ['vitest.config.']) || deps.has('vitest'));
  add('jest', hasFileLike(files, ['jest.config.']) || deps.has('jest'));
  add('playwright', hasFileLike(files, ['playwright.config.']) || deps.has('@playwright/test'));
  add('pytest', exists(dir, 'pytest.ini', 'conftest.py') || /\[tool\.pytest/.test(pyproject));
  add('ruff', exists(dir, 'ruff.toml', '.ruff.toml') || /\[tool\.ruff/.test(pyproject));
  add('black', /\[tool\.black/.test(pyproject));
  add('mypy', exists(dir, 'mypy.ini') || /\[tool\.mypy/.test(pyproject));
  add('rustfmt', exists(dir, 'rustfmt.toml', '.rustfmt.toml'));
  add('golangci-lint', hasFileLike(files, ['.golangci.']));
  add('dart analyze', exists(dir, 'analysis_options.yaml'));

  const readmeFile = files.find((f) => /^readme(\.md)?$/i.test(f));
  const title = readmeFile ? /^#\s+(.+)$/m.exec(read(path.join(dir, readmeFile))) : null;

  return { languages, scripts, tools, folders, readme: title?.[1]?.trim() ?? '' };
}
