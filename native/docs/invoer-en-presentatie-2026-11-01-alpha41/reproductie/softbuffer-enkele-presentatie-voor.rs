//! Afzonderlijke X11-diagnose: één presentatie moet zichtbaar zijn zonder volgende tekenronde.
use raw_window_handle::{DisplayHandle,HandleError,HasDisplayHandle,HasWindowHandle,RawDisplayHandle,RawWindowHandle,WindowHandle,XcbDisplayHandle,XcbWindowHandle};
use std::{num::NonZeroU32,ptr::NonNull,sync::Arc,io::{self,Write}};
use x11rb::{connection::Connection,protocol::xproto::{ConnectionExt,CreateWindowAux,WindowClass},xcb_ffi::XCBConnection,COPY_FROM_PARENT};
struct Venster { verbinding:Arc<XCBConnection>,id:NonZeroU32,scherm:i32 }
impl HasDisplayHandle for Venster {
 fn display_handle(&self)->Result<DisplayHandle<'_>,HandleError> {
  // De Arc bewaart de verbinding gedurende de gehele geleende handle.
  Ok(unsafe { DisplayHandle::borrow_raw(RawDisplayHandle::Xcb(XcbDisplayHandle::new(NonNull::new(self.verbinding.get_raw_xcb_connection()),self.scherm))) })
 }
}
impl HasWindowHandle for Venster {
 fn window_handle(&self)->Result<WindowHandle<'_>,HandleError> {
  // Het venster blijft leven tot na surface/context en wordt daarna vernietigd.
  Ok(unsafe { WindowHandle::borrow_raw(RawWindowHandle::Xcb(XcbWindowHandle::new(self.id))) })
 }
}
fn main()->Result<(),Box<dyn std::error::Error>> {
 let (verbinding,scherm)=XCBConnection::connect(None)?;let verbinding=Arc::new(verbinding);let root=&verbinding.setup().roots[scherm];let id=verbinding.generate_id()?;
 verbinding.create_window(COPY_FROM_PARENT as u8,id,root.root,20,20,120,80,0,WindowClass::INPUT_OUTPUT,0,&CreateWindowAux::new().background_pixel(0x00101010))?.check()?;
 verbinding.map_window(id)?.check()?;verbinding.flush()?;verbinding.get_input_focus()?.reply()?;
 let venster=Arc::new(Venster { verbinding:verbinding.clone(),id:NonZeroU32::new(id).unwrap(),scherm:scherm as i32 });
 let context=softbuffer::Context::new(venster.clone())?;let mut surface=softbuffer::Surface::new(&context,venster)?;surface.resize(NonZeroU32::new(120).unwrap(),NonZeroU32::new(80).unwrap())?;
 let mut buffer=surface.buffer_mut()?;buffer.fill(0x00ff0080);buffer.present()?;
 println!("gepresenteerd {id}");io::stdout().flush()?;
 let mut regel=String::new();io::stdin().read_line(&mut regel)?;
 // Alleen de verzending wordt nu expliciet voltooid; geen nieuwe pixels of invoer.
 verbinding.flush()?;println!("verzonden");io::stdout().flush()?;
 regel.clear();io::stdin().read_line(&mut regel)?;
 drop(surface);drop(context);verbinding.destroy_window(id)?.check()?;Ok(())
}
