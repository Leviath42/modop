import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type AdminUser } from "../api";
import { useAuth } from "../auth-context";
import { cn } from "../lib/utils";
import NavBar from "../nav";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardHeader, CardTitle } from "../components/ui/card";
import { Input, Label, Select } from "../components/ui/input";
import { Modal } from "../components/ui/dialog";
import { Pencil } from "lucide-react";

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
        <main className="p-8">
          <p>Seul un administrateur peut gérer les comptes.</p>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar />
      <main className="mx-auto grid max-w-[820px] grid-cols-1 gap-4 p-4">
        <h1 className="text-lg font-semibold tracking-tight">Comptes utilisateurs</h1>
        {error && <p role="alert" className="m-0 rounded-md bg-error-bg px-3 py-2 text-sm text-error break-words">{error}</p>}
        {notice && <p className="m-0 rounded-md bg-ok-bg px-3 py-2 text-sm text-ok break-words">{notice}</p>}
        {tempPassword && (
          <div className="rounded-md border border-warn bg-warn-bg p-3">
            <p className="m-0 mb-1.5 font-semibold break-words">Mot de passe temporaire pour {tempPassword.email} :</p>
            <p className="m-0"><code className="text-lg">{tempPassword.password}</code></p>
            <p className="m-0 mt-1.5 text-sm text-muted-foreground break-words">Communiquez-le de façon sécurisée — il ne sera plus affiché. Toutes les sessions de ce compte ont été révoquées.</p>
            <Button variant="outline" size="sm" onClick={() => setTempPassword(null)} className="mt-2">Fermer</Button>
          </div>
        )}

        <Card>
          <CardHeader className="gap-2 px-4 py-3 sm:px-4 sm:py-3">
            <CardTitle>Créer un compte</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Input type="text" placeholder="Prénom" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} className="min-w-0 flex-[1_1_7rem]" aria-label="Prénom" />
              <Input type="text" placeholder="Nom" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} className="min-w-0 flex-[1_1_7rem]" aria-label="Nom" />
              <Input type="email" placeholder="email@entreprise.fr" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="min-w-0 flex-[2_1_10rem]" />
              <Input type="password" placeholder="Mot de passe (8+ car.)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="min-w-0 flex-[1_1_8rem]" />
              <Select value={newRole} onChange={(e) => setNewRole(e.target.value as AdminUser["role"])} className="min-w-0 flex-[1_1_6rem]">
                <option value="reader">Lecteur</option>
                <option value="author">Auteur</option>
                <option value="admin">Admin</option>
              </Select>
              <Button onClick={createUser} disabled={!newEmail.trim() || newPassword.length < 8}>Créer</Button>
            </div>
          </CardHeader>
        </Card>

        <section className="grid gap-2">
          {users.map((u) => (
            /* C-70 : rangée en 3 lignes lisibles — nom / email / actions —
               plus de boutons géants qui étouffent le texte. */
            <Card key={u.id} className={cn("grid gap-1.5 px-4 py-2.5", u.active === 0 && "opacity-55")}>
              <div className="flex min-w-0 items-center gap-2">
                <span className="m-0 min-w-0 flex-1 font-semibold break-words">
                  {[u.first_name, u.last_name].filter(Boolean).join(" ") || <span className="font-normal text-muted-foreground">(sans nom)</span>}
                </span>
                {u.auth_provider === "oidc" && <span className="shrink-0 text-xs text-cat-indigo">SSO</span>}
                {u.active === 0 && <Badge variant="error">désactivé</Badge>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditUser(u);
                    setEditFirstName(u.first_name ?? "");
                    setEditLastName(u.last_name ?? "");
                    setEditRole(u.role);
                    setEditActive(u.active);
                  }}
                  aria-label={`Modifier le compte ${u.email}`}
                  title="Modifier le compte (Prénom, Nom, rôle, activation)"
                  className="h-7 w-7 shrink-0"
                ><Pencil size={14} aria-hidden="true" /></Button>
              </div>
              <p className="m-0 min-w-0 text-xs text-muted-foreground break-words">{u.email}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                <Select
                  value={u.role}
                  onChange={(e) => updateUser(u, { role: e.target.value as AdminUser["role"] })}
                  disabled={u.id === user?.id}
                  className="h-9 w-auto min-w-0 flex-[0_1_7rem]"
                  aria-label={`Rôle de ${u.email}`}
                >
                  <option value="reader">Lecteur</option>
                  <option value="author">Auteur</option>
                  <option value="admin">Admin</option>
                </Select>
                <span className="ml-auto flex flex-wrap items-center gap-1.5">
                  {u.auth_provider !== "oidc" && (
                    <Button variant="outline" size="sm" onClick={() => resetPassword(u)} title="Réinitialiser le mot de passe (un mot de passe temporaire sera affiché)">Réinit. mdp</Button>
                  )}
                  {u.id !== user?.id && (
                    u.active === 1
                      ? <Button variant="destructive" size="sm" onClick={() => updateUser(u, { active: 0 })}>Désactiver</Button>
                      : <Button variant="outline" size="sm" onClick={() => updateUser(u, { active: 1 })}>Réactiver</Button>
                  )}
                </span>
              </div>
            </Card>
          ))}
        </section>

        {/* C-48 : fenêtre d'édition complète du compte — fermeture Échap +
            clic fond gérées par le composant Modal */}
        {editUser && (
          <Modal
            open
            onClose={() => setEditUser(null)}
            title="Modifier le compte"
            footer={
              <>
                <Button variant="outline" onClick={() => setEditUser(null)}>Annuler</Button>
                <Button onClick={() => void saveEdit()}>Enregistrer</Button>
              </>
            }
          >
            <div className="grid gap-3">
              <p className="m-0 text-sm text-muted-foreground break-words">{editUser.email}</p>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-first-name">Prénom</Label>
                <Input id="edit-first-name" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="Prénom" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-last-name">Nom</Label>
                <Input id="edit-last-name" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Nom" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit-role">Rôle</Label>
                <Select id="edit-role" value={editRole} onChange={(e) => setEditRole(e.target.value as AdminUser["role"])} disabled={editUser.id === user?.id}>
                  <option value="reader">Lecteur</option>
                  <option value="author">Auteur</option>
                  <option value="admin">Admin</option>
                </Select>
              </div>
              {editUser.id !== user?.id && (
                <label htmlFor="edit-active" className="flex items-center gap-2 text-sm">
                  <input id="edit-active" type="checkbox" checked={editActive === 1} onChange={(e) => setEditActive(e.target.checked ? 1 : 0)} />
                  Compte actif
                </label>
              )}
              {error && <p role="alert" className="m-0 rounded-md bg-error-bg px-2.5 py-2 text-sm text-error break-words">{error}</p>}
            </div>
          </Modal>
        )}
      </main>
    </>
  );
}
