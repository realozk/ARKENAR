import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dragstart', (e) => {
  if (!(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLTextAreaElement)) {
    e.preventDefault();
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
