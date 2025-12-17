import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const lottieJsonPath = process.argv[2];
const framesDir = process.argv[3] || '_1_renderPNG'; // 出力先ディレクトリ（オプション）

// 引数のパース（--widthオプション、--disable-gpuオプション、--extendオプション、--fpsオプションを検出）
let width = null;
let disableGpu = false;
let extendSeconds = 0; // 延長する秒数
let fps = 60; // デフォルトフレームレート

for (let i = 4; i < process.argv.length; i++) {
  const arg = process.argv[i];
  if (arg === "--width" && i + 1 < process.argv.length) {
    width = parseInt(process.argv[i + 1]);
    i++; // 次の引数をスキップ
  } else if (arg === "--disable-gpu") {
    disableGpu = true;
  } else if (arg === "--extend" && i + 1 < process.argv.length) {
    extendSeconds = parseFloat(process.argv[i + 1]);
    i++; // 次の引数をスキップ
  } else if (arg === "--fps" && i + 1 < process.argv.length) {
    fps = parseInt(process.argv[i + 1]);
    i++; // 次の引数をスキップ
  } else if (!arg.startsWith("--") && !width) {
    // 非オプション引数が数値の場合、幅として扱う（後方互換性のため）
    const parsed = parseInt(arg);
    if (!isNaN(parsed)) {
      width = parsed;
    }
  }
}

