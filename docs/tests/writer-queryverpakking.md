# Afgekeurde querywachtroute met layoutbronversie

Ook de lokale 45.45-proef is afgekeurd en teruggedraaid. De behouden appbron
blijft 45.43 / Rust alpha57. De nieuwe bronversiehelper gebruikte de juiste
layoutmetadata, maar de resolver las het verkeerde object.

De echte renderer publiceert `A.publish({queries:Ae,frameEpoch:...})`.
De proef vroeg metadata en gereedheid op van deze verpakking in plaats van
van `snapshot.queries`. Daardoor liepen de verzoeken telkens na ongeveer vijf
seconden af, ondanks inmiddels actuele en gereedstaande queryobjecten.

De fysieke referentie op 45.43 toont alle nieuwe tekst na 22.291 ms en behoudt
alle 3.329 alinea-/celteksten exact. De eerste kandidaat heeft na negentig
seconden nog geen volledig gelijk getekende alinea. Alle 351 toetsen waren
ontvangen; zeventien time-outs zijn vastgelegd. De geplande vierledige meting
is na deze afkeuring gestopt en bewijst dus geen volledige vergelijking.

Twee aparte twaalfsecondenopnamen delegeerden `WeakMap.get` ongewijzigd aan de
oorspronkelijke methode en registreerden alleen bronlezingen van queryobjecten.
De tweede opname bewaart ook gereedheid, bronstatus en begrensde aanroepstacks.
Zeven registraties tonen een gelijke native/layoutbronversie en `ready=true`
terwijl de wachtroute nog loopt. De verdenking dat de weergave uitsluitend op
het leeglopen van de invoerwachtrij wacht, wordt hiermee niet bevestigd.
Deze aanvullende opnamen zijn diagnose, geen nieuwe snelheidsacceptatie.

De 33 gerichte en 1.834 volledige frontendtests en productiebouw waren groen.
Hun resolverfixtures gebruikten echter een kaal queryobject. De extra proef
met de echte queryconstructie controleerde alleen het binnenste object en
niet de publicatieverpakking. Deze dekking was onvoldoende. Een volgende
regressie moet daarom eerst de echte publicatiecallback uitvoeren en dezelfde
verpakking aan de echte resolver aanbieden.

De exacte negatieve ELF blijft lokaal bewaard met SHA-256
`5a35a86227724254a2d827c753506207de61e00d0adda383744f0d02c16e112e`.
Bronnen, oorspronkelijke fout, beide aanvullende opnamen, scripts, logs en
beelden staan checksumgebonden in het [bewijsmanifest](2026-11-05-writer-queryverpakking.json).
Alle runtime-/versiewijzigingen zijn op hun bevroren hash gecontroleerd en
bytegelijk teruggezet; de oorspronkelijke patch is offline hersteld. Er is
geen prototype, officiële release, gesloten issue of migratieacceptatie gepusht.
