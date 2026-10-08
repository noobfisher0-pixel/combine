# 大型コンバイン（Class 8〜9）小麦の処理能力と収穫実績：段ごとの検証資料

**前提**
- 調査は WebSearch の抜粋だけで行いました。pami.ca と deere.com は WebFetch でも curl でも接続できず、PAMI の原典 PDF の図（損失曲線）は直接読めていません。
- 換算に使った値：小麦 1 bu = 27.2 kg = 35.24 L、容積重 約 0.77 t/m³。

---

## 1. コンバイン全体の処理能力

**PAMI ベンチマーク（A19108W、2020年、John Deere 委託）**
- 条件：Viewfield CWRS 春小麦、収量 102 bu/ac（6.86 t/ha）。比較相手は CLAAS 8800。
- 損失 1% 時の総スループット（穀粒＋MOG）
  - X9 1100：**115 t/h（254,000 lb/h）＝ 31.9 kg/s**
  - CLAAS 8800：90 t/h（X9 は 28% 高い）
- 両機とも約 **150 t/h** でエンジン出力の上限（パワーリミット）に達しました。その時点の損失は X9 が **2%以下**、CLAAS が **6%**。
- MOG/G 比：X9 0.67〜0.98、CLAAS 0.60〜0.92。
- エンジン負荷 90%（チョッパ作動）での作業速度：X9 **6.1 km/h（3.8 mph）**、CLAAS 6.0 km/h。
- 抜粋に出ていた値：穀粒処理量 57.9 t/h（2,127 bu/h）、圃場能率 9.3 ha/h。
- 整合性の確認（調査担当の計算）：ヘッダ幅 50 ft（15.24 m、フォーラム情報）× 6.1 km/h ＝ 9.3 ha/h。これに 6.86 t/ha を掛けると穀粒 64 t/h。MOG/G を 0.8 とすると総量 約 115 t/h になり、値は互いに合います。
- 一方、Deere の販促資料にある「1% 損失で 18 ac/h（X9）／14 ac/h（CLAAS）」は上の値と合いません。転記の誤りの可能性があり、未確認です。
- 出典：https://pami.ca/wp-content/uploads/2021/05/A19108W_Wheat_Final_PAMI_Apr-15-21.pdf 、https://www.hutsoninc.com/agriculture/harvesting/x-series/x9-1100-combine/

**旧 PAMI 評価（ロータリ機、損失 3% 時の MOG 処理量）**
- Case IH 1680：20.7 t/h / 18.8 t/h（Katepwa 小麦）
- Case IH 1682：最大 23.2 t/h
- Case IH 1666：18.0〜19.2 t/h
- 1980〜90年代の機械です。現行の Class 8/9 は MOG 処理量でこの 2〜3 倍と推定します。

**メーカーの主張と実測記事**
- Deere：X9 1100 は高収量の小麦で最大 30 ac/h（12.1 ha/h）。タフな小麦では S790 の 170%、一般には S790 比で最大 45% 増。
  - 出典：https://www.sloans.com/catalog/new-john-deere-ag/harvest-equipment/combines/x9-1100-combine 、https://www.farmprogress.com/farming-equipment/john-deere-unveils-x9-combine-with-more-harvesting-capacity
- 西豪州の農家（X9 1100）：ピーク 98 t/h、1日 910 t。旧機 S780 は 11〜12 時間で 500 t、X9 は同じ時間で 650 t。
  - 出典：https://www.countryman.com.au/countryman/machinery/x9-reaches-phenomenal-numbers-harvesting-910-tonnes-in-a-day-c-12805753
- 公式記録として最大の実績（参考）：New Holland CR10.90（ツインロータ）。2014年英国、収量 9.95 t/ha で 8 時間に 797.7 t、**平均 99.7 t/h、ピーク 135 t/h**（穀粒）。
  - 出典：https://www.agriland.co.uk/farming-news/combine-breaks-world-record-harvesting-almost-800t-8-hrs/
- Case IH 8250/9250：小麦での PAMI の公開値は見つかりませんでした。「最大 3,000 bu/h」という記事は根拠不明のため採りません。

## 2. 作業速度と圃場効率

