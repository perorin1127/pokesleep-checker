const fileInput = document.getElementById("fileInput");
const uploadBox = document.getElementById("uploadBox");
const uploadLabel = document.getElementById("uploadLabel");
const previewList = document.getElementById("previewList");
const ocrStatus = document.getElementById("ocrStatus");
const resetBtn = document.getElementById("resetBtn");
const conflictSection = document.getElementById("conflictSection");
const conflictList = document.getElementById("conflictList");
const detectedList = document.getElementById("detectedList");
const resultList = document.getElementById("resultList");
const showAlmost = document.getElementById("showAlmost");
const categoryFilter = document.getElementById("categoryFilter");

// 食材名 -> [{ qty, imageLabel }] 画像ごとに読み取れた値を蓄積する
const detectedSources = {};
INGREDIENTS.forEach(ing => (detectedSources[ing.name] = []));

// 最終的な所持数（競合していない食材のみ反映。競合中は0扱い）
const counts = {};
INGREDIENTS.forEach(ing => (counts[ing.name] = 0));

// 競合中の食材名 -> Set(数値)
let conflicts = {};

let imageCounter = 0;

showAlmost.addEventListener("change", renderResults);

resetBtn.addEventListener("click", () => {
  INGREDIENTS.forEach(ing => (detectedSources[ing.name] = []));
  imageCounter = 0;
  previewList.innerHTML = "";
  resetBtn.hidden = true;
  recomputeCounts();
  buildDetectedList();
  renderResults();
  ocrStatus.hidden = true;
  uploadLabel.textContent = "📷 食材画面のスクリーンショットをアップロード（複数枚可）";
});

function buildDetectedList() {
  detectedList.innerHTML = "";
  INGREDIENTS.forEach(ing => {
    const card = document.createElement("div");
    card.className = "detected-card";
    card.dataset.name = ing.name;

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = ing.name;

    const count = document.createElement("div");
    count.className = "count";
    count.textContent = counts[ing.name];

    card.appendChild(name);
    card.appendChild(count);
    detectedList.appendChild(card);
  });
  refreshDetectedList();
}

function refreshDetectedList() {
  INGREDIENTS.forEach(ing => {
    const card = detectedList.querySelector(`.detected-card[data-name="${CSS.escape(ing.name)}"]`);
    if (!card) return;
    const isConflict = !!conflicts[ing.name];
    const c = counts[ing.name] || 0;
    card.querySelector(".count").textContent = isConflict ? "?" : c;
    card.classList.toggle("found", !isConflict && c > 0);
    card.classList.toggle("conflict", isConflict);
  });
}

// detectedSources から counts / conflicts を再計算する
function recomputeCounts() {
  conflicts = {};
  INGREDIENTS.forEach(ing => {
    const sources = detectedSources[ing.name];
    if (!sources || sources.length === 0) {
      counts[ing.name] = 0;
      return;
    }
    const uniqueQtys = [...new Set(sources.map(s => s.qty))];
    if (uniqueQtys.length === 1) {
      counts[ing.name] = uniqueQtys[0];
    } else {
      counts[ing.name] = 0; // 競合中は安全側で0扱い
      conflicts[ing.name] = uniqueQtys;
    }
  });
  renderConflicts();
}

function renderConflicts() {
  const names = Object.keys(conflicts);
  if (names.length === 0) {
    conflictSection.hidden = true;
    conflictList.innerHTML = "";
    return;
  }
  conflictSection.hidden = false;
  conflictList.innerHTML = "";
  names.forEach(name => {
    const item = document.createElement("div");
    item.className = "conflict-item";
    const sources = detectedSources[name]
      .map(s => `${s.imageLabel}: ${s.qty}`)
      .join(" / ");
    item.textContent = `${name} … ${sources}`;
    conflictList.appendChild(item);
  });
}

// カテゴリ一覧（RECIPES に登場する順で重複なく抽出）
const CATEGORIES = [...new Set(RECIPES.map(r => r.category))];
const selectedCategories = new Set(CATEGORIES);

