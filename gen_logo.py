# Gera os icones do app replicando o logo SVG do cabecalho do index.html:
# card arredondado (2,4)-(22,20) r=2 com gradiente roxo diagonal e o check vazado.
from PIL import Image, ImageDraw

C1 = (179, 102, 240)   # --accent-playing (gog) - canto sup. esquerdo
C2 = (138, 92, 240)    # --accent-finished (gog) - canto inf. direito
BG = (13, 13, 19)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def gradient(size):
    g = Image.new("RGB", (size, size))
    gd = ImageDraw.Draw(g)
    for yy in range(size):
        c = lerp(C1, C2, yy / size)
        gd.line([(0, yy), (size, yy)], fill=c)
    return g

CHECK = [  # path M10.59 17.41 L7 13.83 L8.41 12.41 L10.59 14.58 L15.59 9.59 L17 11 Z, grid 24
    (10.59, 17.41), (7, 13.83), (8.41, 12.41), (10.59, 14.58), (15.59, 9.59), (17, 11)
]

def logo_mask(size, box):
    x0, y0, x1, y1 = box
    k = (x1 - x0) / 24.0
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    cx0, cy0, cx1, cy1 = x0 + 2 * k, y0 + 4 * k, x0 + 22 * k, y0 + 20 * k
    d.rounded_rectangle([cx0, cy0, cx1, cy1], radius=2 * k, fill=255)
    pts = [(x0 + px * k, y0 + py * k) for px, py in CHECK]
    d.polygon(pts, fill=0)
    return m

def make_hi(size, out, maskable=False):
    hi = size * 4
    img = Image.new("RGBA", (hi, hi), BG + (255,) if maskable else (0, 0, 0, 0))
    pad = int(hi * 0.18) if maskable else int(hi * 0.04)
    box = (pad, pad, hi - pad, hi - pad)
    m = logo_mask(hi, box)
    img.paste(gradient(hi), (0, 0), m)
    img.resize((size, size), Image.LANCZOS).save(out)

make_hi(192, r"D:\Documentos\GitHub\zeralog\icons\logo-192.png")
make_hi(512, r"D:\Documentos\GitHub\zeralog\icons\logo-512.png")
make_hi(512, r"D:\Documentos\GitHub\zeralog\icons\logo-512-maskable.png", maskable=True)
print("ok")
