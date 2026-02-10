/* ════════════════════════════════════════════
   ⍼ ALIGN — Audio · Text · IPA Labeler
   Vanilla JS — Words + Sentences + IPA
   ════════════════════════════════════════════ */

// ─── State ───
let audioBuffer = null;
let audioUrl = null;
let fileName = "";
let words = [];          // [{id, text, ipa, startTime, endTime, groups}]
let sentences = [];      // [{id, wordStart, wordEnd, startTime, endTime}] derived
let sentenceBreaks = new Set([0]); // word indices that start a new sentence
let selectedWordIdx = null;
let selectedSentIdx = null;
let selection = null;
let playbackPos = 0;
let isPlaying = false;
let viewStart = 0;
let viewEnd = 1;
let activeTab = "sentences";
let activeListTab = "words"; // "words" | "sentences"
let peaks = null;

const MIN_VIEW_DURATION = 0.05;
const ZOOM_FACTOR = 0.15;
const PAN_FACTOR = 0.2;

let dragging = false;
let dragStartTime = 0;
let minimapDragging = false;

// ─── DOM ───
const audioEl = document.getElementById("audio-el");
const canvas = document.getElementById("waveform-canvas");
const ctx2d = canvas.getContext("2d");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas ? minimapCanvas.getContext("2d") : null;
const minimapViewport = document.getElementById("minimap-viewport");
const fileInput = document.getElementById("file-input");
const uploadZone = document.getElementById("upload-zone");
const uploadContainer = document.getElementById("upload-container");
const waveContainer = document.getElementById("waveform-container");
const waveControls = document.getElementById("wave-controls");
const audioMeta = document.getElementById("audio-meta");
const transInput = document.getElementById("transcription-input");
const wordListEl = document.getElementById("word-list");
const sentListEl = document.getElementById("sent-list");
const tabSentences = document.getElementById("tab-sentences");
const tabIpa = document.getElementById("tab-ipa");
const tabHelp = document.getElementById("tab-help");
const btnExportWords = document.getElementById("btn-export-words");
const btnExportSents = document.getElementById("btn-export-sents");
const zoomLevelLabel = document.getElementById("zoom-level-label");
const btnZoomSel = document.getElementById("btn-zoom-sel");

// ─── Colors ───
const WORD_COLORS = [
  "rgba(232,168,50,0.22)", "rgba(74,158,255,0.22)", "rgba(52,211,153,0.22)",
  "rgba(248,113,113,0.22)", "rgba(168,85,247,0.22)", "rgba(251,191,36,0.22)",
];
const WORD_BORDERS = ["#e8a832","#4a9eff","#34d399","#f87171","#a855f7","#fbbf24"];
const SENT_COLORS = [
  "rgba(251,146,60,0.12)", "rgba(168,85,247,0.12)", "rgba(74,158,255,0.12)",
  "rgba(52,211,153,0.12)",
];
const SENT_BORDERS = ["#fb923c","#a855f7","#4a9eff","#34d399"];

// ─── Utility ───
function fmt(t) {
  if (t == null) return "--:--";
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2);
  return `${m}:${s.padStart(5, "0")}`;
}
function fmtMs(t) {
  if (t == null) return "--";
  return t < 1 ? (t * 1000).toFixed(0) + "ms" : t.toFixed(2) + "s";
}
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function computePeaks(buf, n) {
  const data = buf.getChannelData(0);
  const bin = Math.floor(data.length / n);
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let max = 0;
    const s = i * bin, e = Math.min(s + bin, data.length);
    for (let j = s; j < e; j++) { const v = Math.abs(data[j]); if (v > max) max = v; }
    p[i] = max;
  }
  return p;
}

function encodeWAV(buf, ss, es) {
  const ch = buf.numberOfChannels, sr = buf.sampleRate;
  es = es ?? buf.length;
  const len = es - ss;
  const ab = new ArrayBuffer(44 + len * ch * 2);
  const dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0,"RIFF"); dv.setUint32(4,36+len*ch*2,true); ws(8,"WAVE"); ws(12,"fmt ");
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,ch,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*ch*2,true);
  dv.setUint16(32,ch*2,true); dv.setUint16(34,16,true);
  ws(36,"data"); dv.setUint32(40,len*ch*2,true);
  let off = 44;
  const chs = []; for (let c = 0; c < ch; c++) chs.push(buf.getChannelData(c));
  for (let i = ss; i < es; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chs[c][i]));
      dv.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

function downloadBlob(b, n) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b);
  a.download = n;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
}

// ─── View helpers ───
function getDur() { return audioBuffer ? audioBuffer.duration : 1; }
function getVDur() { return viewEnd - viewStart; }
function getZoom() { return getDur() / getVDur(); }

function clampView() {
  const dur = getDur();
  let vd = viewEnd - viewStart;
  if (vd < MIN_VIEW_DURATION) { const m = (viewStart+viewEnd)/2; viewStart = m - MIN_VIEW_DURATION/2; viewEnd = m + MIN_VIEW_DURATION/2; vd = MIN_VIEW_DURATION; }
  if (vd > dur) { viewStart = 0; viewEnd = dur; return; }
  if (viewStart < 0) { viewEnd -= viewStart; viewStart = 0; }
  if (viewEnd > dur) { viewStart -= (viewEnd - dur); viewEnd = dur; }
  viewStart = Math.max(0, viewStart); viewEnd = Math.min(dur, viewEnd);
}

function updateZoomLabel() {
  if (!zoomLevelLabel || !audioBuffer) return;
  zoomLevelLabel.textContent = `${getZoom().toFixed(1)}\u00d7 \u00b7 ${fmtMs(getVDur())}`;
  if (btnZoomSel) btnZoomSel.style.display = selection ? "" : "none";
}

function pxToTime(cx) {
  const r = canvas.getBoundingClientRect();
  return viewStart + Math.max(0, Math.min(1, (cx - r.left) / r.width)) * getVDur();
}

// ─── Canvas sizing ───
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth; canvas.height = 160;
  if (minimapCanvas) { minimapCanvas.width = minimapCanvas.parentElement.clientWidth; minimapCanvas.height = 32; }
  drawWaveform(); drawMinimap();
}

