const laneOrder = [
  { key: "backlog", label: "Backlog" },
  { key: "in-progress", label: "In Progress" },
  { key: "done", label: "Done" }
];

const state = {
  snapshot: null
};

const DEFAULT_LOCAL_API_BASE = "http://localhost:3000";
const params = new URLSearchParams(window.location.search);
const configuredApiBase = params.get("api") || window.RELEASE_BOARD_API_BASE || "";

function getPrimaryApiBase() {
  if (configuredApiBase) {
    return String(configuredApiBase).replace(/\/$/, "");
  }

  if (window.location.protocol === "file:") {
    return DEFAULT_LOCAL_API_BASE;
  }

  return window.location.origin;
}

function getApiBaseCandidates(primaryApiBase) {
  const candidates = [primaryApiBase];
  if (!configuredApiBase && primaryApiBase !== DEFAULT_LOCAL_API_BASE) {
    candidates.push(DEFAULT_LOCAL_API_BASE);
  }
  return candidates;
}

let apiBase = getPrimaryApiBase();

const refs = {
  appName: document.getElementById("appName"),
  environmentBadge: document.getElementById("environmentBadge"),
  releaseBadge: document.getElementById("releaseBadge"),
  statusLine: document.getElementById("statusLine"),
  summaryGrid: document.getElementById("summaryGrid"),
  laneGrid: document.getElementById("laneGrid"),
  checksPanel: document.getElementById("checksPanel"),
  itemCount: document.getElementById("itemCount"),
  itemForm: document.getElementById("itemForm")
};

function setStatus(message, isError = false) {
  refs.statusLine.textContent = message;
  refs.statusLine.style.color = isError ? "#b55a55" : "";
}

async function requestJson(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const candidateBases = getApiBaseCandidates(apiBase);
  let lastError = null;

  for (let index = 0; index < candidateBases.length; index += 1) {
    const candidateBase = candidateBases[index];
    const canRetry = index < candidateBases.length - 1;
    let response;

    try {
      response = await fetch(`${candidateBase}${path}`, {
        ...options,
        headers
      });
    } catch (error) {
      lastError = error;

      if (canRetry) {
        continue;
      }

      throw new Error(`Could not reach the backend at ${candidateBase}. Start the server with npm start.`);
    }

    const raw = await response.text();
    let payload = {};

    if (raw) {
      try {
        payload = JSON.parse(raw);
      } catch (error) {
        lastError = new Error(`The server at ${candidateBase} did not look like the backend.`);
        if (canRetry) {
          continue;
        }

        throw new Error(`The backend at ${candidateBase} returned an unexpected response.`);
      }
    }

    if (!response.ok) {
      if ([404, 405].includes(response.status) && canRetry) {
        lastError = new Error(`The server at ${candidateBase} did not expose the backend API.`);
        continue;
      }

      throw new Error(payload.error || `Request failed with status ${response.status}.`);
    }

    apiBase = candidateBase;
    return payload;
  }

  throw lastError || new Error("Request failed.");
}

function createSummaryCard(className, label, value, detail) {
  return `
    <article class="summary-card ${className}">
      <small>${label}</small>
      <strong>${value}</strong>
      <small>${detail}</small>
    </article>
  `;
}

function formatDataFile(path) {
  return path.split("/").slice(-2).join("/");
}

function renderSummary(snapshot) {
  const { counts, config } = snapshot;
  refs.summaryGrid.innerHTML = [
    createSummaryCard("total", "Total Items", counts.total, "Current board size"),
    createSummaryCard("backlog", "Backlog", counts.backlog, "Queued work"),
    createSummaryCard("in-progress", "In Progress", counts["in-progress"], "Active work"),
    createSummaryCard("done", "Done", counts.done, "Completed work"),
    createSummaryCard("data", "Data File", formatDataFile(config.dataFile), "Persistence target")
  ].join("");
}

