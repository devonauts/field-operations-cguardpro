import Tesseract from "tesseract.js";

export interface ScanResult {
  text: string;
  idNumber?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string; // YYYY-MM-DD
  expiryDate?: string; // YYYY-MM-DD
}

/**
 * Downscale an image (a phone ID photo is multi-megapixel; OCR time scales with
 * pixel count) to at most `maxDim` on its longest side before OCR. Returns a
 * JPEG data URL, or the original on any failure. This is the single biggest
 * speed win for on-device Tesseract.
 */
async function downscale(image: string | File, maxDim = 1400): Promise<string | File> {
  try {
    const url = typeof image === "string" ? image : URL.createObjectURL(image);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const longest = Math.max(img.width, img.height);
    const scale = longest > maxDim ? maxDim / longest : 1;
    if (scale >= 1) {
      if (typeof image !== "string") URL.revokeObjectURL(url);
      return image; // already small enough
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) { if (typeof image !== "string") URL.revokeObjectURL(url); return image; }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (typeof image !== "string") URL.revokeObjectURL(url);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return image;
  }
}

/**
 * Run OCR on an ID image (open-source Tesseract.js, Spanish) and best-effort
 * extract the document number and a name. The image is downscaled first for
 * speed; the guard always reviews/edits the result before saving.
 */
export async function scanId(
  image: string | File,
  onProgress?: (p: number) => void
): Promise<ScanResult> {
  const prepared = await downscale(image);
  // Spanish only: LATAM IDs are Spanish and the MRZ is plain A–Z0–9<, so the
  // English model just doubled the download + recognition time for no gain.
  const { data } = await Tesseract.recognize(prepared, "spa", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress);
    },
  });
  const text = (data.text || "").trim();
  return { text, ...parseId(text) };
}

function parseId(text: string): Omit<ScanResult, "text"> {
  const out: Omit<ScanResult, "text"> = {};
  const upper = text.toUpperCase();

  // Document number: prefer a label, else the longest 8–13 digit run.
  const labeled =
    /(?:C[ÉE]DULA|DOCUMENTO|DNI|ID|N[ÚU]MERO|NO\.?)[^\d]{0,12}([\d.\s-]{8,20})/i.exec(text);
  let digits: string | undefined;
  if (labeled) digits = labeled[1].replace(/\D/g, "");
  if (!digits || digits.length < 8) {
    const runs = (text.match(/\d[\d.\s-]{6,}\d/g) || [])
      .map((s) => s.replace(/\D/g, ""))
      .filter((s) => s.length >= 8 && s.length <= 13)
      .sort((a, b) => b.length - a.length);
    if (runs[0]) digits = runs[0];
  }
  if (digits) out.idNumber = digits;

  // Dates: parse all DD/MM/YYYY, YYYY-MM-DD, DD MMM YYYY → ISO. Then assign
  // DOB (oldest, in the past) and expiry (latest / future) — prefer labels.
  const dates = extractDates(text);
  const labeledBirth = nearLabel(text, /(NACIMIENTO|BIRTH|NACIM)/i);
  const labeledExp = nearLabel(text, /(VENCIMIENTO|EXPIRACI|EXPIR|CADUCIDAD|VALID|VENCE)/i);
  if (labeledBirth) out.birthDate = labeledBirth;
  if (labeledExp) out.expiryDate = labeledExp;
  if ((!out.birthDate || !out.expiryDate) && dates.length) {
    const now = Date.now();
    const past = dates.filter((d) => +new Date(d) < now).sort();
    const future = dates.filter((d) => +new Date(d) >= now).sort();
    if (!out.birthDate && past.length) out.birthDate = past[0];
    if (!out.expiryDate && future.length) out.expiryDate = future[future.length - 1];
  }

  // Names — three strategies, best first:
  //   1) MRZ name line on the back ("SURNAME<<GIVEN<NAMES") — most reliable.
  //   2) APELLIDOS / NOMBRES labels, taking the value on the same line OR the
  //      next line (LATAM IDs print the value under the label). We stop at the
  //      end of the line and skip label lines, so we never swallow the next
  //      label as the value (the previous cause of garbage names).
  //   3) Fallback: the longest two-word all-caps line that isn't a label.
  const lines = upper
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const mrz = parseMrzName(lines);
  if (mrz) {
    out.lastName = mrz.lastName;
    out.firstName = mrz.firstName;
  }

  if (!out.lastName) out.lastName = labelValue(lines, /\bAPELLIDOS?\b/);
  if (!out.firstName) out.firstName = labelValue(lines, /\bNOMBRES?\b/);

  if (!out.firstName && !out.lastName) {
    const cand = lines
      .map((l) => cleanName(l))
      .filter((l): l is string => !!l && l.split(" ").length >= 2 && !isLabelLine(l))
      .sort((a, b) => b.length - a.length);
    if (cand[0]) {
      const parts = cand[0].split(" ");
      out.lastName = parts.slice(0, 2).join(" ");
      out.firstName = parts.slice(2).join(" ") || undefined;
    }
  }
  return out;
}

