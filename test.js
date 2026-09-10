// node test.js — checks the parts that fail silently: harmony that drifts out of
// tune, a simulation that quietly stops simulating, a sun that sets in the wrong
// hemisphere. None of these throw. You only notice them by ear, weeks later.
const assert = require("assert");
const fs = require("fs");

// the app ships as one file, so pull the pure-logic blocks out of the page rather
// than making the page depend on files it may not find. Unlike eph there are three
// of them — the constants and the engine, the chaos provider, the automaton — so
// collect every marked region instead of just the first.
const src = fs.readFileSync(__dirname + "/index.html", "utf8");
const blocks = [];
for (let at = 0; ; ) {
  const a = src.indexOf("// >>> MUSIC", at);
  if (a < 0) break;
  const b = src.indexOf("// <<< MUSIC", a);
  if (b < 0) throw new Error("unclosed MUSIC marker in index.html");
  blocks.push(src.slice(a, b));
  at = b + 1;
}
if (blocks.length !== 3) throw new Error("expected 3 MUSIC blocks, found " + blocks.length);

const {
  SCALES, KITS, HARMONY_LADDER, CabasaAudioEngine,
  LorenzChaos, solarElevation, GameOfLifeEngine
} = new Function(blocks.join("\n") + `
  return { SCALES, KITS, HARMONY_LADDER, CabasaAudioEngine,
           LorenzChaos, solarElevation, GameOfLifeEngine };`)();

// The engine is built with ctx = null: every method that touches Web Audio starts
// with an `if (!this.ctx) return`, so the musical arithmetic runs untouched and
// the sound-producing half is a no-op. That is what makes it testable in node.
const engine = () => new CabasaAudioEngine();

// Where a tension lands on the nine-rung ladder, as a continuous number.
const rung = (e) => HARMONY_LADDER.indexOf(e.harmonyState.lo) + e.harmonyState.frac;

let n = 0;
const test = (name, fn) => { fn(); n++; console.log("  ok  " + name); };

// --- Scales -----------------------------------------------------------------

test("twelve scales, each a legal ascending ratio set", () => {
  const names = Object.keys(SCALES);
  assert.strictEqual(names.length, 12, "the README advertises 12 scales");
  for (const key of names) {
    const s = SCALES[key];
    assert.ok(s.name && s.name.length, key + " has no display name");
    assert.ok(s.base > 30 && s.base < 140, key + " base out of the drone register: " + s.base);
    assert.strictEqual(s.ratios[0], 1, key + " must start on the tonic");
    assert.ok(s.ratios.length >= 10, key + " is too short to reach the upper octave");
    s.ratios.forEach((r, i) => {
      assert.ok(r > 0 && Number.isFinite(r), key + " bad ratio: " + r);
      if (i) assert.ok(r > s.ratios[i - 1], key + " ratios must ascend, broke at " + i);
    });
    assert.ok(s.ratios[s.ratios.length - 1] >= 2, key + " never reaches the octave");
  }
});

test("no two scales are the same scale under a different name", () => {
  const seen = new Map();
  for (const [key, s] of Object.entries(SCALES)) {
    const sig = s.ratios.join(",");
    assert.ok(!seen.has(sig), key + " duplicates " + seen.get(sig));
    seen.set(sig, key);
  }
});

// --- Kits -------------------------------------------------------------------

test("six kits, all oscillator types real and all amps below the limiter", () => {
  const OSC = new Set(["sine", "square", "sawtooth", "triangle"]);
  const keys = Object.keys(KITS);
  assert.strictEqual(keys.length, 6, "the README advertises 6 kits");
  for (const key of keys) {
    const k = KITS[key];
    assert.ok(k.name && k.name.length, key + " has no display name");
    assert.strictEqual(k.drone.length, 3, key + " needs one waveform per drone voice");
    // An unknown type makes createOscillator throw at note time, not at load time:
    // the kit would simply go silent on the first bell.
    k.drone.forEach(t => assert.ok(OSC.has(t), key + " unknown drone waveform: " + t));
    for (const slot of ["bell", "pluck", "glitch"]) {
      const v = k[slot];
      assert.ok(OSC.has(v.type), `${key}.${slot} unknown waveform: ${v.type}`);
      // A decimal slip (0.85 for 0.085) does not throw, it just pins the limiter
      // and flattens the whole mix for as long as the kit is selected.
      assert.ok(v.amp > 0 && v.amp <= 0.12, `${key}.${slot} amp out of range: ${v.amp}`);
      assert.ok(v.attack > 0 && v.attack < 0.5, `${key}.${slot} attack out of range: ${v.attack}`);
      assert.ok(v.partial === 0 || v.partial > 1, `${key}.${slot} partial below the fundamental`);
    }
    assert.ok(k.q > 0 && k.q <= 20, key + " filter Q out of range: " + k.q);
    assert.ok(k.dur > 0 && k.dur < 4, key + " duration multiplier out of range: " + k.dur);
  }
});

