#!/usr/bin/env node
// Game8のレシピ一覧ページから料理データ（必要食材・基本エナジー・倍率）を取得し、
// data.js の RECIPES 配列を自動生成するスクリプト。
// GitHub Actions から定期実行される想定（.github/workflows/update-data.yml）。
//
// 手動実行: node scripts/update-recipes.mjs

import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_JS_PATH = join(__dirname, "..", "data.js");

const SOURCES = [
  { category: "カレー・シチュー", url: "https://game8.jp/pokemonsleep/543259" },
  { category: "サラダ", url: "https://game8.jp/pokemonsleep/543260" },
  { category: "デザート・ドリンク", url: "https://game8.jp/pokemonsleep/543261" },
];

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; pokesleep-checker-databot/1.0)" },
  });
  if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
  return res.text();
}

// Game8のレシピ表は <td class="center">…料理名…【倍率】</td><td>…食材×数…【初期エナジー】：値…</td>
// という繰り返し構造になっている。1レシピ＝1個の <td class="center"> ブロックとして分割する。
function parseRecipes(html, category) {
  const recipes = [];
  const blocks = html.split('<td class="center">').slice(1);

  for (const raw of blocks) {
    const block = raw.split("</table>")[0]; // 表の外に漏れないようにする

    const nameMatch = block.match(/alt="([^"]+)"[^>]*>\s*[^<]*<\/a>/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    const multMatch = block.match(/【([\d.]+)倍】/);
    // ラベルと数値の間に </b> などのタグが挟まることがあるため、タグを許容する
    const energyMatch = block.match(/【初期エナジー】(?:<[^>]+>)*\s*[：:]\s*([\d,]+)/);
    if (!multMatch || !energyMatch) continue;

    const multiplier = parseFloat(multMatch[1]);
    const energy = parseInt(energyMatch[1].replace(/,/g, ""), 10);

    const ingredients = {};
    const ingRe = /alt="([^"]+?)画像"[^>]*>([^<]+)<\/a>\s*×\s*(\d+)/g;
    let m;
    while ((m = ingRe.exec(block))) {
      const ingName = m[2].trim();
      const qty = parseInt(m[3], 10);
      ingredients[ingName] = qty;
    }
    if (Object.keys(ingredients).length === 0) continue;

    recipes.push({ category, name, energy, multiplier, ingredients });
  }

  return recipes;
}

function formatIngredients(ingredients) {
  return (
    "{ " +
    Object.entries(ingredients)
      .map(([name, qty]) => `"${name}": ${qty}`)
      .join(", ") +
    " }"
  );
}

function formatRecipesBlock(recipesByCategory) {
  const lines = [];
  for (const [category, recipes] of recipesByCategory) {
    lines.push(`  // ==== ${category} ====`);
    for (const r of recipes) {
      lines.push(
        `  { category: "${r.category}", name: "${r.name}", energy: ${r.energy}, multiplier: ${r.multiplier}, ingredients: ${formatIngredients(r.ingredients)} },`
      );
    }
    lines.push("");
  }
  // 末尾の空行を削る
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines.join("\n");
}

async function main() {
  const recipesByCategory = new Map();
  let total = 0;

  for (const source of SOURCES) {
    console.log(`fetching ${source.category} ... ${source.url}`);
    const html = await fetchHtml(source.url);
    const recipes = parseRecipes(html, source.category);
    if (recipes.length === 0) {
      throw new Error(`${source.category}: レシピを1件も取得できませんでした（ページ構造が変わった可能性があります）`);
    }
    console.log(`  -> ${recipes.length} recipes`);
    recipesByCategory.set(source.category, recipes);
    total += recipes.length;
  }

  const current = await readFile(DATA_JS_PATH, "utf8");
  const recipesBlock = formatRecipesBlock(recipesByCategory);

  const newContent = current.replace(
    /const RECIPES = \[[\s\S]*?\n\];\n/,
    `const RECIPES = [\n${recipesBlock}\n];\n`
  );

  if (newContent === current) {
    console.log("変更なし、または RECIPES 配列の置換に失敗しました。");
  } else {
    await writeFile(DATA_JS_PATH, newContent, "utf8");
    console.log(`data.js を更新しました（合計 ${total} レシピ）`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
