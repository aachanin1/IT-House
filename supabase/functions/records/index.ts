import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { SignJWT, importPKCS8 } from "npm:jose@5.9.6";

type RecordRow = {
  id: string;
  created_at: string;
  type: string;
  brand: string;
  model: string;
  cpu: string;
  ram: string;
  storage: string;
  display_size: string;
  price: number;
  features: string;
  remarks: string;
  folder_link: string;
  image_links: string[];
  status_image: boolean;
  status_posted: boolean;
};

type RecordPayload = {
  recId: string;
  currentDate: string;
  currentFolderLink: string;
  type: string;
  brand: string;
  model: string;
  cpu: string;
  ram: string;
  storage: string;
  display: string;
  price: number;
  features: string[];
  remarks: string;
  keptExistingImages: string[];
  password: string;
};

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const editPassword = Deno.env.get("EDIT_PASSWORD") || "";
const driveParentFolderId = Deno.env.get("GOOGLE_DRIVE_PARENT_FOLDER_ID") || "";
const googleServiceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL") || "";
const googleServiceAccountPrivateKey = (Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
const lineChannelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const lineTargetId = Deno.env.get("LINE_TARGET_ID") || "";
const frontendUrl = Deno.env.get("FRONTEND_PUBLIC_URL") || "";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase environment variables are missing");
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
}

