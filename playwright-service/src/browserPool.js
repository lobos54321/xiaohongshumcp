const { chromium } = require('playwright');

/**
 * 浏览器池管理器
 * 复用浏览器实例，降低内存消耗
 */
class BrowserPool {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.browsers = [];
    this.available = [];
    this.waiting = [];
  }

  async initialize() {
    console.log(`初始化浏览器池，最大容量: ${this.maxSize}`);
    // 预创建 3 个浏览器实例
    for (let i = 0; i < Math.min(3, this.maxSize); i++) {
      await this.createBrowser();
    }
  }

  async createBrowser() {
    const browser = await chromium.launch({
      headless: process.env.HEADLESS !== 'false',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    this.browsers.push(browser);
    this.available.push(browser);
    console.log(`创建浏览器实例，当前总数: ${this.browsers.length}`);
    return browser;
  }

  async acquire() {
    // 如果有可用的浏览器，直接返回
    if (this.available.length > 0) {
      return this.available.shift();
    }

    // 如果未达到最大容量，创建新浏览器
    if (this.browsers.length < this.maxSize) {
      return await this.createBrowser();
    }

    // 等待其他任务释放浏览器
    return new Promise((resolve) => {
      this.waiting.push(resolve);
    });
  }

  async release(browser) {
    // 如果有等待的请求，优先分配给它们
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve(browser);
    } else {
      this.available.push(browser);
    }
  }

  async closeAll() {
    console.log('关闭所有浏览器实例...');
    for (const browser of this.browsers) {
      await browser.close();
    }
    this.browsers = [];
    this.available = [];
    this.waiting = [];
  }
}

module.exports = BrowserPool;
