# Lottie Renderer & Converter

Node.js と Puppeteer を使用して、[Lottie](https://airbnb.io/lottie/#/) JSON アニメーションを透過付きの webp/apng/webm/gif に変換するツールです。

---

## プロジェクトファイル構成

### 主要ファイル

- **`render_frames.js`**  
  メインのレンダリングスクリプト。Puppeteer を使用して Lottie アニメーションを読み込み、各フレームを PNG 画像として出力します。Lottie-web ライブラリを使用してアニメーションをレンダリングし、Canvas API で各フレームを画像データとして取得・保存します。`--width`オプションで解像度（幅）を指定できます。アスペクト比は自動的に維持されます。

- **`convert.js`**  
  変換処理を統合するスクリプト。レンダリングと変換を自動的に実行します。引数なしの場合は`_1_inputLottie`内の全ファイルを処理し、引数でファイルパスを指定した場合はそのファイルと同じディレクトリに出力します。

### ディレクトリ

- **`_1_inputLottie/`**  
  Lottie JSON ファイルの入力ディレクトリ。変換対象の Lottie アニメーションファイルを配置します（任意）。

- **`_2_renderPNG/`**  
  レンダリングされた各フレームの PNG 画像を保存するディレクトリ。`render_frames.js`によって`frame_0000.png`、`frame_0001.png`などの形式で保存されます。

- **`_3_convertVideo/`**  
  最終的なアニメーションファイル（GIF、APNG、WebP、WebM、MP4）の出力ディレクトリ。変換コマンド実行後に生成されたファイルが保存されます。

---

## セットアップ手順

### 1. リポジトリのクローンとフォルダへの移動

```bash
git clone https://github.com/2001Y/lottie2alphaVideo.git
cd lottie2alphaVideo
```

### 2. 依存関係のインストール

webp と ffmpeg をインストールします。  
Ubuntu / Debian の場合: `sudo apt install webp ffmpeg`  
[Node.js](https://nodejs.org/)がインストールされていることを確認してください（v18 以上を推奨）。  
その後、以下を実行します:

```bash
npm i
```

これにより依存パッケージがインストールされます。

---

## Lottie ファイルの変換

### 3. Lottie JSON ファイルの準備

**方法 1: `_1_inputLottie`ディレクトリに配置**  
変換対象の Lottie JSON ファイルを`_1_inputLottie/`ディレクトリに配置してください。

**方法 2: ファイルパスを直接指定**  
変換したい Lottie JSON ファイルのパスをコマンドの引数として指定できます。

### 4. 変換コマンドの実行

#### 引数なしの場合（`_1_inputLottie`内の全ファイルを処理）

```bash
npm run gif
npm run apng
npm run webp
npm run webm
npm run mp4
```

結果は`_3_convertVideo/`ディレクトリに各ファイル名で保存されます。

#### ファイルパスを指定した場合

```bash
npm run gif animation.json
npm run apng animation.json
npm run webp animation.json
npm run webm animation.json
npm run mp4 animation.json
```

指定したファイルと同じディレクトリに、ファイル名と同じ名前で出力されます。フレーム画像は指定ファイルと同じディレクトリ内の`_2_renderPNG/`に保存されます。

#### フォーマットの選択

**WebP をお勧めする場合**:
- **Web サイト**: ブラウザでの表示に最適化されており、透過性とファイルサイズのバランスが良い
- **Adobe Premiere Pro**: WebP アニメーションを直接インポート可能（透過性を保持）
- **DaVinci Resolve**: WebP アニメーションを直接インポート可能（透過性を保持）

その他のフォーマット:
- **GIF**: 広くサポートされているが、ファイルサイズが大きい
- **APNG**: 透過性を保持するが、ブラウザサポートが限定的
- **WebM**: 高品質だが、一部の環境でサポートが限定的
- **MP4**: 動画編集ソフトでの互換性が高いが、透過性を保持しない

#### オプション

##### `--width` オプション（解像度指定）

出力解像度の幅を指定できます。高さはアスペクト比を維持して自動計算されます。

```bash
# 引数なし + 幅指定（_1_inputLottie内の全ファイルを3840px幅で処理）
npm run webp -- --width 3840

# ファイルパス + 幅指定
npm run webp -- animation.json --width 1920
npm run gif -- animation.json --width 3840
```

**重要**: `npm run`経由でオプションを使用する場合は、`--`を挟む必要があります。これは npm の仕様です。

- ✅ 正しい: `npm run webp -- --width 1920`
- ❌ 間違い: `npm run webp --width 1920`（オプションが無視されます）

**注意**: 解像度を指定しない場合、Lottie アニメーションの元のサイズでレンダリングされます。

##### `--disable-gpu` オプション（GPU 無効化）

GPU アクセラレーションを無効化します。解像度によって最適な設定が異なります。

```bash
# GPU無効で実行
npm run webp -- --disable-gpu
npm run mp4 -- animation.json --disable-gpu

# 複数オプションの組み合わせ
npm run webp -- animation.json --width 1920 --disable-gpu
```

**パフォーマンス検証結果**:

| 解像度                       | GPU 有効      | GPU 無効      | 推奨設定                     |
| ---------------------------- | ------------- | ------------- | ---------------------------- |
| 通常解像度（1920x1080 相当） | 平均 4.41 秒  | 平均 4.12 秒  | `--disable-gpu`（約 7%高速） |
| 4K 解像度（3840x2160）       | 平均 11.46 秒 | 平均 11.90 秒 | GPU 有効（約 4%高速）        |

**推奨設定**:

- **通常解像度**: `--disable-gpu`を推奨（わずかに高速）
- **高解像度（4K 以上）**: GPU 有効を推奨（デフォルト、わずかに高速）
- 差は小さいため、環境やアニメーションの複雑さによっても変わる可能性があります

**注意**: デフォルトでは GPU 有効です。通常解像度で最速を求める場合は`--disable-gpu`オプションを使用してください。

##### `--extend` オプション（最後のフレームを延長）

アニメーションの最後のフレームを指定した秒数分延長します。フレームレートに応じて自動的にフレーム数が計算されます。

```bash
# 最後のフレームを2秒分延長
npm run webp -- --extend 2

# ファイルパス + 延長
npm run mp4 -- animation.json --extend 1.5

# 複数オプションの組み合わせ
npm run webp -- animation.json --width 1920 --extend 3
```

**注意**: 延長は最後のフレームをコピーして追加します。デフォルトのフレームレート（60fps）で計算されます。

##### `--fps` オプション（フレームレート指定）

出力アニメーションのフレームレートを指定できます。デフォルトは 60fps です。

```bash
# 30fpsで出力
npm run mp4 -- --fps 30

# ファイルパス + フレームレート指定
npm run webp -- animation.json --fps 24

# 複数オプションの組み合わせ
npm run mp4 -- animation.json --width 1920 --fps 30 --extend 2
```

**注意**: フレームレートは変換時のフレームレートに影響します。レンダリング済みの PNG フレームの数は変わりません。

---
