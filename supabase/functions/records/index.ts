import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
  submissionKey: string;
};

type AppSettingsRow = {
  key: string;
  edit_password: string;
  admin_password: string;
  google_drive_parent_folder_id: string;
  line_notify_enabled: boolean;
  active_line_target_preset_id: string | null;
  line_message_header: string;
  line_message_separator: string;
  line_message_include_frontend_url: boolean;
  default_type: string;
  default_brand: string;
  type_options: unknown;
  brand_options: unknown;
  feature_options: unknown;
  feature_bulk_status_enabled: boolean;
  feature_submit_lock_enabled: boolean;
  feature_dedupe_enabled: boolean;
};

type LineTargetPresetRow = {
  id: string;
  name: string;
  target_id: string;
  is_enabled: boolean;
};

type RuntimeSettings = {
  editPassword: string;
  adminPassword: string;
  googleDriveParentFolderId: string;
  lineNotifyEnabled: boolean;
  activeLineTargetPresetId: string | null;
  lineMessageHeader: string;
  lineMessageSeparator: string;
  lineMessageIncludeFrontendUrl: boolean;
  defaultType: string;
  defaultBrand: string;
  typeOptions: string[];
  brandOptions: string[];
  featureOptions: string[];
  featureBulkStatusEnabled: boolean;
  featureSubmitLockEnabled: boolean;
  featureDedupeEnabled: boolean;
  lineTargetPresets: Array<{
    id: string;
    name: string;
    targetId: string;
    isEnabled: boolean;
  }>;
};

const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") || "*";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const editPassword = Deno.env.get("EDIT_PASSWORD") || "";
const adminSettingsPassword = Deno.env.get("ADMIN_SETTINGS_PASSWORD") || "";
const driveParentFolderId = Deno.env.get("GOOGLE_DRIVE_PARENT_FOLDER_ID") || "";
const googleOAuthClientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || "";
const googleOAuthClientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || "";
const googleOAuthRefreshToken = Deno.env.get("GOOGLE_OAUTH_REFRESH_TOKEN") || "";
const lineChannelAccessToken = Deno.env.get("LINE_CHANNEL_ACCESS_TOKEN") || "";
const lineTargetId = Deno.env.get("LINE_TARGET_ID") || "";
const frontendUrl = Deno.env.get("FRONTEND_PUBLIC_URL") || "";
const defaultTypeOptions = ["PC", "Notebook", "All in One", "Monitor"];
const defaultBrandOptions = ["Dell", "HP", "Lenovo", "Acer", "Asus", "Toshiba", "Fujitsu", "MSI", "Hisense"];
const defaultFeatureOptions = ["License Windows", "KB มีไฟ", "สแกนนิ้ว", "สแกนหน้า", "Card Wi-Fi", "DVD-RW", "ใส่ Sim ได้"];

function withDriveQuery(path: string) {
  return path.includes("?") ? `${path}&supportsAllDrives=true` : `${path}?supportsAllDrives=true`;
}

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

function matchesPassword(input: string, actual: string) {
  return Boolean(actual) && input === actual;
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }
  const normalized = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  return normalized.length > 0 ? Array.from(new Set(normalized)) : [...fallback];
}

function validatePassword(password: string, settings: RuntimeSettings) {
  return matchesPassword(password, settings.editPassword || editPassword);
}

function validateAdminPassword(password: string, settings: RuntimeSettings) {
  return matchesPassword(password, settings.adminPassword || adminSettingsPassword);
}

