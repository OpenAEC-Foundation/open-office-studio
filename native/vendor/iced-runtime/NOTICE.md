# Runtimecorrectie voor muisgebeurtenissen

Bron: iced_runtime 0.14.0, MIT; de oorspronkelijke licentie staat in LICENSE-UPSTREAM.
De gepubliceerde runtime is behouden, met één lokale correctie in user_interface.rs:
iedere muis- of aanraakgebeurtenis krijgt de bijbehorende aanwijspositie, ook in overlays en na een
herbouw uit de cache. Een verdwenen overlay verliest geen resterende invoer.
De oorspronkelijke en aangepaste bestandshashes staan in ../iced-runtime-bron.json.
Dit is een lokale correctie, geen overgenomen upstreamwijziging.
