let globalData = [];
let currentDataList = [];
let currentPage = 1;
const itemsPerPage = 25;
const placeholderImg = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23f8f9fa'/%3E%3Ctext x='50' y='50' font-family='Arial' font-size='12' fill='%23adb5bd' text-anchor='middle' dy='.3em'%3ENo Image%3C/text%3E%3C/svg%3E";
let selectedNewFiles = [];
let currentExistingLinks = [];
let currentEditPassword = "";
let formModal;
let detailModal;

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

function handleFileSelect(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  Array.from(files).forEach(file => selectedNewFiles.push(file));
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
    reader.onload = function (e) {
      const div = document.createElement("div");
      div.className = "preview-item shadow-sm";
      div.innerHTML = `<img src="${e.target.result}"><button type="button" class="btn-remove-img" onclick="removeNewFile(${index})">×</button>`;
      container.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
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

function handleError(error) {
  setLoadingState(false);
  Swal.fire("Connection Error", error?.message || "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้", "error");
}

function renderData(data) {
  const normalizedData = data.map(normalizeItem);
  globalData = normalizedData;
  updateSummary(normalizedData);
  currentDataList = normalizedData;
  currentPage = 1;
  renderPage();
  setLoadingState(false);
}

function buildRecordFormData() {
  const featureChecks = document.querySelectorAll(".feature-check:checked");
  const featuresList = Array.from(featureChecks).map(cb => cb.value);
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
  formData.append("features", JSON.stringify(featuresList));
  formData.append("remarks", document.getElementById("remarks").value);
  formData.append("keptExistingImages", JSON.stringify(currentExistingLinks));

  if (recId && currentEditPassword) {
    formData.append("password", currentEditPassword);
  }

  selectedNewFiles.forEach(file => {
    formData.append("images", file, file.name);
  });

  return formData;
}

function submitRecordWithProgress(formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl("records"));

    xhr.upload.onprogress = event => {
      if (!event.lengthComputable) return;
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      document.getElementById("progressBar").style.width = `${percent}%`;
      document.getElementById("progressDetail").innerText = `กำลังส่งข้อมูลและรูปภาพ ${percent}%`;
    };

    xhr.onload = () => {
      try {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        if (xhr.status >= 200 && xhr.status < 300) {
          document.getElementById("progressBar").style.width = "100%";
          document.getElementById("progressDetail").innerText = "กำลังประมวลผลบนเซิร์ฟเวอร์...";
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
  const missingRequired = requiredIds.some(id => !document.getElementById(id).value);

  if (missingRequired) {
    Swal.fire("แจ้งเตือน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบถ้วน (*)", "warning");
    return;
  }

  const btn = document.getElementById("btnSubmit");
  btn.disabled = true;

  try {
    setLoadingState(true, "กำลังบันทึกข้อมูล...", true);
    const response = await submitRecordWithProgress(buildRecordFormData());
    formModal.hide();
    setLoadingState(false);
    currentEditPassword = "";
    Swal.fire({ icon: "success", title: "สำเร็จ", text: response?.message || "บันทึกข้อมูลเรียบร้อย", timer: 1500, showConfirmButton: false });
    await loadData();
  } catch (error) {
    setLoadingState(false);
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถบันทึกข้อมูลได้", "error");
  } finally {
    btn.disabled = false;
  }
}

function renderPage() {
  const tbody = document.getElementById("dataTableBody");
  tbody.innerHTML = "";

  if (!currentDataList || currentDataList.length === 0) {
    document.getElementById("noDataMessage").style.display = "block";
    document.getElementById("paginationContainer").innerHTML = "";
    return;
  }

  document.getElementById("noDataMessage").style.display = "none";
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedItems = currentDataList.slice(start, end);

  paginatedItems.forEach(item => {
    let imgHtml = `<img src="${placeholderImg}" class="rounded-3 border" style="width:50px;height:50px;object-fit:cover;">`;
    if (item.imageLinks && item.imageLinks.length > 5) {
      const firstImg = item.imageLinks.split(",")[0];
      imgHtml = `<img src="${escapeHtml(firstImg)}" class="rounded-3 border" style="width:50px;height:50px;object-fit:cover;" onerror="this.src='${placeholderImg}'">`;
    }
    const chkImageAttr = item.statusImage ? "checked disabled" : "";
    const chkPostedAttr = item.statusPosted ? "checked disabled" : "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="ps-4">${imgHtml}</td>
      <td><div class="d-flex flex-column gap-1"><div class="form-check mb-0"><input class="form-check-input status-check" type="checkbox" id="chk_img_${escapeHtml(item.id)}" ${chkImageAttr} onchange="toggleSaveBtn('${escapeHtml(item.id)}')"><label class="form-check-label small text-muted" for="chk_img_${escapeHtml(item.id)}">ทำรูปแล้ว</label></div><div class="form-check mb-0"><input class="form-check-input status-check" type="checkbox" id="chk_post_${escapeHtml(item.id)}" ${chkPostedAttr} onchange="toggleSaveBtn('${escapeHtml(item.id)}')"><label class="form-check-label small text-muted" for="chk_post_${escapeHtml(item.id)}">โพสต์แล้ว</label></div></div><button id="btn_save_status_${escapeHtml(item.id)}" class="btn btn-sm btn-success rounded-pill mt-2 w-100 py-0" style="font-size:11px; display:none;" onclick="saveStatus('${escapeHtml(item.id)}')" disabled><i class="fas fa-check me-1"></i> บันทึก</button></td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(item.type)}</span></td>
      <td><div class="fw-bold text-dark">${escapeHtml(item.brand)}</div><small class="text-muted">${escapeHtml(item.model)}</small></td>
      <td><small class="text-muted text-truncate d-block" style="max-width:180px;">${escapeHtml(item.cpu)} / ${escapeHtml(item.ram)} / ${escapeHtml(item.storage)}</small></td>
      <td class="text-success fw-bold">${Number(item.price).toLocaleString()}</td>
      <td class="text-center"><button class="btn btn-sm btn-light text-primary border rounded-circle" style="width:32px;height:32px;" onclick="viewDetails('${escapeHtml(item.id)}')"><i class="fas fa-eye"></i></button><button class="btn btn-sm btn-light text-warning border rounded-circle ms-1" style="width:32px;height:32px;" onclick="editData('${escapeHtml(item.id)}')"><i class="fas fa-pen"></i></button></td>
    `;
    tbody.appendChild(tr);
  });

  renderPaginationControls();
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
  for (let i = 1; i <= totalPages; i++) {
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

function toggleSaveBtn(id) {
  const chkImg = document.getElementById(`chk_img_${id}`);
  const chkPost = document.getElementById(`chk_post_${id}`);
  const btn = document.getElementById(`btn_save_status_${id}`);
  const isNewCheckImg = chkImg.checked && !chkImg.disabled;
  const isNewCheckPost = chkPost.checked && !chkPost.disabled;
  if (isNewCheckImg || isNewCheckPost) {
    btn.disabled = false;
    btn.style.display = "block";
  } else {
    btn.disabled = true;
    btn.style.display = "none";
  }
}

async function verifyPassword(password) {
  const response = await apiRequest("records", {
    method: "POST",
    query: "action=verify-password",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  return Boolean(response?.success);
}

async function saveStatus(id) {
  const result = await Swal.fire({
    title: "ยืนยัน",
    text: "ต้องการบันทึกสถานะใช่หรือไม่?",
    input: "password",
    inputPlaceholder: "รหัสผ่าน",
    showCancelButton: true,
    confirmButtonText: "บันทึก",
    cancelButtonText: "ยกเลิก",
    confirmButtonColor: "#198754"
  });

  if (!result.isConfirmed) return;

  try {
    setLoadingState(true, "กำลังบันทึก...");
    const response = await apiRequest("records", {
      method: "PATCH",
      query: "action=status",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        password: result.value,
        statusImage: document.getElementById(`chk_img_${id}`).checked,
        statusPosted: document.getElementById(`chk_post_${id}`).checked,
      })
    });

    const item = globalData.find(data => data.id === id);
    if (item) {
      item.statusImage = document.getElementById(`chk_img_${id}`).checked;
      item.statusPosted = document.getElementById(`chk_post_${id}`).checked;
    }
    renderPage();
    updateSummary(globalData);
    setLoadingState(false);
    Swal.fire({ icon: "success", title: "เรียบร้อย", timer: 1000, showConfirmButton: false, text: response?.message || "บันทึกสถานะเรียบร้อย" });
  } catch (error) {
    setLoadingState(false);
    Swal.fire("ผิดพลาด", error?.message || "ไม่สามารถบันทึกสถานะได้", "error");
    await loadData();
  }
}

function filterData() {
  if (!globalData) return;
  const keyword = document.getElementById("searchInput").value.toLowerCase();
  const type = document.getElementById("filterType").value;
  const filtered = globalData.filter(item => {
    const str = `${item.brand} ${item.model} ${item.cpu} ${item.ram}`.toLowerCase();
    return str.includes(keyword) && (type === "All" || item.type === type);
  });
  currentDataList = filtered;
  currentPage = 1;
  renderPage();
}

function updateSummary(data) {
  document.getElementById("countPC").innerText = data.filter(d => d.type === "PC").length;
  document.getElementById("countNB").innerText = data.filter(d => d.type === "Notebook").length;
  document.getElementById("countAIO").innerText = data.filter(d => d.type === "All in One").length;
  document.getElementById("countImgDone").innerText = data.filter(d => d.statusImage).length;
  document.getElementById("countPosted").innerText = data.filter(d => d.statusPosted).length;
}

function resetFormState() {
  document.getElementById("dataForm").reset();
  document.querySelectorAll(".feature-check").forEach(cb => cb.checked = false);
  document.getElementById("recId").value = "";
  document.getElementById("currentDate").value = "";
  document.getElementById("currentFolderLink").value = "";
  document.getElementById("modalTitle").innerText = "เพิ่มข้อมูลใหม่";
  document.getElementById("btnSubmit").disabled = false;
  selectedNewFiles = [];
  currentExistingLinks = [];
  currentEditPassword = "";
  renderPreview();
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
    cancelButtonText: "ยกเลิก"
  });

  if (!result.isConfirmed) return;

  try {
    const isValid = await verifyPassword(result.value);
    if (!isValid) {
      Swal.fire("ผิดพลาด", "รหัสผ่านไม่ถูกต้อง", "error");
      return;
    }

    const item = globalData.find(data => data.id === id);
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
    document.querySelectorAll(".feature-check").forEach(cb => cb.checked = false);
    if (item.features) {
      item.features.split(", ").forEach(feature => {
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
  const item = globalData.find(data => data.id === id);
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

document.addEventListener("DOMContentLoaded", () => {
  formModal = new bootstrap.Modal(document.getElementById("formModal"));
  detailModal = new bootstrap.Modal(document.getElementById("detailModal"));
  document.getElementById("searchInput").addEventListener("keyup", filterData);
  document.getElementById("filterType").addEventListener("change", filterData);
  document.getElementById("fileInput").addEventListener("change", handleFileSelect);
  loadData();
});

window.openAddModal = openAddModal;
window.submitData = submitData;
window.changePage = changePage;
window.toggleSaveBtn = toggleSaveBtn;
window.saveStatus = saveStatus;
window.editData = editData;
window.viewDetails = viewDetails;
window.removeNewFile = removeNewFile;
window.removeExistingLink = removeExistingLink;
