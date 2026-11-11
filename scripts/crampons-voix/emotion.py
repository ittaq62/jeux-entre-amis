# L'émotion : on sculpte l'intonation d'une réplique (méthode PSOLA de Praat, qui garde le timbre et les voyelles).
import numpy as np
import parselmouth
from parselmouth.praat import call

# Par ton : de combien on élargit les montées et descentes, de combien on monte la voix, le débit, l'élan final
STYLE = {
    "calme": dict(spread=1.25, lift=1.04, speed=1.0, peak=0.0, stretch=1.0),
    "vif": dict(spread=1.45, lift=1.16, speed=0.95, peak=0.08, stretch=1.0),
    "fort": dict(spread=1.7, lift=1.28, speed=0.93, peak=0.14, stretch=1.0),
}

def voiced_runs(pitch, step):
    f0 = pitch.selected_array["frequency"]
    runs, start = [], None
    for i, v in enumerate(f0):
        if v > 0 and start is None:
            start = i
        if (v <= 0 or i == len(f0) - 1) and start is not None:
            end = i if v <= 0 else i + 1
            if end - start >= 4:
                runs.append((pitch.xs()[start], pitch.xs()[end - 1]))
            start = None
    return runs

def express(in_wav, out_wav, tone, stretch_last=1.0):
    st = STYLE[tone]
    snd = parselmouth.Sound(in_wav)
    pitch = snd.to_pitch(time_step=0.01, pitch_floor=110, pitch_ceiling=600)
    f0 = pitch.selected_array["frequency"]
    voiced = f0[f0 > 0]
    if len(voiced) < 5:
        snd.save(out_wav, "WAV")
        return
    med = float(np.median(voiced))
    manip = call(snd, "To Manipulation", 0.01, 110, 600)
    tier = call(manip, "Extract pitch tier")
    target = med * st["lift"]
    runs = voiced_runs(pitch, 0.01)
    # Le dernier mot qui sonne : c'est là que la voix culmine (« Et c'est le BUT ! »)
    t_peak = (runs[-1][0] + runs[-1][1]) / 2 if runs else snd.duration * 0.7
    w = max(0.12, (runs[-1][1] - runs[-1][0]) * 0.8) if runs else 0.2
    call(tier, "Formula", f"{target} * (self / {med}) ^ {st['spread']} * (1 + {st['peak']} * exp(-((x - {t_peak}) / {w}) ^ 2))")
    call([tier, manip], "Replace pitch tier")
    dur = call(manip, "Extract duration tier")
    call(dur, "Add point", 0, st["speed"])
    call(dur, "Add point", snd.duration, st["speed"])
    if stretch_last > 1 and runs:
        a, b = runs[-1]
        mid_a = a + (b - a) * 0.25
        mid_b = a + (b - a) * 0.8
        call(dur, "Add point", max(0, a - 0.005), st["speed"])
        call(dur, "Add point", mid_a, stretch_last)
        call(dur, "Add point", mid_b, stretch_last)
        call(dur, "Add point", min(snd.duration, b + 0.005), st["speed"])
    call([dur, manip], "Replace duration tier")
    out = call(manip, "Get resynthesis (overlap-add)")
    out.save(out_wav, "WAV")
