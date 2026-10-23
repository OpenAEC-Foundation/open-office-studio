import type { Notities } from "./model";

/** Bewaart ongewijzigde momentopnamen; samenhangende toetsaanslagen vormen één stap. */
export class NotitieHistorie {
  private vorige: Notities[] = [];
  private volgende: Notities[] = [];
  private groep = "";
  private tijd = 0;
  get kanTerug() {
    return this.vorige.length > 0;
  }
  get kanVooruit() {
    return this.volgende.length > 0;
  }
  bewaar(data: Notities, groep = "", nu = Date.now()) {
    if (!groep || groep !== this.groep || nu - this.tijd > 800) {
      this.vorige.push(data);
      if (this.vorige.length > 50) this.vorige.shift();
    }
    this.groep = groep;
    this.tijd = nu;
    this.volgende = [];
  }
  terug(data: Notities) {
    const vorige = this.vorige.pop();
    if (!vorige) return null;
    this.volgende.push(data);
    this.groep = "";
    return vorige;
  }
  vooruit(data: Notities) {
    const volgende = this.volgende.pop();
    if (!volgende) return null;
    this.vorige.push(data);
    this.groep = "";
    return volgende;
  }
  wis() {
    this.vorige = [];
    this.volgende = [];
    this.groep = "";
  }
}
