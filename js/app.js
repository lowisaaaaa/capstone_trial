/* ========= Session & Constants ========= */
const LS = {
  role: "hp_role",
  email: "hp_email",
  barangay: "hp_barangay",
  sitio: "hp_sitio",
  dataPrefix: "hp_children_", // + barangay + "__" + sitio
};
const VACCINES = ["BCG", "OPV", "Pentavalent", "Measles"];
const BARANGAYS = ["Barangay 1", "Barangay 2", "Barangay 3", "Barangay 4", "Barangay 5"];
const SITIOS = ["Sitio A", "Sitio B", "Sitio C"];

function storageKeyFor(b, s) {
  return `${LS.dataPrefix}${b}__${s}`;
}

/* ========= Utilities ========= */
function parseCSV(text) {
  // Simple robust CSV parser (handles quotes & commas)
  const rows = [];
  let i = 0, f = "", r = [], q = false;
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') { f += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) { r.push(f.trim()); f = ""; }
    else if ((c === '\n' || c === '\r') && !q) {
      if (f.length || r.length) { r.push(f.trim()); rows.push(r); f = ""; r = []; }
      if (c === '\r' && text[i + 1] === '\n') i++;
    } else { f += c; }
    i++;
  }
  if (f.length || r.length) { r.push(f.trim()); rows.push(r); }
  return rows.filter(row => row.length && row.some(x => x !== ""));
}

