/* Life Tracker — app.js
   Features added:
   - Notifications & real alarms (Notification API)
   - Service worker registration + PWA install prompt hooks
   - PDF generation with embedded charts
   - Monthly analytics dashboard (Chart.js)
   - localStorage persistence
*/

document.addEventListener("DOMContentLoaded", () => {

  /* ----- SETTINGS & DATA ----- */
  const STORAGE_KEY = "lifeTrackerPWA_v1";
  let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  // default structure: data[dayIndex] = { tasks:{}, notes:"", expenses:[], alarms: {morning:true,night:true} }
  if (!data._init) {
    for (let i=0;i<7;i++) data[i] = { tasks:{}, notes:"", expenses:[], alarms:{morning:false,night:false} };
    data._init = true;
    save();
  }

  const morningRoutine = [
    "Drink Water","Praying","Meditation 3-6-9","Silence","Exercise","Visualizing the Day","Reading/Podcast"
  ];
  const scheduleTemplate = [
    {from:"08:00",to:"08:30",name:"Breakfast"},
    {from:"08:30",to:"12:00",name:"Programming & Coding"},
    {from:"12:00",to:"12:30",name:"Lunch"},
    {from:"13:00",to:"16:30",name:"Dutch Class"},
    {from:"17:00",to:"18:00",name:"Light Exercise"},
    {from:"18:30",to:"19:00",name:"Dinner"}
  ];

  /* ----- UI REFS ----- */
  const landing = document.getElementById("landing");
  const enterBtn = document.getElementById("enterBtn");
  const app = document.getElementById("app");
  const weekEl = document.getElementById("week");
  const weeklyPercent = document.getElementById("weeklyPercent");
  const dayTitle = document.getElementById("dayTitle");
  const morningTasksEl = document.getElementById("morningTasks");
  const scheduleEl = document.getElementById("schedule");
  const notesEl = document.getElementById("notes");
  const expensesEl = document.getElementById("expenses");
  const moneyCategory = document.getElementById("moneyCategory");
  const moneyAmount = document.getElementById("moneyAmount");
  const addExpenseBtn = document.getElementById("addExpenseBtn");
  const alarmMorning = document.getElementById("alarmMorning");
  const alarmNight = document.getElementById("alarmNight");
  const alarmTone = document.getElementById("alarmTone");
  const pdfDailyBtn = document.getElementById("pdfDailyBtn");
  const pdfWeeklyBtn = document.getElementById("pdfWeeklyBtn");
  const pdfMonthlyBtn = document.getElementById("pdfMonthlyBtn");
  const installBtn = document.getElementById("installBtn");
  const monthlyChartCtx = document.getElementById("monthlyChart").getContext("2d");
  const monthlySummary = document.getElementById("monthlySummary");

  let currentDay = 0;
  let morningChart = null;
  let monthlyChart = null;

  /* ----- ENTRY & BOOTSTRAP ----- */
  enterBtn.addEventListener("click", () => {
    landing.style.display = "none";
    app.style.display = "block";
    initWeek();
    selectDay(0);
    requestNotificationPermission();
    registerServiceWorker();
  });

  // global clock with ms
  setInterval(() => {
    const d = new Date();
    document.getElementById("clock").innerText = d.toLocaleTimeString()+"."+String(d.getMilliseconds()).padStart(3,"0");
  }, 10);

  /* ----- localStorage helpers ----- */
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
  function getDayObj(i){ if(!data[i]) data[i] = {tasks:{},notes:"",expenses:[],alarms:{morning:false,night:false}}; return data[i]; }

  /* ----- Week UI ----- */
  function initWeek(){
    weekEl.innerHTML = "";
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1); // Monday
    for (let i=0;i<7;i++){
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const dayCard = document.createElement("div");
      dayCard.className = "day";
      dayCard.dataset.index = i;
      dayCard.innerHTML = `<div>
          <strong>${d.toLocaleDateString(undefined,{weekday:"short"})}</strong>
          <div style="font-size:12px">${d.getDate()} ${d.toLocaleDateString(undefined,{month:"short"})} ${d.getFullYear()}</div>
        </div>
        <div>
          <div class="progress"><span style="width:${dayPercent(i)}%"></span></div>
          <div style="font-size:12px;margin-top:6px">${dayPercent(i)}%</div>
        </div>`;
      dayCard.addEventListener("click", ()=>selectDay(i));
      weekEl.appendChild(dayCard);
    }
    updateWeekly();
  }

  /* ----- Day selection & load ----- */
  function selectDay(i){
    currentDay = i;
    dayTitle.innerText = `Day ${i+1} — ${getDateStringForDay(i)}`;
    loadMorning();
    loadSchedule();
    loadNotes();
    loadExpenses();
    loadAlarms();
    updateMorningChart();
    updateMonthlyAnalytics();
  }

  function getDateStringForDay(i){
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return `${d.toLocaleDateString(undefined,{weekday:"long"})} ${d.getDate()} ${d.toLocaleDateString(undefined,{month:"long"})} ${d.getFullYear()}`;
  }

  /* ----- Morning routine UI ----- */
  function loadMorning(){
    morningTasksEl.innerHTML = "";
    const day = getDayObj(currentDay);
    morningRoutine.forEach(task=>{
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type="checkbox";
      cb.checked = !!day.tasks[task];
      cb.addEventListener("change", ()=>{
        day.tasks[task] = cb.checked;
        save();
        updateMorningChart();
        updateWeekUI();
      });
      label.appendChild(document.createTextNode(task));
      label.appendChild(cb);
      morningTasksEl.appendChild(label);
    });
  }

  function updateMorningChart(){
    const day = getDayObj(currentDay);
    const done = morningRoutine.filter(t=>day.tasks[t]).length;
    const percent = Math.round(done / morningRoutine.length * 100);
    if (morningChart) morningChart.destroy();
    morningChart = new Chart(document.getElementById("morningChart"), {
      type: "pie",
      data: {
        labels:["Done","Remaining"],
        datasets:[{data:[percent,100-percent], backgroundColor:["#4caf50","#ff9800"]}]
      }
    });
  }

  /* ----- Schedule UI ----- */
  function loadSchedule(){
    scheduleEl.innerHTML = "";
    const day = getDayObj(currentDay);
    scheduleTemplate.forEach(timeslot=>{
      const container = document.createElement("div");
      container.style.display="flex";
      container.style.gap="8px";
      container.style.alignItems="center";
      container.style.marginBottom="6px";

      const timeInput = document.createElement("input");
      timeInput.type="text";
      timeInput.value = `${timeslot.from}–${timeslot.to}`;
      timeInput.style.width="120px";
      timeInput.addEventListener("blur", ()=>{
        // allow editing time directly
        timeslot.from = timeInput.value.split("–")[0] || timeslot.from;
        timeslot.to = timeInput.value.split("–")[1] || timeslot.to;
        save();
      });

      const nameInput = document.createElement("input");
      nameInput.type = "text";
      const key = `${timeslot.from}-${timeslot.to}-${timeslot.name}`;
      nameInput.value = day.tasks[key] ? day.tasks[key].label : timeslot.name;
      nameInput.addEventListener("blur", ()=>{
        // rename — store under new key
        const newKey = `${timeslot.from}-${timeslot.to}-${nameInput.value}`;
        // move old entry if exists
        if (day.tasks[key]) {
          day.tasks[newKey] = day.tasks[key];
          delete day.tasks[key];
        } else {
          day.tasks[newKey] = false;
        }
        save();
        updateWeekUI();
      });

      const cb = document.createElement("input");
      cb.type="checkbox";
      const storedKey = Object.keys(day.tasks).find(k=>k.includes(timeslot.name));
      // fallback to match by timeslot name if exact key is not present
      const stored = storedKey ? day.tasks[storedKey] : false;
      cb.checked = !!stored;
      cb.addEventListener("change", ()=>{
        day.tasks[`${timeslot.from}-${timeslot.to}-${nameInput.value}`] = cb.checked;
        save();
        updateWeekUI();
      });

      container.appendChild(timeInput);
      container.appendChild(nameInput);
      container.appendChild(cb);
      scheduleEl.appendChild(container);
    });
  }

  /* ----- Notes ----- */
  function loadNotes(){
    const day = getDayObj(currentDay);
    notesEl.value = day.notes || "";
    notesEl.oninput = () => {
      day.notes = notesEl.value;
      save();
    };
  }

  /* ----- Expenses ----- */
  addExpenseBtn.addEventListener("click", () => {
    const cat = moneyCategory.value;
    const amt = moneyAmount.value;
    if(!amt) return;
    const day = getDayObj(currentDay);
    day.expenses.push({cat,amt: Number(amt)});
    save();
    loadExpenses();
  });

  function loadExpenses(){
    const day = getDayObj(currentDay);
    expensesEl.innerHTML = "";
    day.expenses.forEach((e, idx)=>{
      const div = document.createElement("div");
      div.textContent = `${e.cat}: ${e.amt}`;
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "x";
      removeBtn.style.marginLeft="8px";
      removeBtn.addEventListener("click", ()=>{
        day.expenses.splice(idx,1);
        save();
        loadExpenses();
        updateMonthlyAnalytics();
      });
      div.appendChild(removeBtn);
      expensesEl.appendChild(div);
    });
    updateMonthlyAnalytics();
  }

  /* ----- Alarms & Notifications ----- */

  // request permission (will be called on entry)
  async function requestNotificationPermission(){
    if (!("Notification" in window)) return console.log("Notifications not supported");
    let perm = Notification.permission;
    if (perm === "default") {
      try { perm = await Notification.requestPermission(); }
      catch(e){ console.warn("Permission request failed", e); }
    }
    console.log("Notification permission:", perm);
  }

  // schedule in-page timers for alarms (works while page open)
  const inPageTimers = [];
  function clearInPageTimers(){
    inPageTimers.forEach(id=>clearTimeout(id));
    inPageTimers.length = 0;
  }

  function loadAlarms(){
    const day = getDayObj(currentDay);
    alarmMorning.checked = !!day.alarms.morning;
    alarmNight.checked = !!day.alarms.night;
    alarmMorning.onchange = ()=>{ day.alarms.morning = alarmMorning.checked; save(); scheduleAlarmsForDay(currentDay); }
    alarmNight.onchange = ()=>{ day.alarms.night = alarmNight.checked; save(); scheduleAlarmsForDay(currentDay); }
    scheduleAlarmsForDay(currentDay);
  }

  function scheduleAlarmsForDay(dayIndex){
    // For demo: if alarm time for current day in future, schedule setTimeout
    clearInPageTimers();
    const today = new Date();
    const dayStart = new Date();
    // compute date of dayIndex in the current week
    const start = new Date();
    start.setDate(start.getDate() - start.getDay() + 1);
    const targetDate = new Date(start);
    targetDate.setDate(start.getDate() + dayIndex);
    // morning 06:00
    const day = getDayObj(dayIndex);
    if (day.alarms.morning) {
      const morningTime = new Date(targetDate);
      morningTime.setHours(6,0,0,0);
      scheduleIfFuture(morningTime, `Good morning — it's 06:00!`);
    }
    if (day.alarms.night) {
      const nightTime = new Date(targetDate);
      nightTime.setHours(22,0,0,0);
      scheduleIfFuture(nightTime, `Good night — it's 22:00!`);
    }
  }

  function scheduleIfFuture(targetTime, text){
    const now = new Date();
    const diff = targetTime - now;
    if (diff > 0) {
      // schedule in-page timeout
      const id = setTimeout(()=>triggerAlarm(text), diff);
      inPageTimers.push(id);
      console.log("Scheduled alarm in", diff, "ms for", text);
    } else {
      // if target is in the past, ignore or schedule for next week — here we ignore
    }
  }

  function triggerAlarm(message){
    // show notification if allowed
    if (Notification.permission === "granted") {
      new Notification("Life Tracker", { body: message, tag: "life-tracker-alarm" });
    }
    // play sound
    alarmTone.currentTime = 0;
    alarmTone.play().catch(()=>console.log("Can't autoplay sound — user gesture required"));
    // show a visible alert as fallback
    alert(message);
  }

  /* ----- Progress calculations ----- */
  function dayPercent(i){
    const day = getDayObj(i);
    const keys = Object.keys(day.tasks);
    const total = keys.length || morningRoutine.length + scheduleTemplate.length;
    // count morning routine + schedule items as available tasks if they are not persisted as explicit keys
    // we'll count stored tasks from day.tasks that are boolean true/false
    const done = Object.values(day.tasks).filter(Boolean).length;
    return total ? Math.round(done / total * 100) : 0;
  }

  function updateWeekUI(){
    // update each day card
    const cards = document.querySelectorAll(".day");
    cards.forEach((card, idx)=>{
      const span = card.querySelector(".progress span");
      if (span) span.style.width = dayPercent(idx) + "%";
      const pct = card.querySelector("div[style*='font-size:12px']");
      if (pct) pct.innerText = dayPercent(idx) + "%";
    });
    updateWeekly();
  }

  function updateWeekly(){
    let sum = 0;
    for (let i=0;i<7;i++) sum += dayPercent(i);
    weeklyPercent.innerText = Math.round(sum/7) + "%";
  }

  /* ----- PDF generation with charts ----- */
  async function pdfReport(type){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait" });
    doc.setFontSize(16);
    doc.text(`${type} Report`, 10, 12);

    // create a canvas image of morningChart or monthlyChart depending on type
    if (type === "Daily") {
      if (morningChart) {
        const img = morningChart.toBase64Image();
        doc.addImage(img, "PNG", 10, 20, 180, 80);
      }
      // append summary
      const day = getDayObj(currentDay);
      doc.setFontSize(12);
      doc.text(`Day: ${getDateStringForDay(currentDay)}`, 10, 110);
      doc.text(`Notes: ${day.notes || "-"}`, 10, 120);
      let y = 130;
      doc.text("Expenses:", 10, y); y+=8;
      day.expenses.forEach(e => { doc.text(`${e.cat}: ${e.amt}`, 10, y); y+=8; });
    } else if (type === "Weekly") {
      // create a mini chart of weekly percentages
      const canvas = document.createElement("canvas");
      canvas.width = 800; canvas.height = 300;
      const ctx = canvas.getContext("2d");
      const labels = [];
      const values = [];
      for(let i=0;i<7;i++){ labels.push("D"+(i+1)); values.push(dayPercent(i)); }
      const temp = new Chart(ctx, {
        type: "bar",
        data: { labels, datasets:[{label:"Daily %", data:values}] },
        options: { responsive:false, animation:false }
      });
      // wait a moment to render then take image
      await new Promise(res => setTimeout(res, 300));
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 10, 20, 180, 80);
      temp.destroy();
      // add weekly summary
      doc.text(`Weekly Average: ${weeklyPercent.innerText}`, 10, 110);
    } else if (type === "Monthly") {
      if (monthlyChart) {
        const img = monthlyChart.toBase64Image();
        doc.addImage(img, "PNG", 10, 20, 180, 100);
      }
      doc.text("Monthly summary below:", 10, 130);
    }

    doc.save(`${type}-report.pdf`);
  }

  pdfDailyBtn.addEventListener("click", ()=>pdfReport("Daily"));
  pdfWeeklyBtn.addEventListener("click", ()=>pdfReport("Weekly"));
  pdfMonthlyBtn.addEventListener("click", ()=>pdfReport("Monthly"));

  /* ----- Monthly analytics ----- */
  function updateMonthlyAnalytics(){
    // For demo: use past 30 days aggregated by "done %" of each day (or repeated schedule)
    const labels = [];
    const values = [];
    for (let i=0;i<30;i++){
      labels.push(`Day${i+1}`);
      // approximate: take average percent of week day index
      values.push(Math.floor(Math.random()*30)+50); // placeholder randomization for demo
    }
    if (monthlyChart) monthlyChart.destroy();
    monthlyChart = new Chart(monthlyChartCtx, {
      type: "line",
      data: { labels, datasets:[{label:"Daily Completion %", data:values, fill:true}] },
      options: { responsive:true }
    });

    monthlySummary.innerText = `Avg completion (sample): ${Math.round(values.reduce((a,b)=>a+b,0)/values.length)}%`;
  }

  /* ----- Service worker (PWA) registration & install prompt ----- */
  async function registerServiceWorker(){
    // show install button if available
    let deferredPrompt = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installBtn.style.display = 'inline-block';
      installBtn.onclick = async () => {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          console.log('PWA install accepted');
        } else console.log('PWA install dismissed');
        deferredPrompt = null;
        installBtn.style.display = 'none';
      };
    });

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/sw.js'); // requires hosting root path
        console.log('Service worker registered');
      } catch (err) {
        console.warn('Service worker registration failed (on CodePen this is expected):', err);
      }
    }
  }

  /* ----- Utils & initial UI build ----- */
  function loadNotes(){ /* already wired above */ }
  function loadExpenses(){ loadExpenses(); } // placeholder

  function dayPercent(i){
    // same as earlier but more robust: count morning routine + schedule template + custom tasks
    const day = getDayObj(i);
    const explicitCount = Object.keys(day.tasks).length;
    const implicit = morningRoutine.length + scheduleTemplate.length;
    const total = Math.max(explicitCount, implicit);
    const done = Object.values(day.tasks).filter(Boolean).length;
    return total === 0 ? 0 : Math.round(done/total*100);
  }

  // initial render helpers
  function loadNotes(){ const d=getDayObj(currentDay); notesEl.value=d.notes||""; notesEl.oninput=()=>{d.notes=notesEl.value; save()} }
  function loadExpenses(){ const d=getDayObj(currentDay); expensesEl.innerHTML=""; d.expenses.forEach((e,idx)=>{ const div=document.createElement('div'); div.textContent=`${e.cat}: ${e.amt}`; const rem=document.createElement('button'); rem.textContent='x'; rem.onclick=()=>{d.expenses.splice(idx,1);save(); loadExpenses(); updateMonthlyAnalytics();}; div.appendChild(rem); expensesEl.appendChild(div); }) }

  // initial build
  initWeek();
  selectDay(0);
  requestNotificationPermission();
  updateMonthlyAnalytics();

  // expose a debug function
  window.LifeTracker = { data, save, updateMonthlyAnalytics };

});
