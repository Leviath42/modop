export interface DocumentTemplate {
  id: string;
  name: string;
  description: string;
  steps: {
    title: string;
    body: string;
  }[];
}

export const DOCUMENT_TEMPLATES: DocumentTemplate[] = [
  {
    id: 'mode-reaction',
    name: 'Mode de réaction',
    description: 'Processus de réaction aux non-conformités',
    steps: [
      {
        title: 'Détection de non-conformité',
        body: 'Identifier et signaler toute non-conformité détectée.'
      },
      {
        title: 'Confinement du lot',
        body: 'Isoler le lot concerné pour éviter toute propagation.'
      },
      {
        title: 'Information hiérarchie + qualité',
        body: 'Informer immédiatement la hiérarchie et le service qualité.'
      },
      {
        title: 'Décision',
        body: 'Prendre une décision sur le sort du lot : tri, rebut ou déviation.'
      },
      {
        title: 'Tracabilité',
        body: 'Documenter toutes les actions prises pour assurer la traçabilité.'
      },
      {
        title: 'Retour à la normale',
        body: 'Mettre en place les mesures nécessaires pour revenir à un état normal.'
      }
    ]
  },
  {
    id: 'tableau',
    name: 'Tableau',
    description: 'Tableau d\'instructions ligne à ligne',
    steps: [
      {
        title: 'Étape 1',
        body: 'Description de la première étape du processus.'
      },
      {
        title: 'Étape 2',
        body: 'Description de la deuxième étape du processus.'
      },
      {
        title: 'Étape 3',
        body: 'Description de la troisième étape du processus.'
      },
      {
        title: 'Étape 4',
        body: 'Description de la quatrième étape du processus.'
      },
      {
        title: 'Étape 5',
        body: 'Description de la cinquième étape du processus.'
      },
      {
        title: 'Étape 6',
        body: 'Description de la sixième étape du processus.'
      }
    ]
  },
  {
    id: 'enregistrements',
    name: 'Enregistrements',
    description: 'Instructions pour les enregistrements qualité',
    steps: [
      {
        title: 'Paraphes',
        body: 'Assurer que tous les documents sont correctement paraphes.'
      },
      {
        title: 'Dates',
        body: 'Vérifier que toutes les dates sont correctement enregistrées.'
      },
      {
        title: 'Conservations',
        body: 'Assurer le bon stockage des documents conformément aux réglementations.'
      },
      {
        title: 'Archivage',
        body: 'Archiver les documents selon les procédures établies.'
      }
    ]
  },
  {
    id: 'fit',
    name: 'FIT',
    description: 'Fiche d\'identité d\'un poste/équipement',
    steps: [
      {
        title: 'Désignation',
        body: 'Identifier le poste ou l\'équipement.'
      },
      {
        title: 'Paramètres de réglage',
        body: 'Documenter les paramètres de réglage nécessaires.'
      },
      {
        title: 'Consignes de sécurité',
        body: 'Décrire les consignes de sécurité à respecter.'
      },
      {
        title: 'Contacts',
        body: 'Indiquer les contacts pertinents pour ce poste ou équipement.'
      }
    ]
  },
  {
    id: 'fiches-aspect',
    name: 'Fiches d\'aspect',
    description: 'Méthodologie pour les fiches d\'aspect',
    steps: [
      {
        title: 'Aspect acceptable',
        body: 'Décrire ce qui constitue un aspect acceptable.'
      },
      {
        title: 'Aspect à surveiller',
        body: 'Décrire ce qui nécessite une surveillance particulière.'
      },
      {
        title: 'Aspect de refus',
        body: 'Décrire ce qui constitue un aspect de refus.'
      },
      {
        title: 'Éclairage',
        body: 'Indiquer les conditions d\'éclairage nécessaires pour l\'examen.'
      },
      {
        title: 'Distance d\'examen',
        body: 'Préciser la distance recommandée pour l\'examen.'
      },
      {
        title: 'Décision',
        body: 'Décrire le processus de décision basé sur l\'examen.'
      }
    ]
  }
];