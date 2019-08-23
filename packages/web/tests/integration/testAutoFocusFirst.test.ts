import { pageUrl } from './helpers/pageUrl';
import { pageDom } from './helpers/pageDom';

beforeEach(async () => {
  page.on('dialog', async dialog => {
    await dialog.dismiss();
  });
  await page.goto(pageUrl('testAutoFocusFirst'));
  await page.waitFor(50);
});

test('render', async () => {
  await expect(await pageDom()).toMatchSnapshot();
  // TODO: Figure out how to test focus is not lost on alert.
  // Manual test for now:
  // Open http://localhost:3000/testAutoFocusFirst, close alert,
  // check if editor still has a focus.
});

// https://github.com/steida/slad/issues/14
export default undefined;