function ensureAdminPasswordConfigured(settings: RuntimeSettings) {
  if (!(settings.adminPassword || adminSettingsPassword)) {
    throw new Error("ยังไม่ได้ตั้งค่า ADMIN_SETTINGS_PASSWORD สำหรับหน้า Admin Settings");
  }
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
  if (!googleOAuthClientId || !googleOAuthClientSecret || !googleOAuthRefreshToken) {
    throw new Error("Google OAuth environment variables are missing");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleOAuthClientId,
      client_secret: googleOAuthClientSecret,
      refresh_token: googleOAuthRefreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth refresh token failed: ${text}`);
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
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.error?.message || "";
      const reason = parsed?.error?.errors?.[0]?.reason || "";

      if (reason === "insufficientParentPermissions") {
        throw new Error(`Google Drive ไม่มีสิทธิ์เข้าถึงโฟลเดอร์ปลายทาง (${driveParentFolderId}) ของบัญชี Google ที่เชื่อมไว้ กรุณาตรวจว่าโฟลเดอร์นี้อยู่ใน Google Drive บัญชีเดียวกับที่ออก OAuth refresh token`);
      }

      if (reason === "notFound") {
        throw new Error(`ไม่พบโฟลเดอร์ Google Drive ปลายทาง (${driveParentFolderId}) หรือบัญชี Google ที่เชื่อมไว้ไม่มีสิทธิ์เข้าถึง`);
      }

      throw new Error(`Google Drive request failed: ${message || text}`);
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Google Drive request failed: ${text}`);
    }
  }

  return response;
}

