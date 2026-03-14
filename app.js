let globalData = [];
let currentDataList = [];
let currentPage = 1;
const itemsPerPage = 25;
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f8f9fa'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' fill='%23adb5bd' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";
let selectedNewFiles = [];
let currentExistingLinks = [];
let currentEditPassword = "";
let adminSettingsSessionPassword = "";
let runtimeSettings = createDefaultRuntimeSettings();
let adminSettingsState = null;
let pendingStatusChanges = {};
let formModal;
let detailModal;
let adminSettingsModal;
let submissionInProgress = false;

function createDefaultRuntimeSettings() {
  return {
    googleDriveParentFolderId: "",
    lineNotifyEnabled: true,
    activeLineTargetPresetId: null,
    lineMessageHeader: "แจ้งเตือน: มีการเพิ่มข้อมูลใหม่",
    lineMessageSeparator: "---------------------------",
    lineMessageIncludeFrontendUrl: true,
    defaultType: "",
    defaultBrand: "",
    featureBulkStatusEnabled: true,
    featureSubmitLockEnabled: true,
    featureDedupeEnabled: true,
    lineTargetPresetNames: [],
    lineTargetPresets: [],
  };
}

function getApiBaseUrl() {
  const value = window.APP_CONFIG?.apiBaseUrl?.trim();
  if (!value) {
    throw new Error("ยังไม่ได้ตั้งค่า API Base URL ในไฟล์ app-config.js");
  }
  return value.replace(/\/$/, "");
}

