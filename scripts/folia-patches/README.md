# Studio changes to Folia

The upstream commit and original file hashes live in `src/vendor/folia/MANIFEST.json`. `studio.patch` contains reviewed Studio modifications after alias rewriting; `series.json` records its checksum and the final complete vendor tree.

- Verify without changing files: `python3 scripts/vendor-folia.py --source /path/to/folia-major --check`.
- After reviewing intentional vendor edits, explicitly record them: `python3 scripts/vendor-folia.py --source /path/to/folia-major --record-patches`, then run `--check` and the project tests.
- Sync only after verification: `python3 scripts/vendor-folia.py --source /path/to/folia-major`.

The importer refuses dirty or different upstream commits, changed upstream hashes, missing/changed patches, unrecorded local edits and mismatched replay output. It never silently discards Studio changes. An upstream upgrade requires a separate review of the commit, original manifest, dependency closure and patch conflicts before replacing the recorded baseline. Do not update hashes merely to make a failed check pass.
