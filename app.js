(function(){
"use strict";

const STORAGE_KEY = "weekly-planner-v1";

const DAYS_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const DAYS_FULL  = ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
const MONTHS_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const MONTHS_SHORT = ["янв","фев","мар","апр","мая","июн","июл","авг","сен","окт","ноя","дек"];

const MAX_TASKS_IN_CARD = 3;

let data = { days: {} };
let weekStart = startOfWeek(new Date());
let editingKey = null;
let currentView = "today";
let lastTodayKey = null;

/* ---------- dates ---------- */
function startOfWeek(d){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}
function addDays(d, n){
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}
function keyOf(d){
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}
function parseKey(k){
  const p = k.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2]);
}
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function esc(s){
  return String(s).replace(/[&<>"']/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}
function plural(n, one, few, many){
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}
function dayIndex(d){ return (d.getDay() + 6) % 7; }
/* ---------- сортировка дел ----------
   1) невыполненные — сверху
   2) со временем — выше, без времени — в конце
   3) раньше по времени — выше
   4) иначе — как добавили
*/
function sortTasks(tasks){
  return tasks.slice().sort(function(a, b){
    const d = (a.done ? 1 : 0) - (b.done ? 1 : 0);
    if (d !== 0) return d;

    const at = a.time ? 0 : 1;
    const bt = b.time ? 0 : 1;
    if (at !== bt) return at - bt;

    if (a.time && b.time){
      if (a.time < b.time) return -1;
      if (a.time > b.time) return 1;
    }
    return 0;
  });
}
/* ---------- storage ---------- */
function load(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.days && typeof parsed.days === "object"){
      data = parsed;
      migrateData();
    }
  }catch(e){ console.warn("load error", e); }
}

function migrateData(){
  if (!data || !data.days) return;
  Object.keys(data.days).forEach(function(k){
    const day = data.days[k];
    if (!day || !Array.isArray(day.tasks)) return;
    day.tasks.forEach(function(t){
      if (!t.id) t.id = uid();
      if (typeof t.time === "undefined") t.time = null;   // ← новая опция
    });
  });
}
function save(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  catch(e){ alert("Не удалось сохранить данные: " + e.message); }
}
function getDay(key, create){
  if (!data.days[key]){
    if (!create) return { tasks: [] };
    data.days[key] = { tasks: [] };
  }
  if (!Array.isArray(data.days[key].tasks)) data.days[key].tasks = [];
  return data.days[key];
}

/* ---------- toast ---------- */
let toastTimer = null;
function toast(msg){
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ el.classList.remove("show"); }, 1800);
}

/* ---------- week render ---------- */
function weekLabelText(d1, d2){
  if (d1.getMonth() === d2.getMonth()){
    return d1.getDate() + " – " + d2.getDate() + " " + MONTHS_GEN[d2.getMonth()];
  }
  return d1.getDate() + " " + MONTHS_SHORT[d1.getMonth()] +
         " – " + d2.getDate() + " " + MONTHS_SHORT[d2.getMonth()];
}
function renderWeek(){
  const grid = document.getElementById("weekGrid");
  const todayKey = keyOf(new Date());
  const d1 = weekStart, d2 = addDays(weekStart, 6);

  document.getElementById("weekLabel").textContent =
    weekLabelText(d1, d2) + ", " + d2.getFullYear();

  grid.innerHTML = "";

  for (let i = 0; i < 7; i++){
    const d = addDays(weekStart, i);
    const k = keyOf(d);
    const day = data.days[k] || { tasks: [] };
    const tasks = day.tasks || [];
    const doneCount = tasks.filter(function(t){ return t.done; }).length;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "day-card" + (k === todayKey ? " today" : "") + (i === 6 ? " wide" : "");

    const shown = sortTasks(tasks).slice(0, MAX_TASKS_IN_CARD);
    const rest = tasks.length - shown.length;

    let html = '<div class="dc-head">' +
        '<span class="dc-name">' + DAYS_SHORT[i] + '</span>' +
        '<span class="dc-date">' + d.getDate() + '</span>' +
      '</div><div class="dc-tasks">';

    if (tasks.length === 0){
      html += '<div class="dc-empty">пусто</div>';
    } else {
      for (let j = 0; j < shown.length; j++){
        const t = shown[j];
        const timePrefix = t.time ? '<span class="dc-time">' + esc(t.time) + '</span> ' : '';
html += '<div class="dc-task' + (t.done ? " done" : "") + '">' + timePrefix + esc(t.text) + '</div>';
      }
      if (rest > 0){
        html += '<div class="dc-more">ещё ' + rest + ' ' + plural(rest, "дело", "дела", "дел") + '</div>';
      }
    }
    html += "</div>";
    if (tasks.length){
      html += '<div class="dc-foot">' + doneCount + "/" + tasks.length + '</div>';
    }
    card.innerHTML = html;
    card.addEventListener("click", (function(key){
      return function(){ openEditor(key); };
    })(k));
    grid.appendChild(card);
  }
}

