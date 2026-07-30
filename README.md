# ⍼ ALIGN: Audio · Text · IPA Labeler

A browser-based tool for aligning audio with text transcriptions and IPA (International Phonetic Alphabet). ALIGN marks word, grapheme, and sentence boundaries in an audio file. It runs entirely in the browser. It needs no server, no dependencies, and no build step.

**[Live Demo →](https://tigregotico.github.io/ALIGN)** · **[Donate](https://www.paypal.me/AnaIsabelFerreira)**

![image](https://github.com/user-attachments/assets/58380d79-56a2-408b-bc2d-898d6686bcdc)

---

## What it does

Give ALIGN an audio file and its transcription. Mark where each word and sentence occurs in the audio. Map IPA symbols to individual graphemes (characters) within each word.

Use ALIGN for these tasks:

- **Speech synthesis (TTS) dataset preparation:** segment and label audio corpora with word and sentence boundaries and phonetic transcriptions.
- **Pronunciation research:** map graphemes to phonemes for any language.
- **Forced alignment annotation:** correct or create alignment data by hand.
- **Language learning content:** create word-level audio clips with precise timing.

## Features

### Audio navigation
- A zoomable waveform: scroll to zoom at the cursor, shift+scroll to pan.
- A minimap overview bar: click or drag it to jump anywhere.
- An adaptive grid that scales from 10-second intervals down to 10-millisecond ticks.
- Auto-scroll during playback.
- Keyboard shortcuts for each action.

### Word alignment
- Type or paste a transcription. ALIGN tokenizes it into words automatically.
- Select a word, drag on the waveform, then press Enter to assign time boundaries.
- ALIGN advances to the next word automatically for fast labeling.
- Play back individual word segments.

![image](https://github.com/user-attachments/assets/99920f6a-c651-4575-a7ea-15cef1422129)

### Sentence segmentation
- Define sentence boundaries by clicking between words in the sentence editor.
- Align each sentence to the audio independently of word alignment.
- ALIGN renders sentences as a separate band on the waveform.

![image](https://github.com/user-attachments/assets/15555fce-25de-4d07-b995-dfc5ba5afece)

### IPA and grapheme mapping
- Enter IPA per word directly in the word list.
- Use the detailed grapheme-to-IPA editor to split and merge character groups and assign IPA to each group.
- Example: the word "ship" splits into `sh → ʃ`, `i → ɪ`, `p → p`.

![image](https://github.com/user-attachments/assets/38d5fe36-3e15-4fa7-9f6b-30984ea2ea37)

### Persistence
- **Auto-save** to localStorage. Resume work when you reload the page and open the same audio file.
- **Export to JSON:** the full alignment data, including words, sentences, IPA mappings, and time boundaries.
- **Import from JSON:** restore a previous session from an exported file.
- **Export audio segments:** download individual WAV files for each aligned word or sentence.

## Getting started

### Option 1: Open it directly
Download `index.html` and `app.js` into the same folder. Open `index.html` in any modern browser.

### Option 2: GitHub Pages
Push both files to a GitHub repository and turn on Pages. GitHub serves the tool at `https://yourusername.github.io/your-repo/`.

### Option 3: Any static host
ALIGN works on Netlify, Vercel, Cloudflare Pages, S3, or any static file server. It needs no build step.

## Usage

### Basic workflow

1. **Upload audio.** Drag and drop a file, or click the upload zone. ALIGN accepts any browser-playable format, such as WAV, MP3, OGG, or FLAC.
2. **Enter the transcription.** Type or paste the full text in the transcription box.
3. **Align words.** Click a word in the list, drag on the waveform to select its region, then press `Enter`.
4. **Define sentences.** Go to the Sentences tab. Click the cut icon between words to set sentence boundaries.
5. **Align sentences.** Switch to the Sentences list tab, select a sentence, drag on the waveform, then press `Enter`.
6. **Add IPA.** Type IPA in the inline input next to each word, or use the IPA-Grapheme tab for detailed mapping.
7. **Export.** Download the JSON metadata, the word WAV segments, or the sentence WAV segments.

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

The JSON export holds everything needed to reconstruct the alignment:

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

ALIGN exports audio segments as standard 16-bit PCM WAV files, named by index and text content (`word_0_the.wav`, `sent_0_the_cat_sat.wav`).

## Technical details

- **No dependencies:** the code is plain HTML, CSS, and JavaScript, with no framework.
- **Client-side only:** audio never leaves the browser. ALIGN uses the Web Audio API for decoding and waveform rendering.
- **About 1300 lines total** across two files (`index.html` and `app.js`).
- **WAV encoding** happens in the browser for segment export.
- **localStorage** holds session data, keyed by filename.
- **Canvas-based** waveform with 4000-bin peak computation for smooth rendering at any zoom level.

## Project structure

```
├── index.html    # Markup + styles
├── app.js        # All application logic
└── README.md
```

## Related projects

ALIGN produces word, sentence, and IPA-aligned audio segments and JSON, the kind of data these TigreGotico projects consume or produce:

- [phoonnx](https://github.com/TigreGotico/phoonnx): an offline text-to-speech engine, a consumer of aligned, IPA-labeled audio datasets.
- [orthography2ipa](https://github.com/TigreGotico/orthography2ipa): a grapheme-to-phoneme conversion engine, for the same IPA transcription task ALIGN's mapping editor performs by hand.

## License

MIT

---

Made by [Casimiro Ferreira, TigreGótico Lda.](https://tigregotico.pt/) · [Donate via PayPal](https://www.paypal.me/AnaIsabelFerreira)
</content>
