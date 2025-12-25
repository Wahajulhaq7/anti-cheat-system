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
                card.className = "bg-white rounded-lg shadow-md p-5";

                const title = document.createElement("h3");
                title.className = "text-lg font-bold mb-2";
                title.textContent = `Student: ${detection.username} (ID: ${detection.user_id})`;

                const exam = document.createElement("p");
                exam.className = "text-gray-700";
                exam.textContent = `Exam ID: ${detection.exam_id}`;

                const movement = document.createElement("p");
                movement.className = "text-gray-700";
                movement.textContent = `Detection: ${detection.movement_type}`;

                const time = document.createElement("p");
                time.className = "text-sm text-gray-500 mb-3";
                time.textContent = new Date(detection.timestamp).toLocaleString();

                // FIX IMAGE PATH
                let imagePath = detection.frame_image_path || "";

                // Normalize path
                if (imagePath.startsWith("/")) {
                    imagePath = imagePath.substring(1);
                }
                if (!imagePath.startsWith("uploads/")) {
                    imagePath = `uploads/${imagePath}`;
                }

                const img = document.createElement("img");
                // Removed 'cursor-pointer' since it is no longer clickable
                img.className = "w-full h-48 object-cover rounded border"; 
                img.src = `http://localhost:8000/${imagePath}?v=${Date.now()}`;
                img.alt = "Detected Frame";

                img.onerror = () => {
                    img.src = "https://via.placeholder.com/400?text=Image+Not+Found";
                };

                // Removed img.onclick logic

                card.appendChild(title);
                card.appendChild(exam);
                card.appendChild(movement);
                card.appendChild(time);
                card.appendChild(img);

                detectionsContainer.appendChild(card);
            });
        })
        .catch(error => {
            console.error(error);
            detectionsContainer.innerHTML =
                "<p class='text-red-500'>Error loading detections.</p>";
        });
});