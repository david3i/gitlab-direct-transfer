const $ = id => document.getElementById(id);

function cfg() {
  return {
    src: { url: $('src-url').value.trim(), group: $('src-group').value.trim(),
           username: $('src-user').value.trim(), token: $('src-pat').value.trim() },
    tgt: { url: $('tgt-url').value.trim(), group: $('tgt-group').value.trim(),
           username: $('tgt-user').value.trim(), token: $('tgt-pat').value.trim() },
    options: { skip_existing: $('opt-skip').checked, mirror_tags: $('opt-tags').checked,
                copy_settings: $('opt-settings').checked, dry_run: $('opt-dry').checked }
  };
}

function validate() {
  const c = cfg();
  for (const [side, obj] of [['來源', c.src], ['目標', c.tgt]]) {
    for (const f of ['url','group','username','token']) {
      if (!obj[f]) { alert(`${side}：請填寫 ${f}`); return false; }
    }
  }
  return true;
}

let es = null;
const projRows = {};

function appendLog(level, text) {
  const div = $('log');
  const cls = { OK:'log-ok', WARN:'log-warn', ERROR:'log-err', INFO:'log-info' }[level] || '';
  const ts = new Date().toLocaleTimeString('zh-TW', {hour12:false});
  div.insertAdjacentHTML('beforeend', `<span class="${cls}">[${ts}] ${text}\n</span>`);
  div.scrollTop = div.scrollHeight;
}

function updateProjRow(name, status, detail) {
  const icons = { running:'▶', done:'✔', error:'✘', skip:'⊘' };
  const cls   = { running:'icon-run', done:'icon-done', error:'icon-err', skip:'icon-skip' };
  const list = $('proj-list');

  if (!projRows[name]) {
    const row = document.createElement('div');
    row.className = 'proj-row';
    row.innerHTML = `<span class="icon ${cls[status]||''}">${icons[status]||'○'}</span>
                     <span class="name">${name}</span>
                     <span class="detail">${detail}</span>`;
    list.appendChild(row);
    projRows[name] = row;
    list.scrollTop = list.scrollHeight;
  } else {
    const row = projRows[name];
    row.querySelector('.icon').textContent = icons[status]||'○';
    row.querySelector('.icon').className = `icon ${cls[status]||''}`;
    row.querySelector('.detail').textContent = detail;
  }
}

function setBusy(busy, validateOnly=false) {
  $('btn-validate').disabled = busy;
  $('btn-start').disabled    = busy;
  $('btn-compare').disabled  = busy;
  $('btn-export') && ($('btn-export').disabled = busy);
  $('btn-import') && ($('btn-import').disabled = busy);
  $('btn-stop').style.display = (busy && !validateOnly) ? 'inline-block' : 'none';
  if (!busy) $('status-text').textContent = '就緒 Ready';
}

function _handle_msg(msg) {
  if (msg.type === 'log') {
    appendLog(msg.level, msg.text);
  } else if (msg.type === 'overall') {
    $('overall-label').textContent = `整體：${msg.done} / ${msg.total}`;
    $('overall-bar').max   = msg.total || 1;
    $('overall-bar').value = msg.done;
  } else if (msg.type === 'step') {
    $('step-label').textContent = `步驟 ${msg.step}/${msg.total}：${msg.desc}`;
    $('step-bar').value = msg.step;
  } else if (msg.type === 'project') {
    updateProjRow(msg.name, msg.status, msg.detail);
  } else if (msg.type === 'done') {
    setBusy(false);
    es.close(); es = null;
    const errs = msg.errors || [];
    if (errs.length) {
      $('status-text').textContent = `完成（${errs.length} 錯誤）`;
      alert(`轉移完成，但有 ${errs.length} 個專案失敗：\n\n${errs.slice(0,10).join('\n')}`);
    } else {
      $('status-text').textContent = '全部完成！';
      if (!_singleTransfer) alert('所有專案已成功轉移！');
    }
  } else if (msg.type === 'validate_done') {
    setBusy(false);
  }
}

