// scrape.js — Playwright-based scraper for GitHub Actions
// Scrapes rough lowest nightly price for Kondapur, Hyderabad for today->tomorrow.
// NOTE: Selectors are heuristics and may need adjustment if sites change.

const { chromium } = require('playwright');

const TARGETS = [
  {
    key: 'booking',
    name: 'Booking.com',
    url: (ci, co) =>
      `https://www.booking.com/searchresults.html?ss=Kondapur%2C%20Hyderabad&checkin=${ci}&checkout=${co}&group_adults=2&no_rooms=1&order=price`,
    pickPrice: async (page) => {
      // Heuristic: pick first price element on results
      await page.waitForTimeout(4000);
      const texts = await page.$$eval('*', els =>
        els.map(e => e.textContent).filter(t => /₹|INR|\d/.test(t)));
      return extractRupeeNumber(texts);
    }
  },
  {
    key: 'mmt',
    name: 'MakeMyTrip',
    url: (ci, co) =>
      `https://www.makemytrip.com/hotels/hotel-listing/?checkin=${ci}&checkout=${co}&locusId=CTHYD&locusType=city&searchText=Kondapur%2C%20Hyderabad&roomStayQualifier=1e2e0e`,
    pickPrice: async (page) => {
      await page.waitForTimeout(6000);
      const texts = await page.$$eval('*', els =>
        els.map(e => e.textContent).filter(t => /₹|INR|\d/.test(t)));
      return extractRupeeNumber(texts);
    }
  },
  {
    key: 'goibibo',
    name: 'Goibibo',
    url: (ci, co) => {
      const ci2 = ci.replaceAll('-', '');
      const co2 = co.replaceAll('-', '');
      return `https://www.goibibo.com/hotels/hotels-in-hyderabad-ct/?check_in=${ci2}&check_out=${co2}&nearby=Kondapur&r=1-2-0`;
    },
    pickPrice: async (page) => {
      await page.waitForTimeout(5000);
      const texts = await page.$$eval('*', els =>
        els.map(e => e.textContent).filter(t => /₹|INR|\d/.test(t)));
      return extractRupeeNumber(texts);
    }
  },
  {
    key: 'oyo',
    name: 'OYO',
    url: (ci, co) =>
      `https://www.oyorooms.com/search?location=Kondapur%2C%20Hyderabad&checkin=${ci}&checkout=${co}&guests=2&rooms=1`,
    pickPrice: async (page) => {
      await page.waitForTimeout(5000);
      const texts = await page.$$eval('*', els =>
        els.map(e => e.textContent).filter(t => /₹|INR|\d/.test(t)));
      return extractRupeeNumber(texts);
    }
  }
];

function extractRupeeNumber(textArr) {
  // Find numbers like "₹ 2,499" / "INR 2499"
  let best = Infinity;
  for (const t of textArr.slice(0, 2000)) { // cap for safety
    const s = String(t).replace(/[, ]+/g, ' ');
    const m = s.match(/(?:₹|INR)?\\s*([0-9]{3,6})(?:\\.[0-9]{1,2})?/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n>0 && n < best) best = n;
    }
  }
  return best === Infinity ? null : best;
}

function yyyymmdd(d) { return d.toISOString().slice(0,10); }

(async () => {
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate()+1);
  const ci = yyyymmdd(today);
  const co = yyyymmdd(tomorrow);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });

  const results = [];
  for (const t of TARGETS) {
    const url = t.url(ci, co);
    try {
      await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
      const price = await t.pickPrice(page);
      results.push({ site: t.key, name: t.name, url, price });
      console.log(`[OK] ${t.name}: ${price}`);
    } catch (e) {
      console.log(`[ERR] ${t.name}: ${e.message}`);
      results.push({ site: t.key, name: t.name, url, price: null, error: e.message });
    }
  }

  await browser.close();

  const fs = require('fs');
  const payload = {
    updatedAt: new Date().toISOString(),
    checkin: ci,
    checkout: co,
    results
  };
  fs.writeFileSync('rates.json', JSON.stringify(payload, null, 2));
})();
