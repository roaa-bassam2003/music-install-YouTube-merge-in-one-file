/**
 * setup.js — يثبّت yt-dlp تلقائيًا قبل تشغيل الخادم
 * شغّله مرة واحدة: node setup.js
 */

const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const BIN_DIR = path.join(__dirname, 'bin');
const IS_WIN = os.platform() === 'win32';
const BIN_NAME = IS_WIN ? 'yt-dlp.exe' : 'yt-dlp';
const BIN_PATH = path.join(BIN_DIR, BIN_NAME);

const LATEST_URL = IS_WIN
  ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
  : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

const check = (cmd) => new Promise(resolve => {
  exec(cmd, (err, stdout) => resolve(!err && stdout.trim().length > 0));
});

const download = (url, dest) => new Promise((resolve, reject) => {
  const file = fs.createWriteStream(dest);
  const get = (u) => https.get(u, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) return get(res.headers.location);
    if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
    res.pipe(file);
    file.on('finish', () => file.close(resolve));
  }).on('error', reject);
  get(url);
});

(async () => {
  console.log('\n🔧 yt-dlp Setup\n──────────────');

  // Check system yt-dlp
  const systemOk = await check('yt-dlp --version');
  if (systemOk) {
    console.log('✅ yt-dlp موجود في النظام — لا حاجة لتثبيته\n');
    return;
  }

  // Check local bin
  if (fs.existsSync(BIN_PATH)) {
    console.log(`✅ yt-dlp موجود في: ${BIN_PATH}\n`);
    return;
  }

  console.log('⬇️  جارٍ تحميل yt-dlp...');
  if (!fs.existsSync(BIN_DIR)) fs.mkdirSync(BIN_DIR, { recursive: true });

  try {
    await download(LATEST_URL, BIN_PATH);
    if (!IS_WIN) fs.chmodSync(BIN_PATH, '755');
    console.log(`✅ تم تثبيت yt-dlp في: ${BIN_PATH}`);
    console.log('\n🚀 الآن شغّل: npm start\n');
  } catch (err) {
    console.error('❌ فشل تحميل yt-dlp:', err.message);
    console.log('\n📌 الحل اليدوي:');
    console.log('  Linux/Mac:  sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp');
    console.log('  أو:         pip install yt-dlp');
    console.log('  Windows:    winget install yt-dlp\n');
  }
})();