/* ---------- today render ---------- */
function renderToday(){
  const now = new Date();
  const k = keyOf(now);
  lastTodayKey = k;

  const day = data.days[k] || { tasks: [] };
  const tasks = day.tasks || [];
  const doneCount = tasks.filter(function(t){ return t.done; }).length;

  document.getElementById("todayDate").textContent =
    DAYS_FULL[dayIndex(now)] + ", " + now.getDate() + " " + MONTHS_GEN[now.getMonth()];

  document.getElementById("todaySub").textContent =
    tasks.length
      ? doneCount + " из " + tasks.length + " " + plural(tasks.length, "дела", "дел", "дел") + " выполнено"
      : "На сегодня дел нет";

  const list = document.getElementById("todayList");
  list.innerHTML = "";

  if (!tasks.length){
    list.innerHTML = '<div class="empty-state">Пока пусто.<br>Добавьте первое дело ниже 👇</div>';
    return;
  }

  const sorted = sortTasks(tasks);

  sorted.forEach(function(t){
  const row = document.createElement("div");
  row.className = "t-item" + (t.done ? " done" : "");
  const timeBadge = t.time
    ? '<span class="t-time">' + esc(t.time) + '</span>'
    : '';
  row.innerHTML =
    '<div class="t-check"></div>' +
    '<div class="t-text">' + timeBadge + esc(t.text) + '</div>';
  row.addEventListener("click", function(){
    t.done = !t.done;
    save();
    renderToday();
    renderWeek();
  });
  list.appendChild(row);
});
}

function renderAll(){
  renderToday();
  renderWeek();
}

