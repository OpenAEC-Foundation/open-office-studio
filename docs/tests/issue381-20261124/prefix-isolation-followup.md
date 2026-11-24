# #381 — reviewbare QA-prefixisolatie, geen nieuwe runtimeproef

Deze correctie wijzigt uitsluitend het eigen harnas. Productvoorstelb9233f3c, gedeelde runtimeverifier, officiële runtimepin, oorspronkelijke bronfixture/oracle, ABI-policy, loadercontrole en echte engine/edit/save/heropencriteria blijven ongewijzigd. Er is geen CI-run, converter, runtime of nieuwe bouw gestart. Historisch FAIL45381046100 en diens onbekende entrydelta/canonieke postrunbewijsgrens blijven behouden.

`build_runtime.py` compileert/linkt tegen de geverifieerde canonieke dependencybytes en inventariseert de complete canonicalprefix vóór de bouw, na configure, vóór/na beide libraryvarianten en na de bouw. De canonicalconverter wordt nooit gestart. `convert_real.py` geeft packaged/control/patched elk een afzonderlijke, nog niet bestaande `variant-runtime/<variant>` uit exact dezelfde geverifieerde canonieke bron. Ook packaged gebruikt een expliciet als DERIVED gemarkeerde kopie. Bestaande werkprefixen worden geweigerd.

Elke kopie wordt volledig aan het oorspronkelijke manifest getoetst, inclusief alle paden, types, modes, groottes en hashes. De enige vooraf verklaarde derivatie is de geselecteerde libwps-file; de originele mode blijft behouden. Iedere snapshot wordt als oorspronkelijke JSON-inventaris verliesvrij gecomprimeerd bewaard, met afzonderlijke SHA en concrete missing/extra/changed-delta. Na de private conversie worden zowel private als canonicalprefix volledig gecontroleerd, ook bij een converterfout. Onbekende cache-, tijdelijke, mode- of bytewijzigingen worden niet uitgesloten of genormaliseerd: de run blijft rood en beide delta's worden bewaard. Een geslaagde conversie krijgt geen `passed=true` receipt als de eindinventaris faalt.

De zeven lokale regressies gebruiken uitsluitend de drie bestaande echte ELFbytes uit artifact14913128859. Ze toetsen de expliciete packaged/control/patched-librarydelta, isolatie tussen een vervuilde control en verse patchedprefix, weigering van extra paden, ontbrekende paden, onbekende bytewijziging en modewijziging, weigering van hergebruik, en blokkering op een beschadigde canonicalbron. Geen van deze ELFbestanden wordt uitgevoerd. Deze kleine tijdelijke bestandsbomen zijn uitsluitend filesystemtests, geen gekwalificeerde Office-runtime of documentfixture. De werkelijke runtime-entrydelta uit de mislukte getuige is hiermee nog niet verklaard.

Uitvoeren vanuit deze worktree met de reeds bewaarde proofbytes:

```powershell
& 'C:/Users/alper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe' qa/issue381/runtime_prefix_test.py -v
```

`prefix-isolation-followup.json` bevat de gerichte checkreceipt en exacte file/inputhashes. Werkelijke gepatchte conversie, typed-resultaten, edit/Undo/Redo/save/fresh-process en de overige platformen blijven NIET UITGEVOERD. Een volgende getuige vereist afzonderlijke integratiebeoordeling en allocation.
