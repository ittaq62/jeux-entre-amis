import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { TABLE_NAMES, type TableGame } from "../../shared/protocol.ts";
import {
  DEVICE_KINDS,
  DEVICE_NAMES,
  REPORT_KIND_NAMES,
  REPORT_KINDS,
  REPORT_STATUS_NAMES,
  REPORT_STATUSES,
  type AdminReport,
  type AdminReportList,
  type DeviceKind,
  type ReportKind,
  type ReportStatus,
} from "../../shared/report.ts";
import { AdminBadge } from "../components/AdminBadge.tsx";
import { Avatar } from "../components/Avatar.tsx";
import { ConfirmButton, Options, timeAgo } from "../components/ui.tsx";
import { api, ApiError } from "../lib/api.ts";
import { toast } from "../lib/toast.ts";

const failed = (err: unknown) => toast({ tone: "danger", title: err instanceof ApiError ? err.message : "Ça n'a pas marché." });

interface Filters {
  kind: ReportKind | "";
  game: TableGame | "";
  device: DeviceKind | "";
  status: ReportStatus | "";
}

const NO_FILTER: Filters = { kind: "", game: "", device: "", status: "" };
const GAMES = Object.keys(TABLE_NAMES) as TableGame[];

/** Une liste déroulante de filtre : « Tous » d'abord, puis chaque valeur */
function Filter<T extends string>({
  label,
  all,
  value,
  values,
  names,
  onChange,
}: {
  label: string;
  all: string;
  value: T | "";
  values: readonly T[];
  names: Record<T, string>;
  onChange: (v: T | "") => void;
}) {
  return (
    <label className="report-filter">
      <span className="visually-hidden">{label}</span>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as T | "")}>
        <option value="">{all}</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {names[v]}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * L'onglet des signalements : ce que les joueurs ont envoyé depuis la fin d'une partie ou d'une tournée.
 * `fresh` (les nouveaux, d'après la vue d'ensemble) recharge la liste quand il en arrive.
 */