/* ---------- editor ---------- */
function editorTitleFor(key){
  const d = parseKey(key);
  return DAYS_FULL[dayIndex(d)] + ", " + d.getDate() + " " + MONTHS_GEN[d.getMonth()];
}
function openEditor(key){
  editingKey = key;
  document.getElementById("editorTitle").textContent = editorTitleFor(key);
  renderEditorTasks();
  document.getElementById("editorOverlay").classList.add("open");
}
function closeEditor(){
  document.getElementById("editorOverlay").classList.remove("open");
  document.getElementById("editorAddInput").value = "";
  editingKey = null;
  renderAll();
}
function renderEditorTasks(){
  const box = document.getElementById("editorTasks");
  if (!editingKey) return;

  const day = data.days[editingKey];
  const tasks = day ? day.tasks : [];

  box.innerHTML = "";

  if (!tasks.length){
    box.innerHTML = '<div class="ed-empty">Пока нет дел.<br>Добавьте первое 👇</div>';
    return;
  }

  const sorted = sortTasks(tasks);

  sorted.forEach(function(t){
    const row = document.createElement("div");
    row.className = "ed-row" + (t.done ? " done" : "");

    /* галочка */
    const chk = document.createElement("button");
    chk.type = "button";
    chk.className = "ed-check";
    chk.addEventListener("click", function(){
      t.done = !t.done;
      save();
      renderEditorTasks();
      renderWeek();
      renderToday();
    });

    /* текст + время */
    const fields = document.createElement("div");
    fields.className = "ed-fields";

    const inp = document.createElement("input");
    inp.type = "text";
    inp.className = "ed-input";
    inp.value = t.text;
    inp.placeholder = "Дело";
    inp.autocomplete = "off";
    inp.autocorrect = "off";
    inp.addEventListener("input", function(){
      t.text = inp.value;
      save();
      renderWeek();
      renderToday();
    });

    const meta = document.createElement("div");
    meta.className = "ed-meta";

    const timeInp = document.createElement("input");
    timeInp.type = "time";
    timeInp.className = "ed-time";
    timeInp.value = t.time || "";
    timeInp.addEventListener("change", function(){
      t.time = timeInp.value || null;
      save();
      renderEditorTasks();   // пересортировать
      renderWeek();
      renderToday();
    });

    const calBtn = document.createElement("button");
    calBtn.type = "button";
    calBtn.className = "ed-cal";
    calBtn.textContent = "📅 В календарь";
    calBtn.addEventListener("click", function(){
      if (!t.text.trim()){ toast("Сначала введите текст дела"); return; }
      addToCalendar(t, editingKey);
    });

    meta.appendChild(timeInp);
    meta.appendChild(calBtn);
    fields.appendChild(inp);
    fields.appendChild(meta);

    /* удалить — ищем индекс в оригинальном массиве */
    const del = document.createElement("button");
    del.type = "button";
    del.className = "ed-del";
    del.textContent = "✕";
    del.addEventListener("click", function(){
      const i = tasks.indexOf(t);
      if (i === -1) return;
      const label = t.text ? '«' + t.text + '»' : 'это дело';
      if (!confirm("Удалить " + label + "?")) return;

      tasks.splice(i, 1);
      save();
      renderEditorTasks();
      renderWeek();
      renderToday();
    });

    row.appendChild(chk);
    row.appendChild(fields);
    row.appendChild(del);
    box.appendChild(row);
  });
}
function addTaskToEditor(){
  const input = document.getElementById("editorAddInput");
  const timeInput = document.getElementById("editorAddTime");
  const text = input.value.trim();
  if (!text || !editingKey) return;

  const time = timeInput.value || null;
  const day = getDay(editingKey, true);
  day.tasks.push({ id: uid(), text: text, time: time, done: false });
  save();
  input.value = "";
  timeInput.value = "";
  renderEditorTasks();
  renderWeek();
  renderToday();

  const box = document.getElementById("editorTasks");
  box.scrollTop = box.scrollHeight;
  input.focus();
}
/* ---------- calendar (.ics) ---------- */
function pad2(n){ return String(n).padStart(2, "0"); }

