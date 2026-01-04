document.addEventListener("DOMContentLoaded", function () {
    const detectionsContainer = document.getElementById("detections-container");
    const token = localStorage.getItem("token");

    if (!token) {
        detectionsContainer.innerHTML =
            "<p class='text-red-500'>Unauthorized. Please login again.</p>";
        return;
    }

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
            detectionsContainer.innerHTML = "";

            if (!data || data.length === 0) {
                detectionsContainer.innerHTML =
                    "<p class='text-gray-500'>No unusual detections found.</p>";
                return;
            }

            data.forEach(detection => {
                const card = document.createElement("div");
                // Using existing CSS class 'detection-card' from invigilator.css if available, 
                // or falling back to the classes previously used.
                // Assuming 'detection-card' is the standard class now based on CSS.
                card.className = "detection-card"; 

                // If CSS 'detection-card' handles styles, we rely on that.
                // Otherwise we keep inline styles or utility classes if that was the setup.
                // Reverting to the logic shown in your snippet for structure:

                const title = document.createElement("h3");
                // title.className = "text-lg font-bold mb-2"; // Keeping utility classes if framework used
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
                
                // On Click: Open Modal (Requires openModal function in HTML)
                btnView.onclick = function() {
                    // Check if openModal exists in global scope
                    if (typeof openModal === 'function') {
                        openModal(imageUrl); 
                    } else if (typeof openImageModal === 'function') {
                         openImageModal(imageUrl);
                    } else {
                        console.error("Modal function not found");
                    }
                };

                // Assemble Card
                card.appendChild(img); // Image on top typically looks better in card
                card.appendChild(title);
                infoDiv.appendChild(exam);
                infoDiv.appendChild(movement);
                infoDiv.appendChild(time);
                card.appendChild(infoDiv);
                card.appendChild(btnView);

                detectionsContainer.appendChild(card);
            });
        })
        .catch(error => {
            console.error(error);
            detectionsContainer.innerHTML =
                "<p style='color: #ef4444; text-align: center;'>Error loading detections.</p>";
        });
});