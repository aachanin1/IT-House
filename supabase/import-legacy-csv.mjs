import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const supabaseDir = path.join(projectRoot, "supabase");
const csvPath = path.join(projectRoot, "ระบบบันทึกสเปคคอมพิวเตอร์ - Database.csv");

function parseEnvFile(content) {
  const env = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

async function loadEnv() {
  const candidates = [
    path.join(supabaseDir, ".env"),
    path.join(supabaseDir, ".env.example"),
  ];

  for (const filePath of candidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return parseEnvFile(content);
    } catch {
      continue;
    }
  }

  return {};
}

function parseCsv(text) {
  const rows = [];
  let current = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(current);
      current = "";
      if (row.some(value => value !== "")) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    if (row.some(value => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function parseLegacyDate(value) {
  if (!value) return new Date().toISOString();
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!match) {
    const fallback = new Date(value);
    if (Number.isNaN(fallback.getTime())) {
      return new Date().toISOString();
    }
    return fallback.toISOString();
  }

  const [, day, month, year, hour, minute, second] = match;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second}+07:00`;
  return new Date(iso).toISOString();
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeImageLinks(value) {
  if (!value || !String(value).trim()) return [];
  return String(value)
    .split(",")
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizePrice(value) {
  const parsed = Number(String(value || "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRow(row) {
  return {
    id: row.ID,
    created_at: parseLegacyDate(row.Date_Created),
    type: row.Type || "",
    brand: row.Brand || "",
    model: row.Model || "",
    cpu: row.CPU || "",
    ram: row.RAM || "",
    storage: row.Storage || "",
    display_size: row.Display_Size || "",
    price: normalizePrice(row.Price),
    features: row.Features || "",
    remarks: row.Remarks || "",
    folder_link: row.Folder_Link || "",
    image_links: normalizeImageLinks(row.Image_Links),
    status_image: parseBoolean(row.Status_Image),
    status_posted: parseBoolean(row.Status_Posted),
  };
}

function toObjects(rows) {
  const [headerRow, ...dataRows] = rows;
  return dataRows.map(cells => {
    const record = {};
    headerRow.forEach((header, index) => {
      record[header] = cells[index] ?? "";
    });
    return record;
  });
}

async function upsertBatch(url, serviceRoleKey, batch) {
  const response = await fetch(`${url}/rest/v1/computer_specs?on_conflict=id`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(batch),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase import failed with ${response.status}`);
  }
}

async function main() {
  const env = {
    ...(await loadEnv()),
    ...process.env,
  };

  const supabaseUrl = env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ยังไม่ถูกตั้งค่า");
  }

  const csv = await fs.readFile(csvPath, "utf8");
  const parsedRows = parseCsv(csv);
  const records = toObjects(parsedRows).map(mapRow);

  const batchSize = 100;
  for (let index = 0; index < records.length; index += batchSize) {
    const batch = records.slice(index, index + batchSize);
    await upsertBatch(supabaseUrl, serviceRoleKey, batch);
    console.log(`Imported ${Math.min(index + batch.length, records.length)} / ${records.length}`);
  }

  console.log(`Import complete: ${records.length} rows`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