// ─── Derive sentences from breaks ───
function deriveSentences() {
  if (words.length === 0) { sentences = []; return; }
  // Ensure 0 is always a break
  sentenceBreaks.add(0);
  // Remove breaks beyond word count
  for (const b of sentenceBreaks) { if (b >= words.length) sentenceBreaks.delete(b); }
  const sorted = [...sentenceBreaks].sort((a, b) => a - b);
  sentences = sorted.map((start, i) => {
    const end = (i < sorted.length - 1 ? sorted[i + 1] : words.length) - 1;
    const text = words.slice(start, end + 1).map(w => w.text).join(" ");
    // Preserve existing sentence time if boundaries match
    const existing = sentences.find(s => s.wordStart === start && s.wordEnd === end);
    return {
      id: i,
      wordStart: start,
      wordEnd: end,
      text,
      startTime: existing ? existing.startTime : null,
      endTime: existing ? existing.endTime : null,
    };
  });
}

// ─── Waveform ───
function drawWaveform() {
  if (!audioBuffer || !peaks) return;
  const W = canvas.width, H = canvas.height, dur = getDur(), vd = getVDur();

  ctx2d.clearRect(0, 0, W, H);
  ctx2d.fillStyle = "#12121c";
  ctx2d.fillRect(0, 0, W, H);

  // Grid
  ctx2d.strokeStyle = "#1e1e2e"; ctx2d.lineWidth = 1;
  let step;
  if (vd > 60) step = 10; else if (vd > 30) step = 5; else if (vd > 10) step = 1;
  else if (vd > 3) step = 0.5; else if (vd > 1) step = 0.2;
  else if (vd > 0.3) step = 0.05; else step = 0.01;
  ctx2d.font = "10px 'IBM Plex Mono', monospace";
  for (let t = Math.ceil(viewStart / step) * step; t < viewEnd; t += step) {
    const x = ((t - viewStart) / vd) * W;
    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke();
    ctx2d.fillStyle = "#3a3a50";
    ctx2d.fillText(vd < 1 ? (t * 1000).toFixed(0) + "ms" : fmt(t), x + 3, 12);
  }
  if (vd < 3) {
    ctx2d.strokeStyle = "#15151f"; const sub = step / 5;
    for (let t = Math.ceil(viewStart / sub) * sub; t < viewEnd; t += sub) {
      const x = ((t - viewStart) / vd) * W;
      ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke();
    }
  }

  // Sentence regions (bottom band)
  sentences.forEach((s, i) => {
    if (s.startTime != null && s.endTime != null) {
      const x1 = ((s.startTime - viewStart) / vd) * W;
      const x2 = ((s.endTime - viewStart) / vd) * W;
      ctx2d.fillStyle = SENT_COLORS[i % SENT_COLORS.length];
      ctx2d.fillRect(x1, H - 24, x2 - x1, 24);
      ctx2d.strokeStyle = SENT_BORDERS[i % SENT_BORDERS.length];
      ctx2d.lineWidth = i === selectedSentIdx ? 2.5 : 1;
      ctx2d.strokeRect(x1, H - 24, x2 - x1, 24);
      if (x2 - x1 > 30) {
        ctx2d.fillStyle = SENT_BORDERS[i % SENT_BORDERS.length];
        ctx2d.font = "bold 9px 'IBM Plex Mono', monospace";
        ctx2d.fillText("S" + i, x1 + 3, H - 10);
      }
    }
  });

  // Word regions (top area)
  words.forEach((w, i) => {
    if (w.startTime != null && w.endTime != null) {
      const x1 = ((w.startTime - viewStart) / vd) * W;
      const x2 = ((w.endTime - viewStart) / vd) * W;
      ctx2d.fillStyle = WORD_COLORS[i % WORD_COLORS.length];
      ctx2d.fillRect(x1, 0, x2 - x1, H - 26);
      ctx2d.strokeStyle = WORD_BORDERS[i % WORD_BORDERS.length];
      ctx2d.lineWidth = i === selectedWordIdx ? 2.5 : 1;
      ctx2d.strokeRect(x1, 0, x2 - x1, H - 26);
      if (x2 - x1 > 20) {
        ctx2d.fillStyle = WORD_BORDERS[i % WORD_BORDERS.length];
        ctx2d.font = "bold 10px 'IBM Plex Mono', monospace";
        ctx2d.fillText(w.text, x1 + 3, H - 32);
      }
    }
  });

  // Selection
  if (selection) {
    const x1 = ((selection.start - viewStart) / vd) * W;
    const x2 = ((selection.end - viewStart) / vd) * W;
    ctx2d.fillStyle = "rgba(74,158,255,0.15)";
    ctx2d.fillRect(x1, 0, x2 - x1, H);
    ctx2d.strokeStyle = "#4a9eff"; ctx2d.lineWidth = 2;
    ctx2d.setLineDash([4, 4]); ctx2d.strokeRect(x1, 0, x2 - x1, H); ctx2d.setLineDash([]);
  }

  // Peaks
  const tp = peaks.length;
  ctx2d.fillStyle = "#e8a832";
  for (let i = 0; i < W; i++) {
    const ts = viewStart + (i / W) * vd, te = viewStart + ((i + 1) / W) * vd;
    const bs = Math.floor((ts / dur) * tp), be = Math.ceil((te / dur) * tp);
    let max = 0;
    for (let b = bs; b < be && b < tp; b++) { if (peaks[b] > max) max = peaks[b]; }
    const h = max * (H * 0.65);
    ctx2d.globalAlpha = 0.7;
    ctx2d.fillRect(i, (H - 24 - h) / 2, 1, h);
  }
  ctx2d.globalAlpha = 1;

  // Cursor
  if (playbackPos >= viewStart && playbackPos <= viewEnd) {
    const cx = ((playbackPos - viewStart) / vd) * W;
    ctx2d.strokeStyle = "#fff"; ctx2d.lineWidth = 2;
    ctx2d.beginPath(); ctx2d.moveTo(cx, 0); ctx2d.lineTo(cx, H); ctx2d.stroke();
  }

  updateZoomLabel(); updateMinimapViewport();
}

