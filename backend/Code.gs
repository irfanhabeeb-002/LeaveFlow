/**
 * LeaveFlow – Google Apps Script Backend  (v2 – date-safe)
 * =========================================================
 * SETUP INSTRUCTIONS:
 * 1. Open script.google.com → New project → paste this file
 * 2. Set SPREADSHEET_ID below
 * 3. Run setupSheets() once
 * 4. Run createMonthlyResetTrigger() once
 * 5. Deploy → New deployment → Web app
 *    Execute as: Me | Who has access: Anyone
 * 6. Copy Web App URL → paste into index.html and admin.html
 */

// ── CONFIGURATION ─────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: '1A0kgDQX1B_IM6DyHLZLAHKb5alUQEboWpH4nsuyIqmM', 
  SHEETS: {
    EMPLOYEES:     'Employees',
    LEAVE_RECORDS: 'LeaveRecords',
    ATTENDANCE:    'Attendance'
  },
  MONTHLY_LEAVES: 4,
  TIMEZONE: 'Asia/Kolkata'  // change to match your timezone
};

// ════════════════════════════════════════════════════════════════
//  DATE HELPER — always returns YYYY-MM-DD regardless of how the
//  cell is stored (Date object vs string vs number).
// ════════════════════════════════════════════════════════════════
function readDate(cell) {
  if (!cell && cell !== 0) return '';
  
  // Robust check for Date objects in Google Apps Script execution context
  if (cell instanceof Date || 
      Object.prototype.toString.call(cell) === '[object Date]' || 
      (typeof cell === 'object' && typeof cell.getTime === 'function')) {
    return Utilities.formatDate(cell, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  
  // Serial number (rare but possible)
  if (typeof cell === 'number') {
    return Utilities.formatDate(new Date((cell - 25569) * 86400 * 1000), CONFIG.TIMEZONE, 'yyyy-MM-dd');
  }
  
  const str = String(cell).trim();
  
  // If it's a stringified date like "Mon Jun 08 2026 00:00:00 GMT+0530", parse it and format it
  if (isNaN(str) && !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    try {
      const parsedDate = new Date(str);
      if (!isNaN(parsedDate.getTime())) {
        return Utilities.formatDate(parsedDate, CONFIG.TIMEZONE, 'yyyy-MM-dd');
      }
    } catch (e) {
      // Ignore parsing errors, fall back to returning the raw string
    }
  }
  
  return str;
}

function todayISO() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function currentMonthStr() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM');
}

function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.getDay() === 0 || d.getDay() === 6;
}

function getMonthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${monthStr}-01`,
    end:   `${monthStr}-${String(lastDay).padStart(2,'0')}`
  };
}

function countWorkingDays(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const todayStr = todayISO();
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  
  let endDay;
  if (y < tY || (y === tY && m < tM)) {
    // Past month: count the whole month
    endDay = new Date(y, m, 0).getDate();
  } else if (y === tY && m === tM) {
    // Current month: count up to today
    endDay = tD;
  } else {
    // Future month: 0 working days so far
    return 0;
  }
  
  let count = 0;
  for (let d = 1; d <= endDay; d++) {
    const wd = new Date(y, m-1, d).getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

// ── ENTRY POINT ────────────────────────────────────────────────
function doGet(e) {
  const p = e.parameter || {};
  let result;
  try {
    switch (p.action) {
      case 'registerEmployee':    result = registerEmployee(p.name);                         break;
      case 'getEmployeeData':     result = getEmployeeData(p.name);                          break;
      case 'submitLeave':         result = submitLeave(p.name, p.date);                      break;
      case 'getDashboardData':    result = getDashboardData(p.month);                        break;
      case 'getAllEmployees':      result = getAllEmployees();                                 break;
      case 'getLeaveHistory':     result = getLeaveHistory(p.month, p.employeeName || '');   break;
      case 'getAttendanceSummary':result = getAttendanceSummary(p.month);                    break;
      case 'setup':               setupSheets(); result = { success: true };                 break;
      default:                    result = { error: 'Unknown action: ' + p.action };
    }
  } catch (err) {
    Logger.log('Error: ' + err.message + '\n' + err.stack);
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── HELPERS ────────────────────────────────────────────────────
function getSpreadsheet() {
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found. Run setupSheets() first.`);
  return sheet;
}

