import { memo, useId } from "react";
import { AVATAR_BACKGROUNDS, AVATAR_HAIR_COLORS, AVATAR_SKINS, type AvatarConfig } from "../../shared/avatar.ts";
import { photoUrl } from "../lib/api.ts";

interface Props {
  avatar: AvatarConfig;
  size?: number;
  userId?: string | null;
  photo?: number;
  className?: string;
  title?: string;
}

const INK = "#2b1d14";

/** Avatar dessine (ou photo de profil si le joueur en a une). */
export const Avatar = memo(function Avatar({ avatar, size = 48, userId, photo = 0, className, title }: Props) {
  const url = userId ? photoUrl(userId, photo) : null;
  if (url) {
    return (
      <img
        src={url}
        width={size}
        height={size}
        alt={title ?? ""}
        className={`avatar avatar-photo ${className ?? ""}`}
        style={{ width: size, height: size }}
        draggable={false}
      />
    );
  }
  return <AvatarDrawing avatar={avatar} size={size} className={className} title={title} />;
});

export function AvatarDrawing({ avatar, size = 48, className, title }: Omit<Props, "userId" | "photo">) {
  const clip = useId();
  const bg = AVATAR_BACKGROUNDS[avatar.bg] ?? AVATAR_BACKGROUNDS[0]!;
  const skin = AVATAR_SKINS[avatar.skin] ?? AVATAR_SKINS[0]!;
  const shade = "rgba(0,0,0,0.12)";
  const hair = AVATAR_HAIR_COLORS[avatar.hairColor] ?? AVATAR_HAIR_COLORS[0]!;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={`avatar ${className ?? ""}`} role="img" aria-label={title ?? "Avatar"}>
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <radialGradient id={`${clip}-bg`} cx="35%" cy="25%" r="85%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="100" height="100" fill={bg} />
        <rect width="100" height="100" fill={`url(#${clip}-bg)`} />
        {/* Epaules */}
        <path d="M14 104 C16 82 34 76 50 76 C66 76 84 82 86 104 Z" fill="rgba(0,0,0,0.25)" />
        <Hair kind={avatar.hair} color={hair} back />
        {/* Oreilles et tete */}
        <circle cx="23" cy="56" r="7" fill={skin} />
        <circle cx="77" cy="56" r="7" fill={skin} />
        <circle cx="50" cy="55" r="28" fill={skin} />
        <path d="M24 62 C28 80 72 80 76 62 C72 76 28 76 24 62 Z" fill={shade} />
        <Hair kind={avatar.hair} color={hair} />
        <Extra kind={avatar.extra} under />
        <Eyes kind={avatar.eyes} />
        <Mouth kind={avatar.mouth} />
        <Extra kind={avatar.extra} />
        <Hat kind={avatar.hat} />
      </g>
    </svg>
  );
}

function Eyes({ kind }: { kind: number }) {
  switch (kind) {
    case 1: // contents
      return (
        <g stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none">
          <path d="M35 52 Q40 46 45 52" />
          <path d="M55 52 Q60 46 65 52" />
        </g>
      );
    case 2: // clin d'oeil
      return (
        <g fill={INK}>
          <circle cx="40" cy="51" r="3.6" />
          <path d="M55 52 Q60 48 65 52" stroke={INK} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        </g>
      );
    case 3: // grands yeux brillants
      return (
        <g>
          <circle cx="40" cy="50" r="6.5" fill="#fff" />
          <circle cx="60" cy="50" r="6.5" fill="#fff" />
          <circle cx="41" cy="51" r="3.8" fill={INK} />
          <circle cx="61" cy="51" r="3.8" fill={INK} />
          <circle cx="42.5" cy="49.2" r="1.3" fill="#fff" />
          <circle cx="62.5" cy="49.2" r="1.3" fill="#fff" />
        </g>
      );
    case 4: // endormi
      return (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M35 51 Q40 55 45 51" />
          <path d="M55 51 Q60 55 65 51" />
        </g>
      );
    case 5: // etoiles
      return (
        <g fill="#f5c542" stroke={INK} strokeWidth="1.2" strokeLinejoin="round">
          <path d="M40 44 l2 4.6 5 .4 -3.8 3.2 1.2 4.9 -4.4-2.7 -4.4 2.7 1.2-4.9 -3.8-3.2 5-.4z" />
          <path d="M60 44 l2 4.6 5 .4 -3.8 3.2 1.2 4.9 -4.4-2.7 -4.4 2.7 1.2-4.9 -3.8-3.2 5-.4z" />
        </g>
      );
    case 6: // fache
      return (
        <g>
          <path d="M33 44 L46 48" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <path d="M67 44 L54 48" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />
          <circle cx="40" cy="53" r="3.4" fill={INK} />
          <circle cx="60" cy="53" r="3.4" fill={INK} />
        </g>
      );
    case 7: // surpris
      return (
        <g fill="none" stroke={INK} strokeWidth="2.6">
          <circle cx="40" cy="50" r="5" />
          <circle cx="60" cy="50" r="5" />
          <circle cx="40" cy="50" r="1.6" fill={INK} />
          <circle cx="60" cy="50" r="1.6" fill={INK} />
        </g>
      );
    default:
      return (
        <g fill={INK}>
          <circle cx="40" cy="51" r="3.6" />
          <circle cx="60" cy="51" r="3.6" />
        </g>
      );
  }
}

