# #33/#83: overgangsbehoud bij ODP-conversie

## Gemeten op 9 november 2026

Een kopie van `docs/voorbeelden/Ontwerpvisie.pptx` kreeg op alle drie dia's
dezelfde schuifovergang: richting `r`, duur 400 ms, automatisch na 1800 ms,
muisklik uit en één gedeeld, ingesloten PCM-WAV-geluid. Rechtstreeks openen,
opslaan en heropenen in de eigen PPTX-engine bewaart deze gegevens.

De werkelijke conversie via portable LibreOffice 26.8.2.2 gebruikte een eigen
profiel met `src-tauri/src/conversieprofiel.xcu` uit d2043ead (PR238), een
ongewijzigde grens van 45 seconden en de filters `odp:impress8` en
`pptx:Impress MS PowerPoint 2007 XML`. De twee conversies duurden 20,440 en
8,055 seconden. Er zijn geen gebruikersprofielen of OS-instellingen gewijzigd.

| Kenmerk | Bron-PPTX | PPTX na ODP-rondreis |
| --- | --- | --- |
| Effect | push | push |
| Richting | `r` | `l` |
| Exacte duur | 400 ms | 400 ms |
| Automatisch doorgaan | 1800 ms | 1000 ms |
| Muisklik | `advClick="0"` | afwezig, dus standaard aan |
| Geluidsactie | alle drie dia's | alleen eerste dia |
| Mediaonderdeel | één WAV | één WAV, bytes aanwezig |

In de tussenliggende ODP staan wel drie `presentation:sound`-verwijzingen.
Het verlies van twee acties treedt dus bij de terugconversie op. De ODP
gebruikt `presentation:duration="PT1S"` in plaats van de 1800 ms uit de bron.

## Geldigheid en vervolg

Het ODP-bestand slaagt voor alle zes controles van de officiële OASIS
ODF 1.3-validator uit PR238: mimetype als eerste/on-gecomprimeerde ZIP-entry,
`content.xml`, `styles.xml`, `meta.xml`, `settings.xml` en manifest. De twee
schema's zijn tegen de SHA-256-waarden uit die validator gecontroleerd.
Een geldig document garandeert hier dus geen volledig overgangsbehoud.

#33 blijft open. Vervolgwerk moet de conversiegegevens correct overzetten
of de precieze instellingen aantoonbaar bewaren/herstellen, met checks op
richting, milliseconden, klikbeleid en geluidsactie per dia. Dit rapport
rechtvaardigt geen behoudclaim voor ODP, OTP, FODP, PPT of PPS en sluit geen
breed formaatissue.

## Gerichte reparatie op 10 november 2026

De standaard ODF-correctie en de herhaalbare native ODP/OTP/FODP-matrix staan
in het [vervolgrapport met de nieuwe controles](../tests/2026-11-10-presentatie-odf-overgangen.md).
Daar slagen de geteste exacte tijden, vier schuifrichtingen en het uniforme
klikbeleid; ODP en OTP behouden ook het gedeelde geluid op vier dia’s. De
oorspronkelijke meting hierboven blijft de fout vóór die correctie beschrijven.
De afbakening en resterende grenzen staan in het nieuwe rapport; #33 blijft open.
