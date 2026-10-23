import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/space-grotesk/700.css";
import { OfficeStudio } from "./OfficeStudio";
import "../packages/database/src/database.css";
import "./stijl/openaec-office.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <OfficeStudio />
  </React.StrictMode>,
);
