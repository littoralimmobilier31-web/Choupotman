# L’intelligence artificielle

Trois surfaces, deux garde-fous. Les garde-fous sont des propriétés du code, pas
des consignes données au modèle : une instruction dans un prompt est une
intention, un mécanisme est une garantie.

---

## Configuration

```dotenv
ANTHROPIC_API_KEY=sk-ant-…      # optionnelle
AI_MODEL=claude-opus-5
AI_MAX_TOKENS=1600
```

**Sans clé, l’application fonctionne.** Le chatbot et l’analyse de projet
basculent sur un moteur déterministe qui répond à partir de la même base de
données. L’assistant privé indique que la clé n’est pas configurée, plutôt que de
donner l’impression de réfléchir.

La clé est lue côté serveur uniquement : elle n’apparaît dans aucune réponse,
aucun journal, aucun bundle envoyé au navigateur.

---

## Garde-fou 1 — ne jamais inventer

La règle du cahier des charges : ne jamais inventer de clients, diplômes,
certifications, chiffres, projets, résultats ou témoignages.

Elle est tenue par la structure, pas par le prompt :

- **La base de connaissances vient de la base de données.**
  `buildPublicKnowledge(locale)` assemble uniquement des lignes réellement
  saisies — services, réalisations publiées, parcours, témoignages, FAQ. Le
  modèle ne peut pas citer ce qui n’y figure pas, parce qu’il ne l’a jamais vu.
- **Un champ vide reste vide.** Enregistré `NULL`, il fait disparaître la section
  correspondante de la page publique au lieu d’afficher un texte de remplissage.
  Rien n’est jamais complété par défaut.
- **Le repli déterministe utilise la même base.** Sans clé API,
  `answerFromRules()` fait correspondre des mots-clés à ce que contient la base
  et renvoie vers le formulaire de contact quand il ne sait pas. Il ne peut pas
  s’éloigner de la source.

Le prompt système commence bien par « RÈGLE ABSOLUE — NE JAMAIS INVENTER », mais
c’est une ceinture par-dessus les bretelles.

Les tests interrogent le chatbot sur des diplômes inexistants — il décline — et
sur le chiffre d’affaires d’un client — il ne produit aucun montant.

---

## Garde-fou 2 — confirmer avant d’agir

L’assistant privé peut lire et proposer. Il ne peut pas agir.

Chaque outil porte un `kind` :

```ts
{ name: 'lister_factures_impayees', kind: 'read',  … }
{ name: 'creer_facture',            kind: 'write', … }
```

- Un outil de **lecture** s’exécute immédiatement et son résultat retourne au
  modèle.
- Un outil d’**écriture** **termine le tour**. Rien ne s’exécute. La proposition
  est enregistrée avec sa charge utile et `tool_status = 'proposed'`, et
  l’interface la présente à confirmer.

L’exécution passe par une seule route, `/api/ia/confirmer`, et elle :

1. utilise **la charge enregistrée au moment de la proposition**, pas celle
   envoyée par le navigateur — sinon le garde-fou ne serait qu’un écran ;
2. vérifie que la conversation appartient bien à l’appelant ;
3. revérifie la permission liée à l’outil ;
4. n’accepte qu’une fois : un statut différent de `proposed` répond `400`.

La boucle de l’assistant est bornée à quatre tours, pour qu’une confusion ne
devienne pas une boucle.

Les tests insèrent directement une proposition en base, vérifient que rien n’a été
créé avant confirmation, que l’action s’exécute après, et qu’une seconde
confirmation est refusée.

---

## Les trois surfaces

### Chatbot public — `/api/chat`

Répond aux visiteurs à partir de la base de connaissances. Limité à 40 messages
par demi-heure et par adresse. Ne dispose d’aucun outil : il ne peut que
répondre.

Quand il ne sait pas, il le dit et renvoie vers le formulaire de contact. C’est
préférable à une réponse plausible : un visiteur à qui l’on invente un tarif
revient avec une attente fausse.

### Assistant privé — `/api/ia/chat`

« Choupotman AI ». Voit les données de l’activité selon les permissions de la
personne connectée. Propose des actions, ne les exécute pas.

Sans clé API, il l’indique plutôt que de répondre à vide.

### Analyse et rédaction — `/api/ia/generer`

- **Analyse d’un projet** — avancement, révisions consommées sur le quota, écart
  entre budget et facturé, retards. Sans clé, `analyseProjectFromRules()` produit
  le même genre de synthèse, chaque phrase découlant d’un nombre réel.
- **Aide à la rédaction** — propose un texte de portfolio ou de service. Le texte
  proposé n’est jamais enregistré directement : il s’affiche dans le formulaire,
  et c’est la personne qui enregistre.

---

## Détails d’implémentation

`src/lib/ai/client.ts` :

- `thinking: { type: 'adaptive' }` — la forme actuelle pour les modèles récents ;
  `budget_tokens` est rejeté par ceux-ci ;
- `output_config: { effort }` — ajusté selon la surface ;
- `strict: true` sur les définitions d’outils ;
- pas de préremplissage de la réponse de l’assistant ;
- `AiError` porte des messages en français, présentables tels quels à l’écran.

Les conversations et les messages sont enregistrés (`ai_conversations`,
`ai_messages`), ce qui permet de relire ce qui a été proposé et pourquoi.

---

## Coûts

Chaque appel est facturé par Anthropic. Trois réglages limitent la dépense :

- `AI_MAX_TOKENS` plafonne la longueur des réponses ;
- la politique `aiAdmin` limite à 120 requêtes par heure et par utilisateur ;
- la politique `chatbot` limite à 40 par demi-heure et par adresse.

Sans clé, le coût est nul et l’application reste utilisable — ce qui en fait un
mode de fonctionnement acceptable, pas un mode dégradé.