let _singleTransfer = false;
function startSSE() {
  if (es) es.close();
  _singleTransfer = false;
  es = new EventSource('/stream');
  es.onmessage = e => _handle_msg(JSON.parse(e.data));
  es.onerror = () => { setBusy(false); };
}

function saveConfig() {
  const c = cfg();
  const payload = {
    src_username: c.src.username, src_pat: c.src.token,
    tgt_url: c.tgt.url, tgt_group: c.tgt.group,
    tgt_username: c.tgt.username, tgt_pat: c.tgt.token,
    exp_out_dir: $('exp-out-dir').value.trim(),
  };
  fetch('/api/config', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
}

window.addEventListener('load', async () => {
  try {
    const res = await fetch('/api/config');
    const d = await res.json();
    if (d.src_username) $('src-user').value = d.src_username;
    if (d.src_pat)      $('src-pat').value  = d.src_pat;
    if (d.tgt_url)      $('tgt-url').value  = d.tgt_url;
    if (d.tgt_group)    $('tgt-group').value = d.tgt_group;
    if (d.tgt_username) $('tgt-user').value = d.tgt_username;
    if (d.tgt_pat)      $('tgt-pat').value  = d.tgt_pat;
    if (d.exp_out_dir)  $('exp-out-dir').value = d.exp_out_dir;
    // Default imp-namespace to tgt group
    if (d.tgt_group)    $('imp-namespace').value = d.tgt_group;
  } catch(e) {}
});

async function doValidate() {
  if (!validate()) return;
  saveConfig();
  setBusy(true, true);
  $('status-text').textContent = '驗證中…';
  startSSE();
  await fetch('/validate', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg()) });
}

async function doStart() {
  if (!validate()) return;
  saveConfig();
  projRows && Object.keys(projRows).forEach(k => delete projRows[k]);
  $('proj-list').innerHTML = '';
  $('log').innerHTML = '';
  setBusy(true);
  $('status-text').textContent = '轉移中…';
  startSSE();
  await fetch('/start', { method:'POST',
    headers:{'Content-Type':'application/json'}, body: JSON.stringify(cfg()) });
}

async function doStop() {
  $('btn-stop').disabled = true;
  $('status-text').textContent = '正在停止…';
  await fetch('/stop', { method:'POST' });
}

function toggleIE() {
  const body = $('ie-body'), arrow = $('ie-arrow');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  arrow.textContent  = open ? '▸' : '▾';
}

async function doExport() {
  const outDir = $('exp-out-dir').value.trim();
  if (!outDir) { alert('請填寫儲存目錄'); return; }
  const c = cfg();
  if (!c.src.url || !c.src.group || !c.src.token) { alert('請填寫來源連線設定'); return; }
  saveConfig();
  $('log').innerHTML = '';
  projRows && Object.keys(projRows).forEach(k => delete projRows[k]);
  $('proj-list').innerHTML = '';
  setBusy(true);
  $('status-text').textContent = '匯出中…';
  startSSE();
  await fetch('/export_project', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      src: c.src,
      src_path: $('exp-src-path').value.trim(),
      out_dir:  outDir,
    })
  });
}

async function browseImpPath(mode) {
  const btn = event.currentTarget;
  const orig = btn.textContent;
  btn.textContent = '…'; btn.disabled = true;
  try {
    const r = await fetch(`/browse?mode=${mode}`);
    const d = await r.json();
    if (d.path) $('imp-path').value = d.path;
  } catch(e) {
    alert('開啟檔案對話框失敗：' + e);
  } finally {
    btn.textContent = orig; btn.disabled = false;
  }
}

async function doImport() {
  const filePath = $('imp-path').value.trim();
  const namespace = $('imp-namespace').value.trim();
  if (!filePath)  { alert('請填寫檔案或目錄路徑'); return; }
  if (!namespace) { alert('請填寫目標 Namespace'); return; }
  const c = cfg();
  if (!c.tgt.url || !c.tgt.token) { alert('請填寫目標連線設定'); return; }
  saveConfig();
  $('log').innerHTML = '';
  projRows && Object.keys(projRows).forEach(k => delete projRows[k]);
  $('proj-list').innerHTML = '';
  setBusy(true);
  $('status-text').textContent = '匯入中…';
  startSSE();
  await fetch('/import_project', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      tgt: c.tgt,
      namespace: namespace,
      file_path: filePath,
    })
  });
}

