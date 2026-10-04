// Follow Through AI — Frontend Application Logic

let allCommitments = [];

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupEventListeners();
  loadData();
  // Live countdown update every second
  setInterval(updateCountdowns, 1000);
});

// Setup Tab Switching
function setupTabs() {
  const tabs = [
    { btn: "tab-btn-commitments", view: "tab-view-commitments" },
    { btn: "tab-btn-orphans", view: "tab-view-orphans" },
    { btn: "tab-btn-upload", view: "tab-view-upload" }
  ];

  tabs.forEach(t => {
    const el = document.getElementById(t.btn);
    if (!el) return;
    el.addEventListener("click", () => {
      tabs.forEach(other => {
        document.getElementById(other.btn).classList.remove("active");
        document.getElementById(other.btn).classList.add("text-slate-400");
        document.getElementById(other.view).classList.add("hidden");
      });
      el.classList.add("active");
      el.classList.remove("text-slate-400");
      document.getElementById(t.view).classList.remove("hidden");
    });
  });
}

function activateTab(tabKey) {
  const btn = document.getElementById(`tab-btn-${tabKey}`);
  if (btn) btn.click();
}

// Load Data from Backend API
async function loadData() {
  try {
    const [commitmentsRes, analyticsRes] = await Promise.all([
      fetch("/api/commitments"),
      fetch("/api/analytics")
    ]);

    allCommitments = await commitmentsRes.json();
    const analytics = await analyticsRes.json();

    renderAnalytics(analytics);
    renderCommitments(allCommitments);
    renderOrphans(allCommitments.filter(c => c.is_orphan && c.status !== "completed"));
  } catch (err) {
    console.error("Failed to load commitments:", err);
  }
}

// Render Top KPI Metrics
function renderAnalytics(data) {
  document.getElementById("stat-pending").textContent = data.pending ?? 0;
  document.getElementById("stat-orphans").textContent = data.active_orphans ?? 0;
  document.getElementById("stat-overdue").textContent = data.overdue ?? 0;
  document.getElementById("stat-reliability").textContent = `${data.reliability_rate_percent ?? 100}%`;

  document.getElementById("count-all").textContent = data.total_commitments ?? 0;
  document.getElementById("count-orphans").textContent = data.active_orphans ?? 0;
}