function parseJsonArray(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function getText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatThaiDate(value: string) {
  try {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function mapRow(row: RecordRow) {
  return {
    id: row.id,
    created_at: row.created_at,
    created_at_formatted: formatThaiDate(row.created_at),
    date: formatThaiDate(row.created_at),
    type: row.type,
    brand: row.brand,
    model: row.model,
    cpu: row.cpu,
    ram: row.ram,
    storage: row.storage,
    display_size: row.display_size,
    display: row.display_size,
    price: Number(row.price || 0),
    features: row.features || "",
    remarks: row.remarks || "",
    folder_link: row.folder_link || "",
    folderLink: row.folder_link || "",
    image_links: Array.isArray(row.image_links) ? row.image_links : [],
    imageLinks: Array.isArray(row.image_links) ? row.image_links : [],
    status_image: Boolean(row.status_image),
    status_posted: Boolean(row.status_posted),
    statusImage: Boolean(row.status_image),
    statusPosted: Boolean(row.status_posted),
  };
}

function validatePassword(password: string) {
  return Boolean(editPassword) && password === editPassword;
}

function ensureRequired(payload: RecordPayload) {
  const requiredFields = [
    payload.type,
    payload.brand,
    payload.model,
    payload.cpu,
    payload.ram,
    payload.storage,
    payload.display,
    String(payload.price ?? ""),
  ];
  return requiredFields.every(value => String(value).trim() !== "");
}

function getThaiDatePrefix(dateObj = new Date()) {
  const day = String(dateObj.getDate()).padStart(2, "0");
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const year = String(dateObj.getFullYear() + 543).slice(-2);
  return `${day}${month}${year}`;
}

function extractDriveId(value: string) {
  const match = value.match(/[-\w]{25,}/);
  return match ? match[0] : "";
}

async function getGoogleAccessToken() {
  if (!googleServiceAccountEmail || !googleServiceAccountPrivateKey) {
    throw new Error("Google service account environment variables are missing");
  }

  const now = Math.floor(Date.now() / 1000);
  const privateKey = await importPKCS8(googleServiceAccountPrivateKey, "RS256");
  const jwt = await new SignJWT({
    iss: googleServiceAccountEmail,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth failed: ${text}`);
  }

  const json = await response.json();
  return json.access_token as string;
}

async function driveRequest(path: string, init: RequestInit = {}, isUpload = false) {
  const accessToken = await getGoogleAccessToken();
  const baseUrl = isUpload ? "https://www.googleapis.com/upload/drive/v3" : "https://www.googleapis.com/drive/v3";
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Drive request failed: ${text}`);
  }

  return response;
}

async function createFolder(name: string, parentId: string) {
  const response = await driveRequest("/files?fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    }),
  });
  return await response.json();
}

async function updateFolderName(folderId: string, name: string) {
  const response = await driveRequest(`/files/${folderId}?fields=id,name,webViewLink`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return await response.json();
}

async function getDriveFile(fileId: string) {
  const response = await driveRequest(`/files/${fileId}?fields=id,name,webViewLink`, {
    method: "GET",
  });
  return await response.json();
}

async function deleteDriveFile(fileId: string) {
  await driveRequest(`/files/${fileId}`, {
    method: "DELETE",
  });
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function uploadFileToDrive(folderId: string, file: File, fileName: string) {
  const boundary = `drive-upload-${crypto.randomUUID()}`;
  const encoder = new TextEncoder();
  const metadata = {
    name: fileName,
    parents: [folderId],
  };
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const body = concatUint8Arrays([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`),
    fileBytes,
    encoder.encode(`\r\n--${boundary}--`),
  ]);

  const response = await driveRequest("/files?uploadType=multipart&fields=id,name,webViewLink", {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  }, true);
  const uploaded = await response.json();

  await driveRequest(`/files/${uploaded.id}/permissions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return {
    id: uploaded.id as string,
    link: `https://lh3.googleusercontent.com/d/${uploaded.id}`,
  };
}

async function ensureDriveFolder(payload: RecordPayload) {
  if (!driveParentFolderId) {
    throw new Error("Google Drive parent folder is not configured");
  }

  const existingFolderId = extractDriveId(payload.currentFolderLink);
  let prefix = getThaiDatePrefix(new Date());
  if (existingFolderId) {
    const existingFolder = await getDriveFile(existingFolderId);
    const currentName = typeof existingFolder?.name === "string" ? existingFolder.name : "";
    const currentPrefix = currentName.split("-")[0];
    if (/^\d{6}$/.test(currentPrefix)) {
      prefix = currentPrefix;
    }
  }
  const desiredName = `${prefix}-${payload.brand} ${payload.model} ${payload.cpu}`.trim();

  if (existingFolderId) {
    const updated = await updateFolderName(existingFolderId, desiredName);
    return {
      id: updated.id as string,
      link: (updated.webViewLink as string) || `https://drive.google.com/drive/folders/${updated.id}`,
    };
  }

  const created = await createFolder(desiredName, driveParentFolderId);
  return {
    id: created.id as string,
    link: (created.webViewLink as string) || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

function buildLineMessage(row: ReturnType<typeof mapRow>) {
  let message = "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่\n";
  message += "---------------------------\n";
  message += `ประเภท: ${row.type}\n`;
  message += `รุ่น: ${row.brand} ${row.model}\n`;
  message += `CPU: ${row.cpu}\n`;
  message += `Ram: ${row.ram}\n`;
  message += `Storage: ${row.storage}\n`;
  if (row.display && row.display !== "-") {
    message += `หน้าจอ: ${row.display}\n`;
  }
  if (row.features && row.features !== "-") {
    message += `คุณสมบัติ: ${row.features}\n`;
  }
  if (row.remarks && row.remarks !== "-") {
    message += `หมายเหตุ: ${row.remarks}\n`;
  }
  message += `ราคา: ${Number(row.price).toLocaleString()} บาท\n`;
  if (frontendUrl) {
    message += `---------------------------\n${frontendUrl}`;
  }
  return message;
}

async function pushLineNotification(row: ReturnType<typeof mapRow>) {
  if (!lineChannelAccessToken || !lineTargetId) {
    return { sent: false, skipped: true };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineChannelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: lineTargetId,
      messages: [{ type: "text", text: buildLineMessage(row) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE notification failed: ${text}`);
  }

  return { sent: true, skipped: false };
}

async function listRecords() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("computer_specs")
    .select("id, created_at, type, brand, model, cpu, ram, storage, display_size, price, features, remarks, folder_link, image_links, status_image, status_posted")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((row: RecordRow) => mapRow(row));
}

async function handleVerifyPassword(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  return jsonResponse({ success: validatePassword(password) });
}

async function handleStatusUpdate(request: Request) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body?.id === "string" ? body.id : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const statusImage = Boolean(body?.statusImage);
  const statusPosted = Boolean(body?.statusPosted);

  if (!id) {
    return jsonResponse({ success: false, message: "ไม่พบรหัสข้อมูล" }, 400);
  }
  if (!validatePassword(password)) {
    return jsonResponse({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("computer_specs")
    .update({ status_image: statusImage, status_posted: statusPosted })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({ success: true, message: "บันทึกสถานะเรียบร้อย" });
}

async function readRecordPayload(formData: FormData): Promise<RecordPayload> {
  return {
    recId: getText(formData, "recId"),
    currentDate: getText(formData, "currentDate"),
    currentFolderLink: getText(formData, "currentFolderLink"),
    type: getText(formData, "type"),
    brand: getText(formData, "brand"),
    model: getText(formData, "model"),
    cpu: getText(formData, "cpu"),
    ram: getText(formData, "ram"),
    storage: getText(formData, "storage"),
    display: getText(formData, "display"),
    price: Number(getText(formData, "price") || 0),
    features: parseJsonArray(formData.get("features")),
    remarks: getText(formData, "remarks"),
    keptExistingImages: parseJsonArray(formData.get("keptExistingImages")),
    password: getText(formData, "password"),
  };
}

async function handleCreateOrUpdate(request: Request) {
  const formData = await request.formData();
  const payload = await readRecordPayload(formData);
  const files = formData.getAll("images").filter(entry => entry instanceof File) as File[];

  if (!ensureRequired(payload)) {
    return jsonResponse({ success: false, message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน" }, 400);
  }

  const isEdit = Boolean(payload.recId);
  if (isEdit && !validatePassword(payload.password)) {
    return jsonResponse({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }

  const driveFolder = await ensureDriveFolder(payload);
  const supabase = getSupabaseClient();
  const uploadedFiles: Array<{ id: string; link: string }> = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const extensionSafeName = `${String(index + 1).padStart(2, "0")}_${Date.now()}_${file.name}`;
      const uploaded = await uploadFileToDrive(driveFolder.id, file, extensionSafeName);
      uploadedFiles.push(uploaded);
    }

    const finalImageLinks = [...payload.keptExistingImages, ...uploadedFiles.map(file => file.link)];
    const recordInput = {
      type: payload.type,
      brand: payload.brand,
      model: payload.model,
      cpu: payload.cpu,
      ram: payload.ram,
      storage: payload.storage,
      display_size: payload.display,
      price: payload.price,
      features: payload.features.join(", "),
      remarks: payload.remarks,
      folder_link: driveFolder.link,
      image_links: finalImageLinks,
    };

    if (isEdit) {
      const { data, error } = await supabase
        .from("computer_specs")
        .update(recordInput)
        .eq("id", payload.recId)
        .select("id, created_at, type, brand, model, cpu, ram, storage, display_size, price, features, remarks, folder_link, image_links, status_image, status_posted")
        .single();

      if (error) {
        throw new Error(error.message);
      }

      return jsonResponse({
        success: true,
        message: "บันทึกข้อมูลเรียบร้อย",
        data: mapRow(data as RecordRow),
      });
    }

    const { data, error } = await supabase
      .from("computer_specs")
      .insert({
        ...recordInput,
        status_image: false,
        status_posted: false,
      })
      .select("id, created_at, type, brand, model, cpu, ram, storage, display_size, price, features, remarks, folder_link, image_links, status_image, status_posted")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const mapped = mapRow(data as RecordRow);

    try {
      await pushLineNotification(mapped);
    } catch (notifyError) {
      await supabase.from("computer_specs").delete().eq("id", mapped.id);
      throw notifyError;
    }

    return jsonResponse({
      success: true,
      message: "บันทึกข้อมูลเรียบร้อย",
      data: mapped,
    });
  } catch (error) {
    if (uploadedFiles.length > 0) {
      await Promise.allSettled(uploadedFiles.map(file => deleteDriveFile(file.id)));
    }
    throw error;
  }
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action") || "";

    if (request.method === "GET") {
      const data = await listRecords();
      return jsonResponse({ success: true, data });
    }

    if (request.method === "POST" && action === "verify-password") {
      return await handleVerifyPassword(request);
    }

    if (request.method === "PATCH" && action === "status") {
      return await handleStatusUpdate(request);
    }

    if (request.method === "POST") {
      return await handleCreateOrUpdate(request);
    }

    return jsonResponse({ success: false, message: "Method not allowed" }, 405);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ success: false, message }, 500);
  }
});