// ── Compare ──────────────────────────────────────────────────────────
let _cmpData = [];   // cached compare results

async function doCompare() {
  if (!validate()) return;
  saveConfig();
  setBusy(true, true);
  $('status-text').textContent = '比對中…';
  $('cmp-card').style.display = 'none';

  try {
    const res = await fetch('/compare', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({...cfg(), deep: $('opt-deep').checked})
    });
    if (!res.ok) { const t = await res.text(); throw new Error(t); }
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    _cmpData = data.projects;
    renderCompare(data);
  } catch(e) {
    appendLog('ERROR', '比對失敗：' + e.message);
  } finally {
    setBusy(false);
    $('status-text').textContent = '就緒 Ready';
  }
}

const _STATUS_MAP = {
  missing:        { cls:'cmp-missing',    icon:'✘', label:'目標缺少',   color:'#ef4444', btn:'transfer' },
  empty:          { cls:'cmp-missing',    icon:'⚠', label:'內容未推送', color:'#f59e0b', btn:'transfer' },
  incomplete:     { cls:'cmp-incomplete', icon:'⚠', label:'分支不完整', color:'#f59e0b', btn:'transfer' },
  archive_needed: { cls:'cmp-archive',   icon:'⚠', label:'待封存',     color:'#8b5cf6', btn:'archive'  },
  ok:             { cls:'cmp-ok',        icon:'✔', label:'已同步',     color:'#10b981', btn:false      },
};

function renderCompare(data) {
  const need = data.projects.filter(p => p.status !== 'ok').length;
  const empty = data.projects.filter(p => p.status === 'empty').length;
  const incomplete = data.projects.filter(p => p.status === 'incomplete').length;
  let summary = `來源 ${data.src_total} 個，目標 ${data.tgt_total} 個，需補傳 ${need} 個`;
  if (empty > 0) summary += `，${empty} 個內容未推送`;
  if (incomplete > 0) summary += `，${incomplete} 個分支不完整`;
  summary += `，已同步 ${data.src_total - need} 個`;
  $('cmp-summary').textContent = summary;

  let html = '<table><tr><th>專案</th><th>目標狀態</th><th>操作</th></tr>';
  for (const p of data.projects) {
    const s = _STATUS_MAP[p.status] || _STATUS_MAP.ok;
    const id = p.src_path.replace(/\//g,'__');
    const archiveBadge = p.src_archived ? ' <span style="color:#8b5cf6;font-size:.72rem">[封存]</span>' : '';
    const statusHtml = `<span style="color:${s.color}">${s.icon} ${s.label}</span>`;
    let btnHtml = '';
    if (s.btn === 'transfer') {
      btnHtml = `<button class="btn-transfer" id="cbt_${id}"
           onclick="doTransferOne('${p.src_path}', this)">轉移</button>`;
    } else if (s.btn === 'archive') {
      btnHtml = `<button class="btn-archive" id="cbt_${id}"
           onclick="doArchiveOne('${p.tgt_path}', this, '${id}')">封存</button>`;
    }
    html += `<tr class="${s.cls}" id="crow_${id}">
      <td style="font-family:monospace">${p.rel_path}${archiveBadge}</td>
      <td id="cst_${id}">${statusHtml}</td>
      <td>${btnHtml}</td></tr>`;
  }
  html += '</table>';

  $('cmp-table').innerHTML = html;
  $('cmp-card').style.display = 'block';
  $('cmp-card').scrollIntoView({behavior:'smooth', block:'start'});
}

function cmpId(srcPath) { return srcPath.replace(/\//g, '__'); }

async function doTransferOne(srcPath, btnEl) {
  if (!validate()) return;
  saveConfig();

  // Disable all transfer buttons during transfer
  document.querySelectorAll('.btn-transfer').forEach(b => b.disabled = true);
  const stEl = $('cst_' + cmpId(srcPath));
  if (stEl) stEl.innerHTML = '<span style="color:#3b82f6">▶ 轉移中…</span>';

  $('log').innerHTML = '';
  projRows && Object.keys(projRows).forEach(k => delete projRows[k]);
  $('proj-list').innerHTML = '';
  $('btn-stop').style.display = 'inline-block';
  $('status-text').textContent = '轉移中…';

  // Listen for completion to update the compare row
  _singleTransfer = true;
  if (es) es.close();
  es = new EventSource('/stream');
  es.onmessage = e => _handle_msg_compare(JSON.parse(e.data), srcPath);
  es.onerror = () => {
    setBusy(false);
    document.querySelectorAll('.btn-transfer').forEach(b => b.disabled = false);
  };

  // Force skip_existing off so existing-but-empty projects are re-transferred
  const overrideOpts = {...cfg().options, skip_existing: false};
  await fetch('/transfer_one', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...cfg(), project_src_path: srcPath, options: overrideOpts})
  });
}