// ─── Minimap ───
function drawMinimap() {
  if (!audioBuffer || !peaks || !minimapCtx) return;
  const W = minimapCanvas.width, H = minimapCanvas.height, dur = getDur();
  minimapCtx.clearRect(0, 0, W, H);
  minimapCtx.fillStyle = "#0a0a12";
  minimapCtx.fillRect(0, 0, W, H);

  sentences.forEach((s, i) => {
    if (s.startTime != null && s.endTime != null) {
      minimapCtx.fillStyle = SENT_COLORS[i % SENT_COLORS.length];
      minimapCtx.fillRect((s.startTime / dur) * W, H - 8, ((s.endTime - s.startTime) / dur) * W, 8);
    }
  });
  words.forEach((w, i) => {
    if (w.startTime != null && w.endTime != null) {
      minimapCtx.fillStyle = WORD_COLORS[i % WORD_COLORS.length];
      minimapCtx.fillRect((w.startTime / dur) * W, 0, ((w.endTime - w.startTime) / dur) * W, H - 10);
    }
  });

  minimapCtx.fillStyle = "#e8a83260";
  for (let i = 0; i < W; i++) {
    const bin = Math.floor((i / W) * peaks.length);
    const p = peaks[Math.min(bin, peaks.length - 1)] || 0;
    const h = p * (H * 0.7);
    minimapCtx.fillRect(i, (H - h) / 2, 1, h);
  }

  const cx = (playbackPos / dur) * W;
  minimapCtx.strokeStyle = "#ffffff80"; minimapCtx.lineWidth = 1;
  minimapCtx.beginPath(); minimapCtx.moveTo(cx, 0); minimapCtx.lineTo(cx, H); minimapCtx.stroke();
  updateMinimapViewport();
}

function updateMinimapViewport() {
  if (!minimapViewport || !audioBuffer) return;
  const dur = getDur();
  minimapViewport.style.left = (viewStart / dur) * 100 + "%";
  minimapViewport.style.width = ((viewEnd - viewStart) / dur) * 100 + "%";
}

if (minimapCanvas) {
  const wrap = minimapCanvas.parentElement;
  wrap.addEventListener("mousedown", e => { if (!audioBuffer) return; minimapDragging = true; minimapNav(e); });
  document.addEventListener("mousemove", e => { if (minimapDragging) minimapNav(e); });
  document.addEventListener("mouseup", () => { minimapDragging = false; });
}
function minimapNav(e) {
  if (!audioBuffer) return;
  const r = minimapCanvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  const center = ratio * getDur(), half = getVDur() / 2;
  viewStart = center - half; viewEnd = center + half;
  clampView(); drawWaveform(); drawMinimap();
}

// ─── Audio loading ───
async function loadAudioFile(file) {
  fileName = file.name;
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = URL.createObjectURL(file);
  audioEl.src = audioUrl;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  audioBuffer = await ac.decodeAudioData(await file.arrayBuffer());
  ac.close();
  peaks = computePeaks(audioBuffer, 4000);
  viewStart = 0; viewEnd = audioBuffer.duration; playbackPos = 0; selection = null;
  uploadContainer.style.display = "none";
  waveContainer.style.display = "block";
  resizeCanvas(); renderAudioMeta(); renderWaveControls();

  // Auto-restore from localStorage if we have saved data for this file
  const saved = loadStateFromStorage(fileName);
  if (saved) {
    applyLoadedData(saved);
    showRestoreBanner();
  }
}

fileInput.addEventListener("change", e => { if (e.target.files[0]) loadAudioFile(e.target.files[0]); });
uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.classList.add("dragover"); });
uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("dragover"));
uploadZone.addEventListener("drop", e => {
  e.preventDefault(); uploadZone.classList.remove("dragover");
  if (e.dataTransfer.files[0]) loadAudioFile(e.dataTransfer.files[0]);
});

// ─── Canvas mouse ───
canvas.addEventListener("mousedown", e => {
  if (!audioBuffer) return;
  dragging = true; dragStartTime = pxToTime(e.clientX);
  selection = { start: dragStartTime, end: dragStartTime }; drawWaveform();
});
canvas.addEventListener("mousemove", e => {
  if (!dragging) return;
  const t = pxToTime(e.clientX);
  selection = { start: Math.min(dragStartTime, t), end: Math.max(dragStartTime, t) };
  drawWaveform(); renderWaveControls();
});
canvas.addEventListener("mouseup", e => {
  if (!dragging) return; dragging = false;
  const t = pxToTime(e.clientX);
  const s = Math.min(dragStartTime, t), en = Math.max(dragStartTime, t);
  if (Math.abs(en - s) < 0.005) { selection = null; seek(s); }
  else selection = { start: s, end: en };
  drawWaveform(); renderWaveControls();
});
canvas.addEventListener("mouseleave", () => { dragging = false; });

canvas.addEventListener("wheel", e => {
  if (!audioBuffer) return; e.preventDefault();
  if (e.shiftKey) {
    const pan = getVDur() * PAN_FACTOR * (e.deltaY > 0 ? 1 : -1);
    viewStart += pan; viewEnd += pan;
  } else {
    const cur = pxToTime(e.clientX), vd = getVDur();
    const f = e.deltaY > 0 ? (1 + ZOOM_FACTOR) : (1 - ZOOM_FACTOR);
    const nd = Math.max(MIN_VIEW_DURATION, Math.min(getDur(), vd * f));
    const r = (cur - viewStart) / vd;
    viewStart = cur - r * nd; viewEnd = viewStart + nd;
  }
  clampView(); drawWaveform(); drawMinimap();
}, { passive: false });

// ─── Zoom/Pan ───
function zoomIn() { const m=(viewStart+viewEnd)/2,nd=Math.max(MIN_VIEW_DURATION,getVDur()*(1-ZOOM_FACTOR*2)); viewStart=m-nd/2; viewEnd=m+nd/2; clampView(); drawWaveform(); drawMinimap(); }
function zoomOut() { const m=(viewStart+viewEnd)/2,nd=Math.min(getDur(),getVDur()*(1+ZOOM_FACTOR*2)); viewStart=m-nd/2; viewEnd=m+nd/2; clampView(); drawWaveform(); drawMinimap(); }
function zoomFit() { viewStart=0; viewEnd=getDur(); drawWaveform(); drawMinimap(); }
function zoomSelection() { if(!selection)return; const p=(selection.end-selection.start)*0.1; viewStart=Math.max(0,selection.start-p); viewEnd=Math.min(getDur(),selection.end+p); clampView(); drawWaveform(); drawMinimap(); }
function panLeft() { const a=getVDur()*PAN_FACTOR; viewStart-=a; viewEnd-=a; clampView(); drawWaveform(); drawMinimap(); }
function panRight() { const a=getVDur()*PAN_FACTOR; viewStart+=a; viewEnd+=a; clampView(); drawWaveform(); drawMinimap(); }

