//! Begrensd wachten voor proeven zonder venster of asynchrone runtime.
use std::{
    future::Future,
    sync::Arc,
    task::{Context, Poll, Wake, Waker},
    thread,
    time::{Duration, Instant},
};

pub fn wacht<T>(taak: impl Future<Output = T>) -> T {
    struct Wek(thread::Thread);
    impl Wake for Wek {
        fn wake(self: Arc<Self>) {
            self.0.unpark();
        }
    }
    let wekker = Waker::from(Arc::new(Wek(thread::current())));
    let mut context = Context::from_waker(&wekker);
    let mut taak = std::pin::pin!(taak);
    let einde = Instant::now() + Duration::from_secs(30);
    loop {
        if let Poll::Ready(uitkomst) = taak.as_mut().poll(&mut context) {
            return uitkomst;
        }
        assert!(Instant::now() < einde, "Achtergrondtaak antwoordt niet");
        thread::park_timeout(einde.saturating_duration_since(Instant::now()));
    }
}
