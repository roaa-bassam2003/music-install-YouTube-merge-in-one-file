/* ═══════════════════════════════════════════
   YouTube MP3 Converter - Frontend App
═══════════════════════════════════════════ */

'use strict';

// ── State ────────────────────────────────
const state = {
  files: [],          // { id, title, filename, size, duration, convertedAt, youtubeUrl }
  selectedIds: new Set(),
  isConverting: false,
  isMerging: false
};

// ── DOM Elements ─────────────────────────
const $ = id => document.getElementById(id);

const els = {
  ytUrl:           $('ytUrl'),
  clearBtn:        $('clearBtn'),
  convertBtn:      $('convertBtn'),
  progressContainer: $('progressContainer'),
  progressBar:     $('progressBar'),
  progressStatus:  $('progressStatus'),
  progressPercent: $('progressPercent'),
  messageBox:      $('messageBox'),
  filesContainer:  $('filesContainer'),
  emptyState:      $('emptyState'),
  filesList:       $('filesList'),
  selectAllBtn:    $('selectAllBtn'),
  mergeBtn:        $('mergeBtn'),
  selectedCount:   $('selectedCount'),
  mergeSection:    $('mergeSection'),
  mergeBar:        $('mergeBar'),
  mergeStatus:     $('mergeStatus'),
  mergePercent:    $('mergePercent'),
  mergeMessage:    $('mergeMessage'),
  downloadReady:   $('downloadReady'),
  downloadLink:    $('downloadLink'),
  downloadSize:    $('downloadSize')
};

// ── Utilities ────────────────────────────
const formatDuration = (seconds) => {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatDate = (iso) => {
  return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
};

const showMessage = (text, type = 'info') => {
  const box = els.messageBox;
  box.textContent = text;
  box.className = `message-box ${type}`;
  box.hidden = false;
  if (type === 'success') {
    setTimeout(() => { box.hidden = true; }, 5000);
  }
};

const hideMessage = () => { els.messageBox.hidden = true; };

// ── Progress ─────────────────────────────
const setProgress = (percent, status) => {
  els.progressContainer.hidden = false;
  els.progressBar.style.width = `${percent}%`;
  els.progressPercent.textContent = `${percent}%`;
  if (status) els.progressStatus.textContent = status;
};

const resetProgress = () => {
  els.progressContainer.hidden = true;
  els.progressBar.style.width = '0%';
  els.progressPercent.textContent = '0%';
};

const setMergeProgress = (percent, status) => {
  els.mergeBar.style.width = `${percent}%`;
  els.mergePercent.textContent = `${percent}%`;
  if (status) els.mergeStatus.textContent = status;
};

// ── Files List Rendering ─────────────────
const renderFiles = () => {
  const hasFiles = state.files.length > 0;
  els.emptyState.hidden = hasFiles;
  els.filesList.hidden = !hasFiles;
  els.selectAllBtn.hidden = !hasFiles;

  els.filesList.innerHTML = '';

  state.files.forEach(file => {
    const li = document.createElement('li');
    li.className = `file-item${state.selectedIds.has(file.id) ? ' selected' : ''}`;
    li.dataset.id = file.id;

    li.innerHTML = `
      <input
        type="checkbox"
        class="file-checkbox"
        data-id="${file.id}"
        ${state.selectedIds.has(file.id) ? 'checked' : ''}
        aria-label="تحديد ${file.title}"
      >
      <div class="file-info">
        <div class="file-title" title="${escapeHtml(file.title)}">${escapeHtml(file.title)}</div>
        <div class="file-meta">
          <span class="file-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            ${formatDuration(file.duration)}
          </span>
          <span class="file-meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            ${file.size} MB
          </span>
          <span class="file-badge">${formatDate(file.convertedAt)}</span>
        </div>
      </div>
      <button class="file-delete-btn" data-id="${file.id}" title="حذف" aria-label="حذف الملف">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
        </svg>
      </button>
    `;

    els.filesList.appendChild(li);
  });

  updateMergeButton();
};

const escapeHtml = (str) =>
  str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── Selection ────────────────────────────
const updateMergeButton = () => {
  const count = state.selectedIds.size;
  els.selectedCount.textContent = count;
  els.mergeBtn.hidden = count < 2;
};

const toggleSelect = (id) => {
  if (state.selectedIds.has(id)) {
    state.selectedIds.delete(id);
  } else {
    state.selectedIds.add(id);
  }
  renderFiles();
};

const selectAll = () => {
  const allSelected = state.files.every(f => state.selectedIds.has(f.id));
  if (allSelected) {
    state.selectedIds.clear();
  } else {
    state.files.forEach(f => state.selectedIds.add(f.id));
  }
  renderFiles();
};

// ── Convert ──────────────────────────────
const convertVideo = async () => {
  const url = els.ytUrl.value.trim();

  if (!url) {
    showMessage('يرجى إدخال رابط YouTube', 'error');
    els.ytUrl.focus();
    return;
  }

  if (state.isConverting) return;
  state.isConverting = true;

  els.convertBtn.disabled = true;
  els.convertBtn.innerHTML = `<span class="spinner"></span><span class="btn-text">جارٍ التحويل...</span>`;
  hideMessage();
  resetProgress();

  try {
    const evtSource = new EventSource(`/api/convert?_t=${Date.now()}`);

    // Use fetch with SSE
    const response = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'فشل الاتصال بالخادم');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          handleConvertEvent(data);
        } catch (e) {}
      }
    }

  } catch (error) {
    showMessage(`خطأ: ${error.message}`, 'error');
    resetProgress();
  } finally {
    state.isConverting = false;
    els.convertBtn.disabled = false;
    els.convertBtn.innerHTML = `
      <span class="btn-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/>
          <polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/>
        </svg>
      </span>
      <span class="btn-text">تحويل إلى MP3</span>
    `;
  }
};