// ─── Playback ───
function togglePlay() {
  if (!audioEl.src) return;
  if (audioEl.paused) {
    if (selection) {
      if (activeListTab === "words" && selectedWordIdx != null) audioEl.currentTime = selection.start;
      else if (activeListTab === "sentences" && selectedSentIdx != null) audioEl.currentTime = selection.start;
      else audioEl.currentTime = selection.start;
    }
    audioEl.play(); isPlaying = true; tick();
  } else { audioEl.pause(); isPlaying = false; }
  renderWaveControls();
}
function seek(t) { audioEl.currentTime = t; playbackPos = t; drawWaveform(); drawMinimap(); renderAudioMeta(); }
function playRegion(s, e) {
  audioEl.currentTime = s; audioEl.play(); isPlaying = true;
  const chk = () => {
    if (audioEl.currentTime >= e) { audioEl.pause(); isPlaying = false; audioEl.currentTime = s; playbackPos = s; drawWaveform(); drawMinimap(); renderWaveControls(); }
    else if (!audioEl.paused) { playbackPos = audioEl.currentTime; drawWaveform(); requestAnimationFrame(chk); }
  };
  requestAnimationFrame(chk); renderWaveControls();
}
function tick() {
  if (audioEl.paused) { isPlaying = false; renderWaveControls(); return; }
  playbackPos = audioEl.currentTime;
  const r = (playbackPos - viewStart) / getVDur();
  if (r > 0.85) { const sh = getVDur() * 0.5; viewStart += sh; viewEnd += sh; clampView(); }
  drawWaveform(); drawMinimap(); renderAudioMeta(); requestAnimationFrame(tick);
}
audioEl.addEventListener("ended", () => { isPlaying = false; renderWaveControls(); });

// ─── Word syncing ───
// Track whether user has manually edited breaks
let userEditedBreaks = false;

function syncWords() {
  const rawText = transInput.value;
  const textWords = rawText.trim().split(/\s+/).filter(Boolean);
  const prev = words;
  const prevTexts = prev.map(w => w.text).join(" ");
  const newTexts = textWords.join(" ");
  const textChanged = prevTexts !== newTexts;

  words = textWords.map((text, i) => {
    const existing = prev[i];
    let groups;
    if (existing && existing.text === text && existing.groups?.length) groups = existing.groups;
    else groups = text.split("").map(ch => ({ graphemes: ch, ipa: "" }));
    return {
      id: i, text,
      ipa: (existing && existing.text === text) ? (existing.ipa || "") : "",
      startTime: (existing && existing.text === text) ? existing.startTime : null,
      endTime: (existing && existing.text === text) ? existing.endTime : null,
      groups,
    };
  });
  if (selectedWordIdx != null && selectedWordIdx >= words.length)
    selectedWordIdx = words.length > 0 ? words.length - 1 : null;

  // Auto-detect sentence breaks when text changes AND user hasn't manually edited
  if (textChanged && words.length > 0) {
    if (!userEditedBreaks || prev.length === 0) {
      sentenceBreaks = autoDetectBreaks(rawText, words);
    } else {
      // Just clean existing breaks
      const newBreaks = new Set([0]);
      for (const b of sentenceBreaks) { if (b > 0 && b < words.length) newBreaks.add(b); }
      sentenceBreaks = newBreaks;
    }
  }

  deriveSentences();
  renderAll();
  saveState();
}

// ─── Smart sentence break detection ───
function autoDetectBreaks(rawText, wordList) {
  const breaks = new Set([0]);
  if (wordList.length === 0) return breaks;

  // Sentence-ending punctuation: .!?;  and also : when followed by newline
  // We need to map each word back to its position in the raw text to detect what follows it
  const endPunct = /[.!?;…]$/;
  const colonEnd = /:$/;

  // Scan raw text to find word positions and what's between them
  let cursor = 0;
  const wordPositions = []; // [{start, end}] for each word in raw text

  for (let i = 0; i < wordList.length; i++) {
    const word = wordList[i].text;
    const idx = rawText.indexOf(word, cursor);
    if (idx >= 0) {
      wordPositions.push({ start: idx, end: idx + word.length });
      cursor = idx + word.length;
    } else {
      wordPositions.push({ start: cursor, end: cursor + word.length });
      cursor += word.length;
    }
  }

  for (let i = 0; i < wordList.length - 1; i++) {
    const word = wordList[i].text;
    const between = rawText.slice(wordPositions[i].end, wordPositions[i + 1].start);
    const hasNewline = /\n/.test(between);
    const endsWithPunct = endPunct.test(word);
    const endsWithColon = colonEnd.test(word);

    // Break after sentence-ending punctuation
    if (endsWithPunct) {
      breaks.add(i + 1);
    }
    // Break after colon if followed by newline
    else if (endsWithColon && hasNewline) {
      breaks.add(i + 1);
    }
    // Break at newlines (even without punctuation)
    else if (hasNewline) {
      breaks.add(i + 1);
    }
  }

  return breaks;
}

transInput.addEventListener("input", syncWords);

// ─── Assignment ───
function assignSelection() {
  if (!selection) return;
  if (activeListTab === "words" && selectedWordIdx != null) {
    words[selectedWordIdx].startTime = selection.start;
    words[selectedWordIdx].endTime = selection.end;
    if (selectedWordIdx < words.length - 1) selectedWordIdx++;
  } else if (activeListTab === "sentences" && selectedSentIdx != null) {
    sentences[selectedSentIdx].startTime = selection.start;
    sentences[selectedSentIdx].endTime = selection.end;
    if (selectedSentIdx < sentences.length - 1) selectedSentIdx++;
  }
  selection = null;
  renderAll();
  saveState();
}

function clearWordTime(i) { words[i].startTime = null; words[i].endTime = null; renderAll(); saveState(); }
function clearSentTime(i) { sentences[i].startTime = null; sentences[i].endTime = null; renderAll(); saveState(); }

function selectWord(i) {
  selectedWordIdx = (selectedWordIdx === i) ? null : i;
  selectedSentIdx = null;
  activeListTab = "words";
  switchListTab("words");
  renderAll();
}
function selectSent(i) {
  selectedSentIdx = (selectedSentIdx === i) ? null : i;
  selectedWordIdx = null;
  activeListTab = "sentences";
  switchListTab("sentences");
  renderAll();
}

