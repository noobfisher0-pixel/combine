# 米国小麦（HRW・HRS）の作物数値：3D再現とコンバイン検証用

**前提**：WebSearch の抜粋から数値を拾った（WebFetch は使っていない）。抜粋に数値が出なかった項目は**【推定】**とし、根拠を書いた。単位換算はすべて自分で計算した（1 bu 小麦 = 60 lb = 27.216 kg、1 bu/ac = 67.25 kg/ha、1 in = 2.54 cm、1 ft² = 0.0929 m²）。

---

## 1. 草丈・穂・止め葉
- **草丈（地面から穂先、芒は含まない）**
  - HRS（ノースダコタ州の NDSU 品種試験）：22〜43 in = **56〜109 cm**。年や場所で大きく変わる。
    - 2020年 Garrison：22〜27 in。
    - 2018年 Regent：30〜38 in（平均 33 in ≈ 84 cm）。
    - 2026年 Minot：25〜41 in。
  - HRW：
    - NDSU Minot 2015：28〜37 in = 71〜94 cm。
    - ネブラスカ大 Keith Co. 2025：26.9（KS Bill Snyder）〜33.2 in（Whistler）= 68〜84 cm。
  - 半矮性（Rht-B1b）が主流。TAM 111 は「半矮性としては背が高い」とされる。カンザス州の古い研究では、2遺伝子型の半矮性は倒伏がひどく、カンザスには合わなかった。
- **穂長（芒を除く）**：海外の普通小麦品種では平均 8.6〜11.3 cm、範囲 6.5〜16 cm。米国 HRW に限った値は見つからなかった。【推定】米国の品種は **7〜10 cm**。
- **穂の下端の高さ**：【推定】草丈から穂長を引いた値。草丈 75〜90 cm なら **65〜82 cm**。
- **止め葉**：開花後の子実肥大に効く光合成のおよそ75%を担う。Feekes 9 の時点で、茎には止め葉を含めて4枚の葉が見える。
  - 【推定】止め葉の葉耳（付け根）の位置は穂の基部より 15〜25 cm 下（穂首＝peduncle の長さに相当）。葉身は長さ 15〜25 cm、幅 1.2〜2 cm。数値の出典は見つからなかった。

## 2. 茎・節・色・芒
- **節**：Feekes 8（止め葉の出始め）で、地上に見える節は3つ、ときに4つ。【推定】熟期には地上の節間が 4〜5、その上に穂首が続く。倒伏への抵抗性は第2節間（下から2番目）の太さと壁の厚さで決まる。
- **茎の直径**：mm 単位の数値は検索の抜粋に出なかった。【推定】基部の節間は外径 **3〜4.5 mm**、穂首は 2〜3 mm（一般的な作物学の知見による）。
- **熟期の色**：Feekes 11.4 では「植物体全体が黄金色（golden）」。生理的成熟の目印は、穂首が緑色を失うこと。品種によっては下の方の葉が緑のまま残る。
- **芒**：米国 HRW・HRS の多くは有芒。GRIN（USDA の遺伝資源データベース）の記述子は芒を「有芒／芒が短い（awnletted）」といった区分で記録しており、長さは測っていない。【推定】芒の長さは **4〜8 cm**（穂の上部ほど長い）。

## 3. 条間・穂数・粒数
- **条間（ドリル播き）**：7.5 in = **19 cm** が標準。ほかに 10 in（25.4 cm）。15 in（38 cm）にすると減収は1〜11%（オハイオ州立大）。
- **収穫期の穂数**：
  - OSU と MSU：**60〜70 穂/ft² = 646〜753 穂/m²**。
  - バージニア工科大：70〜80 穂/ft²（753〜861 穂/m²）。
- **HRS の苗立ち目標**：
  - ミネソタ大：28〜30 株/ft² ≈ 300〜325 株/m²（130万株/ac）。
  - NDSU：収量が最大になるのは100万株/ac（23株/ft²）。
- **1穂あたりの粒数**：
  - OSU：20〜30 粒（1小穂に 2〜2.5 粒 × 8〜12 小穂）。
  - ネブラスカ：平均 22 粒。
  - Wheat Quality Council の収量予測法：1小穂 2.3 粒（ストレス時 2.1 粒）。
