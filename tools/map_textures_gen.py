# Procedural, seamlessly tiling PBR-ish textures (diffuse + normal) for Dead Recoil maps.
import numpy as np
from PIL import Image, ImageFilter
import sys, os
OUT = os.path.dirname(os.path.abspath(__file__))
N = 512
rng = np.random.default_rng(1234)

def vnoise(res, seed):
    r = np.random.default_rng(seed).random((res, res))
    # bicubic-ish upsample with wrap -> seamless
    x = np.linspace(0, res, N, endpoint=False)
    i0 = np.floor(x).astype(int); f = x - i0; f = f*f*(3-2*f)
    i1 = (i0 + 1) % res
    a = r[i0][:, i0]; b = r[i0][:, i1]; c = r[i1][:, i0]; d = r[i1][:, i1]
    fx = f[None, :]; fy = f[:, None]
    return (a*(1-fx)+b*fx)*(1-fy) + (c*(1-fx)+d*fx)*fy

def fbm(base, octaves, seed, gain=0.5):
    s = np.zeros((N, N)); amp = 1; tot = 0; res = base
    for o in range(octaves):
        if res > N: break
        s += vnoise(res, seed + o*31) * amp; tot += amp; amp *= gain; res *= 2
    return s / tot

def normal_from_height(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    n = np.dstack([-dx, dy, np.ones_like(h)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return ((n * 0.5 + 0.5) * 255).astype(np.uint8)

def save(name, rgb, height=None, strength=6, q=86, nq=78, size=None):
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    if size: img = img.resize((size, size), Image.LANCZOS)
    img.save(f"{OUT}/{name}_diff.jpg", quality=q, optimize=True, progressive=True)
    if height is not None:
        nm = Image.fromarray(normal_from_height(height, strength)).resize((256, 256), Image.LANCZOS)
        nm.save(f"{OUT}/{name}_nor.jpg", quality=nq, optimize=True)

yy, xx = np.mgrid[0:N, 0:N] / N

def concrete():
    base = fbm(4, 7, 11)
    pores = (vnoise(256, 5) > 0.93).astype(float) * vnoise(128, 9)
    stain = fbm(2, 4, 77)
    h = base*0.6 + fbm(32, 4, 3)*0.4 - pores*0.5
    v = 150 + (base-0.5)*70 + (fbm(64, 3, 8)-0.5)*30 - pores*60 - np.clip(stain-0.55, 0, 1)*120
    # formwork tie holes: 2x2 per tile
    for cx in (0.25, 0.75):
        for cy in (0.25, 0.75):
            d = np.sqrt(((xx-cx+0.5) % 1 - 0.5)**2 + ((yy-cy+0.5) % 1 - 0.5)**2)
            hole = np.clip(1 - d/0.012, 0, 1)
            v -= hole*70; h -= hole*0.8
    # faint panel seam
    seam = np.exp(-((yy % 0.5) / 0.004)**2) + np.exp(-((xx % 1.0) / 0.003)**2)
    v -= seam*25; h -= seam*0.25
    rgb = np.dstack([v*1.0, v*0.99, v*0.95])
    save("concrete_wall_008", rgb, h, strength=7)

def hospital():
    stipple = fbm(128, 2, 21)
    base = fbm(6, 5, 22)
    scuff = np.clip(fbm(16, 4, 23) - 0.66, 0, 1) * 2
    cracks = np.zeros((N, N))
    r = np.random.default_rng(5)
    for _ in range(6):
        x, y = r.random()*N, r.random()*N; ang = r.random()*6.28
        for t in range(int(40 + r.random()*120)):
            ang += (r.random()-0.5)*0.6; x = (x + np.cos(ang)) % N; y = (y + np.sin(ang)) % N
            cracks[int(y), int(x)] = 1
    cracks = np.array(Image.fromarray((cracks*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))) / 255.0
    v = 222 + (base-0.5)*14 + (stipple-0.5)*8 - scuff*22 - cracks*55
    h = stipple*0.22 + base*0.15 - cracks*0.55
    rgb = np.dstack([v*0.97, v*1.0, v*0.98])
    # grime splotches
    g = np.clip(fbm(3, 5, 29) - 0.62, 0, 1) * 1.2
    rgb -= g[..., None] * np.array([10, 9, 6])
    save("hospital_paint", rgb, h, strength=5)

def lab():
    v = np.full((N, N), 92.0)
    brushed = np.array(Image.fromarray((vnoise(512, 41)*255).astype(np.uint8)).filter(ImageFilter.BoxBlur(0)).resize((N, N)))/255.0
    streak = vnoise(512, 42)[:, :1].repeat(N, 1)  # horizontal brushing
    h = np.zeros((N, N))
    v += (streak-0.5)*18 + (fbm(8, 5, 43)-0.5)*22
    # 2x2 panels with bevelled seams
    px = (xx*2) % 1; py = (yy*2) % 1
    edge = np.minimum(np.minimum(px, 1-px), np.minimum(py, 1-py))
    seam = np.clip(1 - edge/0.012, 0, 1)
    bevel = np.clip(1 - edge/0.03, 0, 1)
    v -= seam*55; v += (bevel - seam)*14
    h += -seam*1.0 + bevel*0.25
    # rivets
    for cx in (0.06, 0.44, 0.56, 0.94):
        for cy in (0.06, 0.44, 0.56, 0.94):
            d = np.sqrt((xx-cx)**2 + (yy-cy)**2)
            rv = np.clip(1 - d/0.009, 0, 1)
            v += rv*40; h += np.sqrt(rv)*0.8
    # grime running down from seams + rust spots
    grime = np.clip(fbm(4, 6, 44) - 0.55, 0, 1)*2.2
    run = np.clip(np.roll(seam, 6, 0) * 0 + fbm(64, 3, 45)*np.clip(1-py*1.4, 0, 1)*0.0, 0, 1)
    v -= grime*36
    rgb = np.dstack([v*0.92, v*0.97, v*1.06])
    rust = np.clip(fbm(16, 4, 46) - 0.7, 0, 1)*3
    rgb += rust[..., None]*np.array([40, 8, -20])
    save("lab_panel", rgb, h, strength=6)

def facade():
    # 4 floors x 3 bays per tile; concrete frame, glazed windows, some lit (warm/cold), blinds.
    r = np.random.default_rng(77)
    conc = 64 + (fbm(8, 5, 51)-0.5)*26 + (fbm(64, 3, 52)-0.5)*10
    rgb = np.dstack([conc*0.95, conc*1.0, conc*1.04])
    emit = np.zeros((N, N, 3))
    h = fbm(32, 3, 53)*0.2
    rows, cols = 4, 3
    for i in range(rows):
        for j in range(cols):
            x0 = int((j + 0.16)/cols*N); x1 = int((j + 0.84)/cols*N)
            y0 = int((i + 0.22)/rows*N); y1 = int((i + 0.80)/rows*N)
            lit = r.random()
            glass = np.array([22, 30, 38]) + r.random()*10
            sub = rgb[y0:y1, x0:x1]
            sub[:] = glass
            hh = y1-y0; ww = x1-x0
            gy, gx = np.mgrid[0:hh, 0:ww]
            refl = (gx/ww*0.6 + (1-gy/hh)*0.4)
            sub += refl[..., None]*np.array([16, 20, 26])
            if lit < 0.3:
                warm = r.random() < 0.72
                col = np.array([255, 196, 120]) if warm else np.array([170, 210, 255])
                inten = 0.55 + r.random()*0.45
                blinds = (gy % 6 < 2) * (r.random() < 0.5)
                curtain = np.clip(1 - np.abs(gx/ww - 0.5)*2.4, 0, 1) * (r.random() < 0.4)
                k = inten * (1 - blinds*0.55) * (1 - curtain*0.5) * (0.75 + 0.25*(1-gy/hh))
                sub[:] = col*k[..., None]*0.8 + sub*0.2
                emit[y0:y1, x0:x1] = col*k[..., None]
            elif lit < 0.4:
                sub[:] = sub*0.4  # broken/dark
            # frame + sill
            rgb[y0-3:y0, x0-3:x1+3] = 40; rgb[y1:y1+5, x0-5:x1+5] = 96
            rgb[y0:y1, (x0+x1)//2-1:(x0+x1)//2+1] = 34
            h[y0:y1, x0:x1] -= 0.6; h[y1:y1+5, x0-5:x1+5] += 0.4
    # floor slab bands
    for i in range(rows):
        y = int(i/rows*N); rgb[y:y+6] *= 0.75; h[y:y+6] += 0.3
    dirt = np.clip(fbm(4, 5, 54)-0.5, 0, 1)*50
    rgb -= dirt[..., None]
    save("facade_night", rgb, h, strength=4)
    Image.fromarray(np.clip(emit, 0, 255).astype(np.uint8)).save(f"{OUT}/facade_night_emit.jpg", quality=80, optimize=True)

for f in sys.argv[1:] or ["concrete", "hospital", "lab", "facade"]:
    globals()[f]()
print("ok")