function findEmployeeRow(sheet, name) {
  const data = sheet.getDataRange().getValues();
  const norm = name.trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === norm) {
      return { row: i + 1, data: data[i] };
    }
  }
  return null;
}

// ── SETUP ──────────────────────────────────────────────────────
function setupSheets() {
  const ss = getSpreadsheet();

  function ensureSheet(name, headers) {
    let s = ss.getSheetByName(name);
    if (!s) {
      s = ss.insertSheet(name);
      s.getRange(1, 1, 1, headers.length).setValues([headers])
        .setBackground('#6366f1').setFontColor('#fff').setFontWeight('bold');
      s.setFrozenRows(1);
    }
    return s;
  }

  ensureSheet(CONFIG.SHEETS.EMPLOYEES,     ['Name','LeavesRemaining','LeavesUsed','Status']);
  ensureSheet(CONFIG.SHEETS.LEAVE_RECORDS, ['Date','EmployeeName','LeaveType']);
  ensureSheet(CONFIG.SHEETS.ATTENDANCE,    ['Date','EmployeeName','AttendanceStatus']);

  // Format date columns so they store as plain text (avoids auto-conversion)
  const lr = ss.getSheetByName(CONFIG.SHEETS.LEAVE_RECORDS);
  lr.getRange('A:A').setNumberFormat('@STRING@');
  const att = ss.getSheetByName(CONFIG.SHEETS.ATTENDANCE);
  att.getRange('A:A').setNumberFormat('@STRING@');

  Logger.log('Setup complete.');
}

// ── REGISTER EMPLOYEE ──────────────────────────────────────────
function registerEmployee(name) {
  if (!name || name.trim().length < 2) throw new Error('Invalid name');
  name = name.trim();
  const sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const existing = findEmployeeRow(sheet, name);
  if (existing) {
    return {
      success: true,
      employee: {
        name,
        leavesRemaining: Number(existing.data[1]),
        leavesUsed:      Number(existing.data[2]),
        status:          String(existing.data[3])
      }
    };
  }
  sheet.appendRow([name, CONFIG.MONTHLY_LEAVES, 0, 'Present']);
  return { success: true, employee: { name, leavesRemaining: CONFIG.MONTHLY_LEAVES, leavesUsed: 0, status: 'Present' } };
}

// ── GET EMPLOYEE DATA ──────────────────────────────────────────
function getEmployeeData(name) {
  if (!name) throw new Error('Name required');
  name = name.trim();

  const empSheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  let empRow = findEmployeeRow(empSheet, name);
  if (!empRow) {
    throw new Error('Employee not found in organization directory');
  }

  // Get leave history for current month from LeaveRecords sheet
  const month = currentMonthStr();
  const { start, end } = getMonthRange(month);
  const lrSheet = getSheet(CONFIG.SHEETS.LEAVE_RECORDS);
  const lrData  = lrSheet.getDataRange().getValues();

  const seen = new Set();          // deduplicate by date
  const leaveHistory = [];
  for (let i = 1; i < lrData.length; i++) {
    const date    = readDate(lrData[i][0]);   // safe date read
    const empName = String(lrData[i][1]).trim();
    if (!date || empName.toLowerCase() !== name.toLowerCase()) continue;
    if (date < start || date > end) continue;
    if (seen.has(date)) continue;  // skip duplicates
    seen.add(date);
    leaveHistory.push({ date, type: String(lrData[i][2] || 'Leave') });
  }

  // Calculate used/remaining dynamically
  const leavesUsed = leaveHistory.length;
  const leavesRemaining = Math.max(0, CONFIG.MONTHLY_LEAVES - leavesUsed);

  const today = todayISO();
  const isOnLeaveToday = leaveHistory.some(l => l.date === today);
  const status = isOnLeaveToday ? 'On Leave' : 'Present';

  // Write back to sheet to keep display correct
  empSheet.getRange(empRow.row, 2).setValue(leavesRemaining);
  empSheet.getRange(empRow.row, 3).setValue(leavesUsed);
  empSheet.getRange(empRow.row, 4).setValue(status);

  return {
    employee: {
      name,
      leavesRemaining,
      leavesUsed,
      status
    },
    leaveHistory
  };
}

