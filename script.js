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

// ユーザーが手入力で上書きした食材名 -> 数値（自動読み取りより優先される）
const manualOverrides = {};

let imageCounter = 0;

showAlmost.addEventListener("change", renderResults);

resetBtn.addEventListener("click", () => {
  INGREDIENTS.forEach(ing => (detectedSources[ing.name] = []));
  Object.keys(manualOverrides).forEach(k => delete manualOverrides[k]);
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

    const count = document.createElement("input");
    count.type = "number";
    count.min = "0";
    count.className = "count";
    count.value = counts[ing.name];
    count.addEventListener("change", () => {
      const v = parseInt(count.value, 10);
      manualOverrides[ing.name] = isNaN(v) || v < 0 ? 0 : v;
      recomputeCounts();
      refreshDetectedList();
      renderResults();
    });

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
    const isManual = Object.prototype.hasOwnProperty.call(manualOverrides, ing.name);
    const c = counts[ing.name] || 0;
    const input = card.querySelector(".count");
    if (document.activeElement !== input) {
      input.value = isConflict ? "" : c;
    }
    input.placeholder = isConflict ? "?" : "";
    card.classList.toggle("found", !isConflict && c > 0 && !isManual);
    card.classList.toggle("conflict", isConflict);
    card.classList.toggle("manual", isManual);
  });
}