const handleConvertEvent = (data) => {
  switch (data.type) {
    case 'status':
      setProgress(parseInt(els.progressBar.style.width) || 0, data.message);
      break;

    case 'progress':
      setProgress(data.percent, data.message);
      break;

    case 'duplicate':
      resetProgress();
      showMessage('⚠️ هذا الفيديو موجود بالفعل في القائمة', 'warning');
      break;

    case 'complete':
      setProgress(100, 'تم التحويل بنجاح!');
      showMessage(`✅ تم تحويل: ${data.file.title}`, 'success');
      els.ytUrl.value = '';

      // Add to list if not duplicate
      const exists = state.files.some(f => f.id === data.file.id);
      if (!exists) {
        state.files.unshift(data.file);
        renderFiles();
      }

      setTimeout(resetProgress, 2000);
      break;

    case 'error':
      resetProgress();
      showMessage(`❌ ${data.message}`, 'error');
      break;
  }
};

// ── Delete File ──────────────────────────
const deleteFile = async (id) => {
  try {
    const res = await fetch(`/api/convert/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('فشل الحذف');

    state.files = state.files.filter(f => f.id !== id);
    state.selectedIds.delete(id);
    renderFiles();
  } catch (error) {
    showMessage(`خطأ في الحذف: ${error.message}`, 'error');
  }
};

// ── Merge ─────────────────────────────────
const mergeFiles = async () => {
  if (state.selectedIds.size < 2) {
    showMessage('يرجى تحديد ملفين على الأقل', 'warning');
    return;
  }

  if (state.isMerging) return;
  state.isMerging = true;

  els.mergeSection.hidden = false;
  els.downloadReady.hidden = true;
  els.mergeMessage.hidden = true;
  els.mergeSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  els.mergeBtn.disabled = true;
  setMergeProgress(0, 'جارٍ التحضير...');

  try {
    const response = await fetch('/api/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds: Array.from(state.selectedIds) })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'فشل الدمج');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          handleMergeEvent(data);
        } catch (e) {}
      }
    }

  } catch (error) {
    showMergeError(`فشل الدمج: ${error.message}`);
  } finally {
    state.isMerging = false;
    els.mergeBtn.disabled = false;
  }
};

const handleMergeEvent = (data) => {
  switch (data.type) {
    case 'status':
      setMergeProgress(parseInt(els.mergeBar.style.width) || 0, data.message);
      break;

    case 'progress':
      setMergeProgress(data.percent, data.message);
      break;

    case 'complete':
      setMergeProgress(100, 'تم بنجاح!');
      els.downloadLink.href = data.file.downloadUrl;
      els.downloadLink.download = data.file.filename;
      els.downloadSize.textContent = `حجم الملف: ${data.file.size} MB — متوافق مع WhatsApp ✅`;
      els.downloadReady.hidden = false;
      break;

    case 'error':
      showMergeError(data.message);
      break;
  }
};

const showMergeError = (msg) => {
  els.mergeMessage.textContent = `❌ ${msg}`;
  els.mergeMessage.className = 'merge-message error';
  els.mergeMessage.hidden = false;
};

// ── Load existing files ──────────────────
const loadExistingFiles = async () => {
  try {
    const res = await fetch('/api/convert/list');
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      state.files = data.files;
      renderFiles();
    }
  } catch (e) {
    // Silent fail — fresh start
  }
};

// ── Event Listeners ──────────────────────
const init = () => {
  // Clear button
  els.clearBtn.addEventListener('click', () => {
    els.ytUrl.value = '';
    hideMessage();
    els.ytUrl.focus();
  });

  // Convert on button
  els.convertBtn.addEventListener('click', convertVideo);

  // Convert on Enter
  els.ytUrl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') convertVideo();
  });

  // Paste from clipboard (auto-fill if YouTube URL)
  els.ytUrl.addEventListener('paste', (e) => {
    setTimeout(() => {
      const val = els.ytUrl.value;
      if (val.includes('youtube.com') || val.includes('youtu.be')) {
        hideMessage();
      }
    }, 50);
  });

  // File selection via checkbox
  els.filesList.addEventListener('change', (e) => {
    if (e.target.classList.contains('file-checkbox')) {
      const id = e.target.dataset.id;
      toggleSelect(id);
    }
  });

  // Click on file row to toggle
  els.filesList.addEventListener('click', (e) => {
    const item = e.target.closest('.file-item');
    const deleteBtn = e.target.closest('.file-delete-btn');
    const checkbox = e.target.closest('.file-checkbox');

    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      deleteFile(id);
      return;
    }

    if (item && !checkbox) {
      const id = item.dataset.id;
      toggleSelect(id);
    }
  });

  // Select all
  els.selectAllBtn.addEventListener('click', selectAll);

  // Merge
  els.mergeBtn.addEventListener('click', mergeFiles);

  // Initial render
  renderFiles();
  loadExistingFiles();
};

// Boot
document.addEventListener('DOMContentLoaded', init);