// ── SUBMIT LEAVE ───────────────────────────────────────────────
function submitLeave(name, date) {
  if (!name || !date) throw new Error('Name and date required');
  name = name.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must be YYYY-MM-DD');
  if (isWeekend(date)) return { success: true, message: 'Weekend — no leave consumed', weekend: true };

  const empSheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const lrSheet  = getSheet(CONFIG.SHEETS.LEAVE_RECORDS);
  const attSheet = getSheet(CONFIG.SHEETS.ATTENDANCE);

  let empRow = findEmployeeRow(empSheet, name);
  if (!empRow) throw new Error('Employee not found in organization directory');

  // Duplicate check using readDate() so format matches
  const lrData = lrSheet.getDataRange().getValues();
  for (let i = 1; i < lrData.length; i++) {
    const rowDate = readDate(lrData[i][0]);   // safe date read
    const rowEmp  = String(lrData[i][1]).trim().toLowerCase();
    if (rowEmp === name.toLowerCase() && rowDate === date) {
      const freshData = getEmployeeData(name);
      return {
        success: true, duplicate: true,
        message: 'Leave already recorded for this date',
        leavesUsed:      freshData.employee.leavesUsed,
        leavesRemaining: freshData.employee.leavesRemaining
      };
    }
  }

  // Write as plain string to prevent Google Sheets date conversion
  lrSheet.appendRow([date, name, 'Leave']);
  updateAttendanceRecord(attSheet, date, name, 'On Leave');

  // Recalculate and sync dynamically using getEmployeeData
  const freshData = getEmployeeData(name);

  return { 
    success: true, 
    leavesUsed: freshData.employee.leavesUsed, 
    leavesRemaining: freshData.employee.leavesRemaining, 
    date, 
    employeeName: name 
  };
}

function updateAttendanceRecord(attSheet, date, name, status) {
  const data = attSheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const d = readDate(data[i][0]);
    const n = String(data[i][1]).trim().toLowerCase();
    if (d === date && n === name.toLowerCase()) {
      attSheet.getRange(i + 1, 3).setValue(status);
      return;
    }
  }
  attSheet.appendRow([date, name, status]);
}

// ── MONTHLY BALANCE RESET ──────────────────────────────────────
function checkAndResetMonthlyBalance(empSheet, rowNum, empData, name) {
  const month   = currentMonthStr();
  const propKey = 'reset_' + name;
  const lastReset = PropertiesService.getScriptProperties().getProperty(propKey);
  if (lastReset !== month) {
    empSheet.getRange(rowNum, 2).setValue(CONFIG.MONTHLY_LEAVES);
    empSheet.getRange(rowNum, 3).setValue(0);
    empSheet.getRange(rowNum, 4).setValue('Present');
    PropertiesService.getScriptProperties().setProperty(propKey, month);
  }
}

function resetAllBalances() {
  const sheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const data  = sheet.getDataRange().getValues();
  const month = currentMonthStr();
  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][0]).trim();
    if (!name) continue;
    sheet.getRange(i + 1, 2).setValue(CONFIG.MONTHLY_LEAVES);
    sheet.getRange(i + 1, 3).setValue(0);
    sheet.getRange(i + 1, 4).setValue('Present');
    PropertiesService.getScriptProperties().setProperty('reset_' + name, month);
  }
  Logger.log('Monthly reset done for ' + (data.length - 1) + ' employees.');
}

function createMonthlyResetTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'resetAllBalances')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('resetAllBalances').timeBased().onMonthDay(1).atHour(0).create();
  Logger.log('Monthly reset trigger created.');
}

