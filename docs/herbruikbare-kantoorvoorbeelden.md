# Herbruikbare kantoorvoorbeelden

Voor [issue 108](https://github.com/OpenAEC-Foundation/open-office-studio/issues/108)
is `packages/voorbeeld` afgescheiden als `@openaec/voorbeeld`. De distributie
bestaat uit een kleine React-component en complete statische rendererassets.
De host hoeft geen Office-shell, Tauri, accountbackend of conversieserver te
installeren. De gepatchte engines worden tijdens het bouwen meegenomen; er
zijn geen runtime-imports naar de Office-app.

## Gekozen route voor Y-next

[Y-app-ERPNext#2](https://github.com/OpenAEC-Foundation/Y-app-ERPNext/issues/2)
kan hiermee de clientroute toepassen voor DOCX, XLSX en PPTX. De serverroute
voor de overige formaten blijft een afzonderlijk traject. De preview vervangt
de bijlage niet en kent geen ERPNext-bestandsroute.

De aansluiting in het bestaande bijlagepaneel bestaat uit:

1. Behoud de bestaande autorisatie en het bestaande ophalen van bijlagen.
   Maak per geselecteerde bijlage één stabiele `VoorbeeldBron` waarvan
   `laad(signal)` die bestaande route gebruikt. Controleer de HTTP-status
   voordat de bytes worden teruggegeven. Ook `/private/files/` blijft via de
   eigen gebruikerssessie lopen.
2. Kopieer tijdens de hostbuild de frame-assets met `kopieerVoorbeeldAssets`.
   Geef de bij de uitrol behorende `assetBasis` mee; ook een submap werkt.
   Dit vereist alleen statische hosting, geen nieuwe backendmethode.
3. Toon `KantoorVoorbeeld` in hetzelfde paneel als de bestaande PDF-/IFC-
   voorvertoning. Behoud de bestaande downloadknop buiten het frame. Vertaal
   de statusmeldingen met `teksten` naar de taal van de host.
4. Handel `conversie`, `onbekend`, `teGroot` en `fout` af zonder een succesvolle
   voorvertoning te suggereren. DOC/XLS/PPT, RTF en OpenDocument vragen om
   conversie. CSV en andere tekstformaten kunnen bij de bestaande tekstviewer
   blijven. Een DOCX-naam alleen is geen bewijs dat een bestand DOCX bevat.
5. Vervang de bron bij een andere bijlage of gebruikerscontext. De component
   breekt het oude ophalen af en negeert late antwoorden. Verwijderen van de
   component verwijdert ook het rendererframe en zijn workers.

De feitelijke wijziging van Y-next en eventuele pakketregisterpublicatie
vallen buiten deze Office-wijziging. Dit document en het pakket leveren de
technische overdracht; er wordt niet beweerd dat de voorbeeldknop al in
Y-next is uitgerold. De huidige Office-mailkaart wordt evenmin stil vervangen.

## Alleen-lezen en laden

Iedere engine staat alleen-lezen, met verborgen bewerkingslint en geweigerde
opslagverzoeken. Een eigen frame houdt engine-CSS, React en fontinstellingen
gescheiden van de host. De host geeft een kopie van de bytes door via een
MessageChannel nadat het verwachte frame zijn sessie heeft bevestigd. Ook
omleidingen van de assetpagina worden geweigerd. Het frame kan geen
downloads, pop-ups of navigatie van de bovenliggende pagina starten.

De bundel- en laadafspraken staan in de [pakketdocumentatie](../packages/voorbeeld/README.md).
De hostcomponent mag maximaal 8 KiB gzip toevoegen; de volledige distributie
maximaal 128 MiB. Alle font- en WASM-assets worden meegeleverd voor lokale
hosting, maar worden niet vooraf op de mailpagina opgehaald. Per geselecteerd
document wordt alleen de benodigde engine geladen. Voor bron, uitgepakte
inhoud en laadtijd gelden expliciete grenzen en een zichtbare foutstatus.

De [browserproef en screenshots](tests/2026-11-06-voorbeeldpakket.md) zijn
gemaakt met een echte tarball in een afzonderlijk gebouwde host, zonder
Office-server of Tauri-proces. CI herhaalt deze pakketproef en bewaart ook het
downloadbare pakket als bouwresultaat.
