(function () {
  var map;
  var allRuns = [];
  var runLayers = {};
  var photoLayers = {};
  var sidebarSearchText = "";
  var sidebarYearFilter = "";
  var defaultView = {
    center: [50.53, 5.75],
    zoom: 10
  };

  window.addEventListener("load", startApp);

  function startApp() {
    if (!window.L) {
      showStartupError();
      return;
    }

    allRuns = []
      .concat(window.RUNS || [])
      .concat(window.GENERATED_RUNS || []);

    initMap();
    createRunLayers();
    initSidebarControls();
    renderSidebar();
    fitMapToVisibleRuns();
  }

  function initMap() {
    map = L.map("map").setView(defaultView.center, defaultView.zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
  }

  function createRunLayers() {
    allRuns.forEach(function (run) {
      var trackLayer = L.geoJSON(run.track, {
        style: {
          color: run.color,
          weight: 5,
          opacity: 0.9
        },
        onEachFeature: function (feature, layer) {
          layer.bindPopup(createRunPopup(run));
        }
      });

      var photosLayer = createPhotoLayer(run);

      runLayers[run.id] = trackLayer;
      photoLayers[run.id] = photosLayer;

      if (run.visible) {
        trackLayer.addTo(map);
        photosLayer.addTo(map);
      }
    });
  }

  function createPhotoLayer(run) {
    var group = L.layerGroup();
    var photos = run.photos || [];

    photos.forEach(function (photo) {
      var marker = L.marker([photo.lat, photo.lon], {
        icon: L.divIcon({
          className: "photo-marker",
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        }),
        title: photo.caption
      });

      marker.bindPopup(createPhotoPopup(photo));
      marker.addTo(group);
    });

    return group;
  }

  function renderSidebar() {
    var list = document.getElementById("runs-list");
    var filteredRuns = getFilteredRuns();

    list.innerHTML = "";

    filteredRuns.forEach(function (run) {
      list.appendChild(createRunCard(run));
    });

    if (filteredRuns.length === 0) {
      var emptyMessage = document.createElement("p");
      emptyMessage.className = "empty-list";
      emptyMessage.textContent = "Aucune course ne correspond aux filtres.";
      list.appendChild(emptyMessage);
    }

    updateRunsCount(filteredRuns.length);
  }

  function initSidebarControls() {
    var searchInput = document.getElementById("run-search");
    var yearSelect = document.getElementById("year-filter");
    var showAllButton = document.getElementById("show-all-runs");
    var hideAllButton = document.getElementById("hide-all-runs");

    renderYearFilter();

    if (searchInput) {
      searchInput.addEventListener("input", function () {
        sidebarSearchText = searchInput.value;
        renderSidebar();
      });
    }

    if (yearSelect) {
      yearSelect.addEventListener("change", function () {
        sidebarYearFilter = yearSelect.value;
        renderSidebar();
      });
    }

    if (showAllButton) {
      showAllButton.addEventListener("click", function () {
        setAllRunsVisibleOnMap(true);
      });
    }

    if (hideAllButton) {
      hideAllButton.addEventListener("click", function () {
        setAllRunsVisibleOnMap(false);
      });
    }
  }

  function renderYearFilter() {
    var yearSelect = document.getElementById("year-filter");
    var years;

    if (!yearSelect) {
      return;
    }

    years = getAvailableYears();
    yearSelect.innerHTML = "";
    yearSelect.appendChild(createYearOption("", "Toutes les ann\u00e9es"));

    years.forEach(function (year) {
      yearSelect.appendChild(createYearOption(year, year));
    });
  }

  function createYearOption(value, label) {
    var option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  function getAvailableYears() {
    var yearsByName = {};

    allRuns.forEach(function (run) {
      var year = getRunYear(run);
      if (year) {
        yearsByName[year] = true;
      }
    });

    return Object.keys(yearsByName).sort(function (a, b) {
      return b.localeCompare(a);
    });
  }

  function getFilteredRuns() {
    return allRuns.filter(function (run) {
      return runMatchesFilters(run);
    });
  }

  function runMatchesFilters(run) {
    var search = normalizeText(sidebarSearchText);
    var year = getRunYear(run);
    var searchableText;

    if (sidebarYearFilter && year !== sidebarYearFilter) {
      return false;
    }

    if (!search) {
      return true;
    }

    searchableText = normalizeText([
      run.title,
      run.date,
      run.id,
      formatDate(run.date)
    ].join(" "));

    return searchableText.indexOf(search) !== -1;
  }

  function getRunYear(run) {
    if (!run.date) {
      return "";
    }

    return String(run.date).slice(0, 4);
  }

  function normalizeText(value) {
    var text = String(value || "").toLowerCase();

    if (text.normalize) {
      text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    return text;
  }

  function updateRunsCount(visibleCount) {
    var count = document.getElementById("runs-count");

    if (!count) {
      return;
    }

    count.textContent = visibleCount + " / " + allRuns.length + " courses affich\u00e9es";
  }

  function createRunCard(run) {
    var card = document.createElement("article");
    card.className = "run-card";
    card.style.setProperty("--run-color", run.color);

    var header = document.createElement("div");
    header.className = "run-card-header";

    var checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(run.visible);
    checkbox.setAttribute("data-run-id", run.id);
    checkbox.setAttribute("aria-label", "Afficher ou masquer " + run.title);
    checkbox.addEventListener("change", function () {
      toggleRunVisibility(run.id, checkbox.checked);
    });

    var titleBlock = document.createElement("div");

    var title = document.createElement("h2");
    title.className = "run-title";
    title.textContent = run.title;

    var date = document.createElement("p");
    date.className = "run-date";
    date.textContent = formatDate(run.date);

    titleBlock.appendChild(title);
    titleBlock.appendChild(date);
    header.appendChild(checkbox);
    header.appendChild(titleBlock);

    var stats = document.createElement("div");
    stats.className = "run-stats";
    stats.appendChild(createStat("Distance", formatDistance(run.distanceKm)));
    stats.appendChild(createStat("Dénivelé +", formatElevation(run.elevationGainM)));

    var button = document.createElement("button");
    button.type = "button";
    button.className = "center-button";
    button.textContent = "Centrer";
    button.addEventListener("click", function () {
      centerOnRun(run.id);
    });

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(button);

    return card;
  }

  function createStat(label, value) {
    var stat = document.createElement("div");
    stat.className = "run-stat";

    var labelNode = document.createElement("span");
    labelNode.textContent = label;

    var valueNode = document.createElement("strong");
    valueNode.textContent = value;

    stat.appendChild(labelNode);
    stat.appendChild(valueNode);

    return stat;
  }

  function toggleRunVisibility(runId, visible) {
    var trackLayer = runLayers[runId];
    var photosLayer = photoLayers[runId];

    if (!trackLayer || !photosLayer) {
      return;
    }

    if (visible) {
      trackLayer.addTo(map);
      photosLayer.addTo(map);
    } else {
      trackLayer.removeFrom(map);
      photosLayer.removeFrom(map);
    }

    setRunVisible(runId, visible);
    fitMapToVisibleRuns();
  }

  function setAllRunsVisibleOnMap(visible) {
    allRuns.forEach(function (run) {
      var trackLayer = runLayers[run.id];
      var photosLayer = photoLayers[run.id];

      run.visible = visible;

      if (trackLayer) {
        if (visible) {
          trackLayer.addTo(map);
        } else {
          trackLayer.removeFrom(map);
        }
      }

      if (photosLayer) {
        if (visible) {
          photosLayer.addTo(map);
        } else {
          photosLayer.removeFrom(map);
        }
      }
    });

    updateVisibleSidebarCheckboxes();
    fitMapToVisibleRuns();
  }

  function updateVisibleSidebarCheckboxes() {
    var checkboxes = document.querySelectorAll('#runs-list input[type="checkbox"]');

    Array.prototype.forEach.call(checkboxes, function (checkbox) {
      var run = findRunById(checkbox.getAttribute("data-run-id"));
      if (run) {
        checkbox.checked = Boolean(run.visible);
      }
    });
  }

  function centerOnRun(runId) {
    var layer = runLayers[runId];

    if (!layer) {
      return;
    }

    var bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
    }
  }

  function fitMapToVisibleRuns() {
    var bounds = L.latLngBounds();
    var hasVisibleRun = false;

    allRuns.forEach(function (run) {
      var layer = runLayers[run.id];
      if (run.visible && layer) {
        var layerBounds = layer.getBounds();
        if (layerBounds.isValid()) {
          bounds.extend(layerBounds);
          hasVisibleRun = true;
        }
      }
    });

    if (hasVisibleRun) {
      map.fitBounds(bounds, { padding: [36, 36] });
    } else {
      map.setView(defaultView.center, defaultView.zoom);
    }
  }

  function setRunVisible(runId, visible) {
    allRuns.forEach(function (run) {
      if (run.id === runId) {
        run.visible = visible;
      }
    });
  }

  function findRunById(runId) {
    var foundRun = null;

    allRuns.forEach(function (run) {
      if (run.id === runId) {
        foundRun = run;
      }
    });

    return foundRun;
  }

  function createRunPopup(run) {
    return [
      '<div class="track-popup">',
      "<h2>" + escapeHtml(run.title) + "</h2>",
      "<p><strong>Date :</strong> " + escapeHtml(formatDate(run.date)) + "</p>",
      "<p><strong>Distance :</strong> " + escapeHtml(formatDistance(run.distanceKm)) + "</p>",
      "<p><strong>Dénivelé + :</strong> " + escapeHtml(formatElevation(run.elevationGainM)) + "</p>",
      "</div>"
    ].join("");
  }

  function createPhotoPopup(photo) {
    return [
      '<div class="photo-popup">',
      '<img src="' + escapeHtml(photo.thumb) + '" alt="' + escapeHtml(photo.caption) + '">',
      "<p>" + escapeHtml(photo.caption) + "</p>",
      "</div>"
    ].join("");
  }

  function formatDate(value) {
    var date = new Date(value + "T00:00:00");
    return date.toLocaleDateString("fr-BE", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function formatDistance(value) {
    return value.toFixed(1).replace(".", ",") + " km";
  }

  function formatElevation(value) {
    return value + " m";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showStartupError() {
    var list = document.getElementById("runs-list");
    list.innerHTML = '<div class="app-error">Impossible de démarrer la carte. Vérifiez que Leaflet, les traces et data/runs.js sont chargés avant app.js.</div>';
  }

  window.runningMap = {
    centerOnRun: centerOnRun,
    fitMapToVisibleRuns: fitMapToVisibleRuns,
    setAllRunsVisibleOnMap: setAllRunsVisibleOnMap,
    toggleRunVisibility: toggleRunVisibility
  };
})();
