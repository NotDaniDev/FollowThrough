// Follow Through AI — Frontend Application Logic (Lovable Design System)

let allCommitments = [];

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupEventListeners();
  updateLiveDate();
  loadData();
  loadPhoneSetting();
  // Live countdown update every second
  setInterval(updateCountdowns, 1000);
});

// Update live date in header
function updateLiveDate() {
  const el = document.getElementById("header-live-date");
  if (!el) return;
  const now = new Date();
  const options = { weekday: 'long', month: 'long', day: 'numeric' };
  el.textContent = `${now.toLocaleDateString('en-US', options)} · Live workspace`;
}

// Setup Tab Switching (Main Tabs + Left Sidebar Views)
function setupTabs() {
  const tabKeys = ["commitments", "orphans", "upload"];

  function selectTab(key) {
    tabKeys.forEach(t => {
      const topBtn = document.getElementById(`tab-btn-${t}`);
      const sideBtn = document.getElementById(`sidebar-btn-${t}`);
      const view = document.getElementById(`tab-view-${t}`);

      if (t === key) {
        if (topBtn) {
          topBtn.className = "tab-active inline-flex items-center justify-center whitespace-nowrap py-1 text-sm font-medium cursor-pointer transition-all border-b-2 px-0 pb-3 text-foreground shadow-none";
        }
        if (sideBtn) {
          sideBtn.className = "inline-flex items-center gap-2.5 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors h-9 py-2 w-full justify-start px-3 bg-secondary text-foreground";
        }
        if (view) view.classList.remove("hidden");
      } else {
        if (topBtn) {
          topBtn.className = "inline-flex items-center justify-center whitespace-nowrap py-1 text-sm font-medium cursor-pointer transition-all border-b-2 border-transparent px-0 pb-3 text-muted-foreground hover:text-foreground shadow-none";
        }
        if (sideBtn) {
          sideBtn.className = "inline-flex items-center gap-2.5 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors h-9 py-2 w-full justify-start px-3 text-muted-foreground hover:bg-accent hover:text-foreground";
        }
        if (view) view.classList.add("hidden");
      }
    });
  }

  tabKeys.forEach(key => {
    const topBtn = document.getElementById(`tab-btn-${key}`);
    const sideBtn = document.getElementById(`sidebar-btn-${key}`);
    if (topBtn) topBtn.addEventListener("click", () => selectTab(key));
    if (sideBtn) sideBtn.addEventListener("click", () => selectTab(key));
  });

  window.activateTab = selectTab;
}

function activateTab(tabKey) {
  if (typeof window.activateTab === "function") {
    window.activateTab(tabKey);
  }
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
  const pendingEl = document.getElementById("stat-pending");
  const orphansEl = document.getElementById("stat-orphans");
  const overdueEl = document.getElementById("stat-overdue");
  const relEl = document.getElementById("stat-reliability");
  const sideOrphans = document.getElementById("sidebar-orphans-badge");
  const tabOrphans = document.getElementById("tab-orphans-badge");

  if (pendingEl) pendingEl.textContent = data.pending ?? 0;
  if (orphansEl) orphansEl.textContent = data.active_orphans ?? 0;
  if (overdueEl) overdueEl.textContent = data.overdue ?? 0;
  if (relEl) relEl.textContent = `${data.reliability_rate_percent ?? 100}%`;

  if (sideOrphans) sideOrphans.textContent = data.active_orphans ?? 0;
  if (tabOrphans) tabOrphans.textContent = data.active_orphans ?? 0;
}

// Format Remaining Time Countdown (Lovable Design System)
function getCountdownData(deadlineIso) {
  if (!deadlineIso) {
    return { text: "No deadline", cssClass: "text-muted-foreground", isOverdue: false, dateLabel: "Soon" };
  }
  const target = new Date(deadlineIso);
  const now = new Date();
  const diff = target.getTime() - now.getTime();

  // Date label formatted e.g. "Oct 4"
  const dateLabel = target.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (diff <= 0) {
    return { 
      text: "⚠️ OVERDUE", 
      cssClass: "text-danger font-bold", 
      isOverdue: true,
      dateLabel 
    };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 2) {
    return { 
      text: `⏳ ${hours}h ${minutes}m left`, 
      cssClass: "text-warning font-semibold", 
      isOverdue: false,
      dateLabel 
    };
  } else if (days >= 1) {
    return { 
      text: `⏳ ${days}d ${hours % 24}h left`, 
      cssClass: "text-foreground", 
      isOverdue: false,
      dateLabel 
    };
  } else {
    return { 
      text: `⏳ ${hours}h ${minutes}m left`, 
      cssClass: "text-foreground", 
      isOverdue: false,
      dateLabel 
    };
  }
}

