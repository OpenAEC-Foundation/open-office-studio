
describe("nieuwste host-lettertypevraag vóór verzending", () => {
  it("verstuurd tijdens een lopende vraag uitsluitend de nieuwste wachtende pass", async () => {
    const eerste = uitgesteld<string | null>(), nieuwste = uitgesteld<string | null>();
    const lees = vi.fn().mockReturnValueOnce(eerste.wacht).mockReturnValueOnce(nieuwste.wacht), p = layout({lettertypen:lees});
    p.cr();p.naarVersie("tweede");p.cr();p.naarVersie("derde");p.cr();
    expect(lees).toHaveBeenCalledOnce();eerste.klaar("[]");await p.afgerond();
    expect(lees).toHaveBeenCalledTimes(2);expect(p.fontketens).not.toHaveBeenCalled();
    nieuwste.klaar('[{"family":"Actuele familie"}]');await p.afgerond();
    expect(p.fontketens).toHaveBeenCalledExactlyOnceWith([{family:"Actuele familie"}]);expect(p.worker).toHaveBeenCalledOnce();
    p.antwoord.klaar(p.resultaat);await p.afgerond();expect(p.publiceer).toHaveBeenCalledOnce();
  });
  it("slaat een onopgemerkte bronwijziging over vóór een wachtende vraag wordt verzonden", async () => {
    const eerste=uitgesteld<string|null>(),lees=vi.fn(()=>eerste.wacht),p=layout({lettertypen:lees});
    p.cr();p.naarVersie("tweede");p.cr();p.naarVersie("derde zonder nieuwe layoutpass");
    eerste.klaar("[]");await p.afgerond();expect(lees).toHaveBeenCalledOnce();expect(p.herplan).toHaveBeenCalledOnce();
    expect(p.fontketens).not.toHaveBeenCalled();expect(p.worker).not.toHaveBeenCalled();
  });
  it("geeft de primaire workerfout aan de actuele wachtende pass door", async () => {
    const eerste=uitgesteld<string|null>(),lees=vi.fn(()=>eerste.wacht),p=layout({lettertypen:lees}),fout=new Error("primaire workerfout");
    p.cr();p.naarVersie("nieuw");p.cr();eerste.fout(fout);await p.afgerond();
    expect(lees).toHaveBeenCalledOnce();expect(p.fouten).toHaveBeenCalledExactlyOnceWith(p.bron,fout);
    expect(p.fontketens).not.toHaveBeenCalled();expect(p.worker).not.toHaveBeenCalled();
  });
  it("verzendt na vervangen van de broneigenaar geen oude wachtende vraag", async () => {
    const eerste=uitgesteld<string|null>(),lees=vi.fn(()=>eerste.wacht),p=layout({lettertypen:lees});
    p.cr();p.naarVersie("nieuw");p.cr();p.refBron.current={};eerste.klaar("[]");await p.afgerond();
    expect(lees).toHaveBeenCalledOnce();expect(p.fontketens).not.toHaveBeenCalled();expect(p.worker).not.toHaveBeenCalled();expect(p.publiceer).not.toHaveBeenCalled();
  });
  it("behoudt de synchrone nul-terugval van een onbeschikbare poort", async () => {
    const lees=vi.fn(()=>null),p=layout({lettertypen:lees as unknown as ()=>Promise<string|null>});
    p.cr();expect(lees).toHaveBeenCalledOnce();expect(p.bron.layoutFontRequirementsJson).toHaveBeenCalledOnce();expect(p.worker).toHaveBeenCalledOnce();
    p.antwoord.klaar(p.resultaat);await p.afgerond();
  });
});

describe("falende controle van een wachtende hostbron",()=>{
  it("bewaart de primaire fout en laat de actuele layoutpass niet wachten",async()=>{
    const eerste=uitgesteld<string|null>(),lees=vi.fn(()=>eerste.wacht),p=layout({lettertypen:lees}),fout=new Error("Versielezer defect");
    p.cr();p.naarVersie("nieuwe pass");p.cr();p.naarVersie(fout);eerste.klaar("[]");await p.afgerond();
    expect(lees).toHaveBeenCalledOnce();expect(p.fouten).toHaveBeenCalledExactlyOnceWith(p.bron,fout);expect(p.worker).not.toHaveBeenCalled();expect(p.fontketens).not.toHaveBeenCalled();
  });
});
