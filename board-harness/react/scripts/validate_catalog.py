#!/usr/bin/env python3
"""Valida o pacote e sua cobertura de cenários, sem alegar avaliação comportamental."""

import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODES = {"projetar", "implementar", "revisar"}


def main():
    errors = []
    catalog = json.loads((ROOT / "catalog.json").read_text())
    skills = catalog["skills"]
    names = [skill["name"] for skill in skills]
    if len(names) != 32 or len(set(names)) != len(names):
        errors.append("O catálogo deve conter as 32 responsabilidades únicas do plano.")
    found = {p.parent.name for p in ROOT.glob("*/SKILL.md")}
    if found != set(names):
        errors.append(f"Pastas e catálogo divergem: {found.symmetric_difference(names)}")
    if (ROOT / "SKILL.md").exists():
        errors.append("A raiz não deve ser uma skill abrangente.")
    entry_words = []
    mode_words = []
    for skill in skills:
        name = skill["name"]
        if not re.fullmatch(r"react-[a-z0-9]+(?:-[a-z0-9]+)*", name) or len(name) >= 64:
            errors.append(f"Nome inválido: {name}")
        entry = ROOT / skill["path"]
        if entry != ROOT / name / "SKILL.md" or not entry.is_file():
            errors.append(f"Caminho inválido: {skill['path']}")
            continue
        text = entry.read_text()
        frontmatter = re.match(r"\A---\nname: ([a-z0-9-]+)\ndescription: (.+)\n---\n", text)
        if not frontmatter:
            errors.append(f"Frontmatter fora do formato portável do pacote: {name}")
        else:
            try:
                scalar = frontmatter[2]
                if scalar.startswith('"'):
                    description = json.loads(scalar)
                elif scalar.startswith("'") and scalar.endswith("'"):
                    description = scalar[1:-1].replace("''", "'")
                else:
                    description = scalar
                if frontmatter[1] != name or description != skill["description"]:
                    errors.append(f"Nome/descrição diverge do catálogo: {name}")
                if not isinstance(description, str) or not 1 <= len(description) <= 1024:
                    errors.append(f"Descrição inválida: {name}")
            except (ValueError, TypeError):
                errors.append(f"Descrição YAML inválida: {name}")
        if set(skill["modes"]) != MODES:
            errors.append(f"Modos incompletos: {name}")
        entry_words.append(len(text.split()))
        for mode in MODES:
            relative = f"references/{mode}.md"
            reference = entry.parent / relative
            if f"]({relative})" not in text or not reference.is_file():
                errors.append(f"Referência ausente: {name}/{relative}")
            else:
                content = reference.read_text()
                mode_words.append(len(content.split()))
                if len(content.split()) < 65:
                    errors.append(f"Referência sem conteúdo suficiente: {reference}")
        if re.search(r"\[TODO:|\bTBD\b|<placeholder>", text, re.I):
            errors.append(f"Scaffold incompleto: {name}")
    for md in ROOT.rglob("*.md"):
        for target in re.findall(r"\]\(([^)\s]+)\)", md.read_text()):
            if re.match(r"(?:https?://|#)", target):
                continue
            resolved = (md.parent / target.split("#")[0]).resolve()
            if not resolved.is_relative_to(ROOT) or not resolved.exists():
                errors.append(f"Link local inválido em {md.relative_to(ROOT)}: {target}")
    cases = json.loads((ROOT / "evaluations/cases.json").read_text())["cases"]
    ids = [case["id"] for case in cases]
    if len(ids) != len(set(ids)):
        errors.append("IDs de avaliações duplicados.")
    expected = Counter({"capability": 96, "non_activation": 32, "maintenance": 32})
    counts = Counter(case["kind"] for case in cases)
    if counts != expected:
        errors.append(f"Cobertura de casos incorreta: {counts}")
    for name in names:
        own = [case for case in cases if case["skill"] == name]
        if {c.get("mode") for c in own if c["kind"] == "capability"} != MODES:
            errors.append(f"Falta cenário de modo: {name}")
        for case in own:
            if not case.get("request") or not case.get("expected"):
                errors.append(f"Caso sem entrada/critério: {case['id']}")
            if case["kind"] == "non_activation" and case.get("expected_primary_skill") not in names:
                errors.append(f"Dono alternativo inválido: {case['id']}")
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"OK: {len(names)} skills, {len(mode_words)} referências de modo, links locais válidos.")
    print(f"Casos definidos: {dict(counts)}. Isso não executa agentes nem aprova comportamento.")
    print(f"Palavras por SKILL.md: {min(entry_words)}–{max(entry_words)}; referência: {min(mode_words)}–{max(mode_words)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
