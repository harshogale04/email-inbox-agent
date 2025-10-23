document.addEventListener("DOMContentLoaded", () => {
  const appUrl = "http://localhost:3000"; // change this after hosting
  const iframe = document.createElement("iframe");
  iframe.src = appUrl;
  iframe.allow = "clipboard-read; clipboard-write;";
  iframe.loading = "lazy";

  const contentDiv = document.getElementById("content");
  contentDiv.innerHTML = "";
  contentDiv.appendChild(iframe);
});
