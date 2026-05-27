# 🎵 YouTube MP3 Converter v2

محوّل يوتيوب إلى MP3 — يستخدم **yt-dlp** بدلاً من ytdl-core لمعالجة خطأ "Could not extract functions".

---

## 🚀 طريقة التشغيل

### الخطوة 1 — تثبيت اعتماديات Node
```bash
cd yt-mp3-converter
npm install
```

### الخطوة 2 — تثبيت yt-dlp (مطلوب)
```bash
# الطريقة التلقائية (تحمّل yt-dlp في مجلد bin/)
node setup.js

# أو يدويًا على Linux/Mac
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
     -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp

# أو عبر pip
pip install yt-dlp

# أو على Windows
winget install yt-dlp
```

### الخطوة 3 — تشغيل الخادم
```bash
npm start
# http://localhost:3000
```

---

## ❓ لماذا yt-dlp وليس ytdl-core؟

| | ytdl-core | yt-dlp |
|---|---|---|
| الاستقرار | ❌ يتعطل مع كل تحديث YouTube | ✅ يتحدث تلقائيًا |
| الدعم | ⚠️ متوقف تقريبًا | ✅ نشط جداً |
| الأخطاء | "Could not extract functions" | نادراً |
| السرعة | متوسطة | عالية |

---

## 📁 هيكل المشروع
```
yt-mp3-converter/
├── server.js
├── setup.js          ← يثبّت yt-dlp تلقائيًا
├── package.json
├── routes/
│   ├── convert.js    ← يستخدم yt-dlp الآن
│   ├── merge.js
│   └── files.js
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── bin/              ← yt-dlp يُثبَّت هنا بـ setup.js
├── downloads/
└── temp/
```