// ─── Sentence break toggling ───
function toggleBreak(wordIdx) {
  if (wordIdx <= 0 || wordIdx >= words.length) return;
  if (sentenceBreaks.has(wordIdx)) sentenceBreaks.delete(wordIdx);
  else sentenceBreaks.add(wordIdx);
  userEditedBreaks = true;
  deriveSentences();
  renderAll();
  saveState();
}

function redetectBreaks() {
  sentenceBreaks = autoDetectBreaks(transInput.value, words);
  userEditedBreaks = false;
  deriveSentences();
  renderAll();
  saveState();
}

// ─── IPA per-word ───
function setWordIpa(i, val) {
  words[i].ipa = val;
  if (words[i].groups.length > 0) {
    const hasCustom = words[i].groups.some((g, gi) => gi > 0 && g.ipa !== "");
    if (!hasCustom) words[i].groups[0].ipa = val;
  }
  saveState();
}

// ─── Render all ───
function renderAll() {
  renderWordList();
  renderSentList();
  renderSentEditor();
  renderIpaEditor();
  updateExportBtns();
  drawWaveform();
  drawMinimap();
}

function renderAudioMeta() {
  if (!audioBuffer) { audioMeta.innerHTML = ""; return; }
  audioMeta.innerHTML = `<span class="wave-info">${fmt(playbackPos)} / ${fmt(audioBuffer.duration)} \u00b7 ${audioBuffer.sampleRate}Hz</span>`;
}

function renderWaveControls() {
  const target = activeListTab === "words" && selectedWordIdx != null ? words[selectedWordIdx]
    : activeListTab === "sentences" && selectedSentIdx != null ? sentences[selectedSentIdx] : null;
  const tName = activeListTab === "words" && selectedWordIdx != null ? `"${words[selectedWordIdx].text}"`
    : activeListTab === "sentences" && selectedSentIdx != null ? `S${selectedSentIdx}` : null;

  let h = `<button class="btn btn-primary" onclick="togglePlay()">${isPlaying ? "\u23f8 Pause" : "\u25b6 Play"}</button>`;
  if (selection) {
    h += `<span class="sel-info">Sel: ${fmt(selection.start)} \u2192 ${fmt(selection.end)} (${fmtMs(selection.end - selection.start)})</span>`;
    if (tName) h += `<button class="btn btn-blue" onclick="assignSelection()">\u23ce Assign to ${esc(tName)}</button>`;
    h += `<button class="btn btn-blue" onclick="playRegion(${selection.start},${selection.end})">\u25b6 Sel</button>`;
    h += `<button class="btn btn-sm" onclick="selection=null;drawWaveform();renderWaveControls()">\u2715</button>`;
  }
  waveControls.innerHTML = h;
}

// ─── Word list ───
function renderWordList() {
  const el = document.getElementById("word-count-label");
  const el2 = document.getElementById("aligned-word-count");
  const aligned = words.filter(w => w.startTime != null).length;
  el.textContent = `Words (${words.length})`; el2.textContent = `${aligned} aligned`;

  if (words.length === 0) { wordListEl.innerHTML = '<div class="empty-state">Enter transcription above\u2026</div>'; return; }
  wordListEl.innerHTML = words.map((w, i) => {
    const sel = i === selectedWordIdx ? " selected" : "";
    const time = w.startTime != null
      ? `<span class="item-time">${fmt(w.startTime)}\u2013${fmt(w.endTime)}</span>
         <button class="btn btn-sm" onclick="event.stopPropagation();playRegion(${w.startTime},${w.endTime})">\u25b6</button>
         <button class="btn btn-red btn-sm" onclick="event.stopPropagation();clearWordTime(${i})">\u2715</button>`
      : '<span class="item-unaligned">unaligned</span>';
    return `<div class="list-item${sel}" onclick="selectWord(${i})">
      <div class="item-left">
        <span class="word-text"><span class="word-idx">${i}</span>${esc(w.text)}</span>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:10px;color:var(--blue);font-family:var(--font-mono)">IPA:</span>
          <input class="ipa-inline-input" value="${esc(w.ipa)}" placeholder="/" onclick="event.stopPropagation()" oninput="setWordIpa(${i},this.value)">
        </div>
      </div>
      <div class="item-right">${time}</div>
    </div>`;
  }).join("");
}

// ─── Sentence list ───
function renderSentList() {
  const el = document.getElementById("sent-count-label");
  const el2 = document.getElementById("aligned-sent-count");
  const aligned = sentences.filter(s => s.startTime != null).length;
  el.textContent = `Sentences (${sentences.length})`; el2.textContent = `${aligned} aligned`;

  if (sentences.length === 0) { sentListEl.innerHTML = '<div class="empty-state">Define sentences in the editor \u2192</div>'; return; }
  sentListEl.innerHTML = sentences.map((s, i) => {
    const sel = i === selectedSentIdx ? " selected-sent" : "";
    const time = s.startTime != null
      ? `<span class="item-time">${fmt(s.startTime)}\u2013${fmt(s.endTime)}</span>
         <button class="btn btn-sm" onclick="event.stopPropagation();playRegion(${s.startTime},${s.endTime})">\u25b6</button>
         <button class="btn btn-red btn-sm" onclick="event.stopPropagation();clearSentTime(${i})">\u2715</button>`
      : '<span class="item-unaligned">unaligned</span>';
    return `<div class="list-item${sel}" onclick="selectSent(${i})" style="${i === selectedSentIdx ? 'border-color:var(--orange);background:rgba(251,146,60,0.06)' : ''}">
      <div class="item-left">
        <span class="sent-label">S${i} \u00b7 words ${s.wordStart}\u2013${s.wordEnd}</span>
        <span class="sent-text">${esc(s.text)}</span>
      </div>
      <div class="item-right">${time}</div>
    </div>`;
  }).join("");
}

// ─── Sentence grouping editor ───
const SENT_CSS_COLORS = ["#fb923c","#a855f7","#4a9eff","#34d399","#fbbf24","#f87171"];

