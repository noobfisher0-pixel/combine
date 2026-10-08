# 大型コンバイン 3D再現用資料：寸法・シャーシ・走行系・キャブ・パワートレイン

**調査の制約:** この環境では WebFetch が全ドメインで DNS エラー（ENOTFOUND）となり、メーカーの仕様PDFや製品ページを直接開けませんでした。数値は WebSearch の結果に出た抜粋（メーカーページ、ディーラー仕様、Lecturaなどの第三者データベース）から取っています。確認できなかった値は「推定」と書き、根拠を添えています。全長・ホイールベース・最低地上高のメーカー公式値は、どの機種でもほとんど取れていません。

> **編注（設計側）:** 本資料の §6 は座標系を「z は左が正」としていますが、x 前方・y 上の右手系では +z は**右**になります。設計書（`docs/design.md`）では +z=右 に統一しています。下の表の z 座標は原文のままです（左右を反転して読んでください）。

## 1. 全体寸法（ヘッダなし）

| 機種 | 全長 | 全幅 | 全高 | ホイールベース | 重量 |
|---|---|---|---|---|---|
| Case IH 8250 | 輸送長8.05 m（Lectura。9250と同値で汎用値の疑いあり） | 3.962 m（単輪、トレッド120 in） | キャブ頂部3.904 m（153.7 in）。9250の輸送高は3.91〜4.06 m | **3.752 m**（147.7 in）。PGAは3.772 m | 19,434 kg（単輪）〜21,309 kg（デュアル） |
| JD S790 / S7 900 | 輸送長9.1 m（Lectura） | 3.99 m | 4.0 m（Lectura） | 未確認（推定3.7 m：同クラスのCase・NHの値から） | 約20.75 t（ディーラー）。S7 700は19.85 t（43,752 lb、deere.com）、S7 800は22.29 t |
| JD X9 1000 | 未確認（Deere豪州サイトに「外形はS7 900とほぼ同じ」との記述） | 3.47 m / 4.00 m（構成による） | 3.5 m（Lectura。S7の値より低すぎるため要注意） | 未確認 | 26.5 t |
| CLAAS Lexion 8900 TT | 未確認 | 3.49〜3.5 m | 約4.0 m | 未確認 | 19.7〜22.4 t |
| NH CR8.90 / CR10.90 | 輸送長9.97 m | 3.3〜3.49 m | 3.96 m | 3.76 m（12 ft 4 in） | 19.2 t / 20.8 t |

- 表の全長9〜10 m には、格納した排出オーガが含まれる可能性があります。
- 推定：本体の実長（フィーダ先端〜後端スプレッダ）は約8.0〜8.6 m。Case IH のフィーダ長が2.39 m あることと、輸送長の値から見積もりました。
- 最低地上高はどの機種も未確認です。推定0.4〜0.5 m（後車軸下）で、根拠はタイヤ半径約0.8 m とアクスル形状です。
- グレインタンク延長部を展開したときの高さも未確認です。推定4.4〜4.6 m で、根拠は格納時の全高約4.0 m に折り畳み延長部の高さを足したものです。

## 2. 走行系

前輪が駆動輪、後輪が操舵輪です。

**前輪タイヤ（実例）。** 外径は規格からの計算値です。
- JD
  - 900/60R38：外径約2.05 m
  - 650/85R38 デュアル：外径約2.07 m
  - LSW1250/35R46：外径約2.04 m
  - IF800/70R32（S790 HM）
- Case IH
  - 620/70R42 デュアル（最も多い構成）：外径約1.94 m
  - 520/85R42 デュアル：外径約1.95 m
  - IF800/70R38：外径約2.09 m
  - 欧州では VF710/70R42（輸送幅3.5 m 未満向け）から IF900/60R32（外径約1.89 m）まで

**後輪タイヤ。**
- 750/65R26：外径約1.64 m（Case IH の標準）
- 750/60R30：外径約1.66 m
- 710/60R30：外径約1.61 m
- VF600/70R28：外径約1.55 m
- VF620/70R26：外径約1.53 m

**トレッド幅。**
- Case IH の操舵軸は120〜144 in（3.05〜3.66 m）で調整できます。30 in 条間に合わせるための10.4 in 延長も用意されています。
- 前輪デュアル時の全幅は推定4.2〜4.5 m（30 in 条間に合わせたセット）。

**ゴムクローラ。**
- JD・Case IH は30 in / 36 in（0.76 / 0.91 m）。JD の36 in は2014年モデルから設定です。
- Lexion Terra Trac はFWIのレビューで635 mm を確認しました。それ以外の幅（735 / 890 mm）は未確認です。
- 推定：クローラの全長2.4〜2.6 m、高さ1.2〜1.4 m。根拠は前輪径と同程度の駆動輪に三角形配置という構成です。

