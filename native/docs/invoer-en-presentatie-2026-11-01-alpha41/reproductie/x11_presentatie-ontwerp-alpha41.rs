//! Eén presentatie moet zichtbaar zijn zonder volgende tekenronde of invoer.
#![cfg(target_os = "linux")]
use raw_window_handle::{DisplayHandle, HandleError, HasDisplayHandle, HasWindowHandle, RawDisplayHandle, RawWindowHandle, WindowHandle, XcbDisplayHandle, XcbWindowHandle};
use std::{io::{BufRead, BufReader}, num::NonZeroU32, ptr::NonNull, process::{Child, Command, Stdio}, sync::Arc, time::{Duration, Instant}};
use x11rb::{connection::Connection, protocol::xproto::{ConnectionExt, CreateWindowAux, ImageFormat, ImageOrder, WindowClass}, xcb_ffi::XCBConnection, COPY_FROM_PARENT};
struct Testscherm(Child);
impl Drop for Testscherm {
    fn drop(&mut self) { let _ = self.0.kill(); let _ = self.0.wait(); }
}
struct Venster { verbinding: Arc<XCBConnection>, id: NonZeroU32, scherm: i32 }
impl HasDisplayHandle for Venster {
    fn display_handle(&self) -> Result<DisplayHandle<'_>, HandleError> {
        // De Arc bewaart de verbinding gedurende de gehele geleende handle.
        Ok(unsafe { DisplayHandle::borrow_raw(RawDisplayHandle::Xcb(XcbDisplayHandle::new(NonNull::new(self.verbinding.get_raw_xcb_connection()), self.scherm))) })
    }
}
impl HasWindowHandle for Venster {
    fn window_handle(&self) -> Result<WindowHandle<'_>, HandleError> {
        // Het eigen venster blijft leven tot na surface en context.
        Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::Xcb(XcbWindowHandle::new(self.id))) })
    }
}
#[test]
fn x11_eerste_presentatie_wordt_zonder_volgend_frame_zichtbaar() {
    let xvfb = std::env::var_os("OFFICE_XVFB").unwrap_or_else(|| "Xvfb".into());
    let mut kind = Command::new(xvfb);
    // Een eigen vluchtig scherm zonder TCP; uitsluitend openbare kleurpixels.
    kind.args(["-displayfd", "1", "-screen", "0", "160x120x24", "-nolisten", "tcp", "-ac"])
        .stdout(Stdio::piped()).stderr(Stdio::piped());
    for naam in ["DISPLAY", "XAUTHORITY", "WAYLAND_DISPLAY", "DBUS_SESSION_BUS_ADDRESS", "DBUS_STARTER_ADDRESS", "DBUS_STARTER_BUS_TYPE", "GNOME_KEYRING_CONTROL", "SSH_AUTH_SOCK", "SESSION_MANAGER"] { kind.env_remove(naam); }
    let mut server = Testscherm(kind.spawn().expect("Installeer Xvfb of wijs OFFICE_XVFB naar de testbinary"));
    let mut regel = String::new();
    BufReader::new(server.0.stdout.take().unwrap()).read_line(&mut regel).unwrap();
    let nummer: u32 = regel.trim().parse().expect("Eigen Xvfb-schermnummer ontbreekt");
    let naam = std::ffi::CString::new(format!(":{nummer}")).unwrap();
    let (verbinding, scherm) = XCBConnection::connect(Some(&naam)).unwrap();
    let verbinding = Arc::new(verbinding);
    // De waarnemer gebruikt een afzonderlijke verbinding. Zijn queries mogen
    // de nog niet verzonden verzoeken van de tekenverbinding niet wegspoelen.
    let (waarnemer, _) = XCBConnection::connect(Some(&naam)).unwrap();
    let root = &verbinding.setup().roots[scherm];
    let id = verbinding.generate_id().unwrap();
    verbinding.create_window(COPY_FROM_PARENT as u8, id, root.root, 0, 0, 120, 80, 0, WindowClass::INPUT_OUTPUT, 0, &CreateWindowAux::new().background_pixel(0x00101010)).unwrap().check().unwrap();
    verbinding.map_window(id).unwrap().check().unwrap();
    verbinding.flush().unwrap();
    verbinding.get_input_focus().unwrap().reply().unwrap();
    let venster = Arc::new(Venster { verbinding: verbinding.clone(), id: NonZeroU32::new(id).unwrap(), scherm: scherm as i32 });
    let context = softbuffer::Context::new(venster.clone()).unwrap();
    let mut surface = softbuffer::Surface::new(&context, venster).unwrap();
    surface.resize(NonZeroU32::new(120).unwrap(), NonZeroU32::new(80).unwrap()).unwrap();
    let mut buffer = surface.buffer_mut().unwrap();
    buffer.fill(0x00ff0080);
    buffer.present().unwrap();
    let eind = Instant::now() + Duration::from_secs(3);
    loop {
        let beeld = waarnemer.get_image(ImageFormat::Z_PIXMAP, id, 0, 0, 120, 80, 0xffffffff).unwrap().reply().unwrap();
        assert_eq!(beeld.data.len(), 120*80*4);
        let goed = beeld.data.chunks_exact(4).all(|p| {
            let p: [u8; 4] = p.try_into().unwrap();
            let kleur = if waarnemer.setup().image_byte_order == ImageOrder::LSB_FIRST { u32::from_le_bytes(p) } else { u32::from_be_bytes(p) };
            kleur & 0x00ffffff == 0x00ff0080
        });
        if goed { break; }
        assert!(Instant::now() < eind, "De eerste presentatie blijft onzichtbaar zonder volgend frame; waarnemer ziet {:?}", &beeld.data[..4]);
        std::thread::sleep(Duration::from_millis(10));
    }
}
