#!/usr/bin/env python3
"""Nagauta score for the ship's theatre — an original synthesised recording.

There is no public-domain recording of a kabuki ensemble that is both long
enough to sit through and clean enough to loop: the 78 rpm nagauta discs on
archive.org carry no publication date, so none of them can be shown to be out
of copyright, and the Creative Commons material on Commons is twenty-five
second fragments of a festival float. The ballroom's quartet already ships
with an original percussion layer mixed under a public-domain performance, so
the same workshop builds this one outright.

What it is: the hayashi and nagauta ensemble that plays a matsubame-mono —
the kind of piece Kanjinchō is — laid out in the jo-ha-kyū shape the dance
follows, so the choreography in cruiseKabuki.js can be written against the
timeline at the bottom of this file rather than guessed at.

    shamisen   three futozao in unison, Karplus–Strong with the sawari buzz
    nohkan     the transverse flute: additive, breathy, deliberately not
               tempered — a real nohkan is not in tune with the shamisen and
               that is the sound
    ko-tsuzumi the shoulder drum, "pon" and "ta": a pitched head
    o-tsuzumi  the hip drum, "chon": a dry crack with no pitch to speak of
    o-daiko    the big drum offstage, for the curtain and the mie
    hyoshigi   the two hardwood clappers that open the house
    tsuke      the board beaten flat beside the stage under a mie
    kakegoe    the drummers' calls, formant-synthesised

Everything is modal synthesis or plucked string — no filters, so no scipy.

    python3 tools/make_kabuki_score.py
"""
import math
import subprocess
import sys
import wave
from pathlib import Path

import numpy as np

FS = 44100
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'audio'

rng = np.random.default_rng(20260917)

# ---------------------------------------------------------------------------
# The scale. Miyako-bushi ("in") on D, which is what a honchoshi shamisen in
# this repertory sits in: the semitone above the tonic and the semitone above
# the fifth are the whole character of it.
# ---------------------------------------------------------------------------
def hz(semitones_from_a4):
    return 440.0 * 2 ** (semitones_from_a4 / 12)


# D3 Eb3 G3 A3 Bb3 D4 Eb4 G4 A4 Bb4 D5 Eb5 G5
IN_SCALE = [hz(s) for s in
            (-19, -18, -14, -12, -11, -7, -6, -2, 0, 1, 5, 6, 10)]
TONIC = 5          # index of D4 in IN_SCALE


# ---------------------------------------------------------------------------
# Canvas
# ---------------------------------------------------------------------------
class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * FS)
        self.buf = np.zeros((self.n, 2))

    def add(self, t, sig, pan=0.0, gain=1.0):
        """`sig` is mono; `pan` is -1 (port) .. +1 (starboard)."""
        i = int(t * FS)
        if i < 0:
            sig = sig[-i:]
            i = 0
        if i >= self.n:
            return
        sig = sig[:self.n - i]
        l = math.cos((pan + 1) * math.pi / 4) * math.sqrt(2) / 2 + 0.5
        r = math.sin((pan + 1) * math.pi / 4) * math.sqrt(2) / 2 + 0.5
        self.buf[i:i + len(sig), 0] += sig * gain * l
        self.buf[i:i + len(sig), 1] += sig * gain * r


def env_exp(n, attack, decay):
    """Percussive envelope: a short raised-cosine attack, exponential tail."""
    t = np.arange(n) / FS
    a = np.clip(t / max(attack, 1e-5), 0, 1)
    a = 0.5 - 0.5 * np.cos(np.pi * a)
    return a * np.exp(-t / decay)


def smooth(x, width):
    """Moving average — the only low-pass in the workshop."""
    w = max(1, int(width))
    k = np.ones(w) / w
    return np.convolve(x, k, mode='same')


def modal(dur, partials, noise_amt=0.0, noise_decay=0.004, noise_colour=1):
    """Sum of decaying sinusoids, plus a noise transient. (f, amp, decay)."""
    n = int(dur * FS)
    t = np.arange(n) / FS
    out = np.zeros(n)
    for f, amp, dec in partials:
        out += amp * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / dec)
    if noise_amt:
        nz = rng.normal(0, 1, n)
        if noise_colour > 1:
            nz = smooth(nz, noise_colour)
            nz /= (np.abs(nz).max() + 1e-9)
        out += noise_amt * nz * np.exp(-t / noise_decay)
    return out


