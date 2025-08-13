# Interactive AST Tree Viewer (Tree-sitter + D3.js)

## 📌 Overview
This project visualizes **Abstract Syntax Trees (AST)** generated from code using **Tree-sitter**, displayed interactively in a browser with **D3.js**.  
It supports:
- Parsing code into an AST JSON file
- Viewing the AST as an **interactive tree diagram**
- **Panning & Zooming** to navigate large trees
- Clicking a node to **open the exact location in VS Code**

---

## 🚀 Features
- **Circle Nodes** with clear text labels
- **Interactive Navigation** (scroll, drag, zoom)
- **Readable Layout** with proper spacing & margins
- **VS Code Integration** — click a node to open the related file at a specific line

---

## ✅ Prerequisites
- **Node.js** (for running scripts and Tree-sitter parsing)
- **Python 3** (for a quick local HTTP server)
- **VS Code** (optional, for the click-to-open feature)
- **VSCode Extension** (Live Server)

---

## 🚀 How to run
- **Generate AST JSON**:
  ```bash
  node analyze_code.js <project-folder-path>

- **View the AST Tree-sitter**:
  1. Open the viewer.html
  2. Right click and open with live server

---