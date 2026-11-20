/** Own resources only: attempt both disposals and preserve original failures. */
export async function withWriter363Resources(factories, cleanup) {
  Object.assign(cleanup, {
    fixtureLoaded: false,
    serverStarted: false,
    browserStarted: false,
    serverClosed: null,
    browserClosed: null,
  });
  let server, browser, value;
  const errors = [];
  try {
    const fixture = await factories.loadFixture();
    cleanup.fixtureLoaded = true;
    server = await factories.startServer();
    cleanup.serverStarted = true;
    browser = await factories.launchBrowser();
    cleanup.browserStarted = true;
    value = await factories.exercise({ fixture, server, browser });
  } catch (error) {
    errors.push(error);
  } finally {
    if (browser) {
      try {
        await browser.close();
        cleanup.browserClosed = true;
      } catch (error) {
        cleanup.browserClosed = false;
        errors.push(error);
      }
    }
    if (server) {
      try {
        await factories.stopServer(server);
        cleanup.serverClosed = true;
      } catch (error) {
        cleanup.serverClosed = false;
        errors.push(error);
      }
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length)
    throw new AggregateError(errors, "Writer363 probe and/or cleanup failed");
  return value;
}
