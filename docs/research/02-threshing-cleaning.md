# 大型コンバイン 脱穀・分離・選別部 パーツ別資料（3D再現用）

**作業上の制約:** この環境ではWebFetchがすべてのドメインでDNSエラーになり、ページ本体やPDFは開けませんでした。以下の数値はWebSearchの結果要約（ディーラー仕様ページ、メーカーページ、特許、論文）から取ったものです。メーカー公式仕様書PDFとの突き合わせはしていないので、重要な値は後で公式資料で確認してください。

## 1. 脱穀・分離方式の比較
| 方式 | 代表機 | 構成 |
|---|---|---|
| コンベンショナル | NH CX8.90 | 横置きドラム φ750mm×幅1.56m、コンケーブ巻き角111°、ストローウォーカ6本（長さ3.67m、面積6.68m²） |
| アキシャル単一ロータ | JD S790 / S7、Case IH 9250 | 縦置きロータ1本で脱穀と分離を兼ねる |
| ツインロータ | NH CR、JD X9 | 並列の縦置きロータ2本。CR8.90は φ22in(559mm)×2.64m、CR11は φ600mm×3.6m。X9は φ610mm×3.51m |
| ハイブリッド | CLAAS Lexion 8900 | APS Synflow（加速ドラム φ450mm、脱穀ドラム φ755mm×幅1.7m、フィードドラム φ600mm）の後ろに分離ロータ2本（φ445×4,200mm）。ドラムで約70%を脱穀し、残り30%をロータ側で処理 |

**図解・教育用としての意見:**
- **原理を説明するなら** コンベンショナルが最も分かりやすいです。脱穀、分離、選別の各工程が別々の部品に分かれていて目で追えます。
- **「米国型大型機」として作るなら** 単一アキシャルロータ（JD S7 / Case IH）を推奨します。部品は「透明な円筒ケージ＋下部コンケーブ＋その真下のシュー」で済み、部品数が少なく、主流の構成でもあります。
- ツインロータとハイブリッドは、同じ部品を複製または追加するオプション機として作るのが効率的です。

## 2. ロータ／シリンダ
| 機種 | 直径 | 長さ | 回転数 | 周速（計算値） |
|---|---|---|---|---|
| JD S790 | 30in = 0.762m | 123in = 3.12m | 210–1,000rpm | 8.4–39.9 m/s |
| Case IH 9250 | 0.762m（ホイップ外径）／管径0.649m | 2.623m | 220–1,180rpm | 8.8–47 m/s |
| JD X9 1100 | 24in = 0.61m ×2本 | 3.51m | 300–1,300rpm | 9.6–41.5 m/s |
| Lexion 8900 ドラム | 0.755m | 幅1.7m（推定：FWI表の「1700×755」を幅と解釈） | 330–930rpm（標準550） | — |

- **コンケーブ／分離部:**
  - S790：コンケーブ1.1m²、分離1.54m²、排出グレート0.45m²。分離面積はRDOのページだけ1.99m²と記載されていますが、他の掲載とは合いません。
  - X9：コンケーブ1.6m²、分離3.6m²。profiは22.5m²としていますが、定義が不明です。
  - Lexion 8000：コンケーブ1.55m²、ロータ分離6.34m²。
- **巻き角:** Case IH AF150で156°、旧2188で143°。コンケーブは3分割（旧2188の仕様）。
- **ロータ前端:**
  - JD S7は先端がテーパ状の「弾丸形」ノーズで、スパイラルベーンで送り込みます。
  - Case IH系の特許では、前端インペラは三角板の羽根3枚（ハブにボルト留め）です。回転すると円錐台を描き、その傾斜はトランジションコーンにほぼ合わせてあります。
- **脱穀エレメント:**
  - Case IHはラスプバー配置です。
  - JDは溝（ライフリング）付きエレメントで、分離部はフィンガ形です。
  - X9の後端には8翼の排出ビータがあります。
- **トップカバーのヘリカルベーン:** Case IH 250とJD S7はどちらもベーン角度を調整できます（Case IHは運転席からの調整オプションあり）。ベーンのピッチを小さくすると滞留時間が延びます（特許US6447394）。X9ではわらがロータの周りを約9周します。
- **確認できなかった値:**
  - ロータの傾斜角：一般論として「入口から排出側へ後ろ上がり」とする特許はありますが、数値は見つかりませんでした。0〜5°の後ろ上がりを推奨します（推定）。
  - 回転方向：未確認です。3Dでは「前方から見て時計回り」で統一する前提にしてください（推定）。

