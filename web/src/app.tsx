import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth-context";

import LoginPage from "./pages/login";
import ListPage from "./pages/list";
import ReaderPage from "./pages/reader";
import EditorPage from "./pages/editor";
import DeployPage from "./pages/deploy";
import AdminPage from "./pages/admin";
import ErrorPage from "./pages/error";
import QrPage from "./pages/qr";
import GuidedReaderPage from "./pages/guided-reader";
import FeedbacksPage from "./pages/feedbacks";
import StatsPage from "./pages/stats";

function RequireAuth({ children, min }: { children: React.ReactNode; min?: "reader" | "author" }) {
  const { user, loading } = useAuth();
  if (loading) return <p>Chargement…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (min === "author" && user.role === "reader") return <ErrorPage code="403" message="Rôle insuffisant" />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RequireAuth><ListPage /></RequireAuth>} />
          <Route path="/workflow/:id/read" element={<RequireAuth><ReaderPage /></RequireAuth>} />
          <Route path="/workflow/:id/qr" element={<RequireAuth><QrPage /></RequireAuth>} />
          <Route path="/workflow/:id/guided" element={<RequireAuth><GuidedReaderPage /></RequireAuth>} />
          <Route path="/workflow/:id/feedbacks" element={<RequireAuth min="author"><FeedbacksPage /></RequireAuth>} />
          <Route path="/stats" element={<RequireAuth><StatsPage /></RequireAuth>} />
          <Route path="/workflow/:id/edit" element={<RequireAuth min="author"><EditorPage /></RequireAuth>} />
          <Route path="/deploy" element={<RequireAuth><DeployPage /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><AdminPage /></RequireAuth>} />
          <Route path="*" element={<ErrorPage code="404" message="Page introuvable" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