async function doArchiveOne(tgtPath, btnEl, rowId) {
  btnEl.disabled = true;
  btnEl.textContent = '封存中…';
  const stEl  = $('cst_' + rowId);
  const rowEl = $('crow_' + rowId);
  try {
    const r = await fetch('/archive_one', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({tgt: cfg().tgt, tgt_path: tgtPath})
    });
    const d = await r.json();
    if (!r.ok || d.error) throw new Error(d.error || r.statusText);
    if (rowEl) rowEl.className = 'cmp-done';
    if (stEl)  stEl.innerHTML = '<span style="color:#10b981">✔ 已封存</span>';
    btnEl.style.display = 'none';
  } catch(e) {
    btnEl.textContent = '封存';
    btnEl.disabled = false;
    if (stEl) stEl.innerHTML = `<span style="color:#ef4444">✘ 失敗：${e.message}</span>`;
  }
}

function _handle_msg_compare(msg, srcPath) {
  _handle_msg(msg);

  // Additionally update compare row on completion
  if (msg.type === 'done') {
    const id = cmpId(srcPath);
    const rowEl = $('crow_' + id);
    const stEl  = $('cst_'  + id);
    const btnEl2 = $('cbt_' + id);

    if (msg.errors && msg.errors.length > 0) {
      if (rowEl) rowEl.className = 'cmp-err';
      if (stEl)  stEl.innerHTML = '<span style="color:#ef4444">✘ 失敗</span>';
      if (btnEl2) { btnEl2.textContent = '重試'; btnEl2.disabled = false; }
    } else {
      if (rowEl) rowEl.className = 'cmp-done';
      if (stEl)  stEl.innerHTML = '<span style="color:#10b981">✔ 已轉移</span>';
      if (btnEl2) btnEl2.remove();
    }
    // Re-enable remaining transfer buttons
    document.querySelectorAll('.btn-transfer').forEach(b => b.disabled = false);
  }
}

async function doClear() {
  const c = cfg();
  if (!c.tgt.url || !c.tgt.group || !c.tgt.username || !c.tgt.token) {
    alert('請先填寫目標的 URL、Group、Username 和 PAT');
    return;
  }
  const confirmed = confirm(
    '⚠️ 警告：此操作將永久刪除目標 Group 下的所有專案！\n\n' +
    '目標：' + c.tgt.url + ' / ' + c.tgt.group + '\n\n' +
    '確定要繼續嗎？'
  );
  if (!confirmed) return;
  const reconfirmed = confirm('再次確認：真的要刪除所有專案？此操作無法復原！');
  if (!reconfirmed) return;

  saveConfig();
  $('log').innerHTML = '';
  projRows && Object.keys(projRows).forEach(k => delete projRows[k]);
  $('proj-list').innerHTML = '';
  setBusy(true);
  $('status-text').textContent = '清除中…';
  startSSE();
  await fetch('/clear', { method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ tgt: c.tgt }) });
}
