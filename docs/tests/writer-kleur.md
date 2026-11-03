# Markeerkleur in Writer controleren

De gewone browserproef controleert de opgeslagen opmaak, ongedaan/opnieuw en
een nieuwe editorsessie:

```sh
pnpm build
pnpm exec playwright install chromium
node scripts/test-writer-kleur-gui.mjs
```

De oorspronkelijke fout #125 ontstond in het native GTK-palet. De browserproef
slaagt ook op de oude bron en bewijst daarom niet dat die terugkoppeling weg is.
Gebruik op Linux daarnaast de gebouwde suite met de native proef:

```sh
sudo apt-get install python3-xlib python3-pil python3-venv xvfb xauth xdotool
/usr/bin/python3 -m venv --system-site-packages .local/gui-python
.local/gui-python/bin/python -m pip install --ignore-installed -r scripts/gui/requirements.txt
pnpm desktop:build --no-bundle
.local/gui-python/bin/python scripts/test-writer-kleur-native.py \
  --programma src-tauri/target/release/open-office-studio \
  --versie "$(node -p "require('./package.json').version")" \
  --uitvoer .local/eigen-native-kleurproef
```

Kies voor iedere uitvoering een nieuwe uitvoermap; bestaande mappen worden
geweigerd. De proef start een eigen X11-scherm, D-Bus-sessie en gebruikersprofiel.
Zij maakt een kleine DOCX uit het sjabloon en opent geen gebruikersdocument.
Alleen de zelf gestarte processen worden na afloop gesloten.

De echte muis kiest geel en blauw in het GTK3-palet. De proef controleert de
paletafmetingen voordat zij coördinaten gebruikt en bewaart beelden en de
daadwerkelijke native kleurgebeurtenissen. De opgeslagen DOCX wordt onafhankelijk
gelezen. Ongedaan/opnieuw, een echt getypt extra teken en een nieuw native proces
moeten de verwachte tekst en achtergrondkleur behouden.

De editor-API wordt via de interne React-ref gevonden voor selecteren, bewaren
en inspectie. Dat is uitsluitend een testadapter. De inspectie luistert tijdens
de eigen proef op twee tijdelijke localhostpoorten. De gewone app krijgt geen
nieuwe inspectie- of automatiseringsinterface.

Deze proef dekt het GTK3-palet op Linux. Een afwijkende paletindeling faalt
zichtbaar; Windows, macOS, alle vrije kleuren en de native paletten van de
andere modules vereisen aanvullende proeven. Beide Linux-workflows bewaren het
native bewijs en voeren de proef uit op de suitebinary vóór de losse edities
de gedeelde bouwmap vervangen.

De geïsoleerde Python-omgeving gebruikt de vastgezette WebSocket-bibliotheek uit
`scripts/gui/requirements.txt`. De oude systeembibliotheek op Ubuntu 22.04 faalt
met Python 3.10 voordat de app wordt geïnspecteerd. Dit was de oorzaak van de
afgebroken Linux-vrijgaveproef voor 2026.45.8. De omgevingsreparatie moet ook
op de CI-runner slagen voordat de nieuwe vrijgave als groen geldt.
