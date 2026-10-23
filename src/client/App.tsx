import { useEffect } from "react";
import { Redirect, Route, Switch, useLocation, useSearch } from "wouter";
import { CardDefs } from "./components/Card.tsx";
import { Loading, Toasts } from "./components/ui.tsx";
import { unlockAudio } from "./lib/sound.ts";
import { AccountPage } from "./pages/AccountPage.tsx";
import { DevGallery } from "./pages/DevGallery.tsx";
import { FriendsPage } from "./pages/FriendsPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { LeaderboardPage } from "./pages/LeaderboardPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { PrivacyPage } from "./pages/PrivacyPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { RoomPage } from "./pages/RoomPage.tsx";
import { setHubNavigator, useHub } from "./stores/hub.ts";
import { useSession } from "./stores/session.ts";

const PUBLIC = ["/connexion", "/confidentialite"];

export function App() {
  const { loaded, user, pending, load } = useSession();
  const [location, navigate] = useLocation();
  const search = useSearch();

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => setHubNavigator(navigate), [navigate]);

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
  if (!user && !pending && !isPublic) return <Redirect to={`/connexion?suite=${encodeURIComponent(here)}`} replace />;
  if (pending && location !== "/bienvenue" && !isPublic) return <Redirect to={`/bienvenue?suite=${encodeURIComponent(here)}`} replace />;
  if (user && (location === "/connexion" || location === "/bienvenue")) {
    const next = new URLSearchParams(search).get("suite");
    return <Redirect to={next && next.startsWith("/") ? next : "/"} replace />;
  }

  return (
    <>
      <CardDefs />
      <Switch>
        <Route path="/connexion" component={LoginPage} />
        <Route path="/bienvenue" component={OnboardingPage} />
        <Route path="/confidentialite" component={PrivacyPage} />
        <Route path="/" component={HomePage} />
        <Route path="/salon/:code">{(params) => <RoomPage key={params.code} code={params.code} />}</Route>
        <Route path="/joueur/:pseudo">{(params) => <ProfilePage pseudo={decodeURIComponent(params.pseudo)} />}</Route>
        <Route path="/classement" component={LeaderboardPage} />
        <Route path="/amis" component={FriendsPage} />
        <Route path="/compte" component={AccountPage} />
        {import.meta.env.DEV && <Route path="/dev/galerie" component={DevGallery} />}
        <Route component={NotFoundPage} />
      </Switch>
      <Toasts />
    </>
  );
}