function actionButtons(item) {
  const buttons = [];

  if (item.status !== "backlog") {
    buttons.push(`<button class="ghost-button" data-action="move" data-id="${item.id}" data-status="backlog">Backlog</button>`);
  }
  if (item.status !== "in-progress") {
    buttons.push(`<button class="secondary-button" data-action="move" data-id="${item.id}" data-status="in-progress">Start</button>`);
  }
  if (item.status !== "done") {
    buttons.push(`<button class="primary-button" data-action="move" data-id="${item.id}" data-status="done">Done</button>`);
  }

  buttons.push(`<button class="danger-button" data-action="delete" data-id="${item.id}">Delete</button>`);
  return buttons.join("");
}

function renderLane(snapshot, lane) {
  const items = snapshot.items.filter((item) => item.status === lane.key);

  return `
    <section class="lane">
      <h3>${lane.label}</h3>
      <div class="lane-stack">
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article class="item-card">
                      <h4>${item.title}</h4>
                      <div class="item-meta">
                        <span class="tag">${item.service}</span>
                        <span class="tag">${item.environment}</span>
                        <span class="tag">${item.owner}</span>
                      </div>
                      <div class="item-actions">
                        ${actionButtons(item)}
                      </div>
                    </article>
                  `
                )
                .join("")
            : '<p class="empty-state">Nothing here right now.</p>'
        }
      </div>
    </section>
  `;
}

function renderBoard(snapshot) {
  refs.itemCount.textContent = `${snapshot.counts.total} items`;
  refs.laneGrid.innerHTML = laneOrder.map((lane) => renderLane(snapshot, lane)).join("");
}

function renderChecks(snapshot) {
  const rows = [
    {
      name: "Health",
      state: "200 OK",
      detail: `release ${snapshot.config.release}`,
      command: `curl ${apiBase}/healthz`
    },
    {
      name: "Readiness",
      state: "200 Ready",
      detail: `${snapshot.counts.total} items loaded`,
      command: `curl ${apiBase}/readyz`
    },
    {
      name: "Items API",
      state: `${snapshot.counts.total} records`,
      detail: "JSON list endpoint",
      command: `curl ${apiBase}/api/items`
    }
  ];

  refs.checksPanel.innerHTML = rows
    .map(
      (row) => `
        <article class="check-row">
          <strong>${row.name}</strong>
          <p class="check-state">${row.state}</p>
          <p class="check-state">${row.detail}</p>
          <code>${row.command}</code>
        </article>
      `
    )
    .join("");
}

function render(snapshot) {
  state.snapshot = snapshot;
  refs.appName.textContent = snapshot.config.appName;
  refs.environmentBadge.textContent = snapshot.config.environment;
  refs.releaseBadge.textContent = snapshot.config.release;
  renderSummary(snapshot);
  renderBoard(snapshot);
  renderChecks(snapshot);
}

async function refreshBoard() {
  const snapshot = await requestJson("/api/info");
  render(snapshot);
}

async function createItem(formData) {
  await requestJson("/api/items", {
    method: "POST",
    body: JSON.stringify({
      title: formData.get("title"),
      service: formData.get("service"),
      environment: formData.get("environment"),
      owner: formData.get("owner")
    })
  });
}

async function updateItem(id, status) {
  await requestJson(`/api/items/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

async function deleteItem(id) {
  await requestJson(`/api/items/${id}`, {
    method: "DELETE"
  });
}

refs.itemForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);

  try {
    await createItem(formData);
    event.currentTarget.reset();
    document.getElementById("environment").value = "staging";
    setStatus("Item added.");
    await refreshBoard();
  } catch (error) {
    setStatus(error.message, true);
  }
});

refs.laneGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const { action, id, status } = button.dataset;

  try {
    if (action === "move") {
      await updateItem(id, status);
      setStatus(`Moved item to ${status}.`);
    }

    if (action === "delete") {
      await deleteItem(id);
      setStatus("Item deleted.");
    }

    await refreshBoard();
  } catch (error) {
    setStatus(error.message, true);
  }
});

refreshBoard().catch((error) => {
  setStatus(error.message, true);
});

if (window.location.protocol === "file:") {
  setStatus(`Using backend at ${apiBase}.`, false);
}
