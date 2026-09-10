# Cabasa

**Multi-Source Generative Soundtrack Engine**

Cabasa is a browser-based generative music synthesizer that transforms live data from 7 universes into real-time ambient soundscapes. No backend, no server, no credentials — everything runs client-side via the Web Audio API.

## Features

- **7 Live Data Providers**: device hardware telemetry, live Wikipedia articles, Lorenz chaos simulation, ISS orbital position, USGS earthquake data, Conway's Game of Life, and atmospheric/wind data
- **12 Exotic Modal Scales**: Ethereal Lydian, Cyberpunk Dorian, Deep Core Sus2, Hirajoshi, Insen, Harmonic Minor, Phrygian Dominant, Double Harmonic, Whole Tone, Pelog, Raga Bhairav, Neo-Noir Blues
- **6 Instrument Kits**: Vetro & Campane, Analogico Caldo, Gamelan Metallico, Archi & Fiati, Pulse Digitale, Sub & Pelle
- **Web Audio API**: polyphonic oscillators, LFO-driven vibrato, low-pass filter, convolution reverb, ping-pong delay, stereo panning, limiter
- **Canvas Hi-DPI visualizer** with real-time HUD overlay
- **Auto mode**: randomly changes kit and scale every 20 seconds
- **Recording**: the REC button captures the master output (post-reverb, post-limiter) to an audio file, downloaded on stop

## How It Works

1. Select a data source from the universe tabs at the top
2. Choose a modal scale and instrument kit from the control strip
3. Press **START CABASA** to begin synthesis
4. Adjust volume, dynamics, and toggle auto mode as desired
5. Press **REC** to capture what you hear; pressing it again stops and downloads the file

Each data source feeds several synthesis parameters at once:
- **Brightness** (filter cutoff)
- **Harmonic tension** (continuous, interpolated between chord shapes)
- **Drone register** (continuous transposition of the whole drone)
- **Amplitude pulsation** (tremolo LFO), reverb tail, delay feedback, detune spread

### Continuous mapping

Harmony is not selected from a handful of fixed chords. Providers pass a single
scalar in `0..1` to `setHarmony()`, which interpolates *in frequency* between two
adjacent voicings on a nine-step tension ladder, so a datum that drifts by a
hundredth still moves the drone. `setDroneShift()` does the same for register.

### Real temporality

Two providers replay measured records in compressed time rather than looping on a
timer, so the *shape* of the data over time is audible, not just its values:

- **Earthquakes** — every event sounds at its true position in the USGS hour
  (`properties.time`). Swarms stay swarms, quiet stretches stay quiet; the whole
  hour is compressed into ~25-90 s of listening, and real intervals are preserved
  proportionally. Quakes that appear between polls ring immediately as live events.
- **Atmosphere** — traverses the measured hourly series of the last 48 h
  (wind, gusts, pressure, temperature), interpolated between readings. Forecast
  hours are excluded: only what was actually recorded is sounded.

The **ISS** position is dead-reckoned along its real ground track between polls, so
it moves every tick rather than every 5 s, and the day/night boundary is a computed
solar-elevation sweep across the terminator instead of a binary flag. Note rhythm
comes from the orbit itself: one note per fixed step of latitude travelled, so notes
crowd at the equator and thin out at the turning points of the orbit.

No provider substitutes invented values when its source is unavailable — cards go
blank and say so.

### Melodic memory

Every note used to be a one-off event triggered by a datum, so nothing ever came
back and there was nothing for the ear to recognise. Three looping phrases now run
underneath, of coprime length and different speed:

| Voice | Steps | One note every | Register |
| :---- | :---- | :------------- | :------- |
| A | 5 | 2 grid steps | mid, plucked |
| B | 7 | 3 grid steps | high, bell |
| C | 11 | 8 grid steps | low, bell |

Each repeats and is recognisable on its own; their combination does not return for
hours. **The data no longer triggers these notes — it mutates them.** A quake, a
Wikipedia edit, a Lorenz wing crossing rewrites one step of one phrase, seeded by the
value itself, so the melody you have learned audibly changes when something happens.

The grid step is set by the data too (`setPulse`), never by a fixed BPM: orbital
latitude rate, seismic energy, wind speed, edits per second, machine load. Notes are
scheduled against the Web Audio clock with a 140 ms lookahead, so the grid is exact
to the sample while its tempo breathes with the source.

Two rules keep the phrases learnable while the drone keeps gliding:

- The harmony is **latched at the start of each phrase**, so a chord change lands on
  the seam between cycles as a modulation rather than mid-phrase as a wrong note.
- The integer chord the melody is built from moves with **hysteresis**, so tension
  hovering near a boundary cannot make it chatter. The drone itself stays
  continuously interpolated and is unaffected.

Toggle the layer with the MOTIF button to hear the piece with and without it.

### Recording

`REC` splits the master bus into a `MediaStreamAudioDestinationNode` and hands it to
`MediaRecorder`. There is no offline re-render and no resampling: the file contains
exactly the take you heard, reverb tail and limiter included, so a recording of a live
data run is unrepeatable by design — the ISS was where it was, the quakes fell when
they fell. The button shows elapsed time while running; on stop the browser downloads
`cabasa-<timestamp>.webm` (`.mp4` on Safari, whichever codec `MediaRecorder` picks).

## Layout

One stylesheet, two breakpoints. Below 760px the stage tracks the viewport
instead of sitting at a fixed 380px, the control strip becomes a single column
of aligned rows with full-width selects, the telemetry cards go two-up, and the
canvas HUD drops the three lines a phone already shows elsewhere — source is the
active tab, scale and kit are the two selects — so it stops covering the
visualisation. Tap targets are 44px and hover effects are gated behind
`@media (hover: hover)`, so a tapped card does not stay lit. Below 380px the
type and padding tighten again. Nothing above 760px changed.

## Requirements

- Modern web browser with Web Audio API support
- Internet connection for live data sources (Wikipedia, ISS, USGS, atmosphere)
- No installation, no account, no server

## Architecture

```
index.html — single-file application
  ├── HTML structure + CSS (dark neon aesthetic)
  └── JavaScript (ES6):
       ├── CabasaAudioEngine class — Web Audio graph
       ├── Data providers — fetch & normalize live data
       ├── Visualizer — Canvas 2D rendering
       └── UI controllers — sliders, selects, buttons
test.js — musical logic tests, no dependencies
```

## Tests

```
node test.js
```

The app stays one file, so the tests read `index.html` and evaluate the blocks
between `// >>> MUSIC` and `// <<< MUSIC` markers: the scales and the audio
engine, the Lorenz attractor with the solar-elevation helper, and the automaton.
The engine is built with `ctx = null` — every method that touches Web Audio
returns early on that — so the musical arithmetic runs under Node while the
sound-producing half stays inert. No test opens an `AudioContext`.

What they cover is the half that fails without throwing: harmony that must rise
with the datum and never leave the ladder, a drone shift that transposes instead
of detuning, motif mutations that stay playable, an attractor that stays on the
attractor, B3/S23 on a torus, and the sun at the right height. If you move a
marker, move it to a boundary that still encloses whole declarations.

## License

Built by scobru. Source on [GitHub](https://github.com/scobru/cabasa).