import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminUser } from "../api";
import { useAuth } from "../auth-context";
import NavBar from "../nav";

export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<AdminUser["role"]>("reader");
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [tempPassword, setTempPassword] = useState<{ email: string; password: string } | null>(null);

  const isAdmin = user?.role === "admin";

  const refresh = useCallback(async () => {
    try {
      setUsers(await api.adminListUsers());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Erreur de chargement");
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void refresh();
  }, [isAdmin, refresh]);

  async function createUser() {
    setError(null);
    try {
      await api.adminCreateUser(newEmail.trim(), newPassword, newRole);
      setNewEmail(""); setNewPassword("");
      setNotice(`Compte créé : ${newEmail.trim()}`);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Création impossible");
    }
  }

  async function updateUser(u: AdminUser, data: { role?: AdminUser["role"]; active?: number }) {
    setError(null);
    try {
      await api.adminUpdateUser(u.id, data);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Modification impossible");
    }
  }

  async function resetPassword(u: AdminUser) {
    setError(null);
    try {
      const { temporaryPassword } = await api.adminResetPassword(u.id);
      setTempPassword({ email: u.email, password: temporaryPassword });
      setNotice(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Réinitialisation impossible");
    }
  }

  if (!isAdmin) {
    return (
      <>
        <NavBar />
        <main style={{ padding: "2rem" }}>
          <p>Seul un administrateur peut gérer les comptes.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main style={{ maxWidth: "820px", margin: "0 auto", padding: "1rem", display: "grid", gap: "1rem" }}>
        <h1 style={{ margin: 0 }}>Comptes utilisateurs</h1>
        {error && <p role="alert" style={{ color: "#b30000", background: "#fdeaea", padding: "0.5rem 0.8rem", borderRadius: "6px", margin: 0 }}>{error}</p>}
        {notice && <p style={{ color: "#1d6b2e", background: "#e2f2e5", padding: "0.5rem 0.8rem", borderRadius: "6px", margin: 0 }}>{notice}</p>}
        {tempPassword && (
          <div style={{ background: "#fdf3d7", border: "1px solid #d9c16a", borderRadius: "8px", padding: "0.8rem" }}>
            <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>Mot de passe temporaire pour {tempPassword.email} :</p>
            <p style={{ margin: 0 }}><code style={{ fontSize: "1.1rem" }}>{tempPassword.password}</code></p>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "#666" }}>Communiquez-le de façon sécurisée — il ne sera plus affiché. Toutes les sessions de ce compte ont été révoquées.</p>
            <button onClick={() => setTempPassword(null)} style={{ marginTop: "0.5rem" }}>Fermer</button>
          </div>
        )}

        <section style={{ background: "white", borderRadius: "10px", padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.6rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Créer un compte</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input type="email" placeholder="email@entreprise.fr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ ...input, flex: 2, minWidth: "200px" }} />
            <input type="password" placeholder="Mot de passe (8+ car.)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ ...input, flex: 1, minWidth: "150px" }} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminUser["role"])} style={{ ...input, minWidth: "110px" }}>
              <option value="reader">Lecteur</option>
              <option value="author">Auteur</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={createUser} disabled={!newEmail.trim() || newPassword.length < 8} style={primaryBtn}>Créer</button>
          </div>
        </section>

        <section style={{ display: "grid", gap: "0.5rem" }}>
          {users.map((u) => (
            <div key={u.id} style={{ background: "white", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", opacity: u.active === 0 ? 0.55 : 1 }}>
              <span style={{ fontWeight: 600, minWidth: "180px" }}>{u.email}</span>
              <select
                value={u.role}
                onChange={(e) => updateUser(u, { role: e.target.value as AdminUser["role"] })}
                disabled={u.id === user?.id}
                style={{ ...input, minWidth: "100px" }}
                aria-label={`Rôle de ${u.email}`}
              >
                <option value="reader">Lecteur</option>
                <option value="author">Auteur</option>
                <option value="admin">Admin</option>
              </select>
              {u.auth_provider === "oidc" && <span style={{ fontSize: "0.8rem", color: "#7b16c9" }}>SSO</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {u.active === 0 && <span style={{ fontSize: "0.8rem", color: "#b30000" }}>désactivé</span>}
                {u.auth_provider !== "oidc" && (
                  <button onClick={() => resetPassword(u)} style={secondaryBtn}>Réinitialiser le mot de passe</button>
                )}
                {u.id !== user?.id && (
                  u.active === 1
                    ? <button onClick={() => updateUser(u, { active: 0 })} style={secondaryBtn}>Désactiver</button>
                    : <button onClick={() => updateUser(u, { active: 1 })} style={secondaryBtn}>Réactiver</button>
                )}
              </span>
            </div>
          ))}
        </section>

        {confirmDelete && <p>{confirmDelete.email}</p>}
      </main>
    </>
  );
}

const input: React.CSSProperties = { padding: "0.5rem", borderRadius: "6px", border: "1px solid #c9ccd3", fontSize: "0.95rem" };
const primaryBtn: React.CSSProperties = { padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "#1f4e9c", color: "white" };
const secondaryBtn: React.CSSProperties = { padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid #c9ccd3", background: "white", fontSize: "0.85rem" };
