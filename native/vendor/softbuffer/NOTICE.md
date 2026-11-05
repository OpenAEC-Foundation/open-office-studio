# X11-presentatiecorrectie

Bron: softbuffer 0.4.8, onder MIT of Apache-2.0; beide oorspronkelijke
licentiebestanden zijn behouden. De lokale correctie in src/backends/x11.rs
verstuurt na presenteren de reeds klaargezette XCB-verzoeken. Er wordt geen
extra frame getekend en geen extra roundtrip op voltooiing afgewacht.
De bronhashes en correctie staan in ../softbuffer-bron.json.