export function AdminReports({ fresh, onChange }: { fresh: number; onChange: () => void }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTER);
  const [list, setList] = useState<AdminReportList | null>(null);

  const load = useCallback(() => {
    const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== ""));
    api
      .get<AdminReportList>(`/admin/reports${query.size > 0 ? `?${query}` : ""}`)
      .then(setList)
      .catch(failed);
  }, [filters]);

  useEffect(load, [load, fresh]);

  const set =
    <K extends keyof Filters>(key: K) =>
    (value: Filters[K]) =>
      setFilters((f) => ({ ...f, [key]: value }));
  const filtered = Object.values(filters).some((v) => v !== "");

  const replace = (r: AdminReport) => setList((l) => l && { ...l, reports: l.reports.map((x) => (x.id === r.id ? r : x)) });
  const remove = (id: string) => setList((l) => l && { ...l, reports: l.reports.filter((x) => x.id !== id), total: l.total - 1 });

  return (
    <section className="panel admin-section admin-reports">
      <h2>
        Signalements <span className="hint num">{list ? list.total : ""}</span>
      </h2>
      <p className="hint admin-lead">
        Envoyés depuis la fin d'une partie ou d'une tournée : un bug, un problème ou une idée, avec le jeu, la table et l'appareil.
      </p>

      <div className="report-filters">
        <Filter
          label="Type"
          all="Tous les types"
          value={filters.kind}
          values={REPORT_KINDS}
          names={REPORT_KIND_NAMES}
          onChange={set("kind")}
        />
        <Filter label="Jeu" all="Tous les jeux" value={filters.game} values={GAMES} names={TABLE_NAMES} onChange={set("game")} />
        <Filter
          label="Appareil"
          all="Tous les appareils"
          value={filters.device}
          values={DEVICE_KINDS}
          names={DEVICE_NAMES}
          onChange={set("device")}
        />
        <Filter
          label="État"
          all="Tous les états"
          value={filters.status}
          values={REPORT_STATUSES}
          names={REPORT_STATUS_NAMES}
          onChange={set("status")}
        />
        {filtered && (
          <button className="btn btn-sm btn-ghost" onClick={() => setFilters(NO_FILTER)}>
            Tout afficher
          </button>
        )}
      </div>

      {list === null ? (
        <p className="hint">Chargement…</p>
      ) : list.reports.length === 0 ? (
        <p className="empty">{filtered ? "Aucun signalement ne correspond à ces filtres." : "Aucun signalement pour l'instant."}</p>
      ) : (
        <>
          {list.total > list.reports.length && (
            <p className="hint">
              Les {list.reports.length} plus récents sur {list.total}.
            </p>
          )}
          <ul className="report-list">
            {list.reports.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onUpdated={(u) => {
                  replace(u);
                  onChange();
                }}
                onDeleted={() => {
                  remove(r.id);
                  onChange();
                }}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ReportCard({
  report: r,
  onUpdated,
  onDeleted,
}: {
  report: AdminReport;
  onUpdated: (r: AdminReport) => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function setStatus(status: ReportStatus) {
    if (status === r.status || busy) return;
    setBusy(true);
    try {
      onUpdated((await api.patch<{ report: AdminReport }>(`/admin/reports/${r.id}`, { status })).report);
    } catch (err) {
      failed(err);
    }
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    try {
      await api.del(`/admin/reports/${r.id}`);
      toast({ title: "Signalement supprimé" });
      onDeleted();
    } catch (err) {
      failed(err);
      setBusy(false);
    }
  }

  const c = r.context;
  const d = r.device;
  const where = [
    c.game ? (c.variant ?? TABLE_NAMES[c.game]) : (c.variant ?? "Hors partie"),
    c.code && `table ${c.code}`,
    c.tour && `tournée ${c.tour}`,
    c.role === "watcher" ? "en spectateur" : c.role === "player" ? "en joueur" : null,
  ].filter(Boolean);
  const sizes = [d.screen.w > 0 && `écran ${d.screen.w}×${d.screen.h}`, d.view.w > 0 && `fenêtre ${d.view.w}×${d.view.h}`].filter(Boolean);
  const date = new Date(r.createdAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" });

  return (
    <li className={`report-card is-${r.status}`}>
      <div className="report-card-head">
        <span className={`report-kind kind-${r.kind}`}>{REPORT_KIND_NAMES[r.kind]}</span>
        {r.status === "new" && <span className="report-new">nouveau</span>}
        <span className="hint report-date" title={date}>
          {timeAgo(r.createdAt)}
        </span>
      </div>

      <div className="report-author">
        <Avatar avatar={r.user.avatar} userId={r.user.id} photo={r.user.photo} size={28} />
        <Link href={`/joueur/${encodeURIComponent(r.user.pseudo)}`} className="report-pseudo">
          {r.user.pseudo}
        </Link>
        {r.user.admin && <AdminBadge />}
      </div>

      <p className="report-message">{r.message}</p>

      <dl className="report-facts">
        <div>
          <dt>Contexte</dt>
          <dd>{where.join(", ")}</dd>
        </div>
        <div>
          <dt>Appareil</dt>
          <dd>
            <strong>{DEVICE_NAMES[d.kind]}</strong>, {d.os}, {d.browser}
            {sizes.length > 0 && `, ${sizes.join(", ")}`}
          </dd>
        </div>
        <div>
          <dt>Envoyé</dt>
          <dd>
            {date}
            {r.version && <span className="hint">, version {r.version}</span>}
          </dd>
        </div>
      </dl>

      <div className="report-card-actions">
        <Options
          label="État du signalement"
          value={r.status}
          options={REPORT_STATUSES.map((s) => ({ value: s, label: REPORT_STATUS_NAMES[s] }))}
          onChange={(s) => void setStatus(s)}
          disabled={busy}
        />
        <ConfirmButton className="btn btn-sm btn-danger" confirm="Supprimer ?" onConfirm={() => void remove()} disabled={busy}>
          Supprimer
        </ConfirmButton>
      </div>
    </li>
  );
}
