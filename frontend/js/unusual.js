// frontend/js/unusual.js

let allDetections = [];

document.addEventListener("DOMContentLoaded", function () {
    const token = localStorage.getItem("token");

    // Initialize Event Listeners for Filtering
    document.getElementById("searchInput").addEventListener("input", filterDetections);
    document.getElementById("dateInput").addEventListener("change", filterDetections);

    if (!token) {
        document.getElementById("detections-container").innerHTML =
            "<p style='color: #ef4444; text-align:center;'>Unauthorized. Please login again.</p>";
        return;
    }

    loadDetections(token);
});

function loadDetections(token) {
    fetch("http://localhost:8000/monitor/unusual-movements", {
        method: "GET",
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("Failed to fetch unusual movements");
        }
        return response.json();
    })
    .then(data => {
        allDetections = data;
        renderDetections(allDetections);
    })
    .catch(error => {
        console.error(error);
        document.getElementById("detections-container").innerHTML =
            "<p style='color: #ef4444; text-align: center;'>Error loading detections.</p>";
    });
}

function renderDetections(data) {
    const container = document.getElementById("detections-container");
    container.innerHTML = "";

    if (!data || data.length === 0) {
        container.innerHTML =
            "<p style='color: #a0aec0; text-align: center; width: 100%;'>No detections match your criteria.</p>";
        return;
    }

    data.forEach(detection => {
        const card = document.createElement("div");
        card.className = "detection-card"; // Ensures consistency if you have CSS class
        
        // Inline styles for card structure if standard CSS isn't present
        card.style.backgroundColor = "#2d3748";
        card.style.borderRadius = "8px";
        card.style.overflow = "hidden";
        card.style.boxShadow = "0 4px 6px rgba(0,0,0,0.3)";
        card.style.display = "flex";
        card.style.flexDirection = "column";

        const title = document.createElement("h3");
        title.style.padding = "10px 15px 0";
        title.style.color = "#fff";
        title.style.fontSize = "16px";
        title.textContent = `Student: ${detection.username} (ID: ${detection.user_id})`;

        const infoDiv = document.createElement("div");
        infoDiv.style.padding = "0 15px 10px";

        const exam = document.createElement("p");
        exam.style.color = "#a0aec0";
        exam.style.fontSize = "13px";
        exam.style.margin = "5px 0";
        exam.textContent = `Exam ID: ${detection.exam_id}`;

        const movement = document.createElement("p");
        movement.style.color = "#a0aec0";
        movement.style.fontSize = "13px";
        movement.style.margin = "5px 0";
        movement.textContent = `Detection: ${detection.movement_type}`;

        const time = document.createElement("p");
        time.style.fontSize = "12px";
        time.style.color = "#ef4444";
        time.style.fontWeight = "600";
        time.style.marginTop = "10px";
        time.textContent = new Date(detection.timestamp).toLocaleString();

        // FIX IMAGE PATH
        let imagePath = detection.frame_image_path || "";
        if (imagePath.startsWith("/")) {
            imagePath = imagePath.substring(1);
        }
        if (!imagePath.startsWith("uploads/")) {
            imagePath = `uploads/${imagePath}`;
        }
        
        const imageUrl = `http://localhost:8000/${imagePath}?v=${Date.now()}`;

        const img = document.createElement("img");
        img.style.width = "100%";
        img.style.height = "180px";
        img.style.objectFit = "cover";
        img.style.borderBottom = "1px solid #4a5568";
        img.src = imageUrl;
        img.alt = "Detected Frame";

        img.onerror = () => {
            img.src = "https://via.placeholder.com/400?text=Image+Not+Found";
        };

        // --- VIEW BUTTON ---
        const btnView = document.createElement("button");
        btnView.innerHTML = '<i class="fa-solid fa-eye"></i> View Image';
        btnView.style.margin = "10px 15px";
        btnView.style.padding = "8px 12px";
        btnView.style.backgroundColor = "#3b82f6";
        btnView.style.color = "white";
        btnView.style.border = "none";
        btnView.style.borderRadius = "4px";
        btnView.style.cursor = "pointer";
        btnView.style.fontSize = "13px";
        
        btnView.onclick = function() {
             if (typeof openImageModal === 'function') {
                 openImageModal(imageUrl);
             } else {
                 console.error("Modal function not found");
             }
        };

        // Assemble Card
        card.appendChild(img);
        card.appendChild(title);
        infoDiv.appendChild(exam);
        infoDiv.appendChild(movement);
        infoDiv.appendChild(time);
        card.appendChild(infoDiv);
        card.appendChild(btnView);

        container.appendChild(card);
    });
}

function filterDetections() {
    const searchTerm = document.getElementById("searchInput").value.toLowerCase().trim();
    const dateValue = document.getElementById("dateInput").value; // YYYY-MM-DD

    const filtered = allDetections.filter(item => {
        // 1. Text Search (Student Name, User ID, Exam ID)
        const sName = (item.username || "").toLowerCase();
        const sId = String(item.user_id || "");
        const eId = String(item.exam_id || "");
        
        const matchesText = sName.includes(searchTerm) || 
                            sId.includes(searchTerm) || 
                            eId.includes(searchTerm);

        // 2. Date Search
        let matchesDate = true;
        if (dateValue) {
            // item.timestamp is usually ISO string (e.g., "2023-10-25T14:30:00")
            const itemDate = new Date(item.timestamp).toISOString().split('T')[0];
            matchesDate = itemDate === dateValue;
        }

        return matchesText && matchesDate;
    });

    renderDetections(filtered);
}

function resetFilters() {
    document.getElementById("searchInput").value = "";
    document.getElementById("dateInput").value = "";
    renderDetections(allDetections);
}