function buildCategoryFilter() {
  categoryFilter.innerHTML = "";
  CATEGORIES.forEach(cat => {
    const label = document.createElement("label");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = true;
    cb.addEventListener("change", () => {
      if (cb.checked) selectedCategories.add(cat);
      else selectedCategories.delete(cat);
      renderResults();
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(" " + cat));
    categoryFilter.appendChild(label);
  });
}

function renderResults() {
  resultList.innerHTML = "";

  const evaluated = RECIPES.filter(r => selectedCategories.has(r.category)).map(recipe => {
    const need = Object.entries(recipe.ingredients);
    let shortItems = [];
    let missingTotal = 0;
    let hasConflict = false;
    need.forEach(([ingName, needQty]) => {
      if (conflicts[ingName]) hasConflict = true;
      const have = counts[ingName] || 0;
      if (have < needQty) {
        shortItems.push({ name: ingName, have, needQty, short: needQty - have });
        missingTotal += needQty - have;
      }
    });
    return { recipe, shortItems, canMake: shortItems.length === 0 && !hasConflict, missingTotal, hasConflict };
  });

  const makeable = evaluated.filter(e => e.canMake);
  const almost = evaluated
    .filter(e => !e.canMake && !e.hasConflict)
    .sort((a, b) => a.missingTotal - b.missingTotal);

  if (makeable.length === 0 && !showAlmost.checked) {
    const empty = document.createElement("div");
    empty.className = "empty-msg";
    empty.textContent = "今の食材数では作れる料理がありません。「あと少しで作れる料理も表示」をチェックするか、画像を読み込み直してください。";
    resultList.appendChild(empty);
  }

  makeable
    .sort((a, b) => a.recipe.category.localeCompare(b.recipe.category, "ja") || b.recipe.energy - a.recipe.energy)
    .forEach(e => resultList.appendChild(renderRecipeCard(e, "ok")));

  if (showAlmost.checked) {
    almost.slice(0, 15).forEach(e => resultList.appendChild(renderRecipeCard(e, "almost")));
  }
}

function renderRecipeCard(evaluated, mode) {
  const { recipe, shortItems } = evaluated;
  const card = document.createElement("div");
  card.className = "recipe-card " + mode;

  const head = document.createElement("div");
  head.className = "recipe-head";
  const rname = document.createElement("span");
  rname.className = "rname";
  rname.textContent = (mode === "ok" ? "✅ " : "🔶 ") + recipe.name;
  const renergy = document.createElement("span");
  renergy.className = "renergy";
  renergy.textContent = `⚡${recipe.energy.toLocaleString()}`;
  const rmult = document.createElement("span");
  rmult.className = "rmult";
  rmult.textContent = `×${recipe.multiplier.toFixed(2)}`;
  const rcat = document.createElement("span");
  rcat.className = "rcat";
  rcat.textContent = recipe.category;
  head.appendChild(rname);
  head.appendChild(renergy);
  head.appendChild(rmult);
  head.appendChild(rcat);

  const ings = document.createElement("div");
  ings.className = "recipe-ings";
  Object.entries(recipe.ingredients).forEach(([name, qty]) => {
    const tag = document.createElement("span");
    const shortInfo = shortItems.find(s => s.name === name);
    tag.className = "ing-tag" + (shortInfo ? " short" : "");
    tag.textContent = shortInfo
      ? `${name} ${counts[name] || 0}/${qty} (あと${shortInfo.short})`
      : `${name} ${qty}`;
    ings.appendChild(tag);
  });

  card.appendChild(head);
  card.appendChild(ings);
  return card;
}

// ---- 個数バッジの検出（OCR） ----
// ポケスリの食材画面は「アイコン＋個数バッジ」が上段、「食材名（黒い読みやすい文字）」が
// 下段に並ぶグリッドレイアウト（4列）。食材の判定は食材名のテキストOCRのみで行う
// （ゲーム内アイコン画像を同梱・照合する方式は著作権上の懸念があるため使用しない）。

const NUMBER_TOKEN_RE = /[×xX](\d{1,3})/;

function hasJapanese(s) {
  return /[぀-ゟ゠-ヿ一-鿿]/.test(s || "");
}

// 2つの文字列の文字一致度（多重集合の共通部分 / name の長さ）。単語の並び順が
// フォントの癖で崩れても許容できるよう、順序ではなく文字の集合で比較する。
function charOverlapScore(name, text) {
  const nameChars = Array.from(name);
  const textChars = Array.from(text);
  const textCount = {};
  textChars.forEach(c => (textCount[c] = (textCount[c] || 0) + 1));
  let matched = 0;
  nameChars.forEach(c => {
    if (textCount[c] > 0) {
      matched++;
      textCount[c]--;
    }
  });
  return matched / nameChars.length;
}

function extractNumberBadges(words) {
  const numberWords = [];
  (words || []).forEach(w => {
    const m = (w.text || "").match(NUMBER_TOKEN_RE);
    if (m && w.bbox) numberWords.push({ qty: parseInt(m[1], 10), bbox: w.bbox });
  });
  return numberWords;
}

// 個数バッジを縦位置でグリッドの「段」ごとにグルーピングする
function groupBadgesIntoRows(numberWords) {
  const sorted = [...numberWords].sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const rows = [];
  sorted.forEach(nw => {
    const last = rows[rows.length - 1];
    if (last && nw.bbox.y0 - last.y1 < 100) {
      last.items.push(nw);
      last.y1 = Math.max(last.y1, nw.bbox.y1);
    } else {
      rows.push({ y0: nw.bbox.y0, y1: nw.bbox.y1, items: [nw] });
    }
  });
  return rows;
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function median(nums) {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---- 食材名テキストでの判定（主方式） ----
// 各バッジの真下にある食材名テキスト（黒い読みやすい文字）を、同じ段の中で一番近い
// 列に割り当てて連結し、既知の食材名と文字一致度で照合する。
// 一番近い列と僅差の場合は誤対応付けを避けるため割り当てない。
function matchByNameText(numberWords, numberRows, words) {
  const result = new Map(); // badge -> { name, score }
  const minY = Math.min(...numberWords.map(w => w.bbox.y0)) - 50;
  const nameWords = (words || []).filter(
    w => w.bbox && hasJapanese(w.text) && !NUMBER_TOKEN_RE.test(w.text) && w.bbox.y0 >= minY
  );

  const groups = new Map(); // badge -> parts[]
  numberWords.forEach(nw => groups.set(nw, []));

  nameWords.forEach(word => {
    let block = null;
    numberRows.forEach(row => {
      if (row.y1 <= word.bbox.y0 + 20 && (!block || row.y1 > block.y1)) block = row;
    });
    if (!block) return;

    const wCenter = (word.bbox.x0 + word.bbox.x1) / 2;
    const distances = block.items
      .map(nw => ({ nw, dist: Math.abs((nw.bbox.x0 + nw.bbox.x1) / 2 - wCenter) }))
      .sort((a, b) => a.dist - b.dist);
    if (distances.length === 0) return;
    if (distances.length > 1 && distances[1].dist - distances[0].dist < 20) return;
    groups.get(distances[0].nw).push(word);
  });

  groups.forEach((parts, badge) => {
    if (parts.length === 0) return;
    const text = parts
      .sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0)
      .map(p => p.text)
      .join("");
    let bestIng = null;
    let bestScore = 0;
    INGREDIENTS.forEach(ing => {
      const score = charOverlapScore(ing.name, text);
      if (score > bestScore) {
        bestScore = score;
        bestIng = ing;
      }
    });
    if (bestIng && bestScore >= 0.55) {
      result.set(badge, { name: bestIng.name, score: bestScore });
    }
  });

  return result;
}

async function matchIngredientsFromText(numberSourceWords, textSourceWords) {
  const detected = {};
  const numberWords = extractNumberBadges(numberSourceWords);
  if (numberWords.length === 0) return detected;

  const numberRows = groupBadgesIntoRows(numberWords);
  const textResults = matchByNameText(numberWords, numberRows, textSourceWords);

  numberWords.forEach(badge => {
    const picked = textResults.get(badge);
    if (!picked) return;
    if (!detected[picked.name] || detected[picked.name].score < picked.score) {
      detected[picked.name] = { qty: badge.qty, score: picked.score };
    }
  });

  return detected;
}

// 小さい数字（特に "1" が連続する3桁の数値）はOCRが読み違えやすいため、
// 画像全体を拡大してから読み取る。
const OCR_UPSCALE = 2;

// 一番上の段は、一覧の切り替わり演出などでバッジの文字が非常に薄く表示され、
// 通常のOCRでは数字が1つも読めないことがある（食材名のテキストは薄くならず読めるため、
// この段の存在自体は分かる）。その場合はその段の位置を他の段の間隔から推定し、
// 範囲を絞ってその場だけ明暗を最大限に引き伸ばす自動コントラスト補正をかけ直して
// 再度数字だけをOCRする。
// 指定した矩形だけで明るさの最小・最大を求め、0〜255いっぱいに引き伸ばしてから
// 指定倍率で拡大したキャンバスを返す。
function autocontrastCrop(canvas, sx, sy, sw, sh, scale) {
  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const cctx = crop.getContext("2d", { willReadFrequently: true });
  cctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  const imgData = cctx.getImageData(0, 0, sw, sh);
  const d = imgData.data;
  let min = 255, max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = Math.min(255, Math.max(0, ((d[i + c] - min) / range) * 255));
    }
  }
  cctx.putImageData(imgData, 0, 0);

  const big = document.createElement("canvas");
  big.width = sw * scale;
  big.height = sh * scale;
  const bctx = big.getContext("2d");
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(crop, 0, 0, big.width, big.height);
  return big;
}

