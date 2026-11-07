// varys 回饋與同步程式
// 貼進 Google 試算表「varys 回饋」的「擴充功能 → Apps Script」，部署成網頁應用程式（執行身分：我；存取權：所有人）。
// 第一次被呼叫時記住裝置送來的同步代碼（由通關密語算出，不是通關密語本身），之後只接受同一個代碼。
// 「回饋」工作表：星評、留言、劃線。「同步」工作表：已讀、收藏、星評、字級等狀態（一列）。

const FB_SHEET = '回饋';
const FB_HEADERS = ['時間', '類型', '期別', '文章ID', '文章標題', '星等', '內容', '送出ID'];
const SYNC_SHEET = '同步';

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); if (headers) { sh.appendRow(headers); sh.setFrozenRows(1); } }
  return sh;
}
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function clip_(v, n) { return String(v == null ? '' : v).slice(0, n); }

function authorised_(token) {
  if (!token || String(token).length < 32) return false;
  const p = PropertiesService.getScriptProperties();
  const known = p.getProperty('TOKEN');
  if (!known) { p.setProperty('TOKEN', token); return true; }
  return known === token;
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const d = JSON.parse(e.postData.contents || '{}');
    if (!authorised_(d.token)) return out_({ ok: false, error: 'token' });

    if (d.action === 'pull') {
      const sh = sheet_(SYNC_SHEET);
      const v = sh.getRange(1, 1).getValue();
      return out_({ ok: true, state: v ? JSON.parse(v) : null });
    }
    if (d.action === 'push') {
      const sh = sheet_(SYNC_SHEET);
      sh.getRange(1, 1).setValue(JSON.stringify(d.state || {}));
      sh.getRange(1, 2).setValue(new Date());
      return out_({ ok: true });
    }
    if (d.action === 'fb') {
      const sh = sheet_(FB_SHEET, FB_HEADERS);
      const recs = Array.isArray(d.recs) ? d.recs : [];
      const last = sh.getLastRow();
      const seen = last > 1 ? sh.getRange(Math.max(2, last - 299), 8, Math.min(300, last - 1), 1).getValues().flat() : [];
      recs.forEach(r => {
        const sid = clip_(r.sid, 40);
        if (seen.indexOf(sid) >= 0) return;
        const stars = Number(r.stars);
        sh.appendRow([new Date(), clip_(r.type, 20), clip_(r.edition, 20), clip_(r.itemId, 60), clip_(r.title, 160),
          stars >= 1 && stars <= 5 ? stars : '', clip_(r.text, 2000), sid]);
        seen.push(sid);
      });
      return out_({ ok: true, n: recs.length });
    }
    return out_({ ok: false, error: 'action' });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return out_({ ok: true, app: 'varys' }); }