function buildApiUrl(path = "records", query = "") {
  const baseUrl = getApiBaseUrl();
  const normalizedPath = path.replace(/^\//, "");
  return `${baseUrl}/${normalizedPath}${query ? `?${query}` : ""}`;
}

async function apiRequest(path, options = {}) {
  const response = await fetch(buildApiUrl(path, options.query), {
    method: options.method || "GET",
    headers: options.headers || {},
    body: options.body,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch (error) {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้");
  }

  return payload;
}

function normalizeImageLinks(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(",");
  }
  return value || "";
}

function normalizeItem(item) {
  return {
    id: item.id || "",
    date: item.date || item.created_at_formatted || item.created_at || "",
    type: item.type || "",
    brand: item.brand || "",
    model: item.model || "",
    cpu: item.cpu || "",
    ram: item.ram || "",
    storage: item.storage || "",
    display: item.display || item.display_size || "",
    price: Number(item.price || 0),
    features: Array.isArray(item.features) ? item.features.join(", ") : (item.features || ""),
    remarks: item.remarks || "",
    folderLink: item.folderLink || item.folder_link || "",
    imageLinks: normalizeImageLinks(item.imageLinks || item.image_links),
    statusImage: Boolean(item.statusImage ?? item.status_image),
    statusPosted: Boolean(item.statusPosted ?? item.status_posted),
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setLoadingState(isVisible, text = "กำลังประมวลผล...", showProgress = false) {
  document.getElementById("loading").style.display = isVisible ? "flex" : "none";
  document.getElementById("loadingText").innerText = text;
  document.getElementById("progressArea").style.display = showProgress ? "block" : "none";
  if (!showProgress) {
    document.getElementById("progressBar").style.width = "0%";
    document.getElementById("progressDetail").innerText = "กำลังเตรียมอัพโหลด...";
  }
}

function updateProgress(percent, detail) {
  document.getElementById("progressBar").style.width = `${Math.max(0, Math.min(100, percent))}%`;
  document.getElementById("progressDetail").innerText = detail;
}

function handleError(error) {
  setLoadingState(false);
  Swal.fire("Connection Error", error?.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", "error");
}

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  Array.from(files).forEach((file) => selectedNewFiles.push(file));
  event.target.value = "";
  renderPreview();
}

function removeNewFile(index) {
  selectedNewFiles.splice(index, 1);
  renderPreview();
}

function removeExistingLink(index) {
  currentExistingLinks.splice(index, 1);
  renderPreview();
}

function renderPreview() {
  const container = document.getElementById("imagePreviewContainer");
  container.innerHTML = "";

  currentExistingLinks.forEach((link, index) => {
    container.innerHTML += `<div class="preview-item shadow-sm"><img src="${escapeHtml(link)}" onerror="this.src='${placeholderImg}'"><button type="button" class="btn-remove-img" onclick="removeExistingLink(${index})">×</button></div>`;
  });

  selectedNewFiles.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = function (event) {
      const div = document.createElement("div");
      div.className = "preview-item shadow-sm";
      div.innerHTML = `<img src="${event.target?.result || ""}"><button type="button" class="btn-remove-img" onclick="removeNewFile(${index})">×</button>`;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

async function loadRuntimeSettings() {
  try {
    const response = await apiRequest("records", {
      method: "GET",
      query: "action=config",
    });
    runtimeSettings = {
      ...createDefaultRuntimeSettings(),
      ...(response?.data || {}),
    };
  } catch (error) {
    runtimeSettings = createDefaultRuntimeSettings();
  }
  applyRuntimeSettingsToUi();
}

function applyRuntimeSettingsToUi() {
  updatePendingStatusUi();
}

async function loadData() {
  try {
    setLoadingState(true, "กำลังโหลดข้อมูล...");
    const response = await apiRequest("records");
    renderData(Array.isArray(response?.data) ? response.data : []);
  } catch (error) {
    handleError(error);
  }
}

function renderData(data) {
  globalData = data.map(normalizeItem);
  updateSummary(globalData);
  filterData();
  setLoadingState(false);
}

function getSubmissionNonce() {
  const input = document.getElementById("submissionNonce");
  if (!input.value) {
    input.value = crypto.randomUUID();
  }
  return input.value;
}

async function createSubmissionKey() {
  const featureChecks = Array.from(document.querySelectorAll(".feature-check:checked")).map((cb) => cb.value).sort();
  const payload = [
    getSubmissionNonce(),
    document.getElementById("type").value,
    document.getElementById("brand").value,
    document.getElementById("model").value,
    document.getElementById("cpu").value,
    document.getElementById("ram").value,
    document.getElementById("storage").value,
    document.getElementById("display").value,
    document.getElementById("price").value,
    document.getElementById("remarks").value,
    currentExistingLinks.join(","),
    featureChecks.join(","),
    selectedNewFiles.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|"),
  ].join("||");

  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(hashBuffer)).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function buildRecordFormData() {
  const featureChecks = Array.from(document.querySelectorAll(".feature-check:checked")).map((cb) => cb.value);
  const formData = new FormData();
  const recId = document.getElementById("recId").value;

  formData.append("recId", recId);
  formData.append("currentDate", document.getElementById("currentDate").value);
  formData.append("currentFolderLink", document.getElementById("currentFolderLink").value);
  formData.append("type", document.getElementById("type").value);
  formData.append("brand", document.getElementById("brand").value);
  formData.append("model", document.getElementById("model").value);
  formData.append("cpu", document.getElementById("cpu").value);
  formData.append("ram", document.getElementById("ram").value);
  formData.append("storage", document.getElementById("storage").value);
  formData.append("display", document.getElementById("display").value);
  formData.append("price", document.getElementById("price").value);
  formData.append("features", JSON.stringify(featureChecks));
  formData.append("remarks", document.getElementById("remarks").value);
  formData.append("keptExistingImages", JSON.stringify(currentExistingLinks));

  if (recId && currentEditPassword) {
    formData.append("password", currentEditPassword);
  }

  if (!recId) {
    formData.append("submissionKey", await createSubmissionKey());
  }

  selectedNewFiles.forEach((file) => {
    formData.append("images", file, file.name);
  });

  return formData;
}

function submitRecordWithProgress(formData, totalFiles) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl("records"));

    updateProgress(4, totalFiles > 0 ? `กำลังเตรียมอัปโหลด 0/${totalFiles} รูป` : "กำลังเตรียมบันทึกข้อมูล...");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const ratio = event.total > 0 ? event.loaded / event.total : 0;
      const percent = Math.min(95, Math.max(5, Math.round(ratio * 95)));
      if (totalFiles > 0) {
        const estimatedCount = Math.min(totalFiles, Math.max(1, Math.round(ratio * totalFiles)));
        updateProgress(percent, `กำลังส่งข้อมูลและรูปภาพ ${estimatedCount}/${totalFiles}`);
      } else {
        updateProgress(percent, `กำลังส่งข้อมูล ${percent}%`);
      }
    };

    xhr.onload = () => {
      try {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          updateProgress(100, totalFiles > 0 ? `ส่งข้อมูลครบ ${totalFiles}/${totalFiles} รูป กำลังประมวลผลบนเซิร์ฟเวอร์...` : "กำลังประมวลผลบนเซิร์ฟเวอร์...");
          resolve(payload);
          return;
        }
        reject(new Error(payload?.message || "ไม่สามารถบันทึกข้อมูลได้"));
      } catch (error) {
        reject(new Error("ไม่สามารถอ่านผลลัพธ์จากเซิร์ฟเวอร์ได้"));
      }
    };

    xhr.onerror = () => reject(new Error("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้"));
    xhr.send(formData);
  });
}

