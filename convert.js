import { execSync } from "child_process";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execAsync = promisify(exec);

const format = process.argv[2]; // gif, apng, webm, webp, mp4

// 引数のパース（--widthオプション、--disable-gpuオプション、--extendオプション、--fpsオプションを検出）
let inputPath = null;
let width = null;
let disableGpu = false;
let extendSeconds = null;
let fps = 60; // デフォルトフレームレート

for (let i = 3; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--width" && i + 1 < process.argv.length) {
    width = process.argv[i + 1];
    i++; // 次の引数をスキップ
  } else if (arg === "--disable-gpu") {
    disableGpu = true;
  } else if (arg === "--extend" && i + 1 < process.argv.length) {
    extendSeconds = process.argv[i + 1];
    i++; // 次の引数をスキップ
  } else if (arg === "--fps" && i + 1 < process.argv.length) {
    fps = parseInt(process.argv[i + 1]);
    i++; // 次の引数をスキップ
  } else if (!arg.startsWith("--")) {
    // 数値のみの引数は幅として扱う（npm run mp4 --width 3840 の場合は 3840 のみが渡される）
    const parsed = parseInt(arg);
    if (!isNaN(parsed) && !width) {
      width = parsed.toString();
    } else if (arg.endsWith(".json") || fs.existsSync(arg)) {
      // ファイルパスとして扱う条件：.jsonで終わる、またはファイルが存在する
      if (!inputPath) {
        inputPath = arg;
      }
    }
  }
}

// 処理するファイルリスト
let filesToProcess = [];

if (inputPath) {
  // 指定ファイルを処理
  filesToProcess = [inputPath];
} else {
  // _1_inputLottie内の全JSONファイルを処理
  const inputLottieDir = "_1_inputLottie";
  if (!fs.existsSync(inputLottieDir)) {
    console.error(`Directory ${inputLottieDir} does not exist.`);
    process.exit(1);
  }

  const files = fs
    .readdirSync(inputLottieDir)
    .filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error(`No JSON files found in ${inputLottieDir}.`);
    process.exit(1);
  }

  filesToProcess = files.map((f) => path.join(inputLottieDir, f));
}

// ファイル処理関数（非同期）
async function processFile(filePath) {
  const fileStartTime = Date.now();
  console.log(`\nProcessing: ${filePath}`);

  // このファイル用の出力先とフレームディレクトリを決定
  let fileOutputDir, fileFramesDir, fileOutputFile;

  if (inputPath) {
    // 引数でファイルが指定された場合、そのファイルと同じディレクトリに出力
    const inputDir = path.dirname(path.resolve(filePath));
    const inputBaseName = path.basename(filePath, path.extname(filePath));
    fileOutputDir = inputDir;
    // 各ファイルごとに専用のフレームディレクトリを作成（並行処理時の衝突を防ぐ）
    fileFramesDir = path.join(inputDir, "_2_renderPNG", inputBaseName);
    fileOutputFile = path.join(fileOutputDir, `${inputBaseName}.${format}`);
  } else {
    // 引数なしの場合、_3_convertVideoに出力
    const inputBaseName = path.basename(filePath, path.extname(filePath));
    fileOutputDir = "_3_convertVideo";
    // 各ファイルごとに専用のフレームディレクトリを作成（並行処理時の衝突を防ぐ）
    fileFramesDir = path.join("_2_renderPNG", inputBaseName);
    fileOutputFile = path.join(fileOutputDir, `${inputBaseName}.${format}`);
  }

  // ディレクトリの作成
  if (!fs.existsSync(fileFramesDir)) {
    fs.mkdirSync(fileFramesDir, { recursive: true });
  }
  if (!fs.existsSync(fileOutputDir)) {
    fs.mkdirSync(fileOutputDir, { recursive: true });
  }

  // レンダリング
  console.log(`Rendering ${filePath}...`);
  let renderCommand = `node render_frames.js "${filePath}" "${fileFramesDir}"`;
  if (width) {
    renderCommand += ` --width ${width}`;
  }
  if (disableGpu) {
    renderCommand += ` --disable-gpu`;
  }
  if (extendSeconds !== null && extendSeconds !== undefined) {
    renderCommand += ` --extend ${extendSeconds}`;
  }
  renderCommand += ` --fps ${fps}`;
  await execAsync(renderCommand, {
    cwd: process.cwd(),
  });

  // 変換
  console.log(`Converting to ${format.toUpperCase()}...`);
  const framePattern = path.join(fileFramesDir, "frame_%04d.png");
  const framePatternWildcard = path.join(fileFramesDir, "frame_*.png");

  switch (format) {
    case "gif":
      // 各ファイルごとに専用のpalette.pngを作成（並行処理時の衝突を防ぐ）
      const paletteFile = path.join(fileFramesDir, "palette.png");
      await execAsync(
        `ffmpeg -y -threads 0 -i "${framePattern}" -filter_complex "[0:v]palettegen" "${paletteFile}" && ffmpeg -y -threads 0 -framerate ${fps} -i "${framePattern}" -i "${paletteFile}" -filter_complex "[0:v][1:v]paletteuse" "${fileOutputFile}"`
      );
      break;
    case "apng":
      await execAsync(
        `ffmpeg -y -threads 0 -framerate ${fps} -i "${framePattern}" -plays 0 -c:v apng "${fileOutputFile}"`
      );
      break;
    case "webm":
      await execAsync(
        `ffmpeg -y -threads 0 -framerate ${fps} -i "${framePattern}" -c:v libvpx-vp9 -lossless 1 -pix_fmt yuva420p -auto-alt-ref 0 -row-mt 1 -deadline realtime "${fileOutputFile}"`
      );
      break;
    case "webp":
      // img2webpの-dオプションはミリ秒単位（1000/fps）
      // img2webpはワイルドカードをサポートしていないため、ファイルリストを取得して個別に渡す
      const delayMs = Math.round(1000 / fps);
      const frameFiles = fs.readdirSync(fileFramesDir)
        .filter(f => f.startsWith('frame_') && f.endsWith('.png'))
        .sort()
        .map(f => path.join(fileFramesDir, f))
        .map(f => `"${f}"`)
        .join(' ');
      await execAsync(
        `img2webp -lossless -loop 0 -d ${delayMs} ${frameFiles} -o "${fileOutputFile}"`
      );
      break;
    case "mp4":
      // ハードウェアアクセラレーション（VideoToolbox）を使用
      // VideoToolboxでは-b:v 0が使えないため、適切なビットレートを指定
      await execAsync(
        `ffmpeg -y -threads 0 -framerate ${fps} -i "${framePattern}" -c:v h264_videotoolbox -b:v 10M -pix_fmt yuv420p "${fileOutputFile}"`
      );
      break;
    default:
      console.error(`Unknown format: ${format}`);
      process.exit(1);
  }

  const fileEndTime = Date.now();
  const fileElapsedSeconds = ((fileEndTime - fileStartTime) / 1000).toFixed(2);
  console.log(
    `${format.toUpperCase()} conversion completed! Output: ${fileOutputFile}`
  );
  console.log(`処理時間: ${fileElapsedSeconds}秒`);
  
  // フレームディレクトリを返す（後で削除するため）
  return fileFramesDir;
}