function Mouth({ kind }: { kind: number }) {
  switch (kind) {
    case 1: // grand sourire
      return <path d="M38 63 Q50 76 62 63 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />;
    case 2: // oh
      return <ellipse cx="50" cy="67" rx="4.5" ry="5.5" fill={INK} />;
    case 3: // neutre
      return <path d="M42 66 L58 66" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
    case 4: // sourire en coin
      return <path d="M41 66 Q52 70 60 62" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
    case 5: // langue
      return (
        <g>
          <path d="M40 63 Q50 72 60 63" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M46 67 Q50 76 54 67 Z" fill="#e5636b" />
        </g>
      );
    case 6: // moustache
      return (
        <g>
          <path d="M43 68 Q50 72 57 68" stroke={INK} strokeWidth="2.6" strokeLinecap="round" fill="none" />
          <path d="M50 62 C44 58 34 60 33 66 C38 63 44 65 50 64 C56 65 62 63 67 66 C66 60 56 58 50 62 Z" fill="#3b2a1f" />
        </g>
      );
    case 7: // triste
      return <path d="M41 69 Q50 61 59 69" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
    default:
      return <path d="M40 64 Q50 72 60 64" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />;
  }
}

function Hair({ kind, color, back }: { kind: number; color: string; back?: boolean }) {
  if (back) {
    if (kind === 4) return <path d="M20 56 C18 26 82 26 80 56 L82 84 C76 88 70 86 68 80 L32 80 C30 86 24 88 18 84 Z" fill={color} />;
    if (kind === 7) return <path d="M70 34 C88 36 92 60 84 76 C82 62 78 50 68 44 Z" fill={color} />;
    return null;
  }
  switch (kind) {
    case 1: // court
      return <path d="M19 54 C15 17 85 17 81 54 C78 43 71 37 63 38 C57 33 43 33 37 38 C29 37 22 43 19 54 Z" fill={color} />;
    case 2: // raie sur le cote
      return <path d="M18 56 C13 15 87 15 82 56 C80 45 75 38 67 35 C56 42 38 45 27 42 C23 46 20 51 18 56 Z" fill={color} />;
    case 3: // boucles
      return (
        <g fill={color}>
          {[
            [25, 44],
            [30, 33],
            [40, 26],
            [51, 24],
            [62, 26],
            [71, 33],
            [76, 44],
            [22, 54],
            [78, 54],
            [46, 33],
            [58, 34],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r="9.5" />
          ))}
        </g>
      );
    case 4: // long
      return <path d="M19 54 C15 17 85 17 81 54 C78 43 71 37 63 38 C57 33 43 33 37 38 C29 37 22 43 19 54 Z" fill={color} />;
    case 5: // chignon
      return (
        <g fill={color}>
          <circle cx="50" cy="16" r="11" />
          <path d="M19 54 C15 17 85 17 81 54 C78 43 71 37 63 38 C57 33 43 33 37 38 C29 37 22 43 19 54 Z" />
        </g>
      );
    case 6: // crete
      return <path d="M40 34 L44 12 L50 30 L54 8 L58 30 L64 14 L62 36 C56 32 46 32 40 34 Z" fill={color} />;
    case 7: // queue de cheval
      return <path d="M19 54 C15 17 85 17 81 54 C78 43 71 37 63 38 C57 33 43 33 37 38 C29 37 22 43 19 54 Z" fill={color} />;
    default:
      return null;
  }
}