- **1穂の小穂数**：GRIN の遺伝資源（accession）では 19〜31。エクステンション資料の「6〜12」や「8〜12」は、稔実した小穂だけ、あるいは片側だけを数えているとみられる（推定）。

## 4. 収量・千粒重・容積重
- **全米平均（USDA NASS）**
  - 2025年 全小麦：53.3 bu/ac = **3.58 t/ha**。
  - 2025年 冬小麦：約 54.9 bu/ac（3.69 t/ha）。図からの読み取り値。
  - 2024年 冬小麦：51.7 bu/ac（3.48 t/ha）。
  - 2024年 春小麦：52.5 bu/ac（3.53 t/ha）。業界紙の値で、NASS の本文では未確認。
- **高収量の例（National Wheat Yield Contest）**
  - 灌漑 SWW（軟質白冬小麦）：231.37 bu/ac（15.6 t/ha、2022年の記録）。
  - 灌漑 HRW：223.08（15.0 t/ha、2024年）。
  - 天水 冬小麦：198.32（13.3 t/ha、2025年、オレゴン州）。
  - 天水 HRS：147.81（9.9 t/ha、2025年、ノースダコタ州）。
- **千粒重**：HRW は 26.0〜32.0 g、5年平均は 29.4〜29.8 g（US Wheat Associates）。HRS は【推定】28〜35 g。
- **容積重（test weight）**：
  - 基準 60 lb/bu → 単純換算で **772 kg/m³**、USDA の換算式で 78.9 kg/hl = 789 kg/m³。
  - NDSU の HRS 試験では 56〜64 lb/bu ≈ 720〜824 kg/m³。

## 5. 穀粒とそれ以外の比率・水分
- **収穫指数（HI）**：米国5クラス・255試験区の平均は **0.45**。HRW（テキサス州・オクラホマ州）はもっと低い。近代品種の上限はおよそ 0.4〜0.6。
- **わら：穀粒（地上部全体、乾物ベース）**
  - SDSU：1.3〜1.4。
  - WSU：1.16〜2.00（わら 70〜100 lb/bu）。
  - モンタナ州 NRCS：春小麦 1.33、冬小麦 1.67。
- **コンバインに入る MOG（穀粒以外の材料）：穀粒**
  - 刈高さが低いと 1.20。
  - 刈高さを 6 in（15 cm）上げると 0.85（処理能力 +49%）。
  - 12 in（30 cm）上げると 0.64（処理能力 +85%）。1985年の PAMI 系の試験。
- **穀粒水分**：
  - 取引基準は 13.5%（テキサス A&M）。インディアナ州では 13〜14% で刈る。
  - コンバインが最も効率よく動くのは 13〜20%。刈り始めは 20% から可能。
- **わらの水分**：エジプトの試験で 25.7%（穀粒 12.1% のとき）という1例だけ。【推定】米国平原部の晴れた日中で **10〜20%**。

## 6. 刈高さ
- **カンザス州立大の研究**：「最適」な刈高さは、穀粒の回収と残す株の高さの両方を最大にする高さで、**草丈のおよそ2/3**。年によって 7〜30 in になった。高い刈り株は風を弱め、蒸発を抑え、冬の積雪を捕まえるので、後作のトウモロコシが増収した。
- **テキサス州の試験**：刈高さ 36 cm を想定すると、刈り株は 1.7〜3.4 t/ha 残った（穀粒収量 3.4〜6.7 t/ha のとき）。
- **カナダの例**：刈高さを 10 cm 下げるごとに作業速度が約10%落ちる。15 cm ではなく 40 cm で刈ると、ヘッダーを通る量が減って効率が上がった。
- **用途別の考え方**：わらを回収するなら低く刈る（地際 5〜7 cm で、回収量は通常の約2.5倍）。処理能力と雪の捕捉を優先するなら高く刈る。
- 【推定】通常のヘッダーなら 15〜35 cm。背の低い作物や倒伏した作物ではフレックス・ドレーパーで 5〜10 cm。

## 7. 倒伏
- **起きやすい条件**：窒素の過多、密植、早播き、強風と雨。NDSU は 0（倒伏なし）〜9（地面にべったり）で採点するが、平原部の近年の試験ではほとんどの品種が 0〜1 だった。
- **形態**：
  - 茎倒伏：茎が下の方の節間で曲がるか折れる。
  - 根倒伏：根の固定が効かなくなり、株元から傾く（湿った土壌で起きる）。
