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
// ポケスリの食材画面は「アイコン＋個数バッジ」が上段、「食材名（黒い読みやすい文字）」が
// 下段に並ぶグリッドレイアウト（4列）。食材の判定はまず食材名のテキストOCRを試み、
// うまく読めなかった場合だけアイコン画像の色を公式アイコンと照合するフォールバックを使う
// （一番上の段はアイコンがヘッダー直下で小さく表示されるスクロール位置があり、
// アイコン照合だけでは判定できないことがあるが、食材名の文字は同じ大きさで読めるため）。

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

// バッジの位置から、その直上にあるアイコンのおおよその領域を切り出す。
// icon top はあらかじめ決めた y0（本来は自動走査 findIconTop の結果だが、
// 一番上の段のようにヘッダーに近すぎて走査が信用できない場合は、同じ画像内の
// 他の行から学習した比率で上書きされたものが渡ってくる）を使う。
function cropIconRegion(imgCanvas, badge, colWidth, y0, y1) {
  const cx = (badge.bbox.x0 + badge.bbox.x1) / 2;
  const x0 = cx - colWidth * 0.634;
  const x1 = cx + colWidth * 0.161;
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

// ---- アイコン画像照合での判定（食材名が読めなかった場合のフォールバック） ----
function matchByIcon(canvas, ctx, numberRows) {
  const result = new Map(); // badge -> { name, sim }

  const items = [];
  const reliableRatios = [];
  numberRows.forEach(row => {
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
      const cx = (badge.bbox.x0 + badge.bbox.x1) / 2;
      const iconCenterX = cx - colWidth * 0.237;
      const y1 = badge.bbox.y1 - colWidth * 0.083;
      const y0raw = findIconTop(canvas, ctx, iconCenterX, y1, colWidth);
      const ratio = (y1 - y0raw) / colWidth;
      const reliable = ratio >= 0.65 && ratio <= 1.05;
      const likelyOccluded = ratio < 0.3;
      if (reliable) reliableRatios.push(ratio);
      items.push({ badge, colWidth, y1, y0raw, reliable, likelyOccluded });
    });
  });

  const fallbackRatio = reliableRatios.length > 0 ? median(reliableRatios) : 0.917;

  items.forEach(({ badge, colWidth, y1, y0raw, reliable, likelyOccluded }) => {
    if (likelyOccluded) return;
    const y0 = reliable ? y0raw : y1 - fallbackRatio * colWidth;
    if (y1 - y0 < colWidth * 0.45) return;

    const hist = cropIconRegion(canvas, badge, colWidth, y0, y1);
    const { name, sim, secondSim } = matchIconHistogram(hist);
    if (!name) return;
    if (sim - secondSim < 0.03) return;
    result.set(badge, { name, sim });
  });

  return result;
}

async function matchIngredientsByIcon(canvas, ctx, numberSourceWords, textSourceWords) {
  const detected = {};
  const numberWords = extractNumberBadges(numberSourceWords);
  if (numberWords.length === 0) return detected;

  await ensureIconHistograms();
  const numberRows = groupBadgesIntoRows(numberWords);

  const textResults = matchByNameText(numberWords, numberRows, textSourceWords);
  const iconResults = matchByIcon(canvas, ctx, numberRows);

  numberWords.forEach(badge => {
    // 食材名のテキストがはっきり読めた場合はそちらを優先し、
    // 読めなかった場合だけアイコンの色照合結果を使う
    const picked = textResults.get(badge) || iconResults.get(badge);
    if (!picked) return;
    if (!detected[picked.name] || (detected[picked.name].score || 0) < (picked.score || picked.sim)) {
      detected[picked.name] = { qty: badge.qty, score: picked.score || picked.sim };
    }
  });

  return detected;
}

// 小さい数字（特に "1" が連続する3桁の数値）はOCRが読み違えやすいため、
// 画像全体を拡大してから読み取る（アイコン照合もこの拡大画像を使い回す）。
const OCR_UPSCALE = 2;

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

  const detected = await matchIngredientsByIcon(
    canvas,
    ctx,
    numberPass.data.words || [],
    textPass.data.words || []
  );
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
