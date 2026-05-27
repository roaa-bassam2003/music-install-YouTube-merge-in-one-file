const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
const dirs = ['downloads', 'temp'];
dirs.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Routes
const convertRoutes = require('./routes/convert');
const mergeRoutes = require('./routes/merge');
const filesRoutes = require('./routes/files');

app.use('/api/convert', convertRoutes);
app.use('/api/merge', mergeRoutes);
app.use('/api/files', filesRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ error: 'حدث خطأ في الخادم', details: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🎵 YouTube MP3 Converter`);
  console.log(`🚀 Server running at: http://localhost:${PORT}`);
  console.log(`📁 Downloads: ${path.join(__dirname, 'downloads')}`);
  console.log(`─────────────────────────────────\n`);
});
