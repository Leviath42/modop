import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./auth-context";

export default function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <nav
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.6rem 1rem",
        background: "#1f4e9c",
        color: "white",
        flexWrap: "wrap",
      }}
    >
      <Link to="/" style={{ color: "white", fontWeight: 700, textDecoration: "none" }}>
        Modop
      </Link>
      <span style={{ opacity: 0.85, fontSize: "0.9rem" }}>{user.email}</span>
      <span style={{ opacity: 0.7, fontSize: "0.8rem" }}>({user.role})</span>
      <button
        onClick={async () => {
          await logout();
          navigate("/login");
        }}
        style={{ marginLeft: "auto", ...logoutStyle }}
      >
        Déconnexion
      </button>
    </nav>
  );
}

const logoutStyle: React.CSSProperties = {
  padding: "0.35rem 0.8rem",
  borderRadius: "6px",
  border: "1px solid white",
  background: "transparent",
  color: "white",
};
