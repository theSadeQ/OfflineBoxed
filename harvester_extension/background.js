/* ==========================================================================
   OFFLINEBOXD CHROME EXTENSION BACKGROUND SERVICE WORKER
   ========================================================================== */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "save_harvest") {
    console.log("[Background] Received save_harvest event. Forwarding payload to localhost:8080...");

    fetch('http://localhost:8080/api/save_harvest', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(message.data)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP Error Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log("[Background] Save successful:", data);
      sendResponse({ success: true, data });
    })
    .catch(err => {
      console.error("[Background] Save failed:", err);
      sendResponse({ success: false, error: err.toString() });
    });

    return true; // Keeps the messaging channel open for asynchronous responses!
  }
});
