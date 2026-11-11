# Writer-verwijzingen na de gecombineerde integratie

Basis: vaste integratiecommit `0d860e9d5487ff3b87dc079f943d31aef8fe5871`.
Een eigen worktree is gebruikt; de centrale integratiecheckout is niet gewijzigd.

De oorspronkelijke productie-browserproef gaf vóór de correctie achtereenvolgens
een opslagfout, een geslaagde ronde en een niet-afgesloten verwijzingsdialoog.
Een diagnostische build bevestigde `stale-document` als exacte layoutfout.
Het opgeslagen falende document van de eerdere integratieproef bevatte alleen
`Nieuw ` waar de kop `Nieuw KLIKBestemmingskop` moest blijven staan.

Een uitgestelde focusherstelling na het sluiten van een verwijzingsdialoog
controleert nu de documentsessie, inhoudsversie en selectie. Toetsen, pending
tekstinvoer en pointeracties vóór die herstelling annuleren haar eveneens.
Daardoor wordt een nieuwere cursor of invoer niet door de oudere selectie
overschreven. De tijdelijke eventlisteners worden bij de volgende framecallback
verwijderd.

Een layout-export die `stale-document` teruggeeft, wordt hoogstens tweemaal
opnieuw gelezen. Het volledige leesplan wordt daarbij opnieuw opgebouwd en
een gewijzigd document wordt ook vóór het schrijven opnieuw gelezen. Andere
layoutfouten en blijvend verouderde resultaten blijven fouten; er worden dan
geen onbetrouwbare veldcaches geschreven. Er zijn geen sleeps toegevoegd aan
de productcode of de proef.

Validatie van de uiteindelijke correctie:

- 53 gerichte tests in acht bestanden geslaagd, waaronder 21 verwijzingsproeven.
  Nieuwe gevallen controleren gewijzigde selectie, gewijzigde tekst, nog niet
  verwerkte invoer, stabiele focus, tijdelijke en blijvende layoutfouten en
  een gewijzigde versie tijdens export.
- TypeScript en productiebuild geslaagd.
- De ongewijzigde navigatie-/DOCX-asserties van `proef-verwijzingen.mjs` slagen
  drie keer achtereen bij viermaal vertraagde CPU. De eerdere ronde van de
  correctie slaagde daarnaast vijfmaal zonder vertraging.
- `proef-vergelijkingen.mjs` slaagt eveneens bij viermaal vertraagde CPU:
  formule invoegen, MathML-voorbeeld, bewerken en geneste OMML opslaan.
  De eerder gemelde losse formule-opstarttimeout is in deze proef niet opnieuw
  gereproduceerd; de formuleproductcode is niet gewijzigd.

Reproductie op een productiebuild:

```powershell
$env:OOS_BROWSER_CPU_RATE = '4'
node scripts/proef-verwijzingen.mjs .local/dist
node scripts/proef-vergelijkingen.mjs .local/dist
Remove-Item Env:OOS_BROWSER_CPU_RATE
```

De CPU-optie is uitsluitend voor de browserproeven. De volledige centrale
suite en andere leveringen vallen onder de integratiechat; deze delta omvat
geen nieuwe features of wijzigingen aan de native kern.
