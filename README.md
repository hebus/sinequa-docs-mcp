# sinequa-docs-mcp

Serveur MCP sur la documentation publiée des librairies Sinequa : **atomic**, **atomic-angular** et
**galactik**. Il ne lit que de la documentation publique : aucune authentification, aucun backend Sinequa.

| Outil | Rôle |
|---|---|
| `docs_search` | recherche plein texte ; renvoie les meilleures sections (deux par page au plus) avec leur URL et un extrait |
| `docs_read` | une page en Markdown, depuis son chemin, son URL ou un chemin relatif (`auth/sign-in`) ; `#ancre` ou `section` pour une section seule (et ses sous-sections) |
| `docs_index` | sommaire : titre, chemin et description de chaque page |

## Installer dans Claude Code

Une commande, Node ≥ 20 suffit :

```bash
claude mcp add --scope user sinequa-docs -- npx -y https://github.com/hebus/sinequa-docs-mcp/releases/latest/download/sinequa-docs-mcp.tgz
```

Puis `/mcp` dans Claude Code : `sinequa-docs` doit être connecté. Claude Code lance le serveur lui-même
(stdio) : rien à garder ouvert, rien à authentifier.

- **Ce qui est téléchargé** : l'archive de la dernière release (~190 Ko) — le bundle seul, sans aucune
  dépendance : rien à installer ni à compiler, quelques secondes au premier lancement.
- **Figer une version** : `…/releases/download/v0.1.0/sinequa-docs-mcp.tgz` au lieu de
  `…/releases/latest/download/…`.
- **Sans release, depuis `main`** : `npx -y github:hebus/sinequa-docs-mcp` marche aussi, mais clone le dépôt,
  installe les outils de build et compile (30 à 40 s au premier lancement).
- **Dans Mint**, rien à faire : son `.mcp.json` déclare déjà `sinequa-docs` (le bundle ci-dessous, livré dans
  `tools/`) ; Claude Code le propose à l'ouverture du projet.

Autres clients MCP : la commande à lancer est
`npx -y https://github.com/hebus/sinequa-docs-mcp/releases/latest/download/sinequa-docs-mcp.tgz`, en stdio.

## Publier une version

```bash
npm version patch        # ou minor : met à jour package.json et crée le tag v<version>
git push --follow-tags
```

Le workflow `release` (GitHub Actions) vérifie que le tag correspond à `package.json`, lance le typecheck et
les tests, construit l'archive (`npm run pack:bundle` → `bundle/sinequa-docs-mcp.tgz`), l'installe et
interroge le serveur, puis crée la release avec l'archive et le bundle `.mjs` en pièces jointes. Le nom des
pièces jointes ne change pas d'une version à l'autre : c'est ce qui fait marcher l'URL `latest/download`.

## Développer

```bash
git clone https://github.com/hebus/sinequa-docs-mcp.git
cd sinequa-docs-mcp
npm install          # compile aussi dist/ (script prepare)
claude mcp add --scope user sinequa-docs -- node <chemin>/sinequa-docs-mcp/dist/cli.js
```

**HTTP** plutôt que stdio : un serveur partagé par plusieurs clients.

```bash
npm run start:http                     # http://127.0.0.1:5181/mcp
claude mcp add --transport http sinequa-docs http://127.0.0.1:5181/mcp
```

Le serveur HTTP écoute sur `127.0.0.1` (`--host` / `HOST` pour changer) et refuse les requêtes d'une page
web d'une autre origine (protection contre le DNS rebinding).

## Un seul fichier, sans installation

```bash
npm run bundle       # → bundle/sinequa-docs-mcp.mjs (~780 Ko, dépendances incluses)
```

esbuild regroupe le serveur et ses dépendances (SDK MCP, zod, hono) dans un fichier unique : sur le poste
du consommateur, Node ≥ 20 suffit — ni `npm install`, ni `node_modules`, ni accès à GitHub. Il se
distribue comme on veut (pièce jointe d'une release, partage réseau, téléchargement) :

```bash
claude mcp add --scope user sinequa-docs -- node C:/outils/sinequa-docs-mcp.mjs
```

Pas de mise à jour automatique : une nouvelle version, c'est un nouveau fichier à récupérer. Les licences
des dépendances sont en fin de fichier. `npx tsx eval/stdio-smoke.ts <dossier>/sinequa-docs-mcp.mjs` le
vérifie depuis un dossier sans `node_modules`.

## Configurer

| Option | Variable | Défaut |
|---|---|---|
| `--libraries=nom=URL,…` | `DOCS_LIBRARIES` | atomic, atomic-angular, galactik sur hebus.github.io |
| `--http` | | stdio |
| `--port` | `PORT` | 5181 |
| `--host` | `HOST` | 127.0.0.1 |

`nom=URL` : la partie avant `/docs` désigne le site Fumadocs, la suite le préfixe des pages retenues.
atomic-angular et galactik viennent du même site : un seul téléchargement. Pour une doc en cours d'écriture :
`--libraries=atomic=http://localhost:3001/docs/`.

## Fonctionnement

- **Source** : le `llms-full.txt` que publie chaque site Fumadocs (toutes les pages en Markdown). Il est
  découpé en pages et en sections ; les titres à l'intérieur des blocs de code restent du texte.
- **Cache** : 10 minutes, puis revalidation par ETag (un 304 ne coûte rien). Site injoignable : la dernière
  copie sert. Les pages ne sont ré-analysées et l'index reconstruit que si le texte a changé.
- **Classement** : BM25F sur quatre champs (titre de la page, mots du chemin, titre de section, texte), plus
  une part du score de la page entière : une page consacrée au sujet passe devant une mention en passant. Un
  identifiant est indexé entier et par ses mots (`ThemeToggle` → `themetoggle`, `theme`, `toggle`), les
  pluriels sont ramenés au singulier, un mot que la doc n'emploie jamais entier est cherché comme préfixe
  (identifiant tronqué). Les sections qui contiennent tous les mots de la requête passent devant.

## Mesurer le classement

`eval/queries.json` associe des requêtes à la page attendue ; `npm run eval` donne le rang de chacune, le
top 1, le top 3 et le MRR sur la doc publiée. `eval/grid.ts` balaie les poids de `RANKING` et `FIELDS`.
Ajouter une requête qui échoue avant de toucher au classement.

`npx tsx eval/stdio-smoke.ts` lance le serveur compilé en stdio et appelle chaque outil, comme un client MCP.

## Tests

```bash
npm test
npm run typecheck
```
