"""Genera tests/e2e/barcode.y4m: vídeo sintético con un EAN-13 para la cámara falsa de Chrome."""
import subprocess, json, sys, os
code = sys.argv[1] if len(sys.argv) > 1 else '8410188012092'
root = os.path.dirname(os.path.abspath(__file__))
mods = json.loads(subprocess.check_output(['node', '-e', f"import('{root}/../../js/services/barcode/ean.js').then(m=>console.log(JSON.stringify(m.encodeModules('{code}'))))"]))
W, H, scale = 640, 480, 4
bw = len(mods) * scale; x0 = (W - bw) // 2; y0 = 150; bh = 180
Y = bytearray(W * H)
for y in range(H):
    for x in range(W):
        v = 200 - (x // 8 % 2) * 3
        if y0 <= y < y0 + bh and x0 <= x < x0 + bw and mods[(x - x0) // scale]: v = 35
        Y[y * W + x] = v
UV = bytes([128] * (W * H // 4))
with open(os.path.join(root, 'barcode.y4m'), 'wb') as f:
    f.write(f'YUV4MPEG2 W{W} H{H} F15:1 Ip A1:1 C420jpeg\n'.encode())
    for _ in range(15):
        f.write(b'FRAME\n'); f.write(bytes(Y)); f.write(UV); f.write(UV)