## 3. 選別（クリーニングシュー）
| 機種 | フロントチャッファ | チャッファ | シーブ | 合計 | ファン |
|---|---|---|---|---|---|
| JD S790 | 0.5m²（延長 +0.8） | 2.5m² | 2.1m² | 5.9m² | 620–1,350rpm、直径は非公開 |
| JD X9 | 0.97m² | 3.13m² | 2.87m² | 6.97m² | タービンファン4基 |
| Case IH 9250 | — | — | — | 8.59m²（定義不明） | クロスフロー、40枚羽根、φ392.5mm、300–1,150rpm |
| NH CR8.90 | プレシーブ 450mmの段差 | — | — | 6.50m² | — |
| Lexion 8000 | — | — | — | 未確認 | タービンファン6基または8基 |

- **振動:** 典型値は振幅 a = 20–25mm、周波数 4–5Hz（Landtechnik 2001）。耐久試験論文でも基準は5Hz（クランク300rpm）です。
- **逆位相:** NHはグレインパン＋下シーブと、プレシーブ＋上シーブを互いに逆向きに動かしています。
- **傾斜:** シーブは前低・後高に置かれます（特許）。
- **風速:** 小麦の場合、上シーブ前部で5–6m/s、後部で3–4m/s。終末速度は小麦粒が5.8–9.8m/s、籾殻が2.5–3.6m/sです。
- **JDの風量配分:** フロントチャッファに風量の約30%を回し、遊離穀粒の最大40%をここで落とします。シューへの供給はオーガ4本です。

## 4. テーリング（2番）リターン
- 経路は「チャッファ後端／シーブで落ちなかった物 → 横送りのテーリングオーガ → リスレッシャ → インペラまたはオーガ → グレインパンへ戻す」です。
- Case IHはTri-Sweepテーリングプロセッサでグレインパンに戻します。
- JD X9のActive Tailings Returnは、脱穀部を経由せずにリターンパンへ配分します。
- JDの特許には、リスレッシャのバイパス（US7654892）とラスプ付きロータ（US7762877）があります。

## 5. 内部レイアウト（多くが推定）
- **全体:** 全長約9.1m、全幅3.45m、全高約4m（旧S770の中古掲載。S7 900は高さ13ft = 3.96m、幅3.3m）。フィーダは幅1.40m×長さ1.73m（S790）。
- **前後方向の並び:** フィーダ出口 → ロータ前端（前車軸のほぼ上） → ロータ（約3.1m、後方へ） → ディスチャージビータ → チョッパ。
- **ロータ下の構成:** ロータの下にグレインパンがあり、その後方にチャッファとシーブ。ファンはシュー前端の下、前車軸付近にあります。
- **高さ（推定）:** ロータ軸 2.0–2.3m、シュー上面 1.2–1.5m、ファン軸 約0.8m。
- **シューの長さ（推定）:** チャッファ面積を幅約1.5mで割ると約1.6–1.7m。
- **断面図:** 公式の断面図は見つかりませんでした。代わりに次の3つがあります。
  - NC State Extensionのコンベンショナル機のカット図（Wikimedia由来）
  - Case IH特許US6719626 / US4900290の図面
  - 特許US6494782（ツインロータ）の図面

## 6. 作物の流れ（パーティクル用）
1. **わら:** ロータの周りを螺旋状に後方へ進みます。周速は10–40m/s、X9では約9周。後端から排出され、チョッパで撒かれます。
2. **穀粒:** コンケーブやグレートから落ちてグレインパンに乗り、後方へ送られます。チャッファとシーブを通過し、クリーングレインオーガから右側のエレベータ、グレンタンクへ運ばれます。
3. **籾殻:** シュー前下方からの風（3–8m/s）で浮き上がり、機体後方へ吹き出されます。
4. **2番:** 横送りされ、リスレッシャを経てグレインパンへ戻ります。
5. **滞留時間:** 公開された実測値は見つかりませんでした。ロータ内の滞留は1–3秒程度と仮定するのを推奨します（推定）。

## 7. 3D簡略化の提案
- **部品の表現:**
  - ロータ：CylinderGeometryの芯に、ラスプバーを螺旋状に配置したBoxを並べる。
  - 前端：ConeGeometryのインペラ＋羽根3枚。
  - ケージ：半透明の円筒。上半分は透明にして、ヘリカルベーンを内側にTorus片で表現。
  - コンケーブ：下側の約150°の円弧格子。
  - シュー：薄いBoxを2段＋ルーバ。
  - ファン：クロスフロー型の円筒羽根車。
- **アニメーション:**
  - 回転：ω = 2π·rpm/60。実時間だとストロボ状に見えるので、表示上は60–120rpmに落とす。
  - シーブ：x = a·sin(2πft)、a = 20mm、f = 4.5Hz。前低・後高の傾斜に沿った方向で、上下のシーブは位相を180°ずらす。

