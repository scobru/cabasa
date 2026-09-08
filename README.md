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

## How It Works

1. Select a data source from the universe tabs at the top
2. Choose a modal scale and instrument kit from the control strip
3. Press **START CABASA** to begin synthesis
4. Adjust volume, dynamics, and toggle auto mode as desired

Each data source feeds a different synthesis parameter:
- **Brightness** (filter cutoff)
- **Harmony** (drone chord shifts)
- **Amplitude pulsation** (tremolo LFO)

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
```

## License

Built by scobru. Source on [GitHub](https://github.com/scobru/cabasa).