- **ASABE D497**：原典は有料で、コンバイン行の値は確認できていません。
  - D497.7 を引用する二次資料では圃場効率 60〜75%（https://calcimator.com/calculators/agriculture/combine-capacity ）。
  - Purdue は自走式コンバインで 65〜80% としています（https://ag.purdue.edu/ssmc/newsletters/july2001f.htm ）。
  - ブラジルの稲での実測 65.2% が「D497.4 の範囲内」と報告されています。
  - 調査担当の記憶では、D497 の小麦など小粒穀物の行は効率 65〜80%（典型 70%）、速度 3〜6.5 mph（約 5〜10 km/h）です。**未確認なので原典での確認が必要**です。
- 実例：
  - PAMI（1991）：収量 35 bu/ac の小麦で 4.8〜6.4 km/h（3〜4 mph）。
  - 100 bu/ac 超の小麦：40 ft ドレーパで 4 mph（6.4 km/h）近く（農家の報告）。
  - PAMI X9：6.1 km/h。
  - パキスタンの実測：7.5〜11.8 km/h（小型機・低収量）。
  - 出典：https://www.farm-equipment.com/articles/10787 、https://pjaaevs.sau.edu.pk/index.php/ojs/article/download/941/506/1157

## 3. 段ごとの能力の目安

| 項目 | S790 / S7 900 | X9 1100 | Case IH 8250 |
|---|---|---|---|
| フィーダ幅 | 1.40 m（55 in） | 1.72 m | 1.37 m（54 in） |
| ロータ | 単一、φ0.76 × 3.12 m | 双ロータ、φ0.60 × 3.51 m | 単一、φ0.76 × 約2.6 m（8240 の値） |
| 分離面積 | 合計 1.54 m²（コンケーブ 1.1 m²） | 3.6 m²（コンケーブ 1.6 m²） | 不明 |
| 選別面積 | 5.9 m² | 6.97 m² | 約6.5 m²（8240 の値） |
| タンク | 14.1 m³（400 bu） | 16.2 m³（460 bu） | 14.4 m³（410 bu） |
| 排出速度 | 135〜150 L/s | 187 L/s（5.3 bu/s） | 158 L/s（4.5 bu/s） |

出典：https://deerequipment.com/new_equipment/s790-combine 、https://www.westcentraleq.com/new-models/2024-john-deere-x9-1100-combine-29220340b 、https://caseih.com/en-us/unitedstates/products/harvesting/axial-flow-250-series/axial-flow-8250 、https://www.ritchiespecs.com/model/case-ih-axial-flow-8240-combine 、https://www.westcentraleq.com/new-models/2024-john-deere-s7-900-combine-29220348b

**フィーダハウス**
- チェーン速度と流量の関係を示す公表値は見つかりませんでした。
- 実証された下限：X9 は幅 1.72 m で 150 t/h を通しています。幅 1 m あたり **87 t/h 以上**です。

**ロータ（推定・PAMI 値からの逆算）**
- X9：31.9 kg/s ÷ 3.6 m² ＝ 分離面積あたり **約 8.9 kg/s/m²**（損失 1%）。
- S790：X9 の 1/1.7 とすると約 68 t/h。これを 1.54 m² で割ると約 12 kg/s/m²。
- 面積の定義がメーカーごとに違うため、範囲として **9〜12 kg/s/m²** を推定値とします。

**選別部（シュー）（推定）**
- kg/s/m² の公表値は見つかりませんでした。
- 文献の定性的な結論：負荷が過大になるとふるい上にマット状の層ができ、損失が急に増えます。シューは多くの場合、機械全体の能力を決める段です。
  - 出典：https://www.researchgate.net/publication/229298656 、https://patents.google.com/patent/US4531528
- X9 の PAMI 点から逆算すると：
  - 穀粒だけで 17.8 kg/s ÷ 6.97 m² ＝ **2.55 kg/s/m²（9.2 t/h/m²）**
  - 籾殻（MOG の 20〜30% と仮定）を含めると **約 3.0〜3.3 kg/s/m²**

**クリーングレインエレベータ**
- Fendt IDEAL（ツインロータ機）の設計値：**最大 200 t/h**（https://www.fendt.com/au/agricultural-machinery/combine/spotlight-grain-tank-and-discharge ）。
- CR10.90 はピーク 135 t/h を実証しており、大型機のエレベータは 135 t/h 以上と言えます。
- Deere と Case IH の公表値はありません。

**排出オーガ**
- 135〜187 L/s で、既知の 150〜210 L/s とおおむね一致します。X9 の 16.2 m³ は約 87 秒で空になります。

## 4. 損失