// x中心が近いバッジどうしを同じ列としてまとめる。バッジの右端（x1）は桁数が
// 変わってもほぼ一定の位置にそろうため列の基準に使い、切り出し幅は既知の
// バッジの中で最も幅広いもの（＝3桁）を基準に余裕を持たせる
// （読み取る数値の桁数は事前に分からないため、狭すぎる幅で切り出すと
// 桁が欠けて誤読の原因になる）。
function clusterColumns(badges, tolerance) {
  const sorted = [...badges].sort((a, b) => (a.bbox.x0 + a.bbox.x1) / 2 - (b.bbox.x0 + b.bbox.x1) / 2);
  const columns = [];
  sorted.forEach(b => {
    const cx = (b.bbox.x0 + b.bbox.x1) / 2;
    const last = columns[columns.length - 1];
    if (last && cx - last.cx < tolerance) {
      last.items.push(b);
      last.cx = (last.cx * (last.items.length - 1) + cx) / last.items.length;
    } else {
      columns.push({ cx, items: [b] });
    }
  });
  const maxWidth = Math.max(...badges.map(b => b.bbox.x1 - b.bbox.x0));
  return columns.map(col => {
    const x1 = median(col.items.map(b => b.bbox.x1));
    return { x0: x1 - maxWidth * 1.3, x1 };
  });
}