async function submitData() {
  const requiredIds = ["type", "brand", "model", "cpu", "ram", "storage", "display", "price"];
  const missingRequired = requiredIds.some((id) => !document.getElementById(id).value);

  if (missingRequired) {
    Swal.fire("แจ้งเตือน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (*)", "warning");
    return;
  }

  if (submissionInProgress && runtimeSettings.featureSubmitLockEnabled) {
    return;
  }

  const btn = document.getElementById("btnSubmit");
  submissionInProgress = true;
  btn.disabled = true;

  try {
    setLoadingState(true, "กำลังบันทึกข้อมูล...", true);
    const formData = await buildRecordFormData();
    const response = await submitRecordWithProgress(formData, selectedNewFiles.length);
    formModal.hide();
    setLoadingState(false);
    currentEditPassword = "";
    resetFormState();
    Swal.fire({
      icon: "success",
      title: response?.duplicate ? "รายการนี้ถูกบันทึกแล้ว" : "สำเร็จ",
      text: response?.message || "บันทึกข้อมูลเรียบร้อย",
      timer: 1800,
      showConfirmButton: false,
    });
    await loadData();
  } catch (error) {
    setLoadingState(false);
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถบันทึกข้อมูลได้", "error");
  } finally {
    submissionInProgress = false;
    btn.disabled = false;
  }
}

function getPendingChangeForItem(id) {
  return pendingStatusChanges[id] || null;
}

function getResolvedStatus(item) {
  const pending = getPendingChangeForItem(item.id);
  return {
    statusImage: pending ? pending.statusImage : item.statusImage,
    statusPosted: pending ? pending.statusPosted : item.statusPosted,
    isDirty: Boolean(pending),
  };
}

function renderPage() {
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = "";

  if (!currentDataList || currentDataList.length === 0) {
    document.getElementById("noDataMessage").style.display = "block";
    document.getElementById("paginationContainer").innerHTML = "";
    updatePendingStatusUi();
    return;
  }

  document.getElementById("noDataMessage").style.display = "none";
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedItems = currentDataList.slice(start, end);

  paginatedItems.forEach((item) => {
    const resolved = getResolvedStatus(item);
    let imgHtml = `<img src="${placeholderImg}" class="rounded-3 border" style="width:50px;height:50px;object-fit:cover;">`;
    if (item.imageLinks && item.imageLinks.length > 5) {
      const firstImg = item.imageLinks.split(",")[0];
      imgHtml = `<img src="${escapeHtml(firstImg)}" class="rounded-3 border" style="width:50px;height:50px;object-fit:cover;" onerror="this.src='${placeholderImg}'">`;
    }

    const tr = document.createElement("tr");
    tr.id = `row_${item.id}`;
    if (resolved.isDirty) {
      tr.classList.add("row-dirty");
    }

    tr.innerHTML = `
      <td class="ps-4">${imgHtml}</td>
      <td>
        <div class="d-flex flex-column gap-1">
          <div class="form-check mb-0">
            <input class="form-check-input status-check" type="checkbox" id="chk_img_${escapeHtml(item.id)}" ${resolved.statusImage ? "checked" : ""} ${item.statusImage ? "disabled" : ""} onchange="toggleSaveBtn('${escapeHtml(item.id)}')">
            <label class="form-check-label small text-muted" for="chk_img_${escapeHtml(item.id)}">ทำรูปแล้ว</label>
          </div>
          <div class="form-check mb-0">
            <input class="form-check-input status-check" type="checkbox" id="chk_post_${escapeHtml(item.id)}" ${resolved.statusPosted ? "checked" : ""} ${item.statusPosted ? "disabled" : ""} onchange="toggleSaveBtn('${escapeHtml(item.id)}')">
            <label class="form-check-label small text-muted" for="chk_post_${escapeHtml(item.id)}">โพสต์แล้ว</label>
          </div>
        </div>
        <button id="btn_save_status_${escapeHtml(item.id)}" class="btn btn-sm btn-success rounded-pill mt-2 w-100 py-0" style="font-size:11px; display:${(!runtimeSettings.featureBulkStatusEnabled && resolved.isDirty) ? "block" : "none"};" onclick="saveStatus('${escapeHtml(item.id)}')" ${resolved.isDirty ? "" : "disabled"}>
          <i class="fas fa-check me-1"></i> บันทึก
        </button>
      </td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(item.type)}</span></td>
      <td><div class="fw-bold text-dark">${escapeHtml(item.brand)}</div><small class="text-muted">${escapeHtml(item.model)}</small></td>
      <td><small class="text-muted text-truncate d-block" style="max-width:180px;">${escapeHtml(item.cpu)} / ${escapeHtml(item.ram)} / ${escapeHtml(item.storage)}</small></td>
      <td class="text-success fw-bold">${Number(item.price).toLocaleString()}</td>
      <td class="text-center"><button class="btn btn-sm btn-light text-primary border rounded-circle" style="width:32px;height:32px;" onclick="viewDetails('${escapeHtml(item.id)}')"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-light text-warning border rounded-circle ms-1" style="width:32px;height:32px;" onclick="editData('${escapeHtml(item.id)}')"><i class="fas fa-pen"></i></button></td>
    `;
    tbody.appendChild(tr);
  });

  renderPaginationControls();
  updatePendingStatusUi();
}