// detectedSources から counts / conflicts を再計算する（手入力があればそちらを優先）
function recomputeCounts() {
  conflicts = {};
  INGREDIENTS.forEach(ing => {
    if (Object.prototype.hasOwnProperty.call(manualOverrides, ing.name)) {
      counts[ing.name] = manualOverrides[ing.name];
      return;
    }
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
    .sort((a, b) => a.recipe.category.localeCompare(b.recipe.category, "ja"))
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
  const rcat = document.createElement("span");
  rcat.className = "rcat";
  rcat.textContent = recipe.category;
  head.appendChild(rname);
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
// ポケスリの食材画面は「アイコン＋個数バッジ」が上段、「食材名」が下段に並ぶグリッドレイアウト（4列）。
// 個数バッジ（例:「x37」）はOCRで非常に高精度に読み取れるが、食材名のテキストは装飾フォントのため
// OCRでほぼ読み取れないことが多い。そこで食材の判定には文字OCRではなく、
// バッジの真上にあるアイコン画像そのものを切り出し、公式アイコン画像と見た目を比較する
// 「アイコン画像照合」方式を使う。

const NUMBER_TOKEN_RE = /[×xX](\d{1,3})/;

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

// ---- アイコン画像照合 ----
// 参照アイコン（icons/*.png）と、スクショから切り出したアイコン領域の「色ヒストグラム」を
// 比較して判定する。グリッド単位で位置ごとに色を比較する方式だと、アイコンの陰影の付き方
// （中心が明るく縁が暗い、という共通の描画スタイル）が支配的になってしまい、
// 全く違う食材同士でも似ていると誤判定しやすい。ヒストグラム（色の出現比率だけを見る）は
// 位置のズレや多少のトリミング誤差に強く、実データでの検証でも安定して正しく判定できた。
const HIST_BINS = 8; // RGB各チャンネルの分割数
let iconHistograms = null; // { ingredientName: Float32Array(BINS^3) }

function colorHistogram(source, sx, sy, sw, sh, alphaAware) {
  const w = Math.max(1, Math.round(sw));
  const h = Math.max(1, Math.round(sh));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const hist = new Float32Array(HIST_BINS * HIST_BINS * HIST_BINS);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    if (alphaAware && data[i * 4 + 3] < 128) continue;
    const rb = Math.min(HIST_BINS - 1, Math.floor((data[i * 4] / 256) * HIST_BINS));
    const gb = Math.min(HIST_BINS - 1, Math.floor((data[i * 4 + 1] / 256) * HIST_BINS));
    const bb = Math.min(HIST_BINS - 1, Math.floor((data[i * 4 + 2] / 256) * HIST_BINS));
    hist[rb * HIST_BINS * HIST_BINS + gb * HIST_BINS + bb]++;
    total++;
  }
  if (total > 0) for (let i = 0; i < hist.length; i++) hist[i] /= total;
  return hist;
}

// 画像のアルファ不透明な範囲（実際にアイコンが描かれている範囲）を求める
function findOpaqueBBox(img) {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, w: canvas.width, h: canvas.height, canvas };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, canvas };
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function ensureIconHistograms() {
  if (iconHistograms) return iconHistograms;
  iconHistograms = {};
  await Promise.all(
    INGREDIENTS.map(async ing => {
      try {
        const img = await loadImage(`icons/${ing.id}.png`);
        const bbox = findOpaqueBBox(img);
        // 参照アイコンは透明部分を除外して、絵柄部分の色だけを集計する
        iconHistograms[ing.name] = colorHistogram(bbox.canvas, bbox.x, bbox.y, bbox.w, bbox.h, true);
      } catch (err) {
        console.error("icon load failed", ing.id, err);
      }
    })
  );
  return iconHistograms;
}

// ヒストグラム交差（各ビンの小さい方の値を足し合わせる）。1に近いほど似ている。
function histogramIntersection(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.min(a[i], b[i]);
  return sum;
}

function matchIconHistogram(hist) {
  let bestName = null;
  let bestSim = -Infinity;
  let secondSim = -Infinity;
  Object.entries(iconHistograms).forEach(([name, refHist]) => {
    const sim = histogramIntersection(hist, refHist);
    if (sim > bestSim) {
      secondSim = bestSim;
      bestSim = sim;
      bestName = name;
    } else if (sim > secondSim) {
      secondSim = sim;
    }
  });
  return { name: bestName, sim: bestSim, secondSim };
}

// ある座標が「ほぼ純白（アイコンの丸い背景でも絵柄でもない余白）」かどうか
function isWhitePixel(data, idx) {
  return data[idx] > 248 && data[idx + 1] > 248 && data[idx + 2] > 248;
}

// バッジ直上を1ピクセル列だけ走査し、クリーム色の丸背景が始まる位置（＝アイコンの上端）を探す。
// 1行分のスクリーンショットしか無い場合（一番上の段がヘッダー直下に来る場合など）は
// アイコンの上に十分な余白が無く、固定比率だけで切り出すとヘッダーやタブを巻き込んでしまうため、
// 実際の背景色を見て動的に上端を決める。
function findIconTop(imgCanvas, ctx, iconCenterX, badgeY1, colWidth) {
  const maxReach = colWidth * 1.0; // これ以上は探さない上限
  const scanTop = Math.max(0, Math.round(badgeY1 - maxReach));
  const scanBottom = Math.round(badgeY1);
  const x = Math.max(0, Math.min(imgCanvas.width - 1, Math.round(iconCenterX)));
  const height = scanBottom - scanTop;
  if (height <= 0) return badgeY1 - colWidth * 0.917;

  const { data } = ctx.getImageData(x, scanTop, 1, height);
  const WHITE_RUN_NEEDED = 6;
  let whiteRun = 0;
  // 下（バッジ寄り）から上へ走査し、純白が連続する区間に入ったらそこがアイコンの上端
  for (let y = height - 1; y >= 0; y--) {
    if (isWhitePixel(data, y * 4)) {
      whiteRun++;
      if (whiteRun >= WHITE_RUN_NEEDED) {
        return scanTop + y + whiteRun;
      }
    } else {
      whiteRun = 0;
    }
  }
  return scanTop; // 白い区切りが見つからなければ上限まで使う
}

// バッジの位置から、その直上にあるアイコンのおおよその領域を推定して切り出す。
// 列幅（同じ段のバッジ間隔）を基準にした相対値で計算するため、画像の解像度が変わっても対応できる。
function cropIconForBadge(imgCanvas, ctx, badge, colWidth) {
  const cx = (badge.bbox.x0 + badge.bbox.x1) / 2;
  const iconCenterX = cx - colWidth * 0.237;
  const x0 = cx - colWidth * 0.634;
  const x1 = cx + colWidth * 0.161;
  const y1 = badge.bbox.y1 - colWidth * 0.083;
  const y0 = findIconTop(imgCanvas, ctx, iconCenterX, y1, colWidth);

  // 上に十分な余白（＝アイコン全体）が無い場合（一番上の段がヘッダー直下に来る場合など）は
  // ヘッダーやタブを巻き込んだ不完全な切り出しになるため、無理に判定せず諦める
  if (y1 - y0 < colWidth * 0.45) return null;

  // 円形アイコンの中心付近（クリーム色の背景を避けた内側）だけを使う
  const insetX = (x1 - x0) * 0.22;
  const insetY = Math.max(0, (y1 - y0) * 0.18);
  return colorHistogram(
    imgCanvas,
    Math.max(0, x0 + insetX),
    Math.max(0, y0 + insetY),
    (x1 - x0) - insetX * 2,
    Math.max(1, (y1 - y0) - insetY * 2),
    false
  );
}

async function matchIngredientsByIcon(file, words) {
  const detected = {};
  const numberWords = extractNumberBadges(words);
  if (numberWords.length === 0) return detected;

  await ensureIconHistograms();

  const img = await loadImage(URL.createObjectURL(file));
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const rows = groupBadgesIntoRows(numberWords);

  rows.forEach(row => {
    const sorted = [...row.items].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    let colWidth;
    if (sorted.length > 1) {
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) {
        gaps.push(
          (sorted[i].bbox.x0 + sorted[i].bbox.x1) / 2 -
            (sorted[i - 1].bbox.x0 + sorted[i - 1].bbox.x1) / 2
        );
      }
      colWidth = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    } else {
      colWidth = canvas.width / 4;
    }

    sorted.forEach(badge => {
      const hist = cropIconForBadge(canvas, ctx, badge, colWidth);
      if (!hist) return;
      const { name, sim, secondSim } = matchIconHistogram(hist);
      if (!name) return;
      // 明確に一番近い候補が無い（僅差）場合は誤判定を避けるため採用しない
      if (sim - secondSim < 0.03) return;
      if (!detected[name] || detected[name].sim < sim) {
        detected[name] = { qty: badge.qty, sim };
      }
    });
  });

  return detected;
}

async function processFile(file, imageLabel) {
  const url = URL.createObjectURL(file);
  const thumb = document.createElement("img");
  thumb.src = url;
  thumb.title = imageLabel;
  previewList.appendChild(thumb);

  const { data } = await Tesseract.recognize(file, "eng", {
    tessedit_char_whitelist: "0123456789xX×",
    logger: m => {
      if (m.status === "recognizing text") {
        ocrStatus.textContent = `${imageLabel} を読み取り中... ${Math.round(m.progress * 100)}%`;
      }
    },
  });

  const detected = await matchIngredientsByIcon(file, data.words || []);
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
