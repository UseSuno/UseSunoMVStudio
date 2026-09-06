from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import subprocess

# Reproducible local-source import from the current Folia main project.
root = Path('/Users/wisdomfish/Documents/folia-major/src').resolve()
repo = root.parent
dest = Path('src/vendor/folia').resolve()
staging = Path('src/vendor/.folia-next').resolve()
seen: set[Path] = set()
manifest: list[dict[str, str]] = []

visualizers = [
    'classic/Visualizer.tsx',
    'partita/VisualizerPartita.tsx',
    'fume/VisualizerFume.tsx',
    'tilt/VisualizerTilt.tsx',
    'cadenza/VisualizerCadenza.tsx',
    'claddagh/VisualizerCladdagh.tsx',
    'monet/VisualizerMonet.tsx',
    'cappella/VisualizerCappella.tsx',
    'diorama/VisualizerDiorama.tsx',
    'pendolo/VisualizerPendolo.tsx',
    'sonnet/VisualizerSonnet.tsx',
    'tempera/VisualizerTempera.tsx',
    'still/VisualizerStill.tsx',
]
starts = [f'components/visualizer/{path}' for path in visualizers]
starts += [f'components/visualizer/{mode}/tuning.ts' for mode in ['classic', 'partita', 'fume', 'tilt', 'cadenza', 'claddagh', 'monet', 'cappella', 'diorama', 'pendolo', 'sonnet', 'tempera']]
starts += [
    'components/visualizer/backgrounds/VisualizerBackgroundRenderer.tsx',
    'hooks/useFontsEpoch.ts',
    'utils/lyrics/wordSegmentation.ts',
    'utils/lyrics/lyricSegmentationRecord.ts',
]
starts += [f'components/visualizer/backgrounds/{mode}/entry.tsx' for mode in ['common', 'latent', 'monet', 'nomand', 'sora', 'url']]

IMPORT_RE = re.compile(r'(?:from\s+|import\s*\(|import\s*)[\'\"]([^\'\"]+)[\'\"]')
ASSET_RE = re.compile(r'new\s+URL\(\s*[\'\"]([^\'\"]+)[\'\"]\s*,\s*import\.meta\.url')


def resolve_module(base: Path) -> Path | None:
    candidates = [
        base,
        Path(str(base) + '.ts'),
        Path(str(base) + '.tsx'),
        Path(str(base) + '.js'),
        Path(str(base) + '.jsx'),
        Path(str(base) + '.json'),
        base / 'index.ts',
        base / 'index.tsx',
    ]
    return next((candidate for candidate in candidates if candidate.is_file()), None)


def rewrite_aliases(source: str, output: Path) -> str:
    def replace(match: re.Match[str]) -> str:
        prefix, specifier, suffix = match.groups()
        target = staging / specifier[2:]
        relative = os.path.relpath(target, output.parent).replace(os.sep, '/')
        if not relative.startswith('.'):
            relative = './' + relative
        return prefix + relative + suffix

    return re.sub(r'([\'\"])(@/[^\'\"]+)([\'\"])', replace, source)


def visit(path: Path) -> None:
    path = path.resolve()
    if path in seen:
        return
    if not path.is_file() or root not in path.parents:
        raise FileNotFoundError(path)
    seen.add(path)
    relative = path.relative_to(root)
    output = staging / relative
    output.parent.mkdir(parents=True, exist_ok=True)

    if path.suffix not in {'.ts', '.tsx', '.js', '.jsx'}:
        shutil.copy2(path, output)
    else:
        source = path.read_text()
        rewritten = rewrite_aliases(source, output)
        prefix = '// @ts-nocheck\n// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.\n'
        output.write_text(prefix + rewritten)

        specs = [*IMPORT_RE.findall(source), *ASSET_RE.findall(source)]
        for specifier in specs:
            clean = specifier.split('?')[0]
            if clean.startswith('./') or clean.startswith('../'):
                dependency = resolve_module(path.parent / clean)
            elif clean.startswith('@/'):
                dependency = resolve_module(root / clean[2:])
            else:
                dependency = None
            if dependency:
                visit(dependency)

    manifest.append({
        'path': relative.as_posix(),
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    })


if not root.is_dir():
    raise SystemExit(f'Folia source not found: {root}')
if staging.exists():
    shutil.rmtree(staging)
staging.mkdir(parents=True)

for start in starts:
    visit(root / start)

# Vite glob imports are runtime dependency declarations rather than ordinary imports.
# Keep their complete built-in asset pools and notices in the vendored snapshot.
for asset_dir in ['components/visualizer/cappella/avatar', 'components/visualizer/cappella/emo']:
    for asset in sorted((root / asset_dir).iterdir()):
        if asset.is_file():
            visit(asset)

head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
(staging / 'MANIFEST.json').write_text(json.dumps({
    'upstream': 'https://github.com/chthollyphile/folia-major',
    'head': head,
    'source': 'local folia-major working tree, 2026-09-07',
    'files': sorted(manifest, key=lambda item: item['path']),
}, indent=2, ensure_ascii=False) + '\n')

if dest.exists():
    shutil.rmtree(dest)
staging.rename(dest)
print(f'Vendored {len(seen)} files from Folia {head[:8]}')