function renderPaginationControls() {
  const container = document.getElementById("paginationContainer");
  const totalPages = Math.ceil(currentDataList.length / itemsPerPage);
  if (totalPages <= 1) {
    container.innerHTML = "";
    return;
  }

  let html = '<ul class="pagination mb-0">';
  html += `<li class="page-item ${currentPage === 1 ? "disabled" : ""}"><button class="page-link" onclick="changePage(${currentPage - 1})"><i class="fas fa-chevron-left"></i></button></li>`;
  for (let i = 1; i <= totalPages; i += 1) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      html += `<li class="page-item ${i === currentPage ? "active" : ""}"><button class="page-link" onclick="changePage(${i})">${i}</button></li>`;
    } else if (i === currentPage - 2 || i === currentPage + 2) {
      html += '<li class="page-item disabled"><span class="page-link">...</span></li>';
    }
  }
  html += `<li class="page-item ${currentPage === totalPages ? "disabled" : ""}"><button class="page-link" onclick="changePage(${currentPage + 1})"><i class="fas fa-chevron-right"></i></button></li>`;
  html += "</ul>";
  container.innerHTML = html;
}

function changePage(page) {
  if (page < 1 || page > Math.ceil(currentDataList.length / itemsPerPage)) return;
  currentPage = page;
  renderPage();
}

function getCheckboxState(id) {
  return {
    statusImage: Boolean(document.getElementById(`chk_img_${id}`)?.checked),
    statusPosted: Boolean(document.getElementById(`chk_post_${id}`)?.checked),
  };
}

function toggleSaveBtn(id) {
  const item = globalData.find((row) => row.id === id);
  if (!item) return;

  const currentState = getCheckboxState(id);
  const hasChanges = currentState.statusImage !== item.statusImage || currentState.statusPosted !== item.statusPosted;
  if (hasChanges) {
    pendingStatusChanges[id] = currentState;
  } else {
    delete pendingStatusChanges[id];
  }

  const row = document.getElementById(`row_${id}`);
  if (row) {
    row.classList.toggle("row-dirty", hasChanges);
  }

  const btn = document.getElementById(`btn_save_status_${id}`);
  if (btn) {
    btn.disabled = !hasChanges;
    btn.style.display = (!runtimeSettings.featureBulkStatusEnabled && hasChanges) ? "block" : "none";
  }

  updatePendingStatusUi();
}

function updatePendingStatusUi() {
  const ids = Object.keys(pendingStatusChanges);
  const bulkStatusBar = document.getElementById("bulkStatusBar");
  const bulkStatusSummary = document.getElementById("bulkStatusSummary");
  const bulkStatusHint = document.getElementById("bulkStatusHint");
  const btnSaveAllStatuses = document.getElementById("btnSaveAllStatuses");

  if (!runtimeSettings.featureBulkStatusEnabled) {
    bulkStatusBar.style.display = "none";
    return;
  }

  bulkStatusBar.style.display = ids.length > 0 ? "flex" : "none";
  bulkStatusSummary.innerText = ids.length > 0 ? `เลือกรายการที่เปลี่ยนไว้ ${ids.length} รายการ` : "ยังไม่มีรายการที่เลือกไว้";
  bulkStatusHint.innerText = ids.length > 0 ? "บันทึกสถานะทั้งหมดได้ในครั้งเดียว" : "ติ๊กหลายแถวแล้วบันทึกพร้อมกันได้";
  btnSaveAllStatuses.disabled = ids.length === 0;
}

function clearPendingStatusChanges() {
  pendingStatusChanges = {};
  renderPage();
}

