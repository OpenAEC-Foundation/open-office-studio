# PR #349 — onafhankelijke centrale Linux-nativecontrole

**Geslaagd voor de afgebakende native Writer-rondetrip en leesbare paginapixels.** De centrale helper werkt met de CI-only workaround voor [#355](https://github.com/OpenAEC-Foundation/open-office-studio/issues/355). Dit is geen volledige native acceptatie van #327 en geen algemene Linux-productfix. Niets is naar `main` samengevoegd.

## Exacte herkomst

De bestaande centrale run [43848943684](https://github.com/OpenAEC-Foundation/open-office-studio/actions/runs/43848943684), job **133236204823**, is onafhankelijk gecontroleerd. Er is geen tweede run gestart. De workflow/harness komt van integratiehead **d73539b10d6a0a96956050766b0d850474b55910**. De applicatie-checkout en het oorspronkelijke pakket blijven **e1f84f84f4d72e5ce8ab967e376a6f38344edf39** (F), tree **2e6123201cd3a357ac3b2df8126fa15760fce865**. De wijzigingen F → d735 betreffen uitsluitend CI, testhelpers en bewijsdocumenten; de applicatie-inputs zijn gelijk. Het native resultaat wordt niet als een nieuwe applicatiebuild gelabeld.

- Oorspronkelijk DEB uit build **43838167666**: SHA256 **14d588cdfcebc6e50607033a324c3e6c37a77f440a5aebd36b5a6356d4ea3eb5**.
- DEB-payload én geïnstalleerde executable: **170a7caaf7a9e44ef8616becc5a3492bace4d78d14f0ac081d2e011a9b6e8b85**.
- tauri-driver 2.1.0: **a71b247ca519f3ed02a364cd8692d71d381ffe81279c94c6ed65ec300d217868**; WebKitGTK/driver **2.50.4-0ubuntu0.22.04.1**, Node **22.23.4**.
- Centrale helper `scripts/proef-native-linux-basis.mjs`, SHA256 van Git-blob op d735: **0a96af9d43abe7c941da7ce52736a041306457b4d9d46cf512753837d0c4ce67**. De workflow checkt F en de afzonderlijke vaste harnessref uit.
- Resultaatartifact **14216636794**, `native-linux-writer-recheck`, **241392 bytes**. De gedownloade ZIP is lokaal gehasht: **d1bfa990cb3c9eec09a5608aa1ca2effea8f12b86f4071f0fc42c75b3a65bee6**, gelijk aan de Actions-digest.

## Effectieve omgeving en scope van de wijziging

Het centrale runtime-rapport bevestigt `GDK_BACKEND=x11`, `LIBGL_ALWAYS_SOFTWARE=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1` en `WEBKIT_DISABLE_COMPOSITING_MODE=null` (niet ingesteld).

De d735-patch zet de DMABUF-variabele uitsluitend op de native Linux/Xvfb-uitvoerstap van `.github/workflows/desktop.yml` en `.github/workflows/native-linux-353.yml`. De centrale helper registreert de vier effectieve graphicswaarden. Geen variabele is aan pakketbouw, productlauncher of andere platforms toegevoegd. De oorspronkelijke baselinefouten en gerichte tegenproeven blijven in [het paintverslag](2026-11-16-pr349-linux-paint.md) bewaard.

## Onafhankelijke verificatie

Alle vier centrale native assertions slagen: geïnstalleerde app opent via de echte native backend, werkelijke toetsenbordbewerking/Ctrl+S schrijft de marker, het app-proces sluit volledig, en een nieuw proces met andere PID heropent dezelfde bytes en vindt één resultaat.

De uitgepakte `word/document.xml` bevat onafhankelijk gecontroleerd exact **`NATIVE_LINUX_SAVED_MARKER Synthetic native Linux document.`** (58 tekens), zonder extra of ontbrekende tekst. De lokaal berekende DOCX-hash komt overeen met `savedSha256` in het rapport. Het artifact-originbestand is gelijk aan de in het rapport vastgelegde herkomst. De eigen app-processen zijn aan het einde afgesloten.

De oorspronkelijke PNG's `saved.png` en `reopened-find.png` zijn beide visueel bekeken: de volledige marker en oorspronkelijke tekst zijn leesbaar op de donkere documentpagina; na heropenen zijn ook het zoekhighlight en één correct Find-resultaat zichtbaar. Ondersteunende metingen in dezelfde tekstregio als de tegenproeven:

| Opname | Regio x/y/breedte/hoogte | RGB-kleuren | Donkere pixels | Heldere pixels | PNG-SHA256 |
| --- | --- | ---: | ---: | ---: | --- |
| saved | 441/326/410/21 | 206 | 7172 | 395 | `d21cb3c664a5a906a724f95eca27759df1ce750e3e9e94b99465e88543d678b4` |
| reopened | 609/326/410/21 | 315 | 4297 | 169 | `4aff1171f1f20097551169368ab595084c3967ab8d69d7776dcf61a1fd818f35` |

De metingen ondersteunen de originele beeldinspectie; alleen een kleurtelling zou geen leesbaarheid bewijzen. De [JSON-receipt](2026-11-16-pr349-central-native-linux.json) bewaart het volledige centrale rapport, herkomst, lokale verificatie en vaste helper-/workflowhashes.

## Resterende grenzen

Dit is de algemene Writer-openen/typen/opslaan/proces-heropenenproef in CI/Xvfb met softwaregraphics. Fysiek Linux/Wayland en AppImage-bediening zijn niet getest. De proef test geen volledige native taalstatus-/selectiegrenzen-/Undo/Redo-/tabacceptatie van #327. Windows-, macOS-, browser- en verdere combinatiecontroles behouden hun eigen bronpunten en worden door de integratiechat bijgehouden. Een groene pakketbouw vervangt die native bediening niet. Er is geen lokale Windows-bediening of schermopnamesessie gestart voor deze controle.
