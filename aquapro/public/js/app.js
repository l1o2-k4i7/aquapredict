/* ============================================================
   Aqua Pro — Frontend SPA Application
   ============================================================ */

const API = '/api/projects';
const MONITOR_API = '/api/monitoring';
let currentProjectId = null;
let currentTestId = null;
let editingTestId = null;
let chartInstances = {};
let monitoringCharts = {};
let monitoringRows = [];
let monitoringInterval = null;
const MONITOR_TABLE_LIMIT = 500;
const MONITOR_POINT_WIDTH = 18;

const MONITOR_METRICS = [
  { key: 'pH', label: 'pH', chartId: 'monitorChart-pH', color: '#00d2ff', unit: '', threshold: { min: 6.5, max: 8.5 } },
  { key: 'dissolvedOxygen', label: 'DO', chartId: 'monitorChart-dissolvedOxygen', color: '#2ed573', unit: 'mg/L', threshold: { min: 5.0, max: 12 } },
  { key: 'turbidity', label: 'Turbidity', chartId: 'monitorChart-turbidity', color: '#ffa502', unit: 'NTU', threshold: { min: 5, max: 30 } },
  { key: 'temperature', label: 'Temperature', chartId: 'monitorChart-temperature', color: '#0abab5', unit: 'C', threshold: { min: 24, max: 30 } },
  { key: 'ammonia', label: 'Ammonia', chartId: 'monitorChart-ammonia', color: '#ff7f50', unit: 'mg/L', threshold: { min: 0, max: 0.5 } },
];

function isOutOfThreshold(metric, value) {
  if (value === undefined || value === null) return false;
  const { threshold } = metric;
  if (!threshold) return false;
  if (threshold.min !== null && threshold.min !== undefined && value < threshold.min) return true;
  if (threshold.max !== null && threshold.max !== undefined && value > threshold.max) return true;
  return false;
}

function getThresholdText(metric) {
  if (!metric.threshold) return 'No threshold';
  const { min, max } = metric.threshold;
  const unit = metric.unit ? ` ${metric.unit}` : '';
  if (min !== undefined && max !== undefined) return `Safe: ${min}-${max}${unit}`;
  if (min !== undefined) return `Safe: >= ${min}${unit}`;
  if (max !== undefined) return `Safe: <= ${max}${unit}`;
  return 'No threshold';
}

function updateMetricHeader(metric) {
  const canvas = document.getElementById(metric.chartId);
  if (!canvas) return;
  const card = canvas.closest('.monitor-chart-card');
  if (!card) return;
  const titleEl = card.querySelector('h4');
  if (!titleEl) return;

  let badge = titleEl.querySelector('.metric-threshold-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'metric-threshold-badge';
    titleEl.appendChild(badge);
  }
  badge.textContent = getThresholdText(metric);
}

function updateMetricReadout(metric, candle) {
  const canvas = document.getElementById(metric.chartId);
  if (!canvas) return;
  const card = canvas.closest('.monitor-chart-card');
  if (!card) return;

  let readout = card.querySelector('.metric-live-readout');
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'metric-live-readout';
    const titleEl = card.querySelector('h4');
    if (titleEl && titleEl.nextSibling) {
      card.insertBefore(readout, titleEl.nextSibling);
    } else {
      card.appendChild(readout);
    }
  }

  if (!candle) {
    readout.textContent = 'Time: -- | Value: --';
    readout.classList.remove('alert');
    return;
  }

  const timeText = formatRealtimeTick(candle.minute);
  const value = candle.close;
  const unit = metric.unit ? ` ${metric.unit}` : '';
  const isAlert = isOutOfThreshold(metric, value);

  readout.textContent = `Time: ${timeText} | Value: ${value}${unit}`;
  readout.classList.toggle('alert', isAlert);
}

function updateFloatingXAxisGuide(metric) {
  const canvas = document.getElementById(metric.chartId);
  if (!canvas) return;

  const scrollWrap = canvas.closest('.monitor-chart-scroll');
  const chart = monitoringCharts[metric.key];
  if (!scrollWrap || !chart) return;

  let guide = scrollWrap.querySelector('.monitor-x-float-guide');
  if (!guide) {
    guide = document.createElement('div');
    guide.className = 'monitor-x-float-guide';
    guide.innerHTML = '<span class="monitor-x-float-time">--</span>';
    scrollWrap.appendChild(guide);
  }

  const timeEl = guide.querySelector('.monitor-x-float-time');
  const candles = chart.$candles || [];
  if (!candles.length) {
    timeEl.textContent = '--';
    return;
  }

  const maxScroll = Math.max(scrollWrap.scrollWidth - scrollWrap.clientWidth, 0);
  const ratio = maxScroll > 0 ? (scrollWrap.scrollLeft / maxScroll) : 0;
  const idx = Math.max(0, Math.min(candles.length - 1, Math.round(ratio * (candles.length - 1))));
  timeEl.textContent = formatRealtimeTick(candles[idx].minute);
}

function updateStaticCardXAxis(metric) {
  const canvas = document.getElementById(metric.chartId);
  if (!canvas) return;

  const card = canvas.closest('.monitor-chart-card');
  const scrollWrap = canvas.closest('.monitor-chart-scroll');
  const chart = monitoringCharts[metric.key];
  if (!card || !scrollWrap || !chart) return;

  let axisEl = card.querySelector('.metric-static-x-axis');
  if (!axisEl) {
    axisEl = document.createElement('div');
    axisEl.className = 'metric-static-x-axis';
    axisEl.innerHTML = '<span class="left">--</span><span class="mid">--</span><span class="right">--</span>';
    card.appendChild(axisEl);
  }

  const candles = chart.$candles || [];
  if (!candles.length) return;

  const maxScroll = Math.max(scrollWrap.scrollWidth - scrollWrap.clientWidth, 0);
  const leftRatio = maxScroll > 0 ? (scrollWrap.scrollLeft / maxScroll) : 0;
  const rightRatio = maxScroll > 0 ? ((scrollWrap.scrollLeft + scrollWrap.clientWidth) / scrollWrap.scrollWidth) : 1;
  const midRatio = (leftRatio + rightRatio) / 2;

  const leftIndex = Math.max(0, Math.min(candles.length - 1, Math.round(leftRatio * (candles.length - 1))));
  const midIndex = Math.max(0, Math.min(candles.length - 1, Math.round(midRatio * (candles.length - 1))));
  const rightIndex = Math.max(0, Math.min(candles.length - 1, Math.round(rightRatio * (candles.length - 1))));

  axisEl.querySelector('.left').textContent = formatRealtimeTick(candles[leftIndex].minute);
  axisEl.querySelector('.mid').textContent = formatRealtimeTick(candles[midIndex].minute);
  axisEl.querySelector('.right').textContent = formatRealtimeTick(candles[rightIndex].minute);
}

// ---- Initialize ----
document.addEventListener('DOMContentLoaded', () => {
  initBubbles();
  initAuth();
  initNav();
  initForms();
  initTabs();

  // Check if already logged in
  if (sessionStorage.getItem('loggedIn') === 'true') {
    showApp();
  }

  window.addEventListener('popstate', () => {
    if (sessionStorage.getItem('loggedIn') === 'true') {
      const page = resolvePageFromPath();
      navigateTo(page, null, { updateUrl: false });
    }
  });
});