// --- Harmony ladder ---------------------------------------------------------

test("the ladder is nine distinct four-note rungs inside one octave", () => {
  assert.strictEqual(HARMONY_LADDER.length, 9);
  const seen = new Set();
  HARMONY_LADDER.forEach((r, i) => {
    assert.strictEqual(r.length, 4, "rung " + i + " is not a four-note voicing");
    assert.strictEqual(r[0], 0, "rung " + i + " must be rooted on the tonic");
    r.forEach((d, j) => {
      assert.ok(Number.isInteger(d) && d >= 0 && d < 12, "rung " + i + " degree out of octave: " + d);
      if (j) assert.ok(d > r[j - 1], "rung " + i + " degrees must ascend");
    });
    const sig = r.join();
    assert.ok(!seen.has(sig), "rung " + i + " duplicates an earlier rung");
    seen.add(sig);
  });
});

// --- degreeFreq -------------------------------------------------------------

test("degree 0 is the tonic and a full scale up is exactly an octave", () => {
  const e = engine();
  for (const key of Object.keys(SCALES)) {
    e.activeScale = SCALES[key];
    const L = SCALES[key].ratios.length;
    assert.strictEqual(e.degreeFreq(0, 1), SCALES[key].base, key + " degree 0 is not the tonic");
    for (let d = 0; d < L; d++) {
      const r = e.degreeFreq(d + L, 1) / e.degreeFreq(d, 1);
      assert.ok(Math.abs(r - 2) < 1e-9, `${key} degree ${d} wraps by ${r}, not an octave`);
    }
  }
});

test("degreeFreq never leaves the scale, whatever degree it is handed", () => {
  // Everything the drone and the motif play goes through here. If a degree could
  // fall between two ratios the note would still sound — just out of key.
  const e = engine();
  for (const key of Object.keys(SCALES)) {
    e.activeScale = SCALES[key];
    const s = SCALES[key];
    const allowed = new Set(s.ratios.map(r => Math.round(r * 1e6)));
    for (let d = -20; d < 60; d++)
      for (const oct of [1, 2, 4]) {
        const f = e.degreeFreq(d, oct);
        assert.ok(Number.isFinite(f) && f > 0, `${key} degree ${d} gave ${f}`);
        // the ratio table already spans two octaves, so a degree past its end comes
        // back as ratios[i] * 2^k: halve until one of the tabulated ratios appears
        let ratio = f / (s.base * oct), found = false;
        for (let k = 0; k < 8 && ratio >= 1 - 1e-9; k++, ratio /= 2)
          if (allowed.has(Math.round(ratio * 1e6))) { found = true; break; }
        assert.ok(found, `${key} degree ${d} oct ${oct} landed off the scale`);
      }
  }
});

test("the scale in use decides the pitch", () => {
  const a = engine(), b = engine();
  a.activeScale = SCALES.lydian;
  b.activeScale = SCALES.deepdrone;
  assert.notStrictEqual(a.degreeFreq(2, 1), b.degreeFreq(2, 1), "switching scale changed nothing");
});

// --- setHarmony -------------------------------------------------------------

test("harmony is monotone in tension: more tension never means less", () => {
  // This is the whole point of the continuous mapping. If it inverted anywhere, a
  // rising datum would relax the chord and the sonification would lie.
  let prev = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const e = engine();          // fresh engine: the smoother must not carry over
    e.setHarmony(t);
    const p = rung(e);
    assert.ok(p >= prev - 1e-12, `tension ${t.toFixed(2)} fell back to ${p} from ${prev}`);
    prev = p;
  }
});