function Hat({ kind }: { kind: number }) {
  switch (kind) {
    case 1: // beret
      return (
        <g>
          <ellipse cx="45" cy="30" rx="27" ry="11" fill="#1f2933" />
          <circle cx="47" cy="19" r="3" fill="#1f2933" />
        </g>
      );
    case 2: // haut-de-forme
      return (
        <g>
          <rect x="31" y="2" width="38" height="28" rx="3" fill="#15171c" />
          <rect x="31" y="21" width="38" height="6" fill="#b3263c" />
          <ellipse cx="50" cy="31" rx="29" ry="5" fill="#15171c" />
        </g>
      );
    case 3: // couronne
      return (
        <g>
          <path
            d="M30 32 L30 14 L40 23 L50 10 L60 23 L70 14 L70 32 Z"
            fill="#f2c04d"
            stroke="#a87b16"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="25" r="2.6" fill="#d9304a" />
          <circle cx="38" cy="27" r="1.8" fill="#2c7be5" />
          <circle cx="62" cy="27" r="1.8" fill="#2fa864" />
        </g>
      );
    case 4: // casquette
      return (
        <g>
          <path d="M24 36 C24 18 76 18 76 36 Z" fill="#d6413a" />
          <path d="M60 33 C72 31 86 33 90 37 C80 38 68 38 58 37 Z" fill="#b8322c" />
          <circle cx="50" cy="20" r="2.2" fill="#b8322c" />
        </g>
      );
    case 5: // bonnet
      return (
        <g>
          <path d="M23 38 C22 14 78 14 77 38 Z" fill="#3a6ea5" />
          <rect x="22" y="31" width="56" height="9" rx="4.5" fill="#2b5482" />
          <circle cx="50" cy="13" r="6" fill="#f3efe6" />
        </g>
      );
    case 6: // chapeau de fete
      return (
        <g>
          <path d="M37 32 L50 0 L63 32 Z" fill="#8e44ad" />
          <path d="M41.5 21 L58.5 21 L56.5 26 L43.5 26 Z" fill="#f3b62c" />
          <path d="M45.5 11 L54.5 11 L53 15 L47 15 Z" fill="#f3b62c" />
          <circle cx="50" cy="1" r="3.5" fill="#f3b62c" />
        </g>
      );
    case 7: // cowboy
      return (
        <g>
          <path d="M33 30 C33 10 67 10 67 30 Z" fill="#9c6b3c" />
          <path d="M14 30 C26 38 74 38 86 30 C80 26 70 30 50 30 C30 30 20 26 14 30 Z" fill="#87582f" />
          <rect x="34" y="24" width="32" height="5" fill="#5d3a1c" />
        </g>
      );
    case 8: // bandeau
      return (
        <g>
          <path d="M22 41 C30 33 70 33 78 41 L78 47 C70 40 30 40 22 47 Z" fill="#e23b3f" />
          <path d="M78 42 L90 36 M78 45 L91 47" stroke="#e23b3f" strokeWidth="4" strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
}

function Extra({ kind, under }: { kind: number; under?: boolean }) {
  if (under) {
    if (kind === 3)
      return (
        <g fill="#f08a8a" opacity="0.55">
          <ellipse cx="32" cy="62" rx="6" ry="3.6" />
          <ellipse cx="68" cy="62" rx="6" ry="3.6" />
        </g>
      );
    if (kind === 6)
      return (
        <g fill="#9a5b34" opacity="0.6">
          <circle cx="33" cy="60" r="1.3" />
          <circle cx="37" cy="63" r="1.3" />
          <circle cx="31" cy="64" r="1.1" />
          <circle cx="67" cy="60" r="1.3" />
          <circle cx="63" cy="63" r="1.3" />
          <circle cx="69" cy="64" r="1.1" />
        </g>
      );
    return null;
  }
  switch (kind) {
    case 1: // lunettes rondes
      return (
        <g fill="rgba(255,255,255,0.15)" stroke="#20242b" strokeWidth="2.4">
          <circle cx="40" cy="51" r="8" />
          <circle cx="60" cy="51" r="8" />
          <path d="M48 50 Q50 48 52 50" fill="none" />
        </g>
      );
    case 2: // lunettes de soleil
      return (
        <g>
          <path d="M29 46 L71 46 L69 53 C68 59 56 59 54 52 L46 52 C44 59 32 59 31 53 Z" fill="#111317" />
          <path d="M33 48 L40 48" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 4: // monocle
      return (
        <g fill="none" stroke="#c9a14b" strokeWidth="2.2">
          <circle cx="60" cy="51" r="8.5" fill="rgba(255,255,255,0.18)" />
          <path d="M68 55 Q74 66 70 80" strokeWidth="1.2" />
        </g>
      );
    case 5: // cache-oeil
      return (
        <g>
          <path d="M24 40 L76 58" stroke="#15171c" strokeWidth="2.4" />
          <ellipse cx="60" cy="52" rx="8.5" ry="7.5" fill="#15171c" />
        </g>
      );
    default:
      return null;
  }
}
