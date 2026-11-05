use std::sync::Arc;
use xlsx_raster::{FontProvider, FontFace, ResolvedFont, render_png_with_fonts};
use xlsx_render::{Align,DisplayList,DrawCmd,GridMeta,Rect};
struct Letters(bool);
impl FontProvider for Letters {
 fn resolve(&self,_:Option<&str>,bold:bool,italic:bool)->Result<ResolvedFont,String> {
  let bytes=if self.0 {SYMBOLEN} else {CARLITO};
  Ok(ResolvedFont{face:Arc::new(FontFace::from_slice(bytes,0).unwrap()),synthetic_bold:bold,synthetic_italic:italic})
 }
 fn fallbacks(&self,_:Option<&str>,bold:bool,italic:bool,_:&str)->Result<Vec<ResolvedFont>,String> {
  if self.0 {Ok(vec![])} else {Ok(vec![Letters(true).resolve(None,bold,italic)?])}
 }
}
const SYMBOLEN:&[u8]=include_bytes!("../assets/NotoSansSymbols2-Regular.ttf");
const CARLITO:&[u8]=include_bytes!("../assets/Carlito-Regular.ttf");
    fn vlak(tekst: &str, align: Align, vet: bool, cursief: bool) -> DisplayList {
        DisplayList {
            width: 180.,
            height: 70.,
            truncated: false,
            grid: GridMeta::default(),
            hyperlinks: vec![],
            charts: vec![],
            commands: vec![DrawCmd::Text {
                x: match align {
                    Align::Left => 20.,
                    Align::Center => 90.,
                    Align::Right => 160.,
                },
                y: 45.,
                text: tekst.into(),
                font_size: 22.,
                color: "#123456".into(),
                clip: Rect {
                    x: 10.,
                    y: 5.,
                    w: 160.,
                    h: 60.,
                },
                align,
                bold: vet,
                italic: cursief,
                underline: false,
                strike: false,
                highlight: None,
                dashed_underline: false,
                font_family: Some("Calibri".into()),
                number_format: None,
                ghost: false,
                chart: false,
                rotation_deg: None,
                rotation_box: None,
                rotation_valign: None,
                stacked: false,
                wrap: None,
            }],
        }
    }
#[test]
fn aanvullende_symbolen_bewaren_de_eigen_pixelafronding() {
 for (vet,cursief) in [(false,false),(true,false),(false,true),(true,true)] {
  for align in [Align::Left,Align::Center,Align::Right] {
   for variant in 0..4 {
    let mut dl=vlak(if variant==0 {"🏠"}else{"🏠🏠"},align,vet,cursief);
    let DrawCmd::Text{clip,stacked,rotation_box,wrap,..}=&mut dl.commands[0] else{panic!()};
    match variant {
     1=>*clip=Rect{x:25.,y:10.,w:8.,h:40.},
     2=>{*stacked=true;*rotation_box=Some(Rect{x:10.,y:5.,w:160.,h:60.});},
     3=>*wrap=Some(xlsx_render::TextWrap{width:28.,line_height:30.,valign:xlsx_render::TextValign::Center}),
     _=>(),
    }
    let a=render_png_with_fonts(&dl,&Letters(false)).unwrap();let b=render_png_with_fonts(&dl,&Letters(true)).unwrap();
    assert!(a==b,"Afwijking bij vet={vet}, cursief={cursief}, variant={variant}, uitlijning={align:?}");
   }
  }
 }
}
