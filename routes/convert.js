const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);



const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const TEMP_DIR = path.join(__dirname, '../temp');

// In-memory store
const convertedFiles = new Map();

// Validate YouTube URL
const isValidYouTubeUrl = (url) => {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/)|youtu\.be\/)[\w-]{11}/.test(url);
};

// Get yt-dlp binary path — checks system, local bin/, and common locations
const getYtDlpPath = () => {
  return new Promise((resolve, reject) => {
    // 1. Check system PATH
    exec('which yt-dlp', (err, stdout) => {
      if (!err && stdout.trim()) return resolve(stdout.trim());

      // 2. Check local bin/ directory (installed by setup.js)
      const os = require('os');
      const localBin = path.join(__dirname, '../bin', os.platform() === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
      if (fs.existsSync(localBin)) return resolve(localBin);

      // 3. Common system paths
      const candidates = [
        '/usr/local/bin/yt-dlp',
        '/usr/bin/yt-dlp',
        path.join(process.env.HOME || '', '.local/bin/yt-dlp'),
      ];
      const found = candidates.find(c => fs.existsSync(c));
      if (found) return resolve(found);

      reject(new Error(
        'yt-dlp غير مثبّت.\n' +
        'الحل: شغّل أمر:  node setup.js\n' +
        'أو يدويًا:       pip install yt-dlp\n' +
        'أو:              sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && sudo chmod +x /usr/local/bin/yt-dlp'
      ));
    });
  });
};

// Run yt-dlp to get video info as JSON
const getVideoInfo = (url, ytDlpPath) => {
  return new Promise((resolve, reject) => {
    const cmd = `"${ytDlpPath}" --dump-json --no-playlist --socket-timeout 30 "${url}"`;
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`yt-dlp error: ${stderr || err.message}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error('فشل في قراءة معلومات الفيديو'));
      }
    });
  });
};

// Download audio using yt-dlp
const downloadAudio = (url, outputPath, ytDlpPath, onProgress) => {
  return new Promise((resolve, reject) => {
    // Output as temp file, then convert with ffmpeg
    const tempAudio = outputPath.replace('.mp3', '_raw.%(ext)s');
    const cmd = `"${ytDlpPath}" -f "bestaudio[ext=m4a]/bestaudio/best" --no-playlist --socket-timeout 30 --progress --newline -o "${tempAudio}" "${url}"`;

    const child = exec(cmd, { maxBuffer: 100 * 1024 * 1024, timeout: 300000 });

    let lastFile = null;

    child.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        // Parse progress: [download]  45.2% of  ~  5.23MiB at    1.20MiB/s ETA 00:03
        const match = line.match(/\[download\]\s+([\d.]+)%/);
        if (match) {
          const percent = Math.round(parseFloat(match[1]) * 0.65);
          onProgress(percent, `جارٍ التحميل: ${Math.round(parseFloat(match[1]))}%`);
        }
        // Detect output filename
        const destMatch = line.match(/\[download\] Destination: (.+)/);
        if (destMatch) lastFile = destMatch[1].trim();
      }
    });

    child.stderr.on('data', (data) => {
      // yt-dlp sometimes writes progress to stderr too
      const match = data.toString().match(/\[download\]\s+([\d.]+)%/);
      if (match) {
        const percent = Math.round(parseFloat(match[1]) * 0.65);
        onProgress(percent, `جارٍ التحميل: ${Math.round(parseFloat(match[1]))}%`);
      }
    });

    child.on('close', (code) => {
      if (code !== 0) return reject(new Error('فشل تحميل الصوت من YouTube'));

      // Find the downloaded file (yt-dlp substitutes %(ext)s)
      const tempDir = path.dirname(outputPath);
      const baseName = path.basename(outputPath, '.mp3') + '_raw';
      const files = fs.readdirSync(tempDir).filter(f => f.startsWith(path.basename(outputPath, '.mp3') + '_raw'));

      if (files.length === 0) {
        // Try TEMP_DIR
        const tempFiles = fs.readdirSync(TEMP_DIR).filter(f => f.includes('_raw'));
        if (tempFiles.length > 0) return resolve(path.join(TEMP_DIR, tempFiles[tempFiles.length - 1]));
        return reject(new Error('لم يتم العثور على الملف المحمّل'));
      }

      resolve(path.join(tempDir, files[0]));
    });

    child.on('error', reject);
  });
};

// GET all converted files
router.get('/list', (req, res) => {
  const files = Array.from(convertedFiles.values()).map(f => ({
    id: f.id,
    title: f.title,
    filename: f.filename,
    size: f.size,
    duration: f.duration,
    convertedAt: f.convertedAt,
    youtubeUrl: f.youtubeUrl
  }));
  res.json({ files });
});

// POST convert YouTube URL to MP3
router.post('/', async (req, res) => {
  const { url } = req.body;

  if (!url) return res.status(400).json({ error: 'رابط YouTube مطلوب' });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'رابط YouTube غير صالح' });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  let tempRawFile = null;

  try {
    sendEvent({ type: 'progress', percent: 2, message: 'جارٍ التحقق من الرابط...' });

    // Check for duplicate
    for (const [, file] of convertedFiles) {
      if (file.youtubeUrl === url) {
        sendEvent({ type: 'duplicate', message: 'هذا الفيديو موجود بالفعل في القائمة', file: {
          id: file.id, title: file.title, filename: file.filename,
          size: file.size, duration: file.duration,
          convertedAt: file.convertedAt, youtubeUrl: file.youtubeUrl
        }});
        return res.end();
      }
    }

    const ytDlpPath = await getYtDlpPath();
    sendEvent({ type: 'progress', percent: 5, message: 'جارٍ جلب معلومات الفيديو...' });

    // Get info
    const info = await getVideoInfo(url, ytDlpPath);
    const videoTitle = (info.title || 'audio').replace(/[^\w\s\u0600-\u06FF-]/gi, '').trim().substring(0, 80);
    const duration = parseInt(info.duration || 0);

    sendEvent({ type: 'status', message: `تم العثور على: ${info.title}` });

    const fileId = uuidv4();
    const safeTitle = videoTitle || fileId;
    const outputFilename = `${safeTitle}_${fileId.substring(0, 8)}.mp3`;
    const outputPath = path.join(DOWNLOADS_DIR, outputFilename);
    const tempBase = path.join(TEMP_DIR, `${safeTitle}_${fileId.substring(0, 8)}_raw`);

    sendEvent({ type: 'progress', percent: 8, message: 'جارٍ تحميل الصوت...' });

    // Download raw audio
    tempRawFile = await downloadAudio(url, tempBase + '.mp3', ytDlpPath, (percent, msg) => {
      sendEvent({ type: 'progress', percent, message: msg });
    });

    sendEvent({ type: 'progress', percent: 68, message: 'جارٍ التحويل إلى MP3...' });

    // Convert to MP3 with ffmpeg
    await new Promise((resolve, reject) => {
      ffmpeg(tempRawFile)
        .audioBitrate(192)
        .audioChannels(2)
        .audioFrequency(44100)
        .format('mp3')
        .on('progress', (p) => {
          const percent = 68 + Math.round((p.percent || 0) * 0.3);
          sendEvent({ type: 'progress', percent: Math.min(percent, 98), message: 'جارٍ التحويل إلى MP3...' });
        })
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath);
    });

    // Cleanup raw file
    if (tempRawFile && fs.existsSync(tempRawFile)) {
      try { fs.unlinkSync(tempRawFile); } catch (e) {}
    }

    const stats = fs.statSync(outputPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    const fileData = {
      id: fileId,
      title: info.title || videoTitle,
      filename: outputFilename,
      size: sizeInMB,
      duration,
      convertedAt: new Date().toISOString(),
      youtubeUrl: url,
      path: outputPath
    };

    convertedFiles.set(fileId, fileData);

    sendEvent({
      type: 'complete', percent: 100, message: 'تم التحويل بنجاح!',
      file: { id: fileData.id, title: fileData.title, filename: fileData.filename,
              size: fileData.size, duration: fileData.duration,
              convertedAt: fileData.convertedAt, youtubeUrl: fileData.youtubeUrl }
    });

    res.end();

  } catch (error) {
    console.error('Conversion error:', error);
    if (tempRawFile && fs.existsSync(tempRawFile)) {
      try { fs.unlinkSync(tempRawFile); } catch (e) {}
    }
    sendEvent({ type: 'error', message: `فشل التحويل: ${error.message}` });
    res.end();
  }
});

// DELETE a file
router.delete('/:id', (req, res) => {
  const file = convertedFiles.get(req.params.id);
  if (!file) return res.status(404).json({ error: 'الملف غير موجود' });
  try {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    convertedFiles.delete(req.params.id);
    res.json({ success: true, message: 'تم حذف الملف' });
  } catch (e) {
    res.status(500).json({ error: 'فشل حذف الملف' });
  }
});

module.exports = router;
module.exports.convertedFiles = convertedFiles;