// Update countdown badges every second without full re-render
function updateCountdowns() {
  const elements = document.querySelectorAll("[data-deadline-iso]");
  elements.forEach(el => {
    const iso = el.getAttribute("data-deadline-iso");
    if (!iso) return;
    const { text, cssClass } = getCountdownData(iso);
    el.textContent = text;
    el.className = `font-mono text-xs font-medium ${cssClass}`;
  });
}

// Render All Commitments Table (Matching Lovable format)
function renderCommitments(items) {
  const container = document.getElementById("commitments-list");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="p-12 text-center text-sm text-muted-foreground">No commitments found. Text a promise or upload a meeting!</div>`;
    return;
  }

  container.innerHTML = items.map(c => {
    const { text: countdownText, cssClass: countdownClass, isOverdue, dateLabel } = getCountdownData(c.deadline_iso);

    // Status dot color
    let dotClass = "bg-primary";
    if (c.status === "completed") {
      dotClass = "bg-muted-foreground/50";
    } else if (isOverdue || c.status === "overdue") {
      dotClass = "bg-danger";
    }

    const channelLabel = c.channel === "imessage" ? "iMessage" : (c.meeting_title || "Meeting");

    const claimedBadge = c.claimed_by ? `
      <div class="mt-1.5 pl-4 flex items-center gap-1.5 text-[11px] text-primary font-medium">
        <span>🙋 Claimed & Owned by <strong>${c.claimed_by}</strong></span>
      </div>
    ` : (c.is_orphan ? `
      <div class="mt-1.5 pl-4 flex items-center gap-2 text-[11px] text-warning font-medium">
        <span class="rounded bg-warning/10 border border-warning/20 px-1.5 py-0.5 text-[10px] font-mono">⚠️ Unassigned Risk</span>
        <button onclick="claimOrphanTask('${c.id}')" class="underline hover:text-foreground font-semibold cursor-pointer text-warning">Click to Claim 🙋</button>
      </div>
    ` : "");

    return `
      <article class="group grid gap-4 border-b border-border p-5 last:border-b-0 md:grid-cols-[1fr_160px_130px] md:items-center hover:bg-secondary/15 transition-colors">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="size-2 rounded-full shrink-0 ${dotClass}"></span>
            <h3 class="truncate font-display text-sm font-semibold ${c.status === 'completed' ? 'text-muted-foreground line-through' : 'text-foreground'}">
              ${c.title}
            </h3>
          </div>

          <p class="mt-1.5 line-clamp-1 pl-4 text-xs text-muted-foreground">
            ${c.committer || 'Unassigned'} → ${c.recipient || 'Team'} · ${channelLabel}
          </p>

          <p class="mt-1.5 line-clamp-1 pl-4 text-xs italic text-muted-foreground/80">
            “${c.raw_statement || c.title}”
          </p>

          ${claimedBadge}
        </div>

        <div>
          <p data-deadline-iso="${c.deadline_iso || ''}" class="font-mono text-xs font-medium ${c.status === 'completed' ? 'text-muted-foreground' : countdownClass}">
            ${c.status === 'completed' ? 'Completed ✅' : countdownText}
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            ${c.deadline_text || dateLabel}
          </p>
        </div>

        <div class="flex justify-end items-center gap-1.5">
          ${c.is_orphan && !c.claimed_by ? `
            <button onclick="claimOrphanTask('${c.id}')" class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold cursor-pointer transition-all bg-warning text-black hover:bg-warning/90 h-8 rounded-md px-3.5 text-xs shadow-sm hover:scale-105 active:scale-95" title="Take ownership of this orphan task">
              <span>Claim 🙋</span>
            </button>
          ` : (c.status !== 'completed' ? `
            <button onclick="nudgeCommitment('${c.id}')" class="inline-flex items-center justify-center rounded-md text-sm font-medium cursor-pointer transition-colors hover:bg-accent hover:text-foreground h-9 w-9 border border-border/60 text-muted-foreground relative" aria-label="Nudge about ${c.title}" title="Send nudge via Photon iMessage">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bell">
                <path d="M10.268 21a2 2 0 0 0 3.464 0"></path>
                <path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>
              </svg>
              ${c.nudge_count > 0 ? `<span class="absolute -top-1 -right-1 size-3.5 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center font-bold">${c.nudge_count}</span>` : ''}
            </button>
            <button onclick="markCompleted('${c.id}')" class="inline-flex items-center justify-center gap-1 whitespace-nowrap font-medium cursor-pointer transition-colors hover:bg-primary/20 hover:text-primary h-8 rounded-md px-3 text-xs border border-border/60 text-muted-foreground">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-check">
                <path d="M20 6 9 17l-5-5"></path>
              </svg>
              <span>Done</span>
            </button>
          ` : `
            <span class="text-xs text-muted-foreground italic">Fulfilled ✅</span>
          `)}
        </div>
      </article>
    `;
  }).join("");
}

// Render Needs Owner / Orphan Tasks Table (Lovable format)
function renderOrphans(orphans) {
  const container = document.getElementById("orphans-list");
  if (!container) return;

  if (!orphans.length) {
    container.innerHTML = `<div class="p-12 text-center text-sm text-muted-foreground">🎉 No unassigned orphan tasks detected! All commitments have owners.</div>`;
    return;
  }

  container.innerHTML = orphans.map(c => `
    <article class="group grid gap-4 border-b border-border p-5 last:border-b-0 md:grid-cols-[1fr_160px_130px] md:items-center hover:bg-secondary/15 transition-colors">
      <div class="min-w-0">
        <div class="flex items-center gap-2">
          <span class="size-2 rounded-full shrink-0 bg-warning"></span>
          <h3 class="truncate font-display text-sm font-semibold text-warning">${c.title}</h3>
        </div>

        <p class="mt-1.5 line-clamp-1 pl-4 text-xs text-muted-foreground">
          Meeting: <span class="text-foreground">${c.meeting_title || 'Sprint Sync'}</span> · Risk: <strong class="text-danger">High / Rollout Blocker</strong>
        </p>

        <p class="mt-1.5 line-clamp-1 pl-4 text-xs italic text-muted-foreground/80">
          “${c.raw_statement || c.title}”
        </p>
      </div>

      <div>
        <p class="font-mono text-xs font-medium text-warning">⚠️ Unassigned</p>
        <p class="mt-1 text-[11px] text-muted-foreground">${c.deadline_text || 'ASAP'}</p>
      </div>

      <div class="flex justify-end items-center">
        <button onclick="claimOrphanTask('${c.id}')" class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-semibold cursor-pointer transition-colors bg-warning text-black hover:bg-warning/90 h-8 rounded-md px-3 text-xs shadow-sm">
          <span>Claim 🙋</span>
        </button>
      </div>
    </article>
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
    const recipient = data.recipient || "team member";
    const phone = data.recipient_phone || "your phone";

    if (rpc.status === "delivered_to_phone") {
      alert(`📱 Live iMessage Dispatched!\n\nDelivered directly to ${phone}:\n"${data.nudge_body}"`);
    } else {
      // Dispatched and logged cleanly without repetitive nagging
      alert(`📱 Nudge Dispatched & Logged!\n\n"${data.nudge_body}"\n\nRecipient: ${recipient} (${phone})\nProactive reminder counter incremented.`);
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
    console.error("claim-modal not found");
    return;
  }

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

  const savedName = localStorage.getItem("followthrough_user_name") || "Alex";
  if (userNameEl) userNameEl.value = savedName;

  const phoneInput = document.getElementById("input-user-phone");
  const currentPhone = phoneInput?.value || localStorage.getItem("pledgeflow_user_phone") || "";
  if (userPhoneDisplay) {
    userPhoneDisplay.textContent = currentPhone || "Linked Phone";
  }

  modal.classList.remove("hidden");
  if (userNameEl) setTimeout(() => userNameEl.focus(), 50);
}

