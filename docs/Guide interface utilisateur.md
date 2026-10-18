# Guide complet UI/UX — Tailwind CSS + shadcn/ui

Guide de bonnes pratiques pour une application web responsive (mobile / tablette / PC), orienté développeur sans compétence design préalable.

---

## 1. Principes fondamentaux

### 1.1 Responsive design (mobile-first)

Concevoir **d'abord pour mobile**, puis élargir. En CSS, cela signifie écrire le style de base pour petit écran et ajouter des surcharges pour les écrans plus grands.

**Breakpoints Tailwind** (intégrés, rien à configurer) :

| Breakpoint | Largeur | Cible typique |
|---|---|---|
| (défaut) | < 640px | Mobile |
| `sm:` | ≥ 640px | Grand mobile |
| `md:` | ≥ 768px | Tablette |
| `lg:` | ≥ 1024px | PC portable |
| `xl:` | ≥ 1280px | Grand écran |
| `2xl:` | ≥ 1536px | Très grand écran |

**Comment agir dans le code :**

```html
<!-- Base = mobile. Grille 1 colonne, puis 2, puis 4 -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  ...
</div>

<!-- Masquer / afficher selon la taille -->
<nav class="hidden md:flex gap-4">...</nav>          <!-- menu PC -->
<button class="md:hidden" aria-label="Ouvrir le menu">☰</button> <!-- mobile -->
```

**Règles d'or :**
- Toujours utiliser les unités relatives (`rem`, `%`, `vw`, `clamp()`) plutôt que des `px` fixes pour les tailles de police et largeurs.
- Utiliser `max-w-*` sur les conteneurs de contenu pour éviter des lignes de texte trop longues sur grand écran (70–80 caractères max).
- Flexbox (`flex`) pour les alignements 1D, CSS Grid (`grid`) pour les mises en page 2D.



```html
<!-- Conteneur principal typique -->
<main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  ...
</main>
```

### 1.2 Accessibilité (WCAG 2.2)

Cadre de référence international. En France, le RGAA est la transposition légale (obligatoire pour les services publics).

**Les règles non négociables :**
- **Contraste** texte/fond ≥ 4.5:1 (3:1 pour les textes volumineux ≥ 24px). Les palettes shadcn/ui sont conformes par défaut.
- **Zone tactile** ≥ 44×44 px (Apple) / 48×48 dp (Google). shadcn/ui respecte déjà ces minima sur ses boutons.
- **Navigation clavier** : tout doit être accessible au clavier (Tab, Entrée, Échap). Ne jamais supprimer les `focus` rings (`focus-visible:`).
- **HTML sémantique** : `header`, `nav`, `main`, `section`, `footer`, `<button>` pour les actions, `<a>` pour la navigation. Jamais de `<div>` cliquable sans rôle.
- **Images** : attribut `alt` descriptif, ou `alt=""` si purement décorative.
- **Formulaires** : chaque champ a un `<Label>` lié, les erreurs sont annoncées (`aria-describedby`, `aria-invalid`).

**Comment agir dans le code :**

```tsx
// ❌ Mauvais
<div onClick={handleSave} class="cursor-pointer">Enregistrer</div>
<img src="plat.jpg">

// ✅ Bon
<Button onClick={handleSave}>Enregistrer</Button>
<img src="plat.jpg" alt="Plat de pâtes au pesto pour 4 personnes" />
```

shadcn/ui gère déjà l'essentiel (`aria-*`, focus, rôles) dans ses composants — c'est son principal intérêt. Utilise les composants plutôt que du HTML fait main.

**Outils de vérification :** l'onglet *Lighthouse > Accessibility* de Chrome DevTools, ou l'extension axe DevTools.

### 1.3 Performance

- Objectif : **chargement < 3 s** sur mobile moyen. Au-delà, ~50 % des visiteurs partent.
- Budget indicatif : < 170 KB de JS compressé pour le chemin critique.
- Optimisations clés :
  - Images : formats WebP/AVIF, dimensions exactes (`width`/`height` pour éviter le layout shift), `loading="lazy"` hors zone visible.
  - Polices : max 2 familles, `font-display: swap`, ou polices système.
  - Code-splitting par route (React.lazy / dynamic import de Next.js).
