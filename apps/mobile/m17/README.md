# M17 — Editorial: data the cloud gate reads

The CI mirror copies `apps/` but never `specs/`, so the files M17's guards read live here.
The design pictures themselves stay in `specs/018-m17-editorial/designs/`.

| File | What | Guard |
|---|---|---|
| `before.json` | every interactive element before W1 (`scripts/action-inventory.mjs` at b5d62c6) | G-E3 |
| `moves.json` | reviewed exceptions: an action that moved or was removed on purpose, with the reason | G-E3 |
| `surfaces.json` | the 84 in-scope surfaces: design name, entry file, wave, status | G-E6 |
| `designs.json` | the 86 B design names stored in `specs/018-m17-editorial/designs/` | G-E6 |
