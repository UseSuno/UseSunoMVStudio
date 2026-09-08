from pathlib import Path
import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid

# Import only the recorded clean upstream snapshot, then replay verified Studio patches.
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, default=Path(__file__).resolve().parents[2] / 'folia-major', help='Clean Folia checkout at the recorded commit')
mode = parser.add_mutually_exclusive_group()
mode.add_argument('--check', action='store_true', help='Verify replay and current vendor files without replacing them')
mode.add_argument('--record-patches', action='store_true', help='Explicitly record reviewed local vendor modifications; never replaces vendor files')
args = parser.parse_args()
project = Path(__file__).resolve().parent.parent
root = (args.source / 'src').resolve()
repo = root.parent
dest = project / 'src/vendor/folia'
patch_dir = project / 'scripts/folia-patches'
reference = json.loads((dest / 'MANIFEST.json').read_text())
workspace = tempfile.TemporaryDirectory(prefix='verse-folia-')
staging = Path(workspace.name) / 'snapshot'
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


def digest_files(directory: Path) -> dict[str, str]:
    result = {}
    for file in sorted(directory.rglob('*')):
        if file.is_symlink():
            raise SystemExit(f'Refusing symlink in snapshot: {file}')
        if file.is_file():
            result[file.relative_to(directory).as_posix()] = hashlib.sha256(file.read_bytes()).hexdigest()
    return result


def fail(message: str) -> None:
    raise SystemExit(message)


def require_equal(actual: dict, expected: dict, message: str) -> None:
    changed = sorted(name for name in actual.keys() | expected.keys() if actual.get(name) != expected.get(name))
    if changed:
        fail(message + ': ' + ', '.join(changed[:12]))


if not root.is_dir():
    fail(f'Folia source not found: {root}. Use --source /path/to/folia-major')
head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
if head != reference['head']:
    fail('Upstream commit differs from MANIFEST.json. Review an upstream upgrade before updating the snapshot.')
if subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo, text=True).strip():
    fail('Upstream checkout is dirty. A clean recorded commit is required.')
for entry in reference['files']:
    original = root / entry['path']
    if not original.is_file() or hashlib.sha256(original.read_bytes()).hexdigest() != entry['sha256']:
        fail(f'Upstream file differs from recorded original: {entry["path"]}')
staging.mkdir()
for start in starts:
    visit(root / start)
for asset_dir in ['components/visualizer/cappella/avatar', 'components/visualizer/cappella/emo']:
    for asset in sorted((root / asset_dir).iterdir()):
        if asset.is_file():
            visit(asset)
require_equal({entry['path']: entry['sha256'] for entry in manifest}, {entry['path']: entry['sha256'] for entry in reference['files']}, 'Imported dependency closure differs from the recorded snapshot')
(staging / 'MANIFEST.json').write_text(json.dumps(reference, indent=2, ensure_ascii=False) + '\n')

if args.record_patches:
    baseline, current = digest_files(staging), digest_files(dest)
    pieces = []
    for name in sorted(baseline.keys() | current.keys()):
        if baseline.get(name) == current.get(name):
            continue
        if Path(name).suffix not in {'.ts', '.tsx', '.js', '.jsx', '.md'}:
            fail(f'Asset or manifest changes require a separate source review: {name}')
        before = (staging / name).read_text().splitlines(keepends=True) if name in baseline else []
        after = (dest / name).read_text().splitlines(keepends=True) if name in current else []
        if (before and not before[-1].endswith('\n')) or (after and not after[-1].endswith('\n')):
            fail(f'Patch recording requires a trailing newline: {name}')
        pieces.extend(difflib.unified_diff(before, after, fromfile=f'a/{name}' if name in baseline else '/dev/null', tofile=f'b/{name}' if name in current else '/dev/null'))
    patch_dir.mkdir(parents=True, exist_ok=True)
    patch = ''.join(pieces).encode()
    (patch_dir / 'studio.patch').write_bytes(patch)
    series = {'format': 1, 'upstream_head': head, 'patches': [{'file': 'studio.patch', 'sha256': hashlib.sha256(patch).hexdigest()}], 'files': current}
    (patch_dir / 'series.json').write_text(json.dumps(series, indent=2, ensure_ascii=False) + '\n')
    print(f'Recorded reviewed Studio modifications. Run --check to verify replay ({len(current)} files).')
    raise SystemExit(0)

if not (patch_dir / 'series.json').is_file():
    fail('Patch series is missing. Review local modifications and run --record-patches before syncing.')
series = json.loads((patch_dir / 'series.json').read_text())
if series.get('format') != 1 or series.get('upstream_head') != head:
    fail('Patch series does not match the recorded upstream commit.')
# Refuse to overwrite unrecorded local edits, even if upstream and patches apply cleanly.
require_equal(digest_files(dest), series['files'], 'Unrecorded vendor changes; review and run --record-patches first')
for entry in series['patches']:
    if Path(entry['file']).name != entry['file'] or not entry['file'].endswith('.patch'):
        fail('Unsafe patch filename')
    patch_path = patch_dir / entry['file']
    patch = patch_path.read_bytes()
    if hashlib.sha256(patch).hexdigest() != entry['sha256']:
        fail(f'Patch checksum differs: {entry["file"]}')
    for line in patch.decode().splitlines():
        if line.startswith(('--- ', '+++ ')):
            target = line[4:].split('\t')[0]
            if target != '/dev/null' and (not target.startswith(('a/', 'b/')) or '..' in Path(target).parts or '\\' in target):
                fail('Unsafe path inside patch')
    if patch:
        subprocess.run(['git', 'apply', '--check', str(patch_path)], cwd=staging, check=True)
        subprocess.run(['git', 'apply', str(patch_path)], cwd=staging, check=True)
require_equal(digest_files(staging), series['files'], 'Patch replay did not reproduce the recorded vendor tree')
if args.check:
    print(f'Verified {len(series["files"])} vendored files and Studio patches; no files changed.')
    raise SystemExit(0)
# Copy to a sibling before the short rename transaction, so cross-volume temp dirs work.
next_dir = dest.with_name('.folia-next-' + uuid.uuid4().hex)
backup = dest.with_name('.folia-backup-' + uuid.uuid4().hex)
shutil.copytree(staging, next_dir)
try:
    dest.rename(backup)
    try:
        next_dir.rename(dest)
    except BaseException:
        backup.rename(dest)
        raise
finally:
    if next_dir.exists():
        shutil.rmtree(next_dir)
if backup.exists():
    shutil.rmtree(backup)
print(f'Vendored {len(series["files"])} files with verified Studio patches from Folia {head[:8]}')
