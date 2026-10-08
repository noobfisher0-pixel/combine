"""design.md v0.2 §4.2 の主要な隙間・寸法を確認する計算（review.md 付録）。

座標系: +X 前、+Y 上、+Z 右、単位 m。実装後は tests/collision.test.ts に置き換える。
実行: python3 docs/layout-check.py
"""
import math as m

d = m.radians

# --- ロータ（前端 +0.40 / 軸高 1.85、3° 後ろ上がり、長さ 3.10） ---
ROTOR_FRONT, ROTOR_REAR, ROTOR_Y0, SLOPE = 0.40, -2.70, 1.85, d(3)
CAGE_IN, CAGE_OUT = 0.40, 0.45


def rotor_axis_y(x):
    return ROTOR_Y0 + (ROTOR_FRONT - x) * m.tan(SLOPE)


print("ロータ後端の軸高", round(rotor_axis_y(ROTOR_REAR), 3))
print("ケージ上端 @キャブ後端 x=-0.45:", round(rotor_axis_y(-0.45) + CAGE_OUT, 3), "/ キャブ床 2.40")
print("ケージ上端 @ロータ後端:", round(rotor_axis_y(ROTOR_REAR) + CAGE_OUT, 3), "/ タンク底 2.55")
print("コンケーブ下端 @x=-0.10:", round(rotor_axis_y(-0.10) - CAGE_IN - 0.05, 3),
      "/ グレインパン上端+振幅", 1.22 + 0.015 + 0.02)

# --- グレインタンク ---
W, L, TOP, BOT = 2.90, 3.00, 3.92, 2.55
body = W * L * (TOP - BOT) - ((W - 0.5) / 2 * 0.5) * L  # V 底（下 0.5 m で幅 0.5 まで絞る）
FLAP = 0.40
ext = L * W * FLAP + 2 * (L + W) * FLAP * (FLAP * m.sin(d(20))) / 2  # 20° 外傾ぶんを加算
print("タンク 本体", round(body, 2), "延長", round(ext, 2), "合計", round(body + ext, 2), "/ 定格 14.1")

# --- フィーダとヘッダ ---
PX, PY = 0.95, 1.85  # フィーダ後端ピボット
print("フィーダ長", round(m.hypot(3.05 - PX, 0.75 - PY), 3),
      "傾斜", round(m.degrees(m.atan2(PY - 0.75, 3.05 - PX)), 1))


def rotate_about_pivot(p, deg):
    x, y = p[0] - PX, p[1] - PY
    c, s = m.cos(d(deg)), m.sin(d(deg))
    return (round(PX + x * c - y * s, 3), round(PY + x * s + y * c, 3))


for a in (-1.3, 0, 12):
    print("刈刃 @", a, "°", rotate_about_pivot((5.30, 0.10), a))
print("背板上端 @+12°", rotate_about_pivot((3.20, 1.20), 12))
reel = rotate_about_pivot((5.10, 1.05), 12)
print("リール中心 @+12°", reel, "最上げ時の上端", round(reel[1] + 0.40 + 0.535, 3))

# --- 排出オーガ（縦軸を前方へ 12° 傾け、格納時は横管が水平・前向き） ---
TILT, TUBE = d(12), 7.9
ELBOW = (-3.19, 3.55, -1.68)
k = (m.sin(TILT), m.cos(TILT), 0.0)  # 回転軸（上端が前へ傾く）
v = (1.0, 0.0, 0.0)                   # 格納時の横管の向き
for ang in (90, 95):
    a = d(ang)
    kv = sum(i * j for i, j in zip(k, v))
    kxv = (k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0])
    dv = [v[i] * m.cos(a) + kxv[i] * m.sin(a) + k[i] * kv * (1 - m.cos(a)) for i in range(3)]
    spout = [ELBOW[i] + TUBE * dv[i] for i in range(3)]
    print("オーガ", ang, "° 仰角", round(m.degrees(m.asin(dv[1])), 1),
          "吐出口 x,y,z", round(spout[0], 2), round(spout[1] - 0.30, 2), round(spout[2], 2))
print("格納時の先端 x", round(ELBOW[0] + TUBE, 2), "全長（ヘッダなし）", round(ELBOW[0] + TUBE + 5.40, 2))

# --- エレベータと前輪 ---
print("エレベータ前面 x", -1.30 + 0.175, "/ 前輪後端", -1.025)

# --- 後輪操舵とチョッパ（簡易：タイヤ内側前角の z） ---
R, TW, ZC, CHOP_HALF = 0.82, 0.75, 1.52, 0.65
for st in (35, 40, 45):
    a = d(st)
    print("操舵", st, "° タイヤ内端 z≈", round(ZC - TW / 2 * m.cos(a) - R * m.sin(a), 3),
          "/ チョッパ半幅", CHOP_HALF)