async function verifyPassword(password) {
  const response = await apiRequest("records", {
    method: "POST",
    query: "action=verify-password",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return Boolean(response?.success);
}

async function verifyAdminSettingsPassword(password) {
  const response = await apiRequest("records", {
    method: "POST",
    query: "action=verify-admin-password",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  return Boolean(response?.success);
}

async function performStatusSave(ids) {
  if (!ids.length) return;

  const result = await Swal.fire({
    title: "ยืนยัน",
    text: `ต้องการบันทึกสถานะ ${ids.length} รายการใช่หรือไม่?`,
    input: "password",
    inputPlaceholder: "รหัสผ่าน",
    showCancelButton: true,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#198754",
  });

  if (!result.isConfirmed) return;

  try {
    setLoadingState(true, "กำลังบันทึกสถานะ...");
    const response = await apiRequest("records", {
      method: "PATCH",
      query: "action=status-batch",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: result.value,
        items: ids.map((id) => ({
          id,
          ...(pendingStatusChanges[id] || getCheckboxState(id)),
        })),
      }),
    });

    ids.forEach((id) => {
      const item = globalData.find((row) => row.id === id);
      const change = pendingStatusChanges[id] || getCheckboxState(id);
      if (item && change) {
        item.statusImage = change.statusImage;
        item.statusPosted = change.statusPosted;
      }
      delete pendingStatusChanges[id];
    });

    updateSummary(globalData);
    filterData();
    setLoadingState(false);
    Swal.fire({
      icon: "success",
      title: "เรียบร้อย",
      timer: 1200,
      showConfirmButton: false,
      text: response?.message || "บันทึกสถานะเรียบร้อย",
    });
  } catch (error) {
    setLoadingState(false);
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถบันทึกสถานะได้", "error");
    await loadData();
  }
}

async function saveStatus(id) {
  await performStatusSave([id]);
}

async function saveAllStatusChanges() {
  const ids = Object.keys(pendingStatusChanges);
  await performStatusSave(ids);
}

function filterData() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const type = document.getElementById("filterType").value;
  const status = document.getElementById("filterStatus").value;

  currentDataList = globalData.filter((item) => {
    const searchTarget = `${item.brand} ${item.model} ${item.cpu} ${item.ram} ${item.storage} ${item.remarks} ${item.features}`.toLowerCase();
    const typeMatch = type === "All" || item.type === type;
    let statusMatch = true;

    if (status === "pending") statusMatch = !item.statusImage || !item.statusPosted;
    if (status === "image-done") statusMatch = item.statusImage;
    if (status === "posted-done") statusMatch = item.statusPosted;
    if (status === "fully-done") statusMatch = item.statusImage && item.statusPosted;

    return searchTarget.includes(keyword) && typeMatch && statusMatch;
  });

  currentPage = 1;
  renderPage();
}

function resetFilters() {
  document.getElementById("searchInput").value = "";
  document.getElementById("filterType").value = "All";
  document.getElementById("filterStatus").value = "All";
  filterData();
}

function updateSummary(data) {
  document.getElementById("countPC").innerText = data.filter((row) => row.type === "PC").length;
  document.getElementById("countNB").innerText = data.filter((row) => row.type === "Notebook").length;
  document.getElementById("countAIO").innerText = data.filter((row) => row.type === "All in One").length;
  document.getElementById("countImgDone").innerText = data.filter((row) => row.statusImage).length;
  document.getElementById("countPosted").innerText = data.filter((row) => row.statusPosted).length;
}

function applyFormDefaults() {
  if (runtimeSettings.defaultType) {
    const typeSelect = document.getElementById("type");
    if (Array.from(typeSelect.options).some((option) => option.value === runtimeSettings.defaultType)) {
      typeSelect.value = runtimeSettings.defaultType;
    }
  }
  if (runtimeSettings.defaultBrand) {
    const brandSelect = document.getElementById("brand");
    if (Array.from(brandSelect.options).some((option) => option.value === runtimeSettings.defaultBrand)) {
      brandSelect.value = runtimeSettings.defaultBrand;
    }
  }
}

function resetFormState() {
  document.getElementById("dataForm").reset();
  document.querySelectorAll(".feature-check").forEach((cb) => {
    cb.checked = false;
  });
  document.getElementById("recId").value = "";
  document.getElementById("currentDate").value = "";
  document.getElementById("currentFolderLink").value = "";
  document.getElementById("modalTitle").innerText = "เพิ่มข้อมูลใหม่";
  document.getElementById("btnSubmit").disabled = false;
  document.getElementById("submissionNonce").value = crypto.randomUUID();
  selectedNewFiles = [];
  currentExistingLinks = [];
  currentEditPassword = "";
  renderPreview();
  applyFormDefaults();
}

function openAddModal() {
  resetFormState();
  formModal.show();
}

async function editData(id) {
  const result = await Swal.fire({
    title: "ยืนยันตัวตน",
    input: "password",
    inputPlaceholder: "รหัสผ่าน",
    showCancelButton: true,
    confirmButtonText: "ยืนยัน",
    cancelButtonText: "ยกเลิก",
  });

  if (!result.isConfirmed) return;

  try {
    const isValid = await verifyPassword(result.value);
    if (!isValid) {
      Swal.fire("ผิดพลาด", "รหัสผ่านไม่ถูกต้อง", "error");
      return;
    }

    const item = globalData.find((row) => row.id === id);
    if (!item) return;

    currentEditPassword = result.value;
    document.getElementById("recId").value = item.id;
    document.getElementById("currentDate").value = item.date;
    document.getElementById("type").value = item.type;
    document.getElementById("brand").value = item.brand;
    document.getElementById("model").value = item.model;
    document.getElementById("cpu").value = item.cpu;
    document.getElementById("ram").value = item.ram;
    document.getElementById("storage").value = item.storage;
    document.getElementById("display").value = item.display;
    document.getElementById("price").value = item.price;
    document.getElementById("remarks").value = item.remarks;
    document.getElementById("currentFolderLink").value = item.folderLink;
    document.getElementById("submissionNonce").value = crypto.randomUUID();
    document.querySelectorAll(".feature-check").forEach((cb) => {
      cb.checked = false;
    });
    if (item.features) {
      item.features.split(", ").forEach((feature) => {
        const checkbox = document.querySelector(`.feature-check[value="${CSS.escape(feature)}"]`);
        if (checkbox) checkbox.checked = true;
      });
    }
    selectedNewFiles = [];
    currentExistingLinks = item.imageLinks ? item.imageLinks.split(",").filter(Boolean) : [];
    renderPreview();
    document.getElementById("modalTitle").innerText = "แก้ไขข้อมูล";
    formModal.show();
  } catch (error) {
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถตรวจสอบรหัสผ่านได้", "error");
  }
}

function viewDetails(id) {
  const item = globalData.find((row) => row.id === id);
  if (!item) return;
  document.getElementById("viewBrandModel").innerText = `${item.brand} ${item.model}`.trim() || "รายละเอียด";
  document.getElementById("viewDate").innerText = item.date || "-";
  document.getElementById("viewType").innerText = item.type || "-";
  document.getElementById("viewCPU").innerText = item.cpu || "-";
  document.getElementById("viewRAM").innerText = item.ram || "-";
  document.getElementById("viewStorage").innerText = item.storage || "-";
  document.getElementById("viewDisplay").innerText = item.display || "-";
  document.getElementById("viewPrice").innerText = `${Number(item.price).toLocaleString()} บาท`;
  document.getElementById("viewFeatures").innerText = item.features || "-";
  document.getElementById("viewRemarks").innerText = item.remarks || "-";
  document.getElementById("viewDriveLink").href = item.folderLink || "#";
  const carousel = document.getElementById("carouselInner");
  carousel.innerHTML = "";
  const images = item.imageLinks ? item.imageLinks.split(",").filter(Boolean) : [];
  if (images.length > 0) {
    images.forEach((url, index) => {
      carousel.innerHTML += `<div class="carousel-item ${index === 0 ? "active" : ""}"><img src="${escapeHtml(url)}" class="d-block w-100" style="height:350px;object-fit:contain;" onerror="this.src='${placeholderImg}'"></div>`;
    });
  } else {
    carousel.innerHTML = '<div class="carousel-item active"><div class="d-flex justify-content-center align-items-center text-muted" style="height:350px;">ไม่มีรูปภาพ</div></div>';
  }
  detailModal.show();
}

function normalizeAdminSettingsData(data) {
  return {
    ...createDefaultRuntimeSettings(),
    ...(data || {}),
    lineTargetPresets: Array.isArray(data?.lineTargetPresets) ? data.lineTargetPresets.map((preset) => ({
      id: preset.id || "",
      name: preset.name || "",
      targetId: preset.targetId || "",
      isEnabled: preset.isEnabled !== false,
    })) : [],
  };
}

function syncLineTargetPresetStateFromDom() {
  if (!adminSettingsState) return;
  const rows = Array.from(document.querySelectorAll("[data-line-target-preset-row]"));
  adminSettingsState.lineTargetPresets = rows.map((row) => ({
    id: row.dataset.id || "",
    name: row.querySelector("[data-field='name']").value.trim(),
    targetId: row.querySelector("[data-field='targetId']").value.trim(),
    isEnabled: row.querySelector("[data-field='isEnabled']").checked,
  }));
  adminSettingsState.activeLineTargetPresetId = document.getElementById("settingsActiveLineTargetPresetId").value || null;
}

function renderLineTargetPresetRows() {
  if (!adminSettingsState) return;
  const list = document.getElementById("lineTargetPresetList");
  const select = document.getElementById("settingsActiveLineTargetPresetId");
  list.innerHTML = "";

  if (adminSettingsState.lineTargetPresets.length === 0) {
    adminSettingsState.lineTargetPresets.push({
      id: `local-${crypto.randomUUID()}`,
      name: "",
      targetId: "",
      isEnabled: true,
    });
  }

  adminSettingsState.lineTargetPresets.forEach((preset, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "settings-preset-card";
    wrapper.dataset.lineTargetPresetRow = "true";
    wrapper.dataset.id = preset.id || "";
    wrapper.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-md-3">
          <label class="settings-grid-label">ชื่อปลายทาง</label>
          <input type="text" class="form-control rounded-3" data-field="name" value="${escapeHtml(preset.name)}" placeholder="เช่น กลุ่มขายจริง">
        </div>
        <div class="col-md-6">
          <label class="settings-grid-label">LINE Target ID</label>
          <input type="text" class="form-control rounded-3" data-field="targetId" value="${escapeHtml(preset.targetId)}" placeholder="Uxxxxxxxx หรือ Cxxxxxxxx">
        </div>
        <div class="col-md-2">
          <div class="form-check form-switch pt-2">
            <input class="form-check-input" type="checkbox" data-field="isEnabled" ${preset.isEnabled ? "checked" : ""}>
            <label class="form-check-label">เปิดใช้งาน</label>
          </div>
        </div>
        <div class="col-md-1 d-grid">
          <button type="button" class="btn btn-outline-danger rounded-pill" onclick="removeLineTargetPresetRow(${index})"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
    list.appendChild(wrapper);
  });

  select.innerHTML = "";
  adminSettingsState.lineTargetPresets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id || "";
    option.textContent = preset.name || "(ยังไม่ได้ตั้งชื่อ)";
    select.appendChild(option);
  });

  if (adminSettingsState.activeLineTargetPresetId) {
    select.value = adminSettingsState.activeLineTargetPresetId;
  }
  if (!select.value && select.options.length > 0) {
    select.selectedIndex = 0;
    adminSettingsState.activeLineTargetPresetId = select.value || null;
  }
}

