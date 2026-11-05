# Vastgepinde spreadsheetparser

`xlsx-parse` bevat de gepubliceerde crate `betteroffice-xlsx-parse` 0.5.1, met één gerichte correctie in `src/write.rs`. De minimale nieuwe worksheet schrijft de drie gemodelleerde standaardrijattributen `defaultRowHeight`, `customHeight` en `zeroHeight` vóór kolommen en celdata. Ongeldige standaardhoogten worden geweigerd volgens dezelfde eindige grens als de gepinde lezer. De bestaande bronroute wordt niet uitgebreid met onbekende modeleigenschappen.

[xlsx-parse-bron.json](xlsx-parse-bron.json) registreert alle 40 oorspronkelijke bronbestanden, de SHA-256 van de gepubliceerde crate, de aangepaste bestandshash en de drie aanvullingen. `LICENSE`, `NOTICE` en `THIRD-PARTY-NOTICES.md` komen ongewijzigd uit dezelfde upstream Git-revisie als de crate. De pakketmaker neemt die notices mee. `controleer-bron.py` controleert bron en aanvullingen byte voor byte.

Eigen regressieproeven staan bij `crates/office-core/tests/rekenblad_snelle_navigatie.rs`. De oorspronkelijke upstream-proeven worden daarnaast afzonderlijk met hun gepubliceerde lockfile en beide testfeatures uitgevoerd. De oorspronkelijke bron, afkeuringen en hertests blijven gescheiden; een geslaagde deelproef bewijst geen volledige spreadsheet- of formaatpariteit.