// ── GET ALL EMPLOYEES ──────────────────────────────────────────
function getAllEmployees() {
  const empSheet = getSheet(CONFIG.SHEETS.EMPLOYEES);
  const empData  = empSheet.getDataRange().getValues();
  
  const lrSheet = getSheet(CONFIG.SHEETS.LEAVE_RECORDS);
  const lrData  = lrSheet.getDataRange().getValues();

  const month = currentMonthStr();
  const { start, end } = getMonthRange(month);
  const today = todayISO();

  // Map employee name -> set of leave dates for current month
  const empLeavesMap = {};
  // Map employee name -> whether on leave today
  const onLeaveTodayMap = {};

  for (let i = 1; i < lrData.length; i++) {
    const date = readDate(lrData[i][0]);
    const empName = String(lrData[i][1]).trim().toLowerCase();
    if (!date || !empName) continue;
    
    if (date >= start && date <= end) {
      if (!empLeavesMap[empName]) empLeavesMap[empName] = new Set();
      empLeavesMap[empName].add(date);
    }
    
    if (date === today) {
      onLeaveTodayMap[empName] = true;
    }
  }

  const employees = [];
  for (let i = 1; i < empData.length; i++) {
    const name = String(empData[i][0]).trim();
    if (!name) continue;
    
    const empNameKey = name.toLowerCase();
    const leavesUsed = empLeavesMap[empNameKey] ? empLeavesMap[empNameKey].size : 0;
    const leavesRemaining = Math.max(0, CONFIG.MONTHLY_LEAVES - leavesUsed);
    const onLeave = Boolean(onLeaveTodayMap[empNameKey]);
    const status = onLeave ? 'On Leave' : 'Present';

    // Write back to sheet if values differ to keep spreadsheet display updated
    if (Number(empData[i][1]) !== leavesRemaining || Number(empData[i][2]) !== leavesUsed || String(empData[i][3]) !== status) {
      empSheet.getRange(i + 1, 2).setValue(leavesRemaining);
      empSheet.getRange(i + 1, 3).setValue(leavesUsed);
      empSheet.getRange(i + 1, 4).setValue(status);
    }

    employees.push({
      name,
      leavesRemaining,
      leavesUsed,
      status
    });
  }
  return { employees };
}

// ── GET LEAVE HISTORY ──────────────────────────────────────────
function getLeaveHistory(month, employeeName) {
  if (!month) month = currentMonthStr();
  const { start, end } = getMonthRange(month);

  const sheet = getSheet(CONFIG.SHEETS.LEAVE_RECORDS);
  const data  = sheet.getDataRange().getValues();
  const seen  = new Set();
  const leaves = [];

  for (let i = 1; i < data.length; i++) {
    const date    = readDate(data[i][0]);          // ← safe date read
    const empName = String(data[i][1]).trim();
    const type    = String(data[i][2] || 'Leave');

    if (!date || !empName) continue;
    if (date < start || date > end) continue;
    if (employeeName && empName.toLowerCase() !== employeeName.toLowerCase()) continue;

    const key = `${empName.toLowerCase()}|${date}`;
    if (seen.has(key)) continue;                   // deduplicate
    seen.add(key);

    leaves.push({ date, employeeName: empName, leaveType: type });
  }

  leaves.sort((a, b) => b.date.localeCompare(a.date));
  return { leaves };
}

// ── GET ATTENDANCE SUMMARY ─────────────────────────────────────
function getAttendanceSummary(month) {
  if (!month) month = currentMonthStr();
  const empData  = getAllEmployees().employees;
  const leaves   = getLeaveHistory(month, '').leaves;
  const workDays = countWorkingDays(month);

  const attendance = empData.map(emp => {
    const empLeaves   = leaves.filter(l => l.employeeName.toLowerCase() === emp.name.toLowerCase());
    const leaveDays   = empLeaves.length;
    const presentDays = Math.max(0, workDays - leaveDays);
    const pct         = workDays > 0 ? Math.round((presentDays / workDays) * 100) : 100;
    return { employeeName: emp.name, workingDays: workDays, presentDays, leaveDays, attendancePct: pct };
  });

  return { attendance };
}

// ── GET DASHBOARD DATA ─────────────────────────────────────────
function getDashboardData(month) {
  if (!month) month = currentMonthStr();

  const empData  = getAllEmployees().employees;
  const leavesData = getLeaveHistory(month, '');
  const attData  = getAttendanceSummary(month);

  const today    = todayISO();
  const todayLeaves = leavesData.leaves.filter(l => l.date === today);
  const onLeaveToday = todayLeaves.length;

  const overQuota = empData.filter(e => Number(e.leavesUsed) > CONFIG.MONTHLY_LEAVES);

  return {
    employees:    empData,
    leaves:       leavesData.leaves,
    attendance:   attData.attendance,
    onLeaveToday,
    overQuota,
    month
  };
}
