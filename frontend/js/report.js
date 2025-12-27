// frontend/js/report.js

// --- FIX: Inject CSS styles dynamically for Centered Modal & App Theme ---
function injectDynamicStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
        /* --- MODAL OVERLAY (Flexbox for Perfect Centering) --- */
        .modal {
            display: none; /* Hidden by default */
            position: fixed;
            z-index: 2000; /* High z-index to sit on top of everything */
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7); /* Darker backdrop */
            backdrop-filter: blur(5px); /* Modern blur effect */
            
            /* Flexbox Centering */
            align-items: center;
            justify-content: center;
        }

        /* --- MODAL CONTENT (The Window) --- */
        .modal-content {
            background-color: #ffffff;
            width: 90%;
            max-width: 800px; /* Max width for large screens */
            border-radius: 12px;
            box-shadow: 0 15px 40px rgba(0,0,0,0.5);
            overflow: hidden; /* Clips the header corners */
            animation: zoomIn 0.3s ease-out;
            display: flex;
            flex-direction: column;
            max-height: 90vh; /* Prevent it from being taller than screen */
        }

        @keyframes zoomIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        /* --- MODAL HEADER (Dark Theme) --- */
        .modal-header {
            background-color: #1a202c; /* Dark Blue/Black match app */
            color: #ffffff;
            padding: 15px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #2d3748;
        }

        .modal-header h2 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .close-btn {
            color: #a0aec0;
            font-size: 24px;
            font-weight: bold;
            cursor: pointer;
            transition: color 0.2s;
        }
        .close-btn:hover { color: #fff; }

        /* --- INSTRUCTION TEXT --- */
        .modal-instruction {
            padding: 15px 20px 5px;
            color: #4a5568;
            font-size: 1rem;
            font-weight: 500;
            border-bottom: 1px solid #e2e8f0;
            background-color: #f7fafc;
            margin: 0;
        }

        /* --- GRID CONTAINER --- */
        #imageGrid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
            gap: 15px;
            padding: 20px;
            overflow-y: auto; /* Scrollable area */
            background: #edf2f7;
            min-height: 200px;
        }

        /* --- IMAGE CARD --- */
        .img-card {
            position: relative;
            height: 100px;
            border: 3px solid #cbd5e0;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: all 0.2s ease-in-out;
            background: #fff;
        }
        .img-card:hover { transform: translateY(-3px); border-color: #a0aec0; }

        .img-card img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        /* --- SELECTED STATE (Green Border & Tick) --- */
        .img-card.selected {
            border-color: #48bb78; /* Green */
            box-shadow: 0 0 0 3px rgba(72, 187, 120, 0.3);
        }
        .img-card.selected::after {
            content: '✔';
            position: absolute;
            top: 5px; 
            right: 5px;
            background: #48bb78;
            color: white;
            border-radius: 50%;
            width: 22px; 
            height: 22px;
            text-align: center;
            font-size: 14px;
            line-height: 22px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }

        /* --- MODAL FOOTER --- */
        .modal-footer {
            padding: 15px 20px;
            background-color: #fff;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        #selectionCount {
            font-weight: 600;
            color: #2d3748;
        }

        /* --- GENERATE BUTTON --- */
        #btnGenerateWithImages {
            background-color: #5a67d8; /* Indigo/Purple match */
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1rem;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: background 0.2s;
        }
        #btnGenerateWithImages:hover { background-color: #4c51bf; }
        #btnGenerateWithImages:disabled { background-color: #a0aec0; cursor: not-allowed; }
    `;
    document.head.appendChild(style);
}

// --------------------------------------------------------------------------

// State variables for the modal
let currentStudentId = null;
let currentExamId = null;
let selectedImages = new Set(); // Stores paths of selected images

// Prevent non-admins from accessing
const role = localStorage.getItem("role");
if (!role || role !== "admin") {
    alert("Access denied. Admins only.");
    window.location.href = "login.html";
}

// Load reports on page load
window.onload = () => {
    injectDynamicStyles(); // Inject the CSS fix
    const reportsBody = document.getElementById("reportsBody");
    reportsBody.innerHTML = "<tr><td colspan='7'>Loading reports...</td></tr>";
    fetchReports();
};

async function fetchReports() {
    const token = localStorage.getItem("token");
    const reportsBody = document.getElementById("reportsBody");

    if (!token) {
        window.location.href = "login.html";
        return;
    }

    try {
        const reportsRes = await fetch("http://localhost:8000/log/reports/all", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (!reportsRes.ok) throw new Error("Failed to load reports");

        const reports = await reportsRes.json();
        reportsBody.innerHTML = "";

        if (reports.length === 0) {
            reportsBody.innerHTML = "<tr><td colspan='7'>No cheating reports found</td></tr>";
            return;
        }

        reports.forEach(report => {
            const tr = document.createElement("tr");
            const examDate = new Date(report.exam_date).toLocaleDateString();
            const cheatingScore = report.cheating_score || 0;

            let scoreColor = "#28a745";
            if (cheatingScore >= 50) scoreColor = "#ffc107";
            if (cheatingScore >= 75) scoreColor = "#dc3545";

            tr.innerHTML = `
                <td>${report.student_id}</td>
                <td>${report.student_name}</td>
                <td>${report.exam_id}</td>
                <td>${report.exam_title}</td>
                <td>${examDate}</td>
                <td>
                    <span style="color: ${scoreColor}; font-weight: bold;">
                        ${cheatingScore}%
                    </span>
                </td>
                <td>
                    <button class="btn-report-view" onclick="openImageSelector(${report.student_id}, ${report.exam_id})">
                        <i class="fa-solid fa-images"></i> Select & Generate
                    </button>
                </td>
            `;
            reportsBody.appendChild(tr);
        });

    } catch (err) {
        console.error("Fetch reports error:", err);
        reportsBody.innerHTML = `<tr><td colspan="7">❌ ${err.message}</td></tr>`;
    }
}

// --- Open Modal and Load Images ---
async function openImageSelector(studentId, examId) {
    const token = localStorage.getItem("token");
    currentStudentId = studentId;
    currentExamId = examId;
    selectedImages.clear();
    updateSelectionCount();

    const modal = document.getElementById("imageModal");
    const grid = document.getElementById("imageGrid");

    // --- 1. Center Modal using Flexbox ---
    modal.style.display = "flex"; 
    
    // --- 2. Update Text as Requested ---
    const instructionEl = document.querySelector(".modal-instruction");
    if(instructionEl) {
        instructionEl.innerText = "Select images to print on the Ai Anti cheat Exam Report";
    }

    grid.innerHTML = "<p style='padding:20px; text-align:center;'>Loading evidence images...</p>";

    try {
        const response = await fetch(
            `http://localhost:8000/log/report/detailed/${studentId}/${examId}`,
            { headers: { "Authorization": `Bearer ${token}` } }
        );

        if (!response.ok) throw new Error("Could not fetch report details");

        const report = await response.json();
        grid.innerHTML = "";

        if (!report.movements || report.movements.length === 0) {
            grid.innerHTML = "<p style='padding:20px;'>No suspicious frames captured for this exam.</p>";
            return;
        }

        report.movements.forEach(move => {
            if (move.frame_image_path) {
                const imgCard = document.createElement("div");
                imgCard.className = "img-card";

                const imageUrl =
                    `http://localhost:8000/uploads/${move.frame_image_path.replace(/\\/g, "/")}`;

                imgCard.onclick = () => toggleImageSelection(imgCard, imageUrl);

                const img = document.createElement("img");
                img.src = imageUrl;
                img.alt = move.movement_type;
                img.title = `${move.movement_type} - ${new Date(move.timestamp).toLocaleTimeString()}`;
                img.loading = "lazy";

                imgCard.appendChild(img);
                grid.appendChild(imgCard);
            }
        });

        if (grid.children.length === 0) {
            grid.innerHTML = "<p style='padding:20px;'>No images found in the logs.</p>";
        }

    } catch (err) {
        console.error(err);
        grid.innerHTML = `<p style="color:red; padding:20px;">Error loading images: ${err.message}</p>`;
    }
}