- 【推定・3D】倒れる向きは風下にそろい、パッチ状に起きる。茎が地面から 20〜45°しか立っていない状態を再現する。穂が地面に触れ、穂首だけが光の方へ持ち上がる「グースネック」の形にする。

## 8. 3Dモデル化のヒント
- **葉**：熟期の茎には止め葉を含めて約4枚（F、F-1、F-2、F-3）が残る。葉は互い違いに付く。下の方の葉は枯れて垂れ下がるか、脱落する。
- **穂の構造**：
  - 穂軸の節間は 2〜7 mm。小穂は穂軸の左右に互い違いに付く。
  - 1小穂に小花が2〜5個あり、実るのは1〜3粒。
  - 中央の小穂ほど粒が多い。
- **色**【推定。出典はなく、写真の色から目安を置いた】
  - 穂：#C9A35A
  - わら：#DCC48A
  - 下部の茎：#B9A880
  - 芒：#B8925A
  - HRW の粒：#8B5A2B
  - 地面（刈り株の間）：#7A6A55

---

## 3D・検証に使う推奨値

| 項目 | 推奨値 | 幅 | 出典 |
|---|---|---|---|
| 草丈（穂先まで） | 80 cm | 56〜109 cm（HRW 68〜94） | NDSU、UNL |
| 穂長（芒を除く） | 9 cm | 6.5〜16 | 学術論文（推定込み） |
| 芒の長さ | 6 cm | 4〜8 | 推定 |
| 穂の下端の高さ | 71 cm | 草丈 − 穂長 | 計算 |
| 止め葉の葉耳 | 穂の基部の 20 cm 下 | 15〜25 cm | 推定 |
| 基部の茎径 | 3.5 mm | 3〜4.5 | 推定 |
| 地上の節数 | 4 | 3〜5 | Feekes の解説 |
| 条間 | 19 cm | 15〜25 | OSU、OSU-Ohio |
| 穂数 | 600 穂/m² | 450〜750 | OSU、MSU（下限は推定） |
| 粒数/穂 | 25 | 20〜30 | OSU、UNL |
| 小穂数/穂（総数） | 18 | 16〜22（稔実は 10〜12） | GRIN（推定込み） |
| 千粒重 | 30 g | 26〜32 | USW |
| 収量 | 4.5 t/ha（67 bu/ac、良好な圃場） | 平均 3.5〜3.7、最高 15.6 | NASS、NWYC |
| 容積重 | 772 kg/m³（60 lb/bu） | 720〜824 | USDA、NDSU |
| HI | 0.45 | 0.40〜0.50 | Dai ら |
| わら：穀粒（地上部全体） | 1.3 | 1.16〜2.0 | WSU、SDSU、MSU |
| MOG：穀粒（刈り取り後） | 0.9 | 0.64〜1.20 | PAMI / Gregg |
| 穀粒水分 | 13.5% | 12〜20% | TAMU、Rutgers、UADA |
| わらの水分 | 15% | 10〜26% | 推定（エジプトの1例） |
| 刈高さ | 25 cm | 10〜36 cm（草丈の 1/3〜2/3） | KSU、TX、PAMI |

**整合チェック**：600 穂/m² × 25 粒 × 30 mg = 450 g/m² = **4.5 t/ha** で、表の収量と矛盾しない。全米平均の 3.6 t/ha は、およそ 500 穂 × 24 粒 × 30 mg に当たる。