function populateAdminSettingsForm() {
  if (!adminSettingsState) return;
  document.getElementById("settingsLineNotifyEnabled").checked = Boolean(adminSettingsState.lineNotifyEnabled);
  document.getElementById("settingsLineMessageHeader").value = adminSettingsState.lineMessageHeader || "";
  document.getElementById("settingsLineMessageSeparator").value = adminSettingsState.lineMessageSeparator || "";
  document.getElementById("settingsLineIncludeFrontendUrl").checked = Boolean(adminSettingsState.lineMessageIncludeFrontendUrl);
  document.getElementById("settingsDriveParentFolderId").value = adminSettingsState.googleDriveParentFolderId || "";
  document.getElementById("settingsDefaultType").value = adminSettingsState.defaultType || "";
  document.getElementById("settingsDefaultBrand").value = adminSettingsState.defaultBrand || "";
  document.getElementById("settingsFeatureBulkStatusEnabled").checked = Boolean(adminSettingsState.featureBulkStatusEnabled);
  document.getElementById("settingsFeatureSubmitLockEnabled").checked = Boolean(adminSettingsState.featureSubmitLockEnabled);
  document.getElementById("settingsFeatureDedupeEnabled").checked = Boolean(adminSettingsState.featureDedupeEnabled);
  renderLineTargetPresetRows();
}

