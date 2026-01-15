# TS GraphGen XML Generator (SQLite)

Ce projet génère un XML au format GraphGen (comme `SARAH1.xml`) depuis une base SQLite contenant :
- un catalogue d'objets (VOLUME/PLAQUE, VOLUME/CYLINDRE, ...)
- des templates (objets complexes)
- des règles de placement répétitif (LINEAR/STACK/...)
- des appareils (APPAREIL) identifiés par un `code_morpho`
- des options (armoire électrique, vase d'expansion, ...)

## Installation

Créer un `package.json` avec ces dépendances :

```json
{
  "type": "module",
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "mathjs": "^13.0.0",
    "xmlbuilder2": "^3.1.1",
    "yargs": "^17.7.2"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0",
    "@types/better-sqlite3": "^7.6.0"
  }
}
```

Puis :

```bash
npm i
npm run build
```

## Initialiser la DB

```bash
node dist/cli/initdb.js --db ./data/app.db
```

## Démo

```bash
node dist/cli/index.js OPERA_DEMO --db ./data/app.db --option armoire_elec=false --option vase_expansion=false --out ./out/OPERA_DEMO.xml
```

## Expressions

- `local(1).px` / `local(1).A` : référence un item du même template.
- `ref("root/modules[2]/1").A` : référence par *path* (Option A).
- `options.armoire_elec ? 1 : 0` : utiliser des options.
- `globals.tableGMV.diam` : variables globales.

