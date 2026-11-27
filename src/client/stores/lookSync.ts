// Les apparences choisies suivent le compte d'un appareil à l'autre (src/shared/savedLooks.ts). Au chargement, ce qui est
// enregistré sur le compte l'emporte et s'écrit sur l'appareil ; ce que l'appareil était seul à connaître part sur le
// compte (c'est la migration des choix d'avant), sauf si un autre compte s'en est servi sur cet appareil. Ensuite, chaque
// changement est envoyé : tout de suite pour les préférences, et au plus tard en quittant la page (ou toutes les 15 s)
// pour les choix que les jeux gardent eux-mêmes dans le navigateur.

import { cleanSavedLooks, PREF_LOOK_KEYS, STORE_LOOK_KEYS, type SavedLooks, type SavedLooksResponse } from "../../shared/savedLooks.ts";
import { api } from "../lib/api.ts";
import { usePrefs } from "./prefs.ts";
import { useSession } from "./session.ts";

/** Le compte dont les choix sont sur cet appareil : on n'envoie pas à un compte les choix d'un autre */
const OWNER = "tablee:looks-owner";

let userId: string | null = null;
/** Ce que le compte a, d'après le dernier échange */
let synced: SavedLooks = {};
let ready = false;
let sending = false;
let timer: ReturnType<typeof setInterval> | null = null;
let unsubscribePrefs: (() => void) | null = null;

/** Ce que cet appareil a choisi, sous les mêmes clés que le compte */
export function deviceSavedLooks(): SavedLooks {
  const p = usePrefs.getState();
  const out: Record<string, unknown> = {};
  for (const k of PREF_LOOK_KEYS) {
    const v = p[k];
    if (v) out[`p:${k}`] = v;
  }
  for (const k of STORE_LOOK_KEYS) {
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? "null") as unknown;
      if (v !== null && typeof v === "object") out[`s:${k}`] = v;
    } catch {
      // illisible : ignoré
    }
  }
  return cleanSavedLooks(out);
}

/** Écrit sur l'appareil ce que le compte a enregistré (les clés absentes ne changent pas) */
function writeDevice(looks: SavedLooks) {
  const patch: Record<string, string> = {};
  for (const k of PREF_LOOK_KEYS) {
    const v = looks[`p:${k}`];
    if (typeof v === "string") patch[k] = v;
  }
  if (Object.keys(patch).length > 0) usePrefs.getState().set(patch as Parameters<ReturnType<typeof usePrefs.getState>["set"]>[0]);
  for (const k of STORE_LOOK_KEYS) {
    const v = looks[`s:${k}`];
    if (v !== undefined && typeof v === "object") {
      try {
        localStorage.setItem(k, JSON.stringify(v));
      } catch {
        // stockage indisponible
      }
    }
  }
}

/** Ce qui change de `from` à `to` : les valeurs nouvelles, et null pour ce qui a disparu */
export function looksDiff(from: SavedLooks, to: SavedLooks): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(to)) if (JSON.stringify(from[k]) !== JSON.stringify(v)) patch[k] = v;
  for (const k of Object.keys(from)) if (!(k in to)) patch[k] = null;
  return Object.keys(patch).length > 0 ? patch : null;
}

async function send(patch: Record<string, unknown>) {
  const r = await api.post<SavedLooksResponse>("/looks", { patch });
  synced = r.looks;
}

/** Envoie ce qui a changé sur l'appareil depuis le dernier échange */
async function push() {
  if (!ready || sending || !userId) return;
  const patch = looksDiff(synced, deviceSavedLooks());
  if (!patch) return;
  sending = true;
  try {
    await send(patch);
  } catch {
    // Pas de réseau : on réessaiera au prochain changement
  } finally {
    sending = false;
  }
}

function stop() {
  ready = false;
  if (timer) clearInterval(timer);
  timer = null;
  unsubscribePrefs?.();
  unsubscribePrefs = null;
}

async function start(id: string) {
  stop();
  userId = id;
  let account: SavedLooks;
  try {
    account = (await api.get<SavedLooksResponse>("/looks")).looks;
  } catch {
    // Pas de réseau, ou pas encore la migration : l'appareil garde ses choix comme avant ; on réessaiera plus tard
    if (userId === id) userId = null;
    return;
  }
  if (userId !== id) return;
  const device = deviceSavedLooks();
  let owner: string | null = null;
  try {
    owner = localStorage.getItem(OWNER);
  } catch {
    // stockage indisponible
  }
  // Le compte l'emporte ; ce que l'appareil est seul à connaître part sur le compte, s'il ne vient pas d'un autre compte
  const onlyHere: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(device)) if (!(k in account)) onlyHere[k] = v;
  synced = { ...device, ...account };
  writeDevice(account);
  try {
    localStorage.setItem(OWNER, id);
  } catch {
    // stockage indisponible
  }
  ready = true;
  if ((owner === null || owner === id) && Object.keys(onlyHere).length > 0) {
    synced = account;
    void push();
  }
  unsubscribePrefs = usePrefs.subscribe(() => void push());
  timer = setInterval(() => void push(), 15_000);
}

let started = false;

/** À appeler une fois au lancement du site */
export function startLookSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  const follow = (id: string | null) => {
    if (id === userId) return;
    if (id) void start(id);
    else {
      stop();
      userId = null;
    }
  };
  follow(useSession.getState().user?.id ?? null);
  useSession.subscribe((s) => follow(s.user?.id ?? null));
  // En quittant la page ou en la cachant : ce qui a changé dans un salon part
  window.addEventListener("pagehide", () => void push());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void push();
  });
}
