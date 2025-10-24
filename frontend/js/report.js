// js/report.js

function getAuthToken() {
  return localStorage.getItem('token');
}

// Helper: Clean DB-stored path for use in URL
function cleanImagePath(dbPath) {
  if (!dbPath) return null;

  // Remove leading 'uploads/' if present (since URL already has /uploads/)
  let clean = dbPath.replace(/^uploads[\\/]/i, '');

  // Replace backslashes with forward slashes (for Windows paths)
  clean = clean.replace(/\\/g, '/');

  // Remove any accidental duplicate slashes
  clean = clean.replace(/\/+/g, '/');

  return clean;
}

async function fetchReports() {
  const tbody = document.getElementById('reportsBody');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4">Loading reports...</td></tr>';

  try {
    const token = getAuthToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('http://localhost:8000/log/reports/all', { headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const reports = await res.json();

    if (!Array.isArray(reports) || reports.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-gray-500">No cheating reports found.</td></tr>`;
      return;
    }

    tbody.innerHTML = '';
    reports.forEach(report => {
      const date = report.exam_date ? new Date(report.exam_date).toLocaleString() : 'N/A';
      const scoreClass = 
        report.cheating_score > 75 ? 'text-red-600' :
        report.cheating_score > 30 ? 'text-yellow-600' : 'text-green-600';

      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="px-5 py-4 border-b border-gray-200 text-sm">${report.student_id}</td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">${report.student_name || '—'}</td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">${report.exam_id}</td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">${report.exam_title}</td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">${date}</td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">
          <span class="font-semibold ${scoreClass}">${report.cheating_score}%</span>
        </td>
        <td class="px-5 py-4 border-b border-gray-200 text-sm">
          <button onclick="showDetailedReport(${report.student_id}, ${report.exam_id})"
                  class="text-blue-600 hover:text-blue-900 font-medium underline">View Details</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (err) {
    console.error('Failed to load reports:', err);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Error: ${err.message}</td></tr>`;
  }
}

async function showDetailedReport(studentId, examId) {
  const modal = document.getElementById('reportModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');

  modalTitle.textContent = `Report: Student ${studentId} • Exam ${examId}`;
  modalBody.innerHTML = '<p class="text-center py-4">Loading detailed report...</p>';
  modal.style.display = 'flex';

  try {
    const token = getAuthToken();
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch(`http://localhost:8000/log/report/detailed/${studentId}/${examId}`, { headers });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();

    let html = `
      <div class="space-y-2 text-sm">
        <p><span class="font-medium">Student:</span> ${data.student_name}</p>
        <p><span class="font-medium">Exam:</span> ${data.exam_title}</p>
        <p><span class="font-medium">Date:</span> ${data.exam_date ? new Date(data.exam_date).toLocaleString() : 'N/A'}</p>
        <p><span class="font-medium">Cheating Score:</span> 
          <span class="${data.cheating_score > 75 ? 'text-red-600' : data.cheating_score > 30 ? 'text-yellow-600' : 'text-green-600'} font-bold">
            ${data.cheating_score}%
          </span>
        </p>
        <p><span class="font-medium">Suspicious Events:</span> ${data.suspicious_events}</p>
        <p><span class="font-medium">Questions Answered:</span> ${data.total_answered || 0}</p>
      </div>
    `;

    if (data.movements && data.movements.length > 0) {
      html += `<h3 class="font-bold text-lg mt-4 mb-2">📸 Unusual Detection Images (${data.movements.length})</h3>`;
      html += `<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">`;

      data.movements.forEach(m => {
        if (!m.frame_image_path) {
          html += `<div class="border rounded p-2 text-xs text-gray-500">No image recorded</div>`;
          return;
        }

        // ✅ Clean the path from DB
        const cleanPath = cleanImagePath(m.frame_image_path);
        if (!cleanPath) {
          html += `<div class="border rounded p-2 text-xs text-gray-500">Invalid image path</div>`;
          return;
        }

        const imageUrl = `http://localhost:8000/uploads/${cleanPath}`;
        const timestamp = m.timestamp ? new Date(m.timestamp).toLocaleString() : 'Unknown';
        const caption = `${m.movement_type} at ${timestamp}`;

        html += `
          <div class="border rounded overflow-hidden shadow-sm">
            <img src="${imageUrl}" 
                 alt="${m.movement_type}"
                 class="w-full h-32 object-cover cursor-pointer hover:opacity-90"
                 onerror="this.src='https://via.placeholder.com/150x150?text=Image+Not+Found'; this.alt='Image Not Found'"
                 onclick="openImageModal('${imageUrl.replace(/'/g, "\\'")}', \`${caption.replace(/`/g, "'")}\`)">
            <div class="p-2 text-xs text-gray-700 truncate">${m.movement_type}</div>
            <div class="p-2 text-xs text-gray-500">${timestamp}</div>
          </div>
        `;
      });

      html += `</div>`;
    } else {
      html += `<p class="mt-4 text-gray-600 italic">No unusual activity images recorded.</p>`;
    }

    html += `
      <div class="mt-6 pt-4 border-t border-gray-200">
        <a href="http://localhost:8000/log/report/pdf/${studentId}/${examId}" 
           target="_blank"
           class="inline-flex items-center px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded hover:bg-gray-900">
          📄 Download PDF Report
        </a>
      </div>
    `;

    modalBody.innerHTML = html;
  } catch (err) {
    console.error('Error loading detailed report:', err);
    modalBody.innerHTML = `<p class="text-red-500">Failed to load report: ${err.message}</p>`;
  }
}

function closeModal() {
  document.getElementById('reportModal').style.display = 'none';
}

function openImageModal(src, caption) {
  const img = document.getElementById('modalImage');
  const cap = document.getElementById('caption');
  const modal = document.getElementById('imageModal');

  img.src = src;
  cap.textContent = caption;
  modal.classList.remove('hidden');
}

window.onclick = function(event) {
  const reportModal = document.getElementById('reportModal');
  const imageModal = document.getElementById('imageModal');
  
  if (event.target === reportModal) closeModal();
  if (event.target === imageModal) imageModal.classList.add('hidden');
};