test("harmony spans most of the ladder over the input range", () => {
  // tanh shaping compresses the ends; if it compressed too hard, every provider
  // would sit on the same two rungs and the mode would be pointless.
  const lo = engine(); lo.setHarmony(0);
  const hi = engine(); hi.setHarmony(1);
  assert.ok(rung(hi) - rung(lo) > 6, "the ladder is barely used: " + rung(lo) + ".." + rung(hi));
});

test("setHarmony always leaves a valid interpolation state", () => {
  for (const t of [-5, -0.01, 0, 0.3, 0.5, 0.999, 1, 42, NaN, Infinity, undefined, null]) {
    const e = engine();
    e.setHarmony(t);
    const st = e.harmonyState;
    assert.ok(st, "no state for input " + t);
    const i = HARMONY_LADDER.indexOf(st.lo);
    assert.ok(i >= 0 && i <= HARMONY_LADDER.length - 2, "lo rung off the ladder for " + t);
    assert.strictEqual(st.hi, HARMONY_LADDER[i + 1], "hi is not the next rung for " + t);
    assert.ok(st.frac >= 0 && st.frac < 1, "frac out of range for " + t + ": " + st.frac);
    assert.ok(e.harmonyTension >= 0 && e.harmonyTension <= 1, "tension escaped 0..1 for " + t);
  }
});

test("tension is smoothed, not snapped, and still converges", () => {
  const e = engine();
  e.setHarmony(0);
  e.setHarmony(1);
  assert.ok(e.harmonyTension < 0.5, "one tick jumped to " + e.harmonyTension + "; smoothing is gone");
  for (let i = 0; i < 500; i++) e.setHarmony(1);
  assert.ok(e.harmonyTension > 0.99, "never arrived: " + e.harmonyTension);
});

test("the melodic chord holds still while the datum jitters on a rung boundary", () => {
  // The hysteresis exists because a value trembling around a boundary used to slam
  // the chord back and forth every tick, so no phrase ever repeated. Jittering
  // anywhere else proves nothing: the wobble has to straddle a rounding edge.
  const e = engine();
  e.setHarmony(0.549);                     // lands at ~4.5 on the ladder
  let changes = 0, last = e.chord.join(), lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 200; i++) {
    e.setHarmony(0.549 + (i % 2 ? 0.03 : -0.03));
    const p = rung(e);
    lo = Math.min(lo, p); hi = Math.max(hi, p);
    if (e.chord.join() !== last) { changes++; last = e.chord.join(); }
  }
  const edge = Math.floor((lo + hi) / 2) + 0.5;   // where Math.round flips rungs
  assert.ok(lo < edge && hi > edge,
    `the jitter no longer straddles a rung edge (${lo.toFixed(3)}..${hi.toFixed(3)}); ` +
    "retune the tension used here or this test proves nothing");
  assert.strictEqual(changes, 0, "chord flipped " + changes + " times on a 0.06 wobble");
});

test("a real move in the datum does move the chord", () => {
  // the mirror of the test above: hysteresis must damp jitter, not deafen the engine
  const e = engine();
  e.setHarmony(0);
  const before = e.chord.join();
  for (let i = 0; i < 300; i++) e.setHarmony(1);
  assert.notStrictEqual(e.chord.join(), before, "the chord never followed the data");
});

test("setChord drops back to integer degrees and clears the continuous state", () => {
  const e = engine();
  e.setHarmony(0.7);
  e.setChord([0, 3, 7, 10]);
  assert.strictEqual(e.harmonyState, null, "continuous harmony survived setChord");
  assert.strictEqual(e.harmonyTension, null);
  assert.strictEqual(e.chordRung, null);
  assert.deepStrictEqual(e.chord, [0, 3, 7, 10]);
  e.setChord([]);
  assert.deepStrictEqual(e.chord, [0, 3, 7, 10], "an empty chord must be ignored, not applied");
});

// --- voiceFreq and drone shift ----------------------------------------------

test("an interpolated voice stays between the two rungs it interpolates", () => {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const e = engine();
    e.setHarmony(t);
    const st = e.harmonyState;
    for (let i = 0; i < 8; i++) {
      const oct = Math.pow(2, Math.floor(i / st.lo.length));
      const lo = e.degreeFreq(st.lo[i % st.lo.length], oct);
      const hi = e.degreeFreq(st.hi[i % st.hi.length], oct);
      const f = e.voiceFreq(i);
      assert.ok(f >= Math.min(lo, hi) - 1e-9 && f <= Math.max(lo, hi) + 1e-9,
        `voice ${i} at tension ${t.toFixed(2)}: ${f} outside [${lo}, ${hi}]`);
    }
  }
});

