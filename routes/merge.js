const express = require('express');
const router = express.Router();
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);



const ffprobeStatic = require('ffprobe-static');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');


ffmpeg.setFfprobePath(ffprobeStatic.path);

const DOWNLOADS_DIR = path.join(__dirname, '../downloads');
const TEMP_DIR = path.join(__dirname, '../temp');

const MAX_SIZE_MB = 15.5; // Slightly under 16MB for WhatsApp

// Get file size in MB
const getFileSizeMB = (filePath) => {
  const stats = fs.statSync(filePath);
  return stats.size / (1024 * 1024);
};

// Calculate required bitrate for target size
const calculateBitrate = (durationSeconds, targetSizeMB) => {
  const targetSizeBits = targetSizeMB * 1024 * 1024 * 8;
  const bitrateKbps = Math.floor(targetSizeBits / durationSeconds / 1000);
  return Math.max(32, Math.min(bitrateKbps, 320)); // Clamp between 32 and 320 kbps
};

// Get audio duration using ffprobe
const getAudioDuration = (filePath) => {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
};

// Merge files
const mergeFiles = (inputFiles, outputPath, bitrate) => {
  return new Promise((resolve, reject) => {
    let command = ffmpeg();

    inputFiles.forEach(filePath => {
      command = command.input(filePath);
    });

    // Create filter for concatenation
    const filterInputs = inputFiles.map((_, i) => `[${i}:0]`).join('');
    const filterComplex = `${filterInputs}concat=n=${inputFiles.length}:v=0:a=1[outa]`;

    command
      .complexFilter(filterComplex, 'outa')
      .audioBitrate(bitrate)
      .audioChannels(2)
      .audioFrequency(44100)
      .format('mp3')
      .on('end', resolve)
      .on('error', reject)
      .save(outputPath);
  });
};

// POST merge selected files
router.post('/', async (req, res) => {
  const { fileIds } = req.body;

  if (!fileIds || !Array.isArray(fileIds) || fileIds.length < 2) {
    return res.status(400).json({ error: 'يرجى تحديد ملفين على الأقل للدمج' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const convertedFiles = require('./convert').convertedFiles;
  const tempFiles = [];

  try {
    sendEvent({ type: 'status', message: 'جارٍ التحقق من الملفات...' });

    // Resolve file paths
    const filePaths = [];
    for (const id of fileIds) {
      const file = convertedFiles.get(id);
      if (!file) {
        sendEvent({ type: 'error', message: `الملف غير موجود: ${id}` });
        res.end();
        return;
      }
      if (!fs.existsSync(file.path)) {
        sendEvent({ type: 'error', message: `ملف مفقود من القرص: ${file.title}` });
        res.end();
        return;
      }
      filePaths.push(file.path);
    }

    sendEvent({ type: 'progress', percent: 10, message: 'جارٍ حساب المدة الإجمالية...' });

    // Calculate total duration
    let totalDuration = 0;
    for (const filePath of filePaths) {
      const dur = await getAudioDuration(filePath);
      totalDuration += dur;
    }

    sendEvent({ type: 'progress', percent: 20, message: 'جارٍ دمج الملفات...' });

    const mergeId = uuidv4();
    const mergedFilename = `merged_${mergeId.substring(0, 8)}.mp3`;
    const mergedPath = path.join(TEMP_DIR, mergedFilename);
    tempFiles.push(mergedPath);

    // First merge at 192kbps
    await mergeFiles(filePaths, mergedPath, 192);

    sendEvent({ type: 'progress', percent: 60, message: 'جارٍ التحقق من حجم الملف...' });

    const mergedSizeMB = getFileSizeMB(mergedPath);
    let finalPath = mergedPath;
    let finalFilename = mergedFilename;

    // Compress if needed
    if (mergedSizeMB > MAX_SIZE_MB) {
      sendEvent({ type: 'progress', percent: 65, message: `الملف كبير (${mergedSizeMB.toFixed(2)} MB)، جارٍ الضغط...` });

      const requiredBitrate = calculateBitrate(totalDuration, MAX_SIZE_MB);
      sendEvent({ type: 'status', message: `تقليل الـ bitrate إلى ${requiredBitrate} kbps لتقليل الحجم...` });

      finalFilename = `compressed_${mergeId.substring(0, 8)}.mp3`;
      finalPath = path.join(DOWNLOADS_DIR, finalFilename);
      tempFiles.push(mergedPath); // Keep for cleanup

      await new Promise((resolve, reject) => {
        ffmpeg(mergedPath)
          .audioBitrate(requiredBitrate)
          .audioChannels(2)
          .format('mp3')
          .on('progress', (progress) => {
            const percent = 65 + Math.round((progress.percent || 0) * 0.3);
            sendEvent({ type: 'progress', percent: Math.min(percent, 95), message: `جارٍ الضغط: ${Math.round(progress.percent || 0)}%` });
          })
          .on('end', resolve)
          .on('error', reject)
          .save(finalPath);
      });
    } else {
      // Move to downloads
      finalFilename = `merged_${mergeId.substring(0, 8)}.mp3`;
      finalPath = path.join(DOWNLOADS_DIR, finalFilename);
      fs.copyFileSync(mergedPath, finalPath);
    }

    // Cleanup temp files
    tempFiles.forEach(f => {
      if (fs.existsSync(f) && f !== finalPath) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });

    const finalSizeMB = getFileSizeMB(finalPath);

    // Schedule auto-delete after 1 hour
    setTimeout(() => {
      if (fs.existsSync(finalPath)) {
        try { fs.unlinkSync(finalPath); } catch (e) {}
      }
    }, 60 * 60 * 1000);

    sendEvent({
      type: 'complete',
      percent: 100,
      message: 'تم الدمج والضغط بنجاح!',
      file: {
        id: mergeId,
        filename: finalFilename,
        size: finalSizeMB.toFixed(2),
        downloadUrl: `/api/files/download/${finalFilename}`
      }
    });

    res.end();

  } catch (error) {
    console.error('Merge error:', error);

    // Cleanup on error
    tempFiles.forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });

    sendEvent({ type: 'error', message: `فشل الدمج: ${error.message}` });
    res.end();
  }
});

module.exports = router;
