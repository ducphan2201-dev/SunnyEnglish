/* 
 * BẢN NÂNG CẤP BACKEND SUNNY ENGLISH 3.0 (TỰ ĐÔNG LƯU TRỮ - ARCHIVE)
 * ----------------------------------------------------
 * Phiên bản này áp dụng:
 * 1. CacheService & Array Batching
 * 2. Lưu trữ tự động: đẩy học sinh "Nghỉ học" qua HocSinh_Archive
 * 3. Bộ lọc điểm danh: Tự động loại bỏ dữ liệu quá 90 ngày lúc phản hồi JSON
 */

var CACHE_KEY = "SUNNY_ENGLISH_DATA_V2";

// Hàm xử lý POST requests từ Frontend app.js
function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); 
  
  try {
    var rawData = e.postData.contents;
    var request = JSON.parse(rawData);
    var action = request.action;
    var data = request.data;
    var result = null;
    
    // ĐIỀU HƯỚNG YÊU CẦU:
    if (action === "loadInitialData") {
      result = loadInitialDataCached();
    } else if (action === "saveStudent") {
      // Dùng hàm chuyên biệt cho Học sinh để xử lý Archive
      result = processSaveStudent(data);
    } else if (action === "deleteStudent") {
      result = processDeleteStudent(data.ID);
    } else if (action === "saveClass") {
      result = updateSheetData("CaiDatLop", "ClassName", data.ClassName, [
        data.ClassName, Number(data.Fee) || 0
      ]);
    } else if (action === "saveAttendance") {
      var idKey = data.date + "_" + data.className;
      result = updateSheetData("DiemDanh", "IDKey", idKey, [
        idKey, data.date, data.className, data.absents || "", data.lates || "", data.unexcusedAbsents || ""
      ]);
    } else {
      throw new Error("Action không tồn tại!");
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      data: result
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Máy chủ SunnyEnglish đang hoạt động bình thường!");
}

/* ========================================================
   CÁC HÀM XỬ LÝ LÕI BÊN DƯỚI (KHÔNG CẦN CHỈNH SỬA)
=========================================================*/

function loadInitialDataCached() {
  var cache = CacheService.getScriptCache();
  var cachedString = cache.get(CACHE_KEY);
  
  if (cachedString != null) {
    return JSON.parse(cachedString);
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Tải bảng Lớp Học
  var classSheet = ss.getSheetByName("CaiDatLop");
  var classData = [];
  if (classSheet && classSheet.getLastRow() > 1) {
    var classValues = classSheet.getRange(2, 1, classSheet.getLastRow() - 1, 2).getDisplayValues();
    for (var i = 0; i < classValues.length; i++) {
       classData.push({ 
         ClassName: String(classValues[i][0] || ""), 
         Fee: Number(classValues[i][1]) || 50000 
       });
    }
  }

  // 2. Tải bảng Học Sinh (Trừ các bé đã chui vào Archive)
  var studentSheet = ss.getSheetByName("HocSinh");
  var studentData = [];
  if (studentSheet && studentSheet.getLastRow() > 1) {
    var studentValues = studentSheet.getRange(2, 1, studentSheet.getLastRow() - 1, 8).getDisplayValues();
    for (var j = 0; j < studentValues.length; j++) {
       var row = studentValues[j];
       if (!row[0]) continue; 
       studentData.push({
         ID: String(row[0] || ""), Name: String(row[1] || ""), 
         Class: String(row[2] || ""), DOB: String(row[3] || ""),
         EnrollDate: String(row[4] || ""), Phone: String(row[5] || ""),
         Eval: String(row[6] || ""), Status: String(row[7] || "")
       });
    }
  }

  // 3. Tải bảng Điểm Danh (CÓ BỘ LỌC 90 NGÀY SIÊU NHẸ)
  var attSheet = ss.getSheetByName("DiemDanh");
  var attData = [];
  if (attSheet && attSheet.getLastRow() > 1) {
    var attValues = attSheet.getRange(2, 1, attSheet.getLastRow() - 1, 6).getDisplayValues();
    
    // Tạo mốc quá khứ 90 ngày (3 tháng)
    var filterDate = new Date();
    filterDate.setDate(filterDate.getDate() - 90);
    
    for (var k = 0; k < attValues.length; k++) {
       var rowA = attValues[k];
       var dateStr = String(rowA[1] || "");
       
       // Sàng lọc ngày (Lấy 90 ngày gần nhất)
       var recordDate = new Date(dateStr);
       if (recordDate >= filterDate || isNaN(recordDate.getTime())) {
          attData.push({
             IDKey: String(rowA[0] || ""),
             date: dateStr,
             className: String(rowA[2] || ""),
             absents: String(rowA[3] || ""),
             lates: String(rowA[4] || ""),
             unexcusedAbsents: String(rowA[5] || "")
          });
       }
    }
  }
  
  var finalData = { classes: classData, students: studentData, attendances: attData };
  
  try {
     var jsonString = JSON.stringify(finalData);
     if (jsonString.length < 95000) { cache.put(CACHE_KEY, jsonString, 21600); }
  } catch(e) {}

  return finalData;
}

// Hàm Xử lý Lưu Học sinh (CÓ AUTO-ARCHIVE NẾU NGHỈ HỌC)
function processSaveStudent(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("HocSinh");
  var archiveSheet = ss.getSheetByName("HocSinh_Archive");
  
  // Tự tạo bảng nếu chưa có
  if (!sheet) {
    sheet = ss.insertSheet("HocSinh");
    sheet.appendRow(["ID", "Name", "Class", "DOB", "EnrollDate", "Phone", "Eval", "Status"]);
  }
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet("HocSinh_Archive");
    archiveSheet.appendRow(["Archive_ID", "Name", "Class", "DOB", "EnrollDate", "Phone", "Eval", "Status"]);
  }
  
  var rowDataArray = [
    data.ID, data.Name || "", data.Class || "", data.DOB || "", 
    data.EnrollDate || "", data.Phone || "", data.Eval || "", data.Status || ""
  ];
  
  var lastRow = sheet.getLastRow();
  var isArchive = (data.Status === "Nghỉ học");
  
  if (lastRow > 1) {
    var sheetData = sheet.getDataRange().getValues();
    var foundIndex = -1;
    
    // Quét tìm học sinh cũ
    for (var i = 1; i < sheetData.length; i++) {
       if (String(sheetData[i][0]) === String(data.ID)) {
          foundIndex = i;
          break;
       }
    }
    
    if (isArchive) {
       archiveSheet.appendRow(rowDataArray);
       if (foundIndex > -1) {
           sheetData.splice(foundIndex, 1);
           sheet.clearContents();
           if (sheetData.length > 0) {
              sheet.getRange(1, 1, sheetData.length, sheetData[0].length).setValues(sheetData);
           }
       }
    } else {
       if (foundIndex > -1) {
          sheetData[foundIndex] = rowDataArray;
          sheet.getRange(1, 1, sheetData.length, sheetData[0].length).setValues(sheetData);
       } else {
          sheet.appendRow(rowDataArray);
       }
    }
  } else {
    // Nếu sheet trống (chỉ có header)
    if (isArchive) {
        archiveSheet.appendRow(rowDataArray);
    } else {
        sheet.appendRow(rowDataArray);
    }
  }
  
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { success: true };
}

// Hàm cập nhật cơ bản cho Lớp và Điểm Danh
function updateSheetData(sheetName, idColumnName, idValue, rowDataArray) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) sheet = ss.insertSheet(sheetName);
  
  if (sheet.getLastRow() === 0) {
    if (sheetName === "HocSinh") sheet.appendRow(["ID", "Name", "Class", "DOB", "EnrollDate", "Phone", "Eval", "Status"]);
    if (sheetName === "DiemDanh") sheet.appendRow(["IDKey", "date", "className", "absents", "lates", "unexcusedAbsents"]);
    if (sheetName === "CaiDatLop") sheet.appendRow(["ClassName", "Fee"]);
  }
  
  var lastRow = sheet.getLastRow();
  var isUpdated = false;
  
  if (lastRow > 1) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
       if (String(data[i][0]) === String(idValue)) {
          data[i] = rowDataArray;
          isUpdated = true; 
          break;
       }
    }
    if (isUpdated) {
        sheet.getRange(1, 1, data.length, data[0].length).setValues(data);
    }
  }
  
  if (!isUpdated) sheet.appendRow(rowDataArray);
  
  CacheService.getScriptCache().remove(CACHE_KEY);
  return { success: true };
}

// Hàm Xóa Vĩnh Viễn Học sinh
function processDeleteStudent(id) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('HocSinh');
  var archiveSheet = ss.getSheetByName('HocSinh_Archive');

  if (sheet) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] == id) {
        sheet.deleteRow(i + 1);
        break;
      }
    }
  }
  if (archiveSheet) {
    var dataArc = archiveSheet.getDataRange().getValues();
    for (var j = 1; j < dataArc.length; j++) {
      if (dataArc[j][0] == id) {
        archiveSheet.deleteRow(j + 1);
        break;
      }
    }
  }
  CacheService.getScriptCache().remove('sunny_cache_data_v2');
  return { status: 'success', message: 'Đã xóa học sinh ' + id };
}