test("the drone shift transposes, it does not detune", () => {
  // Every voice must move by the same factor, or the chord changes shape as the
  // register slides — which sounds like the synth going out of tune, not modulating.
  const e = engine();
  e.setHarmony(0.6);
  const before = [0, 1, 2, 3, 4, 5].map(i => e.voiceFreq(i));
  for (let i = 0; i < 500; i++) e.setDroneShift(1.5);
  const after = [0, 1, 2, 3, 4, 5].map(i => e.voiceFreq(i));
  after.forEach((f, i) => {
    assert.ok(Math.abs(f / before[i] - 1.5) < 1e-9, "voice " + i + " moved by " + f / before[i]);
  });
});

test("the drone shift is clamped to one octave either way", () => {
  const run = (target) => {
    const e = engine();
    for (let i = 0; i < 500; i++) e.setDroneShift(target);
    return e.droneShift;
  };
  assert.strictEqual(run(99), 2, "shifted more than an octave up");
  assert.strictEqual(run(0.001), 0.5, "shifted more than an octave down");
  assert.strictEqual(run(1.25), 1.25);
  const e = engine();
  e.setDroneShift(NaN);
  assert.strictEqual(e.droneShift, 1, "NaN moved the tonal centre");
});

// --- Motif ------------------------------------------------------------------

test("the motif pool never offers the same pitch twice", () => {
  // The pool is built from chord degrees plus their octaves, but degreeFreq folds
  // degrees back into the ratio table: on a wide voicing several degrees collapse
  // onto one frequency and the phrase used to shrink to three repeated notes.
  const e = engine();
  for (const r of HARMONY_LADDER)
    for (const key of Object.keys(SCALES)) {
      e.activeScale = SCALES[key];
      e.setChord(r);
      const pool = e.motifPool();
      assert.ok(pool.length > 0 && pool.length <= 6, `${key} pool size ${pool.length}`);
      const pitches = pool.map(d => Math.round(e.degreeFreq(d, 1) * 100));
      assert.strictEqual(new Set(pitches).size, pitches.length,
        `${key} on ${r.join()} repeats a pitch: ${pitches.join()}`);
    }
});

test("the three motifs have coprime lengths, so the phrase does not loop soon", () => {
  const e = engine();
  e.initMotifs();
  assert.strictEqual(e.motifs.length, 3);
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  const lens = e.motifs.map(m => m.steps.length);
  for (let i = 0; i < lens.length; i++) {
    assert.strictEqual(lens[i], e.motifs[i].len, "motif " + i + " len disagrees with its steps");
    for (let j = i + 1; j < lens.length; j++)
      assert.strictEqual(gcd(lens[i], lens[j]), 1, `motifs ${i} and ${j} share a period`);
  }
  // a motif of only rests is a motif you cannot hear
  e.motifs.forEach((m, i) => {
    assert.ok(m.steps.some(s => s !== null), "motif " + i + " is silent");
    assert.ok(m.pan >= -1 && m.pan <= 1, "motif " + i + " pans off the stereo field");
    assert.ok(m.div >= 1 && Number.isInteger(m.div), "motif " + i + " bad division");
  });
});

test("a mutation is determined by the datum, not by chance", () => {
  const run = (seed) => {
    const e = engine();
    e.initMotifs();
    e.mutateMotif(seed);
    return JSON.stringify(e.motifs.map(m => m.steps));
  };
  assert.strictEqual(run(12.345), run(12.345), "same datum, different mutation");
  assert.notStrictEqual(run(12.345), run(67.891), "different data, same mutation");
});

test("a mutation only ever writes a playable step", () => {
  const e = engine();
  e.initMotifs();
  const lens = e.motifs.map(m => m.steps.length);
  for (let i = 0; i < 4000; i++) {
    e.mutateMotif(i * 0.37 - 300);
    e.motifs.forEach((m, k) => {
      assert.strictEqual(m.steps.length, lens[k], "mutation resized motif " + k);
      m.steps.forEach(s => {
        assert.ok(s === null || (Number.isInteger(s) && s >= 0),
          "motif " + k + " got an unplayable step: " + s);
      });
    });
  }
  assert.strictEqual(e.motifMutations, 4000);
  const e2 = engine();
  e2.initMotifs();
  e2.mutateMotif(NaN);
  assert.strictEqual(e2.motifMutations, 0, "NaN counted as a mutation");
});

