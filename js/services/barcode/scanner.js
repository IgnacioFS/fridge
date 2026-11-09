// Escáner con cámara: usa BarcodeDetector si existe y, si no (Safari iOS), el decodificador propio.
import { decodeImage, checksumOK } from './ean.js';

export class ScannerError extends Error {
  /** kind: 'unsupported' | 'denied' | 'notfound' | 'busy' | 'insecure' | 'unknown' */
  constructor(kind, message) { super(message); this.kind = kind; }
}

export function cameraSupported() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

export class BarcodeScanner {
  constructor(video, { onDetect, interval = 120 } = {}) {
    this.video = video;
    this.onDetect = onDetect;
    this.interval = interval;
    this.stream = null;
    this.running = false;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.detector = null;
    this.lastCode = null;
    this.hits = 0;
    this.torchOn = false;
  }

  async start() {
    if (!window.isSecureContext) throw new ScannerError('insecure', 'La cámara solo funciona en conexiones seguras (HTTPS)');
    if (!cameraSupported()) throw new ScannerError('unsupported', 'Este navegador no permite usar la cámara');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (e) {
      const n = e?.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') throw new ScannerError('denied', 'Permiso de cámara denegado');
      if (n === 'NotFoundError' || n === 'OverconstrainedError') throw new ScannerError('notfound', 'No se ha encontrado ninguna cámara');
      if (n === 'NotReadableError') throw new ScannerError('busy', 'La cámara está siendo usada por otra app');
      throw new ScannerError('unknown', 'No se pudo abrir la cámara');
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    if ('BarcodeDetector' in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats();
        const want = ['ean_13', 'ean_8', 'upc_a'].filter((f) => formats.includes(f));
        if (want.length) this.detector = new window.BarcodeDetector({ formats: want });
      } catch { this.detector = null; }
    }
    this.running = true;
    this.loop();
  }

  get hasTorch() {
    const track = this.stream?.getVideoTracks?.()[0];
    return !!track?.getCapabilities?.().torch;
  }

  async toggleTorch() {
    const track = this.stream?.getVideoTracks?.()[0];
    if (!track) return false;
    this.torchOn = !this.torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: this.torchOn }] }); } catch { this.torchOn = false; }
    return this.torchOn;
  }

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  async loop() {
    if (!this.running) return;
    try {
      const code = await this.detectFrame();
      if (code) {
        // Confirmación: el mismo código en dos lecturas seguidas evita falsos positivos.
        if (code === this.lastCode) this.hits++; else { this.lastCode = code; this.hits = 1; }
        if (this.hits >= 2) { this.running = false; this.onDetect?.(code); return; }
      }
    } catch (e) { console.warn('scan', e); }
    this.timer = setTimeout(() => this.loop(), this.interval);
  }

  async detectFrame() {
    const v = this.video;
    if (!v.videoWidth || v.readyState < 2) return null;
    if (this.detector) {
      const res = await this.detector.detect(v);
      const c = res.map((r) => r.rawValue).find((x) => /^\d+$/.test(x));
      if (!c) return null;
      const norm = c.length === 12 ? `0${c}` : c;
      return checksumOK(norm) ? norm : null;
    }
    // Recorte central (franja del visor) y escala de grises.
    const vw = v.videoWidth, vh = v.videoHeight;
    const cropW = Math.round(vw * 0.9);
    const cropH = Math.round(vh * 0.6);
    const sx = Math.round((vw - cropW) / 2), sy = Math.round((vh - cropH) / 2);
    const w = Math.min(960, cropW);
    const h = Math.round(cropH * (w / cropW));
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, w, h);
    const { data } = this.ctx.getImageData(0, 0, w, h);
    const gray = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < gray.length; i++, j += 4) gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return decodeImage(gray, w, h, { lines: 15, minVotes: 1 });
  }
}
