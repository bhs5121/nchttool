/* NDS Cheat CRC — MIT License. See LICENSE. */
(() => {
  'use strict';
  const C = globalThis.CheatCRC, $ = id => document.getElementById(id);
  const state = { rom: null, romFile: null, db: null, cheatFile: null, selected: null,
    reading: { rom: false, cheat: false }, errors: { rom: '', cheat: '' }, busy: false, revision: 0,
    token: { rom: 0, cheat: 0 }, result: null, url: null, actionError: '' };
  const size = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  function clearResult() {
    if (state.url) URL.revokeObjectURL(state.url);
    state.url = null; state.result = null; state.actionError = ''; $('result').hidden = true;
  }
  function chooseDefault() {
    state.selected = state.rom && state.db ? C.chooseEntry(state.db, state.rom) : null;
    $('game-search').value = '';
    populateGames();
  }
  function populateGames() {
    const select = $('target-game'); select.replaceChildren();
    if (!state.db) return;
    const placeholder = new Option('변환할 게임을 선택하세요', '');
    select.append(placeholder);
    const query = $('game-search').value.trim().toLocaleLowerCase();
    const list = state.db.entries.filter(e => !query || `${e.name} ${e.id}`.toLocaleLowerCase().includes(query));
    list.sort((a, b) => {
      const rank = e => e.id === state.rom?.id ? 0 : e.code === state.rom?.code ? 1 : 2;
      return rank(a) - rank(b) || a.index - b.index;
    });
    const visible = list.slice(0, 200);
    const selected = state.db.entries[state.selected];
    if (selected && !visible.some(e => e.index === selected.index)) visible.unshift(selected);
    for (const entry of visible) select.append(new Option(`${entry.name} · ${entry.id}`, String(entry.index)));
    select.value = state.selected === null ? '' : String(state.selected);
    $('game-search').hidden = state.db.entries.length <= 20;
  }
  function render() {
    for (const key of ['rom', 'cheat']) {
      const file = state[`${key}File`], loaded = key === 'rom' ? state.rom : state.db;
      $(`${key}-name`).textContent = file?.name ?? (key === 'rom' ? 'NDS 롬 선택' : 'DAT · XML 치트 선택');
      $(`${key}-help`).textContent = state.reading[key] ? '파일을 읽고 있습니다…' : file ? `${size(file.size)} · 클릭해서 다른 파일 선택` : '파일을 끌어놓거나 클릭하세요';
      $(`${key}-zone`).classList.toggle('has-file', Boolean(loaded));
      $(`${key}-zone`).classList.toggle('has-error', Boolean(state.errors[key]));
      $(`${key}-error`).textContent = state.errors[key]; $(`${key}-error`).hidden = !state.errors[key];
      $(`${key}-details`).hidden = !loaded;
      $(`${key}-file`).disabled = state.busy;
    }
    if (state.rom) { $('rom-code').textContent = state.rom.code; $('rom-crc').textContent = state.rom.crcHex; }
    if (state.db) { $('cheat-format').textContent = state.db.format.toUpperCase(); $('cheat-count').textContent = `${state.db.entries.length.toLocaleString()}개`; }
    $('target-section').hidden = !state.db || !state.rom;
    const entry = state.db?.entries[state.selected];
    const collision = Boolean(entry && state.db.entries.some(e => e.index !== entry.index && e.id === state.rom?.id));
    const sameCode = Boolean(entry && state.rom && entry.code === state.rom.code);
    const exact = Boolean(entry && state.rom && entry.id === state.rom.id);
    $('selection-badge').textContent = exact ? '이미 일치' : sameCode ? '게임 코드 일치' : entry ? '직접 선택' : '';
    $('id-change').hidden = !entry || !state.rom;
    if (entry && state.rom) { $('before-id').textContent = entry.id; $('after-id').textContent = state.rom.id; }
    $('target-hint').textContent = collision ? '이 식별값의 항목이 이미 있습니다. 목록에서 해당 항목을 선택하세요.' : !entry ? '같은 게임의 항목을 선택하세요. 선택한 항목 하나만 변경됩니다.' : exact ? '선택한 항목이 이미 이 롬과 연결되어 있습니다. 그대로 다운로드할 수 있습니다.' : !sameCode ? '게임 코드가 다른 항목입니다. 이름을 확인해 같은 게임의 치트를 선택하세요.' : '해당 게임의 치트 내용과 나머지 게임 항목은 그대로 유지됩니다.';
    const reading = state.reading.rom || state.reading.cheat;
    const ready = state.rom && state.db && entry && !reading && !state.busy && !collision && !state.errors.rom && !state.errors.cheat;
    $('convert').disabled = !ready;
    $('target-game').disabled = state.busy; $('game-search').disabled = state.busy;
    $('convert-label').textContent = state.busy ? '치트 파일을 변환하고 있습니다…' : exact ? '일치하는 치트 파일 다운로드' : '치트 파일 변환 · 다운로드';
    $('convert').setAttribute('aria-busy', String(state.busy));
    $('status').classList.toggle('error', Boolean(state.errors.rom || state.errors.cheat || collision || state.actionError));
    $('status').textContent = state.actionError || (state.busy ? '선택한 게임의 식별값을 변경하고 있습니다.' : reading ? '파일을 확인하고 있습니다…' : (state.errors.rom || state.errors.cheat) ? '파일 안내를 확인한 뒤 다시 선택하세요.' : collision ? '중복되는 식별값을 확인해주세요.' : ready ? exact ? '이미 식별값이 일치합니다.' : '준비 완료. 버튼을 누르면 자동으로 다운로드됩니다.' : state.rom && state.db ? '변환할 게임 항목을 선택하세요.' : '두 파일을 선택하면 변환할 수 있습니다.');
  }
  async function loadFile(key, file) {
    if (!file || state.busy) return;
    const token = ++state.token[key]; state.revision++; clearResult();
    state[`${key}File`] = file; state.errors[key] = ''; state.reading[key] = true;
    if (key === 'rom') state.rom = null; else state.db = null;
    state.selected = null; populateGames(); render();
    try {
      let parsed;
      if (key === 'rom') {
        if (!/\.nds$/i.test(file.name)) throw new Error('압축을 푼 .nds 롬 파일을 선택하세요.');
        parsed = C.readRom(await file.slice(0, 512).arrayBuffer(), file.size);
      } else {
        if (file.size > C.MAX_CHEAT_SIZE) throw new Error('치트 파일은 최대 64MiB까지 지원합니다.');
        const buffer = await file.arrayBuffer(); await nextFrame(); parsed = C.parseDatabase(buffer, file.name);
      }
      if (token !== state.token[key]) return;
      if (key === 'rom') state.rom = parsed; else state.db = parsed;
      chooseDefault();
    } catch (error) {
      if (token === state.token[key]) state.errors[key] = error.message || '파일을 읽지 못했습니다.';
    } finally {
      if (token === state.token[key]) { state.reading[key] = false; render(); }
    }
  }
  function download() {
    if (!state.url || !state.result) return;
    const link = document.createElement('a'); link.href = state.url; link.download = state.result.filename;
    document.body.append(link); link.click(); link.remove();
  }
  for (const key of ['rom', 'cheat']) {
    $(`${key}-file`).addEventListener('change', event => {
      const file = event.target.files[0]; event.target.value = ''; loadFile(key, file);
    });
    const zone = $(`${key}-zone`);
    for (const event of ['dragenter', 'dragover']) zone.addEventListener(event, e => { e.preventDefault(); if (!state.busy) zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault(); zone.classList.remove('drag-over');
      if (e.dataTransfer.files.length !== 1) { state.errors[key] = '파일을 한 개씩 선택하세요.'; render(); return; }
      loadFile(key, e.dataTransfer.files[0]);
    });
  }
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());
  $('game-search').addEventListener('input', populateGames);
  $('target-game').addEventListener('change', e => { state.revision++; clearResult(); state.selected = e.target.value === '' ? null : Number(e.target.value); render(); });
  $('convert').addEventListener('click', async () => {
    if ($('convert').disabled) return;
    clearResult(); state.busy = true; const revision = state.revision; render();
    try {
      await nextFrame(); if (revision !== state.revision) return;
      const result = C.retarget(state.db, state.selected, state.rom);
      result.filename = C.outputName(state.cheatFile.name, state.rom, result.format);
      state.result = result;
      state.url = URL.createObjectURL(new Blob([result.bytes], { type: result.format === 'xml' ? 'application/xml' : 'application/octet-stream' }));
      $('result-title').textContent = result.changed ? '변환이 완료되었습니다.' : '식별값이 이미 일치합니다.';
      $('result-description').textContent = result.changed ? `${result.before} → ${result.after}` : '원본 내용 그대로 파일을 준비했습니다.';
      $('result-filename').textContent = result.filename; $('result').hidden = false;
      download();
    } catch (error) {
      state.actionError = error.message || '변환 중 오류가 발생했습니다.';
    } finally { state.busy = false; render(); }
  });
  $('redownload').addEventListener('click', download);
  $('reset').addEventListener('click', () => {
    state.revision++; state.token.rom++; state.token.cheat++; clearResult();
    Object.assign(state, { rom: null, romFile: null, db: null, cheatFile: null, selected: null, busy: false });
    state.reading = { rom: false, cheat: false }; state.errors = { rom: '', cheat: '' };
    $('game-search').value = ''; $('rom-file').value = ''; $('cheat-file').value = ''; populateGames(); render();
  });
  try {
    const saved = localStorage.getItem('nds-cheat-crc-theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch (_) { /* Storage is optional; file contents are never stored. */ }
  $('theme').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next;
    try { localStorage.setItem('nds-cheat-crc-theme', next); } catch (_) { /* Optional preference. */ }
  });
  render();
})();
