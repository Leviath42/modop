# Palette de couleurs — Identité visuelle

Ce document définit la palette de couleurs à utiliser dans le projet.
Il ne contient que les couleurs ; logos, typographies et autres éléments graphiques seront traités séparément.

## Couleurs principales

| Nom | HEX | RGB | Pantone | Usage |
|---|---|---|---|---|
| Bleu-gris | `#517485` | 81, 116, 133 | 5405 C | Couleur primaire |
| Orange | `#e84e0f` | 232, 78, 15 | 1655 C | Accent principal |
| Bleu-gris clair | `#96a9b1` | 150, 169, 177 | 5405 C à 60 % | Fonds et surfaces secondaires |
| Anthracite | `#2c3a43` | 44, 58, 67 | 432 C | Texte / contraste |

## Couleurs complémentaires

À utiliser avec parcimonie (catégories, états, illustrations) :

| Nom | HEX | RGB | Pantone |
|---|---|---|---|
| Jaune | `#d8da00` | 216, 218, 0 | 381 C |
| Vert | `#65b32e` | 101, 179, 46 | 361 C |
| Turquoise | `#38b6ab` | 56, 182, 171 | 3265 C |
| Bleu vif | `#008ed5` | 0, 142, 213 | Process Blue C |
| Indigo | `#4d55a2` | 78, 85, 162 | 2726 C |
| Rose | `#c24f97` | 194, 79, 151 | 674 C |

## Règles d'usage

- Le bleu-gris et l'orange sont les couleurs de référence : toute interface doit avant tout les utiliser.
- Les couleurs complémentaires ne doivent jamais dominer ; elles servent à différencier des catégories ou des états.
- Assurer un contraste suffisant pour l'accessibilité, notamment le texte sur fond orange ou jaune.

## Variables CSS suggérées

```css
:root {
  /* Couleurs principales */
  --color-primary: #517485;
  --color-accent: #e84e0f;
  --color-secondary: #96a9b1;
  --color-dark: #2c3a43;

  /* Couleurs complémentaires */
  --color-yellow: #d8da00;
  --color-green: #65b32e;
  --color-teal: #38b6ab;
  --color-blue: #008ed5;
  --color-indigo: #4d55a2;
  --color-pink: #c24f97;
}
```