**走行性能。**
- 最高速度：JD はクローラ仕様で40 km/h（25 mph、S7 製品ページ）。Lexion も40 km/h。Case IH は2段電動シフトのHST（1速が収穫用、2速が路上用）ですが、速度の数値は未確認です。
- JD は ProDrive（HSTに2レンジ）、X9 は ProDrive XL です。
- 後輪の切れ角は未確認です。特許には「後輪15〜20°（アーティキュレート式の例）」「キングピンのオフセット5 in で切れ角を拡大」とあります。推定で最大約45〜50°（一般的な後輪操舵コンバインの値）としました。

## 3. キャブ

- **位置：** 機体の前方中央、フィーダハウスの真上で、前車軸よりやや前に張り出しています。
- **大きさ：** NH Harvest Suite Ultra と Case IH 250 は容積3.7 m³、ガラス面6.3 m²。外形は推定で幅2.0 m × 奥行2.1 m × 高さ1.7 m です（容積3.7 m³ と全高3.9 m からの逆算）。
- **ガラス：** ほぼ全面ガラスで、前面は下方まで湾曲します。左右側面もガラスで、後面は小窓です。
- **ミラー：** 左右に電動・ヒーター付き。
- **ライト：** JD のパッケージ例は、オーバーヘッドのワークライト6灯、ハイビーム2灯、360° LED、両側面ガルウィング下のアンダーグローLEDです。
- **GPS：** JD は StarFire 6000/7000 をルーフ前方に一体化しています。
- **ビーコン：** ルーフ後方の左右、とするのは推定です。
- **乗降ラダー：** キャブ左前、左前輪の前に斜めに掛かります。輸送や畑の条に当たらないよう、機体に沿わせて折り畳みます（Case IH の手動折り畳みの例、引き込み式ラダーの特許US4131293A）。

## 4. エンジン・パワートレイン

| 機種 | エンジン | 定格 / 最大出力 | 燃料タンク |
|---|---|---|---|
| JD S7 900 | JD14 13.6 L | 543 / 617 hp | 1,250 L。DEF 74 L（19.6 gal、第三者情報） |
| JD S790 | 13.5 L | 405 kW | 1,250 L |
| JD X9 1000 | 13.6 L | 549 / 630 hp | 1,249 L |
| JD X9 1100 | 13.6 L | 603 / 690 hp | — |
| Case IH 8250 | 12.9 L | 480 / 555 hp | 1,200 L（317 gal） |
| Lexion 8900 | MAN D42 16.2 L | 790 PS（SAE 779 hp） | 未確認 |

- **エンジン配置（推定）：** グレインタンクの後方、機体上部に横置き。上記全ブランドで共通する構成です。
- **冷却系：**
  - Lexion は Dynamic Cooling で、機体上面に水平配置されています。
  - Case IH の回転式エアスクリーンは右側面です（23/25 系で後部から移設、と資料にあり）。
  - JD は回転式スクリーンの吸気口と吸引式クリーナが標準装備ですが、位置は未確認です。
- **ロータ駆動：** Case IH はロータを Power Plus CVT で駆動します（資料により「ベルトレス」「ベルト駆動」の記述が食い違います）。
- **ベルトの見える側：** 左右どちらかは未確認です。推定では左右両側にベルトとガードが露出するので、モデルでは両側面にガードの膨らみを付けることを推奨します。
- **排気スタック：** 位置は未確認です。推定で後部上面の右寄り、上端の高さ4.0〜4.2 m としました。

## 5. 外板・シルエット

- **横から：** 前は低いフィーダ、その上にキャブが高く立ち、後ろへ箱形の本体が続きます。上面は平らなタンク、最後部はエンジンルームとスプレッダで、後ろ下がりに見えます。
- **前から：** 前輪の幅が最大で、その上に幅2 m 弱のキャブが載ります。排出オーガは左側に、前向きに格納されます。
- **外板：** 側面は大型のヒンジ式シールドが中心です。左のラダーからキャブを経てタンクの点検通路へつながり、手すりはキャブ周りとタンク上にあります（推定）。

## 6. 3D設計への推奨値

| 部品 | 推奨寸法 | 出典 |
|---|---|---|
| ホイールベース | 3.75 m | Case IH 8250、NH CR8.90 |
| 前輪 | 外径2.05 m、幅0.9 m（900/60R38） | タイヤ規格からの計算 |
| 後輪 | 外径1.64 m、幅0.75 m（750/65R26） | Case IH の標準 |
| トレッド | 前3.05 m、後3.05 m | Case IH |
| 全幅 | 3.96 m | Case IH |
| キャブ頂部 | 3.90 m | Case IH |
| 本体長 | 8.3 m | 推定 |
| キャブ外形 | 2.0 × 2.1 × 1.7 m | 推定 |
| クローラ | 幅0.76 m、長さ2.5 m | 幅は JD。長さは推定 |