// セマフォを使って最大5つまで並行処理
async function processFilesWithConcurrency(files, maxConcurrency = 5) {
  const executing = [];
  const processedFramesDirs = new Set(); // 処理したフレームディレクトリを記録
  
  for (const filePath of files) {
    const promise = processFile(filePath).then((framesDir) => {
      // 処理したフレームディレクトリを記録
      if (framesDir) {
        processedFramesDirs.add(framesDir);
      }
      return framesDir;
    }).catch((error) => {
      console.error(`Error processing ${filePath}:`, error.message);
      return null;
    }).finally(() => {
      // 実行中の配列から削除
      const index = executing.indexOf(promise);
      if (index > -1) {
        executing.splice(index, 1);
      }
    });
    
    executing.push(promise);
    
    // 最大並行数を超えたら、1つ終了するまで待機
    if (executing.length >= maxConcurrency) {
      await Promise.race(executing);
    }
  }
  
  // 残りの処理が完了するまで待機
  await Promise.all(executing);
  
  return processedFramesDirs;
}

// フレームディレクトリを削除する関数
function cleanupFramesDirs(framesDirs) {
  console.log(`\n中間ファイルを削除中...`);
  let deletedCount = 0;
  
  // 処理したすべてのフレームディレクトリを削除
  for (const framesDir of framesDirs) {
    try {
      if (fs.existsSync(framesDir)) {
        // ディレクトリ内のすべてのファイルとサブディレクトリを削除
        const items = fs.readdirSync(framesDir);
        for (const item of items) {
          const itemPath = path.join(framesDir, item);
          const stat = fs.statSync(itemPath);
          if (stat.isDirectory()) {
            fs.rmSync(itemPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(itemPath);
          }
          deletedCount++;
        }
      }
    } catch (error) {
      console.error(`削除エラー (${framesDir}):`, error.message);
    }
  }
  
  // _2_renderPNGディレクトリ内のすべてのサブディレクトリとファイルを削除
  const mainRenderDir = "_2_renderPNG";
  if (fs.existsSync(mainRenderDir)) {
    try {
      const items = fs.readdirSync(mainRenderDir);
      for (const item of items) {
        const itemPath = path.join(mainRenderDir, item);
        const stat = fs.statSync(itemPath);
        if (stat.isDirectory()) {
          fs.rmSync(itemPath, { recursive: true, force: true });
          deletedCount++;
        } else {
          fs.unlinkSync(itemPath);
          deletedCount++;
        }
      }
    } catch (error) {
      // エラーは無視（既に削除されている可能性がある）
    }
  }
  
  console.log(`中間ファイル削除完了 (${deletedCount}アイテム)`);
}

// 並行処理を実行
(async () => {
  const totalStartTime = Date.now();
  try {
    const processedFramesDirs = await processFilesWithConcurrency(filesToProcess, 5);
    const totalEndTime = Date.now();
    const totalElapsedSeconds = ((totalEndTime - totalStartTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`全ファイル処理完了！`);
    console.log(`総処理時間: ${totalElapsedSeconds}秒 (${filesToProcess.length}ファイル)`);
    console.log(`${'='.repeat(50)}`);
    
    // 中間ファイルを削除
    cleanupFramesDirs(processedFramesDirs);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
})();
