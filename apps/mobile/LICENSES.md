# apps/mobile — dependency licences

Checked with `npm view <pkg> license` on 2026-09-21 (constitution, Principle III).

| Package | Version | Licence | Since |
|---|---|---|---|
| expo | 58.0.0-preview.3 | MIT | M1 |
| expo-audio | 58.0.0 | MIT | M1 |
| expo-router | 58.x | MIT | M1 |
| expo-sqlite | 58.x | MIT | M1 |
| expo-secure-store | 58.0.0 | MIT | M3 |
| expo-file-system (incl. `/legacy` sub-path, research R1) | 58.0.0 | MIT | M2 |
| expo-network | 58.0.0 | MIT | M2 |
| expo-linking (already installed with expo-router; first used by M4's clip links) | 58.0.3 | MIT | M4 |
| fast-xml-parser (via feed-parser) | 5.x | MIT | M1 |

M4 (2026-09-21) added **no** dependency: the share sheet is React Native's built-in `Share`, the clip link routes through expo-router and expo-linking, both already present.
