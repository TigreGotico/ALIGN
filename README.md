# ⍼ ALIGN — Audio · Text · IPA Labeler

A browser-based tool for aligning audio with text transcriptions and IPA (International Phonetic Alphabet) at word, grapheme, and sentence level. Runs entirely client-side — no server, no dependencies, no build step.

**[Live Demo →](https://tigregotico.github.io/ALIGN)** · **[Donate](https://www.paypal.me/AnaIsabelFerreira)**

<img width="981" height="767" alt="image" src="https://github.com/user-attachments/assets/58380d79-56a2-408b-bc2d-898d6686bcdc" />

---

## What it does

ALIGN lets you take an audio file and its transcription, then precisely mark where each word and sentence occurs in the audio. You can also map IPA symbols to individual graphemes (characters) within each word.

This is useful for:

- **Speech synthesis (TTS) dataset preparation** — segment and label audio corpora with word/sentence boundaries and phonetic transcriptions
- **Pronunciation research** — map graphemes to phonemes for any language
- **Forced alignment annotation** — manually correct or create alignment data
- **Language learning content** — create precisely timed word-level audio clips

## Features

### Audio navigation
- Zoomable waveform — scroll to zoom at cursor, shift+scroll to pan
- Minimap overview bar — click/drag to jump anywhere
- Adaptive grid that scales from 10s intervals down to 10ms ticks
- Auto-scroll during playback
- Keyboard shortcuts for everything

### Word alignment
- Type or paste transcription, words are automatically tokenized
- Select a word → drag on waveform → press Enter to assign time boundaries
- Auto-advances to next word for rapid labeling
- Play back individual word segments
  
<img width="959" height="377" alt="image" src="https://github.com/user-attachments/assets/99920f6a-c651-4575-a7ea-15cef1422129" />

### Sentence segmentation
- Define sentence boundaries by clicking between words in the sentence editor
- Align each sentence to audio independently of word alignment
- Sentences rendered as a separate band on the waveform

<img width="958" height="737" alt="image" src="https://github.com/user-attachments/assets/15555fce-25de-4d07-b995-dfc5ba5afece" />

### IPA ↔ Grapheme mapping
- Per-word IPA input directly in the word list
- Detailed grapheme-to-IPA editor: split and merge character groups, assign IPA to each group
- Example: the word "ship" → `sh → ʃ`, `i → ɪ`, `p → p`

<img width="971" height="359" alt="image" src="https://github.com/user-attachments/assets/38d5fe36-3e15-4fa7-9f6b-30984ea2ea37" />

### Persistence
- **Auto-save** to localStorage — resume work when you reload the page and open the same audio file
- **Export to JSON** — full alignment data including words, sentences, IPA mappings, and time boundaries
- **Import from JSON** — restore a previous session from an exported file
- **Export audio segments** — download individual WAV files for each aligned word or sentence

## Getting started

### Option 1: Just open it
Download `index.html` and `app.js` into the same folder and open `index.html` in any modern browser. That's it.

### Option 2: GitHub Pages
Push both files to a GitHub repository and enable Pages — the tool will be served at `https://yourusername.github.io/your-repo/`.

### Option 3: Any static host
Works on Netlify, Vercel, Cloudflare Pages, S3, or any static file server. No build step required.

## Usage

### Basic workflow

1. **Upload audio** — drag and drop or click the upload zone (supports any browser-playable format: WAV, MP3, OGG, FLAC, etc.)
2. **Enter transcription** — type or paste the full text in the transcription box
3. **Align words** — click a word in the list → drag on the waveform to select its region → press `Enter`
4. **Define sentences** — go to the Sentences tab, click ✂ between words to set sentence boundaries
5. **Align sentences** — switch to the Sentences list tab, select a sentence, drag on waveform, press `Enter`
6. **Add IPA** — type IPA in the inline input next to each word, or use the IPA ↔ Grapheme tab for detailed mapping
7. **Export** — download JSON metadata, word WAV segments, or sentence WAV segments

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `Enter` | Assign waveform selection to selected item |
| `↑` / `↓` | Navigate words or sentences |
| `Scroll` | Zoom waveform at cursor |
| `Shift+Scroll` | Pan waveform |
| `A` / `D` | Pan left / right |
| `+` / `-` | Zoom in / out |
| `Home` | Zoom to fit |

## Export format

The JSON export contains everything needed to reconstruct the alignment:

```json
{
  "fileName": "recording.wav",
  "duration": 12.5,
  "sampleRate": 44100,
  "transcription": "the cat sat",
  "sentenceBreaks": [0],
  "words": [
    {
      "text": "the",
      "ipa": "ðə",
      "startTime": 0.12,
      "endTime": 0.45,
      "ipaAlignment": [
        { "graphemes": "th", "ipa": "ð" },
        { "graphemes": "e", "ipa": "ə" }
      ]
    }
  ],
  "sentences": [
    {
      "id": 0,
      "wordStart": 0,
      "wordEnd": 2,
      "text": "the cat sat",
      "startTime": 0.12,
      "endTime": 2.30
    }
  ]
}
```

Audio segments are exported as standard 16-bit PCM WAV files, named by index and text content (`word_0_the.wav`, `sent_0_the_cat_sat.wav`).

## Technical details

- **Zero dependencies** — vanilla HTML, CSS, and JavaScript
- **Client-side only** — audio never leaves the browser, uses Web Audio API for decoding and waveform rendering
- **~1300 lines total** across two files (`index.html` + `app.js`)
- **WAV encoding** done in-browser for segment export
- **localStorage** for session persistence, keyed by filename
- **Canvas-based** waveform with 4000-bin peak computation for smooth rendering at any zoom level

## Project structure

```
├── index.html    # Markup + styles
├── app.js        # All application logic
└── README.md
```

## License

MIT

---

Made by [Casimiro Ferreira — TigreGótico Lda.](https://tigregotico.pt/) · [Donate via PayPal](https://www.paypal.me/AnaIsabelFerreira)
