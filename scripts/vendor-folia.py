from pathlib import Path
import hashlib,json,re,shutil
# Reproducible local-source import; original comments remain intact.
root=Path('/Users/wisdomfish/Documents/folia_music_player/src');dest=Path('src/vendor/folia');seen=set();manifest=[]
starts=['components/visualizer/'+s for s in ['classic/Visualizer.tsx','partita/VisualizerPartita.tsx','fume/VisualizerFume.tsx','tilt/VisualizerTilt.tsx','cadenza/VisualizerCadenza.tsx','claddagh/VisualizerCladdagh.tsx','aurora/VisualizerAurora.tsx','monet/VisualizerMonet.tsx','cappella/VisualizerCappella.tsx','diorama/VisualizerDiorama.tsx']]
starts += ['components/visualizer/'+m+'/tuning.ts' for m in ['classic','partita','fume','tilt','cadenza','claddagh','aurora','monet','cappella','diorama']]
def visit(p):
 p=p.resolve()
 if p in seen:return
 seen.add(p); rel=p.relative_to(root);out=dest/rel;out.parent.mkdir(parents=True,exist_ok=True)
 if p.suffix not in ['.ts','.tsx']:
  shutil.copy(p,out);return
 s=p.read_text()
 out.write_text('// @ts-nocheck\n// Vendored from Folia (AGPL-3.0); see THIRD_PARTY_NOTICES.md.\n'+s)
 manifest.append({'path':str(rel),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
 for dep in re.findall(r'(?:from\s+|import\s*)[\'\"]([^\'\"]+)[\'\"]',s):
  if not dep.startswith('.'):continue
  t=p.parent/dep;found=next((x for x in [t,Path(str(t)+'.ts'),Path(str(t)+'.tsx'),t/'index.ts',t/'index.tsx'] if x.is_file()),None)
  if found:visit(found)
for s in starts:visit(root/s)
shutil.copy('/Users/wisdomfish/Documents/folia_music_player/LICENSE','LICENSE')
print('Vendored',len(seen),'files')

for folder in ['avatar','emo']:
 shutil.copytree(root/'components/visualizer/cappella'/folder,dest/'components/visualizer/cappella'/folder,dirs_exist_ok=True)

for folder in ['avatar','emo']:
 for asset in sorted((root/'components/visualizer/cappella'/folder).iterdir()):
  if asset.is_file():manifest.append({'path':str(asset.relative_to(root)),'sha256':hashlib.sha256(asset.read_bytes()).hexdigest()})
Path('src/vendor/folia/MANIFEST.json').write_text(json.dumps({'upstream':'https://github.com/chthollyphile/folia-major','head':'e28f61c737ed750edd83ecb5810f881507a42792','source':'local working tree, 2026-09-06','files':sorted(manifest,key=lambda x:x['path'])},indent=2)+'\n')