- **Métriques Core Web Vitals** (Google) : LCP < 2.5 s, INP < 200 ms, CLS < 0.1.

**Comment agir dans le code :**

```tsx
// Chargement différé d'une page lourde (Next.js / React)
const Planning = lazy(() => import("./pages/Planning"));

// Image optimisée
<img src="/plats/pates.webp" width={640} height={480} loading="lazy"
     alt="Pâtes au pesto" className="rounded-xl object-cover" />
```

---

## 2. Design system : les standards

### 2.1 Deux références, choisis-en une

- **Material Design 3** (Google) — standard Android/Web, très documenté.
- **Human Interface Guidelines** (Apple) — standard iOS/macOS.

shadcn/ui s'inspire largement de Radix + Tailwind avec une esthétique neutre proche de ces deux systèmes. **La cohérence interne prime sur l'originalité** : mieux vaut une app sobre et cohérente qu'une app originale et confuse.

### 2.2 Le pattern des design tokens

Un *token* est une variable sémantique (ex. `--color-primary`, `--spacing-md`) qui centralise une décision de design. Modifier le token change toute l'application.

**Dans Tailwind + shadcn/ui, les tokens vivent dans `globals.css` :**

```css
/* globals.css — thème généré par shadcn/ui */
:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --primary: 346 77% 49%;        /* ex. rouge culinaire pour une app repas */
  --primary-foreground: 0 0% 98%;
  --muted: 240 4.8% 95.9%;
  --radius: 0.75rem;
}

.dark {
  --background: 20 14.3% 4.1%;
  --foreground: 0 0% 95%;
  --primary: 346 77% 55%;
  ...
}
```

Ces variables alimentent automatiquement les utilitaires Tailwind : `bg-primary`, `text-foreground`, `border-border`… **Toute personnalisation passe par ces variables, jamais par des couleurs en dur dans les composants.**

```tsx
// ❌ Couleur en dur, ignore le thème sombre
<button className="bg-red-500 text-white">Valider</button>

// ✅ Utilise le token, s'adapte au mode sombre
<Button>Valider</Button>
// ou en Tailwind : className="bg-primary text-primary-foreground"
```

### 2.3 Mode sombre

Attendu par défaut aujourd'hui. Tailwind le rend quasi gratuit :

```tsx
// Classes conditionnelles
<div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
```

Pour basculer le thème, la méthode standard avec Tailwind v4 est d'ajouter la classe `dark` sur `<html>` :

```tsx
// Hook de bascule (à stocker en localStorage)
useEffect(() => {
  document.documentElement.classList.toggle("dark", isDark);
}, [isDark]);
```

shadcn/ui expose aussi un composant `DropdownMenu` avec l'option préconçue dans sa documentation.

---

## 3. Typographie, couleurs, espacement

### 3.1 Typographie

- **Max 2 polices** : une pour les titres, une pour le corps (souvent une seule suffit). Inter, system-ui ou une police variable sont d'excellents choix par défaut.
- **Taille de base 16px** (1rem) : plus petit est illisible sur mobile.
- **Hiérarchie par paliers** — Tailwind fournit l'échelle : `text-sm` (14px), `text-base` (16), `text-lg` (18), `text-xl` (20), `text-2xl` (24), etc.
- **Longueur de ligne** : 45–75 caractères. Utilise `max-w-prose` (65 caractères).

```tsx
<article className="max-w-prose">
  <h1 className="text-2xl md:text-4xl font-bold tracking-tight">Titre</h1>
  <p className="mt-3 text-base leading-relaxed text-muted-foreground">
    Texte de corps, interligne aéré pour la lecture.
  </p>
</article>
```

- Astuce responsive en une classe : `text-[clamp(1.5rem,4vw,2.5rem)]`.

### 3.2 Couleurs