async function recoverFaintTopRow(canvas, numberWords) {
  if (numberWords.length === 0) return [];
  const rows = groupBadgesIntoRows(numberWords);
  if (rows.length < 2) return [];

  // 段の間隔（＝バッジ同士の縦の間隔）は一定なので、一番上に検出できている段の
  // バッジ位置から、その間隔ぶんだけ上に「もう1段分のバッジ」があるはずの位置を予測する。
  const spacings = [];
  for (let i = 1; i < rows.length; i++) spacings.push(rows[i].y0 - rows[i - 1].y0);
  const spacing = median(spacings);
  if (!spacing || spacing <= 0) return [];

  const topRow = rows[0];
  const badgeHeight = median(topRow.items.map(b => b.bbox.y1 - b.bbox.y0));
  const predictedBadgeY0 = topRow.y0 - spacing;
  const margin = badgeHeight * 1.1;
  const predictedY0 = Math.round(predictedBadgeY0 - margin);
  const predictedY1 = Math.round(predictedBadgeY0 + badgeHeight + margin);
  if (predictedY0 < 0 || predictedY1 - predictedY0 < 10) return [];

  // 列（同じ横位置）ごとに1つずつ切り出して個別にOCRする。行全体をまとめて
  // 読み取ると、他の列の数字と混ざって誤読しやすいため。
  const columns = clusterColumns(
    rows.flatMap(r => r.items),
    spacing * 0.3
  );

  const results = [];
  for (const col of columns) {
    // 列どうしの間には十分な余白があるため、多少広めに切り出しても隣の列と
    // 混ざる心配は少ない。右端がぎりぎりで桁を欠くよりも安全側に寄せる。
    const padLeft = (col.x1 - col.x0) * 0.2;
    const padRight = (col.x1 - col.x0) * 0.35;
    const sx = Math.max(0, Math.round(col.x0 - padLeft));
    const sw = Math.min(canvas.width - sx, Math.round(col.x1 - col.x0 + padLeft + padRight));
    const sh = predictedY1 - predictedY0;
    if (sw <= 0 || sh <= 0) continue;

    // 大きく拡大しすぎるとぼやけて数字が別の数字に見えてしまうことがあるため
    // （例:「6」が「0」に、「3」が「5」に見えてしまう）、あえて縮小気味にする
    const big = autocontrastCrop(canvas, sx, predictedY0, sw, sh, 0.5);
    const { data } = await Tesseract.recognize(big, "eng", {
      tessedit_char_whitelist: "0123456789xX×",
    });
    const found = extractNumberBadges(data.words || []);
    if (found.length === 0) continue;
    // 列を1つに絞って切り出しているので基本は1件のはずだが、複数見つかった場合は
    // 桁数が多い（＝より具体的に読めた）ものを優先する
    const best = found.reduce((a, b) =>
      String(b.qty).length > String(a.qty).length ? b : a
    );
    results.push({
      qty: best.qty,
      bbox: { x0: col.x0, x1: col.x1, y0: predictedY0, y1: predictedY1 },
    });
  }

  return results;
}