// ===================== AUTH =====================
function initAuth() {
  const loginForm = document.getElementById('loginForm');
  const togglePass = document.getElementById('togglePass');
  const logoutBtn = document.getElementById('logoutBtn');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPass').value;
    const errorEl = document.getElementById('loginError');
    errorEl.textContent = '';

    if (!username || !password) {
      errorEl.textContent = 'Please enter both username and password';
      return;
    }

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const json = await res.json();

      if (json.success) {
        sessionStorage.setItem('loggedIn', 'true');
        sessionStorage.setItem('userName', json.user.name);
        showApp();
      } else {
        errorEl.textContent = json.message || 'Invalid credentials';
        loginForm.classList.add('shake');
        setTimeout(() => loginForm.classList.remove('shake'), 500);
      }
    } catch (err) {
      errorEl.textContent = 'Server error. Please try again.';
    }
  });

  togglePass.addEventListener('click', () => {
    const passInput = document.getElementById('loginPass');
    const icon = togglePass.querySelector('i');
    if (passInput.type === 'password') {
      passInput.type = 'text';
      icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
      passInput.type = 'password';
      icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
  });

  logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    sessionStorage.removeItem('loggedIn');
    sessionStorage.removeItem('userName');
    hideApp();
  });
}

function showApp() {
  document.getElementById('loginOverlay').classList.remove('active');
  document.body.classList.remove('app-hidden');
  const page = resolvePageFromPath();
  navigateTo(page, null, { updateUrl: false });
}

function hideApp() {
  document.getElementById('loginOverlay').classList.add('active');
  document.body.classList.add('app-hidden');
  document.getElementById('loginError').textContent = '';
}

// ===================== NAVIGATION =====================
function navigateTo(page, data, options = {}) {
  if (page !== 'monitoring') {
    stopMonitoringAutoRefresh();
    destroyMonitoringCharts();
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));

  const el = document.getElementById(`page-${page}`);
  if (el) {
    el.classList.add('active');
    el.style.animation = 'none';
    el.offsetHeight; // reflow
    el.style.animation = '';
  }

  const navLink = document.querySelector(`.nav-link[data-page="${page}"]`);
  if (navLink) navLink.classList.add('active');

  // Close mobile menu
  document.querySelector('.nav').classList.remove('open');

  switch (page) {
    case 'home': loadHome(); break;
    case 'projects': loadProjects(); break;
    case 'monitoring': loadMonitoringPage(); break;
    case 'create': resetCreateForm(); break;
    case 'create-test': initCreateTestPage(); break;
    case 'dashboard': loadDashboard(data); break;
    case 'test-form': loadTestForm(data); break;
    case 'test-view': loadTestView(data); break;
  }

  if (options.updateUrl !== false) {
    updatePathForPage(page);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePathForPage(page) {
  let nextPath = '/';
  if (page === 'projects' || page === 'create' || page === 'dashboard' || page === 'test-form' || page === 'test-view') {
    nextPath = '/prediction';
  }
  if (page === 'monitoring') {
    nextPath = '/monitoring';
  }
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath);
  }
}

function resolvePageFromPath() {
  const path = (window.location.pathname || '/').toLowerCase();
  if (path.startsWith('/monitoring')) return 'monitoring';
  if (path.startsWith('/prediction')) return 'projects';
  return 'home';
}

// ===================== BUBBLE ANIMATION =====================
function initBubbles() {
  const container = document.getElementById('bubblesContainer');
  const count = 20;
  for (let i = 0; i < count; i++) {
    const bubble = document.createElement('div');
    bubble.classList.add('bubble');
    const size = Math.random() * 50 + 15;
    bubble.style.width = size + 'px';
    bubble.style.height = size + 'px';
    bubble.style.left = Math.random() * 100 + '%';
    bubble.style.animationDuration = (Math.random() * 12 + 8) + 's';
    bubble.style.animationDelay = (Math.random() * 10) + 's';
    container.appendChild(bubble);
  }
}

// ===================== NAV =====================
function initNav() {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(link.dataset.page);
    });
  });
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.querySelector('.nav').classList.toggle('open');
  });
}

// ===================== HOME =====================
async function loadHome() {
  try {
    const res = await fetch(API);
    const json = await res.json();
    if (json.success) {
      const projects = json.data;
      document.getElementById('statProjects').textContent = projects.length;
      let totalTests = 0, totalSpecies = new Set();
      projects.forEach(p => {
        totalTests += p.tests.length;
        p.tests.forEach(t => {
          if (t.fishPrediction && t.fishPrediction.predictedSpecies) {
            t.fishPrediction.predictedSpecies.forEach(s => totalSpecies.add(s));
          }
        });
      });
      document.getElementById('statTests').textContent = totalTests;
      document.getElementById('statSpecies').textContent = totalSpecies.size;
      animateCounters();
    }
  } catch (err) { console.error(err); }
}

function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.textContent) || 0;
    el.textContent = '0';
    let current = 0;
    const step = Math.max(1, Math.ceil(target / 30));
    const interval = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(interval); }
      el.textContent = current;
    }, 40);
  });
}
let allProjectsList = [];

// ===================== PROJECTS =====================
async function loadProjects() {
  showLoading();
  try {
    const res = await fetch(API);
    const json = await res.json();
    hideLoading();
    if (json.success) {
      allProjectsList = json.data;
      renderProjects(allProjectsList);
    }
  } catch (err) { hideLoading(); showToast('Failed to load projects', 'error'); }
}

function renderProjects(projects) {
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('emptyState');
  if (projects.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    grid.innerHTML = projects.map((p, i) => `
      <div class="project-card glass-card" style="animation-delay:${i * 0.08}s" onclick="navigateTo('dashboard', '${p._id}')">
        <h3><i class="fas fa-fish"></i> ${escHtml(p.name)}</h3>
        <div class="info"><i class="fas fa-phone"></i> ${escHtml(p.phoneNumber)}</div>
        <div class="info"><i class="fas fa-envelope"></i> ${escHtml(p.email)}</div>
        <div class="info"><i class="fas fa-map-marker-alt"></i> ${escHtml(p.place)}</div>
        <div class="card-footer">
          <span class="test-count"><i class="fas fa-flask"></i> ${p.tests.length} / 10 Tests</span>
          <div class="card-actions">
            <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteProject('${p._id}')"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    `).join('');
  }
}

function filterProjects() {
  const query = document.getElementById('projectSearch').value.toLowerCase();
  const filtered = allProjectsList.filter(p => p.name.toLowerCase().includes(query));
  renderProjects(filtered);
}

async function deleteProject(id) {
  showConfirm('Delete Project', 'Are you sure you want to delete this project and all its tests?', async () => {
    showLoading();
    try {
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      const json = await res.json();
      hideLoading();
      if (json.success) {
        showToast('Project deleted successfully', 'success');
        loadProjects();
      } else {
        showToast(json.message, 'error');
      }
    } catch (err) { hideLoading(); showToast('Failed to delete', 'error'); }
  });
}

// ===================== CREATE PROJECT =====================
function initForms() {
  document.getElementById('createProjectForm').addEventListener('submit', handleCreateProject);
  document.getElementById('testForm').addEventListener('submit', handleTestSubmit);
  document.getElementById('testFormBack').addEventListener('click', () => navigateTo('dashboard', currentProjectId));
  document.getElementById('testViewBack').addEventListener('click', () => navigateTo('dashboard', currentProjectId));
  if(document.getElementById('btnToggleMap')) {
    document.getElementById('btnToggleMap').addEventListener('click', toggleCreateMap);
  }
}

let createMapInstance = null;
let createMapMarker = null;

