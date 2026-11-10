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
| [#192](https://github.com/OpenAEC-Foundation/open-office-studio/pull/192) | `13e349645733904aaf9af376fed46b845dc84e8b` | `72f6813df492bcd7695ed158049859a8507b5efc` | Browser file drop |
| [#193](https://github.com/OpenAEC-Foundation/open-office-studio/pull/193) | `4b100e6f1e4eabbcfb16edede23cc4f8522bd50d` | `3fa694a128e03ed3516c9a97bd7d1a84d6deaac1` | Shared dialog Escape ordering |
| [#187](https://github.com/OpenAEC-Foundation/open-office-studio/pull/187) | `5726556db22e3a8abb87b978033bff43316df724` | `a40506bbb16d1fa3758278ecf6dc074db572cfc0` | Modal keyboard guards |
| [#221](https://github.com/OpenAEC-Foundation/open-office-studio/pull/221) | `e8f9c0ddb9633da4ea380f682355418d6c663378` | `f3bae07dcbeb45993a09d2789354b36e68b3b1a3` | Settings reverse tab order |
| [#194](https://github.com/OpenAEC-Foundation/open-office-studio/pull/194) | `3de2b6487ee1159d7335cbf2334f150adc736103` | `9f161f58b53d03ff08005483d70c449cf12bbe25` | Author profiles and initials |
| [#200](https://github.com/OpenAEC-Foundation/open-office-studio/pull/200) | `f14e63215b4445f877f189c4a442a17e57b29ac3` | `42f071ae9f40821cdefcf617b596d331493bf65b` | Independent template copies |
| [#195](https://github.com/OpenAEC-Foundation/open-office-studio/pull/195) | `6119fe5f848a45c8c2a0402746944250379ee34b` | `55fc4cc01d4e8cc041e983aa17613f7f9221b58d` | UTF-16 text import BOM order |
| [#214](https://github.com/OpenAEC-Foundation/open-office-studio/pull/214) | `355a635741527b9b94fb15b957be9a5680f1f311` | `d4d2311aaef6260a5edd0e9c82ff6a82b61e54db` | Uppercase autocorrect |
| [#216](https://github.com/OpenAEC-Foundation/open-office-studio/pull/216) | `9a6f8b5814c57b8304fd79147fe3049ec5f336ec` | `5560c228262a04d0108be26ec82efc216aaa9d96` | Desktop report clipboard |
| [#224](https://github.com/OpenAEC-Foundation/open-office-studio/pull/224) | `f9dbe7336033e8b069ef5db41856c827fe10bcf8` | `8e9c89dd78734abe660d237541bb43533d48a7a9` | Recent-file calendar dates |
| [#190](https://github.com/OpenAEC-Foundation/open-office-studio/pull/190) | `7bfdd0dbee6678c3f3936349bfa56bd536f953c8` | `92be2e3a07aee7c456fe58971d021770078b7414` | Writer Undo focus |
| [#197](https://github.com/OpenAEC-Foundation/open-office-studio/pull/197) | `a40a6662b8d357e77ece0c67b8147f1d7b7d8189` | `c0b487d05057d9df2cf486f1cd5fd6112bff4b72` | Invalid Writer regex guard |
| [#206](https://github.com/OpenAEC-Foundation/open-office-studio/pull/206) | `6d4c96e614f69e9e7982d6ce1dd8a51b3d64d7d9` | `28b0b60efbc7f72e8e292f4076322f219edb1f99` | Empty Unicode regex matches |
| [#212](https://github.com/OpenAEC-Foundation/open-office-studio/pull/212) | `697e777cb4aff1f654e871a192e90f2a24ab773e` | `13ac7fce1ddea9e02b82d2b29fd9431545baf33b` | Spreadsheet cut source identity |
| [#222](https://github.com/OpenAEC-Foundation/open-office-studio/pull/222) | `a5adf4e5881e22a85eee611d0b9c2ef07f1263db` | `27c43dd74de8d44c6bccad6a069c6659668b6369` | Complete TOC heading matching |
| [#225](https://github.com/OpenAEC-Foundation/open-office-studio/pull/225) | `8c4d25b5ff7e0ecd1d8151735b6d8959ff061736` | `0c022aa7bc93748578109bb03ce8f64a22f6c0a2` | Writer sort date validation |
| [#227](https://github.com/OpenAEC-Foundation/open-office-studio/pull/227) | `0a9eabff07bce3410dbf1121eae7d07b48f73737` | `2a94541c7be665e77aacf1f966eff5af4b6456f4` | AltGr keyboard input |
| [#218](https://github.com/OpenAEC-Foundation/open-office-studio/pull/218) | `9761a17f34b423cfa4986152bb67829348f05347` | `9a8a2969fab8e7f9c5416bbd79063ffc7c41217a` | Existing Writer revision detection |
| [#245](https://github.com/OpenAEC-Foundation/open-office-studio/pull/245) | `26d3196595635037d79e27ab1679bfdc62b14d30` | `65512f0718f76834964904482e66e233855c7597` | AutoFit split cell boundaries |
| [#202](https://github.com/OpenAEC-Foundation/open-office-studio/pull/202) | `9f9016b5c883b806efab166e39a732a0fd58b0c9` | `90bc18c448e3337ba2f6f39d9137a342bb463767` | Imported chart source ranges |
| [#210](https://github.com/OpenAEC-Foundation/open-office-studio/pull/210) | `f1acf304534fb2a34dbf862f5c086c03709f5d0c` | `10f963cdfa8f563dff8862baf2df8baeaeee1c67` | Referenced formula error values |
| [#223](https://github.com/OpenAEC-Foundation/open-office-studio/pull/223) | `ff44a3907b7d51d0c9372753f693c37eb15e28c4` | `8183faa8e59ef8b95a7603748b21bee5ce092d10` | Unhide custom dimensions |
| [#204](https://github.com/OpenAEC-Foundation/open-office-studio/pull/204) | `e6a5a34571fb58dbbd81e83e984a06ea13679779` | `b1f0e8ee7c200483e6f9ecd98fa51dba0a17ac99` | Visible sheet navigation |
| [#233](https://github.com/OpenAEC-Foundation/open-office-studio/pull/233) | `405b2e920f89b24495c95f6bcc80aed2a4198883` | `aaea78acbe03fa1517c0779fbb9ef59ece2b32e6` | Presentation editing and design |
| [#243](https://github.com/OpenAEC-Foundation/open-office-studio/pull/243) | `78a84fd8a2926c6313e0d3d1465e5450f2c24837` | `fdf520aeb2ab6b20fefac42a80a69646386abca9` | Presentation transitions and sound |
| [#247](https://github.com/OpenAEC-Foundation/open-office-studio/pull/247) | `6dd71f39edc6bfd7c5a3d92ba842665579bcbdef` | `7897a592878b159941280e49feb9b5db144d7655` | Presentation show and template formats |
| [#249](https://github.com/OpenAEC-Foundation/open-office-studio/pull/249) | `84d851dcbf55e6307be0a4185a67b14cd46b224b` | `59ad7a46cd2447688f82a390c9fecf3517d172c5` | Writer dark sort contrast |
| [#250](https://github.com/OpenAEC-Foundation/open-office-studio/pull/250) | `99da68f0598b3a11ed1c6411e4135a3179bbb3f9` | `65971f5bbba139f484aec904c72c4d46fbbc5978` | Presentation animation checkpoint |
| [#241](https://github.com/OpenAEC-Foundation/open-office-studio/pull/241) | `9666f4788cb39006588291bd01a66fc1da81cd06` | `9b16c29412a2fc338d3e5a5ee0085a66ad1eef44` | Writer captions, equations, references and mail merge |
| [#233](https://github.com/OpenAEC-Foundation/open-office-studio/pull/233) | `2c0d92187ac36f25672d153b781885747184a985` | `73347b5aceb44379cff66e143c5a791d7a09e747` | Presentation grouping and portable theme checkpoint |
| [#252](https://github.com/OpenAEC-Foundation/open-office-studio/pull/252) | `248d5a79b9248ecf59f1378490c793493032c23f` | `e2733071c1285792a9cddca99df3960440a260d2` | Presentation SDK and office performance checkpoint |
| [#251](https://github.com/OpenAEC-Foundation/open-office-studio/pull/251) | `10b9ac1c7634da666498d21de3258dd3573ad397` | `c1b2fbd1fcf5289ca2af72683451552b71925897` | Spreadsheet native formula, chart, dimensions and sheet bundle |
| [#246](https://github.com/OpenAEC-Foundation/open-office-studio/pull/246) | `41c9ebfc1e05e5b74fbe6078c7ad247046e18786` | `2e1dcde1c6c0b5ebfbac54e346ac7594ae5f5651` | Spreadsheet object rendering and modern protection checkpoint |
| [#236](https://github.com/OpenAEC-Foundation/open-office-studio/pull/236) | `86a5be49691b975f0f13d18c040833d305499647` | `d0589466120e5b71cb194ee1e42404bec6d31431` | Spreadsheet threaded comments and print checkpoint |
| [#255](https://github.com/OpenAEC-Foundation/open-office-studio/pull/255) | `04e59e46464e71df1c2b6eb63f5abdb5864001c1` | `f356bb64e5227bc39b2e767ac9da123f0be408a0` | Writer section and column markers |
| [#254](https://github.com/OpenAEC-Foundation/open-office-studio/pull/254) | `5a1c0d50f53ba31a298e9286b9c0ebec31e51782` | `6348da9ea2de0c8b224b3cade9984af960409e59` | Adaptive office preparation and status reads |
| [#233](https://github.com/OpenAEC-Foundation/open-office-studio/pull/233) | `c3537b83e7239fc808b3af0d518e109aef2c0f8b` | `016a4e3f4d1c2c659f543ddcf7c8d0ed2c25c6ab` | Presentation current-theme editing |
| [#246](https://github.com/OpenAEC-Foundation/open-office-studio/pull/246) | `9de53c798334456808a1c7cef815f7872a25ee89` | `5a62feb9b163cd05ccf73f20439f6cb5232a9cdb` | Spreadsheet formula hyperlinks and bounded image decoding |
| [#256](https://github.com/OpenAEC-Foundation/open-office-studio/pull/256) | `51e0ea41e109960d8ea6ca53a149f1b663857ac3` | `6d4bdffde4a2a8a8c82818cd78f0f9e285845e51` | Presentation embedded media |
| [#245](https://github.com/OpenAEC-Foundation/open-office-studio/pull/245) | `55108670c3d8c2300cdec226823f2683ddfeccdc` | `2462550e9a43755fdfa7c8a62e455fb4339940c7` | Writer format verification documentation correction |
| [#257](https://github.com/OpenAEC-Foundation/open-office-studio/pull/257) | `3bd94cf7a827602c068462938297ef1d1fa4b33c` | `5c9b4f13ae00253d1dc586cbbe7d931b370ed857` | Spreadsheet header outline controls |
| [#258](https://github.com/OpenAEC-Foundation/open-office-studio/pull/258) | `b107f8f9c2234556d69ca9535a02b01ea8ee0f57` | `4843eb503dd797daa9cc3c8a4f8584033cce67c6` | Writer reference focus and layout retry |
| [#260](https://github.com/OpenAEC-Foundation/open-office-studio/pull/260) | `e209adfcb81bf81205337c94526cec4b6876eae6` | `8a775cbb09b7ba409e16bd83c8b3c480f379f8f7` | Writer merged caption sequence order |
| [#261](https://github.com/OpenAEC-Foundation/open-office-studio/pull/261) | `98b8dffcb57941bc7f062f7ebf3686727a74d2b5` | `514265522edc045a3b27973c5226ea20ff36f917` | Presentation object format painter |
| [#262](https://github.com/OpenAEC-Foundation/open-office-studio/pull/262) | `49789270eed564fe5856316ca2c88bf50ced4460` | `835601a16e18e9ff672242675f40894e8488f587` | Writer visible spelling page reuse |
| [#263](https://github.com/OpenAEC-Foundation/open-office-studio/pull/263) | `2eb45a3953835db8b57b4ee2273c821169cad45d` | `d56740da10dc89eaeafe8963ec65f1aafc696103` | Spreadsheet native formula hyperlink queries |
| [#264](https://github.com/OpenAEC-Foundation/open-office-studio/pull/264) | `90659493b42b22dabf0efce6c45aea181e7dd2cb` | `bbea3155779c799862acc66b792e3cd3cb2e5b37` | Spreadsheet independent sheet relationship graph copy |
| [#265](https://github.com/OpenAEC-Foundation/open-office-studio/pull/265) | `47643263a3aa34b0cd9cd2a41adbc4c1b5c8c8e8` | `e38910931eb351994fdd981dd96342277cc4dda8` | Presentation preserved diagrams |
| [#267](https://github.com/OpenAEC-Foundation/open-office-studio/pull/267) | `0e58e6f363af73f395025d82fd8c73f319a89f37` | `8dc984d61fdff3bd8334d02c9652cb20dbdfbd1d` | Writer native session status subscriptions |
| [#269](https://github.com/OpenAEC-Foundation/open-office-studio/pull/269) | `346927430297654ccbe995b51dcd6c581bdc4eff` | `3731f25ba3000e1f2927171cdd49bafd314dab11` | Spreadsheet shared render projection registration |
| [#270](https://github.com/OpenAEC-Foundation/open-office-studio/pull/270) | `671a7913492efeca61e27d6a4a7b6fba033df9db` | `949e511afad54af8bda20b7e3d3e5f94da87c92f` | Document pinned selection-format kernel comparison |
| [#271](https://github.com/OpenAEC-Foundation/open-office-studio/pull/271) | `84709329742aa901e908a4264f75a1f8c5abacb8` | `607ece964943462d7018d827978ccd98517735e2` | Shared Spreadsheet differential-format metadata parser |
| [#267](https://github.com/OpenAEC-Foundation/open-office-studio/pull/267) | `a8cb9aa49cb240170df47b4fe260eba7c401c0c9` | `fe28d86a7b5c6233e8a439a0169a48a95a9352fd` | Correct Writer status probe modal cancellation and tab-switch verification |
| [#270](https://github.com/OpenAEC-Foundation/open-office-studio/pull/270) | `14cfe8b66d33eccf78c60541dd2d4ff5e27be09e` | `8a06c2db4e8181d5b3e28b162d362a54dd835cde` | Document additional native selection-format benchmark evidence |
| [#263](https://github.com/OpenAEC-Foundation/open-office-studio/pull/263) | `7a90cb16da652f1d560817db533607513c4583ad` | `f5542db45ffdce029670a68713c70bdc12d987c9` | Spreadsheet nested DrawingML group geometry and source preservation |
| [#274](https://github.com/OpenAEC-Foundation/open-office-studio/pull/274) | `2e62fc279b7fad6ead32ddc4cf090aa41a86dda0` | `543ebcdb2d428db29985a3ab9d8650e04210414f` | Presentation stored slide-number fields after structural edits |
| [#275](https://github.com/OpenAEC-Foundation/open-office-studio/pull/275) | `9afc96b57be94cda01a0a1da221bc10dd7e2c85a` | `fee8b45e6280b9fe63e1b97e90c126f1cd3c9cc8` | Presentation rich notes with focused-save and independent drafts |
| [#273](https://github.com/OpenAEC-Foundation/open-office-studio/pull/273) | `1ec64f2758dcc8767babe174019904a816db4691` | `a21e185ec7de755650f150bbb9ebb91b9ffb4421` | Spreadsheet eight-patch native tables and named cell styles |
| [#276](https://github.com/OpenAEC-Foundation/open-office-studio/pull/276) | `97cab703dda702215bf6b9b3fa262b82c9097d89` | `122e3d5769f21bd6ae5c585382e1652d2dc34eab` | Writer editable drawings and embedded-picture media fallback |
| [#277](https://github.com/OpenAEC-Foundation/open-office-studio/pull/277) | `74bd7432b79b9fb4ee580f42a592beee0769e140` | `0c6bac8ea80323a89e2a4f85d9d188a62a620b2d` | Spreadsheet conditional-format differential style rendering |
| [#266](https://github.com/OpenAEC-Foundation/open-office-studio/pull/266) | `617f23bf7dd0d258f337ec54075139ef38b01a5e` | `3b2415887d38c99b8328b5b813d6e03eec1ac9ad` | Writer story parts, style selection and one-shot document reload navigation |

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
- PR #201 is included through PR #233; no separate duplicate patch is applied.
- PR #211 is included through PR #233; no separate duplicate patch is applied.
- PR #213 is included through PR #233; no separate duplicate patch is applied.
- PR #237 is included through PR #233; no separate duplicate patch is applied.
- PR #229 is included through PR #241; no separate duplicate patch is applied.
- PR #234 is included through PR #241; no separate duplicate patch is applied.
- PR #235 is included through PR #241; no separate duplicate patch is applied.

## Integration checks

| Check | Source head tested | Passed | Failed | Skipped |
| --- | --- | ---: | ---: | ---: |
| batch-1-targeted | `742f2809` | 57 | 0 |  |
| pr236-targeted | `a15615abe1cf60b60d73d146456c89097ec04592` | 52 | 0 | 0 |
| pr242-targeted | `054d1d7a23eb889782ff17c79cd1e955c2bd7fef` | 114 | 0 | 0 |
| pr240-targeted | `460ff3b4635fd181edb0a4fffc983f11ae488053` | 16 | 0 | 0 |
| pr246-targeted | `86604f640bb9003ceaa2093f53822b5a981128ed` | 131 | 0 | 0 |
| pr191-targeted | `eb4c062051c70557e0d6f9ab92a4226ed47f7c0b` | 8 | 0 | 0 |
| pr192-targeted | `72f6813df492bcd7695ed158049859a8507b5efc` | 8 | 0 | 0 |
| pr193-targeted | `3fa694a128e03ed3516c9a97bd7d1a84d6deaac1` | 4 | 0 | 0 |
| pr187-related-unit | `a40506bbb16d1fa3758278ecf6dc074db572cfc0` | 13 | 0 | 0 |
| pr221-related-unit | `f3bae07dcbeb45993a09d2789354b36e68b3b1a3` | 13 | 0 | 0 |
| pr194-targeted | `9f161f58b53d03ff08005483d70c449cf12bbe25` | 10 | 0 | 0 |
| pr200-targeted | `42f071ae9f40821cdefcf617b596d331493bf65b` | 15 | 0 | 0 |
| pr195-targeted | `55fc4cc01d4e8cc041e983aa17613f7f9221b58d` | 16 | 0 | 0 |
| pr214-targeted | `d4d2311aaef6260a5edd0e9c82ff6a82b61e54db` | 26 | 0 | 3 |
| pr216-related-unit | `5560c228262a04d0108be26ec82efc216aaa9d96` | 10 | 0 | 0 |
| pr224-targeted | `8e9c89dd78734abe660d237541bb43533d48a7a9` | 6 | 0 | 0 |
| pr190-related-unit | `92be2e3a07aee7c456fe58971d021770078b7414` | 21 | 0 | 0 |
| pr197-targeted | `c0b487d05057d9df2cf486f1cd5fd6112bff4b72` | 21 | 0 | 0 |
| pr206-targeted | `28b0b60efbc7f72e8e292f4076322f219edb1f99` | 27 | 0 | 0 |
| pr212-targeted | `13ac7fce1ddea9e02b82d2b29fd9431545baf33b` | 35 | 0 | 0 |
| pr222-targeted | `27c43dd74de8d44c6bccad6a069c6659668b6369` | 13 | 0 | 0 |
| pr225-targeted | `0c022aa7bc93748578109bb03ce8f64a22f6c0a2` | 29 | 0 | 0 |
| pr227-targeted | `2a94541c7be665e77aacf1f966eff5af4b6456f4` | 7 | 0 | 0 |
| pr218-targeted | `9a8a2969fab8e7f9c5416bbd79063ffc7c41217a` | 28 | 0 | 0 |
| pr245-targeted | `65512f0718f76834964904482e66e233855c7597` | 30 | 0 | 0 |
| pr202-targeted | `90bc18c448e3337ba2f6f39d9137a342bb463767` | 17 | 0 | 0 |
| pr210-targeted | `10f963cdfa8f563dff8862baf2df8baeaeee1c67` | 12 | 0 | 0 |
| pr223-targeted | `8183faa8e59ef8b95a7603748b21bee5ce092d10` | 6 | 0 | 0 |
| pr204-related-unit | `b1f0e8ee7c200483e6f9ecd98fa51dba0a17ac99` | 8 | 0 | 0 |
| pr233-targeted | `aaea78acbe03fa1517c0779fbb9ef59ece2b32e6` | 124 | 0 | 0 |
| pr243-targeted | `fdf520aeb2ab6b20fefac42a80a69646386abca9` | 19 | 0 | 0 |
| pr247-targeted | `e8123bb04a80bcf03f578e6b0b7645288d52384a` | 27 | 0 | 0 |
| pr249-related-unit | `59ad7a46cd2447688f82a390c9fecf3517d172c5` | 29 | 0 | 0 |
| pr250-targeted | `65971f5bbba139f484aec904c72c4d46fbbc5978` | 22 | 0 | 0 |
| pr241-targeted | `9b16c29412a2fc338d3e5a5ee0085a66ad1eef44` | 58 | 0 | 0 |
| pr233-targeted | `73347b5aceb44379cff66e143c5a791d7a09e747` | 20 | 0 | 0 |
| pr252-targeted | `e2733071c1285792a9cddca99df3960440a260d2` | 38 | 0 | 0 |
| pr251-targeted | `c1b2fbd1fcf5289ca2af72683451552b71925897` | 45 | 0 | 0 |
| pr246-targeted | `2e1dcde1c6c0b5ebfbac54e346ac7594ae5f5651` | 20 | 0 | 0 |
| pr236-targeted | `d0589466120e5b71cb194ee1e42404bec6d31431` | 12 | 0 | 0 |
| pr255-targeted | `f356bb64e5227bc39b2e767ac9da123f0be408a0` | 7 | 0 | 0 |
| full-application-after-field-queue | `7b58503511c89e408c08b42e5fa8c148fe7aabf3` | 2796 | 0 | 7 |
| pr245-related-unit | `6348da9ea2de0c8b224b3cade9984af960409e59` | 30 | 0 | 0 |
| pr254-targeted | `fc9980430de3c22341cbd6b51b65e4c27085adba` | 11 | 0 | 0 |
| pr233-targeted | `016a4e3f4d1c2c659f543ddcf7c8d0ed2c25c6ab` | 19 | 0 | 0 |
| pr246-targeted | `5a62feb9b163cd05ccf73f20439f6cb5232a9cdb` | 23 | 0 | 0 |
| pr256-targeted | `6d4bdffde4a2a8a8c82818cd78f0f9e285845e51` | 16 | 0 | 0 |
| pr245-related-unit | `2462550e9a43755fdfa7c8a62e455fb4339940c7` | 20 | 0 | 0 |
| pr257-targeted | `5c9b4f13ae00253d1dc586cbbe7d931b370ed857` | 16 | 0 | 0 |
| pr258-targeted | `4843eb503dd797daa9cc3c8a4f8584033cce67c6` | 21 | 0 | 0 |
| pr260-targeted | `8a775cbb09b7ba409e16bd83c8b3c480f379f8f7` | 10 | 0 | 0 |
| full-application-2026-11-10 | `4175e5f19bf052e0a03f4a87ab73e710f6f163a7` | 2858 | 0 | 7 |
| pr261-targeted | `514265522edc045a3b27973c5226ea20ff36f917` | 13 | 0 | 0 |
| pr262-related-unit | `835601a16e18e9ff672242675f40894e8488f587` | 22 | 0 | 0 |
| pr263-targeted | `d56740da10dc89eaeafe8963ec65f1aafc696103` | 12 | 0 | 0 |
| pr264-targeted | `bbea3155779c799862acc66b792e3cd3cb2e5b37` | 21 | 0 | 0 |
| pr265-targeted | `e38910931eb351994fdd981dd96342277cc4dda8` | 22 | 0 | 0 |
| pr267-targeted | `8dc984d61fdff3bd8334d02c9652cb20dbdfbd1d` | 6 | 0 | 0 |
| pr269-targeted | `3731f25ba3000e1f2927171cdd49bafd314dab11` | 2 | 0 | 0 |
| pr270-related-unit | `949e511afad54af8bda20b7e3d3e5f94da87c92f` | 6 | 0 | 0 |
| pr271-targeted | `607ece964943462d7018d827978ccd98517735e2` | 4 | 0 | 0 |
| pr267-related-unit | `3f0413d3660335cbee41289b8d4fc486593abdc5` | 6 | 0 | 0 |
| pr267-related-unit | `fe28d86a7b5c6233e8a439a0169a48a95a9352fd` | 6 | 0 | 0 |
| pr270-related-unit | `8a06c2db4e8181d5b3e28b162d362a54dd835cde` | 6 | 0 | 0 |
| full-application-candidate-phase1-2026-11-10 | `6bbcf79e0f8892a61420d86848402f144812e5b0` | 2916 | 0 | 7 |
| pr263-targeted | `f5542db45ffdce029670a68713c70bdc12d987c9` | 13 | 0 | 0 |
| pr274-targeted | `543ebcdb2d428db29985a3ab9d8650e04210414f` | 11 | 0 | 0 |
| pr275-targeted | `fee8b45e6280b9fe63e1b97e90c126f1cd3c9cc8` | 20 | 0 | 0 |
| pr273-targeted | `a21e185ec7de755650f150bbb9ebb91b9ffb4421` | 23 | 0 | 0 |
| pr276-targeted | `122e3d5769f21bd6ae5c585382e1652d2dc34eab` | 32 | 0 | 0 |
| pr277-targeted | `0c6bac8ea80323a89e2a4f85d9d188a62a620b2d` | 8 | 0 | 0 |
| full-application-candidate-phase3-2026-11-10 | `828dcbeb021cb81d2c2704ecf2f2746ef185f698` | 3016 | 0 | 7 |
| pr266-targeted | `3b2415887d38c99b8328b5b813d6e03eec1ac9ad` | 22 | 0 | 0 |

## Pending deliveries


## Limits

- Broad issues remain open; integrating a completed fix does not certify every acceptance criterion.
- Native Windows builds are checked in CI because local Application Control blocks Cargo build scripts.
- No live Y-app storage environment is used, as requested by the user.
- Experimental PR116 and uncommitted work are not integration deliveries.
