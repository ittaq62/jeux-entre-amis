import { useEffect, useState } from "react";
import { Link } from "wouter";
import { TABLE_NAMES, type PresenceRoom } from "../../shared/protocol.ts";
import { PlayerName } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { Icon } from "../components/Icon.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";
import { INVITE_AGAIN_MS, useHub } from "../stores/hub.ts";

/** À côté d'un joueur du salon : en faire un ami, pour l'inviter directement la prochaine fois */
export function FriendButton({ userId, pseudo }: { userId: string; pseudo: string }) {
  const entry = useHub((s) => s.friends.find((f) => f.user.id === userId));
  const loaded = useHub((s) => s.friendsLoaded);
  const refreshFriends = useHub((s) => s.refreshFriends);
  const [busy, setBusy] = useState(false);
  if (!loaded || entry?.status === "accepted") return null;
  if (entry?.status === "outgoing") return <span className="hint seat-friend-note">demande envoyée</span>;

  async function act() {
    setBusy(true);
    try {
      if (entry?.status === "incoming") {
        await api.post(`/friends/${userId}/accept`);
        toast({ title: `${pseudo} et toi êtes amis !` });
      } else {
        const res = await api.post<{ result: string }>("/friends", { pseudo });
        toast({ title: res.result === "accepted" ? `${pseudo} et toi êtes amis !` : `Demande d'ami envoyée à ${pseudo}` });
      }
      await refreshFriends();
    } catch (err) {
      toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Impossible pour l'instant." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="btn btn-ghost btn-sm seat-friend" disabled={busy} onClick={() => void act()} title={`Ajouter ${pseudo} à tes amis`}>
      <Icon name="plus" size={14} /> {entry?.status === "incoming" ? "Accepter" : "Ami"}
    </button>
  );
}

/** Où en est un ami en ligne : libre, dans un salon, ou en pleine partie */
function whereabouts(room: PresenceRoom | null): string {
  if (!room) return "en ligne";
  const game = TABLE_NAMES[room.game] ?? "un jeu";
  return room.status === "playing" ? `en pleine partie : ${game}` : `dans un salon : ${game}`;
}

/** Les amis en ligne, à inviter d'un clic depuis le salon : ils reçoivent l'invitation où qu'ils soient sur le site. */
export function FriendsInvite({ code, here }: { code: string; here: Set<string> }) {
  const friends = useHub((s) => s.friends);
  const loaded = useHub((s) => s.friendsLoaded);
  const online = useHub((s) => s.online);
  const sent = useHub((s) => s.sent);
  const invite = useHub((s) => s.invite);
  const [, refresh] = useState(0);

  const accepted = friends.filter((f) => f.status === "accepted");
  const available = accepted.filter((f) => f.user.id in online && !here.has(f.user.id));
  const offline = accepted.filter((f) => !(f.user.id in online)).length;
  const now = Date.now();
  const sentHere = (id: string) => (sent[id]?.code === code ? sent[id] : undefined);

  // Le bouton « Relancer » revient tout seul quand l'attente est passée
  const pending = available.map((f) => sentHere(f.user.id)).filter((s) => s && !s.answer && now - s.at < INVITE_AGAIN_MS);
  useEffect(() => {
    if (pending.length === 0) return;
    const next = Math.min(...pending.map((s) => s!.at)) + INVITE_AGAIN_MS - Date.now();
    const t = setTimeout(() => refresh((n) => n + 1), Math.max(50, next + 50));
    return () => clearTimeout(t);
  });

  return (
    <section className="lobby-section panel lobby-friends" aria-label="Inviter des amis">
      <h2>
        Amis en ligne
        {available.length > 0 && <span className="hint num">{available.length}</span>}
      </h2>
      {!loaded ? null : accepted.length === 0 ? (
        <p className="hint lobby-friends-empty">
          Ajoute tes amis par leur pseudo : ensuite, tu les invites d'ici en un clic. <Link href="/amis">Ajouter des amis</Link>
        </p>
      ) : available.length === 0 ? (
        <p className="hint lobby-friends-empty">
          Aucun ami disponible pour l'instant{offline > 0 ? ` (${offline} hors ligne)` : ""}. Dès qu'un ami se connecte, il apparaît ici.
        </p>
      ) : (
        <ul className="friend-invites">
          {available.map((f) => {
            const room = online[f.user.id] ?? null;
            const s = sentHere(f.user.id);
            const waiting = s && !s.answer && now - s.at < INVITE_AGAIN_MS;
            return (
              <li key={f.user.id} className="friend-invite">
                <span className="avatar-wrap">
                  <Avatar avatar={f.user.avatar} userId={f.user.id} photo={f.user.photo} size={38} />
                  <span className={`dot presence-dot ${room ? "dot-playing" : "dot-online"}`} />
                </span>
                <span className="row-text">
                  <strong>
                    <PlayerName name={f.user.pseudo} admin={f.user.admin} />
                  </strong>
                  <span className="hint">
                    {s?.answer === "yes" ? "arrive !" : s?.answer === "no" ? "pas dispo pour l'instant" : whereabouts(room)}
                  </span>
                </span>
                {s?.answer === "yes" ? (
                  <span className="friend-invite-ok">
                    <Icon name="check" size={16} />
                  </span>
                ) : (
                  <button className={`btn btn-sm ${s ? "" : "btn-primary"}`} disabled={waiting} onClick={() => invite(f.user.id, code)}>
                    {waiting ? (
                      <>
                        <Icon name="check" size={14} /> Invité
                      </>
                    ) : s ? (
                      "Relancer"
                    ) : (
                      "Inviter"
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