function toggleCreateMap() {
  const mapContainer = document.getElementById('mapContainer');
  if (mapContainer.style.display === 'none') {
    mapContainer.style.display = 'block';
    if (!createMapInstance) {
      createMapInstance = L.map('mapContainer').setView([20.5937, 78.9629], 5); // Default to India roughly
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
      }).addTo(createMapInstance);
      
      createMapInstance.on('click', function(e) {
        if (createMapMarker) {
          createMapInstance.removeLayer(createMapMarker);
        }
        createMapMarker = L.marker(e.latlng).addTo(createMapInstance);
        
        // Reverse geocoding using Nominatim
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}`)
          .then(res => res.json())
          .then(data => {
             document.getElementById('projPlace').value = data.display_name || `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
          }).catch(() => {
             document.getElementById('projPlace').value = `${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`;
          });
      });
    }
    setTimeout(() => createMapInstance.invalidateSize(), 150);
  } else {
    mapContainer.style.display = 'none';
  }
}

function resetCreateForm() {
  document.getElementById('createProjectForm').reset();
  ['errName', 'errPhone', 'errEmail', 'errPlace'].forEach(id => document.getElementById(id).textContent = '');
}

async function handleCreateProject(e) {
  e.preventDefault();
  const name = document.getElementById('projName').value.trim();
  const phoneNumber = document.getElementById('projPhone').value.trim();
  const email = document.getElementById('projEmail').value.trim();
  const place = document.getElementById('projPlace').value.trim();

  // Client validation
  let valid = true;
  if (!name) { document.getElementById('errName').textContent = 'Name is required'; valid = false; } else { document.getElementById('errName').textContent = ''; }
  if (!phoneNumber) { document.getElementById('errPhone').textContent = 'Phone number is required'; valid = false; } else { document.getElementById('errPhone').textContent = ''; }
  if (!email) { document.getElementById('errEmail').textContent = 'Email is required'; valid = false; }
  else if (!/^\S+@\S+\.\S+$/.test(email)) { document.getElementById('errEmail').textContent = 'Invalid email format'; valid = false; }
  else { document.getElementById('errEmail').textContent = ''; }
  if (!place) { document.getElementById('errPlace').textContent = 'Place is required'; valid = false; } else { document.getElementById('errPlace').textContent = ''; }

  if (!valid) return;

  showLoading();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phoneNumber, email, place })
    });
    const json = await res.json();
    hideLoading();
    if (json.success) {
      showToast('Project created successfully!', 'success');
      navigateTo('dashboard', json.data._id);
    } else {
      showToast(json.message, 'error');
      if (json.message.toLowerCase().includes('phone')) {
        document.getElementById('errPhone').textContent = json.message;
      }
    }
  } catch (err) { hideLoading(); showToast('Failed to create project', 'error'); }
}

