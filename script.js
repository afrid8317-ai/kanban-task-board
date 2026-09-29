const STORAGE_KEY = "kanbanTaskBoard.tasks.v1";

const STATUS_LABELS = {
  todo: "To Do",
  progress: "In Progress",
  done: "Done"
};

const PRIORITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High"
};

const state = {
  tasks: loadTasks(),
  editingId: null,
  searchQuery: ""
};

const elements = {
  form: document.getElementById("taskForm"),
  titleInput: document.getElementById("taskTitle"),
  priorityInput: document.getElementById("taskPriority"),
  titleError: document.getElementById("titleError"),
  submitBtn: document.getElementById("submitBtn"),
  cancelEditBtn: document.getElementById("cancelEditBtn"),
  formMode: document.getElementById("formMode"),
  searchInput: document.getElementById("searchInput"),
  clearSearchBtn: document.getElementById("clearSearchBtn"),
  resultSummary: document.getElementById("resultSummary"),
  headerTaskCount: document.getElementById("headerTaskCount"),
  lists: {
    todo: document.getElementById("todoList"),
    progress: document.getElementById("progressList"),
    done: document.getElementById("doneList")
  },
  counts: {
    todo: document.getElementById("todoCount"),
    progress: document.getElementById("progressCount"),
    done: document.getElementById("doneCount")
  },
  template: document.getElementById("taskTemplate"),
  toast: document.getElementById("toast")
};

let toastTimer;

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(isValidStoredTask);
  } catch (error) {
    console.error("Failed to load tasks:", error);
    return [];
  }
}

function isValidStoredTask(task) {
  return Boolean(
    task &&
    typeof task.id === "string" &&
    typeof task.title === "string" &&
    ["todo", "progress", "done"].includes(task.status) &&
    ["low", "medium", "high"].includes(task.priority)
  );
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (error) {
    console.error("Failed to save tasks:", error);
    showToast("Could not save tasks.");
  }
}

