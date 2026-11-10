# Gerichte Presentation-verversing

Deze vervolgwijziging bouwt voort op PR #240. De drie PPTX-pakketten zijn exact op de officiële versie 0.5.1 vastgezet. `legacySyncApi` behoudt het synchrone app-contract, inclusief de handle voor bestandsbewerkingen en status. De workerroute is hiermee nog niet ingeschakeld. De Spaanse enginevertaling bevat de nieuwe verplichte sleutels.

Versie 0.5.1 voorkomt al veel herhaald miniatuurwerk. Toch leest de synchrone React-editor bij elke navigatie en toetsaanslag een volledige presentatie. De app-adapter hergebruikt de bestaande weergave bij gelijke handle en versie. Alleen voor de gecontroleerde, synchrone toetsenroute in het actieve tekstverhaal leest hij de gewijzigde dia via de openbare `readCommandContent({ slideIds })`. Anders gebruikt hij de bestaande volledige snapshotroute. `readContent` is hiervoor ongeschikt: de native implementatie daarvan maakt eerst een volledige snapshot en filtert die daarna.

De gerichte route controleert eigenaar, documentversie, verhaal, dia-ID en het verwachte aantal documentmutaties. Onbekende, voorafgaande of re-entrante mutaties vallen terug op de volledige lezing. Alleen de vormen van de actieve dia worden vervangen; dia-eigenschappen blijven identiek aan het oorspronkelijke snapshotcontract. De handle ruimt zijn mutatieluisteraar bij sluiten op; de WeakMap bewaart geen historische documenten. De bestaande `onChange`-snapshot levert tevens het statusaantal, zodat de statusbalk geen tweede volledige snapshot maakt.

`scripts/presentatieengine-compatibiliteit.ts` past zes exacte fragmenten in de gepubliceerde React-bundel aan. Dit is een tijdelijke integratieadapter: een SHA-256-controle en unieke fragmentcontroles laten de build stoppen wanneer de afhankelijkheid wijzigt. De workerroute behoudt de oorspronkelijke verversing. Bij een SDK-upgrade moet deze adapter opnieuw worden beoordeeld of door een upstream-oplossing worden vervangen.

## Meting en controles

De browserproef uit `docs/app-performance.md` gebruikt 100 dia's en 1.202 vormen, met viermaal vertraagde CPU. Hij wacht nu expliciet op de asynchrone miniaturen buiten de gemeten fase, meet toetsen tot de tweede animation frame en vergelijkt alle 100 miniaturen vóór en na de tekstbewerking. Er worden gewone toetsenbordinvoer, Undo/Redo, dia-invoeging/verwijdering en opslaan/heropenen gecontroleerd.

| Meting | PR #240 | Officiële 0.5.1 | 0.5.1 + gerichte verversing |
| --- | ---: | ---: | ---: |
| Navigatiereeks, inclusief vaste wachttijden | 39,40 s | 7,29 s | 4,36 s |
| Typereeks, inclusief vaste wachttijden | 34,58 s | 7,88 s | 3,36 s |
| Volledige publieke snapshots tijdens navigeren | 15 | 15 | 0 |
| Gerichte leesaanroepen tijdens typen | — | — | 16 / totaal 93 ms |
| Native fontsets tijdens navigeren | 104.754 | 360 | 360 |

Dit zijn afzonderlijke verkennende runs op een gedeelde computer, geen hardwaregarantie. De laatste run had bij typen nog een 95e percentiel van 217 ms van toets tot twee frames, een maximaal frame-interval van 200 ms en lange taken. Navigeren had nog een maximaal frame van 733 ms. Verdere optimalisatie blijft nodig. Viermaal vertraagde CPU simuleert geen beperkt RAM.

Alle 100 dia's, 1.202 vormen en verwachte teksten blijven na heropenen behouden. Alleen de bewerkte miniatuur verandert; de overige 99 blijven pixelgelijk. Alle 23 native/Offscreen-canvasfontgevallen slagen. Tien echte-engine tests controleren snapshotgelijkheid, versie-/eigenaarisolatie, selectie vervangen/wissen, alinea-invoer, afbeeldingbytes en conservatieve terugval bij extra of geweigerde mutaties. De adaptertests bewaken versie, fragmenten en letterlijke minified identifiers.

Gecombineerde controle: TypeScript en meetbuild slagen; de volledige suite bevat 2.019 geslaagde tests en 7 bestaande skips. De meetbrug staat uitsluitend in de aparte meetconfig. De functionaliteit op andere issuebranches is hiermee nog niet gecombineerd.