// Load and display user phone setting
async function loadPhoneSetting() {
  try {
    const res = await fetch("/api/settings/phone");
    const data = await res.json();
    const phone = data.phone || localStorage.getItem("pledgeflow_user_phone") || "";
    const assigned = data.assigned_phone || "+14152179994";
    const imessageUrl = data.imessage_url || `sms:${assigned}&body=START`;

    if (phone) {
      localStorage.setItem("pledgeflow_user_phone", phone);
      const input = document.getElementById("input-user-phone");
      if (input) input.value = phone;
      const bannerPhone = document.getElementById("banner-linked-phone");
      if (bannerPhone) bannerPhone.textContent = phone;
    }
    if (assigned) {
      const bannerAssigned = document.getElementById("banner-assigned-phone");
      if (bannerAssigned) bannerAssigned.textContent = assigned;
      const bannerLink = document.getElementById("banner-messages-link");
      if (bannerLink) bannerLink.href = imessageUrl;
      const heroLink = document.getElementById("btn-hero-open-messages");
      if (heroLink) heroLink.href = imessageUrl;
      const guidePhone = document.getElementById("guide-assigned-phone");
      if (guidePhone) guidePhone.textContent = assigned;
      const guideLink = document.getElementById("btn-guide-open-imessage");
      if (guideLink) guideLink.href = imessageUrl;
    }
  } catch (err) {
    console.error("Failed to load phone setting:", err);
  }
}

