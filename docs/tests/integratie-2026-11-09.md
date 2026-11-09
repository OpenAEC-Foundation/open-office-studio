# Central integration — 9 November 2026

Branch: `codex/integratie-2026-11-09`. Base main: `e741e504e35a7dc195ea31daab6933e9ddb8b423`. This branch combines completed, pinned deliveries while the source PRs remain independently reviewable. Broad issue acceptance and releases are separate decisions.

## Included deliveries

| PR | Exact source head | Integration commit | Scope |
| --- | --- | --- | --- |
| [#238](https://github.com/OpenAEC-Foundation/open-office-studio/pull/238) | `e5328c48280ccc94167e83d22ced34d0cbc8fa1b` | `6dc192cab0565ab61b7405150b1b9404abe52ab4` | Strict ODF 1.3 conversion profile and validation |
| [#228](https://github.com/OpenAEC-Foundation/open-office-studio/pull/228) | `a49b59d758e7b91050d126b8119223734f8938eb` | `b5c77280a4783ca2c48079eb03b6e466cc850b09` | Writer date metadata and source macro reports |
| [#239](https://github.com/OpenAEC-Foundation/open-office-studio/pull/239) | `bd9de4775018559185ccd9dfd74853d77c6c20e9` | `acda88ea0d3cc2f1fe4288856328cd78cbcc2237` | Printer-independent conversion and Writer matrix |
| [#244](https://github.com/OpenAEC-Foundation/open-office-studio/pull/244) | `bab42fee2dd69dd5429109489c9a4bc0e9ea9515` | `7d0064b03ff06db439e6adc733a8b3601c534bec` | Warning before DOC embedded-object loss |
| [#215](https://github.com/OpenAEC-Foundation/open-office-studio/pull/215) | `7965d36cfb06a181067d5bfd38c5ed2f298b8767` | `742f280983b2f429eeb3ea1bd1eba54561ae2de9` | Namespace-aware OOXML risk detection |
| [#236](https://github.com/OpenAEC-Foundation/open-office-studio/pull/236) | `961ac1db2dc2b6c6ef2cdf3c223b018d63a1fc2a` | `a15615abe1cf60b60d73d146456c89097ec04592` | Spreadsheet validation, cell notes and protection |
| [#242](https://github.com/OpenAEC-Foundation/open-office-studio/pull/242) | `380f59bb629438755d7145d830ea30a97f3e92ec` | `054d1d7a23eb889782ff17c79cd1e955c2bd7fef` | Writer headers, styles, notes and ODT preservation |
| [#240](https://github.com/OpenAEC-Foundation/open-office-studio/pull/240) | `74d6c7b509af124f78c61773c3e9f168c984aab0` | `460ff3b4635fd181edb0a4fffc983f11ae488053` | Spreadsheet status and Presentation canvas performance |
| [#246](https://github.com/OpenAEC-Foundation/open-office-studio/pull/246) | `cc0be69f7b9feef9e883f8b48ad792e623961377` | `86604f640bb9003ceaa2093f53822b5a981128ed` | Spreadsheet async adapter, objects, metadata and formats |
| [#191](https://github.com/OpenAEC-Foundation/open-office-studio/pull/191) | `7536f5d9f3416db7eab91ba458adf115e367c677` | `eb4c062051c70557e0d6f9ab92a4226ed47f7c0b` | Browser recent-file sessions |

## Earlier fixes included in bundles

- PR #186 is included through PR #236; no separate duplicate patch is applied.
- PR #198 is included through PR #236; no separate duplicate patch is applied.
- PR #230 is included through PR #242; no separate duplicate patch is applied.
- PR #231 is included through PR #242; no separate duplicate patch is applied.
- PR #232 is included through PR #242; no separate duplicate patch is applied.
- PR #217 is included through PR #242; no separate duplicate patch is applied.
- PR #208 is included through PR #242; no separate duplicate patch is applied.
- PR #207 is included through PR #242; no separate duplicate patch is applied.
- PR #219 is included through PR #242; no separate duplicate patch is applied.
- PR #203 is included through PR #246; no separate duplicate patch is applied.

## Integration checks

| Check | Source head tested | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: |
| batch-1-targeted | `742f2809` | 57 | 0 |  |
| pr236-targeted | `a15615abe1cf60b60d73d146456c89097ec04592` | 52 | 0 | 0 |
| pr242-targeted | `054d1d7a23eb889782ff17c79cd1e955c2bd7fef` | 114 | 0 | 0 |
| pr240-targeted | `460ff3b4635fd181edb0a4fffc983f11ae488053` | 16 | 0 | 0 |
| pr246-targeted | `86604f640bb9003ceaa2093f53822b5a981128ed` | 131 | 0 | 0 |
| pr191-targeted | `eb4c062051c70557e0d6f9ab92a4226ed47f7c0b` | 8 | 0 | 0 |

## Pending deliveries

- PR #212, reported head `697e777cb4aff1f654e871a192e90f2a24ab773e`: owner-confirmed delivery; integration pending.
- PR #222, reported head `a5adf4e5881e22a85eee611d0b9c2ef07f1263db`: owner-confirmed delivery; integration pending.
- PR #225, reported head `8c4d25b5ff7e0ecd1d8151735b6d8959ff061736`: owner-confirmed delivery; integration pending.
- PR #245, reported head `26d3196595635037d79e27ab1679bfdc62b14d30`: owner-confirmed delivery; integration pending.

## Limits

- Broad issues remain open; integrating a completed fix does not certify every acceptance criterion.
- Native Windows builds are checked in CI because local Application Control blocks Cargo build scripts.
- No live Y-app storage environment is used, as requested by the user.
- Experimental PR116 and uncommitted work are not integration deliveries.
