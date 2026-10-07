# Fixtures

| File | Origin | What it proves |
|---|---|---|
| `messy.xml` | **Synthetic.** `docs/HANDOFF.md` § `fixtures/messy.xml`, verbatim. | Every pathology we *thought of*: duration shapes, a missing enclosure, a duplicate guid, relative urls, a numeric guid, single repeatable tags. **Not observed in the wild** — it proves the parser handles what was imagined, not what publishers do. |
| `real-podcasting20.xml` | **Real.** `example.xml` from [Podcastindex-org/podcast-namespace](https://github.com/Podcastindex-org/podcast-namespace), fetched 2026-09-20 from `raw.githubusercontent.com/.../main/example.xml` (HTTP 200, 17 152 bytes). Public domain. | The only non-synthetic feed in the suite, and the only file here not written by us. |

**NOT VERIFIED**: the parser has still never been run against a real-world corpus
(`docs/HANDOFF.md` §9). Two fixtures are not a corpus. Running it against a few hundred
live feeds remains open, and new warning codes should be expected when it happens.
