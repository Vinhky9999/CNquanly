// Photos typed in by hand are shrunk in the browser first (longest side 1400 px, JPEG), so a phone photo of several MB
// becomes a few hundred KB and fits the request and the database comfortably.

const MAX_SIDE = 1400;
const MAX_BYTES = 1_300_000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Không đọc được ảnh “${file.name}”.`));
    };
    img.src = url;
  });
}

/** Returns a JPEG data URL under ~1.3 MB, or throws a message for the owner. */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`“${file.name}” không phải là ảnh.`);
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Trình duyệt không xử lý được ảnh.");
  ctx.fillStyle = "#fff"; // transparent PNGs become white instead of black in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.88, 0.78, 0.66, 0.54]) {
    const url = canvas.toDataURL("image/jpeg", quality);
    // base64 is 4/3 of the bytes
    if ((url.length * 3) / 4 <= MAX_BYTES) return url;
  }
  throw new Error(`Ảnh “${file.name}” quá lớn, hãy chọn ảnh nhỏ hơn.`);
}

export async function filesToDataUrls(files: FileList | File[]): Promise<{ urls: string[]; errors: string[] }> {
  const urls: string[] = [];
  const errors: string[] = [];
  for (const file of Array.from(files)) {
    try {
      urls.push(await fileToDataUrl(file));
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "Không đọc được ảnh.");
    }
  }
  return { urls, errors };
}
