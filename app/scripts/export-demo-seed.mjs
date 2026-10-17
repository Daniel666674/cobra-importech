// Ejecuta el buildSeed() de la demo estática y guarda el resultado como JSON
// (datos de ejemplo para sembrar la base de desarrollo).
import vm from "node:vm";
import fs from "node:fs";
const src = fs.readFileSync(new URL("../../js/data.js", import.meta.url), "utf8");
const ctx = { console, localStorage: { getItem() { return null; }, setItem() {} }, window: {}, document: {} };
vm.createContext(ctx);
vm.runInContext(src + "\n;globalThis.__out={seed:buildSeed(),TEST_IMEI,REG,CATALOG,PERMS,DEFAULT_ROLES,AUTOS};", ctx);
fs.writeFileSync(new URL("../src/data/demo-seed.json", import.meta.url), JSON.stringify(ctx.__out, null, 1));
fs.writeFileSync(new URL("../src/data/catalog.json", import.meta.url), JSON.stringify(ctx.__out.CATALOG.map(({ tac, ...c }) => c))  /* los TAC de la demo son ficticios: no se usan en la app real */);
const s = ctx.__out.seed;
console.log(Object.keys(s).map(k => `${k}:${Array.isArray(s[k]) ? s[k].length : typeof s[k]}`).join(" "));
