import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import { bridge } from "./bridge";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Panel root is missing");

createRoot(root).render(
  <StrictMode>
    <App bridge={bridge} />
  </StrictMode>,
);
