# 配樂＋音效混成一條音軌：python3 tools/mix_sfx.py（在專案根目錄執行）
# 音效來自 ElevenLabs（子 session 生成），時間點對齊 main.js 的故事時間 T。
import subprocess, numpy as np
SR = 44100; DUR = 72.0; N = int(SR * DUR)
rng = np.random.default_rng(11)

def dec(p, extra=()):
    raw = subprocess.run(['ffmpeg', '-v', 'error', *extra, '-i', p, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32).reshape(-1, 2).copy()

music = dec('music/volatile_reaction.mp3', ['-t', str(DUR)])[:N]
music = np.pad(music, ((0, N - len(music)), (0, 0)))
t = np.arange(N) / SR
music *= np.clip((72 - t) / 3.5, 0, 1)[:, None]          # 68.5 → 72 淡出
fx = np.zeros((N, 2), np.float32)

cache = {}
def clip(name):
    if name not in cache:
        x = dec(f'sfx/{name}.mp3'); cache[name] = x / max(np.abs(x).max(), 1e-6)
    return cache[name]
def env(x, w): m = np.abs(x).max(1); k = max(1, int(w * SR)); return np.convolve(m, np.ones(k) / k, 'same')
def onset(x): e = env(x, .004); return int(np.argmax(e > .12 * e.max()))
def peak(x): return int(np.argmax(env(x, .05)))
def pitch(x, r):
    if abs(r - 1) < 1e-3: return x
    idx = np.arange(0, len(x) - 1, r); i = idx.astype(int); f = (idx - i)[:, None]
    return (x[i] * (1 - f) + x[i + 1] * f).astype(np.float32)
def put(x, at, g, pan=0., maxlen=None):
    if maxlen: x = x[:int(maxlen * SR)]
    x = x.copy(); fl = min(int(.03 * SR), len(x) // 2); x[-fl:] *= np.linspace(1, 0, fl)[:, None]
    i = int(round(at * SR))
    if i < 0: x = x[-i:]; i = 0
    n = min(len(x), N - i)
    if n <= 0: return
    fx[i:i + n, 0] += x[:n, 0] * g * (1 - max(pan, 0)); fx[i:i + n, 1] += x[:n, 1] * g * (1 + min(pan, 0))
def on(name, at, g, pan=0., r=1., maxlen=None):   # 起音對在 at
    x = pitch(clip(name), r); put(x[max(onset(x) - 60, 0):], at, g, pan, maxlen)
def pk(name, at, g, pan=0., r=1.):                # 峰值對在 at
    x = pitch(clip(name), r); put(x, at - peak(x) / SR, g, pan)
def end(name, at, g):                              # 結尾對在 at（上升音）
    x = clip(name); e = env(x, .02); last = len(e) - int(np.argmax(e[::-1] > .1 * e.max()))
    put(x[:last], at - last / SR, g)
J = lambda a: 1 + rng.uniform(-a, a)

# 開場：開燈、座標軸畫出
on('flashlight_click', .32, .45)
# 字幕：每句一記打字機（跟大音效撞在一起的句子略過）
CAPS = [.6, 3.7, 7.4, 10.9, 14.9, 19.4, 22.9, 26.5, 33.7, 37.1, 40.2, 43.7, 47.2, 50.4, 54.0, 58.8, 61.4, 64.8]
for c in CAPS: on('typewriter_key', c + .02, .26 * J(.15), rng.uniform(-.2, .2), J(.05), .35)
# 鏡頭硬切：風切峰值對在切點
for c in (7, 14.7, 19.2, 37.1, 39.8, 50.2, 58.95, 64.4):
    pk('whoosh', c, .32, rng.uniform(-.4, .4), J(.08))
# STEP 02 現況：起點點亮、三圈鎖定
on('chime', 7.2, .3, 0, .75, 1.6); on('impact', 7.2, .32)
for i in range(3): on('lock_on', 7.8 + i * .45 - .64, .2, -.3 + i * .3, 1 + i * .06)
# 上層理想雷射
on('energy_pulse', 14.75, .75, -.6, .85); on('slam', 15.6, .42, .2, .9)
# 問題碎片：飛散、分群、排進矩陣、關鍵格亮
on('notes_flutter', 18.55, .55)
pk('whoosh', 22.4, .22, .3, .8); on('slam', 25.25, .3, 0, 1.15)
pk('lock_on', 28.3, .4)
on('energy_pulse', 29.15, .55, .3, 1.15)
# STEP 04 目標點燃（音樂 drop）
end('riser', 30.0, .42); on('ignite', 30.0, .75); on('impact', 30.0, .5)
for i in range(7): on('chime', 31.1 + i * .42 + .3, .16, -.45 + i * .15, 2 ** (i * 2 / 12), 1.1)
# 資訊卡
for c in (9.4, 15.8, 26.4, 34.2, 44.2, 51.2): on('card_slap', c, .22, rng.uniform(-.3, .3), J(.05))
# STEP 05 假設成形、資源光束、規格掃描
on('chime', 40.2, .26, 0, .9, 1.6); on('energy_pulse', 41.0, .45, 0, 1.0)
end('riser', 48.8, .2); on('lock_on', 48.8 - .64, .3)
# STEP 06 測試：四次脈衝撞擊，越來越重
on('energy_pulse', 50.3, .5, -.4)
for i, c in enumerate((51.0, 52.6, 54.2, 55.8)):
    on('energy_pulse', c - .6, .3, -.3, 1 + i * .05); on('impact', c, .35 + i * .08); on('slam', c, .28 + i * .05, 0, 1 - i * .04)
end('riser', 57.5, .5)
# 碎裂＋子彈時間、重組
on('glass_shatter', 57.5, .75); on('impact', 57.5, .45)
pk('glass_assemble', 60.45, .6)
on('chime', 60.6, .3, -.2, 1.0, 1.6)
# 光束接力：假設 01′ → 02 → 目標
on('energy_pulse', 60.4, .35, -.3, 1.1); on('energy_pulse', 61.1, .35, 0, 1.2); on('energy_pulse', 61.9, .35, .3, 1.3)
on('chime', 61.8, .3, .2, 1.26, 1.6)
on('resolve', 62.5, .75)
# 片尾卡
on('chime', 66.2, .22, 0, .75)

# 音效整體推高；大音效出現時配樂自動閃避（sidechain ducking），最後交給 ffmpeg 限幅
fx *= 2.2
e = np.abs(fx).max(1); k = int(.03 * SR); e = np.convolve(e, np.ones(k) / k, 'same')
duck = np.zeros(N, np.float32); g = 0.; rel = np.exp(-1 / (.45 * SR))
tgt = np.clip((e - .15) / .6, 0, 1) * .5                    # 最多閃避約 −6 dB
for i in range(N):
    g = tgt[i] if tgt[i] > g else g * rel + tgt[i] * (1 - rel); duck[i] = g
mix = (music * .62 * (1 - duck)[:, None] + fx).astype(np.float32)
mix *= 1.1 / np.percentile(np.abs(mix), 99.95)            # 極少數瞬間峰值交給限幅器
for name, data in (('sfx_only.wav', fx), ('soundtrack.wav', mix)):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', name], input=data.astype(np.float32).tobytes(), check=True)
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'soundtrack.wav', '-af', 'alimiter=limit=0.84:attack=3:release=60:level=false', '-c:a', 'libmp3lame', '-b:a', '192k', 'music/soundtrack.mp3'], check=True)
print('peak', float(np.abs(mix).max()), 'sfx used', len(cache))