function generateId() {
  if (window.crypto?.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTitle(title) {
  return title.trim().replace(/\s+/g, " ");
}

function validateTitle(title) {
  const normalized = normalizeTitle(title);

  if (!normalized) return "Task title is required.";
  if (normalized.length < 2) {
    return "Task title must be at least 2 characters.";
  }

  return "";
}

function clearValidation() {
  elements.titleError.textContent = "";
  elements.titleInput.removeAttribute("aria-invalid");
}

function pluralize(word, count) {
  return count === 1 ? word : `${word}s`;
}

function formatDate(timestamp) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function getVisibleTasks() {
  const query = state.searchQuery.toLowerCase().trim();

  if (!query) {
    return [...state.tasks];
  }

  return state.tasks.filter((task) => {
    return (
      task.title.toLowerCase().includes(query) ||
      PRIORITY_LABELS[task.priority].toLowerCase().includes(query) ||
      STATUS_LABELS[task.status].toLowerCase().includes(query)
    );
  });
}

function render() {
  const visibleTasks = getVisibleTasks();

  Object.values(elements.lists).forEach((list) => {
    list.innerHTML = "";
  });

  const filteredByStatus = {
    todo: visibleTasks.filter((task) => task.status === "todo"),
    progress: visibleTasks.filter((task) => task.status === "progress"),
    done: visibleTasks.filter((task) => task.status === "done")
  };

  Object.keys(elements.lists).forEach((status) => {
    const list = elements.lists[status];
    const tasks = filteredByStatus[status];

    if (tasks.length === 0) {
      list.appendChild(createEmptyState(status, Boolean(state.searchQuery)));
      return;
    }

    tasks.forEach((task) => {
      list.appendChild(createTaskCard(task));
    });
  });

  updateCounts();
  updateResultSummary(visibleTasks.length);
}

function createTaskCard(task) {
  const fragment = elements.template.content.cloneNode(true);
  const card = fragment.querySelector(".task-card");

  const priorityBadge = card.querySelector(".priority-badge");
  const title = card.querySelector(".task-title");
  const date = card.querySelector(".task-date");
  const statusSelect = card.querySelector(".status-select");
  const editButton = card.querySelector(".edit-btn");
  const deleteButton = card.querySelector(".delete-btn");

  card.dataset.id = task.id;
  card.setAttribute("draggable", "true");

  title.textContent = task.title;

  priorityBadge.textContent = PRIORITY_LABELS[task.priority];
  priorityBadge.classList.add(`priority-${task.priority}`);

  date.textContent = `Created ${formatDate(task.createdAt)}`;

  statusSelect.value = task.status;

  editButton.addEventListener("click", () => startEdit(task.id));
  deleteButton.addEventListener("click", () => deleteTask(task.id));

  statusSelect.addEventListener("change", (event) => {
    moveTask(task.id, event.target.value);
  });

  return fragment;
}

function createEmptyState(status, searching) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const heading = document.createElement("strong");
  const message = document.createElement("span");

  if (searching) {
    heading.textContent = "No matching tasks";
    message.textContent = "Try a different keyword or clear the search.";
  } else if (state.tasks.length === 0) {
    heading.textContent = "No tasks yet";
    message.textContent = "Use the form above to add your first task.";
  } else {
    heading.textContent = `No ${STATUS_LABELS[status]} tasks`;
    message.textContent = "Tasks moved here will appear in this column.";
  }

  wrapper.append(heading, message);
  return wrapper;
}

function addTask(title, priority) {
  const task = {
    id: generateId(),
    title: normalizeTitle(title),
    priority,
    status: "todo",
    createdAt: new Date().toISOString()
  };

  state.tasks.unshift(task);

  saveTasks();
  render();
  resetForm();

  showToast("Task added successfully.");
}

function startEdit(id) {
  const task = state.tasks.find((item) => item.id === id);

  if (!task) return;

  state.editingId = id;

  elements.titleInput.value = task.title;
  elements.priorityInput.value = task.priority;

  elements.submitBtn.textContent = "Save Changes";
  elements.cancelEditBtn.classList.remove("hidden");
  elements.formMode.textContent = "Editing task";

  clearValidation();
  elements.titleInput.focus();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function saveEditedTask() {
  const task = state.tasks.find((item) => item.id === state.editingId);

  if (!task) return;

  task.title = normalizeTitle(elements.titleInput.value);
  task.priority = elements.priorityInput.value;

  saveTasks();
  render();
  resetForm();

  showToast("Task updated.");
}

function cancelEdit() {
  resetForm();
  showToast("Edit cancelled.");
}

function resetForm() {
  state.editingId = null;

  elements.form.reset();
  elements.priorityInput.value = "medium";

  elements.submitBtn.textContent = "Add Task";
  elements.cancelEditBtn.classList.add("hidden");
  elements.formMode.textContent = "New task";

  clearValidation();
}

function deleteTask(id) {
  const task = state.tasks.find((item) => item.id === id);

  if (!task) return;

  const confirmed = window.confirm(`Delete “${task.title}”?`);

  if (!confirmed) return;

  state.tasks = state.tasks.filter((item) => item.id !== id);

  saveTasks();

  if (state.editingId === id) {
    resetForm();
  }

  render();
  showToast("Task deleted.");
}

function moveTask(id, newStatus) {
  const task = state.tasks.find((item) => item.id === id);

  if (!task || !STATUS_LABELS[newStatus]) {
    return;
  }

  task.status = newStatus;

  saveTasks();
  render();

  showToast(`Task moved to ${STATUS_LABELS[newStatus]}.`);
}

function handleSubmit(event) {
  event.preventDefault();

  const title = elements.titleInput.value;
  const error = validateTitle(title);

  if (error) {
    elements.titleError.textContent = error;
    elements.titleInput.setAttribute("aria-invalid", "true");
    elements.titleInput.focus();
    return;
  }

  clearValidation();

  if (state.editingId) {
    saveEditedTask();
  } else {
    addTask(title, elements.priorityInput.value);
  }
}

function updateCounts() {
  const totals = {
    todo: state.tasks.filter((task) => task.status === "todo").length,
    progress: state.tasks.filter((task) => task.status === "progress").length,
    done: state.tasks.filter((task) => task.status === "done").length
  };

  elements.counts.todo.textContent = totals.todo;
  elements.counts.progress.textContent = totals.progress;
  elements.counts.done.textContent = totals.done;

  elements.headerTaskCount.textContent = state.tasks.length;
}

function handleSearch(event) {
  state.searchQuery = event.target.value;
  render();
}

function clearSearch() {
  elements.searchInput.value = "";
  state.searchQuery = "";

  render();
  elements.searchInput.focus();
}

function updateResultSummary(visibleCount) {
  const total = state.tasks.length;

  if (!state.searchQuery) {
    elements.resultSummary.textContent =
      `Showing ${total} ${pluralize("task", total)}`;
    return;
  }

  elements.resultSummary.textContent =
    `Showing ${visibleCount} of ${total} ${pluralize("task", total)}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);

  elements.toast.textContent = message;
  elements.toast.classList.add("show");

  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("show");
  }, 2200);
}

function wireDropZones() {
  document.querySelectorAll(".column-dropzone").forEach((zone) => {
    zone.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("has-highlight");
    });

    zone.addEventListener("dragleave", () => {
      zone.classList.remove("has-highlight");
    });

    zone.addEventListener("drop", (event) => {
      event.preventDefault();

      zone.classList.remove("has-highlight");

      const taskId = event.dataTransfer.getData("text/plain");

      if (taskId) {
        moveTask(taskId, zone.dataset.status);
      }
    });
  });
}

document.addEventListener("dragstart", (event) => {
  const card = event.target.closest(".task-card");

  if (!card) return;

  event.dataTransfer.setData("text/plain", card.dataset.id);
  event.dataTransfer.effectAllowed = "move";
});

elements.form.addEventListener("submit", handleSubmit);
elements.cancelEditBtn.addEventListener("click", cancelEdit);
elements.searchInput.addEventListener("input", handleSearch);
elements.clearSearchBtn.addEventListener("click", clearSearch);

render();
wireDropZones();