- 内訳の目安：
  - 小麦の総損失のうち **63〜82% がヘッダ損失と脱粒（シャッタ）損失**です（NDSU、1974〜75年）。
  - 刈高を穂高の 2/3 にするとヘッダの穂損失は 0.5% 未満（K-State）。
  - 地表で 20〜22 粒/ft²（約 215〜237 粒/m²）が 1 bu/ac（67 kg/ha）の損失に相当します。
  - 出典：https://extension.sdstate.edu/sites/default/files/2020-03/S-0005-28-Wheat.pdf 、https://bookstore.ksre.ksu.edu/download/harvesting-wheat_MF2026
- 評価で使われる許容損失：PAMI は旧評価で 3%、近年のベンチマークで 1% を基準にしています。
- 処理量との関係：X9 では 115→150 t/h（＋30%）で損失が 1%→2% 以下、CLAAS では 90→約150 t/h で 1%→6%。能力を超えると損失は指数的に増えます。
- 段別（脱穀・分離・選別）の典型 % は、現行の大型機について信頼できる値が見つかりませんでした。単一研究の例として、脱穀部 2.3〜3.7%、分離部 0.2〜0.35% があります（中型機）。

## 5. タンク運用と1日の作業量

- 満杯までの時間（推定、8 t/ha・12.2 m・6 km/h で穀粒 58.6 t/h の場合）
  - S790：14.1 m³ ≒ 10.9 t → **約 11 分**
  - X9：16.2 m³ ≒ 12.5 t → **約 13 分**
- 走りながら排出しない場合、停止して排出する時間は 1 時間あたり約 15 分になるという農家の見積りがあります（フォーラム）。
- グレインカートは 1 台で最大 3 台のコンバインに対応できるとするメーカーの主張があります。Deere Machine Sync では、コンバイン側がカートを操作できます。
  - 出典：https://forums.yesterdaystractors.com/threads/grain-cart.719401/ 、https://eng.gomselmash.by/produktsiya/cultivator-eqiupment/grain-cart-bz-3/
- 1日の作業量
  - PAMI ベンチマーク（Deere ディーラー掲載）：X9 は 14 時間で 253 ac（102 ha）、CLAAS 8800 は 198 ac。
  - 受託収穫：7 台で 800 ac/日、1 台あたり約 115 ac（47 ha）。
  - 出典：https://www.thedickinsonpress.com/business/bringing-in-the-sheaves

## 6. わらの散布とチョッパ

- 散布幅（PAMI 旧評価）：Redekop チョッパ 10.7〜12.2 m、REM 籾殻スプレッダ 最大 12.2 m。わらは 15.2 m に広がっても籾殻は 6.1 m しか届かなかった例があります。刈幅と散布幅を合わせることが重要とされています。
  - 出典：https://pami.ca/pdfs/reports_research_updates/(4c)%20Grain%20Combines%20and%20Attachments/697.PDF
- チョッパの所要動力
  - JD 7720 に付けた Redekop、湿った（タフな）小麦で **26 kW（35 hp）**（PAMI）。
  - 冬小麦 16 kg/s では、ウィンドロウ落としにするとチョップ散布より燃料が 8 L/h 少ない（リトアニアの研究）。これを動力に換算すると約 25〜30 kW です（推定、比燃料消費 220〜250 g/kWh を仮定）。
  - 現行機での目安は **30〜50 kW（推定）** です。

---

## 段ごとの能力の推奨値

| 段 | 能力の目安 | 根拠 | 出典 |
|---|---|---|---|
| 機械全体（損失 1%） | Class 8（S790/8250）：総量 65〜80 t/h<br>Class 9（X9）：115 t/h | PAMI の実測値と、メーカーが示す S790 比（1.45〜1.7 倍）から逆算 | PAMI A19108W、Deere |
| 出力上限 | X9：約 150 t/h（損失 2% 以下） | PAMI | 同上 |
| フィーダ | 幅 1 m あたり 87 t/h 以上 | X9 の実証値（下限） | 同上 |
| ロータ（分離） | 9〜12 kg/s/m²（推定） | PAMI 値 ÷ 分離面積 | 同上＋諸元 |
| シュー | 穀粒 2.5 kg/s/m²、総量 3.0〜3.3 kg/s/m²（推定） | X9 の PAMI 点 ÷ 6.97 m² | 同上 |
| エレベータ | 135〜200 t/h | 世界記録のピーク値、Fendt の設計値 | Agriland、Fendt |
| 排出 | 135〜187 L/s | メーカー諸元 | 各社 |