(async () => {
    const startTime = Date.now();
    
    // ディレクトリの作成
    if (!fs.existsSync(framesDir)) {
        fs.mkdirSync(framesDir, { recursive: true });
    }

    const browserArgs = [
        '--disable-dev-shm-usage', // メモリ不足対策
        '--no-sandbox', // セキュリティサンドボックス無効化（高速化）
    ];
    
    if (disableGpu) {
        browserArgs.push('--disable-gpu');
        console.log('GPU: 無効');
    } else {
        console.log('GPU: 有効');
    }

    const browser = await puppeteer.launch({
        headless: 'new',
        args: browserArgs,
    });
    const page = await browser.newPage();

    await page.goto('about:blank');
    await page.addScriptTag({
        path: path.resolve('node_modules', 'lottie-web', 'build', 'player', 'lottie.min.js')
    });

    const lottieData = JSON.parse(fs.readFileSync(lottieJsonPath, 'utf8'));

    // Lottieアニメーションの設定を取得
    const originalFps = lottieData.fr || 60;
    const originalWidth = lottieData.w || 1920;
    const originalHeight = lottieData.h || 1080;
    const originalIp = lottieData.ip || 0;
    const originalOp = lottieData.op || 0;
    const originalTotalFrames = originalOp - originalIp;
    const animationDuration = originalTotalFrames / originalFps; // 秒単位

    // Lottieアニメーションの設定を表示
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Lottieアニメーション設定:`);
    console.log(`  ファイル: ${path.basename(lottieJsonPath)}`);
    console.log(`  解像度: ${originalWidth}x${originalHeight}`);
    console.log(`  フレームレート: ${originalFps}fps`);
    console.log(`  フレーム範囲: ${originalIp} - ${originalOp} (${originalTotalFrames}フレーム)`);
    console.log(`  アニメーション長さ: ${animationDuration.toFixed(2)}秒`);
    console.log(`${'='.repeat(50)}`);

    // 出力設定を表示
    console.log(`\n出力設定:`);
    console.log(`  フレームレート: ${fps}fps`);
    if (width) {
        const aspectRatio = originalHeight / originalWidth;
        const targetHeight = Math.round(width * aspectRatio);
        console.log(`  解像度: ${width}x${targetHeight} (指定)`);
    } else {
        console.log(`  解像度: ${originalWidth}x${originalHeight} (Lottie設定)`);
    }
    if (extendSeconds > 0) {
        console.log(`  延長: ${extendSeconds}秒 (${Math.round(extendSeconds * fps)}フレーム)`);
    }
    console.log(`  GPU: ${disableGpu ? '無効' : '有効'}`);

    // 指定fpsでレンダリングする場合のフレーム数を計算
    let framesToRender;
    let frameStep;
    if (fps !== originalFps) {
        // fpsが異なる場合、フレームを間引く
        const targetFrameCount = Math.round(animationDuration * fps);
        frameStep = originalFps / fps; // フレーム間隔
        framesToRender = targetFrameCount;
        console.log(`\nフレーム変換: ${originalTotalFrames}フレーム @ ${originalFps}fps → ${targetFrameCount}フレーム @ ${fps}fps`);
    } else {
        // fpsが同じ場合、全フレームをレンダリング
        frameStep = 1;
        framesToRender = originalTotalFrames;
        console.log(`\nフレーム変換: ${framesToRender}フレーム @ ${fps}fps (変更なし)`);
    }

    // 幅が指定されている場合、アスペクト比を維持して高さを計算
    // 指定されていない場合、Lottie JSONファイルの元のサイズを使用
    let targetWidth = null;
    let targetHeight = null;
    if (width) {
        targetWidth = width;
        const aspectRatio = lottieData.h / lottieData.w;
        targetHeight = Math.round(width * aspectRatio);
    } else {
        // デフォルトサイズをLottie JSONファイルの元のサイズに設定
        targetWidth = lottieData.w;
        targetHeight = lottieData.h;
    }

    await page.evaluate(async (animationData, w, h) => {
        window.animationData = animationData;
        window.targetWidth = w;
        window.targetHeight = h;
    }, lottieData, targetWidth, targetHeight);

    await page.evaluate(async () => {
        const container = document.createElement('div');
        
        // コンテナサイズを常に設定（デフォルトサイズまたは指定サイズ）
        container.style.width = window.targetWidth + 'px';
        container.style.height = window.targetHeight + 'px';
        container.style.position = 'absolute';
        
        document.body.appendChild(container);

        window.anim = lottie.loadAnimation({
            container,
            renderer: 'canvas',
            rendererSettings: {
                preserveAspectRatio: 'none',
                clearCanvas: true
            },
            loop: false,
            autoplay: false,
            animationData: window.animationData
        });

        await new Promise(resolve => window.anim.addEventListener('DOMLoaded', resolve));
        
        // Canvasサイズを明示的に設定して再描画
        const canvas = container.querySelector('canvas');
        if (canvas) {
            // Canvasサイズを設定
            canvas.width = window.targetWidth;
            canvas.height = window.targetHeight;
            
            // アニメーションを再描画
            window.anim.resize();
            // 現在のフレームを再描画
            const currentFrame = window.anim.currentFrame;
            window.anim.goToAndStop(currentFrame, true);
        }
    });

    // 指定fpsでレンダリングするフレームを決定
    const framesToCapture = [];
    if (frameStep === 1) {
        // 全フレームをレンダリング
        const totalFrames = await page.evaluate(() => Math.floor(window.anim.getDuration(true)) - 1);
        for (let i = 0; i <= totalFrames; i++) {
            framesToCapture.push(i);
        }
    } else {
        // フレームを間引いてレンダリング
        const totalFrames = await page.evaluate(() => Math.floor(window.anim.getDuration(true)) - 1);
        for (let i = 0; i < framesToRender; i++) {
            const sourceFrame = Math.round(i * frameStep);
            if (sourceFrame <= totalFrames) {
                framesToCapture.push(sourceFrame);
            }
        }
    }

    // フレームレンダリングの最適化：page.evaluateの呼び出しを統合
    for (let outputIndex = 0; outputIndex < framesToCapture.length; outputIndex++) {
        const sourceFrame = framesToCapture[outputIndex];
        const dataUrl = await page.evaluate((frame) => {
            window.anim.goToAndStop(frame, true);
            const canvas = document.querySelector('canvas');
            return canvas.toDataURL('image/png');
        }, sourceFrame);

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
        const fileName = path.join(framesDir, `frame_${String(outputIndex).padStart(4, '0')}.png`);
        fs.writeFileSync(fileName, Buffer.from(base64Data, 'base64'));
        console.log(`Saved ${fileName} (source frame: ${sourceFrame})`);
    }

    await browser.close();
    
    // 延長処理：最後のフレームを指定秒数分追加
    const renderedFrameCount = framesToCapture.length;
    if (extendSeconds > 0) {
        const extendFrameCount = Math.round(extendSeconds * fps);
        const lastFrameIndex = renderedFrameCount - 1;
        const lastFramePath = path.join(framesDir, `frame_${String(lastFrameIndex).padStart(4, '0')}.png`);
        
        if (fs.existsSync(lastFramePath)) {
            console.log(`\n最後のフレームを${extendSeconds}秒分（${extendFrameCount}フレーム）延長中...`);
            const lastFrameBuffer = fs.readFileSync(lastFramePath);
            
            for (let i = 1; i <= extendFrameCount; i++) {
                const newFrameIndex = renderedFrameCount - 1 + i;
                const newFramePath = path.join(framesDir, `frame_${String(newFrameIndex).padStart(4, '0')}.png`);
                fs.writeFileSync(newFramePath, lastFrameBuffer);
            }
            console.log(`延長完了: ${extendFrameCount}フレーム追加`);
        } else {
            console.warn(`警告: 最後のフレームが見つかりません: ${lastFramePath}`);
        }
    }
    
    const endTime = Date.now();
    const elapsedSeconds = ((endTime - startTime) / 1000).toFixed(2);
    const finalFrameCount = renderedFrameCount + (extendSeconds > 0 ? Math.round(extendSeconds * fps) : 0);
    console.log(`\nレンダリング完了: ${elapsedSeconds}秒 (${finalFrameCount}フレーム @ ${fps}fps)`);
})();