// Words that mark a label line on an ID — never a name value.
const LABEL_WORDS =
  /(APELLIDO|NOMBRE|C[ÉE]DULA|DOCUMENTO|IDENTIDAD|NACIONALIDAD|NACIM|SEXO|GENERO|LUGAR|FECHA|VENCIMIENTO|EXPIR|CADUCIDAD|FIRMA|REP[ÚU]BLICA|REPUBLICA|ECUADOR|REGISTRO|CIVIL|TARJETA|PASAPORTE|PASSPORT|LICENC|DIRECCI)/;

function isLabelLine(s: string): boolean {
  return LABEL_WORDS.test(s.toUpperCase());
}

/** Keep only letters + spaces; require ≥2 alphabetic chars; Title-case. */
function cleanName(s: string): string | undefined {
  const v = s
    .replace(/[^A-ZÁÉÍÓÚÑ ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (v.replace(/\s/g, "").length < 2) return undefined;
  return v
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

/** Value for a label: same-line text after it, else the next name-like line. */
function labelValue(lines: string[], label: RegExp): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    const m = label.exec(lines[i].toUpperCase());
    if (!m) continue;
    const after = lines[i].slice(m.index + m[0].length);
    const same = cleanName(after);
    if (same && !isLabelLine(after)) return same;
    for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
      if (isLabelLine(lines[j])) continue;
      const v = cleanName(lines[j]);
      if (v) return v;
    }
  }
  return undefined;
}

/** Parse the MRZ name line ("SURNAME<<GIVEN<NAMES") if the back was scanned. */
function parseMrzName(
  lines: string[],
): { lastName: string; firstName?: string } | undefined {
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, "").toUpperCase();
    // MRZ rows are 20–46 chars of [A-Z0-9<]; the name field contains one "<<".
    if (l.length < 20 || l.length > 46 || !/^[A-Z0-9<]+$/.test(l)) continue;
    const idx = l.indexOf("<<");
    if (idx <= 0) continue;
    const surname = l.slice(0, idx).replace(/</g, " ").trim();
    const given = l.slice(idx + 2).replace(/</g, " ").trim();
    if (!/[A-Z]{2,}/.test(surname)) continue; // skip the numeric MRZ row
    const last = cleanName(surname);
    if (!last) continue;
    return { lastName: last, firstName: cleanName(given) };
  }
  return undefined;
}

const MONTHS: Record<string, number> = {
  ene: 1, jan: 1, feb: 2, mar: 3, abr: 4, apr: 4, may: 5, jun: 6, jul: 7,
  ago: 8, aug: 8, sep: 9, oct: 10, nov: 11, dic: 12, dec: 12,
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += y > 40 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Extract ISO dates from arbitrary OCR text (handles common LATAM formats). */
function extractDates(text: string): string[] {
  const out: string[] = [];
  // YYYY-MM-DD or YYYY/MM/DD
  for (const m of text.matchAll(/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g)) {
    const d = iso(+m[1], +m[2], +m[3]);
    if (d) out.push(d);
  }
  // DD-MM-YYYY or DD/MM/YYYY
  for (const m of text.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const d = iso(+m[3], +m[2], +m[1]);
    if (d) out.push(d);
  }
  // DD MMM YYYY (e.g. 12 ENE 1990)
  for (const m of text.matchAll(/\b(\d{1,2})\s*([A-Za-z]{3})[A-Za-z]*\.?\s*(\d{2,4})\b/g)) {
    const mon = MONTHS[m[2].toLowerCase()];
    if (mon) {
      const d = iso(+m[3], mon, +m[1]);
      if (d) out.push(d);
    }
  }
  return Array.from(new Set(out));
}

/** First date found within ~40 chars after a label keyword. */
function nearLabel(text: string, label: RegExp): string | undefined {
  const m = label.exec(text);
  if (!m) return undefined;
  const window = text.slice(m.index, m.index + 60);
  const dates = extractDates(window);
  return dates[0];
}