## 小麦 8 t/ha・作業幅 12.2 m で各段がボトルネックになる速度（推定）

**計算の前提**
- 穀粒流量 G ＝ 8 × 12.2 × v ÷ 10 ＝ **9.76·v t/h**（v は km/h）
- MOG/G ＝ 0.8 と仮定（PAMI の範囲 0.67〜0.98 の中央付近）。総流量 ＝ 1.8·G ＝ **17.6·v t/h**

**各段の限界速度**
- 機械全体（損失 1%）
  - Class 8：65〜80 t/h ÷ 17.6 → **3.7〜4.5 km/h**
  - X9：115 ÷ 17.6 → **6.5 km/h**
  - X9 の出力上限：150 ÷ 17.6 → 8.5 km/h（損失 2% 以下）
- ロータ
  - S790：1.54 m² × 9〜12 kg/s/m² × 3.6 ＝ 50〜67 t/h → **2.8〜3.8 km/h**
  - X9：3.6 m² で 115〜155 t/h → 6.5〜8.8 km/h
- シュー（穀粒 2.55 kg/s/m² の場合）
  - S790：5.9 m² → 54 t/h → **5.5 km/h**
  - 8250：約6.5 m² → 60 t/h → 6.1 km/h
  - X9：6.97 m² → 64 t/h → 6.6 km/h
- フィーダ
  - S790：1.40 m × 87 ＝ 122 t/h 以上 → **6.9 km/h 以上**（実際の上限はこれより高い）
- エレベータ
  - 135〜200 t/h → **14〜20 km/h**（ボトルネックにはならない）
- 排出
  - 150 L/s ≒ 416 t/h なので連続排出が可能で、ボトルネックにならない

**結論（推定）**
- この条件では、Class 8 機が損失 1% で走れるのは約 **4 km/h 前後**が上限です。分離部（ロータ）の推定値が最も厳しく、次がシューです。
- X9 級では約 **6.5 km/h** で、機械全体の能力とシューがほぼ同時に限界に達します。
- 損失 2〜3% を許容すれば Class 8 で 5〜6 km/h が見込めます。これは実例の 4.8〜6.4 km/h と合います。

## 出典URL一覧

- https://pami.ca/wp-content/uploads/2021/05/A19108W_Wheat_Final_PAMI_Apr-15-21.pdf
- https://www.hutsoninc.com/agriculture/harvesting/x-series/x9-1100-combine/
- https://pami.ca/pdfs/reports_research_updates/(4c)%20Grain%20Combines%20and%20Attachments/629.PDF （同 600, 710, 697, 156）
- https://www.countryman.com.au/countryman/machinery/x9-reaches-phenomenal-numbers-harvesting-910-tonnes-in-a-day-c-12805753
- https://www.agriland.co.uk/farming-news/combine-breaks-world-record-harvesting-almost-800t-8-hrs/
- https://www.sloans.com/catalog/new-john-deere-ag/harvest-equipment/combines/x9-1100-combine
- https://www.farmprogress.com/farming-equipment/john-deere-unveils-x9-combine-with-more-harvesting-capacity
- https://deerequipment.com/new_equipment/s790-combine
- https://www.westcentraleq.com/new-models/2024-john-deere-x9-1100-combine-29220340b
- https://www.westcentraleq.com/new-models/2024-john-deere-s7-900-combine-29220348b
- https://caseih.com/en-us/unitedstates/products/harvesting/axial-flow-250-series/axial-flow-8250
- https://www.ritchiespecs.com/model/case-ih-axial-flow-8240-combine
- https://www.fendt.com/au/agricultural-machinery/combine/spotlight-grain-tank-and-discharge
- https://ag.purdue.edu/ssmc/newsletters/july2001f.htm
- https://calcimator.com/calculators/agriculture/combine-capacity
- https://standards.globalspec.com/std/14351067/asabe-d497
- https://www.farm-equipment.com/articles/10787
- https://extension.sdstate.edu/sites/default/files/2020-03/S-0005-28-Wheat.pdf
- https://bookstore.ksre.ksu.edu/download/harvesting-wheat_MF2026
- https://www.researchgate.net/publication/229298656
- https://forums.yesterdaystractors.com/threads/grain-cart.719401/
- https://www.thedickinsonpress.com/business/bringing-in-the-sheaves
- https://pjaaevs.sau.edu.pk/index.php/ojs/article/download/941/506/1157
