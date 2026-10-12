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
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  // C-48 : fenêtre d'édition complète d'un compte (Prénom/Nom + rôle + actif)
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editRole, setEditRole] = useState<AdminUser["role"]>("reader");
  const [editActive, setEditActive] = useState(1);
  // fermeture Échap de la modale
  useEffect(() => {
    if (!editUser) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditUser(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editUser]);

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
      await api.adminCreateUser(newEmail.trim(), newPassword, newRole, newFirstName, newLastName);
      setNewEmail(""); setNewPassword(""); setNewFirstName(""); setNewLastName("");
      setNotice(`Compte créé : ${newFirstName.trim() || newLastName.trim() ? `${newFirstName.trim()} ${newLastName.trim()}`.trim() : newEmail.trim()}`);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Création impossible");
    }
  }

  async function saveEdit() {
    if (!editUser) return;
    setError(null);
    try {
      await updateUser(editUser, {
        first_name: editFirstName.trim(),
        last_name: editLastName.trim(),
        role: editRole,
        ...(editUser.id !== user?.id ? { active: editActive } : {}),
      });
      setEditUser(null);
      setNotice(`Compte mis à jour : ${editFirstName.trim() || editLastName.trim() ? `${editFirstName.trim()} ${editLastName.trim()}`.trim() : editUser.email}`);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Mise à jour impossible");
    }
  }

  async function updateUser(u: AdminUser, data: { role?: AdminUser["role"]; active?: number; first_name?: string; last_name?: string }) {
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
        <h1 style={{ margin: 0, fontSize: "1.05rem" }}>Comptes utilisateurs</h1>
        {error && <p role="alert" style={{ color: "var(--error-text)", background: "var(--error-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px", margin: 0 }}>{error}</p>}
        {notice && <p style={{ color: "var(--ok-text)", background: "var(--ok-bg)", padding: "0.5rem 0.8rem", borderRadius: "6px", margin: 0 }}>{notice}</p>}
        {tempPassword && (
          <div style={{ background: "var(--warn-bg)", border: "1px solid var(--warn-text)", borderRadius: "8px", padding: "0.8rem" }}>
            <p style={{ margin: "0 0 0.4rem", fontWeight: 600 }}>Mot de passe temporaire pour {tempPassword.email} :</p>
            <p style={{ margin: 0 }}><code style={{ fontSize: "1.1rem" }}>{tempPassword.password}</code></p>
            <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>Communiquez-le de façon sécurisée — il ne sera plus affiché. Toutes les sessions de ce compte ont été révoquées.</p>
            <button onClick={() => setTempPassword(null)} style={{ marginTop: "0.5rem" }}>Fermer</button>
          </div>
        )}

        <section style={{ background: "var(--surface)", borderRadius: "10px", padding: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "grid", gap: "0.6rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Créer un compte</h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <input type="text" placeholder="Prénom" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} style={{ ...input, flex: "1 1 7rem" }} aria-label="Prénom" />
            <input type="text" placeholder="Nom" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} style={{ ...input, flex: "1 1 7rem" }} aria-label="Nom" />
            <input type="email" placeholder="email@entreprise.fr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ ...input, flex: "2 1 10rem" }} />
            <input type="password" placeholder="Mot de passe (8+ car.)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={{ ...input, flex: "1 1 8rem" }} />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminUser["role"])} style={{ ...input, flex: "1 1 6rem" }}>
              <option value="reader">Lecteur</option>
              <option value="author">Auteur</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={createUser} disabled={!newEmail.trim() || newPassword.length < 8} style={primaryBtn}>Créer</button>
          </div>
        </section>

        <section style={{ display: "grid", gap: "0.5rem" }}>
          {users.map((u) => (
            <div key={u.id} style={{ background: "var(--surface)", borderRadius: "10px", padding: "0.8rem 1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap", opacity: u.active === 0 ? 0.55 : 1 }}>
              <span style={{ fontWeight: 600, flex: "1 1 10rem", overflowWrap: "anywhere", display: "flex", gap: "0.4rem", alignItems: "baseline", minWidth: 0 }}>
                <span style={{ overflowWrap: "anywhere" }}>{[u.first_name, u.last_name].filter(Boolean).join(" ") || <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(sans nom)</span>}</span>
                <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: "0.8rem" }}>({u.email})</span>
                <button
                  onClick={() => {
                    setEditUser(u);
                    setEditFirstName(u.first_name ?? "");
                    setEditLastName(u.last_name ?? "");
                    setEditRole(u.role);
                    setEditActive(u.active);
                  }}
                  aria-label={`Modifier le compte ${u.email}`}
                  title="Modifier le compte (Prénom, Nom, rôle, activation)"
                  style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", padding: "0 0.2rem", fontSize: "0.9rem", flexShrink: 0 }}
                >✎</button>
              </span>
              <select
                value={u.role}
                onChange={(e) => updateUser(u, { role: e.target.value as AdminUser["role"] })}
                disabled={u.id === user?.id}
                style={{ ...input, flex: "1 1 6rem" }}
                aria-label={`Rôle de ${u.email}`}
              >
                <option value="reader">Lecteur</option>
                <option value="author">Auteur</option>
                <option value="admin">Admin</option>
              </select>
              {u.auth_provider === "oidc" && <span style={{ fontSize: "0.8rem", color: "#7b16c9" }}>SSO</span>}
              <span style={{ marginLeft: "auto", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                {u.active === 0 && <span style={{ fontSize: "0.8rem", color: "var(--error-text)" }}>désactivé</span>}
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

        {/* C-48 : fenêtre d'édition complète du compte */}
        {editUser && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Modifier le compte ${editUser.email}`}
            onClick={() => setEditUser(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: "var(--surface)", borderRadius: "12px", boxShadow: "0 10px 40px rgba(0,0,0,0.3)", padding: "1.2rem", width: "100%", maxWidth: "26rem", display: "grid", gap: "0.7rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <h2 style={{ margin: 0, fontSize: "1.05rem", flex: 1 }}>Modifier le compte</h2>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem", overflowWrap: "anywhere" }}>{editUser.email}</span>
              </div>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Prénom
                <input value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} style={input} placeholder="Prénom" />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Nom
                <input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} style={input} placeholder="Nom" />
              </label>
              <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
                Rôle
                <select value={editRole} onChange={(e) => setEditRole(e.target.value as AdminUser["role"])} style={input} disabled={editUser.id === user?.id}>
                  <option value="reader">Lecteur</option>
                  <option value="author">Auteur</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              {editUser.id !== user?.id && (
                <label style={{ display: "flex", gap: "0.4rem", alignItems: "center", fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={editActive === 1} onChange={(e) => setEditActive(e.target.checked ? 1 : 0)} />
                  Compte actif
                </label>
              )}
              {error && <p role="alert" style={{ margin: 0, color: "var(--error-text)", background: "var(--error-bg)", padding: "0.4rem 0.6rem", borderRadius: "6px", fontSize: "0.85rem" }}>{error}</p>}
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "end" }}>
                <button onClick={() => setEditUser(null)} style={secondaryBtn}>Annuler</button>
                <button onClick={() => void saveEdit()} style={primaryBtn}>Enregistrer</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

const input: React.CSSProperties = { padding: "0.5rem", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "0.95rem" };
const primaryBtn: React.CSSProperties = { padding: "0.5rem 1rem", borderRadius: "6px", border: "none", background: "var(--accent)", color: "white" };
const secondaryBtn: React.CSSProperties = { padding: "0.4rem 0.7rem", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: "0.85rem" };
