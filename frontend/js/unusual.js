document.addEventListener("DOMContentLoaded", function () {
    const detectionsContainer = document.getElementById("detections-container");
    const modal = document.getElementById("imageModal");
    const modalImage = document.getElementById("modalImage");
    const captionText = document.getElementById("caption");

    // Fetch unusual detections
    // This is a placeholder for the actual API endpoint
    fetch("http://localhost:8000/log/reports/all")
        .then(response => response.json())
        .then(data => {
            if (data.length === 0) {
                detectionsContainer.innerHTML = "<p class='text-gray-500'>No unusual detections found.</p>";
                return;
            }

            data.forEach(detection => {
                const detectionCard = document.createElement("div");
                detectionCard.className = "bg-white rounded-lg shadow-lg p-6";

                const title = document.createElement("h3");
                title.className = "text-xl font-bold mb-2";
                title.textContent = `Student ID: ${detection.student_id}`;

                const exam = document.createElement("p");
                exam.className = "text-gray-700 mb-1";
                exam.textContent = `Exam: ${detection.exam_title}`;

                const movement = document.createElement("p");
                movement.className = "text-gray-700 mb-1";
                movement.textContent = `Movement: ${detection.movement_types}`;

                const timestamp = document.createElement("p");
                timestamp.className = "text-gray-500 text-sm mb-4";
                timestamp.textContent = `Time: ${new Date(detection.last_suspicious_activity).toLocaleString()}`;

                const viewButton = document.createElement("button");
                viewButton.className = "w-full bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded";
                viewButton.textContent = "View Details";
                viewButton.onclick = () => {
                    // For now, this just opens the modal with a placeholder. 
                    // To show specific images, you would need another API call to get movement details for this specific student and exam.
                    modal.classList.remove('hidden');
                    modalImage.src = 'https://via.placeholder.com/400'; // Placeholder image
                    captionText.innerHTML = `Details for Student ID: ${detection.student_id}`;
                };

                detectionCard.appendChild(title);
                detectionCard.appendChild(exam);
                detectionCard.appendChild(movement);
                detectionCard.appendChild(timestamp);
                detectionCard.appendChild(viewButton);

                detectionsContainer.appendChild(detectionCard);
            });
        })
        .catch(error => {
            console.error("Error fetching detections:", error);
            detectionsContainer.innerHTML = "<p class='text-red-500'>Error loading detections. Please try again later.</p>";
        });

    // Close modal functionality is in the HTML file now
});