# ---------------------------------------------------------------------------
# Shamisen. Karplus–Strong, stepped one delay-line at a time so the whole
# string is a vectorised block: y[n] = d · ½(y[n-N] + y[n-N-1]) only ever
# reaches back a full period, so period k is a function of period k-1 alone.
# ---------------------------------------------------------------------------
def shamisen(freq, dur, gain=1.0, bright=0.55, sawari=0.35, bachi=1.0):
    N = max(8, int(round(FS / freq)))
    n = int(dur * FS)
    blocks = n // N + 2

    # The plectrum: a wide horn plectrum is a lot of pick noise and a stiff
    # initial displacement, not the white-noise burst a guitar model uses.
    exc = rng.normal(0, 1, N)
    exc = smooth(exc, max(1, int(N * (1 - bright))))
    exc[:max(2, N // 6)] += np.linspace(1.4, 0, max(2, N // 6)) * bachi
    exc /= (np.abs(exc).max() + 1e-9)

    # The loop runs once per period, so the per-period loss is set from the
    # decay time we actually want rather than tuned by hand: d^(f·T60) = 10⁻³.
    # A futozao is a damped instrument — the low strings ring about two
    # seconds, the high ones barely one — and left at a guitar's loss every
    # note smeared into the next one.
    t60 = min(2.1, 0.75 + N / 150 * 0.9)
    decay = math.exp(-6.9 * N / (FS * t60))

    out = np.zeros(blocks * N)
    buf = exc.copy()
    carry = 0.0
    for k in range(blocks):
        out[k * N:(k + 1) * N] = buf
        prev = np.empty(N)
        prev[0] = carry
        prev[1:] = buf[:-1]
        carry = buf[-1]
        buf = decay * 0.5 * (buf + prev)
    out = out[:n]

    # Sawari: the nut is cut so the lowest string rattles against the neck.
    # A touch of odd-harmonic fold plus a short comb is the whole effect.
    if sawari:
        d = max(4, N // 9)
        comb = np.zeros_like(out)
        comb[d:] = out[:-d]
        out = out + sawari * (np.tanh(2.6 * out) - out) + 0.18 * sawari * comb

    t = np.arange(n) / FS
    # The bachi strikes the skin as well as the string — that slap is what
    # makes a shamisen read as a shamisen and not as a banjo.
    slap = modal(min(dur, 0.05), [(1850, 0.5, 0.008), (3100, 0.3, 0.005)],
                 noise_amt=0.8, noise_decay=0.0035, noise_colour=3)
    out[:len(slap)] += slap * 0.42 * bachi
    # A note cut off at `dur` on a still-ringing string is a click, and there
    # are two hundred notes in the piece: the last 40 ms are the damping hand.
    rel = min(n, int(0.04 * FS))
    out[n - rel:] *= np.linspace(1, 0, rel) ** 1.5
    return out * np.exp(-t / 3.0) * gain


def shamisen_trio(mix, t, idx, dur, gain=1.0, **kw):
    """Three players in unison: never quite together, never quite in tune."""
    f = IN_SCALE[idx]
    for k, (pan, det, off) in enumerate(((-0.34, 0.996, 0.0),
                                         (0.0, 1.0, 0.009),
                                         (0.34, 1.005, 0.017))):
        mix.add(t + off + rng.uniform(0, 0.006),
                shamisen(f * det, dur, **kw), pan=pan, gain=gain * 0.42)


# ---------------------------------------------------------------------------
# Nohkan. The flute's hishigi — the scream that opens a scene — is the one
# sound in the ensemble everybody recognises.
# ---------------------------------------------------------------------------
def nohkan(f0, dur, gain=1.0, bend=0.0, breath=0.5, cut=0.18):
    n = int(dur * FS)
    t = np.arange(n) / FS
    # A nohkan's bore is interrupted by the nodo, so it does not overblow to
    # the octave: the partials sit sharp of harmonic, and that is deliberate.
    f = f0 * (1 + bend * np.clip(t / max(dur * 0.5, 1e-3), 0, 1))
    f *= 1 + 0.013 * np.sin(2 * np.pi * 5.1 * t) * np.clip((t - 0.15) * 3, 0, 1)
    ph = 2 * np.pi * np.cumsum(f) / FS
    sig = (np.sin(ph) + 0.55 * np.sin(2.02 * ph) + 0.3 * np.sin(3.05 * ph)
           + 0.12 * np.sin(4.1 * ph))
    air = smooth(rng.normal(0, 1, n), 9)
    air /= (np.abs(air).max() + 1e-9)
    sig = sig * (1 - breath * 0.3) + air * breath * (0.5 + 0.5 * np.sin(ph))
    a = np.clip(t / 0.05, 0, 1)
    r = np.clip((dur - t) / cut, 0, 1)
    return sig * a * r ** 1.6 * gain * 0.5


# ---------------------------------------------------------------------------
# The hayashi
# ---------------------------------------------------------------------------
def ko_tsuzumi(kind='pon'):
    """Shoulder drum. The player squeezes the cords, so it is pitched."""
    if kind == 'pon':                       # open, ringing, the highest sound
        return modal(0.45, [(605, 1.0, 0.16), (905, 0.42, 0.10),
                            (1320, 0.22, 0.05), (1980, 0.1, 0.03)],
                     noise_amt=0.45, noise_decay=0.003, noise_colour=2)
    if kind == 'chi':                       # stopped, short
        return modal(0.10, [(760, 0.8, 0.035), (1150, 0.4, 0.02)],
                     noise_amt=0.6, noise_decay=0.0025, noise_colour=2)
    return modal(0.22, [(520, 0.85, 0.07), (800, 0.3, 0.04)],   # 'ta'
                 noise_amt=0.5, noise_decay=0.003, noise_colour=2)


def o_tsuzumi():
    """Hip drum, played with a dried-out head and a hardened finger: a crack
    with almost no pitch, and it is the loudest thing in the ensemble."""
    return modal(0.13, [(1420, 0.55, 0.012), (2250, 0.45, 0.008),
                        (3400, 0.25, 0.005), (430, 0.3, 0.02)],
                 noise_amt=1.0, noise_decay=0.0045, noise_colour=2)


def taiko(gain=1.0, dur=0.9):
    n = int(dur * FS)
    t = np.arange(n) / FS
    f = 92 * np.exp(-t / 0.10) + 52
    body = np.sin(2 * np.pi * np.cumsum(f) / FS) * np.exp(-t / 0.28)
    skin = smooth(rng.normal(0, 1, n), 4) * np.exp(-t / 0.02)
    ring = (0.25 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.12)
            + 0.12 * np.sin(2 * np.pi * 310 * t) * np.exp(-t / 0.07))
    return (body + 0.5 * skin + ring) * gain


def o_daiko_roll(dur, start=0.12, end=1.0, rate0=7, rate1=15):
    """The great drum behind the curtain: a roll that winds up."""
    n = int(dur * FS)
    out = np.zeros(n + FS)
    t = 0.0
    while t < dur:
        u = t / dur
        g = start + (end - start) * u ** 1.6
        hit = taiko(gain=g * rng.uniform(0.8, 1.1), dur=0.5)
        i = int(t * FS)
        out[i:i + len(hit)] += hit
        t += 1.0 / (rate0 + (rate1 - rate0) * u) * rng.uniform(0.85, 1.15)
    return out[:n]


def hyoshigi():
    """Two blocks of hardwood struck together. Dry, loud, no body at all."""
    return modal(0.13, [(1680, 0.9, 0.010), (2460, 0.8, 0.008),
                        (3720, 0.55, 0.005), (5100, 0.3, 0.003),
                        (880, 0.35, 0.014)],
                 noise_amt=1.1, noise_decay=0.0022, noise_colour=1)


def tsuke(n_hits=7, span=0.9, kind='battari'):
    """The board beaten flat beside the stage as an actor freezes. `battari`
    is the two-hit stamp under a mie; `bata-bata` is the run before it."""
    out = np.zeros(int((span + 0.4) * FS))
    if kind == 'battari':
        for t, g in ((0.0, 1.0), (0.17, 1.05)):
            h = hyoshigi() * g * 1.15
            i = int(t * FS)
            out[i:i + len(h)] += h
        return out
    for k in range(n_hits):
        u = k / max(1, n_hits - 1)
        t = span * u ** 1.45
        h = hyoshigi() * (0.45 + 0.6 * u)
        i = int(t * FS)
        out[i:i + len(h)] += h
    return out


def kakegoe(vowel='o', dur=0.85, f0=150, rise=0.35, gain=1.0):
    """A drummer's call. Glottal pulses through three fixed resonances: not
    speech synthesis, but the shape of a shouted vowel across a theatre."""
    n = int(dur * FS)
    t = np.arange(n) / FS
    f = f0 * (1 + rise * np.clip((t / dur) ** 0.7, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / FS
    # A pressed, shouted larynx: a narrow pulse, so the spectrum is wide.
    src = np.clip(np.sin(ph), 0, None) ** 3
    src = src - src.mean()
    formants = {'o': ((480, 760, 2500), (1.0, 0.5, 0.12)),
                'a': ((760, 1220, 2600), (1.0, 0.7, 0.18)),
                'e': ((520, 1900, 2550), (1.0, 0.8, 0.22)),
                'i': ((300, 2100, 3000), (1.0, 0.6, 0.25))}[vowel]
    out = np.zeros(n)
    for f_c, amp in zip(*formants):
        # Resonate by convolving with a decaying sinusoid — a one-pole pair
        # written out as an impulse response, which numpy can do directly.
        ir_n = int(0.02 * FS)
        ir_t = np.arange(ir_n) / FS
        ir = np.sin(2 * np.pi * f_c * ir_t) * np.exp(-ir_t / 0.004)
        out += amp * np.convolve(src, ir, mode='same')
    out /= (np.abs(out).max() + 1e-9)
    a = np.clip(t / 0.05, 0, 1)
    r = np.clip((dur - t) / 0.12, 0, 1)
    breath = smooth(rng.normal(0, 1, n), 12)
    breath /= (np.abs(breath).max() + 1e-9)
    return (out + 0.12 * breath) * a * r * gain * 0.55


# ===========================================================================
# The piece. Marks are seconds from zero, and cruiseKabuki.js reads the same
# numbers off the table at the bottom — the dance is cued to the recording,
# not to a wall clock.
# ===========================================================================
DUR = 182.0
mix = Mix(DUR)

KI, MAKU, JO, HA, MIE1, HA2, KYU, MIE2, CODA = (
    0.0, 5.4, 11.0, 36.0, 84.0, 89.0, 132.0, 160.0, 167.0)

# ---- The house is called in: seven clappers, accelerating, then the two ----
t = 0.0
gap = 0.62
for k in range(9):
    mix.add(t, hyoshigi(), pan=rng.uniform(-0.15, 0.15), gain=0.62)
    t += gap
    gap *= 0.82
mix.add(3.95, hyoshigi(), gain=0.95)
mix.add(4.55, hyoshigi(), gain=1.0)

# ---- The curtain is walked open, and the flute screams over the drum ------
mix.add(MAKU, o_daiko_roll(5.2, 0.10, 0.85, 6, 16), pan=-0.5, gain=0.5)
mix.add(MAKU + 1.6, nohkan(hz(10), 2.6, gain=0.75, bend=0.09, breath=0.62), pan=0.42)
mix.add(MAKU + 4.3, taiko(1.0), pan=-0.5, gain=0.6)
mix.add(MAKU + 4.35, kakegoe('o', 1.0, 132, 0.42, 0.7), pan=0.2)

# ---- JO: the ozatsuma opening. Free time, huge spaces, one string at a ----
#      time. This is the part of a nagauta that sounds like nothing else.
oz = [(0.0, TONIC, 2.6, 1.0), (2.9, TONIC - 3, 1.8, 0.8),
      (4.4, TONIC, 1.2, 0.75), (5.5, TONIC + 1, 3.4, 0.95),
      (9.2, TONIC + 3, 2.0, 0.85), (11.0, TONIC + 2, 1.4, 0.7),
      (12.2, TONIC, 3.0, 0.9), (15.6, TONIC - 5, 3.6, 1.0),
      (19.4, TONIC, 1.6, 0.8), (21.0, TONIC + 1, 1.3, 0.7),
      (22.2, TONIC + 3, 2.6, 0.9)]
for dt, idx, dur, g in oz:
    shamisen_trio(mix, JO + dt, idx, dur, gain=g * 0.95, bright=0.5, sawari=0.4)
mix.add(JO + 3.1, ko_tsuzumi('pon'), pan=-0.28, gain=0.55)
mix.add(JO + 8.0, o_tsuzumi(), pan=0.3, gain=0.5)
mix.add(JO + 8.1, kakegoe('i', 0.7, 175, 0.3, 0.5), pan=0.3)
mix.add(JO + 14.0, ko_tsuzumi('pon'), pan=-0.28, gain=0.55)
mix.add(JO + 18.6, o_tsuzumi(), pan=0.3, gain=0.55)
mix.add(JO + 18.7, kakegoe('o', 0.9, 150, 0.4, 0.55), pan=-0.2)
mix.add(JO + 5.0, nohkan(hz(3) * 1.012, 4.0, gain=0.4, breath=0.7, cut=0.9), pan=0.4)
mix.add(JO + 16.2, nohkan(hz(6) * 1.008, 5.2, gain=0.42, bend=0.03,
                          breath=0.66, cut=1.4), pan=0.4)

# ---- HA: the body of the dance. In time now, 76 to the minute. -----------
BEAT = 60 / 76


def phrase(t0, notes, beat=BEAT, gain=1.0, bright=0.55):
    """`notes` is (beats-from-t0, scale index, beats long, accent)."""
    for db, idx, dl, acc in notes:
        shamisen_trio(mix, t0 + db * beat, idx, dl * beat * 1.35,
                      gain=gain * acc, bright=bright, sawari=0.34,
                      bachi=0.7 + 0.5 * acc)


# The melody: a descent to the semitone below the fifth and back, which is
# the whole grammar of the in scale, turned four ways.
A = [(0, TONIC + 3, 1, 1.0), (1, TONIC + 2, 0.5, 0.6), (1.5, TONIC + 3, 0.5, 0.7),
     (2, TONIC + 1, 1, 0.9), (3, TONIC, 1, 0.8),
     (4, TONIC + 1, 1.5, 0.95), (5.5, TONIC, 0.5, 0.6), (6, TONIC - 3, 2, 0.9)]
B = [(0, TONIC, 1, 1.0), (1, TONIC + 1, 0.5, 0.65), (1.5, TONIC + 3, 0.5, 0.75),
     (2, TONIC + 4, 1.5, 1.0), (3.5, TONIC + 3, 0.5, 0.6),
     (4, TONIC + 1, 1, 0.85), (5, TONIC + 3, 1, 0.8),
     (6, TONIC + 1, 1, 0.9), (7, TONIC, 1, 0.75)]
C = [(0, TONIC + 5, 1.5, 1.0), (1.5, TONIC + 4, 0.5, 0.65),
     (2, TONIC + 3, 1, 0.9), (3, TONIC + 1, 1, 0.8),
     (4, TONIC, 2, 0.95), (6, TONIC - 3, 1, 0.7), (7, TONIC, 1, 0.85)]

# Eight-beat bars of tsuzumi under it. 'pon' on 1 and 5 from the shoulder
# drum, the hip drum's crack on 3 and 7, calls where the phrase turns.
def hayashi_bar(t0, beat=BEAT, density=1.0, calls=False):
    mix.add(t0 + 0 * beat, ko_tsuzumi('pon'), pan=-0.3, gain=0.5)
    mix.add(t0 + 2 * beat, o_tsuzumi(), pan=0.32, gain=0.46)
    mix.add(t0 + 4 * beat, ko_tsuzumi('ta'), pan=-0.3, gain=0.42)
    mix.add(t0 + 6 * beat, o_tsuzumi(), pan=0.32, gain=0.5)
    if density > 0.6:
        mix.add(t0 + 3.5 * beat, ko_tsuzumi('chi'), pan=-0.26, gain=0.3)
        mix.add(t0 + 7.5 * beat, ko_tsuzumi('chi'), pan=-0.26, gain=0.34)
    if calls:
        mix.add(t0 + 5.9 * beat, kakegoe('o', 0.8, 148, 0.38, 0.5), pan=-0.22)


bar = HA
for k, mel in enumerate([A, B, A, C, B, C]):
    phrase(bar, mel, gain=0.92)
    hayashi_bar(bar, density=1.0 if k else 0.4, calls=(k in (1, 4)))
    if k in (2, 5):
        mix.add(bar + 4 * BEAT, nohkan(IN_SCALE[TONIC + 3] * 1.011, 3.2,
                                       gain=0.34, breath=0.6, cut=1.0), pan=0.44)
    bar += 8 * BEAT

# ---- MIE 1: everything stops, the board is beaten, the actor freezes -----
mix.add(MIE1 - 1.0, tsuke(6, 0.85, 'bata'), pan=0.55, gain=0.55)
mix.add(MIE1, tsuke(kind='battari'), pan=0.55, gain=0.8)
mix.add(MIE1, taiko(1.1), pan=-0.45, gain=0.62)
mix.add(MIE1 + 0.18, kakegoe('a', 1.1, 160, 0.5, 0.8), pan=0.1)
shamisen_trio(mix, MIE1 + 0.02, TONIC - 5, 3.4, gain=1.0, bright=0.7, sawari=0.5)
mix.add(MIE1 + 1.4, nohkan(hz(10) * 1.01, 2.4, gain=0.6, bend=0.07, breath=0.6), pan=0.4)

# ---- HA2: it starts again, a shade quicker -------------------------------
BEAT2 = 60 / 88
bar = HA2
for k, mel in enumerate([B, A, C, B, A, C, B]):
    phrase(bar, mel, beat=BEAT2, gain=0.95, bright=0.6)
    hayashi_bar(bar, beat=BEAT2, calls=(k in (2, 5)))
    bar += 8 * BEAT2
    if bar > KYU - 1:
        break

# ---- KYU: the accelerando. Shorter bars, harder plectrum, drum underneath -
t = KYU
beat = 60 / 96
while t < MIE2 - 2.5:
    u = (t - KYU) / (MIE2 - KYU)
    phrase(t, C if (int(u * 8) % 2) else B, beat=beat, gain=0.95 + 0.25 * u,
           bright=0.6 + 0.2 * u)
    hayashi_bar(t, beat=beat, calls=(int(u * 6) % 3 == 2))
    t += 8 * beat
    beat *= 0.94
mix.add(MIE2 - 6.0, o_daiko_roll(6.2, 0.14, 0.75, 8, 19), pan=-0.5, gain=0.5)
mix.add(MIE2 - 3.0, tsuke(9, 2.6, 'bata'), pan=0.55, gain=0.5)

# ---- MIE 2: the great one ------------------------------------------------
mix.add(MIE2, tsuke(kind='battari'), pan=0.55, gain=0.95)
mix.add(MIE2, taiko(1.3, 1.4), pan=-0.45, gain=0.72)
mix.add(MIE2 + 0.16, taiko(0.8), pan=0.4, gain=0.5)
mix.add(MIE2 + 0.25, kakegoe('a', 1.3, 168, 0.55, 0.95), pan=0.05)
shamisen_trio(mix, MIE2, TONIC - 5, 5.0, gain=1.15, bright=0.78, sawari=0.55)
shamisen_trio(mix, MIE2 + 0.28, TONIC, 4.6, gain=0.95, bright=0.72, sawari=0.5)
mix.add(MIE2 + 1.8, nohkan(hz(10) * 1.012, 3.6, gain=0.72, bend=0.1,
                           breath=0.58, cut=0.8), pan=0.4)
mix.add(MIE2 + 3.2, ko_tsuzumi('pon'), pan=-0.3, gain=0.55)
mix.add(MIE2 + 4.6, o_tsuzumi(), pan=0.32, gain=0.6)

# ---- CODA: it settles, and the house is left to breathe ------------------
coda = [(0.0, TONIC + 3, 2.2, 0.85), (2.4, TONIC + 1, 1.8, 0.7),
        (4.4, TONIC, 2.6, 0.8), (7.2, TONIC - 3, 2.0, 0.65),
        (9.4, TONIC - 5, 5.5, 0.9)]
for dt, idx, dur, g in coda:
    shamisen_trio(mix, CODA + dt, idx, dur, gain=g * 0.9, bright=0.45, sawari=0.38)
mix.add(CODA + 4.6, ko_tsuzumi('pon'), pan=-0.3, gain=0.4)
mix.add(CODA + 9.4, taiko(0.55, 1.6), pan=-0.4, gain=0.42)
mix.add(CODA + 9.5, kakegoe('o', 1.4, 120, 0.22, 0.42), pan=0.15)
mix.add(CODA + 2.0, nohkan(hz(3) * 1.009, 5.0, gain=0.3, breath=0.72, cut=2.2), pan=0.42)

# ===========================================================================
# Finish: a little room tone, a gentle limiter, fades that meet at the loop.
# ===========================================================================
buf = mix.buf
room = rng.normal(0, 1, (mix.n, 2))
room = np.stack([smooth(room[:, 0], 90), smooth(room[:, 1], 90)], axis=1)
room /= (np.abs(room).max() + 1e-9)
buf += room * 0.004

# A theatre is not an anechoic chamber. Four early reflections off the dry
# signal — the long two cross the channels, which is what a side wall does.
dry = mix.buf.copy()
for delay, gain, cross in ((0.031, 0.26, False), (0.047, 0.19, False),
                           (0.093, 0.13, True), (0.151, 0.08, True)):
    d = int(delay * FS)
    src = dry[:-d, ::-1] if cross else dry[:-d]
    buf[d:] += src * gain

peak = np.abs(buf).max()
# Soft-knee into the ceiling. A hayashi is nearly all transient, so the peak
# sits 20 dB over the average and normalising to the peak alone leaves the
# recording far quieter than the ballroom's.
buf = np.tanh(buf / max(peak, 1e-9) * 2.4) * 0.84

fade_in = np.clip(np.arange(mix.n) / (0.25 * FS), 0, 1)[:, None]
fade_out = np.clip((mix.n - np.arange(mix.n)) / (2.2 * FS), 0, 1)[:, None]
buf *= fade_in * fade_out

wav = OUT / 'cruise-opera-kabuki.wav'
OUT.mkdir(exist_ok=True)
with wave.open(str(wav), 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(FS)
    w.writeframes((np.clip(buf, -1, 1) * 32767).astype('<i2').tobytes())
print('wrote', wav, f'{DUR:.0f}s')

# This ffmpeg carries no libvorbis. Ogg Opus is smaller at the same quality
# and every browser that plays Ogg Vorbis plays it — but Opus only encodes at
# 48 kHz, so the rate is per-format rather than shared.
for args, rate, name in (
        (['-c:a', 'libmp3lame', '-q:a', '5'], '44100', 'cruise-opera-kabuki.mp3'),
        (['-c:a', 'libopus', '-b:a', '80k'], '48000', 'cruise-opera-kabuki.ogg')):
    dst = OUT / name
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', str(wav),
                    '-ac', '2', '-ar', rate, *args, str(dst)], check=True)
    print('wrote', dst, f'{dst.stat().st_size / 1024:.0f} KiB')
wav.unlink()

# ---------------------------------------------------------------------------
# The timeline cruiseKabuki.js is written against (seconds):
#
#   0.0    ki      the clappers call the house in
#   5.4    maku    the striped curtain is walked open
#  11.0    jo      ozatsuma — the actors are discovered, still
#  36.0    ha      the dance proper
#  84.0    mie1    first mie: freeze, tsuke, head roll
#  89.0    ha2     it resumes, quicker
# 132.0    kyu     accelerando
# 160.0    mie2    the great mie
# 167.0    coda    it settles
# 182.0            silence, and the recording loops (the house applauds)
# ---------------------------------------------------------------------------