function icsEscape(str){
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildICS(task, dateKey){
  const d = parseKey(dateKey);
  const next = addDays(d, 1);
  const now = new Date();
  const stamp =
    now.getUTCFullYear() + pad2(now.getUTCMonth() + 1) + pad2(now.getUTCDate()) +
    "T" + pad2(now.getUTCHours()) + pad2(now.getUTCMinutes()) + pad2(now.getUTCSeconds()) + "Z";

  const ymd     = d.getFullYear()     + pad2(d.getMonth() + 1)     + pad2(d.getDate());
  const nextYmd = next.getFullYear()  + pad2(next.getMonth() + 1)  + pad2(next.getDate());

  const summary = "Планер: " + task.text;
  const escSum  = icsEscape(summary);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Weekly Planner//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:" + (task.id || uid()) + "@weekly-planner",
    "DTSTAMP:" + stamp
  ];

  if (task.time){
    // timed event — 1 час по умолчанию
    const parts = task.time.split(":");
    const hh = Number(parts[0]) || 0;
    const mm = Number(parts[1]) || 0;
    const endH = (hh + 1) % 24;
    const endD = (hh + 1 >= 24) ? nextYmd : ymd;
    lines.push("DTSTART:" + ymd + "T" + pad2(hh) + pad2(mm) + "00");
    lines.push("DTEND:"   + endD + "T" + pad2(endH) + pad2(mm) + "00");
  } else {
    // all-day event
    lines.push("DTSTART;VALUE=DATE:" + ymd);
    lines.push("DTEND;VALUE=DATE:"   + nextYmd);
  }

  lines.push("SUMMARY:"     + escSum);
  lines.push("DESCRIPTION:" + escSum);

  if (task.time){
    // напоминание за 15 минут до начала (только для событий со временем)
    lines.push("BEGIN:VALARM");
    lines.push("TRIGGER:-PT15M");
    lines.push("ACTION:DISPLAY");
    lines.push("DESCRIPTION:" + escSum);
    lines.push("END:VALARM");
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  // RFC 5545 — переводы строк обязательно CRLF
  return lines.join("\r\n") + "\r\n";
}

function addToCalendar(task, dateKey){
  try{
    const ics = buildICS(task, dateKey);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const safeName = (task.text.slice(0, 30).replace(/[\\/:*?"<>|]/g, "").trim() || "event");
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName + ".ics";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(function(){ URL.revokeObjectURL(url); }, 3000);
    toast("Файл .ics сохранён — откройте его в «Файлах»");
  }catch(e){
    alert("Не удалось создать событие: " + e.message);
  }
}
/* ---------- backup ---------- */
function openBackup(){
  document.getElementById("backupText").value = JSON.stringify(data, null, 2);
  document.getElementById("backupOverlay").classList.add("open");
}
function closeBackup(){
  document.getElementById("backupOverlay").classList.remove("open");
}
async function copyBackup(){
  const ta = document.getElementById("backupText");
  const txt = ta.value;
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      await navigator.clipboard.writeText(txt);
    } else { throw new Error("no clipboard api"); }
    toast("Скопировано");
  }catch(e){
    ta.focus(); ta.select(); ta.setSelectionRange(0, txt.length);
    try{ document.execCommand("copy"); toast("Скопировано"); }
    catch(err){ toast("Выделите и скопируйте вручную"); }
  }
}
function downloadBackup(){
  const txt = document.getElementById("backupText").value;
  const blob = new Blob([txt], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "planner-backup-" + keyOf(new Date()) + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  toast("Файл сохранён");
}
function restoreBackup(){
  const txt = document.getElementById("backupText").value.trim();
  if (!txt){ toast("Поле пустое"); return; }

  let parsed;
  try{ parsed = JSON.parse(txt); }
  catch(e){ alert("Не удалось прочитать JSON: " + e.message); return; }

  if (!parsed || typeof parsed !== "object" || !parsed.days || typeof parsed.days !== "object"){
    alert("Неверный формат бэкапа.");
    return;
  }
  if (!confirm("Заменить все текущие данные данными из бэкапа?")) return;

  data = parsed;
  migrateData();
  Object.keys(data.days).forEach(function(k){
    if (!data.days[k] || !Array.isArray(data.days[k].tasks)) data.days[k] = { tasks: [] };
  });

  save();
  renderAll();
  closeBackup();
  toast("Восстановлено");
}

/* ---------- views ---------- */
function switchView(v){
  currentView = v;
  document.getElementById("viewToday").classList.toggle("active", v === "today");
  document.getElementById("viewWeek").classList.toggle("active", v === "week");
  document.querySelectorAll(".tab").forEach(function(t){
    t.classList.toggle("active", t.dataset.view === v);
  });
  document.getElementById("topTitle").textContent = v === "today" ? "Сегодня" : "Неделя";
  renderAll();
}

/* ---------- events ---------- */
function bindEvents(){
  document.querySelectorAll(".tab").forEach(function(t){
    t.addEventListener("click", function(){ switchView(t.dataset.view); });
  });

  document.getElementById("prevWeek").addEventListener("click", function(){
    weekStart = addDays(weekStart, -7);
    renderWeek();
  });
  document.getElementById("nextWeek").addEventListener("click", function(){
    weekStart = addDays(weekStart, 7);
    renderWeek();
  });
  document.getElementById("weekLabel").addEventListener("click", function(){
    weekStart = startOfWeek(new Date());
    renderWeek();
    toast("Текущая неделя");
  });

  const tAdd = document.getElementById("todayAddInput");
  const tTime = document.getElementById("todayAddTime");
document.getElementById("todayAddBtn").addEventListener("click", function(){
  const text = tAdd.value.trim();
  if (!text) return;
  const time = tTime.value || null;
  const day = getDay(keyOf(new Date()), true);
  day.tasks.push({ id: uid(), text: text, time: time, done: false });
  save();
  tAdd.value = "";
  tTime.value = "";
  renderToday();
  renderWeek();
});
  tAdd.addEventListener("keydown", function(e){
    if (e.key === "Enter"){ e.preventDefault(); document.getElementById("todayAddBtn").click(); }
  });

  document.getElementById("editTodayBtn").addEventListener("click", function(){
    openEditor(keyOf(new Date()));
  });

  document.getElementById("editorClose").addEventListener("click", closeEditor);
  document.getElementById("editorAddBtn").addEventListener("click", addTaskToEditor);
  document.getElementById("editorAddInput").addEventListener("keydown", function(e){
    if (e.key === "Enter"){ e.preventDefault(); addTaskToEditor(); }
  });

  document.getElementById("backupBtn").addEventListener("click", openBackup);
  document.getElementById("backupClose").addEventListener("click", closeBackup);
  document.getElementById("copyBackup").addEventListener("click", copyBackup);
  document.getElementById("downloadBackup").addEventListener("click", downloadBackup);
  document.getElementById("restoreBackup").addEventListener("click", restoreBackup);
  document.getElementById("loadFileBtn").addEventListener("click", function(){
    document.getElementById("fileInput").click();
  });
  document.getElementById("fileInput").addEventListener("change", function(e){
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function(){
      document.getElementById("backupText").value = String(r.result);
      toast("Файл загружен — нажмите «Восстановить»");
    };
    r.readAsText(f);
    e.target.value = "";
  });

  setInterval(function(){
    const k = keyOf(new Date());
    if (k !== lastTodayKey){
      weekStart = startOfWeek(new Date());
      renderAll();
      toast("Новый день");
    }
  }, 30000);

  document.addEventListener("visibilitychange", function(){
    if (!document.hidden){
      const k = keyOf(new Date());
      if (k !== lastTodayKey){
        weekStart = startOfWeek(new Date());
        renderAll();
      }
    }
  });
}

/* ---------- apple-touch-icon + service worker ---------- */
function makeAppleIcon(){
  try{
    const size = 180;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, size, size);
    g.addColorStop(0, "#2b6bff");
    g.addColorStop(1, "#7a4dff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "rgba(255,255,255,.14)";
    ctx.beginPath();
    ctx.arc(size * 0.78, size * 0.22, size * 0.30, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 " + Math.round(size * 0.55) + "px -apple-system, Segoe UI, Roboto, sans-serif";
    ctx.fillText("7", size / 2, size * 0.55);
    const link = document.createElement("link");
    link.rel = "apple-touch-icon";
    link.href = c.toDataURL("image/png");
    document.head.appendChild(link);
  }catch(e){}
}

function registerSW(){
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")){
    window.addEventListener("load", function(){
      navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
  .then(function(reg){
    // принудительно проверяем обновление при каждом запуске приложения
    reg.update().catch(function(){});
  })
  .catch(function(err){
    console.warn("SW registration failed:", err);
  });
    });
  }
}
function watchSWUpdates(){
  if (!("serviceWorker" in navigator)) return;
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", function(){
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
/* ---------- boot ---------- */
function boot(){
  load();
  lastTodayKey = keyOf(new Date());
  makeAppleIcon();
  bindEvents();
  switchView("week");
  registerSW();
  watchSWUpdates();
}
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", boot);
} else { boot(); }

})();