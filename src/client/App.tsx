import { lazy, Suspense, useEffect } from "react";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { CardDefs } from "./components/Card.tsx";
import { ErrorBoundary, Unreachable } from "./components/ErrorScreen.tsx";
import { InviteCards } from "./components/InviteCards.tsx";
import { ReportHost } from "./components/ReportButton.tsx";
import { Loading, Toasts } from "./components/ui.tsx";
import { rememberTable } from "./lib/lastTable.ts";
import { unlockAudio } from "./lib/sound.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { setHubNavigator, useHub } from "./stores/hub.ts";
import { usePrefs } from "./stores/prefs.ts";
import { useSession } from "./stores/session.ts";
import { startLookSync } from "./stores/lookSync.ts";

// Les apparences choisies suivent le compte d'un appareil à l'autre
startLookSync();

// Les autres pages sont chargees a la demande pour un premier affichage rapide sur mobile
const RoomPage = lazy(() => import("./pages/RoomPage.tsx").then((m) => ({ default: m.RoomPage })));
const ProfilePage = lazy(() => import("./pages/ProfilePage.tsx").then((m) => ({ default: m.ProfilePage })));
const LeaderboardPage = lazy(() =>
  import("./pages/LeaderboardPage.tsx").then((m) => ({
    default: m.LeaderboardPage,
  })),
);
const FriendsPage = lazy(() => import("./pages/FriendsPage.tsx").then((m) => ({ default: m.FriendsPage })));
const AccountPage = lazy(() => import("./pages/AccountPage.tsx").then((m) => ({ default: m.AccountPage })));
const CharacterPage = lazy(() => import("./pages/CharacterPage.tsx").then((m) => ({ default: m.CharacterPage })));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage.tsx").then((m) => ({ default: m.PrivacyPage })));
const AdminPage = lazy(() => import("./pages/AdminPage.tsx").then((m) => ({ default: m.AdminPage })));
const ShopPage = lazy(() => import("./pages/ShopPage.tsx").then((m) => ({ default: m.ShopPage })));
const AlbumPage = lazy(() => import("./pages/AlbumPage.tsx").then((m) => ({ default: m.AlbumPage })));
const DevGallery = lazy(() => import("./pages/DevGallery.tsx").then((m) => ({ default: m.DevGallery })));
const DevGarage = lazy(() => import("./bolides/DevGarage.tsx").then((m) => ({ default: m.DevGarage })));
const DevItems = lazy(() => import("./bolides/DevItems.tsx").then((m) => ({ default: m.DevItems })));
const DevCards = lazy(() => import("./cards/DevCards.tsx").then((m) => ({ default: m.DevCards })));
const DevMatch = lazy(() => import("./crampons/DevMatch.tsx").then((m) => ({ default: m.DevMatch })));
const DevPoses = lazy(() => import("./crampons/DevPoses.tsx").then((m) => ({ default: m.DevPoses })));
const DevAffiche = lazy(() => import("./crampons/DevAffiche.tsx").then((m) => ({ default: m.DevAffiche })));
const DevTour = lazy(() => import("./tour/DevTour.tsx").then((m) => ({ default: m.DevTour })));
const DevBombs = lazy(() => import("./meche/DevBombs.tsx").then((m) => ({ default: m.DevBombs })));
const DevWardrobe = lazy(() => import("./pages/DevWardrobe.tsx").then((m) => ({ default: m.DevWardrobe })));
const DevEscarmouche = lazy(() => import("./escarmouche/DevEscarmouche.tsx").then((m) => ({ default: m.DevEscarmouche })));
const DevCulbute = lazy(() => import("./culbute/DevCulbute.tsx").then((m) => ({ default: m.DevCulbute })));
const DevMinigolf = lazy(() => import("./minigolf/DevMinigolf.tsx").then((m) => ({ default: m.DevMinigolf })));
const DevBillard = lazy(() => import("./billard/DevBillard.tsx").then((m) => ({ default: m.DevBillard })));
const DevCour = lazy(() => import("./cour/DevCour.tsx").then((m) => ({ default: m.DevCour })));
const DevToque = lazy(() => import("./toque/DevToque.tsx").then((m) => ({ default: m.DevToque })));
const CourCampaign = lazy(() => import("./cour/CampaignPage.tsx").then((m) => ({ default: m.CampaignPage })));
const TourSheetPage = lazy(() => import("./pages/TourSheetPage.tsx").then((m) => ({ default: m.TourSheetPage })));

const PUBLIC = ["/connexion", "/confidentialite"];

