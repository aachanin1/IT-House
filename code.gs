/**
 * ตั้งค่าพื้นฐาน
 */
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const TELEGRAM_TOKEN = SCRIPT_PROPERTIES.getProperty('TELEGRAM_TOKEN') || '';
const CHAT_ID = SCRIPT_PROPERTIES.getProperty('CHAT_ID') || '';
const PASSWORD_EDIT = SCRIPT_PROPERTIES.getProperty('PASSWORD_EDIT') || '';
const FOLDER_ID = SCRIPT_PROPERTIES.getProperty('FOLDER_ID') || '';
const WEB_APP_URL = SCRIPT_PROPERTIES.getProperty('WEB_APP_URL') || '';

// Google Sheets : https://docs.google.com/spreadsheets/d/1TaLh0NUAU8Bf48u1fo7T5TYHu_bSiyxAh2P-IDkiY4E/edit?usp=sharing

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('ระบบคลังคอมพิวเตอร์')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Database');
  if (!sheet) {
    sheet = ss.insertSheet('Database');
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet) ss.deleteSheet(defaultSheet);
  }
  const headers = ['ID', 'Date_Created', 'Type', 'Brand', 'Model', 'CPU', 'RAM', 'Storage', 'Display_Size', 'Price', 'Features', 'Remarks', 'Folder_Link', 'Image_Links', 'Status_Image', 'Status_Posted'];
  
  const currentHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  if (currentHeaders.length < headers.length) {
     sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#f0f0f0');
  }
  sheet.setFrozenRows(1);
}

function getThaiDatePrefix(dateObj) {
  const d = dateObj || new Date();
  const day = ('0' + d.getDate()).slice(-2);
  const month = ('0' + (d.getMonth() + 1)).slice(-2);
  const year = (d.getFullYear() + 543).toString().slice(-2); 
  return `${day}${month}${year}`;
}

function initializeSave(formData) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Database');
    const isEdit = formData.recId && formData.recId !== "";
    
    let mainFolder;
    try {
      mainFolder = DriveApp.getFolderById(FOLDER_ID);
    } catch (e) {
      return { success: false, message: "Error: ไม่พบ Folder ID หรือไม่มีสิทธิ์เข้าถึง" };
    }

    let subFolder;
    let folderPrefix = "";

    if (isEdit && formData.currentFolderLink) {
       try {
           const idMatch = formData.currentFolderLink.match(/[-\w]{25,}/);
           if (idMatch) {
               subFolder = DriveApp.getFolderById(idMatch[0]);
               const oldName = subFolder.getName();
               const parts = oldName.split('-');
               if (parts.length > 1 && !isNaN(parts[0]) && parts[0].length === 6) {
                   folderPrefix = parts[0]; 
               } else {
                   folderPrefix = getThaiDatePrefix(new Date()); 
               }
           }
       } catch (e) { console.log("หาโฟลเดอร์เดิมไม่เจอ: " + e); }
    }

    if (!subFolder) {
        folderPrefix = getThaiDatePrefix(new Date());
    }

    const cleanName = `${formData.brand} ${formData.model} ${formData.cpu}`.trim();
    const desiredFolderName = `${folderPrefix}-${cleanName}`;

    if (subFolder) {
        if (subFolder.getName() !== desiredFolderName) {
            subFolder.setName(desiredFolderName);
        }
    } else {
        const existing = mainFolder.getFoldersByName(desiredFolderName);
        if (existing.hasNext()) {
            subFolder = existing.next();
        } else {
            subFolder = mainFolder.createFolder(desiredFolderName);
        }
    }
    
    const folderUrl = subFolder.getUrl();
    const folderId = subFolder.getId();
    const timestamp = new Date();
    const recordId = isEdit ? formData.recId : Utilities.getUuid();
    const currentImages = formData.keptExistingImages || [];
    
    const rowDataCommon = [
       formData.type, formData.brand, formData.model,
       formData.cpu, formData.ram, formData.storage,
       formData.display, formData.price, formData.features,
       formData.remarks, folderUrl, currentImages.join(',')
    ];

    if (isEdit) {
      const data = sheet.getDataRange().getValues();
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0].toString() === recordId.toString()) {
          rowIndex = i + 1;
          break;
        }
      }
      if (rowIndex > -1) {
        sheet.getRange(rowIndex, 3, 1, rowDataCommon.length).setValues([rowDataCommon]);
      }
    } else {
      const newRow = [
        recordId, timestamp, ...rowDataCommon, "FALSE", "FALSE"
      ];
      sheet.appendRow(newRow);
      sendTelegramNotify(newRow);
    }

    return { 
        success: true, 
        folderId: folderId, 
        folderUrl: folderUrl,
        rowId: recordId,
        message: "บันทึกข้อมูลเบื้องต้นแล้ว กำลังเริ่มอัพโหลดรูป..." 
    };

  } catch (e) {
    return { success: false, message: "Init Error: " + e.toString() };
  }
}

