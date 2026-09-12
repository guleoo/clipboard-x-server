import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import "./frame/styles/index.css"
import "./frame/styles/tokens.css"
import "./frame/styles/surfaces.css"

const root = document.getElementById("root")
if (!root) throw new Error("Application root element is missing")
createRoot(root).render(<StrictMode><App /></StrictMode>)