- Palette limitée : **1 primaire, 1 accent, des neutres**. Règle 60-30-10 (60 % neutre, 30 % primaire, 10 % accent).
- Sémantique plutôt qu'esthétique : `destructive` pour les erreurs, `success`/`warning` à définir, jamais de rouge juste "parce que c'est joli".
- shadcn/ui fournit : `primary`, `secondary`, `muted`, `accent`, `destructive`, `background`, `foreground` + les paires `*-foreground` associées.

### 3.3 Espacement

- **Échelle de 4px** (standard Tailwind) : `p-1`=4px, `p-2`=8px, `p-4`=16px, `p-6`=24px, `p-8`=32px. Jamais de valeurs arbitraires.
- Rythme vertical constant : les éléments frères partagent le même `gap` ou `space-y-*`.
- Plus d'espace entre les sections qu'à l'intérieur d'une section (loi de proximité de Gestalt) : `space-y-4` interne, `space-y-12` entre sections.

```tsx
<section className="space-y-12">
  <div className="space-y-3">   {/* groupe serré = éléments liés */}
    <h2 className="text-xl font-semibold">Recettes de la semaine</h2>
    <p className="text-muted-foreground">Gérez vos plats favoris</p>
  </div>
  <div className="grid gap-4 md:grid-cols-3">...</div>
</section>
```

---

## 4. shadcn/ui en pratique

### 4.1 Comment ça marche

shadcn/ui n'est **pas une librairie npm** : chaque composant est **copié dans ton projet** via une CLI, tu en deviens propriétaire et peux le modifier.

```bash
npx shadcn@latest init          # configure les chemins, les tokens
npx shadcn@latest add button card dialog dropdown-menu \
  input label table tabs toast  # ajoute les composants
```

Les fichiers arrivent dans `src/components/ui/`. Tu peux les ouvrir, les lire, les adapter.

### 4.2 Composition d'un écran type

Exemple : une page de planification des repas.

```tsx
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Planning() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* En-tête : titre + action principale unique */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planning de la semaine</h1>
          <p className="text-muted-foreground">Semaine du 5 au 11 octobre</p>
        </div>
        <Button size="lg" className="sm:ml-auto">
          Ajouter un repas
        </Button>
      </div>

      {/* Contenu responsive */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
        {jours.map((j) => (
          <Card key={j.nom} className="flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {j.nom}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1">
              <p className="font-medium">{j.repas ?? "—"}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
```

### 4.3 Les variantes : l'API de ton design system

Chaque composant shadcn expose des **variantes** — c'est ainsi qu'on garde la cohérence sans réinventer :

```tsx
<Button>                  {/* variant="default" → primaire */}
<Button variant="secondary">Annuler</Button>
<Button variant="outline">Filtrer</Button>
<Button variant="destructive">Supprimer</Button>
<Button variant="ghost" size="sm">Voir</Button>
<Button variant="link">Mot de passe oublié ?</Button>

<Input disabled />        {/* état désactivé géré automatiquement */}
<Badge variant="outline">Nouveau</Badge>
```

**Règle : un seul bouton primaire par écran.** Les actions secondaires en `outline` ou `ghost`, les actions dangereuses en `destructive` (et idéalement derrière une confirmation `Dialog`).

### 4.4 Composants à connaître par situation

| Besoin | Composant |
|---|---|
| Formulaire | `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`, `Switch`, `Label`, `FormField` |
| Confirmation d'action | `Dialog`, `AlertDialog` |
| Action rapide sur ligne | `DropdownMenu` (menu ⋯) |
| Navigation | `Tabs`, `NavigationMenu`, `Sidebar`, `Breadcrumb` |
| Feedback | `Toast` / `Sonner`, `Alert` |
| Chargement | `Skeleton` |
| Listes riches | `Table`, `Card`, `Avatar` |
| Filtres/paramètres | `Toggle`, `ToggleGroup`, `Accordion` |
| Choix de date | `Calendar`, `DatePicker` |

### 4.5 États d'une interface

Chaque écran doit traiter **4 états**, sinon l'app paraît cassée :

