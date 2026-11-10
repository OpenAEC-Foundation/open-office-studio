# Synthetische volumefixture

`synthetic-volume.mp4` is een eigen twee seconden durende VP9/Opus-MP4-opname van
een canvas van 320 × 180 pixels: een bewegend oranje vlak, een testtekst en een
synthetische sinus van 440 Hz. Er is geen extern beeld, opgenomen persoon,
muziek of microfoon gebruikt. `synthetic-volume.png` is het bijbehorende
canvasbeeld met dezelfde beeldverhouding.

De bestanden zijn gemaakt met `node scripts/maak-presentatie-media-proef.mjs`.
Regeneratie vereist Playwright Chromium en kan door encoder-/timingverschillen
andere bytes opleveren. De native matrix vergelijkt de daadwerkelijk ingevoegde
mediabytes, niet een nieuwe opname, met de teruggekeerde bestanden.

SHA-256 van deze fixture:

- MP4: `d87d2349faf7c2f7bdc601ba6549cd6261b2354bd5bcf3c91af4765ad3a36962`
- PNG: `b194e622f6df5a2adc059f01696b720451c04f0fee4cb925d77041fbd4a1c5eb`
