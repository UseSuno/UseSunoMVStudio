# Folia integration

This application incorporates source code from **Folia / folia-major**, by chthollyphile and contributors:
https://github.com/chthollyphile/folia-major

The incorporated source is licensed under **GNU Affero General Public License v3.0**. A complete copy is in `LICENSE`. This combined application's distribution is under AGPL-3.0. Preserve the upstream notices and provide corresponding source when required by that license.

Source snapshot: local working tree of Folia 0.7.3, HEAD `e7de95defa4e7667968e2f61e0fc8bd9b4da3850`, imported 2026-09-07. Per-file original SHA-256 hashes are recorded in `src/vendor/folia/MANIFEST.json`.

Imported visualizers: Fume, Classic, Cadenza, Partita, Tilt, Claddagh, Monet, Cappella, Diorama, Pendolo, Tempera, Sonnet and Still, plus Folia's Common and Latent backgrounds and their dependency closure. No Folia music service, account, network lyric lookup or Electron shell is included.

Studio modifications, dated 2026-09-07: imported TypeScript files have integration comments and alias rewriting, including `@ts-nocheck` to isolate upstream compiler conventions. Original source comments are retained. Studio additionally modifies lyric safe-frame fitting in Classic, Cadenza, Partita and Diorama, language initialization in the player chrome store, and renderer timing/capture behavior where recorded in `scripts/folia-patches/studio.patch`. The patch series and final-file hashes record the complete reviewed differences and are verified before re-import. Application adapters, iframe transport, controls, automatic intros and media export are maintained in Studio code outside the original upstream snapshot. Studio theme values use the upstream Theme interface.

The Studio Aurora lyric treatment reuses Folia's Diorama renderer with Studio glyph waypoints and tuning; it is a derivative visualizer, distinct from Studio's independently supplied Aurora background runtime.

The default Studio colors and generated demonstration audio are separate from Folia's assets. Third-party dependencies retain their respective licenses. The build publishes a complete inventory of installed production dependency versions, license notices and exact source-package URLs at `legal/dependency-notices.txt`. This includes AGPL-3.0-only (`@applemusic-like-lyrics/ttml`), MPL-2.0 (`mediabunny`), Apache-2.0 and permissively licensed packages; the application license does not erase those notices. Google Fonts are fetched at runtime; each font retains its own published license. No font binaries are redistributed in this repository.

Cappella avatar and emoji assets are included with their original per-directory README notices, also published at `legal/cappella-avatar-notice.md` and `legal/cappella-emoji-notice.md`. Their upstream asset terms are separate from the code license. The upstream author identifies these images as AI-generated and explicitly permits use, modification and distribution. That statement is retained as provenance; Studio does not adopt a blanket claim that all AI-assisted images are outside copyright protection. Imported user music, lyrics, images and fonts remain subject to their owners' rights.

Studio Aurora uses the author's own "nebula-canvas" skill runtime — a first-party reusable WebGL background asset, not third-party code — adapted as an ES module with a media-driven clock. Aurora Nebula and Aurora Curtain are independent background choices that can be combined with every lyric visualizer.

## Source and license access

Each build publishes its project source at `source/verse-studio-source.zip`, with `SOURCE_MANIFEST.json` hashing the included source files, the lockfile, build instructions, original Folia notices and Studio patches. The full AGPL license is also served at `legal/LICENSE.txt`; `licenses.html` links the source and notices without requiring a GitHub account. The archive excludes local project/media data, credentials, environment files and dependency installation/build directories. Its locked dependencies can be restored with `npm ci`; exact third-party source-package links are provided in the dependency inventory.