// ===================== DASHBOARD =====================
async function loadDashboard(projectId) {
  if (projectId) currentProjectId = projectId;
  showLoading();
  try {
    const res = await fetch(`${API}/${currentProjectId}`);
    const json = await res.json();
    hideLoading();
    if (!json.success) { showToast('Project not found', 'error'); navigateTo('projects'); return; }

    const p = json.data;
    document.getElementById('dashboardHeader').innerHTML = `
      <div class="project-info">
        <h2><i class="fas fa-fish"></i> ${escHtml(p.name)}</h2>
        <div class="detail"><i class="fas fa-phone"></i> ${escHtml(p.phoneNumber)}</div>
        <div class="detail"><i class="fas fa-envelope"></i> ${escHtml(p.email)}</div>
        <div class="detail"><i class="fas fa-map-marker-alt"></i> ${escHtml(p.place)}</div>
        <div class="detail"><i class="fas fa-calendar"></i> Created: ${new Date(p.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="project-actions">
        <button class="btn btn-danger btn-sm" onclick="deleteProject('${p._id}')"><i class="fas fa-trash"></i> Delete Project</button>
      </div>
    `;

    const grid = document.getElementById('testsGrid');

    if (p.tests.length === 0) {
      grid.innerHTML = '<p style="color:var(--text-muted); padding: 20px;">No tests yet. Use "Create Test" in the navigation to add one.</p>';
    } else {
      grid.innerHTML = p.tests.map((t, i) => {
        const cs = t.stackingData?.cultureSystem || 'N/A';
        const st = t.stackingData?.status || 'N/A';
        return `
          <div class="test-card glass-card" style="animation: fadeSlideIn 0.4s ease ${i * 0.08}s backwards;">
            <div class="test-num">Test #${i + 1}</div>
            <div class="test-summary">
              <div><strong>Culture:</strong> ${escHtml(cs)}</div>
              <div><strong>Status:</strong> ${escHtml(st)}</div>
              <div><strong>pH:</strong> ${t.waterParameters?.ph ?? 'N/A'} | <strong>Temp:</strong> ${t.waterParameters?.temperature ?? 'N/A'}°C</div>
            </div>
            <div class="test-actions">
              <button class="btn btn-primary btn-sm" onclick="navigateTo('test-view', '${t._id}')"><i class="fas fa-eye"></i> View</button>
              <button class="btn btn-secondary btn-sm" onclick="editTest('${t._id}')"><i class="fas fa-edit"></i> Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteTest('${t._id}')"><i class="fas fa-trash"></i></button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) { hideLoading(); showToast('Failed to load dashboard', 'error'); }
}

// ===================== TEST FORM (ADD / EDIT) =====================
async function loadTestForm(testId) {
  document.getElementById('testForm').reset();
  if (editingTestId) {
    document.getElementById('testFormTitle').innerHTML = '<i class="fas fa-edit"></i> Edit Test';
    document.getElementById('testSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Update Test';
    // Populate form
    showLoading();
    try {
      const res = await fetch(`${API}/${currentProjectId}/tests/${editingTestId}`);
      const json = await res.json();
      hideLoading();
      if (json.success) {
        const t = json.data;
        document.getElementById('wpPh').value = t.waterParameters?.ph || '';
        document.getElementById('wpDO').value = t.waterParameters?.dissolvedOxygen || '';
        document.getElementById('wpTurbidity').value = t.waterParameters?.turbidity || '';
        document.getElementById('wpAmmonia').value = t.waterParameters?.ammonia || '';
        document.getElementById('wpTemp').value = t.waterParameters?.temperature || '';
        document.getElementById('fpPredicted').value = (t.fishPrediction?.predictedSpecies || []).join(', ');
        document.getElementById('fpRemoved').value = (t.fishPrediction?.removedPredators || []).join(', ');
        document.getElementById('fpSurface').value = (t.fishPrediction?.groupedSpecies?.surface || []).join(', ');
        document.getElementById('fpMiddle').value = (t.fishPrediction?.groupedSpecies?.middle || []).join(', ');
        document.getElementById('fpBottom').value = (t.fishPrediction?.groupedSpecies?.bottom || []).join(', ');
        document.getElementById('fpVegetation').value = (t.fishPrediction?.groupedSpecies?.vegetation || []).join(', ');
        document.getElementById('sdCulture').value = t.stackingData?.cultureSystem || '';
        document.getElementById('sdPriority').value = t.stackingData?.priority || '';
        document.getElementById('sdStatus').value = t.stackingData?.status || '';
        const ratioObj = t.stackingData?.stockingRatio || {};
        document.getElementById('sdRatio').value = (typeof ratioObj === 'object' && !Array.isArray(ratioObj))
          ? Object.entries(ratioObj).map(([k, v]) => `${k}:${v}`).join(', ')
          : '';
      }
    } catch (err) { hideLoading(); }
  } else {
    document.getElementById('testFormTitle').innerHTML = '<i class="fas fa-flask"></i> Add New Test';
    document.getElementById('testSubmitBtn').innerHTML = '<i class="fas fa-save"></i> Save Test';
  }
}

function editTest(testId) {
  editingTestId = testId;
  navigateTo('test-form', testId);
}

function parseCSV(val) {
  return val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
}

function parseStockingRatio(val) {
  const obj = {};
  if (!val) return obj;
  val.split(',').forEach(item => {
    const trimmed = item.trim();
    if (!trimmed) return;
    const idx = trimmed.lastIndexOf(':');
    if (idx > 0) {
      const species = trimmed.substring(0, idx).trim();
      const value = parseFloat(trimmed.substring(idx + 1).trim()) || 0;
      if (species) obj[species] = value;
    }
  });
  return obj;
}

async function handleTestSubmit(e) {
  e.preventDefault();
  const data = {
    waterParameters: {
      ph: parseFloat(document.getElementById('wpPh').value) || 0,
      dissolvedOxygen: parseFloat(document.getElementById('wpDO').value) || 0,
      turbidity: parseFloat(document.getElementById('wpTurbidity').value) || 0,
      ammonia: parseFloat(document.getElementById('wpAmmonia').value) || 0,
      temperature: parseFloat(document.getElementById('wpTemp').value) || 0,
    },
    fishPrediction: {
      predictedSpecies: parseCSV(document.getElementById('fpPredicted').value),
      removedPredators: parseCSV(document.getElementById('fpRemoved').value),
      groupedSpecies: {
        surface: parseCSV(document.getElementById('fpSurface').value),
        middle: parseCSV(document.getElementById('fpMiddle').value),
        bottom: parseCSV(document.getElementById('fpBottom').value),
        vegetation: parseCSV(document.getElementById('fpVegetation').value),
      }
    },
    stackingData: {
      cultureSystem: document.getElementById('sdCulture').value,
      priority: document.getElementById('sdPriority').value,
      status: document.getElementById('sdStatus').value,
      stockingRatio: parseStockingRatio(document.getElementById('sdRatio').value),
    }
  };

  showLoading();
  try {
    let res;
    if (editingTestId) {
      res = await fetch(`${API}/${currentProjectId}/tests/${editingTestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } else {
      res = await fetch(`${API}/${currentProjectId}/tests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    }
    const json = await res.json();
    hideLoading();
    if (json.success) {
      showToast(editingTestId ? 'Test updated!' : 'Test added successfully!', 'success');
      editingTestId = null;
      navigateTo('dashboard', currentProjectId);
    } else {
      showToast(json.message, 'error');
    }
  } catch (err) { hideLoading(); showToast('Failed to save test', 'error'); }
}

async function deleteTest(testId) {
  showConfirm('Delete Test', 'Are you sure you want to delete this test?', async () => {
    showLoading();
    try {
      const res = await fetch(`${API}/${currentProjectId}/tests/${testId}`, { method: 'DELETE' });
      const json = await res.json();
      hideLoading();
      if (json.success) {
        showToast('Test deleted', 'success');
        loadDashboard();
      } else {
        showToast(json.message, 'error');
      }
    } catch (err) { hideLoading(); showToast('Failed to delete test', 'error'); }
  });
}

// ===================== TEST VIEW (4 PAGES) =====================
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

async function loadTestView(testId) {
  if (testId) currentTestId = testId;
  // Reset to first tab
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="water"]').classList.add('active');
  document.getElementById('tab-water').classList.add('active');

  showLoading();
  try {
    const res = await fetch(`${API}/${currentProjectId}/tests/${currentTestId}`);
    const json = await res.json();
    hideLoading();
    if (!json.success) { showToast('Test not found', 'error'); return; }

    const t = json.data;
    renderWaterParams(t.waterParameters);
    renderFishPrediction(t.fishPrediction);
    renderStackingData(t.stackingData);
    renderReport(t);
  } catch (err) { hideLoading(); showToast('Failed to load test', 'error'); }
}

// ---- PAGE 1: Water Parameters ----
function renderWaterParams(wp) {
  // Destroy old charts
  Object.keys(chartInstances).forEach(k => { if (k.startsWith('gauge-')) { chartInstances[k].destroy(); delete chartInstances[k]; } });

  const params = [
    { key: 'ph', label: 'pH Level', value: wp.ph, max: 14, unit: 'pH', color: '#00d2ff' },
    { key: 'dissolvedOxygen', label: 'Dissolved Oxygen', value: wp.dissolvedOxygen, max: 20, unit: 'mg/L', color: '#2ed573' },
    { key: 'turbidity', label: 'Turbidity', value: wp.turbidity, max: 100, unit: 'NTU', color: '#ffa502' },
    { key: 'ammonia', label: 'Ammonia', value: wp.ammonia, max: 5, unit: 'mg/L', color: '#ff4757' },
    { key: 'temperature', label: 'Temperature', value: wp.temperature, max: 50, unit: '°C', color: '#0abab5' },
  ];

  const container = document.getElementById('waterGauges');
  container.innerHTML = params.map(p => `
    <div class="gauge-card glass-card">
      <div class="gauge-circle">
        <canvas id="gauge-${p.key}"></canvas>
        <div class="gauge-value">${p.value}</div>
      </div>
      <div class="gauge-label">${p.label}</div>
      <div class="gauge-unit">${p.unit}</div>
    </div>
  `).join('');

  params.forEach(p => {
    const ctx = document.getElementById(`gauge-${p.key}`).getContext('2d');
    const pct = Math.min((p.value / p.max) * 100, 100);
    chartInstances[`gauge-${p.key}`] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [pct, 100 - pct],
          backgroundColor: [p.color, 'rgba(255,255,255,0.06)'],
          borderWidth: 0,
          cutout: '78%',
        }]
      },
      options: {
        responsive: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        animation: { animateRotate: true, duration: 1200 },
      }
    });
  });
}

// ---- PAGE 2: Fish Prediction ----
function renderFishPrediction(fp) {
  const container = document.getElementById('fishSection');
  container.innerHTML = `
    <div class="fish-subsection">
      <h4><i class="fas fa-star"></i> Predicted Species</h4>
      <div class="species-tags">
        ${(fp.predictedSpecies || []).map(s => `<span class="species-tag tag-predicted">${escHtml(s)}</span>`).join('') || '<span style="color:var(--text-muted)">No species predicted</span>'}
      </div>
    </div>
    <div class="fish-subsection">
      <h4><i class="fas fa-skull-crossbones"></i> Removed Predators</h4>
      <div class="species-tags">
        ${(fp.removedPredators || []).map(s => `<span class="species-tag tag-predator"><i class="fas fa-times-circle"></i> ${escHtml(s)}</span>`).join('') || '<span style="color:var(--text-muted)">None</span>'}
      </div>
    </div>
    <div class="fish-subsection">
      <h4><i class="fas fa-layer-group"></i> Grouped Species</h4>
      <div class="grouped-species">
        ${renderGroupCol('Surface', fp.groupedSpecies?.surface, 'tag-surface', 'fas fa-arrow-up')}
        ${renderGroupCol('Middle', fp.groupedSpecies?.middle, 'tag-middle', 'fas fa-arrows-alt-h')}
        ${renderGroupCol('Bottom', fp.groupedSpecies?.bottom, 'tag-bottom', 'fas fa-arrow-down')}
        ${renderGroupCol('Vegetation', fp.groupedSpecies?.vegetation, 'tag-vegetation', 'fas fa-leaf')}
      </div>
    </div>
  `;
}

function renderGroupCol(title, species, tagClass, icon) {
  return `
    <div class="group-col glass-card">
      <h5><i class="${icon}"></i> ${title}</h5>
      <div class="species-tags">
        ${(species || []).map(s => `<span class="species-tag ${tagClass}">${escHtml(s)}</span>`).join('') || '<span style="color:var(--text-muted)">—</span>'}
      </div>
    </div>
  `;
}

// ---- PAGE 3: Stacking Data ----
function renderStackingData(sd) {
  if (chartInstances['stackingPie']) { chartInstances['stackingPie'].destroy(); delete chartInstances['stackingPie']; }

  const ratioObj = (sd.stockingRatio && typeof sd.stockingRatio === 'object' && !Array.isArray(sd.stockingRatio)) ? sd.stockingRatio : {};
  const speciesNames = Object.keys(ratioObj);
  const speciesValues = Object.values(ratioObj).map(v => parseFloat(v) || 0);
  const priorityClass = sd.priority === 'High' ? 'priority-high' : sd.priority === 'Medium' ? 'priority-medium' : 'priority-low';
  const statusClass = sd.status === 'Completed' ? 'status-completed' : sd.status === 'In Progress' ? 'status-progress' : sd.status === 'Pending' ? 'status-pending' : 'status-cancelled';
  const colors = ['#00d2ff', '#2ed573', '#ffa502', '#ff4757', '#0abab5', '#a29bfe', '#fd79a8', '#fdcb6e', '#6c5ce7', '#00cec9'];

  const container = document.getElementById('stackingSection');
  container.innerHTML = `
    <div class="stacking-cards">
      <div class="stack-card glass-card">
        <div class="stack-label">Culture System</div>
        <div class="stack-value">${escHtml(sd.cultureSystem || 'N/A')}</div>
      </div>
      <div class="stack-card glass-card">
        <div class="stack-label">Priority</div>
        <div class="stack-value ${priorityClass}">${escHtml(sd.priority || 'N/A')}</div>
      </div>
      <div class="stack-card glass-card">
        <div class="stack-label">Status</div>
        <div class="stack-value ${statusClass}">${escHtml(sd.status || 'N/A')}</div>
      </div>
      <div class="stack-card glass-card">
        <div class="stack-label">Total Species</div>
        <div class="stack-value">${speciesNames.length}</div>
      </div>
    </div>

    <!-- Species Ratio Breakdown Table -->
    ${speciesNames.length > 0 ? `
    <div class="glass-card" style="padding:24px; margin-bottom:20px;">
      <h4 style="color:var(--accent-aqua); margin-bottom:16px; display:flex; align-items:center; gap:8px;"><i class="fas fa-list"></i> Stocking Ratio Breakdown</h4>
      <table style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid var(--glass-border);">
            <th style="text-align:left; padding:10px 12px; color:var(--text-secondary); font-size:0.82rem; text-transform:uppercase; letter-spacing:1px;">Species</th>
            <th style="text-align:right; padding:10px 12px; color:var(--text-secondary); font-size:0.82rem; text-transform:uppercase; letter-spacing:1px;">Ratio</th>
            <th style="text-align:left; padding:10px 12px; color:var(--text-secondary); font-size:0.82rem; text-transform:uppercase; letter-spacing:1px; width:50%;">Distribution</th>
          </tr>
        </thead>
        <tbody>
          ${speciesNames.map((name, idx) => {
            const val = speciesValues[idx];
            const color = colors[idx % colors.length];
            const maxVal = Math.max(...speciesValues, 1);
            const barPct = (val / maxVal) * 100;
            return `<tr style="border-bottom:1px solid var(--glass-border);">
              <td style="padding:10px 12px; font-weight:500; color:var(--text-primary);">${escHtml(name)}</td>
              <td style="padding:10px 12px; text-align:right; font-weight:600; color:${color};">${val}%</td>
              <td style="padding:10px 12px;"><div style="background:rgba(255,255,255,0.06); border-radius:6px; overflow:hidden; height:22px;"><div style="height:100%; width:${barPct}%; background:${color}; border-radius:6px; transition:width 1s ease;"></div></div></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>` : ''}

    <div class="stacking-chart-container glass-card">
      <h4 style="text-align:center; color:var(--accent-aqua); margin-bottom:16px;"><i class="fas fa-chart-pie"></i> Stocking Ratio</h4>
      <canvas id="stackingPieChart"></canvas>
    </div>
  `;

  // Pie chart with species names as labels and values as percentages
  if (speciesValues.length > 0) {
    const ctx = document.getElementById('stackingPieChart').getContext('2d');
    chartInstances['stackingPie'] = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: speciesNames,
        datasets: [{
          data: speciesValues,
          backgroundColor: colors.slice(0, speciesValues.length),
          borderWidth: 2,
          borderColor: 'rgba(15,32,39,0.8)'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', padding: 16, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return `${ctx.label}: ${ctx.parsed}%`; }
            }
          }
        },
        animation: { animateScale: true, duration: 1000 },
      }
    });
  }
}

// ---- PAGE 4: Final Report ----
async function renderReport(t) {
  if (chartInstances['reportBar']) { chartInstances['reportBar'].destroy(); delete chartInstances['reportBar']; }
  if (chartInstances['reportPie']) { chartInstances['reportPie'].destroy(); delete chartInstances['reportPie']; }

  const wp = t.waterParameters || {};
  const fp = t.fishPrediction || {};
  const sd = t.stackingData || {};

  // Populate the print-only header
  try {
    const projRes = await fetch(`${API}/${currentProjectId}`);
    const projJson = await projRes.json();
    if (projJson.success) {
      const p = projJson.data;
      document.getElementById('printProjectName').textContent = `Project: ${p.name} — ${p.place}`;
      document.getElementById('printTestInfo').textContent = `Culture System: ${sd.cultureSystem || 'N/A'} | Priority: ${sd.priority || 'N/A'} | Status: ${sd.status || 'N/A'}`;
    }
  } catch(e) { /* silently fail */ }
  document.getElementById('printDate').textContent = `Report generated: ${new Date().toLocaleString()}`;

  // Build stocking ratio data for both the chart and the print table
  const ratioObj = (sd.stockingRatio && typeof sd.stockingRatio === 'object' && !Array.isArray(sd.stockingRatio)) ? sd.stockingRatio : {};
  const rptLabels = Object.keys(ratioObj);
  const rptValues = Object.values(ratioObj).map(v => parseFloat(v) || 0);
  const rptTotal = rptValues.reduce((a, b) => a + b, 0);

  const container = document.getElementById('reportSection');
  container.innerHTML = `
    <div class="report-card glass-card">
      <h4><i class="fas fa-tint"></i> Water Parameters Overview</h4>
      <div class="report-grid">
        <div class="report-item"><div class="r-label">pH</div><div class="r-value">${wp.ph ?? 'N/A'}</div></div>
        <div class="report-item"><div class="r-label">Dissolved O₂</div><div class="r-value">${wp.dissolvedOxygen ?? 'N/A'} mg/L</div></div>
        <div class="report-item"><div class="r-label">Turbidity</div><div class="r-value">${wp.turbidity ?? 'N/A'} NTU</div></div>
        <div class="report-item"><div class="r-label">Ammonia</div><div class="r-value">${wp.ammonia ?? 'N/A'} mg/L</div></div>
        <div class="report-item"><div class="r-label">Temperature</div><div class="r-value">${wp.temperature ?? 'N/A'}°C</div></div>
      </div>
    </div>

    <div class="report-card glass-card">
      <h4><i class="fas fa-fish"></i> Species Prediction Summary</h4>
      <div class="report-grid">
        <div class="report-item"><div class="r-label">Predicted Species</div><div class="r-value">${(fp.predictedSpecies || []).length}</div></div>
        <div class="report-item"><div class="r-label">Removed Predators</div><div class="r-value">${(fp.removedPredators || []).length}</div></div>
        <div class="report-item"><div class="r-label">Surface</div><div class="r-value">${(fp.groupedSpecies?.surface || []).join(', ') || 'None'}</div></div>
        <div class="report-item"><div class="r-label">Middle</div><div class="r-value">${(fp.groupedSpecies?.middle || []).join(', ') || 'None'}</div></div>
        <div class="report-item"><div class="r-label">Bottom</div><div class="r-value">${(fp.groupedSpecies?.bottom || []).join(', ') || 'None'}</div></div>
        <div class="report-item"><div class="r-label">Vegetation</div><div class="r-value">${(fp.groupedSpecies?.vegetation || []).join(', ') || 'None'}</div></div>
      </div>
    </div>

    <div class="report-card glass-card">
      <h4><i class="fas fa-layer-group"></i> Stacking Data Summary</h4>
      <div class="report-grid">
        <div class="report-item"><div class="r-label">Culture System</div><div class="r-value">${escHtml(sd.cultureSystem || 'N/A')}</div></div>
        <div class="report-item"><div class="r-label">Priority</div><div class="r-value">${escHtml(sd.priority || 'N/A')}</div></div>
        <div class="report-item"><div class="r-label">Status</div><div class="r-value">${escHtml(sd.status || 'N/A')}</div></div>
      </div>
      ${rptLabels.length > 0 ? `
      <table style="width:100%; border-collapse:collapse; margin-top:14px;">
        <thead>
          <tr style="border-bottom:2px solid rgba(0,119,182,0.3);">
            <th style="text-align:left; padding:8px 12px; font-size:0.85rem; color:var(--accent-aqua);">Species</th>
            <th style="text-align:right; padding:8px 12px; font-size:0.85rem; color:var(--accent-aqua);">Ratio (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rptLabels.map((name, idx) => `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
              <td style="padding:8px 12px; font-weight:500;">${escHtml(name)}</td>
              <td style="text-align:right; padding:8px 12px; font-weight:600;">${rptValues[idx]}%</td>
            </tr>
          `).join('')}
          <tr style="border-top:2px solid rgba(0,119,182,0.3);">
            <td style="padding:8px 12px; font-weight:700;">Total</td>
            <td style="text-align:right; padding:8px 12px; font-weight:700;">${rptTotal}%</td>
          </tr>
        </tbody>
      </table>` : ''}
    </div>

    <div class="report-chart-row">
      <div class="report-chart-card glass-card">
        <h4><i class="fas fa-chart-bar"></i> Water Parameters Chart</h4>
        <canvas id="reportBarChart"></canvas>
      </div>
      <div class="report-chart-card glass-card">
        <h4><i class="fas fa-chart-pie"></i> Stocking Ratio Chart</h4>
        <canvas id="reportPieChart"></canvas>
      </div>
    </div>

    <div class="final-decision-card glass-card">
      <h4><i class="fas fa-award"></i> Final Decision</h4>
      <div class="decision-text">
        <strong>Culture System:</strong> ${escHtml(sd.cultureSystem || 'N/A')} &nbsp;|&nbsp;
        <strong>Priority:</strong> ${escHtml(sd.priority || 'N/A')} &nbsp;|&nbsp;
        <strong>Status:</strong> ${escHtml(sd.status || 'N/A')}
      </div>
      <p style="margin-top:12px; color: var(--accent-cyan); font-size: 1.05rem;">
        ${getDecisionSummary(wp, fp, sd)}
      </p>
    </div>

    <div style="text-align:center; margin-top:24px;">
      <button class="btn btn-primary" onclick="window.print()"><i class="fas fa-print"></i> Print Report</button>
    </div>
  `;

  // Bar chart
  const barCtx = document.getElementById('reportBarChart').getContext('2d');
  chartInstances['reportBar'] = new Chart(barCtx, {
    type: 'bar',
    data: {
      labels: ['pH', 'DO (mg/L)', 'Turbidity', 'Ammonia', 'Temp (°C)'],
      datasets: [{
        label: 'Value',
        data: [wp.ph || 0, wp.dissolvedOxygen || 0, wp.turbidity || 0, wp.ammonia || 0, wp.temperature || 0],
        backgroundColor: ['#0077b6', '#2ed573', '#e67e22', '#e74c3c', '#0abab5'],
        borderRadius: 6,
        borderColor: ['#005f8a', '#27ae60', '#d35400', '#c0392b', '#088f8a'],
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        x: { ticks: { color: 'rgba(255,255,255,0.5)' }, grid: { display: false } }
      },
      animation: { duration: 1000 },
    }
  });

  // Pie chart — species-labeled stocking ratio
  if (rptValues.length > 0) {
    const pieCtx = document.getElementById('reportPieChart').getContext('2d');
    chartInstances['reportPie'] = new Chart(pieCtx, {
      type: 'pie',
      data: {
        labels: rptLabels,
        datasets: [{
          data: rptValues,
          backgroundColor: ['#0077b6', '#2ed573', '#e67e22', '#e74c3c', '#0abab5', '#8e44ad', '#e84393', '#f1c40f'],
          borderWidth: 2,
          borderColor: '#fff',
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', padding: 14, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: function(ctx) { return `${ctx.label}: ${ctx.parsed}%`; }
            }
          }
        },
        animation: { animateScale: true, duration: 1000 },
      }
    });
  }
}

function getDecisionSummary(wp, fp, sd) {
  const species = (fp.predictedSpecies || []).length;
  const system = sd.cultureSystem || 'Unknown';
  const priority = sd.priority || 'Medium';

  if (wp.ph >= 6.5 && wp.ph <= 8.5 && wp.dissolvedOxygen >= 5) {
    return `✅ Water quality is optimal for ${system} with ${species} species. Recommended to proceed with ${priority} priority.`;
  } else if (wp.ph > 0) {
    return `⚠️ Water quality requires attention. pH: ${wp.ph}, DO: ${wp.dissolvedOxygen} mg/L. Review parameters before proceeding with ${system}.`;
  }
  return `📊 ${system} system configured with ${species} species at ${priority} priority.`;
}

// ===================== MONITORING PAGE =====================
function loadMonitoringPage() {
  fetchMonitoringData();
  startMonitoringAutoRefresh();
}

function startMonitoringAutoRefresh() {
  if (monitoringInterval) return;
  monitoringInterval = setInterval(fetchMonitoringData, 60 * 1000);
}

function stopMonitoringAutoRefresh() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
}

async function fetchMonitoringData() {
  try {
    const res = await fetch(`${MONITOR_API}/data?minutes=240`);
    const json = await res.json();
    if (!json.success) {
      showToast(json.message || 'Failed to load monitoring data', 'error');
      return;
    }

    monitoringRows = json.data.minuteRows || [];
    renderMonitoringMeta(json.data);
    if (json.data.predictions) {
      renderPredictions(json.data.predictions, json.data.latest);
    }
    renderMonitoringCharts(monitoringRows);
    renderMonitoringTable();
  } catch (err) {
    showToast('Failed to load monitoring data', 'error');
  }
}

function renderMonitoringMeta(data) {
  const metaEl = document.getElementById('monitoringMeta');
  if (!metaEl) return;
  if (!data.latest) {
    metaEl.textContent = 'No monitoring records available yet. Use seed or send live readings.';
    return;
  }
  metaEl.textContent = `Records: ${data.count} | Latest: ${new Date(data.latest.timestamp).toLocaleString()}`;
}

function renderPredictions(preds, latest) {
  const panel = document.getElementById('predictionsPanel');
  const grid = document.getElementById('predictionsGrid');
  if (!panel || !grid) return;

  if (!preds || !latest) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';

  const metricsInfo = [
    { key: 'pH', label: 'pH', icon: 'fa-vial', unit: '' },
    { key: 'dissolvedOxygen', label: 'DO', icon: 'fa-water', unit: 'mg/L' },
    { key: 'turbidity', label: 'Turbidity', icon: 'fa-cloud-rain', unit: 'NTU' },
    { key: 'temperature', label: 'Temp', icon: 'fa-temperature-three-quarters', unit: '°C' },
    { key: 'ammonia', label: 'Ammonia', icon: 'fa-flask-vial', unit: 'mg/L' },
  ];

  grid.innerHTML = metricsInfo.map(info => {
    const p = preds[info.key];
    if (!p || p.predictedValue === null) return '';

    const currentVal = latest[info.key] !== undefined ? latest[info.key] : '--';
    let iconHTML = '';
    if (p.trend === 'up') iconHTML = '<i class="fas fa-arrow-trend-up pred-icon"></i>';
    else if (p.trend === 'down') iconHTML = '<i class="fas fa-arrow-trend-down pred-icon"></i>';
    else iconHTML = '<i class="fas fa-minus pred-icon"></i>';

    return `
      <div class="prediction-card trend-${p.trend}">
        <div class="pred-title"><i class="fas ${info.icon}"></i> ${info.label}</div>
        <div class="pred-values">
          <div class="pred-current">Current: ${currentVal}${info.unit ? ' ' + info.unit : ''}</div>
          <div class="pred-forecast">${p.predictedValue}${info.unit ? ' ' + info.unit : ''} ${iconHTML}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderMonitoringCharts(rows) {
  MONITOR_METRICS.forEach((metric) => {
    const candles = rows.map((row) => ({ minute: row.minute, ...row.candles[metric.key] }));
    renderSingleMonitoringChart(metric, candles);
  });
}

function renderSingleMonitoringChart(metric, candles) {
  const canvas = document.getElementById(metric.chartId);
  if (!canvas) return;
  updateMetricHeader(metric);
  updateMetricReadout(metric, candles[candles.length - 1] || null);

  const scrollWrap = canvas.closest('.monitor-chart-scroll');
  const minWidth = Math.max(scrollWrap ? scrollWrap.clientWidth : 420, candles.length * MONITOR_POINT_WIDTH);
  canvas.width = minWidth;
  canvas.height = 220;

  const ctx = canvas.getContext('2d');
  if (!candles.length) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px Poppins';
    ctx.fillText('No data available', 16, 32);
    return;
  }

  const labels = candles.map((c) => formatRealtimeTick(c.minute));
  const closeSeries = candles.map((c) => c.close);

  const thresholdMinSeries = candles.map(() => metric.threshold?.min ?? null);
  const thresholdMaxSeries = candles.map(() => metric.threshold?.max ?? null);

  const valueDataset = {
    data: closeSeries,
    borderColor: metric.color,
    borderWidth: 2.2,
    tension: 0.35,
    fill: true,
    backgroundColor: (context) => {
      const chart = context.chart;
      const { chartArea } = chart;
      if (!chartArea) return 'rgba(0, 210, 255, 0.08)';
      const gradient = chart.ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      gradient.addColorStop(0, `${metric.color}33`);
      gradient.addColorStop(1, 'rgba(0, 210, 255, 0.02)');
      return gradient;
    },
    pointRadius: (context) => (isOutOfThreshold(metric, context.raw) ? 3 : 0),
    pointHoverRadius: 5,
    pointBackgroundColor: (context) => (isOutOfThreshold(metric, context.raw) ? '#ff4d4d' : metric.color),
    pointBorderColor: (context) => (isOutOfThreshold(metric, context.raw) ? '#ffd6d6' : '#dffbff'),
    pointBorderWidth: (context) => (isOutOfThreshold(metric, context.raw) ? 1.5 : 0),
    segment: {
      borderColor: (context) => {
        const y0 = context.p0.parsed.y;
        const y1 = context.p1.parsed.y;
        return (isOutOfThreshold(metric, y0) || isOutOfThreshold(metric, y1)) ? '#ff4d4d' : metric.color;
      },
    },
  };

  const thresholdDatasets = [
    {
      data: thresholdMinSeries,
      borderColor: 'rgba(255, 184, 77, 0.85)',
      borderDash: [6, 4],
      borderWidth: 1.2,
      pointRadius: 0,
      fill: false,
    },
    {
      data: thresholdMaxSeries,
      borderColor: 'rgba(255, 184, 77, 0.85)',
      borderDash: [6, 4],
      borderWidth: 1.2,
      pointRadius: 0,
      fill: false,
    },
  ];

  if (monitoringCharts[metric.key]) {
    const chart = monitoringCharts[metric.key];
    chart.$candles = candles;
    chart.data.labels = labels;
    chart.data.datasets[0].data = closeSeries;
    chart.data.datasets[1].data = thresholdMinSeries;
    chart.data.datasets[2].data = thresholdMaxSeries;
    chart.update();

    if (scrollWrap) {
      requestAnimationFrame(() => {
        scrollWrap.scrollLeft = scrollWrap.scrollWidth;
        updateFloatingXAxisGuide(metric);
        updateStaticCardXAxis(metric);
      });

      if (!scrollWrap.dataset.floatGuideBound) {
        scrollWrap.addEventListener('scroll', () => {
          updateFloatingXAxisGuide(metric);
          updateStaticCardXAxis(metric);
        });
        scrollWrap.dataset.floatGuideBound = '1';
      }
    }
    return;
  }

  monitoringCharts[metric.key] = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [valueDataset, ...thresholdDatasets],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      animation: {
        duration: 700,
        easing: 'easeOutQuart',
      },
      animations: {
        x: { duration: 0 },
        y: { duration: 700, easing: 'easeOutQuart' },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(9, 20, 25, 0.95)',
          borderColor: 'rgba(255,255,255,0.15)',
          borderWidth: 1,
          callbacks: {
            title: (items) => candles[items[0].dataIndex] ? new Date(candles[items[0].dataIndex].minute).toLocaleString() : '',
            label: (item) => {
              if (item.datasetIndex !== 0) return null;
              const c = candles[item.dataIndex];
              const status = isOutOfThreshold(metric, c.close) ? 'ALERT' : 'Normal';
              const unit = metric.unit ? ` ${metric.unit}` : '';
              return `${metric.label}: ${c.close}${unit} | ${status}`;
            },
            afterLabel: (item) => {
              if (item.datasetIndex !== 0) return null;
              return getThresholdText(metric);
            },
          },
        },
      },
      scales: {
        y: {
          ticks: { color: 'rgba(255,255,255,0.85)' },
          grid: { color: 'rgba(255,255,255,0.13)' },
          border: { display: true, color: 'rgba(255,255,255,0.65)', width: 1.3 },
        },
        x: {
          ticks: { display: false, color: 'rgba(255,255,255,0.85)', maxTicksLimit: 12, autoSkip: true },
          grid: { color: 'rgba(255,255,255,0.09)' },
          border: { display: true, color: 'rgba(255,255,255,0.65)', width: 1.3 },
        },
      },
      onClick: (evt, elements) => {
        const selected = elements.length ? elements[0].index : -1;
        renderMonitoringTable(selected);
      },
      onHover: (evt, _elements, chart) => {
        const hoverItems = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false);
        if (!hoverItems.length) return;
        const idx = hoverItems[0].index;
        const candle = candles[idx];
        if (candle) {
          updateMetricReadout(metric, candle);
        }
      },
    },
    plugins: [],
  });

  monitoringCharts[metric.key].$candles = candles;
  if (scrollWrap) {
    requestAnimationFrame(() => {
      scrollWrap.scrollLeft = scrollWrap.scrollWidth;
      updateFloatingXAxisGuide(metric);
      updateStaticCardXAxis(metric);
    });

    if (!scrollWrap.dataset.floatGuideBound) {
      scrollWrap.addEventListener('scroll', () => {
        updateFloatingXAxisGuide(metric);
        updateStaticCardXAxis(metric);
      });
      scrollWrap.dataset.floatGuideBound = '1';
    }
  }
}

function renderMonitoringTable(selectedIndex = -1) {
  const tableCard = document.getElementById('monitoringTableCard');
  const tbody = document.querySelector('#monitoringTable tbody');
  if (!tableCard || !tbody) return;

  const tableRows = monitoringRows.slice(-MONITOR_TABLE_LIMIT);

  if (!tableRows.length) {
    tbody.innerHTML = '<tr><td colspan="6">No monitoring data available</td></tr>';
    tableCard.style.display = 'block';
    return;
  }

  const selectedRow = selectedIndex >= 0 ? monitoringRows[selectedIndex] : null;

  tbody.innerHTML = tableRows.map((row) => {
    const isSelected = !!selectedRow && selectedRow.minute === row.minute;
    const rowStyle = isSelected ? ' style="background:rgba(0,210,255,0.12);"' : '';
    return `<tr${rowStyle}>
      <td>${new Date(row.minute).toLocaleString()}</td>
      <td>${row.pH}</td>
      <td>${row.dissolvedOxygen}</td>
      <td>${row.turbidity}</td>
      <td>${row.temperature}</td>
      <td>${row.ammonia}</td>
    </tr>`;
  }).join('');

  tableCard.style.display = 'block';
}

function destroyMonitoringCharts() {
  Object.keys(monitoringCharts).forEach((key) => {
    monitoringCharts[key].destroy();
    delete monitoringCharts[key];
  });
}

function formatMinuteTick(iso) {
  const dt = new Date(iso);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRealtimeTick(iso) {
  const dt = new Date(iso);
  return dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ===================== CREATE TEST WIZARD =====================
let ctVerifiedProject = null;

function initCreateTestPage() {
  ctVerifiedProject = null;
  document.getElementById('ctPhone').value = '';
  document.getElementById('ctPhoneError').textContent = '';
  document.getElementById('ammoniaInput').value = '';
  document.getElementById('ammoniaError').textContent = '';
  goToCtStep(1);
  bindCreateTestEvents();
}

let ctEventsBound = false;
function bindCreateTestEvents() {
  if (ctEventsBound) return;
  ctEventsBound = true;

  // Step 1: Look Up User
  document.getElementById('ctCheckUserBtn').addEventListener('click', handleCtCheckUser);
  document.getElementById('ctPhone').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleCtCheckUser(); }
  });

  // Step 2: Back / Confirm
  document.getElementById('ctBackToStep1').addEventListener('click', () => goToCtStep(1));
  document.getElementById('ctConfirmUserBtn').addEventListener('click', () => goToCtStep(3));

  // Step 3: Open modal / Back
  document.getElementById('ctOpenAmmoniaModal').addEventListener('click', openAmmoniaModal);
  document.getElementById('ctBackToStep2').addEventListener('click', () => goToCtStep(2));

  // Ammonia Modal
  document.getElementById('ammoniaCancelBtn').addEventListener('click', closeAmmoniaModal);
  document.getElementById('ammoniaSubmitBtn').addEventListener('click', handleAmmoniaSubmit);
  document.getElementById('ammoniaInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleAmmoniaSubmit(); }
  });
}

function goToCtStep(step) {
  // Update step indicators
  for (let i = 1; i <= 3; i++) {
    const indicator = document.getElementById(`ctStep${i}Indicator`);
    const content = document.getElementById(`ctStep${i}`);
    indicator.classList.remove('active', 'completed');
    content.classList.remove('active');
    if (i < step) indicator.classList.add('completed');
    if (i === step) indicator.classList.add('active');
  }
  document.getElementById(`ctStep${step}`).classList.add('active');
}

async function handleCtCheckUser() {
  const phone = document.getElementById('ctPhone').value.trim();
  const errorEl = document.getElementById('ctPhoneError');
  errorEl.textContent = '';

  if (!phone) {
    errorEl.textContent = 'Phone number is required';
    return;
  }

  showLoading();
  try {
    const res = await fetch(`${API}/check-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: phone })
    });
    const json = await res.json();
    hideLoading();

    if (json.success) {
      ctVerifiedProject = json.data;
      document.getElementById('ctUserName').textContent = json.data.name;
      document.getElementById('ctUserPhone').textContent = json.data.phoneNumber;
      document.getElementById('ctUserEmail').textContent = json.data.email;
      document.getElementById('ctUserPlace').textContent = json.data.place;
      document.getElementById('ctUserTests').textContent = json.data.testsCount;
      goToCtStep(2);
    } else {
      errorEl.textContent = json.message || 'User not found';
    }
  } catch (err) {
    hideLoading();
    errorEl.textContent = 'Server error. Please try again.';
  }
}