// --- Toggle Selection ---
function toggleImageSelection(cardElement, imagePath) {
    if (selectedImages.has(imagePath)) {
        selectedImages.delete(imagePath);
        cardElement.classList.remove("selected");
    } else {
        selectedImages.add(imagePath);
        cardElement.classList.add("selected");
    }
    updateSelectionCount();
}

function updateSelectionCount() {
    document.getElementById("selectionCount").innerText =
        `${selectedImages.size} images selected`;
}

// --- Generate PDF ---
async function generateCustomPDF() {
    const token = localStorage.getItem("token");
    const btn = document.getElementById("btnGenerateWithImages");

    // --- CRITICAL FIX: Convert full URLs back to relative paths ---
    const imageList = Array.from(selectedImages).map(url => {
        return url.replace("http://localhost:8000/uploads/", "");
    });

    console.log("Generating report with images:", imageList);

    if (imageList.length === 0) {
        alert("Please select at least one image.");
        return;
    }

    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
    btn.disabled = true;

    try {
        const response = await fetch("http://localhost:8000/log/report/pdf/custom", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                student_id: currentStudentId,
                exam_id: currentExamId,
                selected_images: imageList 
            })
        });

        if (!response.ok) throw new Error("Failed to generate PDF");

        const pdfBlob = await response.blob();
        const pdfUrl = URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, "_blank");

        closeImageModal();

    } catch (err) {
        console.error("PDF Error:", err);
        alert(`❌ ${err.message}`);
    } finally {
        btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Generate Report';
        btn.disabled = false;
    }
}

function closeImageModal() {
    document.getElementById("imageModal").style.display = "none";
}

// Close modal if clicked outside
window.onclick = function(event) {
    const modal = document.getElementById("imageModal");
    if (event.target === modal) {
        closeImageModal();
    }
};