**座標系と原点：** 原点は前車軸中心の直下の地面、機体中心線上に置きます。x は前方が正、y は上、z は左が正、単位は m です。（→ 編注参照：設計書では +z=右）

| 部品 | 推奨座標 |
|---|---|
| 前輪中心 | (0, 1.02, ±1.52) |
| 後輪中心 | (−3.75, 0.82, ±1.52) |
| キャブ | 前端 x=+1.0、床 y=2.2、屋根 y=3.9、中心 z=0 |
| フィーダ先端 | (+3.2, 0.9, 0) |
| グレインタンク | 中心 (−1.2, 3.3, 0)、上端 y=3.95（展開時4.5） |
| エンジン | (−3.0, 3.0, 0)、横置き |
| 排気スタック上端 | (−3.2, 4.1, −0.8)（推定） |
| 後端スプレッダ | x = −5.1 |
| ラダー | (+0.8, 1.2, +1.3) |
| GPS | (+1.6, 4.0, 0) |

**簡略化の提案：**
- タイヤ：トレッドは R1W のシェブロンラグを InstancedMesh のジオメトリで作り、遠景用には法線マップの LOD を用意します。目安は1本あたり3〜5k tris。
- キャブガラス：MeshPhysicalMaterial で transmission=0.9、roughness=0.05、ior=1.5、thickness=0.01 程度。モバイル向けには透明度0.3の標準マテリアルに切り替えます。
- ポリゴン予算：全体で150〜300k tris。

## 出典URL
- https://www.allmachines.com/combine-harvesters/case-ih-axial-flow-8250
- https://www.lectura-specs.com/en/model/agricultural-machinery/combine-harvesters-case-ih/axial-flow-8250-11746581
- https://www.medlineq.com/New-Inventory-2023-Case-IH-Combine-Axial-Flow-250-Series-Combines-8250-Charleston-14593033
- https://www.hergottcaseih.com/Pre-Owned-Inventory-2021-Case-IH-Combine-Axial-Flow-250-Series-Combines-9250-Humboldt-Saskatchewan-17768839
- https://www.caseih.com/en-gb/europe/products/harvesting/axial-flow-250-series
- https://en.wikipedia.org/wiki/Case_IH_axial-flow_combines
- https://www.lectura-specs.com/en/model/agricultural-machinery/combine-harvesters-john-deere/s790-11755990
- https://heritagetractor.com/ew-Equipment/Agriculture/Harvesting-Equipment/Combines/S-Series-Combines/s790-combine
- https://www.deere.com/en-us/products-and-solutions/harvesting/combines/s7-700-combine-mzi4qkg
- https://www.deere.com/en-us/products-and-solutions/harvesting/combines/s7-800-combine-mzi5qkg
- https://deerequipment.com/new_equipment/s790-combine
- https://www.allmachines.com/combine-harvesters/compare-models/john-deere-s7-900-vs-john-deere-x9-1000
- https://vanwall.com/shop/agriculture/harvesting/combines/john-deere-s760-combine/
- https://www.oemoffhighway.com/drivetrains/press-release/11121681/john-deere-introducing-36-in-track-option-for-s-series-combines
- https://koneviesti.fi/en/konedata/puimurit/john-deere/john-deere-x9-1000-1100-2020
- https://www.lectura-specs.com/en/model/agricultural-machinery/combine-harvesters-john-deere/x9-1000-11747518
- https://www.deere.com.au/en/harvesting/combine-harvesters/x-series-combines/
- https://www.deere.com/en/harvesting/x-series-combines/x91100-combine/
- https://www.deere.com/assets/pdfs/region-4/industries/government-and-military-sales/contracts/price-pages/agricultural/Combines_01Feb2023.pdf
- https://www.dtnpf.com/agriculture/web/ag/magazine/your-farm/article/2020/08/01/new-equipment-deere-launches-high-x9
- https://www.lectura-specs.com/en/model/agricultural-machinery/combine-harvesters-claas/lexion-8900-terratrac-11728516
- https://www.claas.com/en-us/press/press-releases/2024-07-16-claas-rolls-out-lexion-8900-tt
- https://www.claas.com/en-us/agricultural-machinery/combine-harvesters/lexion-8000
- https://www.fwi.co.uk/machinery/harvest-equipment/combines/drivers-view-richard-ledgers-claas-lexion-8900-combine
- https://www.greatplainskubota.com/equipment-sales/new-holland-ag-products/Combines-Headers/Combine-Harvesters/CR-Series/CR890
- https://www.lectura-specs.com/en/model/agricultural-machinery/combine-harvesters-new-holland/cr10-90-opti-clean-11747481
- https://www.oemoffhighway.com/operator-cab/press-release/12036553/new-holland-introduces-cr680-combine-featuring-new-harvest-suite-ultra-cab
- https://patents.google.com/patent/US4131293A/en
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6267198