export function App() {
  const { loaded, user, pending, load, unreachable } = useSession();
  const [location, navigate] = useLocation();
  const search = useSearch();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setHubNavigator(navigate), [navigate]);

  // La dernière table ouverte : « Ta dernière table » dans le bloc « Ce soir » de l'accueil
  useEffect(() => {
    const table = /^\/salon\/([A-Za-z]{4})$/.exec(location);
    if (table && user) rememberTable(table[1]!.toUpperCase());
  }, [location, user]);

  // « Effets réduits » coupe aussi les apparitions des pages et des listes (styles/base.css)
  const reduced = usePrefs((s) => s.reducedEffects);
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", reduced);
  }, [reduced]);

  // « Texte plus grand » : les textes de base (et ceux des jeux qui s'y branchent) suivent --text-scale
  const textScale = usePrefs((s) => s.textScale);
  useEffect(() => {
    document.documentElement.style.setProperty("--text-scale", String(textScale));
  }, [textScale]);

  useEffect(() => {
    if (user) useHub.getState().connect();
    else useHub.getState().disconnect();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  if (!loaded) return <Loading />;

  const isPublic = PUBLIC.includes(location) || (import.meta.env.DEV && location.startsWith("/dev/"));
  const here = location + (search ? `?${search}` : "");
  // Le site n'a pas répondu : on ne sait pas si on est connecté, ce n'est pas une raison d'envoyer vers la connexion
  if (unreachable && !user && !pending && !isPublic) return <Unreachable retry={load} />;
  if (!user && !pending && !isPublic) return <Redirect to={`/connexion?suite=${encodeURIComponent(here)}`} replace />;
  if (pending && location !== "/bienvenue" && !isPublic) return <Redirect to={`/bienvenue?suite=${encodeURIComponent(here)}`} replace />;
  if (user && (location === "/connexion" || location === "/bienvenue")) {
    const next = new URLSearchParams(search).get("suite");
    return <Redirect to={next && next.startsWith("/") ? next : "/"} replace />;
  }

  return (
    <>
      <CardDefs />
      {/* Une page qui plante (ou un morceau périmé après une mise à jour) ne laisse plus un écran vide */}
      <ErrorBoundary resetKey={location}>
        <Suspense fallback={<Loading />}>
          <Switch>
            <Route path="/connexion" component={LoginPage} />
            <Route path="/bienvenue" component={OnboardingPage} />
            <Route path="/confidentialite" component={PrivacyPage} />
            <Route path="/" component={HomePage} />
            <Route path="/salon/:code">{(params) => <RoomPage key={params.code} code={params.code} />}</Route>
            <Route path="/joueur/:pseudo">{(params) => <ProfilePage pseudo={decodeURIComponent(params.pseudo)} />}</Route>
            <Route path="/tournee/:id">{(params) => <TourSheetPage id={params.id} />}</Route>
            <Route path="/classement" component={LeaderboardPage} />
            <Route path="/boutique" component={ShopPage} />
            <Route path="/album" component={AlbumPage} />
            <Route path="/cour/campagne" component={CourCampaign} />
            <Route path="/amis" component={FriendsPage} />
            <Route path="/compte" component={AccountPage} />
            <Route path="/personnage" component={CharacterPage} />
            <Route path="/admin" component={AdminPage} />
            {import.meta.env.DEV && <Route path="/dev/galerie" component={DevGallery} />}
            {import.meta.env.DEV && <Route path="/dev/garage" component={DevGarage} />}
            {import.meta.env.DEV && <Route path="/dev/objets" component={DevItems} />}
            {import.meta.env.DEV && <Route path="/dev/cartes" component={DevCards} />}
            {import.meta.env.DEV && <Route path="/dev/crampons" component={DevMatch} />}
            {import.meta.env.DEV && <Route path="/dev/poses" component={DevPoses} />}
            {import.meta.env.DEV && <Route path="/dev/affiche" component={DevAffiche} />}
            {import.meta.env.DEV && <Route path="/dev/tournee" component={DevTour} />}
            {import.meta.env.DEV && <Route path="/dev/bombes" component={DevBombs} />}
            {import.meta.env.DEV && <Route path="/dev/escarmouche" component={DevEscarmouche} />}
            {import.meta.env.DEV && <Route path="/dev/culbute" component={DevCulbute} />}
            {import.meta.env.DEV && <Route path="/dev/minigolf" component={DevMinigolf} />}
            {import.meta.env.DEV && <Route path="/dev/billard" component={DevBillard} />}
            {import.meta.env.DEV && <Route path="/dev/cour" component={DevCour} />}
            {import.meta.env.DEV && <Route path="/dev/toque" component={DevToque} />}
            {import.meta.env.DEV && <Route path="/dev/personnage" component={DevWardrobe} />}
            <Route component={NotFoundPage} />
          </Switch>
        </Suspense>
      </ErrorBoundary>
      <Toasts>{user && <InviteCards />}</Toasts>
      {user && <ReportHost />}
    </>
  );
}