function toCSV(rows) {
  return rows.map(r => r.map(v => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\n');
}

function download(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function tableToXls(filename, tableElem) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${tableElem.outerHTML}</body></html>`;
  download(filename, "application/vnd.ms-excel", html);
}

function renderTable() {
  const tbody = document.querySelector("#childrenTable tbody");
  tbody.innerHTML = "";

  childrenData.forEach((row, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row["Child Name"] || ""}</td>
      <td>${row["Age"] || ""}</td>
      <td>${row["Parent Name"] || ""}</td>
      <td>${row["Barangay"] || localStorage.getItem("hp_barangay") || ""}</td>
      <td>${row["Sitio"] || localStorage.getItem("hp_sitio") || ""}</td>
      <td><span class="badge ${row["BCG"]==="Accepted"?'accepted':'needed'}">${row["BCG"]||"Needed"}</span></td>
      <td><span class="badge ${row["OPV"]==="Accepted"?'accepted':'needed'}">${row["OPV"]||"Needed"}</span></td>
      <td><span class="badge ${row["Pentavalent"]==="Accepted"?'accepted':'needed'}">${row["Pentavalent"]||"Needed"}</span></td>
      <td><span class="badge ${row["Measles"]==="Accepted"?'accepted':'needed'}">${row["Measles"]||"Needed"}</span></td>
      <td>
        <button class="action-btn edit-btn" onclick="editRow(this, ${index})">Edit</button>
        <button class="action-btn delete-btn" onclick="deleteRow(${index})">Delete</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

function editRow(button, index) {
  const tr = button.closest("tr");
  const isEditing = button.innerText === "Save";

  if (isEditing) {
    // Save the edited data
    const cells = tr.querySelectorAll("td");
    childrenData[index] = {
      "Child Name": cells[0].innerText.trim(),
      "Age": cells[1].innerText.trim(),
      "Parent Name": cells[2].innerText.trim(),
      "Barangay": cells[3].innerText.trim(),
      "Sitio": cells[4].innerText.trim(),
      "BCG": cells[5].innerText.trim(),
      "OPV": cells[6].innerText.trim(),
      "Pentavalent": cells[7].innerText.trim(),
      "Measles": cells[8].innerText.trim()
    };
    localStorage.setItem("childrenData", JSON.stringify(childrenData));

    // Disable editing
    tr.querySelectorAll("td").forEach((cell, i) => {
      if (i < 9) cell.contentEditable = "false";
    });

    button.innerText = "Edit";
  } else {
    // Enable editing
    tr.querySelectorAll("td").forEach((cell, i) => {
      if (i < 9) cell.contentEditable = "true";
    });
    button.innerText = "Save";
  }
}

function deleteRow(index) {
  if (confirm("Are you sure you want to delete this row?")) {
    childrenData.splice(index, 1);
    localStorage.setItem("childrenData", JSON.stringify(childrenData));
    renderTable();
  }
}




/* ========= Aggregation ========= */
function getAllData() {
  const all = [];
  for (const b of BARANGAYS) {
    for (const s of SITIOS) {
      const key = storageKeyFor(b, s);
      const str = localStorage.getItem(key);
      if (!str) continue;
      try { JSON.parse(str).forEach(x => all.push(x)); } catch {}
    }
  }
  return all;
}

function getBarangayData(barangay) {
  const out = [];
  for (const s of SITIOS) {
    const key = storageKeyFor(barangay, s);
    const str = localStorage.getItem(key);
    if (!str) continue;
    try { JSON.parse(str).forEach(x => out.push(x)); } catch {}
  }
  return out;
}

function computeCompletionStats(records) {
  let complete = 0, incomplete = 0;
  for (const r of records) {
    const ok = VACCINES.every(v => String(r[v] || "").toLowerCase() === "accepted");
    if (ok) complete++; else incomplete++;
  }
  return { complete, incomplete };
}

function computeVaccineCounts(records) {
  const counts = { BCG: 0, OPV: 0, Pentavalent: 0, Measles: 0 };
  for (const r of records) {
    for (const v of VACCINES) {
      if (String(r[v] || "").toLowerCase() === "accepted") counts[v]++;
    }
  }
  return counts;
}

/* ========= Charts (vanilla canvas) ========= */
function drawPie(canvas, values, labels) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const total = values.reduce((a, b) => a + b, 0) || 1;
  const colors = ["#43A047", "#1E88E5"];
  let start = -Math.PI / 2;
  const R = Math.min(W, H) / 2 - 30;

  // slices
  for (let i = 0; i < values.length; i++) {
    const ang = (values[i] / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.arc(W / 2, H / 2, R, start, start + ang);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    start += ang;
  }

  // legend
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillStyle = "#1f2937";
  labels.forEach((l, i) => {
    ctx.fillRect(18, 18 + i * 22, 14, 14);
    ctx.fillStyle = i === 0 ? colors[0] : colors[1];
    ctx.fillRect(18, 18 + i * 22, 14, 14);
    ctx.fillStyle = "#1f2937";
    ctx.fillText(`${l}: ${values[i]}`, 40, 30 + i * 22);
  });
}

function drawBar(canvas, labels, values) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const m = 40, w = W - m * 2, h = H - m * 2;
  const maxVal = Math.max(1, ...values);
  const step = w / labels.length;
  const barW = step * 0.6;

  // axis
  ctx.strokeStyle = "#e5e7eb";
  ctx.beginPath(); ctx.moveTo(m, H - m); ctx.lineTo(W - m, H - m); ctx.stroke();

  // bars
  for (let i = 0; i < labels.length; i++) {
    const bh = (values[i] / maxVal) * h;
    const x = m + i * step + (step - barW) / 2;
    const y = H - m - bh;
    ctx.fillStyle = "#1E88E5";
    ctx.fillRect(x, y, barW, bh);
    ctx.fillStyle = "#1f2937";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText(labels[i], x, H - m + 16);
    ctx.fillText(values[i], x + barW / 2 - 6, y - 6);
  }
}

/* ========= Page Bootstraps ========= */
document.addEventListener("DOMContentLoaded", () => {
  const page = location.pathname.split("/").pop();

  // Login wiring
  if (page === "login.html") {
    const roleEl = document.getElementById("role");
    const bnsWrap = document.getElementById("bnsWrap");
    const bhwWrap = document.getElementById("bhwWrap");
    roleEl.addEventListener("change", () => {
      bnsWrap.style.display = roleEl.value === "BNS" ? "block" : "none";
      bhwWrap.style.display = roleEl.value === "BHW" ? "block" : "none";
    });

    document.getElementById("loginForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const pass = document.getElementById("password").value; // not validated server-side (demo)
      const role = roleEl.value;

      if (!email || !role) { alert("Please complete the form."); return; }

      localStorage.setItem(LS.email, email);
      localStorage.setItem(LS.role, role);

      if (role === "BHW") {
        const b = document.getElementById("barangayBhw").value;
        const s = document.getElementById("sitioBhw").value;
        if (!b || !s) { alert("Please select Barangay and Sitio."); return; }
        localStorage.setItem(LS.barangay, b);
        localStorage.setItem(LS.sitio, s);
        location.href = "bhw_dashboard.html";
      } else if (role === "BNS") {
        const b = document.getElementById("barangayBns").value;
        if (!b) { alert("Please select Barangay."); return; }
        localStorage.setItem(LS.barangay, b);
        localStorage.removeItem(LS.sitio);
        location.href = "bns_dashboard.html";
      } else {
        // MHO
        localStorage.removeItem(LS.barangay);
        localStorage.removeItem(LS.sitio);
        location.href = "mho_dashboard.html";
      }
    });
  }

  // BHW dashboard
  if (page === "bhw_dashboard.html") {
    const barangay = localStorage.getItem(LS.barangay) || "";
    const sitio = localStorage.getItem(LS.sitio) || "";
    document.getElementById("bhwBarangay").textContent = barangay || "(not set)";
    document.getElementById("bhwSitio").textContent = sitio || "(not set)";

    const key = storageKeyFor(barangay, sitio);
    const tbody = document.querySelector("#bhwTable tbody");
    const emptyMsg = document.getElementById("bhwEmpty");

    function refresh() {
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      renderTable(tbody, data);
      emptyMsg.style.display = data.length ? "none" : "block";
    }
    refresh();

    // Nav tabs (records/upload)
    document.querySelectorAll(".nav-link").forEach(a => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".nav-link").forEach(n => n.classList.remove("active"));
        a.classList.add("active");
        const section = a.dataset.link;
        document.getElementById("recordsSection").style.display = section === "records" ? "block" : "none";
        document.getElementById("uploadSection").style.display = section === "upload" ? "block" : "none";
      });
    });

    // Import
    document.getElementById("bhwImportBtn").addEventListener("click", async () => {
      const file = document.getElementById("bhwFile").files[0];
      if (!file) { alert("Select a CSV file first."); return; }
      const text = await file.text();
      const rows = parseCSV(text);
      if (!rows.length) { alert("Empty or invalid CSV."); return; }

      // Map headers
      const hdr = rows[0].map(h => h.trim().toLowerCase());
      const idx = {
        child: hdr.indexOf("child name"),
        age: hdr.indexOf("age"),
        parent: hdr.indexOf("parent name"),
        barangay: hdr.indexOf("barangay"),
        sitio: hdr.indexOf("sitio"),
        bcg: hdr.indexOf("bcg"),
        opv: hdr.indexOf("opv"),
        penta: hdr.indexOf("pentavalent"),
        measles: hdr.indexOf("measles"),
      };
      const needCols = Object.values(idx).every(v => v >= 0);
      if (!needCols) { alert("Missing required columns."); return; }

      const list = [];
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        list.push({
          child: r[idx.child] || "",
          age: Number(r[idx.age] || 0),
          parent: r[idx.parent] || "",
          barangay: r[idx.barangay] || barangay,
          sitio: r[idx.sitio] || sitio,
          BCG: r[idx.bcg] || "",
          OPV: r[idx.opv] || "",
          Pentavalent: r[idx.penta] || "",
          Measles: r[idx.measles] || "",
        });
      }

      // Save only to THIS barangay+sitio
      localStorage.setItem(key, JSON.stringify(list));
      refresh();
      alert("Imported successfully.");
    });

    // Clear
    document.getElementById("bhwClearBtn").addEventListener("click", () => {
      if (confirm("Clear all records for this Barangay+Sitio?")) {
        localStorage.removeItem(key);
        refresh();
      }
    });

    // Downloads
    document.getElementById("bhwDownloadCsv").addEventListener("click", () => {
      const data = JSON.parse(localStorage.getItem(key) || "[]");
      const rows = [["Child Name","Age","Parent Name","Barangay","Sitio","BCG","OPV","Pentavalent","Measles"]];
      data.forEach(r => rows.push([r.child, r.age, r.parent, r.barangay, r.sitio, r.BCG, r.OPV, r.Pentavalent, r.Measles]));
      download(`${barangay}_${sitio}.csv`, "text/csv", toCSV(rows));
    });
    document.getElementById("bhwDownloadXls").addEventListener("click", () => {
      tableToXls(`${barangay}_${sitio}.xls`, document.getElementById("bhwTable"));
    });
  }

  // BNS dashboard
  if (page === "bns_dashboard.html") {
    const barangay = localStorage.getItem(LS.barangay) || "";
    document.getElementById("bnsBarangay").textContent = barangay || "(not set)";
    const tbody = document.querySelector("#bnsTable tbody");
    const emptyMsg = document.getElementById("bnsEmpty");

    function refresh() {
      const data = getBarangayData(barangay);
      renderTable(tbody, data);
      emptyMsg.style.display = data.length ? "none" : "block";
    }
    refresh();

    document.getElementById("bnsDownloadCsv").addEventListener("click", () => {
      const data = getBarangayData(barangay);
      const rows = [["Child Name","Age","Parent Name","Barangay","Sitio","BCG","OPV","Pentavalent","Measles"]];
      data.forEach(r => rows.push([r.child, r.age, r.parent, r.barangay, r.sitio, r.BCG, r.OPV, r.Pentavalent, r.Measles]));
      download(`${barangay}_all_sitios.csv`, "text/csv", toCSV(rows));
    });
    document.getElementById("bnsDownloadXls").addEventListener("click", () => {
      tableToXls(`${barangay}_all_sitios.xls`, document.getElementById("bnsTable"));
    });
  }

  // MHO dashboard
  if (page === "mho_dashboard.html") {
    const tbody = document.querySelector("#mhoTable tbody");
    const emptyMsg = document.getElementById("mhoEmpty");
    const data = getAllData();
    renderTable(tbody, data);
    emptyMsg.style.display = data.length ? "none" : "block";

    // Charts
    const pie = document.getElementById("pieChart");
    const bar = document.getElementById("barChart");
    const comp = computeCompletionStats(data);
    drawPie(pie, [comp.complete, comp.incomplete], ["Complete", "Incomplete"]);
    const counts = computeVaccineCounts(data);
    drawBar(bar, Object.keys(counts), Object.values(counts));

    // Downloads
    document.getElementById("mhoDownloadCsv").addEventListener("click", () => {
      const rows = [["Child Name","Age","Parent Name","Barangay","Sitio","BCG","OPV","Pentavalent","Measles"]];
      data.forEach(r => rows.push([r.child, r.age, r.parent, r.barangay, r.sitio, r.BCG, r.OPV, r.Pentavalent, r.Measles]));
      download(`All_Barangays.csv`, "text/csv", toCSV(rows));
    });
    document.getElementById("mhoDownloadXls").addEventListener("click", () => {
      tableToXls(`All_Barangays.xls`, document.getElementById("mhoTable"));
    });
  }
});
