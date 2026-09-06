# Folia integration

This application incorporates source code from **Folia / folia-major**, by chthollyphile and contributors:
https://github.com/chthollyphile/folia-major

The incorporated source is licensed under **GNU Affero General Public License v3.0**. A complete copy is in `LICENSE`. This combined application's distribution is under AGPL-3.0. Preserve the upstream notices and provide corresponding source when required by that license.

Source snapshot: local working tree of Folia 0.7.3, HEAD `e7de95defa4e7667968e2f61e0fc8bd9b4da3850`, imported 2026-09-07. Per-file original SHA-256 hashes are recorded in `src/vendor/folia/MANIFEST.json`.

Imported visualizers: Fume, Classic, Cadenza, Partita, Tilt, Claddagh, Monet, Cappella, Diorama, Pendolo, Tempera, Sonnet and Still, plus Folia's Common and Latent backgrounds and their dependency closure. No Folia music service, account, network lyric lookup or Electron shell is included.

Modifications: vendored TypeScript files have two leading integration comments, including `@ts-nocheck` to isolate upstream compiler conventions. Original source comments are retained. Application adapters, iframe transport, project controls and media export code are separate, outside the vendored directory. Studio theme values are supplied through the upstream Theme interface.

The default Studio colors and generated demonstration audio are separate from Folia's assets. Third-party dependencies retain their respective licenses.

Cappella avatar and emoji assets are included with their original per-directory README notices. Their upstream asset terms are separate from the code license.

Studio Aurora uses a separate nebula-canvas skill runtime adapted as an ES module with a media-driven clock. Aurora Nebula and Aurora Curtain are independent background choices that can be combined with every lyric visualizer.