test("the pulse stays inside a musical tempo range", () => {
  const e = engine();
  e.setPulse(1);      assert.strictEqual(e.pulseMs, 110, "faster than the scheduler can place notes");
  e.setPulse(99999);  assert.strictEqual(e.pulseMs, 1400, "slower than a phrase anyone can follow");
  e.setPulse(420);    assert.strictEqual(e.pulseMs, 420);
  e.setPulse(NaN);    assert.strictEqual(e.pulseMs, 420, "NaN stopped the pulse");
});

// --- Lorenz -----------------------------------------------------------------

test("the attractor stays on the attractor", () => {
  // With too large a dt the integration blows up to Infinity within a few hundred
  // steps. Everything downstream clamps, so the soundscape just freezes — silently.
  const l = new LorenzChaos(null);
  let max = 0;
  for (let i = 0; i < 20000; i++) {
    l.update();
    max = Math.max(max, Math.abs(l.x), Math.abs(l.y), Math.abs(l.z));
    assert.ok(Number.isFinite(l.x) && Number.isFinite(l.y) && Number.isFinite(l.z),
      "diverged at step " + i);
  }
  assert.ok(max < 120, "left the attractor's envelope: " + max);
  assert.ok(max > 20, "collapsed to a fixed point: " + max);
});

test("the trajectory visits both wings, which is what triggers the notes", () => {
  const l = new LorenzChaos(null);
  const signs = new Set();
  for (let i = 0; i < 20000; i++) { l.update(); signs.add(Math.sign(l.x)); }
  assert.ok(signs.has(1) && signs.has(-1), "one wing only: no lobe transitions, no rhythm");
});

test("the simulation is deterministic and keeps a bounded history", () => {
  const a = new LorenzChaos(null), b = new LorenzChaos(null);
  for (let i = 0; i < 3000; i++) { a.update(); b.update(); }
  assert.strictEqual(a.x, b.x);
  assert.strictEqual(a.z, b.z);
  assert.ok(a.history.length <= 220, "history grows without bound: " + a.history.length);
});

// --- Game of Life -----------------------------------------------------------

const blankLife = () => {
  const l = new GameOfLifeEngine(null);
  l.grid = l.createGrid();      // the constructor seeds at random
  return l;
};
const snapshot = (l) => l.grid.map(r => r.join("")).join("|");
const liveCells = (l) => l.grid.flat().reduce((a, b) => a + b, 0);

test("B3/S23: a block is a still life", () => {
  const l = blankLife();
  // four blocks, because under twelve cells the engine rescues the colony instead
  [[2, 2], [2, 10], [10, 2], [10, 10]].forEach(([r, c]) => {
    l.grid[r][c] = l.grid[r][c + 1] = l.grid[r + 1][c] = l.grid[r + 1][c + 1] = 1;
  });
  const before = snapshot(l);
  l.step();
  assert.strictEqual(snapshot(l), before, "a block decayed or grew");
  assert.strictEqual(l.liveCount, 16);
  assert.strictEqual(l.births, 0);
});

test("B3/S23: a blinker has period two", () => {
  const l = blankLife();
  [1, 6, 11, 16, 21].forEach(c => { l.grid[4][c] = l.grid[4][c + 1] = l.grid[4][c + 2] = 1; });
  const gen0 = snapshot(l);
  l.step();
  const gen1 = snapshot(l);
  l.step();
  assert.notStrictEqual(gen1, gen0, "the blinkers never rotated");
  assert.strictEqual(snapshot(l), gen0, "the blinkers did not come back");
  assert.strictEqual(l.liveCount, 15);
});

test("B3/S23: a glider travels one cell diagonally every four generations", () => {
  // The strictest check of the neighbour count: an off-by-one anywhere in the
  // eight-neighbour loop turns the glider into a blob without ever throwing.
  const l = blankLife();
  l.grid[0][1] = l.grid[1][2] = l.grid[2][0] = l.grid[2][1] = l.grid[2][2] = 1;
  [[8, 4], [8, 10], [8, 16]].forEach(([r, c]) => {   // ballast, well clear of the path
    l.grid[r][c] = l.grid[r][c + 1] = l.grid[r + 1][c] = l.grid[r + 1][c + 1] = 1;
  });
  const glider = () => l.grid.flatMap((row, r) =>
    row.map((v, c) => (v && r < 6 ? r + "," + c : null))).filter(Boolean).sort().join(" ");
  const before = glider();
  for (let i = 0; i < 4; i++) l.step();
  const moved = before.split(" ").map(p => {
    const [r, c] = p.split(",").map(Number);
    return (r + 1) + "," + (c + 1);
  }).sort().join(" ");
  assert.strictEqual(glider(), moved, "the glider did not glide");
  assert.strictEqual(l.generation, 4);
});