function openAmmoniaModal() {
  document.getElementById('ammoniaInput').value = '';
  document.getElementById('ammoniaError').textContent = '';
  document.getElementById('ammoniaModal').classList.add('active');
  setTimeout(() => document.getElementById('ammoniaInput').focus(), 100);
}

function closeAmmoniaModal() {
  document.getElementById('ammoniaModal').classList.remove('active');
}

async function handleAmmoniaSubmit() {
  const ammoniaVal = document.getElementById('ammoniaInput').value.trim();
  const errorEl = document.getElementById('ammoniaError');
  errorEl.textContent = '';

  if (!ammoniaVal) {
    errorEl.textContent = 'Ammonia value is required';
    return;
  }
  const num = Number(ammoniaVal);
  if (Number.isNaN(num) || num < 0) {
    errorEl.textContent = 'Please enter a valid positive number';
    return;
  }
  if (!ctVerifiedProject) {
    errorEl.textContent = 'No verified user. Please go back and verify.';
    return;
  }

  showLoading();
  try {
    const res = await fetch(`${API}/create-test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: ctVerifiedProject._id, ammonia: num })
    });
    const json = await res.json();
    hideLoading();
    closeAmmoniaModal();

    if (json.success) {
      showToast('Test created successfully with ammonia value!', 'success');
      currentProjectId = ctVerifiedProject._id;
      navigateTo('dashboard', ctVerifiedProject._id);
    } else {
      showToast(json.message || 'Failed to create test', 'error');
    }
  } catch (err) {
    hideLoading();
    closeAmmoniaModal();
    showToast('Server error. Please try again.', 'error');
  }
}

// ===================== UTILITIES =====================
function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function showLoading() { document.getElementById('loadingOverlay').classList.add('active'); }
function hideLoading() { document.getElementById('loadingOverlay').classList.remove('active'); }

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'check-circle', error: 'exclamation-circle', info: 'info-circle' };
  toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function showConfirm(title, message, onConfirm) {
  const modal = document.getElementById('confirmModal');
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  modal.classList.add('active');

  const okBtn = document.getElementById('confirmOk');
  const cancelBtn = document.getElementById('confirmCancel');

  const cleanup = () => { modal.classList.remove('active'); okBtn.replaceWith(okBtn.cloneNode(true)); cancelBtn.replaceWith(cancelBtn.cloneNode(true)); };

  document.getElementById('confirmOk').addEventListener('click', () => { cleanup(); onConfirm(); });
  document.getElementById('confirmCancel').addEventListener('click', cleanup);
}