async function openAdminSettings() {
  let password = adminSettingsSessionPassword;
  if (!password) {
    const result = await Swal.fire({
      title: "เข้าสู่ระบบผู้ดูแล",
      input: "password",
      inputPlaceholder: "รหัสผ่านผู้ดูแล",
      showCancelButton: true,
      confirmButtonText: "เข้าสู่ระบบ",
      cancelButtonText: "ยกเลิก",
    });

    if (!result.isConfirmed) return;
    password = result.value || "";
    const isValid = await verifyAdminSettingsPassword(password);
    if (!isValid) {
      Swal.fire("ผิดพลาด", "รหัสผ่านผู้ดูแลไม่ถูกต้อง", "error");
      return;
    }
    adminSettingsSessionPassword = password;
  }

  try {
    setLoadingState(true, "กำลังโหลดการตั้งค่า...");
    const response = await apiRequest("records", {
      method: "POST",
      query: "action=get-admin-settings",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: adminSettingsSessionPassword }),
    });
    adminSettingsState = normalizeAdminSettingsData(response?.data);
    populateAdminSettingsForm();
    setLoadingState(false);
    adminSettingsModal.show();
  } catch (error) {
    adminSettingsSessionPassword = "";
    handleError(error);
  }
}

function addLineTargetPresetRow() {
  syncLineTargetPresetStateFromDom();
  adminSettingsState.lineTargetPresets.push({
    id: `local-${crypto.randomUUID()}`,
    name: "",
    targetId: "",
    isEnabled: true,
  });
  renderLineTargetPresetRows();
}

function removeLineTargetPresetRow(index) {
  syncLineTargetPresetStateFromDom();
  adminSettingsState.lineTargetPresets.splice(index, 1);
  if (!adminSettingsState.lineTargetPresets.some((preset) => preset.id === adminSettingsState.activeLineTargetPresetId)) {
    adminSettingsState.activeLineTargetPresetId = adminSettingsState.lineTargetPresets[0]?.id || null;
  }
  renderLineTargetPresetRows();
}

