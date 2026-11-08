# Marvel Heroes Compendium

A standalone Marvel Heroes reference site using the Command Center's navy/cyan/metallic visual theme and existing MARVEL logo.

Repository: [kalvx/marvelheroes](https://github.com/kalvx/marvelheroes).

## Preview

Run `Start-Preview.ps1` from this folder, then open the printed localhost URL. The complete website is in `dist/`; it uses relative URLs and hash-based routes so it works beneath a GitHub Pages repository path.

## Rebuild

Use the installed Python 3 standard library. All work and caches stay under this project on H:.

1. `python tools/import_catalog.py` imports factual reference tables, batch item/power facts and catalog artwork. Requests are cached locally. It does not import accounts, comments, biographies or editorial articles.
2. `python tools/import_routes.py` imports story-mission objectives and route hints.
3. `python tools/export_edition.py` reads an explicit allowlist of current camera, gameplay and currency settings.
4. `python tools/assemble_catalog.py` merges the reference tables, correct tooltip namespaces, current local images and available route hints.

Delete only `.cache/catalog-raw.json` before step 4 when intentionally refreshing the source tables; retain the HTTP cache unless refreshing upstream data is intended. Run the assembler after the artwork import has completed so an earlier import process cannot overwrite the final assembly.

## Publication

The supplied GitHub Pages workflow deploys from **kalvx/marvelheroes**. It publishes the checked-in `dist/` output and performs no source-data scraping during deployment. Pages uses GitHub Actions as its publishing source.

The website itself has no account system or connection to the running game. It contains public gameplay reference facts and bundled artwork only. Existing game installations, saves, camera packages and Command Center files are read-only inputs.

## Sources and scope

AlexBond / MHBugle Item Base supplies historical catalog facts and catalog artwork. Local gameplay settings and source supply the current camera, free-hero choice, reward preset and currency-conversion guides. The website's Sources view credits the catalog and distinguishes reference entries from current-edition adjustments.

Catalog entries span releases and are not a promise that every listed record is obtainable. Original prose, biographies, comments and public-community features are excluded. Navigation hints are imported where the source supplies them; missing directions must remain unknown rather than be invented.