function renderSentEditor() {
  if (words.length === 0) {
    tabSentences.innerHTML = '<div class="empty-state">Enter transcription to define sentence boundaries</div>';
    return;
  }

  const sorted = [...sentenceBreaks].sort((a, b) => a - b);

  // Map each word to its sentence index
  const wordToSent = new Array(words.length).fill(0);
  sorted.forEach((breakIdx, bi) => {
    const nextBreak = bi < sorted.length - 1 ? sorted[bi + 1] : words.length;
    for (let wi = breakIdx; wi < nextBreak; wi++) wordToSent[wi] = bi;
  });

  let html = '';

  // ── Top: Sentence groups with colored borders ──
  html += '<div class="label" style="font-size:10px;margin-bottom:8px">Sentence groups — click a group to select it for alignment</div>';
  html += '<div class="sent-editor-wrap">';

  let currentSentIdx = 0;
  sorted.forEach((breakIdx, bi) => {
    const nextBreak = bi < sorted.length - 1 ? sorted[bi + 1] : words.length;
    const isSel = currentSentIdx === selectedSentIdx;
    const wordCount = nextBreak - breakIdx;

    html += `<div class="sent-group${isSel ? ' sel' : ''}" onclick="selectSent(${currentSentIdx})">`;
    html += `<span class="sent-group-label">S${currentSentIdx} \u00b7 ${wordCount}w</span>`;
    for (let wi = breakIdx; wi < nextBreak; wi++) {
      html += `<span class="sent-word">${esc(words[wi].text)}</span>`;
    }
    html += '</div>';

    // Break divider between groups
    if (bi < sorted.length - 1) {
      html += `<div class="sent-break-divider">
        <div class="sent-break-divider-line"></div>
        <button class="sent-break-btn is-break" onclick="event.stopPropagation();toggleBreak(${sorted[bi + 1]})" title="Remove break (merge sentences)">\u2715</button>
        <div class="sent-break-divider-line"></div>
      </div>`;
    }

    currentSentIdx++;
  });
  html += '</div>';

  // ── Bottom: Word-level view with break toggles ──
  html += '<div style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">';
  html += '<div class="label" style="font-size:10px;margin-bottom:8px">Word-level — click between words to add/remove breaks</div>';
  html += '<div style="display:flex;flex-wrap:wrap;align-items:center;gap:0;row-gap:6px">';

  words.forEach((w, i) => {
    if (i > 0) {
      const isBreak = sentenceBreaks.has(i);
      if (isBreak) {
        // Prominent break marker with sentence label
        html += `<div class="word-break-marker">
          <span class="word-sent-label">S${wordToSent[i]}</span>
          <button class="sent-break-btn is-break" onclick="toggleBreak(${i})" title="Remove break">\u2715</button>
        </div>`;
      } else {
        html += `<button class="sent-break-btn" onclick="toggleBreak(${i})" title="Add break here">\u2702</button>`;
      }
    } else {
      // First word always gets a sentence label
      html += `<span class="word-sent-label" style="margin-right:2px">S0</span>`;
    }

    const sentIdx = wordToSent[i];
    const colorClass = `sent-word-s${sentIdx % 6}`;
    html += `<span class="sent-word ${colorClass}" style="font-size:13px">${esc(w.text)}</span>`;
  });

  html += '</div></div>';

  // ── Summary ──
  html += '<div class="preview-row" style="margin-top:12px"><div class="label" style="font-size:10px;margin-bottom:6px">Summary \u00b7 ' + sentences.length + ' sentence' + (sentences.length !== 1 ? 's' : '') + '</div>';
  sentences.forEach((s, i) => {
    const col = SENT_CSS_COLORS[i % SENT_CSS_COLORS.length];
    const timeStr = s.startTime != null ? ` \u00b7 ${fmt(s.startTime)}\u2013${fmt(s.endTime)}` : '';
    html += `<div style="margin-bottom:4px;padding:4px 8px;border-left:3px solid ${col};border-radius:2px">
      <span style="color:${col};font-weight:700">S${i}</span>
      <span style="color:var(--text);margin-left:6px">${esc(s.text)}</span>
      <span style="color:var(--green);font-size:11px">${timeStr}</span>
    </div>`;
  });
  html += '</div>';

  // ── Auto-detect button ──
  html += `<div style="margin-top:10px;display:flex;gap:8px;align-items:center">
    <button class="btn btn-sm btn-orange" onclick="redetectBreaks()">↻ Re-detect from punctuation</button>
    <span class="wave-info">Re-runs auto-detection from punctuation &amp; newlines</span>
  </div>`;

  tabSentences.innerHTML = html;
}

