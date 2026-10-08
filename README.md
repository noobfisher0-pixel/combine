# combine

米国型の大型コンバインハーベスター（普通型・単一アキシャルロータ機）を、Three.js でブラウザ上に3D再現するプロジェクトです。現在は **M2（動き）と、小麦での成立チェック（W-1〜W-6）まで完了**しています。

## 動かし方

Node.js 22 で確認しています。

```sh
npm install          # .npmrc で legacy-peer-deps を有効にしています
npm run dev          # 3D モデルを http://localhost:5173 で表示
npm test             # spec の干渉・外形・不変条件の自動検査（Vitest）
npm run test:e2e     # ブラウザでの表示確認（Playwright）
npm run build        # 型チェック＋本番ビルド（dist/）
```

寸法を変えるときは `src/spec/spec.ts` を直し、`npm test` で干渉がないことを確かめます。意図的に接している部品の組は `src/model/parts.ts` の `ALLOWED_CONTACTS` に理由つきで書きます。

## ソースの構成

| 場所 | 内容 |
|---|---|
| `src/spec/spec.ts` | 寸法・配置の唯一の情報源（設計書 §4.2） |
| `src/model/` | 部品定義（確度・根拠つき）、運動学、許可リスト、運転状態、地面の制限、収穫の成立チェック |
| `src/collision/` | 干渉判定（GJK）と姿勢ごとの検査 |
| `src/view/` | 3D モデルの組み立て、材質、断面表示、動き |
| `src/view/visuals/` | 部品ごとの見た目（検査用の形の内側に収める） |
| `tests/`、`e2e/` | 自動検査とブラウザでの確認 |
| `scripts/build-artifact.mjs` | ビルド結果を 1 ファイルのページにまとめる |

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/design.md](docs/design.md) | 設計書（座標系・全体配置・パーツ階層・動き・作物フロー・表示モード・コード構成・マイルストーン） |
| [docs/review.md](docs/review.md) | 設計レビューの指摘と対応状況 |
| [docs/layout-check.py](docs/layout-check.py) | v0.2 時点の隙間・寸法の検算（記録。現在は `tests/` が正） |
| [docs/research/01-header-feeder.md](docs/research/01-header-feeder.md) | 資料：刈取部（ドレーパー／コーンヘッド）とフィーダハウス |
| [docs/research/02-threshing-cleaning.md](docs/research/02-threshing-cleaning.md) | 資料：脱穀・分離（ロータ）と選別（シュー・ファン） |
| [docs/research/03-grain-residue.md](docs/research/03-grain-residue.md) | 資料：穀粒搬送・グレインタンク・排出オーガ・残渣処理 |
| [docs/research/04-chassis-cab-powertrain.md](docs/research/04-chassis-cab-powertrain.md) | 資料：全体寸法・走行系・キャブ・エンジン |
| [docs/research/05-wheat.md](docs/research/05-wheat.md) | 資料：米国の小麦（草丈・穂・収量・MOG 比・刈高さ） |
| [docs/research/06-capacity.md](docs/research/06-capacity.md) | 資料：段ごとの処理能力と収穫の実績 |

## 資料についての注意

資料は WebSearch で得たディーラー仕様・メーカーページの抜粋・特許・論文から集めました。調査環境ではメーカーの仕様書 PDF を直接開けなかったので、公式資料との突き合わせはしていません。「推定」と書いた値は根拠つきの見積もりです。実在メーカーのロゴや配色は使わず、架空の汎用デザインで作ります。