// Format Remaining Time Countdown
function getCountdownData(deadlineIso) {
  if (!deadlineIso) return { text: "No deadline", badgeClass: "countdown-normal" };
  const target = new Date(deadlineIso).getTime();
  const now = new Date().getTime();
  const diff = target - now;

  if (diff <= 0) {
    const overdueMin = Math.abs(Math.floor(diff / (1000 * 60)));
    const overdueHr = Math.floor(overdueMin / 60);
    const text = overdueHr > 0 ? `⚠️ OVERDUE by ${overdueHr}h ${overdueMin % 60}m` : `⚠️ OVERDUE by ${overdueMin}m`;
    return { text, badgeClass: "countdown-overdue" };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  if (hours < 2) {
    return { text: `⏳ ${hours}h ${minutes}m ${seconds}s left`, badgeClass: "countdown-warning" };
  } else {
    return { text: `🕒 ${hours}h ${minutes}m left`, badgeClass: "countdown-normal" };
  }
}

// Update all countdown badges in real time
function updateCountdowns() {
  document.querySelectorAll("[data-deadline]").forEach(el => {
    const iso = el.getAttribute("data-deadline");
    const { text, badgeClass } = getCountdownData(iso);
    el.textContent = text;
    el.className = `text-[11px] font-mono px-2.5 py-1 rounded-full font-semibold ${badgeClass}`;
  });
}

// Render All Commitments Cards
function renderCommitments(items) {
  const container = document.getElementById("commitments-list");
  if (!items.length) {
    container.innerHTML = `<div class="col-span-3 text-center py-12 text-slate-500 text-sm">No commitments found. Text a promise or upload a meeting!</div>`;
    return;
  }

  container.innerHTML = items.map(c => {
    const { text: countdownText, badgeClass } = getCountdownData(c.deadline_iso);
    const channelBadge = c.channel === "imessage" 
      ? `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">💬 iMessage</span>`
      : `<span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">🎙️ Meeting</span>`;

    const statusBadge = c.status === "completed"
      ? `<span class="bg-emerald-500/20 text-emerald-300 text-[10px] px-2 py-0.5 rounded font-semibold">Completed ✅</span>`
      : `<span data-deadline="${c.deadline_iso || ''}" class="text-[11px] font-mono px-2.5 py-1 rounded-full font-semibold ${badgeClass}">${countdownText}</span>`;

    const orphanNotice = c.is_orphan 
      ? `<div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-[11px] text-amber-300 flex items-center justify-between">
           <span>⚠️ Orphan Task (Unassigned)</span>
           <button onclick="claimOrphanTask('${c.id}')" class="bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] font-semibold transition">Claim 🙋</button>
         </div>`
      : (c.claimed_by ? `<div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-1.5 text-[11px] text-emerald-300 flex items-center gap-1.5 font-medium">
           <span>🙋 Claimed & Owned by <strong>${c.claimed_by}</strong></span>
         </div>` : "");

    return `
      <div class="bg-slate-900/60 border ${c.status === 'completed' ? 'border-slate-800 opacity-60' : (c.is_orphan ? 'border-amber-500/40' : 'border-slate-800')} rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-slate-700 transition">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            ${channelBadge}
            ${statusBadge}
          </div>

          <div>
            <h4 class="text-sm font-bold text-white leading-snug">${c.title}</h4>
            <p class="text-xs text-slate-400 mt-1 italic line-clamp-2">"${c.raw_statement}"</p>
          </div>

          <div class="text-xs text-slate-300 space-y-1 border-t border-slate-800/80 pt-2 font-mono">
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Committer:</span>
              <span class="font-medium ${c.committer ? 'text-slate-200' : 'text-amber-400'}">${c.committer || 'Unassigned (Orphan)'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Recipient:</span>
              <span class="text-slate-200">${c.recipient || 'Team / Client'}</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-slate-500">Agreed Timeframe:</span>
              <span class="text-emerald-400 font-semibold">${c.deadline_text || 'Pending'}</span>
            </div>
          </div>

          ${orphanNotice}
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-800/80 gap-2">
          ${c.status !== 'completed' ? `
            <button onclick="nudgeCommitment('${c.id}')" class="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition flex items-center justify-center gap-1 border border-slate-700">
              <span>📱 Send Nudge</span>
              ${c.nudge_count > 0 ? `<span class="bg-blue-600 text-white rounded-full px-1.5 py-0.2 text-[9px]">${c.nudge_count}</span>` : ''}
            </button>
            <button onclick="markCompleted('${c.id}')" class="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white transition flex items-center gap-1">
              <span>Done ✅</span>
            </button>
          ` : `
            <span class="text-xs text-slate-500 italic">Fulfilled on schedule</span>
          `}
        </div>
      </div>
    `;
  }).join("");
}

// Render Orphan Tasks Tab
function renderOrphans(orphans) {
  const container = document.getElementById("orphans-list");
  if (!orphans.length) {
    container.innerHTML = `<div class="col-span-3 text-center py-12 text-slate-500 text-sm">🎉 No unassigned orphan tasks detected! All commitments have owners.</div>`;
    return;
  }

  container.innerHTML = orphans.map(c => `
    <div class="bg-amber-950/20 border border-amber-500/40 rounded-2xl p-5 flex flex-col justify-between space-y-4 shadow-sm hover:border-amber-400 transition">
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-semibold">⚠️ Unassigned Risk</span>
          <span class="text-xs text-slate-400 font-mono">${c.deadline_text || 'ASAP'}</span>
        </div>

        <div>
          <h4 class="text-sm font-bold text-amber-200">${c.title}</h4>
          <p class="text-xs text-slate-400 mt-1 italic">"${c.raw_statement}"</p>
        </div>

        <div class="text-xs text-slate-400 space-y-1 border-t border-slate-800/80 pt-2 font-mono">
          <div class="flex items-center justify-between">
            <span>Meeting Source:</span>
            <span class="text-slate-200">${c.meeting_title || 'Sprint Review'}</span>
          </div>
          <div class="flex items-center justify-between">
            <span>Enterprise Impact:</span>
            <span class="text-rose-400 font-semibold">High / Rollout Blocker</span>
          </div>
        </div>
      </div>

      <div class="pt-2 border-t border-slate-800/80">
        <button onclick="claimOrphanTask('${c.id}')" class="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-xs font-bold text-white transition flex items-center justify-center gap-2 shadow-lg shadow-amber-600/20">
          <span>🙋 Claim Responsibility (Assign to Me)</span>
        </button>
      </div>
    </div>
  `).join("");
}

// Action: Mark Commitment Completed
async function markCompleted(id) {
  try {
    await fetch(`/api/commitments/${id}/status?status=completed`, { method: "POST" });
    loadData();
  } catch (err) {
    alert("Failed to mark completed");
  }
}

// Action: Send Nudge via Photon iMessage
async function nudgeCommitment(id) {
  try {
    const res = await fetch(`/api/commitments/${id}/nudge`, { method: "POST" });
    const data = await res.json();
    const rpc = data.rpc_result || {};
    
    if (rpc.status === "delivered_to_phone") {
      alert(`📱 Nudge dispatched via Photon iMessage to ${data.recipient_phone}!\n\n"${data.nudge_body}"`);
    } else if (rpc.status === "authorization_required") {
      const assigned = rpc.assigned_phone || "+1 (628) 289-4567";
      alert(`⚠️ Photon Security Policy:\n\nTo protect against unsolicited spam, Photon Spectrum's shared line requires your phone (${data.recipient_phone}) to send an initial text first.\n\n👉 Fix in 5 seconds:\n1. Open Messages on your phone\n2. Text 'START' to ${assigned} (or click 'Open iMessage' in the top bar)\n\nOnce sent, live nudges and automated reminders will land directly on your phone!`);
    } else {
      alert(`📱 Nudge triggered for ${data.recipient}!\n\n"${data.nudge_body}"`);
    }
    loadData();
  } catch (err) {
    alert("Failed to send nudge");
  }
}

// Action: Claim Orphan Task (Opens Modal)
function claimOrphanTask(id) {
  const task = allCommitments.find(c => c.id === id);
  const modal = document.getElementById("claim-modal");
  if (!modal) {
    console.error("claim-modal element not found");
    return;
  }

  // Populate Task Details
  const taskIdEl = document.getElementById("claim-task-id");
  const taskTitleEl = document.getElementById("claim-task-title");
  const taskDeadlineEl = document.getElementById("claim-task-deadline");
  const taskMeetingEl = document.getElementById("claim-task-meeting");
  const userNameEl = document.getElementById("claim-user-name");
  const userPhoneDisplay = document.getElementById("claim-user-phone-display");

  if (taskIdEl) taskIdEl.value = id;
  if (taskTitleEl) taskTitleEl.textContent = task ? task.title : "Orphan Task";
  if (taskDeadlineEl) taskDeadlineEl.textContent = `Due: ${task?.deadline_text || 'Pending'}`;
  if (taskMeetingEl) taskMeetingEl.textContent = task?.meeting_title || 'Sprint / Meeting Item';

  // Restore saved committer name
  const savedName = localStorage.getItem("followthrough_user_name") || "Alex";
  if (userNameEl) userNameEl.value = savedName;

  // Show linked phone in checkbox label
  const phoneInput = document.getElementById("input-user-phone");
  const currentPhone = phoneInput?.value || localStorage.getItem("pledgeflow_user_phone") || "";
  if (userPhoneDisplay) {
    userPhoneDisplay.textContent = currentPhone || "Linked Phone";
  }

  // Show modal
  modal.classList.remove("hidden");
  if (userNameEl) {
    setTimeout(() => userNameEl.focus(), 50);
  }
}

// Update Phone UI state in the top bar
function updatePhoneUI(data) {
  const phone = data.phone;
  const assigned = data.assigned_phone || "+16282894567";
  const imessageUrl = data.imessage_url || `sms:${assigned}&body=START`;

  const input = document.getElementById("input-user-phone");
  const pill = document.getElementById("phone-status-pill");
  const actions = document.getElementById("phone-active-actions");
  const guideCard = document.getElementById("phone-guidance-card");
  const openLink = document.getElementById("btn-open-imessage-link");
  const inlineOpen = document.getElementById("link-inline-open");

  if (input && phone) input.value = phone;

  if (phone) {
    if (pill) {
      pill.textContent = `🟢 Linked: ${phone}`;
      pill.className = "text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2.5 py-0.5 rounded-full font-mono font-medium";
    }
    if (actions) actions.classList.remove("hidden");
    if (guideCard) guideCard.classList.remove("hidden");

    const lblLinked = document.getElementById("lbl-linked-phone");
    if (lblLinked) lblLinked.textContent = phone;

    const lblAssigned = document.getElementById("lbl-assigned-phone");
    if (lblAssigned) lblAssigned.textContent = assigned;

    const lblAssignedInline = document.getElementById("lbl-assigned-phone-inline");
    if (lblAssignedInline) lblAssignedInline.textContent = assigned;

    const lblGuideAssigned = document.getElementById("guide-assigned-phone");
    if (lblGuideAssigned) lblGuideAssigned.textContent = assigned;

    if (openLink) openLink.href = imessageUrl;
    if (inlineOpen) inlineOpen.href = imessageUrl;
  } else {
    if (pill) {
      pill.textContent = "Not Linked";
      pill.className = "text-[10px] bg-slate-800 text-slate-400 border border-slate-700 px-2 py-0.5 rounded-full font-mono font-medium";
    }
    if (actions) actions.classList.add("hidden");
    if (guideCard) guideCard.classList.add("hidden");
  }
}

// Load and display user phone setting
async function loadPhoneSetting() {
  try {
    const res = await fetch("/api/settings/phone");
    const data = await res.json();
    if (data.phone) {
      localStorage.setItem("pledgeflow_user_phone", data.phone);
      updatePhoneUI(data);
    }
  } catch (err) {
    console.error("Failed to load phone setting:", err);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  loadPhoneSetting();

  // Reset / Reload Demo Commitments
  const btnResetDemo = document.getElementById("btn-reset-demo");
  if (btnResetDemo) {
    btnResetDemo.addEventListener("click", async () => {
      btnResetDemo.disabled = true;
      btnResetDemo.textContent = "Reloading...";
      try {
        const res = await fetch("/api/demo/reset", { method: "POST" });
        const data = await res.json();
        alert(`⚡ Demo data reloaded! Restored ${data.count} active commitments and orphan tasks with fresh live countdowns.`);
        loadData();
      } catch (err) {
        alert("Failed to reload demo data");
      } finally {
        btnResetDemo.disabled = false;
        btnResetDemo.textContent = "⚡ Reload Demo Commitments";
      }
    });
  }

  // Save Phone & Register with Photon Spectrum
  const btnSavePhone = document.getElementById("btn-save-phone");
  const inputPhone = document.getElementById("input-user-phone");
  if (btnSavePhone) {
    btnSavePhone.addEventListener("click", async () => {
      const phone = inputPhone.value.trim();
      if (!phone || phone.length < 7) {
        alert("Please enter a valid phone number (e.g. +17320000000)");
        return;
      }
      
      btnSavePhone.disabled = true;
      btnSavePhone.textContent = "Linking...";
      try {
        const res = await fetch("/api/settings/phone", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone })
        });
        const data = await res.json();
        localStorage.setItem("pledgeflow_user_phone", data.phone);
        updatePhoneUI(data);

        const rpc = data.welcome_dispatched || {};
        const assigned = data.assigned_phone || "+1 (628) 289-4567";

        if (rpc.status === "delivered_to_phone") {
          alert(`📱 Phone Linked: ${data.phone}\n\n✅ Welcome iMessage successfully dispatched directly to your device via Photon Spectrum!`);
        } else if (rpc.status === "authorization_required" || (rpc.details && rpc.details.includes("Target not allowed"))) {
          alert(`📱 Phone Registered: ${data.phone}!\n\nBot Line Assigned: ${assigned}\n\n👉 Final Step to Receive Texts:\nTap the green "Open iMessage" button in the top bar to text 'START' to the bot, or add your number to the Outbound Allowlist at app.photon.codes.\n\nOnce opened, all deadline nudges will reach your phone!`);
        } else {
          alert(`📱 Phone Linked: ${data.phone}!\nFollow Through will send all proactive nudges and reminders here.`);
        }
      } catch (err) {
        alert(`Failed to register phone with Spectrum: ${err}`);
      } finally {
        btnSavePhone.disabled = false;
        btnSavePhone.textContent = "Link Phone";
      }
    });
  }

  // Test Phone Nudge Button
  const btnTestNudge = document.getElementById("btn-test-phone-nudge");
  if (btnTestNudge) {
    btnTestNudge.addEventListener("click", async () => {
      btnTestNudge.disabled = true;
      btnTestNudge.textContent = "Testing...";
      try {
        const res = await fetch("/api/settings/test-nudge", { method: "POST" });
        const data = await res.json();
        const rpc = data.rpc_result || {};

        if (rpc.status === "delivered_to_phone") {
          alert(`✅ Test Nudge Delivered!\n\nCheck your iPhone Messages app for the notification.`);
        } else if (rpc.status === "authorization_required") {
          const assigned = rpc.assigned_phone || "+1 (628) 289-4567";
          alert(`⚠️ Authorization Step Needed:\n\nPhoton's shared line requires your phone to send 'START' to ${assigned} first, or add your number to the Outbound Allowlist on app.photon.codes.\n\nTap "Open iMessage" in the top bar to send 'START' right now!`);
        } else {
          alert(`Test nudge dispatched. Status: ${rpc.status || 'Complete'}`);
        }
      } catch (err) {
        alert("Failed to send test nudge");
      } finally {
        btnTestNudge.disabled = false;
        btnTestNudge.textContent = "⚡ Test Nudge";
      }
    });
  }

  // Guide Modal handlers
  const btnGuide = document.getElementById("btn-imessage-guide");
  const modalGuide = document.getElementById("photon-guide-modal");
  const btnCloseGuide = document.getElementById("btn-close-guide-modal");
  const btnGuideOk = document.getElementById("btn-guide-ok");

  if (btnGuide && modalGuide) {
    btnGuide.addEventListener("click", () => modalGuide.classList.remove("hidden"));
    if (btnCloseGuide) btnCloseGuide.addEventListener("click", () => modalGuide.classList.add("hidden"));
    if (btnGuideOk) btnGuideOk.addEventListener("click", () => modalGuide.classList.add("hidden"));
  }

  // Custom Reminder Modal
  const btnOpenReminder = document.getElementById("btn-open-custom-reminder");
  const btnCloseReminder = document.getElementById("btn-close-reminder-modal");
  const btnCancelReminder = document.getElementById("btn-cancel-reminder");
  const reminderModal = document.getElementById("reminder-modal");
  const reminderForm = document.getElementById("custom-reminder-form");

  if (btnOpenReminder && reminderModal) {
    btnOpenReminder.addEventListener("click", () => reminderModal.classList.remove("hidden"));
    if (btnCloseReminder) btnCloseReminder.addEventListener("click", () => reminderModal.classList.add("hidden"));
    if (btnCancelReminder) btnCancelReminder.addEventListener("click", () => reminderModal.classList.add("hidden"));

    reminderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("reminder-title").value.trim();
      const timeframe = document.getElementById("reminder-timeframe").value.trim();
      const recipient = document.getElementById("reminder-recipient").value.trim() || "Self / Client";
      const notifyPhone = document.getElementById("reminder-notify-phone").checked;

      const submitBtn = document.getElementById("btn-save-reminder");
      submitBtn.disabled = true;
      submitBtn.textContent = "Scheduling...";

      try {
        const res = await fetch("/api/commitments/custom-reminder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            timeframe,
            recipient,
            committer: "Me",
            notify_phone: notifyPhone
          })
        });
        const saved = await res.json();
        reminderModal.classList.add("hidden");
        reminderForm.reset();
        alert(`⏰ Reminder created: "${saved.title}" (Due: ${saved.deadline_text})\n\nProactive nudges will be sent to your phone via Photon iMessage!`);
        loadData();
      } catch (err) {
        alert("Failed to save reminder");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Set Reminder & Alert Phone 🚀";
      }
    });
  }

  // Claim Orphan Task Modal Listeners
  const claimModal = document.getElementById("claim-modal");
  const btnCloseClaim = document.getElementById("btn-close-claim-modal");
  const btnCancelClaim = document.getElementById("btn-cancel-claim");
  const claimForm = document.getElementById("claim-form");

  if (btnCloseClaim && claimModal) {
    btnCloseClaim.addEventListener("click", () => claimModal.classList.add("hidden"));
  }
  if (btnCancelClaim && claimModal) {
    btnCancelClaim.addEventListener("click", () => claimModal.classList.add("hidden"));
  }

  if (claimForm && claimModal) {
    claimForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("claim-task-id").value;
      const userName = document.getElementById("claim-user-name").value.trim();
      const notifyPhone = document.getElementById("claim-notify-phone").checked;
      const submitBtn = document.getElementById("btn-submit-claim");

      if (!userName) {
        alert("Please enter your name");
        return;
      }

      localStorage.setItem("followthrough_user_name", userName);
      submitBtn.disabled = true;
      submitBtn.textContent = "Claiming & Notifying Phone...";

      try {
        const res = await fetch(`/api/orphan-tasks/${id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_name: userName,
            notify_phone: notifyPhone
          })
        });

        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        claimModal.classList.add("hidden");

        const im = data.imessage_dispatched;
        if (im && im.status === "delivered_to_phone") {
          alert(`✅ Task Claimed Successfully!\n\nOwnership assigned to ${userName}.\n📱 Photon iMessage confirmation & proactive nudge dispatched to your phone!`);
        } else if (im && im.status === "authorization_required") {
          const assigned = im.assigned_phone || "+1 (628) 289-4567";
          alert(`✅ Task Claimed by ${userName}!\n\n⚠️ Photon Security Notice:\nTo receive live iMessage nudges on your phone, remember to text 'START' to ${assigned} (or click 'Open iMessage' in the top bar) to authorize Photon Spectrum.`);
        } else if (notifyPhone && im) {
          alert(`✅ Task Claimed!\n\nAssigned to ${userName}.\n📱 Confirmation dispatched via Photon Spectrum.`);
        } else {
          alert(`✅ Task Claimed!\n\nAssigned to ${userName}. It has been added to your active commitments.`);
        }

        await loadData();
        activateTab("commitments");
      } catch (err) {
        console.error("Error claiming task:", err);
        alert("Failed to claim task. Please check server connection.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = "<span>Claim & Take Ownership 🙋</span>";
      }
    });
  }

  // Voice Briefing Button
  const btnVoice = document.getElementById("btn-voice-briefing");
  btnVoice.addEventListener("click", async () => {
    const label = document.getElementById("voice-briefing-label");
    const originalText = label.textContent;
    label.textContent = "Synthesizing...";
    btnVoice.disabled = true;

    try {
      const res = await fetch("/api/voice/briefing", { method: "POST" });
      const data = await res.json();
      
      const banner = document.getElementById("audio-banner");
      banner.classList.remove("hidden");
      document.getElementById("audio-script-preview").textContent = data.script;

      if (data.audio_url) {
        const audio = document.getElementById("audio-element");
        audio.src = data.audio_url;
        audio.play();
      } else {
        // Fallback to browser SpeechSynthesis
        const utter = new SpeechSynthesisUtterance(data.script);
        utter.rate = 1.0;
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      alert("Failed to generate voice briefing");
    } finally {
      label.textContent = originalText;
      btnVoice.disabled = false;
    }
  });

  // Load Sample Transcript
  const btnSample = document.getElementById("btn-load-sample");
  btnSample.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/sample-transcript");
      const data = await res.json();
      document.getElementById("input-transcript-text").value = data.content;
    } catch (err) {
      console.error(err);
    }
  });

  // Submit Meeting Transcript
  const btnSubmit = document.getElementById("btn-submit-transcript");
  btnSubmit.addEventListener("click", async () => {
    const text = document.getElementById("input-transcript-text").value.trim();
    const title = document.getElementById("input-meeting-title").value.trim();
    if (!text) {
      alert("Please paste a transcript first!");
      return;
    }

    btnSubmit.disabled = true;
    btnSubmit.textContent = "Analyzing with Gemini AI...";

    try {
      const formData = new FormData();
      formData.append("raw_text", text);
      formData.append("title", title);

      const res = await fetch("/api/meetings/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      const statusBox = document.getElementById("upload-status");
      statusBox.classList.remove("hidden");
      statusBox.innerHTML = `
        <div class="text-emerald-300 font-semibold mb-1">✅ Gemini Analysis Complete!</div>
        <div>Extracted <strong>${data.total_extracted}</strong> total items: 
          <strong>${data.assigned_commitments}</strong> assigned promises and 
          <strong class="text-amber-400">${data.orphan_tasks} high-risk orphan tasks</strong>!
        </div>
      `;

      loadData();
    } catch (err) {
      alert("Failed to analyze transcript");
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = "✨ Extract Commitments with Gemini";
    }
  });

  // iMessage Modal Drawer
  const btnOpenImessage = document.getElementById("btn-open-imessage");
  const btnCloseImessage = document.getElementById("btn-close-imessage");
  const imessageModal = document.getElementById("imessage-modal");

  btnOpenImessage.addEventListener("click", () => imessageModal.classList.remove("hidden"));
  btnCloseImessage.addEventListener("click", () => imessageModal.classList.add("hidden"));

  // iMessage Form Send
  const imessageForm = document.getElementById("imessage-form");
  const imessageInput = document.getElementById("imessage-input");
  const imessageMessages = document.getElementById("imessage-messages");

  imessageForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = imessageInput.value.trim();
    if (!text) return;

    // Append user bubble
    const userBubble = document.createElement("div");
    userBubble.className = "bg-blue-600 text-white p-3 rounded-2xl rounded-tr-sm max-w-[85%] self-end ml-auto text-xs";
    userBubble.textContent = text;
    imessageMessages.appendChild(userBubble);
    imessageInput.value = "";
    imessageMessages.scrollTop = imessageMessages.scrollHeight;

    try {
      const formData = new FormData();
      formData.append("sender", "Alex");
      formData.append("text", text);

      const res = await fetch("/api/imessage/simulate", {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      // Append bot bubble
      const botBubble = document.createElement("div");
      botBubble.className = "bg-slate-800 text-slate-200 p-3 rounded-2xl rounded-tl-sm max-w-[85%] self-start border border-slate-700/50 whitespace-pre-line text-xs";
      botBubble.textContent = data.reply;
      imessageMessages.appendChild(botBubble);
      imessageMessages.scrollTop = imessageMessages.scrollHeight;

      loadData();
    } catch (err) {
      console.error(err);
    }
  });
}