// ─── IPA editor ───
function renderIpaEditor() {
  if (selectedWordIdx == null || !words[selectedWordIdx]) {
    tabIpa.innerHTML = '<div class="empty-state">Select a word to edit IPA\u2194grapheme alignment</div>';
    return;
  }
  const w = words[selectedWordIdx], wIdx = selectedWordIdx;
  let gh = "";
  w.groups.forEach((g, gi) => {
    let ch = "";
    g.graphemes.split("").forEach((c, ci) => {
      if (ci > 0) ch += `<button class="ipa-split-bar" onclick="splitGroup(${wIdx},${gi},${ci})"></button>`;
      ch += `<span class="ipa-group-char">${esc(c)}</span>`;
    });
    const iw = Math.max(36, g.graphemes.length * 18);
    gh += `<div class="ipa-group"><div class="ipa-group-chars">${ch}</div><div class="ipa-group-divider"></div><input class="ipa-group-input" value="${esc(g.ipa)}" placeholder="IPA" style="width:${iw}px" oninput="updateGroupIpa(${wIdx},${gi},this.value)"></div>`;
    if (gi < w.groups.length - 1) gh += `<button class="merge-btn" onclick="mergeGroups(${wIdx},${gi})">\u27f7</button>`;
  });
  const pv = w.groups.map(g => `<span style="margin-right:8px"><span style="color:var(--text)">${esc(g.graphemes)}</span><span class="preview-arrow"> \u2192 </span><span style="color:var(--blue)">${g.ipa || "\u2205"}</span></span>`).join("");

  tabIpa.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <span style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:var(--accent)">${esc(w.text)}</span>
      ${w.ipa ? `<span style="font-family:var(--font-mono);font-size:16px;color:var(--blue)">/${esc(w.ipa)}/</span>` : ""}
    </div>
    <div class="label" style="font-size:10px">Grapheme \u2192 IPA (blue bars = split, \u27f7 = merge)</div>
    <div class="ipa-editor-row">${gh}</div>
    <div class="preview-row"><div class="label" style="font-size:10px;margin-bottom:4px">Preview</div><div>${pv}</div></div>`;
}

function mergeGroups(wIdx, gIdx) {
  const g = words[wIdx].groups; if (gIdx >= g.length - 1) return;
  g[gIdx] = { graphemes: g[gIdx].graphemes + g[gIdx+1].graphemes, ipa: g[gIdx].ipa + g[gIdx+1].ipa };
  g.splice(gIdx + 1, 1); renderIpaEditor(); saveState();
}
function splitGroup(wIdx, gIdx, ci) {
  const g = words[wIdx].groups, old = g[gIdx];
  if (ci <= 0 || ci >= old.graphemes.length) return;
  g.splice(gIdx, 1, { graphemes: old.graphemes.slice(0, ci), ipa: old.ipa }, { graphemes: old.graphemes.slice(ci), ipa: "" });
  renderIpaEditor(); saveState();
}
function updateGroupIpa(wIdx, gIdx, val) {
  words[wIdx].groups[gIdx].ipa = val;
  saveState();
  const pe = tabIpa.querySelector(".preview-row > div:last-child");
  if (pe) {
    pe.innerHTML = words[wIdx].groups.map(g => `<span style="margin-right:8px"><span style="color:var(--text)">${esc(g.graphemes)}</span><span class="preview-arrow"> \u2192 </span><span style="color:var(--blue)">${g.ipa || "\u2205"}</span></span>`).join("");
  }
}

// ─── Tabs ───
function switchTab(tab) {
  activeTab = tab;
  tabSentences.style.display = tab === "sentences" ? "" : "none";
  tabIpa.style.display = tab === "ipa" ? "" : "none";
  tabHelp.style.display = tab === "help" ? "" : "none";
  document.querySelectorAll(".btn-tab").forEach(b => {
    b.classList.toggle("btn-primary", b.dataset.tab === tab);
  });
}

function switchListTab(tab) {
  activeListTab = tab;
  document.getElementById("list-words").style.display = tab === "words" ? "" : "none";
  document.getElementById("list-sentences").style.display = tab === "sentences" ? "" : "none";
  document.querySelectorAll(".list-tab").forEach(b => {
    b.classList.toggle("active", b.dataset.ltab === tab);
  });
  renderWaveControls();
}

function updateExportBtns() {
  btnExportWords.textContent = `\u2193 Word Segments (${words.filter(w => w.startTime != null).length})`;
  btnExportSents.textContent = `\u2193 Sentence Segments (${sentences.filter(s => s.startTime != null).length})`;
}

// ─── Export ───
function exportJSON() {
  const data = {
    fileName, duration: audioBuffer?.duration ?? null, sampleRate: audioBuffer?.sampleRate ?? null,
    transcription: transInput.value,
    sentenceBreaks: [...sentenceBreaks],
    words: words.map(w => ({
      text: w.text, ipa: w.ipa, startTime: w.startTime, endTime: w.endTime,
      ipaAlignment: w.groups.map(g => ({ graphemes: g.graphemes, ipa: g.ipa })),
    })),
    sentences: sentences.map(s => ({
      id: s.id, wordStart: s.wordStart, wordEnd: s.wordEnd,
      text: s.text, startTime: s.startTime, endTime: s.endTime,
    })),
  };
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), (fileName?.replace(/\.[^.]+$/, "") || "alignment") + ".json");
}

async function exportWordSegments() {
  if (!audioBuffer) return;
  const aligned = words.filter(w => w.startTime != null && w.endTime != null);
  if (aligned.length === 0) return;
  btnExportWords.textContent = "\u2193 Exporting...";
  btnExportWords.disabled = true;
  for (let i = 0; i < aligned.length; i++) {
    const w = aligned[i];
    const ss = Math.floor(w.startTime * audioBuffer.sampleRate);
    const es = Math.floor(w.endTime * audioBuffer.sampleRate);
    downloadBlob(encodeWAV(audioBuffer, ss, es), `word_${w.id}_${w.text}.wav`);
    if (i < aligned.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  btnExportWords.disabled = false;
  updateExportBtns();
}

async function exportSentenceSegments() {
  if (!audioBuffer) return;
  const aligned = sentences.filter(s => s.startTime != null && s.endTime != null);
  if (aligned.length === 0) return;
  btnExportSents.textContent = "\u2193 Exporting...";
  btnExportSents.disabled = true;
  for (let i = 0; i < aligned.length; i++) {
    const s = aligned[i];
    const ss = Math.floor(s.startTime * audioBuffer.sampleRate);
    const es = Math.floor(s.endTime * audioBuffer.sampleRate);
    const name = s.text.slice(0, 30).replace(/[^a-zA-Z0-9 ]/g, "").replace(/ +/g, "_");
    downloadBlob(encodeWAV(audioBuffer, ss, es), `sent_${s.id}_${name}.wav`);
    if (i < aligned.length - 1) await new Promise(r => setTimeout(r, 500));
  }
  btnExportSents.disabled = false;
  updateExportBtns();
}

// ─── LocalStorage persistence ───
const STORAGE_PREFIX = "align_v1_";

function getStorageKey(name) {
  return STORAGE_PREFIX + name;
}

function buildSaveData() {
  return {
    version: 1,
    fileName,
    transcription: transInput.value,
    words: words.map(w => ({
      text: w.text, ipa: w.ipa, startTime: w.startTime, endTime: w.endTime,
      groups: w.groups.map(g => ({ graphemes: g.graphemes, ipa: g.ipa })),
    })),
    sentenceBreaks: [...sentenceBreaks],
    userEditedBreaks,
    sentences: sentences.map(s => ({
      id: s.id, wordStart: s.wordStart, wordEnd: s.wordEnd,
      text: s.text, startTime: s.startTime, endTime: s.endTime,
    })),
  };
}

let saveTimeout = null;
const saveIndicator = document.getElementById("save-indicator");

function flashSaveIndicator() {
  if (!saveIndicator) return;
  saveIndicator.style.opacity = "1";
  setTimeout(() => { saveIndicator.style.opacity = "0"; }, 1500);
}

function showRestoreBanner() {
  // Brief notification that data was restored
  const banner = document.createElement("div");
  banner.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:999;background:#1a1a24;border:1px solid #34d399;color:#34d399;font-family:'IBM Plex Mono',monospace;font-size:13px;padding:8px 20px;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,0.5);transition:opacity 0.5s";
  banner.textContent = "\u2714 Previous session restored for \"" + fileName + "\"";
  document.body.appendChild(banner);
  setTimeout(() => { banner.style.opacity = "0"; setTimeout(() => banner.remove(), 500); }, 3000);
}

function saveState() {
  if (!fileName) return;
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    try {
      const data = buildSaveData();
      localStorage.setItem(getStorageKey(fileName), JSON.stringify(data));
      flashSaveIndicator();
    } catch (e) {
      console.warn("Save failed:", e);
    }
  }, 500); // debounce 500ms
}

function loadStateFromStorage(name) {
  try {
    const raw = localStorage.getItem(getStorageKey(name));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

function applyLoadedData(data) {
  // Set transcription
  transInput.value = data.transcription || "";

  // Rebuild words
  const textWords = transInput.value.trim().split(/\s+/).filter(Boolean);
  words = textWords.map((text, i) => {
    const saved = data.words && data.words[i];
    let groups;
    if (saved && saved.text === text) {
      // Handle both formats: "groups" (from localStorage) and "ipaAlignment" (from exported JSON)
      const srcGroups = saved.groups || saved.ipaAlignment;
      if (srcGroups && srcGroups.length) {
        groups = srcGroups.map(g => ({ graphemes: g.graphemes, ipa: g.ipa || "" }));
      } else {
        groups = text.split("").map(ch => ({ graphemes: ch, ipa: "" }));
      }
    } else {
      groups = text.split("").map(ch => ({ graphemes: ch, ipa: "" }));
    }
    return {
      id: i, text,
      ipa: (saved && saved.text === text) ? (saved.ipa || "") : "",
      startTime: (saved && saved.text === text) ? saved.startTime : null,
      endTime: (saved && saved.text === text) ? saved.endTime : null,
      groups,
    };
  });

  // Rebuild sentence breaks: try sentenceBreaks array first, fall back to reconstructing from sentences
  sentenceBreaks = new Set([0]);
  if (data.sentenceBreaks && data.sentenceBreaks.length) {
    data.sentenceBreaks.forEach(b => { if (b >= 0 && b < words.length) sentenceBreaks.add(b); });
    userEditedBreaks = data.userEditedBreaks ?? true;
  } else if (data.sentences && data.sentences.length) {
    // Reconstruct breaks from sentence wordStart indices
    data.sentences.forEach(s => {
      if (s.wordStart >= 0 && s.wordStart < words.length) sentenceBreaks.add(s.wordStart);
    });
  }

  // Derive sentences, then restore their times
  deriveSentences();
  if (data.sentences) {
    data.sentences.forEach(saved => {
      const match = sentences.find(s => s.wordStart === saved.wordStart && s.wordEnd === saved.wordEnd);
      if (match) { match.startTime = saved.startTime; match.endTime = saved.endTime; }
    });
  }

  selectedWordIdx = null;
  selectedSentIdx = null;
  selection = null;
  renderAll();
}

// ─── Hook save into all state changes ───
const _origSyncWords = syncWords;
// We'll override by wrapping — but since syncWords is called via event listener,
// we patch it by adding save calls in key places instead.

function saveAfterChange() {
  saveState();
}

// ─── JSON Import ───
const jsonImport = document.getElementById("json-import");
jsonImport.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.words && !data.transcription) {
      alert("Invalid alignment JSON: missing words or transcription.");
      return;
    }
    applyLoadedData(data);
    if (data.fileName) fileName = data.fileName;
    saveState();
  } catch (err) {
    alert("Failed to parse JSON: " + err.message);
  }
  jsonImport.value = "";
});

// ─── Keyboard ───
document.addEventListener("keydown", e => {
  const tag = e.target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;

  if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  if (e.code === "Enter" && selection) { e.preventDefault(); assignSelection(); }

  if (e.code === "ArrowDown" && !e.shiftKey) {
    e.preventDefault();
    if (activeListTab === "words" && words.length) {
      selectedWordIdx = selectedWordIdx == null ? 0 : Math.min(selectedWordIdx + 1, words.length - 1);
      selectedSentIdx = null;
      renderAll();
      wordListEl.querySelectorAll(".list-item")[selectedWordIdx]?.scrollIntoView({ block: "nearest" });
    } else if (activeListTab === "sentences" && sentences.length) {
      selectedSentIdx = selectedSentIdx == null ? 0 : Math.min(selectedSentIdx + 1, sentences.length - 1);
      selectedWordIdx = null;
      renderAll();
      sentListEl.querySelectorAll(".list-item")[selectedSentIdx]?.scrollIntoView({ block: "nearest" });
    }
  }
  if (e.code === "ArrowUp" && !e.shiftKey) {
    e.preventDefault();
    if (activeListTab === "words" && words.length) {
      selectedWordIdx = selectedWordIdx == null ? 0 : Math.max(selectedWordIdx - 1, 0);
      selectedSentIdx = null;
      renderAll();
      wordListEl.querySelectorAll(".list-item")[selectedWordIdx]?.scrollIntoView({ block: "nearest" });
    } else if (activeListTab === "sentences" && sentences.length) {
      selectedSentIdx = selectedSentIdx == null ? 0 : Math.max(selectedSentIdx - 1, 0);
      selectedWordIdx = null;
      renderAll();
      sentListEl.querySelectorAll(".list-item")[selectedSentIdx]?.scrollIntoView({ block: "nearest" });
    }
  }

  if (e.code === "KeyA" || (e.shiftKey && e.code === "ArrowLeft")) { e.preventDefault(); panLeft(); }
  if (e.code === "KeyD" || (e.shiftKey && e.code === "ArrowRight")) { e.preventDefault(); panRight(); }
  if (e.code === "Equal" || e.code === "NumpadAdd" || (e.shiftKey && e.code === "ArrowUp")) { e.preventDefault(); zoomIn(); }
  if (e.code === "Minus" || e.code === "NumpadSubtract" || (e.shiftKey && e.code === "ArrowDown")) { e.preventDefault(); zoomOut(); }
  if (e.code === "Home") { e.preventDefault(); zoomFit(); }
});

window.addEventListener("resize", () => { if (audioBuffer) resizeCanvas(); });

// ─── Init ───
deriveSentences();
renderAll();