async function saveAdminSettings() {
  if (!adminSettingsSessionPassword) {
    Swal.fire("ผิดพลาด", "กรุณาเข้าสู่ระบบผู้ดูแลใหม่อีกครั้ง", "error");
    return;
  }

  syncLineTargetPresetStateFromDom();
  adminSettingsState.lineNotifyEnabled = document.getElementById("settingsLineNotifyEnabled").checked;
  adminSettingsState.lineMessageHeader = document.getElementById("settingsLineMessageHeader").value.trim();
  adminSettingsState.lineMessageSeparator = document.getElementById("settingsLineMessageSeparator").value.trim();
  adminSettingsState.lineMessageIncludeFrontendUrl = document.getElementById("settingsLineIncludeFrontendUrl").checked;
  adminSettingsState.googleDriveParentFolderId = document.getElementById("settingsDriveParentFolderId").value.trim();
  adminSettingsState.defaultType = document.getElementById("settingsDefaultType").value;
  adminSettingsState.defaultBrand = document.getElementById("settingsDefaultBrand").value.trim();
  adminSettingsState.featureBulkStatusEnabled = document.getElementById("settingsFeatureBulkStatusEnabled").checked;
  adminSettingsState.featureSubmitLockEnabled = document.getElementById("settingsFeatureSubmitLockEnabled").checked;
  adminSettingsState.featureDedupeEnabled = document.getElementById("settingsFeatureDedupeEnabled").checked;
  adminSettingsState.activeLineTargetPresetId = document.getElementById("settingsActiveLineTargetPresetId").value || null;

  try {
    setLoadingState(true, "กำลังบันทึกการตั้งค่า...");
    const response = await apiRequest("records", {
      method: "POST",
      query: "action=save-admin-settings",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: adminSettingsSessionPassword,
        googleDriveParentFolderId: adminSettingsState.googleDriveParentFolderId,
        lineNotifyEnabled: adminSettingsState.lineNotifyEnabled,
        activeLineTargetPresetId: adminSettingsState.activeLineTargetPresetId,
        lineMessageHeader: adminSettingsState.lineMessageHeader,
        lineMessageSeparator: adminSettingsState.lineMessageSeparator,
        lineMessageIncludeFrontendUrl: adminSettingsState.lineMessageIncludeFrontendUrl,
        defaultType: adminSettingsState.defaultType,
        defaultBrand: adminSettingsState.defaultBrand,
        featureBulkStatusEnabled: adminSettingsState.featureBulkStatusEnabled,
        featureSubmitLockEnabled: adminSettingsState.featureSubmitLockEnabled,
        featureDedupeEnabled: adminSettingsState.featureDedupeEnabled,
        lineTargetPresets: adminSettingsState.lineTargetPresets,
      }),
    });

    adminSettingsState = normalizeAdminSettingsData(response?.data);
    runtimeSettings = {
      ...runtimeSettings,
      googleDriveParentFolderId: adminSettingsState.googleDriveParentFolderId,
      lineNotifyEnabled: adminSettingsState.lineNotifyEnabled,
      activeLineTargetPresetId: adminSettingsState.activeLineTargetPresetId,
      lineMessageHeader: adminSettingsState.lineMessageHeader,
      lineMessageSeparator: adminSettingsState.lineMessageSeparator,
      lineMessageIncludeFrontendUrl: adminSettingsState.lineMessageIncludeFrontendUrl,
      defaultType: adminSettingsState.defaultType,
      defaultBrand: adminSettingsState.defaultBrand,
      featureBulkStatusEnabled: adminSettingsState.featureBulkStatusEnabled,
      featureSubmitLockEnabled: adminSettingsState.featureSubmitLockEnabled,
      featureDedupeEnabled: adminSettingsState.featureDedupeEnabled,
      lineTargetPresetNames: adminSettingsState.lineTargetPresets.map((preset) => ({ id: preset.id, name: preset.name })),
      lineTargetPresets: adminSettingsState.lineTargetPresets,
    };
    applyRuntimeSettingsToUi();
    setLoadingState(false);
    adminSettingsModal.hide();
    Swal.fire({
      icon: "success",
      title: "บันทึกแล้ว",
      timer: 1200,
      showConfirmButton: false,
      text: response?.message || "บันทึกการตั้งค่าเรียบร้อย",
    });
  } catch (error) {
    setLoadingState(false);
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถบันทึกการตั้งค่าได้", "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  formModal = new bootstrap.Modal(document.getElementById("formModal"));
  detailModal = new bootstrap.Modal(document.getElementById("detailModal"));
  adminSettingsModal = new bootstrap.Modal(document.getElementById("adminSettingsModal"));
  document.getElementById("searchInput").addEventListener("keyup", filterData);
  document.getElementById("filterType").addEventListener("change", filterData);
  document.getElementById("filterStatus").addEventListener("change", filterData);
  document.getElementById("fileInput").addEventListener("change", handleFileSelect);
  await loadRuntimeSettings();
  resetFormState();
  await loadData();
});

window.openAddModal = openAddModal;
window.submitData = submitData;
window.changePage = changePage;
window.toggleSaveBtn = toggleSaveBtn;
window.saveStatus = saveStatus;
window.saveAllStatusChanges = saveAllStatusChanges;
window.clearPendingStatusChanges = clearPendingStatusChanges;
window.editData = editData;
window.viewDetails = viewDetails;
window.removeNewFile = removeNewFile;
window.removeExistingLink = removeExistingLink;
window.resetFilters = resetFilters;
window.openAdminSettings = openAdminSettings;
window.addLineTargetPresetRow = addLineTargetPresetRow;
window.removeLineTargetPresetRow = removeLineTargetPresetRow;
window.saveAdminSettings = saveAdminSettings;