```tsx
// 1. Chargement — skeletons, pas de spinner plein écran
{isLoading && (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-7">
    {Array.from({ length: 7 }).map((_, i) => (
      <Skeleton key={i} className="h-40 rounded-xl" />
    ))}
  </div>
)}

// 2. Vide — expliquer quoi faire
{!isLoading && repas.length === 0 && (
  <Card className="border-dashed">
    <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
      <p className="font-medium">Aucun repas planifié</p>
      <p className="text-sm text-muted-foreground">Ajoutez votre premier repas pour commencer.</p>
      <Button>Ajouter un repas</Button>
    </CardContent>
  </Card>
)}

// 3. Erreur — actionnable
// 4. Données — l'affichage normal
```

---

## 5. Interaction et ergonomie mobile

### 5.1 Zones tactiles et habillage

- Cibles ≥ 44×44 px : les boutons shadcn respectent déjà les minima (`h-10` = 40px, ajoute `size="lg"`/`h-11` sur mobile si besoin).
- Éviter les survols comme seule source d'information (n'existe pas au doigt). Les tooltips sont du bonus, jamais de l'info critique.

### 5.2 Navigation

- **Mobile** : barre de navigation basse ou menu hamburger (composant `Sheet`/`Drawer`).
- **PC** : navigation latérale (`Sidebar` shadcn) ou barre haute.
- **Jamais plus de 3 niveaux** de profondeur : au-delà, les utilisateurs se perdent.

```tsx
<Sheet>
  <SheetTrigger asChild>
    <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
      <MenuIcon />
    </Button>
  </SheetTrigger>
  <SheetContent side="left">...</SheetContent>
</Sheet>
```

### 5.3 Formulaires

- Une seule colonne sur mobile (jamais deux colonnes de champs sur petit écran).
- Labels **au-dessus** des champs, pas en placeholder (le placeholder disparaît à la saisie).
- Validation inline au `blur`, message sous le champ, résumé accessible.
- `inputMode="decimal"` / `type="email"` / `autoComplete` pour les claviers adaptés et l'autofill.

```tsx
<div className="space-y-2">
  <Label htmlFor="email">Adresse e-mail</Label>
  <Input id="email" type="email" autoComplete="email" inputMode="email" />
  <p className="text-sm text-destructive" role="alert">Adresse invalide</p>
</div>
```

### 5.4 Feedback immédiat

- Toute action doit répondre en < 100 ms perceptible : bouton en état `disabled` + icône de spinner pendant l'appel réseau, puis `toast` de confirmation.
- Animations : courtes (150–300 ms), uniquement pour aider la compréhension. Tailwind fournit `animate-in fade-in slide-in-from-bottom-4` (via tailwindcss-animate).

```tsx
<Button disabled={isSubmitting}>
  {isSubmitting && <Loader2 className="mr-2 size-4 animate-spin" />}
  Enregistrer
</Button>
```

---

## 6. Checklist qualité avant mise en ligne

- [ ] Testé à 360px, 768px, 1024px et 1440px de large (DevTools > responsive).
- [ ] Navigable 100 % au clavier (test Tab/Shift+Tab).
- [ ] Contrastes vérifiés (Lighthouse Accessibility ≥ 95).
- [ ] Mode sombre cohérent partout.
- [ ] Chaque écran gère chargement / vide / erreur / données.
- [ ] Images avec `alt`, dimensions, formats WebP, `loading="lazy"`.
- [ ] Lighthouse Performance ≥ 90 sur mobile.
- [ ] Un seul bouton primaire par écran.
- [ ] Espacement cohérent sur l'échelle 4px, palette limitée aux tokens.
- [ ] Test réel sur un vrai téléphone.

---

## 7. Références

- Tailwind CSS — documentation : https://tailwindcss.com/docs
- shadcn/ui — composants et exemples : https://ui.shadcn.com
- Material Design 3 : https://m3.material.io
- Apple Human Interface Guidelines : https://developer.apple.com/design/human-interface-guidelines
- WCAG 2.2 : https://www.w3.org/TR/WCAG22
- RGAA (accessibilité, France) : https://accessibilite.numerique.gouv.fr
- Core Web Vitals : https://web.dev/articles/vitals
- Laws of UX (psychologie appliquée) : https://lawsofux.com