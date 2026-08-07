/**
 * main page object containing all methods, selectors and functionality
 * that is shared across all page objects
 */
export default class Page {
  /**
   * Opens a sub page of the page
   * @param path path of the sub page (e.g. /path/to/page.html)
   */
  public async open(path: string = '/') {
    const result = await browser.url(path);
    // A launch that carries data goes straight to the viewer; only a bare
    // launch lands on the worklist.
    if (!path.includes('urls=')) {
      await this.dismissWorklist();
    }
    return result;
  }

  /**
   * Leaves the landing worklist, which covers the app shell when the app is
   * opened without data. Tests drive the viewer and the data panel directly.
   */
  public async dismissWorklist() {
    const exit = await $('button[data-testid="worklist-back-to-viewer"]');
    await exit.waitForClickable();
    await exit.click();
  }
}
