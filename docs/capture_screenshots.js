// 使用 Puppeteer 截取所有 UI 页面
const puppeteer = require('puppeteer');
const path = require('path');

const pages = [
  { name: '01_dashboard', nav: 'dashboard' },
  { name: '02_workspace', nav: 'workspace' },
  { name: '03_hil_review', nav: 'hil' },
  { name: '04_literature', nav: 'literature' },
  { name: '05_experiment', nav: 'experiment' },
  { name: '06_editor', nav: 'editor' },
  { name: '07_version', nav: 'version' },
  { name: '08_config', nav: 'config' },
  { name: '09_logs', nav: 'logs' },
];

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const outDir = path.join(__dirname, 'ui_screenshots');

  for (const p of pages) {
    console.log(`Capturing: ${p.name}...`);
    await page.goto(`http://localhost:57095/ui_prototype.html`, { waitUntil: 'networkidle0' });
    // Click nav item
    await page.evaluate((nav) => {
      const el = document.querySelector(`.sidebar .nav-item[data-page="${nav}"]`);
      if (el) el.click();
    }, p.nav);
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, `${p.name}.png`), fullPage: false });
    console.log(`  -> ${p.name}.png saved`);
  }

  await browser.close();
  console.log('Done! All screenshots captured.');
})();
