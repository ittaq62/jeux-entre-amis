import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Un contexte audio factice : chaque son décodé dure `duration` secondes (selon le fichier)
function fakeAudio(durationOf: (file: string) => number) {
  const fetched: string[] = [];
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  class FakeContext {
    currentTime = 0;
    state = "running";
    destination = {};
    createGain() {
      return { gain: param(), connect: (x: unknown) => x };
    }
    createBufferSource() {
      return { buffer: null, loop: false, connect: (x: unknown) => x, start() {}, stop() {} };
    }
    decodeAudioData(data: { file: string }) {
      return Promise.resolve({ duration: durationOf(data.file) });
    }
  }
  vi.stubGlobal("window", { AudioContext: FakeContext });
  vi.stubGlobal("fetch", (url: string) => {
    const file = url.replace("/sounds/", "");
    fetched.push(file);
    return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve({ file }) });
  });
  return fetched;
}

describe("les longues musiques en boucle ne restent pas en mémoire", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("arrêtée, une musique est oubliée au bout d'une minute ; une revanche lancée avant la retrouve telle quelle", async () => {
    const fetched = fakeAudio(() => 110);
    const { startLoop, stopLoop, FORGET_LOOP_MS } = await import("./sound.ts");
    startLoop("tourMusic");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual(["tour-music.mp3"]);
    // Une partie de plusieurs minutes : la musique qui joue n'est jamais oubliée
    await vi.advanceTimersByTimeAsync(5 * FORGET_LOOP_MS);
    stopLoop();
    // La revanche, trente secondes plus tard : la même musique décodée, sans rien recharger
    await vi.advanceTimersByTimeAsync(FORGET_LOOP_MS / 2);
    startLoop("tourMusic");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual(["tour-music.mp3"]);
    // On quitte la table : une minute après l'arrêt, elle est oubliée, et revient du cache à la partie suivante
    stopLoop();
    await vi.advanceTimersByTimeAsync(FORGET_LOOP_MS + 1000);
    startLoop("tourMusic");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetched).toEqual(["tour-music.mp3", "tour-music.mp3"]);
  });

  it("préchargée mais jamais lancée (la musique coupée dans les réglages), elle est oubliée aussi", async () => {
    const fetched = fakeAudio(() => 102);
    const { preloadSounds, soundsLoaded, FORGET_LOOP_MS } = await import("./sound.ts");
    preloadSounds(["brickMusic"]);
    await vi.advanceTimersByTimeAsync(FORGET_LOOP_MS + 1000);
    await soundsLoaded(["brickMusic"]);
    expect(fetched).toEqual(["bricks-music.mp3", "bricks-music.mp3"]);
  });

  it("les sons brefs restent chargés", async () => {
    const fetched = fakeAudio(() => 0.4);
    const { preloadSounds, soundsLoaded, FORGET_LOOP_MS } = await import("./sound.ts");
    preloadSounds(["cardPlace"]);
    await vi.advanceTimersByTimeAsync(0);
    const first = fetched.length;
    expect(first).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(10 * FORGET_LOOP_MS);
    await soundsLoaded(["cardPlace"]);
    expect(fetched.length).toBe(first);
  });
});
