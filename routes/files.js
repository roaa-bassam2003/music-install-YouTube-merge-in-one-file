const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');

// Download a file
router.get('/download/:filename', (req, res) => {
  const { filename } = req.params;

  // Security: prevent path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(DOWNLOADS_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'الملف غير موجود' });
  }

  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
  res.setHeader('Content-Type', 'audio/mpeg');

  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);

  fileStream.on('error', (err) => {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'فشل في تحميل الملف' });
    }
  });
});

module.exports = router;