## 出典URL
- https://www.ag.ndsu.edu/northcentralrec/archive/variety-trial/2015/2015-winter-wheat
- https://www.ag.ndsu.edu/varietytrials/north-central-rec/2026-variety-trial-results/2026-variety-trial-results-hard-red-spring-wheat-minot-ncrec
- https://www.ag.ndsu.edu/varietytrialS/north-central-rec/2020-trial-results/hrsw2020garrison.pdf
- https://www.ag.ndsu.edu/varietytrialS/hettinger-rec/2018-trial-results/2018-trial-results-hard-red-spring-wheat-at-scranton-hrec
- https://cropwatch.unl.edu/sites/unl.edu.ianr.extension.cropwatch/files/media/file/2025-Keith-County-Rainfed.pdf
- https://foundationseed.tamu.edu/product/wheat-tam-111/
- https://bookstore.ksre.ksu.edu/download/wheat-production-handbook_C529
- https://extension.okstate.edu/fact-sheets/estimating-wheat-grain-yield-potential-2.html
- https://www.canr.msu.edu/agronomy/uploads/files/2020%20Crop%20Summit_Singh%20etal.pdf
- https://ag-pest-advisory.vaes.vt.edu/?p=2530
- https://extensionpubs.unl.edu/publication/g1429/na/html/view
- https://kswheat.com/node/2102
- https://bookstore.ksre.ksu.edu/download/estimating-wheat-yield_MF3044
- https://library.ndsu.edu/ir/items/5a9485c2-f0cf-44ea-90c4-57c260971cd4
- https://practicalfarmers.org/wp-content/uploads/2020/04/Ransom-Basic-of-spring-wheat-and-barley-production-2016.pdf
- https://stepupsoy.osu.edu/wheat-production/wide-row-wheat
- https://esmis.nal.usda.gov/sites/default/release-files/5t34sj573/xs55pd582/3t947p85w/smgr0925.pdf
- https://data.nass.usda.gov/Newsroom/Executive_Briefings/2025/09-30-2025.pdf
- https://millingmea.com/usdas-2024-us-wheat-production-estimated-at-highest-level-since-2016/
- https://westernagnetwork.com/the-national-wheat-yield-contest-celebrates-10th-anniversary-and-announces-2025-national-winners
- https://www.dtnpf.com/agriculture/web/ag/crops/article/2024/11/04/washington-farmer-tops-2024-national
- https://uswheat.org/wp-content/uploads/2024/07/2013-USW-Final-Harvest-Report-1-2-1.pdf
- https://grainscanada.gc.ca/en/grain-quality/grain-grading/grading-factors/conversion-charts
- https://scholars.uky.edu/en/publications/harvest-index-and-straw-yield-of-five-classes-of-wheat/
- https://pnwsteep.wsu.edu/pnw-conservation-tillage-handbook/how-much-straw-do-you-produce/
- https://landresources.montana.edu/fertilizerfacts/documents/FF33StrawSWWW.pdf
- https://extension.sdstate.edu/sites/default/files/2020-03/S-0005-12-Wheat.pdf
- https://agris.fao.org/search/ar/records/65df191263b8185d9caac57a
- https://iharf.ca/wp-content/uploads/2024/02/Combine-Adjustment-Nathan-Gregg.pdf
- https://www.grainews.ca/news/pami-engineer-offers-combine-adjustment-advice/
- https://www.no-tillfarmer.com/articles/1622-wheat-stubble-height-impacts-no-till-row-crop-yields
- https://www.canolacouncil.org/canola-watch/fundamentals/residue-management-begins-and-ends-at-harvest
- https://agrilife.org/texasrowcrops/2016/05/06/potential-income-losses-in-harvesting-dry-wheat-grain/
- https://plant-pest-advisory.rutgers.edu/wheat-harvest-and-storage/
- https://www.uaex.uada.edu/publications/PDF/FSA-1011.pdf
- https://www.agry.purdue.edu/Ext/corn/news/articles.08/wheatmgmt-0216.pdf
- https://journals.ekb.eg/article_106862.html
- https://blog-crop-news.extension.umn.edu/2025/07/physiological-maturity-in-wheat-barley.html
- https://www.aces.edu/blog/topics/crop-production/how-a-wheat-plant-develops-identifying-growth-stages/
- https://u.osu.edu/unioncountyanr/page/2/
- https://www.frontiersin.org/articles/10.3389/fpls.2025.1635721/full
- https://researchportal.murdoch.edu.au/esploro/outputs/journalArticle/Dissecting-culm-strength-in-wheat-anatomical/991005897388207891
- https://ahdb.org.uk/knowledge-library/an-introduction-to-lodging-in-cereals
- https://agrifoodscience.com/index.php/TURJAF/article/view/8628
- https://pmc.ncbi.nlm.nih.gov/articles/PMC5402986
- https://npgstest.ars-grin.gov/gringlobal/accessiondetail?id=1454503