async function createFolder(name: string, parentId: string) {
  const response = await driveRequest(withDriveQuery("/files?fields=id,name,webViewLink"), {
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
  const response = await driveRequest(withDriveQuery(`/files/${folderId}?fields=id,name,webViewLink`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  return await response.json();
}

async function getDriveFile(fileId: string) {
  const response = await driveRequest(withDriveQuery(`/files/${fileId}?fields=id,name,webViewLink`), {
    method: "GET",
  });
  return await response.json();
}

async function deleteDriveFile(fileId: string) {
  await driveRequest(withDriveQuery(`/files/${fileId}`), {
    method: "DELETE",
  });
}

function mapRuntimeSettings(settingsRow: AppSettingsRow, presets: LineTargetPresetRow[]): RuntimeSettings {
  return {
    editPassword: settingsRow.edit_password || editPassword,
    adminPassword: settingsRow.admin_password || adminSettingsPassword,
    googleDriveParentFolderId: settingsRow.google_drive_parent_folder_id || driveParentFolderId,
    lineNotifyEnabled: Boolean(settingsRow.line_notify_enabled),
    activeLineTargetPresetId: settingsRow.active_line_target_preset_id || null,
    lineMessageHeader: settingsRow.line_message_header || "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่",
    lineMessageSeparator: settingsRow.line_message_separator || "---------------------------",
    lineMessageIncludeFrontendUrl: Boolean(settingsRow.line_message_include_frontend_url),
    defaultType: settingsRow.default_type || "",
    defaultBrand: settingsRow.default_brand || "",
    typeOptions: normalizeStringArray(settingsRow.type_options, defaultTypeOptions),
    brandOptions: normalizeStringArray(settingsRow.brand_options, defaultBrandOptions),
    featureOptions: normalizeStringArray(settingsRow.feature_options, defaultFeatureOptions),
    featureBulkStatusEnabled: Boolean(settingsRow.feature_bulk_status_enabled),
    featureSubmitLockEnabled: Boolean(settingsRow.feature_submit_lock_enabled),
    featureDedupeEnabled: Boolean(settingsRow.feature_dedupe_enabled),
    lineTargetPresets: presets.map((preset) => ({
      id: preset.id,
      name: preset.name,
      targetId: preset.target_id,
      isEnabled: Boolean(preset.is_enabled),
    })),
  };
}

async function ensureDefaultRuntimeSettings(supabase: ReturnType<typeof getSupabaseClient>) {
  const { data: presetRows, error: presetError } = await supabase
    .from("line_target_presets")
    .select("id, name, target_id, is_enabled")
    .order("created_at", { ascending: true });

  if (presetError) {
    throw new Error(presetError.message);
  }

  let presets = (presetRows || []) as LineTargetPresetRow[];

  if (presets.length === 0 && lineTargetId) {
    const { data: insertedPreset, error: insertPresetError } = await supabase
      .from("line_target_presets")
      .insert({
        name: "ค่าเริ่มต้น",
        target_id: lineTargetId,
        is_enabled: true,
      })
      .select("id, name, target_id, is_enabled")
      .single();

    if (insertPresetError) {
      throw new Error(insertPresetError.message);
    }

    presets = [insertedPreset as LineTargetPresetRow];
  }

  const { data: settingsRow, error: settingsError } = await supabase
    .from("app_settings")
    .select("key, edit_password, admin_password, google_drive_parent_folder_id, line_notify_enabled, active_line_target_preset_id, line_message_header, line_message_separator, line_message_include_frontend_url, default_type, default_brand, type_options, brand_options, feature_options, feature_bulk_status_enabled, feature_submit_lock_enabled, feature_dedupe_enabled")
    .eq("key", "main")
    .maybeSingle();

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  if (!settingsRow) {
    const { error: insertSettingsError } = await supabase
      .from("app_settings")
      .insert({
        key: "main",
        edit_password: editPassword,
        admin_password: adminSettingsPassword,
        google_drive_parent_folder_id: driveParentFolderId,
        line_notify_enabled: true,
        active_line_target_preset_id: presets[0]?.id || null,
        line_message_header: "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่",
        line_message_separator: "---------------------------",
        line_message_include_frontend_url: true,
        default_type: "",
        default_brand: "",
        type_options: defaultTypeOptions,
        brand_options: defaultBrandOptions,
        feature_options: defaultFeatureOptions,
        feature_bulk_status_enabled: true,
        feature_submit_lock_enabled: true,
        feature_dedupe_enabled: true,
      });

    if (insertSettingsError) {
      throw new Error(insertSettingsError.message);
    }
  } else if (!settingsRow.active_line_target_preset_id && presets[0]?.id) {
    const { error: updateSettingsError } = await supabase
      .from("app_settings")
      .update({ active_line_target_preset_id: presets[0].id })
      .eq("key", "main");

    if (updateSettingsError) {
      throw new Error(updateSettingsError.message);
    }
  }
}

async function getRuntimeSettings(supabase: ReturnType<typeof getSupabaseClient>) {
  await ensureDefaultRuntimeSettings(supabase);

  const [{ data: settingsRow, error: settingsError }, { data: presetRows, error: presetError }] = await Promise.all([
    supabase
      .from("app_settings")
      .select("key, edit_password, admin_password, google_drive_parent_folder_id, line_notify_enabled, active_line_target_preset_id, line_message_header, line_message_separator, line_message_include_frontend_url, default_type, default_brand, type_options, brand_options, feature_options, feature_bulk_status_enabled, feature_submit_lock_enabled, feature_dedupe_enabled")
      .eq("key", "main")
      .single(),
    supabase
      .from("line_target_presets")
      .select("id, name, target_id, is_enabled")
      .order("created_at", { ascending: true }),
  ]);

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  if (presetError) {
    throw new Error(presetError.message);
  }

  return mapRuntimeSettings(settingsRow as AppSettingsRow, (presetRows || []) as LineTargetPresetRow[]);
}

function getPublicRuntimeSettings(settings: RuntimeSettings) {
  return {
    googleDriveParentFolderId: settings.googleDriveParentFolderId,
    lineNotifyEnabled: settings.lineNotifyEnabled,
    activeLineTargetPresetId: settings.activeLineTargetPresetId,
    lineMessageHeader: settings.lineMessageHeader,
    lineMessageSeparator: settings.lineMessageSeparator,
    lineMessageIncludeFrontendUrl: settings.lineMessageIncludeFrontendUrl,
    defaultType: settings.defaultType,
    defaultBrand: settings.defaultBrand,
    typeOptions: settings.typeOptions,
    brandOptions: settings.brandOptions,
    featureOptions: settings.featureOptions,
    featureBulkStatusEnabled: settings.featureBulkStatusEnabled,
    featureSubmitLockEnabled: settings.featureSubmitLockEnabled,
    featureDedupeEnabled: settings.featureDedupeEnabled,
    lineTargetPresetNames: settings.lineTargetPresets
      .filter((preset) => preset.isEnabled)
      .map((preset) => ({ id: preset.id, name: preset.name })),
  };
}

async function beginSubmissionRequest(supabase: ReturnType<typeof getSupabaseClient>, submissionKey: string, dedupeEnabled: boolean) {
  const normalizedKey = submissionKey.trim();
  if (!dedupeEnabled || !normalizedKey) {
    return { normalizedKey: "", duplicateRecord: null as ReturnType<typeof mapRow> | null };
  }

  const { data: existingRow, error: existingError } = await supabase
    .from("record_submission_requests")
    .select("submission_key, status, record_id, created_at")
    .eq("submission_key", normalizedKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingRow?.record_id) {
    const { data: existingRecord, error: existingRecordError } = await supabase
      .from("computer_specs")
      .select("id, created_at, type, brand, model, cpu, ram, storage, display_size, price, features, remarks, folder_link, image_links, status_image, status_posted")
      .eq("id", existingRow.record_id)
      .maybeSingle();

    if (existingRecordError) {
      throw new Error(existingRecordError.message);
    }

    if (existingRecord) {
      return { normalizedKey, duplicateRecord: mapRow(existingRecord as RecordRow) };
    }
  }

  if (existingRow?.status === "processing") {
    throw new Error("คำขอนี้กำลังประมวลผลอยู่ กรุณารอสักครู่แล้วตรวจสอบรายการล่าสุดก่อนลองใหม่อีกครั้ง");
  }

  const payload = {
    submission_key: normalizedKey,
    status: "processing",
    record_id: null,
  };

  if (existingRow) {
    const { error: updateError } = await supabase
      .from("record_submission_requests")
      .update(payload)
      .eq("submission_key", normalizedKey);

    if (updateError) {
      throw new Error(updateError.message);
    }
  } else {
    const { error: insertError } = await supabase
      .from("record_submission_requests")
      .insert(payload);

    if (insertError) {
      throw new Error(insertError.message);
    }
  }

  return { normalizedKey, duplicateRecord: null as ReturnType<typeof mapRow> | null };
}

async function completeSubmissionRequest(supabase: ReturnType<typeof getSupabaseClient>, submissionKey: string, recordId: string) {
  if (!submissionKey) return;
  const { error } = await supabase
    .from("record_submission_requests")
    .update({ status: "completed", record_id: recordId })
    .eq("submission_key", submissionKey);

  if (error) {
    throw new Error(error.message);
  }
}

async function failSubmissionRequest(supabase: ReturnType<typeof getSupabaseClient>, submissionKey: string) {
  if (!submissionKey) return;
  await supabase
    .from("record_submission_requests")
    .update({ status: "failed" })
    .eq("submission_key", submissionKey);
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

  const response = await driveRequest(withDriveQuery("/files?uploadType=multipart&fields=id,name,webViewLink"), {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  }, true);
  const uploaded = await response.json();

  await driveRequest(withDriveQuery(`/files/${uploaded.id}/permissions`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  return {
    id: uploaded.id as string,
    link: `https://lh3.googleusercontent.com/d/${uploaded.id}`,
  };
}

async function ensureDriveFolder(payload: RecordPayload, settings: RuntimeSettings) {
  const parentFolderId = settings.googleDriveParentFolderId || driveParentFolderId;
  if (!parentFolderId) {
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

  const created = await createFolder(desiredName, parentFolderId);
  return {
    id: created.id as string,
    link: (created.webViewLink as string) || `https://drive.google.com/drive/folders/${created.id}`,
  };
}

function buildLineMessage(row: ReturnType<typeof mapRow>, settings: RuntimeSettings) {
  let message = `${settings.lineMessageHeader || "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่"}\n`;
  message += `${settings.lineMessageSeparator || "---------------------------"}\n`;
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
  if (settings.lineMessageIncludeFrontendUrl && frontendUrl) {
    message += `${settings.lineMessageSeparator || "---------------------------"}\n${frontendUrl}`;
  }
  return message;
}

async function pushLineNotification(row: ReturnType<typeof mapRow>, settings: RuntimeSettings) {
  const activePreset = settings.lineTargetPresets.find((preset) => preset.id === settings.activeLineTargetPresetId && preset.isEnabled)
    || settings.lineTargetPresets.find((preset) => preset.isEnabled)
    || null;

  if (!lineChannelAccessToken || !settings.lineNotifyEnabled || !activePreset?.targetId) {
    return { sent: false, skipped: true };
  }

  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lineChannelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: activePreset.targetId,
      messages: [{ type: "text", text: buildLineMessage(row, settings) }],
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
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  return jsonResponse({ success: validatePassword(password, settings) });
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
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  if (!validatePassword(password, settings)) {
    return jsonResponse({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }

  const { error } = await supabase
    .from("computer_specs")
    .update({ status_image: statusImage, status_posted: statusPosted })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }

  return jsonResponse({ success: true, message: "บันทึกสถานะเรียบร้อย" });
}

async function handleBatchStatusUpdate(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const items = Array.isArray(body?.items) ? body.items : [];

  if (items.length === 0) {
    return jsonResponse({ success: false, message: "ไม่มีรายการที่ต้องบันทึก" }, 400);
  }

  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  if (!validatePassword(password, settings)) {
    return jsonResponse({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }

  const results: Array<{ id: string; success: boolean; message?: string }> = [];

  for (const item of items) {
    const id = typeof item?.id === "string" ? item.id : "";
    if (!id) {
      results.push({ id: "", success: false, message: "ไม่พบรหัสข้อมูล" });
      continue;
    }

    const { error } = await supabase
      .from("computer_specs")
      .update({
        status_image: Boolean(item?.statusImage),
        status_posted: Boolean(item?.statusPosted),
      })
      .eq("id", id);

    if (error) {
      results.push({ id, success: false, message: error.message });
      continue;
    }

    results.push({ id, success: true });
  }

  const successCount = results.filter((item) => item.success).length;
  const failedCount = results.length - successCount;

  return jsonResponse({
    success: failedCount === 0,
    message: failedCount === 0 ? "บันทึกสถานะเรียบร้อย" : `บันทึกสำเร็จ ${successCount} รายการ และล้มเหลว ${failedCount} รายการ`,
    results,
  }, failedCount === 0 ? 200 : 207);
}

async function handleVerifyAdminPassword(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  ensureAdminPasswordConfigured(settings);
  return jsonResponse({ success: validateAdminPassword(password, settings) });
}

async function handleGetPublicConfig() {
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  return jsonResponse({ success: true, data: getPublicRuntimeSettings(settings) });
}

async function handleGetAdminSettings(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  ensureAdminPasswordConfigured(settings);
  if (!validateAdminPassword(password, settings)) {
    return jsonResponse({ success: false, message: "รหัสผ่านผู้ดูแลไม่ถูกต้อง" }, 401);
  }
  return jsonResponse({ success: true, data: settings });
}

async function handleSaveAdminSettings(request: Request) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";
  const supabase = getSupabaseClient();
  const currentSettings = await getRuntimeSettings(supabase);
  ensureAdminPasswordConfigured(currentSettings);
  if (!validateAdminPassword(password, currentSettings)) {
    return jsonResponse({ success: false, message: "รหัสผ่านผู้ดูแลไม่ถูกต้อง" }, 401);
  }

  const lineTargetPresets = (Array.isArray(body?.lineTargetPresets) ? body.lineTargetPresets : []) as Array<Record<string, unknown>>;
  const normalizedPresets = lineTargetPresets
    .map((preset: Record<string, unknown>) => ({
      id: typeof preset?.id === "string" && !preset.id.startsWith("local-") ? preset.id : "",
      name: typeof preset?.name === "string" ? preset.name.trim() : "",
      target_id: typeof preset?.targetId === "string" ? preset.targetId.trim() : "",
      is_enabled: preset?.isEnabled !== false,
    }))
    .filter((preset) => preset.name && preset.target_id);

  const { data: existingPresets, error: existingPresetsError } = await supabase
    .from("line_target_presets")
    .select("id");

  if (existingPresetsError) {
    throw new Error(existingPresetsError.message);
  }

  const incomingIds = new Set(normalizedPresets.map((preset) => preset.id).filter(Boolean));
  const existingIds = (existingPresets || []).map((item: { id: string }) => item.id);
  const idsToDelete = existingIds.filter((id: string) => !incomingIds.has(id));

  if (idsToDelete.length > 0) {
    const { error: deletePresetsError } = await supabase
      .from("line_target_presets")
      .delete()
      .in("id", idsToDelete);

    if (deletePresetsError) {
      throw new Error(deletePresetsError.message);
    }
  }

  if (normalizedPresets.length > 0) {
    const { error: insertPresetsError } = await supabase
      .from("line_target_presets")
      .insert(normalizedPresets.filter((preset) => !preset.id).map((preset) => ({
        name: preset.name,
        target_id: preset.target_id,
        is_enabled: preset.is_enabled,
      })));

    if (insertPresetsError) {
      throw new Error(insertPresetsError.message);
    }

    for (const preset of normalizedPresets.filter((item) => item.id)) {
      const { error: updatePresetError } = await supabase
        .from("line_target_presets")
        .update({
          name: preset.name,
          target_id: preset.target_id,
          is_enabled: preset.is_enabled,
        })
        .eq("id", preset.id);

      if (updatePresetError) {
        throw new Error(updatePresetError.message);
      }
    }
  }

  let activeLineTargetPresetId = typeof body?.activeLineTargetPresetId === "string" ? body.activeLineTargetPresetId : null;
  if (activeLineTargetPresetId?.startsWith("local-")) {
    const matchingLocalPreset = lineTargetPresets.find((preset) => preset?.id === activeLineTargetPresetId);
    if (matchingLocalPreset) {
      const { data: refreshedPresets, error: refreshedPresetsError } = await supabase
        .from("line_target_presets")
        .select("id, name, target_id, is_enabled");

      if (refreshedPresetsError) {
        throw new Error(refreshedPresetsError.message);
      }

      const matchedPreset = (refreshedPresets || []).find((preset: LineTargetPresetRow) => (
        preset.name === matchingLocalPreset.name && preset.target_id === matchingLocalPreset.targetId
      ));
      activeLineTargetPresetId = matchedPreset?.id || null;
    } else {
      activeLineTargetPresetId = null;
    }
  }
  const nextEditPassword = typeof body?.editPassword === "string" ? body.editPassword.trim() : currentSettings.editPassword;
  const nextAdminPassword = typeof body?.adminPassword === "string" ? body.adminPassword.trim() : currentSettings.adminPassword;
  if (!nextEditPassword || !nextAdminPassword) {
    return jsonResponse({ success: false, message: "กรุณากำหนดรหัสผ่าน Edit และ Admin ให้ครบ" }, 400);
  }
  const settingsPayload = {
    edit_password: nextEditPassword,
    admin_password: nextAdminPassword,
    google_drive_parent_folder_id: typeof body?.googleDriveParentFolderId === "string" ? body.googleDriveParentFolderId.trim() : driveParentFolderId,
    line_notify_enabled: body?.lineNotifyEnabled !== false,
    active_line_target_preset_id: activeLineTargetPresetId,
    line_message_header: typeof body?.lineMessageHeader === "string" ? body.lineMessageHeader.trim() : "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่",
    line_message_separator: typeof body?.lineMessageSeparator === "string" ? body.lineMessageSeparator.trim() : "---------------------------",
    line_message_include_frontend_url: body?.lineMessageIncludeFrontendUrl !== false,
    default_type: typeof body?.defaultType === "string" ? body.defaultType.trim() : "",
    default_brand: typeof body?.defaultBrand === "string" ? body.defaultBrand.trim() : "",
    type_options: normalizeStringArray(body?.typeOptions, currentSettings.typeOptions),
    brand_options: normalizeStringArray(body?.brandOptions, currentSettings.brandOptions),
    feature_options: normalizeStringArray(body?.featureOptions, currentSettings.featureOptions),
    feature_bulk_status_enabled: body?.featureBulkStatusEnabled !== false,
    feature_submit_lock_enabled: body?.featureSubmitLockEnabled !== false,
    feature_dedupe_enabled: body?.featureDedupeEnabled !== false,
  };

  await ensureDefaultRuntimeSettings(supabase);

  const { error: settingsError } = await supabase
    .from("app_settings")
    .update(settingsPayload)
    .eq("key", "main");

  if (settingsError) {
    throw new Error(settingsError.message);
  }

  const settings = await getRuntimeSettings(supabase);
  return jsonResponse({ success: true, message: "บันทึกการตั้งค่าเรียบร้อย", data: settings });
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
    submissionKey: getText(formData, "submissionKey"),
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
  const supabase = getSupabaseClient();
  const settings = await getRuntimeSettings(supabase);
  if (isEdit && !validatePassword(payload.password, settings)) {
    return jsonResponse({ success: false, message: "รหัสผ่านไม่ถูกต้อง" }, 401);
  }
  const submissionState = !isEdit
    ? await beginSubmissionRequest(supabase, payload.submissionKey, settings.featureDedupeEnabled)
    : { normalizedKey: "", duplicateRecord: null as ReturnType<typeof mapRow> | null };

  if (submissionState.duplicateRecord) {
    return jsonResponse({
      success: true,
      message: "รายการนี้ถูกบันทึกไปแล้วจากคำขอก่อนหน้า",
      data: submissionState.duplicateRecord,
      duplicate: true,
    });
  }

  const driveFolder = await ensureDriveFolder(payload, settings);
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
      await pushLineNotification(mapped, settings);
    } catch (notifyError) {
      await supabase.from("computer_specs").delete().eq("id", mapped.id);
      throw notifyError;
    }

    await completeSubmissionRequest(supabase, submissionState.normalizedKey, mapped.id);

    return jsonResponse({
      success: true,
      message: "บันทึกข้อมูลเรียบร้อย",
      data: mapped,
    });
  } catch (error) {
    if (uploadedFiles.length > 0) {
      await Promise.allSettled(uploadedFiles.map(file => deleteDriveFile(file.id)));
    }
    await failSubmissionRequest(supabase, submissionState.normalizedKey);
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

    if (request.method === "GET" && action === "config") {
      return await handleGetPublicConfig();
    }

    if (request.method === "GET") {
      const data = await listRecords();
      return jsonResponse({ success: true, data });
    }

    if (request.method === "POST" && action === "verify-password") {
      return await handleVerifyPassword(request);
    }

    if (request.method === "POST" && action === "verify-admin-password") {
      return await handleVerifyAdminPassword(request);
    }

    if (request.method === "POST" && action === "get-admin-settings") {
      return await handleGetAdminSettings(request);
    }

    if (request.method === "POST" && action === "save-admin-settings") {
      return await handleSaveAdminSettings(request);
    }

    if (request.method === "PATCH" && action === "status") {
      return await handleStatusUpdate(request);
    }

    if (request.method === "PATCH" && action === "status-batch") {
      return await handleBatchStatusUpdate(request);
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