// Setup Event Listeners
function setupEventListeners() {
  // Reset / Reload Demo Commitments
  const btnResetDemo = document.getElementById("btn-reset-demo");
  if (btnResetDemo) {
    btnResetDemo.addEventListener("click", async () => {
      btnResetDemo.disabled = true;
      btnResetDemo.textContent = "Reloading...";
      try {
        const res = await fetch("/api/demo/reset", { method: "POST" });
        const data = await res.json();
        alert(`⚡ Demo data reloaded! Restored ${data.count} active commitments and orphan tasks.`);
        loadData();
      } catch (err) {
        alert("Failed to reload demo data");
      } finally {
        btnResetDemo.disabled = false;
        btnResetDemo.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
            <path d="M3 3v5h5"></path>
          </svg>
          <span>Reload demo</span>
        `;
      }
    });
  }

  // Save Phone & Register with Photon Spectrum
  const btnSavePhone = document.getElementById("btn-save-phone");
  const inputPhone = document.getElementById("input-user-phone");
  if (btnSavePhone) {
    btnSavePhone.addEventListener("click", async () => {
      const phone = inputPhone?.value.trim();
      if (!phone || phone.length < 7) {
        alert("Please enter a valid phone number (e.g. +18622370408)");
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
        alert(`✅ Phone Linked Successfully!\n\nYour number: ${data.phone}\nAssigned Photon line: ${data.assigned_phone}\n\nSend 'START' to ${data.assigned_phone} on iMessage to complete authorization!`);
        loadPhoneSetting();
      } catch (err) {
        alert("Failed to link phone");
      } finally {
        btnSavePhone.disabled = false;
        btnSavePhone.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-link-2">
            <path d="M9 17H7A5 5 0 0 1 7 7h2"></path>
            <path d="M15 7h2a5 5 0 1 1 0 10h-2"></path>
            <line x1="8" x2="16" y1="12" y2="12"></line>
          </svg>
          <span>Link</span>
        `;
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

  // Custom Reminder / New Commitment Modal
  const btnOpenReminder = document.getElementById("btn-open-custom-reminder");
  const btnHeroSetReminder = document.getElementById("btn-hero-set-reminder");
  const btnCloseReminder = document.getElementById("btn-close-reminder-modal");
  const btnCancelReminder = document.getElementById("btn-cancel-reminder");
  const reminderModal = document.getElementById("reminder-modal");
  const reminderForm = document.getElementById("custom-reminder-form");

  if (reminderModal) {
    if (btnOpenReminder) {
      btnOpenReminder.addEventListener("click", () => reminderModal.classList.remove("hidden"));
    }
    if (btnHeroSetReminder) {
      btnHeroSetReminder.addEventListener("click", () => reminderModal.classList.remove("hidden"));
    }
    if (btnCloseReminder) btnCloseReminder.addEventListener("click", () => reminderModal.classList.add("hidden"));
    if (btnCancelReminder) btnCancelReminder.addEventListener("click", () => reminderModal.classList.add("hidden"));
  }

  if (reminderForm && reminderModal) {
    reminderForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = document.getElementById("reminder-title").value.trim();
      const timeframe = document.getElementById("reminder-timeframe").value.trim();
      const recipient = document.getElementById("reminder-recipient").value.trim() || "Self / Team";
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
            committer: "You",
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
        submitBtn.textContent = "Create commitment";
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

        if (!res.ok) throw new Error(`Server returned ${res.status}`);

        const data = await res.json();
        claimModal.classList.add("hidden");

        const im = data.imessage_dispatched;
        if (im && im.status === "delivered_to_phone") {
          alert(`✅ Task Claimed Successfully!\n\nOwnership assigned to ${userName}.\n📱 Photon iMessage confirmation & proactive nudge dispatched to your phone!`);
        } else {
          alert(`✅ Task Claimed Successfully!\n\nOwnership assigned to ${userName}.\nAdded to your active commitments with automated deadline tracking.`);
        }

        await loadData();
        activateTab("commitments");
      } catch (err) {
        console.error("Error claiming task:", err);
        alert("Failed to claim task. Please check server connection.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Claim & Take Ownership 🙋";
      }
    });
  }

  // Morning Standup Voice Briefing Controller (Action Deck & Header)
  const btnVoiceHeader = document.getElementById("btn-voice-briefing");
  const btnPlayStandup = document.getElementById("btn-play-standup");
  const labelPlayStandup = document.getElementById("label-play-standup");
  const iconPlayStandup = document.getElementById("icon-play-standup");
  const btnToggleScript = document.getElementById("btn-toggle-script");
  const labelToggleScript = document.getElementById("label-toggle-script");
  const scriptContainer = document.getElementById("audio-script-container");
  const scriptPreview = document.getElementById("audio-script-preview");
  const audioElement = document.getElementById("audio-element");

  let isPlayingBriefing = false;
  let cachedAudioUrl = null;
  let cachedScript = null;

  function updateAudioStateUI(isPlaying) {
    isPlayingBriefing = isPlaying;
    if (labelPlayStandup) {
      labelPlayStandup.textContent = isPlaying ? "Stop Briefing" : "Play Morning Briefing";
    }
    if (btnPlayStandup) {
      if (isPlaying) {
        btnPlayStandup.classList.remove("bg-primary", "hover:bg-primary/90", "text-primary-foreground");
        btnPlayStandup.classList.add("bg-destructive", "hover:bg-destructive/90", "text-destructive-foreground");
      } else {
        btnPlayStandup.classList.remove("bg-destructive", "hover:bg-destructive/90", "text-destructive-foreground");
        btnPlayStandup.classList.add("bg-primary", "hover:bg-primary/90", "text-primary-foreground");
      }
    }
    if (iconPlayStandup) {
      iconPlayStandup.innerHTML = isPlaying
        ? `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`
        : `<polygon points="6 3 20 12 6 21 6 3"></polygon>`;
    }
    if (btnVoiceHeader) {
      if (isPlaying) {
        btnVoiceHeader.classList.add("text-primary", "border-primary");
      } else {
        btnVoiceHeader.classList.remove("text-primary", "border-primary");
      }
    }
  }

  async function handleToggleBriefing() {
    if (isPlayingBriefing) {
      if (audioElement) {
        audioElement.pause();
        audioElement.currentTime = 0;
      }
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      updateAudioStateUI(false);
      return;
    }

    if (labelPlayStandup) labelPlayStandup.textContent = "Synthesizing Briefing...";
    if (btnPlayStandup) btnPlayStandup.disabled = true;
    if (btnVoiceHeader) btnVoiceHeader.disabled = true;

    try {
      let audioUrl = cachedAudioUrl;
      let script = cachedScript;

      if (!audioUrl && !script) {
        const res = await fetch("/api/voice/briefing", { method: "POST" });
        const data = await res.json();
        audioUrl = data.audio_url;
        script = data.script;
        cachedAudioUrl = audioUrl;
        cachedScript = script;
      }

      if (scriptPreview && script) {
        scriptPreview.textContent = script;
      }

      if (audioUrl && audioElement) {
        audioElement.src = audioUrl;
        audioElement.onended = () => {
          updateAudioStateUI(false);
        };
        await audioElement.play();
        updateAudioStateUI(true);
      } else if (script) {
        // Fallback to browser SpeechSynthesis
        const utter = new SpeechSynthesisUtterance(script);
        utter.rate = 1.0;
        utter.onend = () => {
          updateAudioStateUI(false);
        };
        window.speechSynthesis.speak(utter);
        updateAudioStateUI(true);
      }
    } catch (err) {
      console.error("Failed to generate voice briefing:", err);
      alert("Failed to play morning standup briefing.");
      updateAudioStateUI(false);
    } finally {
      if (btnPlayStandup) btnPlayStandup.disabled = false;
      if (btnVoiceHeader) btnVoiceHeader.disabled = false;
      if (!isPlayingBriefing && labelPlayStandup) {
        labelPlayStandup.textContent = "Play Morning Briefing";
      }
    }
  }

  if (btnPlayStandup) {
    btnPlayStandup.addEventListener("click", handleToggleBriefing);
  }
  if (btnVoiceHeader) {
    btnVoiceHeader.addEventListener("click", handleToggleBriefing);
  }

  if (btnToggleScript && scriptContainer) {
    btnToggleScript.addEventListener("click", () => {
      const isHidden = scriptContainer.classList.contains("hidden");
      if (isHidden) {
        scriptContainer.classList.remove("hidden");
        if (labelToggleScript) labelToggleScript.textContent = "Hide Script";
        else btnToggleScript.textContent = "Hide Script";
      } else {
        scriptContainer.classList.add("hidden");
        if (labelToggleScript) labelToggleScript.textContent = "Read Script";
        else btnToggleScript.textContent = "Read Script";
      }
    });
  }

  // Load Sample Transcript
  const btnSample = document.getElementById("btn-load-sample");
  const transcriptInput = document.getElementById("input-transcript-text");
  const wordCountEl = document.getElementById("transcript-word-count");

  if (transcriptInput && wordCountEl) {
    transcriptInput.addEventListener("input", () => {
      const words = transcriptInput.value.trim() ? transcriptInput.value.trim().split(/\s+/).length : 0;
      wordCountEl.textContent = `${words} words`;
    });
  }

  // Upload Transcript File (.txt, .vtt)
  const fileInput = document.getElementById("input-transcript-file");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      if (transcriptInput) {
        transcriptInput.value = content;
        const words = content.trim().split(/\s+/).length;
        if (wordCountEl) wordCountEl.textContent = `${words} words`;
      }
      const titleInput = document.getElementById("input-meeting-title");
      if (titleInput) {
        titleInput.value = file.name.replace(/\.(txt|vtt)$/i, "");
      }
    });
  }

  if (btnSample) {
    btnSample.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/sample-transcript");
        const data = await res.json();
        if (transcriptInput) {
          transcriptInput.value = data.content;
          const words = data.content.trim().split(/\s+/).length;
          if (wordCountEl) wordCountEl.textContent = `${words} words`;
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Submit Meeting Transcript for Gemini Extraction
  const btnSubmit = document.getElementById("btn-submit-transcript");
  if (btnSubmit) {
    btnSubmit.addEventListener("click", async () => {
      const text = transcriptInput?.value.trim();
      const title = document.getElementById("input-meeting-title")?.value.trim() || "Meeting Transcript";
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

        const resultsCard = document.getElementById("transcript-results-card");
        if (resultsCard) {
          resultsCard.classList.remove("hidden");
          resultsCard.innerHTML = `
            <div class="text-sm font-semibold text-foreground">Analysis Complete: "${data.meeting_title}"</div>
            <div class="mt-1 text-xs">Gemini extracted <strong>${data.total_extracted} commitments</strong>: 
              <span class="text-primary font-medium">${data.assigned_commitments} assigned</span> and 
              <span class="text-warning font-medium">${data.orphan_tasks} high-risk orphan tasks</span>!
            </div>
          `;
        }

        await loadData();
        activateTab("commitments");
      } catch (err) {
        alert("Failed to analyze transcript");
      } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles">
            <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path>
          </svg>
          <span>Extract commitments</span>
        `;
      }
    });
  }

  // iMessage Drawer Open/Close
  const btnOpenImessage = document.getElementById("btn-open-imessage");
  const btnCloseImessage = document.getElementById("btn-close-imessage");
  const imessageModal = document.getElementById("imessage-modal");

  if (btnOpenImessage && imessageModal) {
    btnOpenImessage.addEventListener("click", () => imessageModal.classList.remove("hidden"));
  }
  if (btnCloseImessage && imessageModal) {
    btnCloseImessage.addEventListener("click", () => imessageModal.classList.add("hidden"));
  }

  // iMessage Form Send
  const imessageForm = document.getElementById("imessage-form");
  const imessageInput = document.getElementById("imessage-input");
  const imessageMessages = document.getElementById("imessage-messages");

  if (imessageForm) {
    imessageForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = imessageInput?.value.trim();
      if (!text) return;

      // Append user bubble (right)
      const userBubble = document.createElement("div");
      userBubble.className = "flex justify-end";
      userBubble.innerHTML = `
        <div class="max-w-[82%] whitespace-pre-line rounded-lg px-3.5 py-2.5 text-xs bg-primary text-primary-foreground">
          ${escapeHtml(text)}
          <div class="mt-1 font-mono text-[9px] opacity-70 text-right">${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
      `;
      imessageMessages.appendChild(userBubble);
      imessageInput.value = "";
      imessageMessages.scrollTop = imessageMessages.scrollHeight;

      try {
        const formData = new FormData();
        formData.append("sender", localStorage.getItem("followthrough_user_name") || "Alex");
        formData.append("text", text);

        const res = await fetch("/api/imessage/simulate", {
          method: "POST",
          body: formData
        });
        const data = await res.json();

        // Append bot bubble (left)
        const botBubble = document.createElement("div");
        botBubble.className = "flex justify-start";
        botBubble.innerHTML = `
          <div class="max-w-[82%] whitespace-pre-line rounded-lg px-3.5 py-2.5 text-xs bg-secondary/90 border border-border/50 text-foreground">
            ${escapeHtml(data.reply)}
            <div class="mt-1 font-mono text-[9px] opacity-55">${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
          </div>
        `;
        imessageMessages.appendChild(botBubble);
        imessageMessages.scrollTop = imessageMessages.scrollHeight;

        loadData();
      } catch (err) {
        console.error(err);
      }
    });
  }

  // Mobile menu button toggles sidebar
  const btnMobileMenu = document.getElementById("btn-mobile-menu");
  const sidebar = document.querySelector("aside");
  if (btnMobileMenu && sidebar) {
    btnMobileMenu.addEventListener("click", () => {
      sidebar.classList.toggle("hidden");
    });
  }

  // KPI Card "Needs owner" click navigates to orphans tab
  const kpiOrphans = document.getElementById("kpi-card-orphans");
  if (kpiOrphans) {
    kpiOrphans.addEventListener("click", () => activateTab("orphans"));
  }

  // Dismiss modals when clicking backdrop or pressing Escape
  const dismissableModals = [
    document.getElementById("claim-modal"),
    document.getElementById("reminder-modal"),
    document.getElementById("photon-guide-modal")
  ];

  dismissableModals.forEach(modal => {
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
      });
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      dismissableModals.forEach(m => m && m.classList.add("hidden"));
      const imModal = document.getElementById("imessage-modal");
      if (imModal) imModal.classList.add("hidden");
    }
  });
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Expose global actions for inline onclick handlers
window.claimOrphanTask = claimOrphanTask;
window.nudgeCommitment = nudgeCommitment;
window.markCompleted = markCompleted;
window.activateTab = activateTab;
