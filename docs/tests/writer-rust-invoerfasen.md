# Werk binnen de Rust-invoerfunctie

De afzonderlijke proef op de bestaande alpha57-kern slaagt. Beide werkelijk
verschillende Linux-binaries houden alle verhalen, opmaak, identiteiten,
selectie, Undo/Redo en alle uitgepakte DOCX-onderdelen gelijk aan de SDK.
De twee kernvarianten hebben dezelfde bronvector; vier afwijzingen per variant
laten daaropvolgende geldige invoer toe. Vier voorbereidingsproeven en de
volledige 81 Python-tests slagen. Appcode en appversie 45.49 zijn ongewijzigd.

Bij 68 synthetische groepen van dezelfde tekst is 67 maal de voorspelde
replica hergebruikt. De buitenste kernfasen kosten samen circa 5.692 ms.
Volledige bronserialisatie vraagt daarvan 3.295 ms, circa 58%. De bewerking
kost 1.591 ms, de cachecontrole 382 ms, replica-opbouw 282 ms en de eerste
bronimport 142 ms. Binnen de bewerking zijn plaatsen 482 ms, mutatie 773 ms,
cursor 242 ms en delta-opbouw 83 ms. Binnen- en buitenfasen overlappen;
niet dubbel optellen. Dit verklaart geen volledige GUI-doorlooptijd.

De eerste bouwopzet hergebruikte dezelfde ELF; nul fasemeldingen wezen de
proef terecht af. Afzonderlijke targetmappen herstellen de proefopzet.
Een daaropvolgende gecombineerde opdracht eindigt na geslaagd compileren met
procescode 143 en zonder volledig rapport; ook die ronde telt niet als succes.
De definitieve korte bouwhercontrole en volledige gegevensproef eindigen
met code 0, verschillende ELF-hashes en exact 136 fasemeldingen. Oorspronkelijke
uitvoer en binaries blijven afzonderlijk behouden. Dit is geen productfix.

Vervolg: behoud of binaire samenvoeging van bevestigde bronbytes onderzoeken,
met volledige bron-/vectorbewaking, koude terugval en dezelfde gegevensproef.
Daarna is een werkelijke GUI-vergelijking noodzakelijk: een eerdere snellere
Rust-journaalproef maakte de GUI juist trager. Niet blind opnieuw aansluiten.
De afzonderlijke CI49-fout in retained layout blijft urgent en is niet door
deze kernproef opgelost. Geen issue of migratievlag gesloten.

[Exacte bronkopieën, bouwafkeuring, fasen en pariteit](2026-11-05-writer-rust-invoerfasen.json).