## 3D設計への推奨値
| 部品 | 推奨寸法 | 動き | 出典 |
|---|---|---|---|
| ロータ | φ0.76m×3.1m、後ろ上がり3°（推定） | 400–1,000rpm（表示は低速化） | S790 / 9250 仕様 |
| インペラ | 3枚羽根の円錐台、長さ約0.4m（推定） | ロータと一体で回転 | 特許US3982548 |
| コンケーブ | 巻き角150°、長さ約1.0m | 固定 | Case IH AF150 |
| 分離グレート | 巻き角150°、長さ約2.0m | 固定 | S790（1.54m²） |
| トップカバーのベーン | 5–7本、ピッチ約20°（推定） | 固定（角度調整可） | Case IH 250 / JD S7 |
| グレインパン | 1.5×1.0m | 往復 20mm / 4.5Hz | Landtechnik |
| チャッファ | 1.5×1.7m（2.5m²） | 往復 20mm / 4.5Hz | S790 |
| シーブ | 1.5×1.4m（2.1m²） | 往復、逆位相 | S790 / NH |
| ファン | φ0.39m×幅1.5m | 600–1,150rpm | Case IH 9250 |
| テーリング／穀粒オーガ | φ0.2–0.25m（推定） | 約400rpm（推定） | — |
| 風速 | 前部 5–6m/s、後部 3–4m/s | パーティクル速度に使用 | 論文 |

## 出典URL
- https://vanwall.com/shop/agriculture/harvesting/combines/john-deere-s790-combine/
- https://checkout.rdoequipment.com/new-john-deere-s790-combine-s790sh/
- https://21stcenturyequipment.com/shop/product-farm-ag-john-deere--s790sh
- https://www.westcentraleq.com/new-models/2024-john-deere-x9-1100-combine-29220340b
- https://www.farmersguardian.com/review/4114244/review-skin-john-deeres-x9-combine
- https://www.farmprogress.com/farming-equipment/john-deere-unveils-x9-combine-with-more-harvesting-capacity
- https://www.fwi.co.uk/machinery/harvest-equipment/combines/huge-john-deere-x9-combine-aims-to-conquer-competition
- https://horizonagturf.com/deere/new-equipment/large-ag-equipment/harvesting-equipment/s-series-combines/s7-900
- https://www.producer.com/?p=152713
- https://www.titanmachinery.ua/en/agricultural/grain-harvesting-combines/axial-flow-9250.html
- https://revistacultivar.com.br/colhedora/case-ih/axial-flow-9250
- https://www.titanmachinery.ua/en/news/case-ih-presents-renewed-line-of-axial-flow-150-combines
- https://www.terre-net.fr/guide-machinisme/fiche-technique-moissonneuses-batteuses-case-ih-axial-flow-2188-1995/f676t3
- https://farm-equipment.com/articles/print/15935-case-ih-250-series-axial-flow-combines
- https://powertips.hragripower.com/assets/Content/X250_Combine_Productivity_Guide_opt.pdf
- https://fwi.co.uk/machinery/harvest-equipment/combines/claas-launches-biggest-ever-lexion-combine-the-790hp-8900
- https://maquinac.com/english/maqui-tour-lexion-8900/
- https://www.claas.com/en-au/agricultural-machinery/combine-harvesters/lexion-8000
- https://www.ritchiespecs.com/model/new-holland-cr8-90-combine
- https://agriculture.newholland.com/en-au/oceania/products/combine-harvesters/cr10-and-cr11
- https://koneviesti.fi/en/konedata/puimurit/new-holland/new-holland-cx7-80-cx8-90-2016
- https://www.ritchiespecs.com/model/new-holland-cx8-90-combine
- https://www.oemoffhighway.com/press_release/12093601/automated-technologies-new-holland-cx8-series-combines-improve-productivity-and-crop-cleanliness
- https://www.agricultural-engineering.eu/landtechnik/article/download/2001-56-4-276-277/2001-56-4-276-277-en-pdf/
- https://doi.org/10.3390/agriculture13122232
- https://agro.icm.edu.pl/agro/element/bwmeta1.element.agro-article-cc3ac06c-0b49-443c-ac47-5cf15293834c/c/Aerodynamic_properties_of.pdf
- https://bookstore.ksre.ksu.edu/download/harvesting-wheat_MF2026
- https://content.ces.ncsu.edu/print_image/17896
- https://patents.google.com/patent/US9414546
- https://patents.google.com/patent/US4900290
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/3982548
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/6447394
- https://patents.google.com/patent/US7654892B2
- https://patents.google.com/patent/US7762877
- https://brevets-patents.ic.gc.ca/opic-cipo/cpd/fra/brevet/2126486/sommaire.html