function uploadSingleImage(folderId, base64Data, contentType, fileName) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), contentType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const lh3Link = `https://lh3.googleusercontent.com/d/${file.getId()}`;
    return { success: true, link: lh3Link };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function finalizeImageLinks(rowId, allImageLinks) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Database');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === rowId.toString()) {
        sheet.getRange(i + 1, 14).setValue(allImageLinks.join(','));
        return { success: true };
      }
    }
    return { success: false, message: "ไม่พบ Row ID" };
  } catch(e) {
    return { success: false, message: e.toString() };
  }
}

function updateTodoList(id, statusImage, statusPosted) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Database');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0].toString() === id.toString()) {
        sheet.getRange(i + 1, 15, 1, 2).setValues([[statusImage, statusPosted]]);
        return { success: true, message: "บันทึกสถานะเรียบร้อย" };
      }
    }
    return { success: false, message: "ไม่พบข้อมูล ID" };
  } catch (e) {
    return { success: false, message: "Error: " + e.toString() };
  }
}

function getAllData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('Database');
    if (!sheet) return [];
    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return []; 
    data.shift(); 
    const validData = data.filter(row => row[0] && row[0].toString() !== "");
    return validData.map(row => ({
      id: row[0],
      date: row[1] ? Utilities.formatDate(new Date(row[1]), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") : "",
      type: row[2] || "",
      brand: row[3] || "",
      model: row[4] || "",
      cpu: row[5] || "",
      ram: row[6] || "",
      storage: row[7] || "",
      display: row[8] || "",
      price: row[9] || 0,
      features: row[10] || "",
      remarks: row[11] || "",
      folderLink: row[12] || "",
      imageLinks: row[13] || "",
      statusImage: row[14] === true || row[14] === "TRUE" || row[14] === "true",
      statusPosted: row[15] === true || row[15] === "TRUE" || row[15] === "true"
    })).reverse();
  } catch (e) { return []; }
}

function checkPassword(inputPass) {
  return inputPass === PASSWORD_EDIT;
}

/**
 * แจ้งเตือน Telegram แบบกำหนดเอง
 * แสดง Feature/Remarks เฉพาะที่มีข้อมูล
 * มี Link กดเข้าเว็บ
 */
function sendTelegramNotify(data) {
  if (!TELEGRAM_TOKEN || !CHAT_ID) return;
  
  // สร้างข้อความพื้นฐาน
  let message = `📢 *แจ้งเตือน: มีการเพิ่มข้อมูลใหม่*\n`;
  message += `---------------------------\n`;
  message += `📋 *ประเภท:* ${data[2]}\n`;
  message += `📌 *รุ่น:* ${data[3]} ${data[4]}\n`;
  message += `⚙️ *CPU:* ${data[5]}\n`;
  message += `🔹 *Ram:* ${data[6]}\n`;
  message += `🔹 *Storage:* ${data[7]}\n`;
  
  // เพิ่มหน้าจอ (Column 8)
  if (data[8] && data[8].toString().trim() !== "" && data[8].toString().trim() !== "-") {
     message += `🖥️ *หน้าจอ:* ${data[8]}\n`;
  }

  // เพิ่มคุณสมบัติ (Column 10) เฉพาะที่มีข้อมูล
  if (data[10] && data[10].toString().trim() !== "" && data[10].toString().trim() !== "-") {
    message += `✨ *คุณสมบัติ:* ${data[10]}\n`;
  }
  
  // เพิ่มหมายเหตุ (Column 11) เฉพาะที่มีข้อมูล
  if (data[11] && data[11].toString().trim() !== "" && data[11].toString().trim() !== "-") {
    message += `📝 *หมายเหตุ:* ${data[11]}\n`;
  }
  
  message += `💰 *ราคา:* ${Number(data[9]).toLocaleString()} บาท\n`;
  message += `---------------------------\n`;
  message += `[ตรวจสอบรายละเอียดเพิ่มเติมได้ในระบบ "คลิก"](${WEB_APP_URL})`;

  try {
    UrlFetchApp.fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      'method': 'post',
      'payload': { 
        'chat_id': CHAT_ID, 
        'text': message, 
        'parse_mode': 'Markdown',
        'disable_web_page_preview': true // ปิดพรีวิวลิงก์เพื่อให้ข้อความกระชับ
      }
    });
  } catch (e) {
    Logger.log("Telegram Error: " + e.toString());
  }
}