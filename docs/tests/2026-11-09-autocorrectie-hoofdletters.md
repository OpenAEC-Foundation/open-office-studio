# Hoofdletters behouden bij autocorrectie — deel van #21

## Gereproduceerde fout

Het patroon voor typefoutvervanging bewaarde alleen de eerste hoofdletter.
Daardoor veranderde volledig in hoofdletters getypte tekst bijvoorbeeld van
`TEH` naar `The`, `DONT` naar `Don't` en `GEINTERESSEERD` naar
`Geïnteresseerd`. Alle acht nieuwe regressiegevallen falen op de oorspronkelijke
code. Dit omvat Nederlands, Brits Engels en Amerikaans Engels, aan het begin
en midden van een zin, diakritische tekens, apostroffen, meervoudige woorden
en afkortingen met punten.

## Correctie en controle

Een typefout die volledig in hoofdletters is getypt krijgt nu ook een volledig
in hoofdletters geschreven vervanging: `THE`, `DON'T`, `GEÏNTERESSEERD`,
`NOG STEEDS` en `D.M.V.`. De bestaande afhandeling van gewone woorden,
zinsbegin, dubbele hoofdletters, URL's en persoonlijke uitzonderingen blijft
van toepassing.

De 39 gerichte spellingtests slagen, met drie bestaande overgeslagen
woordenboekproeven waarvoor de gekopieerde runtime-assets nodig zijn.
Daaronder zijn drie nieuwe proeven met de echte Yrs-engine. Die gebruiken
dezelfde versie- en tekstbewaking als de autocorrectiekoppeling in Writer en
controleren de correctie, één keer Undo, Redo en DOCX-opslag/heropenen.

```text
pnpm exec vitest run --configLoader runner src/spelling/spelling.test.ts src/spelling/autocorrectie-engine.test.ts src/spelling/tekst/tekst.test.ts
pnpm exec tsc --noEmit
```

De volledige suite (`pnpm exec vitest run --configLoader runner --maxWorkers=2`)
slaagt met 1.998 tests en tien bestaande overgeslagen tests in 176 bestanden.
Typecontrole, productiebuild (`pnpm exec vite build --configLoader runner`)
en `git diff --check` slagen eveneens.

Dit is een gerichte deelfix voor #21. Fysieke toetsenbordinvoer in de native
Windows-app en het volledige spellingcontroletraject zijn niet opnieuw getest;
de geautomatiseerde controles betreffen de correctiebeslissing en de echte
documentbewerkings-/opslagroute. #21 blijft open voor de overige criteria.