test("the grid wraps: the edges are neighbours", () => {
  const l = blankLife();
  // blinkers straddling the seam between the last and the first column: they can
  // only rotate if the neighbour count runs off one edge and back in the other
  [1, 6, 11].forEach(r => { l.grid[r][23] = l.grid[r][0] = l.grid[r][1] = 1; });
  [[3, 10], [8, 10], [13, 10]].forEach(([r, c]) => {   // ballast, to clear the floor
    l.grid[r][c] = l.grid[r][c + 1] = l.grid[r + 1][c] = l.grid[r + 1][c + 1] = 1;
  });
  const gen0 = snapshot(l);
  l.step();
  assert.deepStrictEqual([l.grid[0][0], l.grid[1][0], l.grid[2][0]], [1, 1, 1],
    "the seam blinker did not rotate: the torus is not closed");
  assert.deepStrictEqual([l.grid[1][23], l.grid[1][1]], [0, 0], "the old arms survived");
  l.step();
  assert.strictEqual(snapshot(l), gen0, "the wrapped blinker did not come back");
});

test("a dying colony is reseeded instead of going silent", () => {
  const l = blankLife();
  l.grid[5][5] = l.grid[5][6] = l.grid[5][7] = 1;   // three cells: below the floor
  l.step();
  assert.ok(liveCells(l) >= 12, "the colony was left to die: " + liveCells(l));
});

test("an overcrowded colony is reseeded too", () => {
  const l = blankLife();
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) l.grid[r][c] = 1;
  l.step();   // a full grid collapses to the corners, which is under the floor
  assert.ok(liveCells(l) >= 12, "nothing left after the collapse: " + liveCells(l));
});

// --- Solar elevation --------------------------------------------------------

test("the sun is where the sun should be", () => {
  const near = (got, want, tol, what) =>
    assert.ok(Math.abs(got - want) < tol, `${what}: ${got.toFixed(2)}, expected ~${want}`);
  // At the poles the elevation is the declination: +obliquity in June, -obliquity in December.
  near(solarElevation(90, 0, new Date("2026-06-21T12:00:00Z")), 23.44, 0.1, "north pole, solstice");
  near(solarElevation(90, 0, new Date("2026-12-21T12:00:00Z")), -23.44, 0.1, "north pole, midwinter");
  near(solarElevation(-90, 0, new Date("2026-06-21T12:00:00Z")), -23.44, 0.1, "south pole, June");
  // Equinox noon on the Greenwich equator: overhead, give or take the equation of time.
  near(solarElevation(0, 0, new Date("2026-03-20T12:00:00Z")), 90, 2, "equator, equinox noon");
  near(solarElevation(0, 0, new Date("2026-03-20T00:00:00Z")), -90, 2, "equator, equinox midnight");
});

test("elevation is a real angle everywhere, all year", () => {
  for (let day = 0; day < 365; day += 7)
    for (const lat of [-90, -45, -23.5, 0, 23.5, 45, 51.5, 90])
      for (const lon of [-180, -75, 0, 12.5, 179]) {
        const d = new Date(Date.UTC(2026, 0, 1 + day, day % 24));
        const el = solarElevation(lat, lon, d);
        assert.ok(Number.isFinite(el) && el >= -90.001 && el <= 90.001,
          `lat ${lat} lon ${lon} day ${day}: ${el}`);
      }
});

test("longitude moves the day, it does not break it", () => {
  // Half the planet away, the same instant must be the opposite time of day.
  const t = new Date("2026-06-21T12:00:00Z");
  const here = solarElevation(0, 0, t);
  const anti = solarElevation(0, 180, t);
  assert.ok(here > 40, "noon at Greenwich should be high: " + here);
  assert.ok(anti < -40, "midnight at the antimeridian should be low: " + anti);
});

console.log("\n" + n + " passed");
