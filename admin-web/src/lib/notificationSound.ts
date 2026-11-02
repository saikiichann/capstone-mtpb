/* ------------------------------------------------------------------
   Notification sound (NotificationBell)

   Default: two quick marimba notes (C6 → G6) with a light echo, made
   with the Web Audio API so no audio file is needed.

   Own sound (optional): put an audio file at public/notification.mp3 and
   it is played instead. Use a sound you're allowed to use, e.g. a free
   one from Pixabay or Mixkit; don't copy Facebook's or another app's sound.

   Browsers only allow sound after the user has clicked or pressed a key
   on the page, so `unlockNotificationSound()` runs on the first click;
   before that, `playNotificationSound()` does nothing.

   The on/off choice is per browser (localStorage).
------------------------------------------------------------------ */

const STORAGE_KEY = "mtpb:notificationSound";
const CUSTOM_SOUND_URL = "/notification.mp3";

let ctx: AudioContext | null = null;
let customAudio: HTMLAudioElement | null = null;
let customChecked = false;

const audioContext = (): AudioContext | null => {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    ctx = null;
  }
  return ctx;
};

/** Uses public/notification.mp3 when it exists (and really is audio). */
const checkCustomSound = async () => {
  if (customChecked) return;
  customChecked = true;
  try {
    const res = await fetch(CUSTOM_SOUND_URL, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("audio/")) {
      customAudio = new Audio(CUSTOM_SOUND_URL);
      customAudio.preload = "auto";
      customAudio.volume = 0.7;
    }
  } catch {
    /* no file: the built-in pop is used */
  }
};

/** Call from a click / key press so later sounds are allowed to play. */
export const unlockNotificationSound = (): void => {
  const ac = audioContext();
  if (ac && ac.state === "suspended") void ac.resume().catch(() => undefined);
  void checkCustomSound();
};

export const isNotificationSoundOn = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
};

export const setNotificationSoundOn = (on: boolean): void => {
  try {
    localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
  } catch {
    /* private window: setting just won't be remembered */
  }
};

let bus: GainNode | null = null;

/** Output with a light room echo, so the notes sound warmer. Built once. */
const outputBus = (ac: AudioContext): GainNode => {
  if (bus) return bus;
  bus = ac.createGain();
  const delay = ac.createDelay();
  delay.delayTime.value = 0.09;
  const feedback = ac.createGain();
  feedback.gain.value = 0.22;
  const soften = ac.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 4000;
  bus.connect(ac.destination);
  bus.connect(delay);
  delay.connect(soften).connect(feedback).connect(delay);
  feedback.connect(ac.destination);
  return bus;
};

/** One marimba note: the main tone plus two short, quieter overtones. */
const marimbaNote = (ac: AudioContext, out: GainNode, start: number, frequency: number, volume: number) => {
  const partials: [number, number, number][] = [
    // [frequency × , volume × , length in seconds]
    [1, 1, 0.45],
    [3.93, 0.25, 0.12],
    [9.2, 0.06, 0.04],
  ];
  for (const [ratio, level, length] of partials) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency * ratio;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * level, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + length + 0.05);
  }
};

/** Plays the notification sound. Silent if sound is blocked or turned off. */
export const playNotificationSound = (): void => {
  if (customAudio) {
    customAudio.currentTime = 0;
    void customAudio.play().catch(() => undefined);
    return;
  }

  const ac = audioContext();
  if (!ac || ac.state !== "running") return;
  const out = outputBus(ac);
  const now = ac.currentTime + 0.02;
  // Two marimba notes, C6 then G6.
  marimbaNote(ac, out, now, 1046.5, 0.5);
  marimbaNote(ac, out, now + 0.11, 1568, 0.42);
};