async function processFile(file, imageLabel) {
  const url = URL.createObjectURL(file);
  const thumb = document.createElement("img");
  thumb.src = url;
  thumb.title = imageLabel;
  previewList.appendChild(thumb);

  const img = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth * OCR_UPSCALE;
  canvas.height = img.naturalHeight * OCR_UPSCALE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 個数バッジの数字と食材名の日本語は別々にOCRする。jpn+eng の混合モードだと
  // 言語モデルが競合して小さな数字の認識精度が明確に落ちるため、数字は
  // 数字専用（英語＋文字制限）、食材名は日本語混在でそれぞれ最適な設定を使う。
  // 数字側はさらにコントラストを強めたコピーを使う。一覧の一番上の段は
  // フェード演出などでバッジの文字が薄く表示されていることがあり、
  // 少しコントラストを上げるだけで読み取れる数字が増えるため。
  const numberCanvas = document.createElement("canvas");
  numberCanvas.width = canvas.width;
  numberCanvas.height = canvas.height;
  const numberCtx = numberCanvas.getContext("2d", { willReadFrequently: true });
  numberCtx.drawImage(canvas, 0, 0);
  {
    const imgData = numberCtx.getImageData(0, 0, numberCanvas.width, numberCanvas.height);
    const d = imgData.data;
    const factor = 1.8;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.min(255, Math.max(0, (d[i] - 128) * factor + 128));
      d[i + 1] = Math.min(255, Math.max(0, (d[i + 1] - 128) * factor + 128));
      d[i + 2] = Math.min(255, Math.max(0, (d[i + 2] - 128) * factor + 128));
    }
    numberCtx.putImageData(imgData, 0, 0);
  }

  const progress = (label, ratio, base) => {
    ocrStatus.textContent = `${imageLabel} を読み取り中... ${Math.round((base + ratio * 0.5) * 100)}%`;
  };
  const numberPass = await Tesseract.recognize(numberCanvas, "eng", {
    tessedit_char_whitelist: "0123456789xX×",
    logger: m => {
      if (m.status === "recognizing text") progress(imageLabel, m.progress, 0);
    },
  });
  const textPass = await Tesseract.recognize(canvas, "jpn+eng", {
    logger: m => {
      if (m.status === "recognizing text") progress(imageLabel, m.progress, 0.5);
    },
  });

  const numberWords = numberPass.data.words || [];
  const recovered = await recoverFaintTopRow(canvas, extractNumberBadges(numberWords));
  recovered.forEach(r => {
    numberWords.push({ text: `x${r.qty}`, bbox: r.bbox, confidence: 100 });
  });

  const detected = await matchIngredientsFromText(numberWords, textPass.data.words || []);
  Object.entries(detected).forEach(([name, info]) => {
    detectedSources[name].push({ qty: info.qty, imageLabel });
  });

  return Object.keys(detected).length;
}

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files || []);
  if (files.length === 0) return;

  uploadLabel.textContent = "📷 さらにスクリーンショットを追加";
  resetBtn.hidden = false;
  ocrStatus.hidden = false;

  let totalFound = 0;
  for (const file of files) {
    imageCounter++;
    const label = `画像${imageCounter}`;
    ocrStatus.textContent = `${label} を読み取り中...`;
    try {
      totalFound += await processFile(file, label);
    } catch (err) {
      console.error(err);
      ocrStatus.textContent = `${label} の読み取りに失敗しました。`;
    }
  }

  recomputeCounts();
  buildDetectedList();
  renderResults();

  const conflictCount = Object.keys(conflicts).length;
  if (conflictCount > 0) {
    ocrStatus.textContent = `読み取り完了。ただし${conflictCount}件の食材で数値が競合しています（下の警告欄を確認してください）。`;
  } else if (totalFound === 0) {
    ocrStatus.textContent = "食材を読み取れませんでした。画像が鮮明か、食材名と数字が写っているか確認してもう一度お試しください。";
  } else {
    ocrStatus.textContent = `読み取り完了。現在${Object.values(detectedSources).filter(s => s.length > 0).length}種類の食材を検出しています。`;
  }

  fileInput.value = "";
});

uploadBox.addEventListener("dragover", e => e.preventDefault());
uploadBox.addEventListener("drop", e => {
  e.preventDefault();
  if (e.dataTransfer.files.length > 0) {
    fileInput.files = e.dataTransfer.files;
    fileInput.dispatchEvent(new Event("change"));
  }
});

buildDetectedList();
buildCategoryFilter();
renderResults();
